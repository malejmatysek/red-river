// Red River – Edge Function `table`: autoritativní server online soukromých stolů.
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
const CODE_RE = /^RED-\d{4}$/;

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
  await admin.from('rooms').update({ status: room.status, host: room.host, public_state: core.view(room, null), version: room.ver, updated_at: new Date().toISOString() }).eq('id', roomId);
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
    try {
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
        case 'tick': case 'state': changed = core.tick(room); break;   // časovač posouvá kdokoli ze stolu
        default: throw new HttpErr('bad_op');
      }
      if (op !== 'join' && op !== 'state' && core.seatOf(room, uid) < 0 && op !== 'leave') throw new HttpErr('not_seated', 403);
      if (op === 'state' && core.seatOf(room, uid) < 0) throw new HttpErr('not_seated', 403);
      if (changed) {
        core.runBots(room);
        const { data: upd } = await admin.from('room_state').update({ state: room, version: st.version + 1 }).eq('room_id', r.id).eq('version', st.version).select('room_id');
        if (!upd?.length) { if (debited) await credit(uid, debited, 'refund', r.id); continue; }   // souběh → znovu
        if (refund) await credit(uid, refund, 'cashback', r.id);
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

// ---------- úklid opuštěných stolů (volá cron s tajným klíčem) ----------
async function sweep() {
  const old = new Date(Date.now() - 6 * 3600e3).toISOString();
  const { data: rooms } = await admin.from('rooms').select('id').neq('status', 'closed').lt('updated_at', old).limit(50);
  let n = 0;
  for (const r of rooms ?? []) {
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
    if (op === 'points') return json({ points: await points(user.id) });
    if (op === 'create') return json(await create(user.id, body));
    return json(await mutate(user.id, op, body));
  } catch (e) {
    const code = e instanceof HttpErr ? e.code : 'server';
    if (!(e instanceof HttpErr)) console.error(e);
    return json({ code, error: code }, e instanceof HttpErr ? e.status : 500);
  }
});
