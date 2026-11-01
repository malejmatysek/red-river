// Red River – Edge Function `table`: autoritativní server online stolů (soukromé s kódem RED-1234 + veřejné PUB-XXXXXX).
// Klient posílá jen záměr ({ op, code, action }); server ověří uživatele (JWT), načte úplný stav
// z room_state (balíček + všechny karty), provede akci přes sdílené jádro (_shared/core.js – stejný kód
// jako mock v testech), uloží s optimistickým zámkem (version) a zveřejní jen bezpečné projekce:
//   rooms.public_state (bez cizích karet), seats, hole_cards (každý řádek vidí jen vlastník), hands (rozbor).
// Body jsou jen virtuální (profiles.points), buy-in se odečte, při odchodu se žetony vrátí. Žádný výběr peněz.
import { createClient } from 'npm:@supabase/supabase-js@2';
import '../_shared/engine.js';
import '../_shared/core.js';

// deno-lint-ignore no-explicit-any
const G = globalThis as any;
const core = G.RRCore.makeCore({ PE: G.PE });      // míchání: crypto.getRandomValues (Web Crypto v Deno)

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// serverový klíč: nové klíče (SUPABASE_SECRET_KEYS = JSON {default: 'sb_secret_…'}), jinak legacy service_role.
// Supabase ho do Edge Function vkládá sám – nikam se nevyplňuje a nikdy není v klientovi.
function secretKey(): string {
  try { const k = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}'); if (k.default) return k.default; const f = Object.values(k)[0]; if (f) return String(f); } catch (_) { /* legacy */ }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); if (legacy) return legacy;
  throw new Error('Chybí serverový klíč (SUPABASE_SECRET_KEYS / SUPABASE_SERVICE_ROLE_KEY)');
}
const SERVICE_KEY = secretKey();
const SWEEP_SECRET = Deno.env.get('RR_SWEEP_SECRET') ?? '';
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const ALLOWED_ORIGINS = (Deno.env.get('RR_ALLOWED_ORIGINS') ?? 'https://malejmatysek.github.io,http://localhost:8080').split(',');
function cors(req: Request) {
  const o = req.headers.get('origin') ?? '';
  return { 'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
}
class HttpErr extends Error { constructor(public code: string, public status = 400) { super(code); } }
const CODE_RE = /^(RED-\d{4}|PUB-[A-Z0-9]{6})$/;

// ---------- limity požadavků (tabulka rate_limits + funkce rr_hit z migrace public_tables) ----------
const LIMITS: Record<string, [number, number]> = { all: [240, 60], quickseat: [12, 60], report: [5, 600] };
async function limit(uid: string, bucket: string) {
  const [max, win] = LIMITS[bucket];
  const { data, error } = await admin.rpc('rr_hit', { uid, bucket, max_hits: max, window_secs: win });
  if (error) { console.warn('rr_hit', error.message); return; }   // migrace ještě nespuštěná → nepřekážet soukromým stolům
  if (data === false) throw new HttpErr('rate', 429);
}

// ---------- body (virtuální) ----------
async function points(uid: string): Promise<number> {
  const { data } = await admin.from('profiles').select('points').eq('id', uid).maybeSingle();
  if (data) return Number(data.points);
  await admin.from('profiles').insert({ id: uid });            // profil chybí (uživatel starší než trigger)
  return 1000;
}
async function debit(uid: string, n: number, why: string, room?: string) {
  if (n <= 0) return;
  const { error } = await admin.rpc('debit_points', { uid, amount: n, why, room: room ?? null });
  if (error) throw new HttpErr(error.message?.includes('points') ? 'points' : 'server');
}
async function credit(uid: string, n: number, why: string, room?: string) {
  if (n <= 0) return;
  const { error } = await admin.rpc('credit_points', { uid, amount: n, why, room: room ?? null });
  if (error) throw new HttpErr('server', 500);
}

// ---------- zveřejnění bezpečných projekcí ----------
// deno-lint-ignore no-explicit-any
async function publish(roomId: string, room: any) {
  const base = { status: room.status, host: room.host, public_state: core.view(room, null), version: room.ver, updated_at: new Date().toISOString() };
  const { error } = await admin.from('rooms').update({ ...base, is_public: core.isPub(room), tier: room.settings.tier ?? null, seated: core.humans(room).length }).eq('id', roomId);
  if (error) await admin.from('rooms').update(base).eq('id', roomId);   // sloupce is_public/tier/seated chybí (stará databáze)
  await admin.from('seats').delete().eq('room_id', roomId);
  // deno-lint-ignore no-explicit-any
  const seats = room.seats.map((s: any, i: number) => s && { room_id: roomId, seat_no: i, user_id: s.bot ? null : s.uid, is_bot: !!s.bot, name: s.name, stack: s.stack, sit_out: !!s.sitOut }).filter(Boolean);
  if (seats.length) await admin.from('seats').insert(seats);
  // deno-lint-ignore no-explicit-any
  const holes = core.privateCards(room).map((p: any) => ({ room_id: roomId, hand_no: p.hand, user_id: p.uid, cards: p.cards }));
  if (holes.length) await admin.from('hole_cards').upsert(holes, { onConflict: 'room_id,hand_no,user_id', ignoreDuplicates: true });
  if (room.handNo > 30) await admin.from('hole_cards').delete().eq('room_id', roomId).lt('hand_no', room.handNo - 30);
  if (room.last) await admin.from('hands').upsert({ room_id: roomId, hand_no: room.last.no, review: room.last }, { onConflict: 'room_id,hand_no', ignoreDuplicates: true });
}

// ---------- založení stolu ----------
// deno-lint-ignore no-explicit-any
async function create(uid: string, body: any) {
  const st = core.checkSettings(body.settings);
  await debit(uid, st.buyIn, 'buyin');
  try {
    for (let k = 0; k < 20; k++) {
      const room = core.createRoom({ uid, name: body.name, settings: body.settings, code: core.newCode() });
      const { data: r, error } = await admin.from('rooms').insert({ code: room.code, host: uid, status: room.status, settings: room.settings, public_state: core.view(room, null), version: room.ver }).select('id').single();
      if (error) { if (error.code === '23505') continue; throw new HttpErr('server', 500); }   // kód už existuje → jiný
      await admin.from('room_state').insert({ room_id: r.id, state: room, version: 0 });
      await publish(r.id, room);
      return { view: core.view(room, uid), roomId: r.id, points: await points(uid) };
    }
    throw new HttpErr('no_code', 500);
  } catch (e) { await credit(uid, st.buyIn, 'refund'); throw e; }
}

// ---------- všechny ostatní operace nad existujícím stolem ----------
// deno-lint-ignore no-explicit-any
async function mutate(uid: string, op: string, body: any) {
  let code = String(body.code ?? '').toUpperCase().trim();
  if (!CODE_RE.test(code)) {                                   // bez kódu: poslední stůl, kde hráč sedí
    const { data } = await admin.from('seats').select('room_id, rooms!inner(code, status)').eq('user_id', uid).neq('rooms.status', 'closed').limit(1);
    // deno-lint-ignore no-explicit-any
    code = (data?.[0] as any)?.rooms?.code ?? '';
    if (!code) throw new HttpErr('no_room', 404);
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: r } = await admin.from('rooms').select('id').eq('code', code).maybeSingle();
    if (!r) throw new HttpErr('no_room', 404);
    const { data: st } = await admin.from('room_state').select('state, version').eq('room_id', r.id).single();
    if (!st) throw new HttpErr('no_room', 404);
    const room = st.state;
    let debited = 0, debitWhy = '', refund = 0, changed = true;
    // deno-lint-ignore no-explicit-any
    let reaped: any[] = [];
    try {
      if (core.isPub(room)) { reaped = core.reap(room); if (reaped.length && op === 'state') changed = true; }
      switch (op) {
        case 'join':
          if (core.seatOf(room, uid) < 0) {
            if (room.status === 'closed') throw new HttpErr('closed');
            if (!room.seats.some((s: unknown) => !s) && !room.seats.some((s: { bot: boolean } | null) => s?.bot)) throw new HttpErr('full');
            debitWhy = 'buyin'; debited = room.settings.buyIn; await debit(uid, debited, debitWhy, r.id);
            core.join(room, uid, body.name);
          } else changed = false;
          break;
        case 'leave': refund = core.leave(room, uid).refund; break;
        case 'start': core.start(room, uid); break;
        case 'addBot': core.addBot(room, uid); break;
        case 'removeBot': core.removeBot(room, uid, Number(body.seat)); break;
        case 'act': core.act(room, uid, body.action ?? {}); break;
        case 'next': core.next(room, uid); break;
        case 'sitIn': core.sitIn(room, uid); break;
        case 'rebuy': {
          const i = core.seatOf(room, uid); const need = i >= 0 ? room.settings.buyIn - room.seats[i].stack : 0;
          debitWhy = 'rebuy'; debited = need; await debit(uid, need, 'rebuy', r.id); core.rebuy(room, uid); break;
        }
        case 'tick': case 'state': changed = core.tick(room) || reaped.length > 0; break;   // časovač posouvá kdokoli ze stolu
        default: throw new HttpErr('bad_op');
      }
      if (op !== 'join' && op !== 'state' && core.seatOf(room, uid) < 0 && op !== 'leave') throw new HttpErr('not_seated', 403);
      if (op === 'state' && core.seatOf(room, uid) < 0) throw new HttpErr('not_seated', 403);
      if (changed) {
        core.runBots(room);
        const { data: upd } = await admin.from('room_state').update({ state: room, version: st.version + 1 }).eq('room_id', r.id).eq('version', st.version).select('room_id');
        if (!upd?.length) { if (debited) await credit(uid, debited, 'refund', r.id); continue; }   // souběh → znovu
        if (refund) await credit(uid, refund, 'cashback', r.id);
        for (const x of reaped) await credit(x.uid, x.refund, 'cashback', r.id);   // zvednutí od veřejného stolu (odpojení / nečinnost)
        await publish(r.id, room);
      }
      return { view: core.view(room, uid), roomId: r.id, points: await points(uid) };
    } catch (e) {
      if (debited) await credit(uid, debited, 'refund', r.id);
      // deno-lint-ignore no-explicit-any
      const c = (e as any).code; if (c && !(e instanceof HttpErr)) throw new HttpErr(c);   // chyby jádra (not_your_turn…)
      throw e;
    }
  }
  throw new HttpErr('busy', 409);
}

// ---------- veřejné stoly ----------
// rychlé usazení: hráč už sedí u veřejného stolu → vrátí ho tam; jinak najde otevřený stůl dané úrovně
// (nejplnější, nedávno aktivní, < 6 lidí) nebo založí nový. Buy-in se odečte na serveru (debit_points).
// deno-lint-ignore no-explicit-any
async function quickseat(uid: string, body: any) {
  await limit(uid, 'quickseat');
  // deno-lint-ignore no-explicit-any
  const T = core.TIERS.find((x: any) => x.id === String(body.tier ?? ''));
  if (!T) throw new HttpErr('bad_tier');
  if (core.badName(body.name)) throw new HttpErr('bad_name');
  const { data: mine } = await admin.from('seats').select('room_id, rooms!inner(code, status, is_public)').eq('user_id', uid).eq('rooms.is_public', true).neq('rooms.status', 'closed').limit(1);
  // deno-lint-ignore no-explicit-any
  const have = (mine?.[0] as any)?.rooms?.code;
  if (have) return await mutate(uid, 'state', { code: have });
  if (await points(uid) < T.bb * T.buyInBB) throw new HttpErr('points');
  const fresh = new Date(Date.now() - 10 * 60e3).toISOString();
  const { data: open } = await admin.from('rooms').select('code, seated').eq('is_public', true).eq('tier', T.id).eq('status', 'playing')
    .lt('seated', core.PUB_MAX).gt('updated_at', fresh).order('seated', { ascending: false }).order('updated_at', { ascending: false }).limit(5);
  for (const r of open ?? []) {
    try { return await mutate(uid, 'join', { code: r.code, name: body.name }); }
    catch (e) { if (e instanceof HttpErr && ['full', 'closed', 'no_room', 'busy'].includes(e.code)) continue; throw e; }
  }
  for (let k = 0; k < 10; k++) {                                  // žádný volný → nový stůl
    const room = core.createPublic({ tier: T.id });
    const { data: r, error } = await admin.from('rooms').insert({ code: room.code, host: null, status: room.status, settings: room.settings,
      public_state: core.view(room, null), version: room.ver, is_public: true, tier: T.id, seated: 0 }).select('id').single();
    if (error) { if (error.code === '23505') continue; console.error(error); throw new HttpErr('server', 500); }
    await admin.from('room_state').insert({ room_id: r.id, state: room, version: 0 });
    return await mutate(uid, 'join', { code: room.code, name: body.name });
  }
  throw new HttpErr('no_code', 500);
}
async function lobby() {
  const fresh = new Date(Date.now() - 10 * 60e3).toISOString();
  const { data } = await admin.from('rooms').select('tier, seated').eq('is_public', true).eq('status', 'playing').gt('updated_at', fresh).limit(1000);
  // deno-lint-ignore no-explicit-any
  return { tiers: core.TIERS.map((T: any) => { const rs = (data ?? []).filter((r: any) => r.tier === T.id && r.seated > 0);
    return { id: T.id, sb: T.sb, bb: T.bb, buyIn: T.bb * T.buyInBB, tables: rs.length, players: rs.reduce((s: number, r: { seated: number }) => s + r.seated, 0) }; }) };
}
const REASONS = ['abuse', 'name', 'cheat', 'spam', 'other'];
// deno-lint-ignore no-explicit-any
async function report(uid: string, body: any) {
  await limit(uid, 'report');
  const code = String(body.code ?? '').toUpperCase().trim();
  if (!CODE_RE.test(code)) throw new HttpErr('no_room', 404);
  const { data: r } = await admin.from('rooms').select('id').eq('code', code).maybeSingle();
  if (!r) throw new HttpErr('no_room', 404);
  const { data: st } = await admin.from('room_state').select('state').eq('room_id', r.id).single();
  if (!st) throw new HttpErr('no_room', 404);
  // deno-lint-ignore no-explicit-any
  let tg: any; try { tg = core.reportTarget(st.state, uid, Number(body.seat)); } catch (e) { throw new HttpErr((e as any).code ?? 'bad_seat'); }
  const reason = REASONS.includes(body.reason) ? body.reason : 'other';
  const { error } = await admin.from('reports').insert({ reporter: uid, reported: tg.uid, reported_name: tg.name, room_id: r.id, room_code: code, hand_no: tg.hand, reason });
  if (error) { console.error(error); throw new HttpErr('server', 500); }
  return { ok: true };
}

// ---------- úklid opuštěných stolů (volá cron s tajným klíčem) ----------
// soukromé stoly bez změny 6 h, veřejné bez změny 20 min → zavřít a žetony vrátit do bodů
async function sweep() {
  const old = new Date(Date.now() - 6 * 3600e3).toISOString(), oldPub = new Date(Date.now() - 20 * 60e3).toISOString();
  const { data: a } = await admin.from('rooms').select('id').neq('status', 'closed').lt('updated_at', old).limit(50);
  const { data: b } = await admin.from('rooms').select('id').eq('is_public', true).neq('status', 'closed').lt('updated_at', oldPub).limit(50);
  const rooms = [...new Map([...(a ?? []), ...(b ?? [])].map((r) => [r.id, r])).values()];
  let n = 0;
  for (const r of rooms) {
    const { data: st } = await admin.from('room_state').select('state, version').eq('room_id', r.id).single();
    if (!st) continue;
    const room = st.state;
    // deno-lint-ignore no-explicit-any
    const people = room.seats.filter((s: any) => s && !s.bot).map((s: any) => s.uid);
    for (const u of people) { const { refund } = core.leave(room, u); await credit(u, refund, 'cashback', r.id); }
    room.status = 'closed';
    await admin.from('room_state').update({ state: room, version: st.version + 1 }).eq('room_id', r.id);
    await publish(r.id, room); n++;
  }
  return { closed: n };
}

Deno.serve(async (req) => {
  const h = cors(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...h, 'Content-Type': 'application/json' } });
  try {
    // deno-lint-ignore no-explicit-any
    const body: any = await req.json().catch(() => ({}));
    const op = String(body.op ?? '');
    if (op === 'sweep') { if (!SWEEP_SECRET || req.headers.get('x-sweep-secret') !== SWEEP_SECRET) throw new HttpErr('forbidden', 403); return json(await sweep()); }
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) throw new HttpErr('auth', 401);
    await limit(user.id, 'all');
    if (op === 'points') return json({ points: await points(user.id) });
    if (op === 'lobby') return json(await lobby());
    if (op === 'quickseat') return json(await quickseat(user.id, body));
    if (op === 'report') return json(await report(user.id, body));
    if (op === 'create') return json(await create(user.id, body));
    return json(await mutate(user.id, op, body));
  } catch (e) {
    const code = e instanceof HttpErr ? e.code : 'server';
    if (!(e instanceof HttpErr)) console.error(e);
    return json({ code, error: code }, e instanceof HttpErr ? e.status : 500);
  }
});
