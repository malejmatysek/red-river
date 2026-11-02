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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
}
class HttpErr extends Error { constructor(public code: string, public status = 400) { super(code); } }
const CODE_RE = /^(RED-\d{4}|PUB-[A-Z0-9]{6})$/;
const HEARTBEAT_MS = 60e3, FRESH_MS = 3 * 60e3;               // veřejný stůl je „živý“, pokud se ho někdo dotkl za poslední 3 min

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
  const base = { status: room.status, host: room.host, public_state: core.view(room, null), version: room.ver, updated_at: new Date(Date.now()).toISOString() };
  // deno-lint-ignore no-explicit-any
  const seats = room.seats.map((s: any, i: number) => s && { room_id: roomId, seat_no: i, user_id: s.bot ? null : s.uid, is_bot: !!s.bot, name: s.name, stack: s.stack, sit_out: !!s.sitOut }).filter(Boolean);
  // deno-lint-ignore no-explicit-any
  const holes = core.privateCards(room).map((p: any) => ({ room_id: roomId, hand_no: p.hand, user_id: p.uid, cards: p.cards }));
  // zápisy běží souběžně (dřív 6 dotazů za sebou); rooms se nepřepíše starší verzí (.lte version)
  await Promise.all([
    (async () => {
      const { error } = await admin.from('rooms').update({ ...base, is_public: core.isPub(room), tier: room.settings.tier ?? null, seated: core.humans(room).length }).eq('id', roomId).lte('version', room.ver);
      if (error) await admin.from('rooms').update(base).eq('id', roomId).lte('version', room.ver);   // sloupce is_public/tier/seated chybí (stará databáze)
    })(),
    (async () => { await admin.from('seats').delete().eq('room_id', roomId); if (seats.length) await admin.from('seats').insert(seats); })(),
    holes.length ? admin.from('hole_cards').upsert(holes, { onConflict: 'room_id,hand_no,user_id', ignoreDuplicates: true }) : null,
    room.handNo > 30 ? admin.from('hole_cards').delete().eq('room_id', roomId).lt('hand_no', room.handNo - 30) : null,
    room.last ? admin.from('hands').upsert({ room_id: roomId, hand_no: room.last.no, review: room.last }, { onConflict: 'room_id,hand_no', ignoreDuplicates: true }) : null,
  ]);
}

// ---------- práce na pozadí (po odeslání odpovědi) ----------
// EdgeRuntime.waitUntil nechá funkci doběhnout i po vrácení odpovědi. Zápisy projekcí (rooms/seats/hole_cards/hands)
// jednoho stolu jdou v rámci instance za sebou (fronta), aby se starší zápis nepředběhl novějším.
// Bez EdgeRuntime (testy, starší runtime) se čeká normálně.
// deno-lint-ignore no-explicit-any
const ER = (globalThis as any).EdgeRuntime;
const pubQueue = new Map<string, Promise<unknown>>();
// deno-lint-ignore no-explicit-any
function publishQueued(roomId: string, room: any): Promise<unknown> {
  const prev = pubQueue.get(roomId) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(() => publish(roomId, room)).catch((e) => console.warn('publish', e));
  pubQueue.set(roomId, next);
  next.finally(() => { if (pubQueue.get(roomId) === next) pubQueue.delete(roomId); });
  return next;
}
function background(p: Promise<unknown>): Promise<unknown> {
  if (ER?.waitUntil) { try { ER.waitUntil(p); return Promise.resolve(); } catch (_) { /* fallback: čekat */ } }
  return p;
}

// ---------- okamžité doručení hráčům (Realtime Broadcast, soukromý kanál rr-u-<uid>) ----------
// Každý člověk u stolu dostane SVŮJ pohled (jen své karty) hned po uložení – bez čekání na postgres_changes
// a bez dalšího dotazu 'state'. Kanál je privátní: číst smí jen vlastník (politika na realtime.messages),
// posílat jen server (klienti nemají insert politiku) → podvržení stavu není možné.
// deno-lint-ignore no-explicit-any
async function push(roomId: string, room: any) {
  // deno-lint-ignore no-explicit-any
  const messages = core.humans(room).filter((s: any) => s.uid).map((s: any) => ({ topic: 'rr-u-' + s.uid, event: 'view', private: true, payload: { roomId, view: core.view(room, s.uid) } }));
  if (!messages.length) return;
  const headers: Record<string, string> = { apikey: SERVICE_KEY, 'Content-Type': 'application/json' };
  if (SERVICE_KEY.startsWith('eyJ')) headers.Authorization = 'Bearer ' + SERVICE_KEY;     // legacy service_role JWT
  try {
    const r = await fetch(SUPABASE_URL + '/realtime/v1/api/broadcast', { method: 'POST', headers, body: JSON.stringify({ messages }) });
    if (!r.ok) console.warn('broadcast', r.status, (await r.text()).slice(0, 200));
  } catch (e) { console.warn('broadcast', e); }
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
      const [, , pts] = await Promise.all([publishQueued(r.id, room), push(r.id, room), points(uid)]);
      return { view: core.view(room, uid), roomId: r.id, points: pts };
    }
    throw new HttpErr('no_code', 500);
  } catch (e) { await credit(uid, st.buyIn, 'refund'); throw e; }
}

// ---------- všechny ostatní operace nad existujícím stolem ----------
// deno-lint-ignore no-explicit-any
async function mutate(uid: string, op: string, body: any, lim?: Promise<unknown>) {
  let code = String(body.code ?? '').toUpperCase().trim();
  if (!CODE_RE.test(code)) {                                   // bez kódu: poslední stůl, kde hráč sedí
    const { data } = await admin.from('seats').select('room_id, rooms!inner(code, status)').eq('user_id', uid).neq('rooms.status', 'closed').limit(1);
    // deno-lint-ignore no-explicit-any
    code = (data?.[0] as any)?.rooms?.code ?? '';
    if (!code) throw new HttpErr('no_room', 404);
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    // jeden dotaz místo dvou: rooms + vnořený room_state (1:1 přes room_id)
    const { data: r } = await admin.from('rooms').select('id, updated_at, room_state(state, version)').eq('code', code).maybeSingle();
    if (!r) throw new HttpErr('no_room', 404);
    // deno-lint-ignore no-explicit-any
    const st = (Array.isArray(r.room_state) ? r.room_state[0] : r.room_state) as any;
    if (!st) throw new HttpErr('no_room', 404);
    const room = st.state;
    if (lim) { await lim; lim = undefined; }                    // limit požadavků běžel souběžně s načtením; před změnou musí projít
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
        // stav je uložený (autoritativní) → hned rozeslat pohledy hráčům; vrácení bodů a projekce běží souběžně.
        // U tahů (act/next/tick…) se na projekce nečeká (doběhnou na pozadí, ve frontě stolu) – klienti stav mají z broadcastu
        // a 'state' čte room_state. U změn sezení/bodů (join/leave/rebuy/sitIn, vyhazov, zavření) se čeká: z tabulek seats/rooms
        // čte quickseat a lobby.
        const seatsChange = op === 'join' || op === 'leave' || op === 'rebuy' || op === 'sitIn' || reaped.length > 0 || room.status === 'closed' || op === 'addBot' || op === 'removeBot' || op === 'start';
        const pub = publishQueued(r.id, room);
        await Promise.all([
          push(r.id, room),
          (async () => {
            if (refund) await credit(uid, refund, 'cashback', r.id);
            await Promise.all(reaped.map((x) => credit(x.uid, x.refund, 'cashback', r.id)));   // zvednutí od veřejného stolu (odpojení / nečinnost)
          })(),
          seatsChange ? pub : background(pub),
        ]);
      } else if (core.isPub(room) && room.status !== 'closed' && Date.now() - Date.parse(r.updated_at ?? '') > HEARTBEAT_MS) {
        // srdeční tep: čekající hráč u veřejného stolu (bez změny stavu) drží stůl „živý“ → najdou ho další hráči
        // a úklid (sweep) ho nezavře. Dřív stůl bez tahu po 10 min z výběru zmizel → kamarád dostal nový stůl.
        await admin.from('rooms').update({ updated_at: new Date(Date.now()).toISOString() }).eq('id', r.id);
      }
      const money = op === 'join' || op === 'leave' || op === 'rebuy';     // body jen tam, kde se mění (ušetří dotaz)
      return { view: core.view(room, uid), roomId: r.id, ...(money ? { points: await points(uid) } : {}) };
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
  const { data: mine } = await admin.from('seats').select('room_id, rooms!inner(code, status, is_public, tier)').eq('user_id', uid).eq('rooms.is_public', true).neq('rooms.status', 'closed').limit(3);
  // deno-lint-ignore no-explicit-any
  for (const m of (mine ?? []) as any[]) {
    if (m.rooms?.tier === T.id) return await mutate(uid, 'state', { code: m.rooms.code });
    // sedí u jiné úrovně (např. zapomenutý stůl) → zvednout (žetony zpět) a usadit podle volby
    try { await mutate(uid, 'leave', { code: m.rooms.code }); } catch (e) { console.warn('qs leave', e); }
  }
  if (await points(uid) < T.bb * T.buyInBB) throw new HttpErr('points');
  const join = async (code: string) => {
    for (let k = 0; k < 3; k++) {                                // 'busy' (souběh) → zkusit znovu, ne přeskočit stůl
      try { return await mutate(uid, 'join', { code, name: body.name }); }
      catch (e) { if (e instanceof HttpErr && e.code === 'busy' && k < 2) { await new Promise((r) => setTimeout(r, 80 + Math.random() * 120)); continue; } throw e; }
    }
  };
  const openTables = async (exceptCode = '') => {
    const fresh = new Date(Date.now() - FRESH_MS).toISOString();
    let q = admin.from('rooms').select('code, seated, created_at').eq('is_public', true).eq('tier', T.id).eq('status', 'playing')
      .lt('seated', core.PUB_MAX).gt('updated_at', fresh);
    if (exceptCode) q = q.neq('code', exceptCode);
    const { data } = await q.order('seated', { ascending: false }).order('created_at', { ascending: true }).limit(8);
    return data ?? [];
  };
  for (const r of await openTables()) {
    try { return await join(r.code); }
    catch (e) { if (e instanceof HttpErr && ['full', 'closed', 'no_room', 'busy'].includes(e.code)) continue; throw e; }
  }
  for (let k = 0; k < 10; k++) {                                  // žádný volný → nový stůl
    const room = core.createPublic({ tier: T.id });
    const { data: r, error } = await admin.from('rooms').insert({ code: room.code, host: null, status: room.status, settings: room.settings,
      public_state: core.view(room, null), version: room.ver, is_public: true, tier: T.id, seated: 0 }).select('id, created_at').single();
    if (error) { if (error.code === '23505') continue; console.error(error); throw new HttpErr('server', 500); }
    await admin.from('room_state').insert({ room_id: r.id, state: room, version: 0 });
    const res = await join(room.code);
    // souběh: dva hráči přišli skoro současně, oba nic nenašli a oba založili stůl. Deterministické sloučení:
    // kdo má MLADŠÍ stůl, přesedne ke staršímu (created_at, pak kód) – starší stůl zůstane, mladší se zavře.
    // deno-lint-ignore no-explicit-any
    const older = (await openTables(room.code)).filter((o: any) => o.created_at < r.created_at || (o.created_at === r.created_at && o.code < room.code))
      // deno-lint-ignore no-explicit-any
      .sort((a: any, b: any) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
    for (const o of older) {
      try {
        await mutate(uid, 'leave', { code: room.code });           // prázdný stůl se zavře, žetony zpět
        return await join(o.code);
      } catch (e) {
        if (e instanceof HttpErr && ['full', 'closed', 'no_room', 'busy'].includes(e.code)) { try { return await join(room.code); } catch (_) { /* zkusit další */ } continue; }
        throw e;
      }
    }
    return res;
  }
  throw new HttpErr('no_code', 500);
}
async function lobby() {
  const fresh = new Date(Date.now() - FRESH_MS).toISOString();
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

// ověření JWT: výsledek getUser si pamatujeme do vypršení tokenu (max 5 min) → o 1 síťový dotaz méně na každý tah
const userCache = new Map<string, { id: string; exp: number }>();
async function userOf(jwt: string): Promise<string | null> {
  if (!jwt) return null;
  const c = userCache.get(jwt); if (c && c.exp > Date.now()) return c.id;
  const { data } = await admin.auth.getUser(jwt);
  const id = data?.user?.id; if (!id) return null;
  let exp = Date.now() + 5 * 60e3;
  try { const p = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (p.exp) exp = Math.min(exp, p.exp * 1000 - 5000); } catch (_) { /* neprůhledný token */ }
  if (userCache.size > 2000) userCache.clear();
  userCache.set(jwt, { id, exp });
  return id;
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
    const uid = await userOf(jwt);
    if (!uid) throw new HttpErr('auth', 401);
    const user = { id: uid };
    const lim = limit(user.id, 'all');
    if (op === 'points' || op === 'lobby' || op === 'state' || op === 'tick') {   // čtení: limit souběžně (o dotaz rychlejší)
      const [, out] = await Promise.all([lim, op === 'points' ? points(user.id).then((n) => ({ points: n })) : op === 'lobby' ? lobby() : mutate(user.id, op, body)]);
      return json(out);
    }
    if (op === 'quickseat' || op === 'report' || op === 'create') {
      await lim;
      if (op === 'quickseat') return json(await quickseat(user.id, body));
      if (op === 'report') return json(await report(user.id, body));
      return json(await create(user.id, body));
    }
    lim.catch(() => {});                                        // tahy: limit souběžně s načtením stolu, čeká se na něj před změnou
    return json(await mutate(user.id, op, body, lim));
  } catch (e) {
    const code = e instanceof HttpErr ? e.code : 'server';
    if (!(e instanceof HttpErr)) console.error(e);
    return json({ code, error: code }, e instanceof HttpErr ? e.status : 500);
  }
});
