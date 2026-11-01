// deno-lint-ignore-file
import { DB } from './fake.ts';
let H: any; (Deno as any).serve = (h: any) => { H = h; };
Deno.env.set('SUPABASE_URL', 'http://x'); Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test');
await import('../functions/table/index.ts');
const call = async (uid: string, body: any) => { const r = await H(new Request('http://x', { method: 'POST', headers: { ...(uid ? { Authorization: 'Bearer ' + uid } : {}), origin: 'https://malejmatysek.github.io' }, body: JSON.stringify(body) })); return { status: r.status, ...(await r.json()) }; };
const fails: string[] = []; const ok = (c: any, m: string) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m); };
const pts = (u: string) => DB.profiles.find(x => x.id === u)?.points;
let r = await call('', { op: 'points' }); console.log(JSON.stringify(r).slice(0,200)); ok(r.status === 401, 'no auth → 401');
r = await call('ua', { op: 'quickseat', tier: 'micro', name: 'K0k0t' }); ok(r.code === 'bad_name' && pts('ua') === undefined, 'bad name rejected before any debit');
r = await call('ua', { op: 'quickseat', tier: 'micro', name: 'Ada' });
console.log(r.points, r.view?.waiting, Object.keys(r));
ok(r.view && /^PUB-/.test(r.view.code) && r.points === 800 && r.view.waiting, 'A: new public table, buy-in debited, waiting');
const code = r.view.code;
const room = () => DB.rooms.find(x => x.code === code);
ok(room().is_public && room().tier === 'micro' && room().seated === 1, 'rooms row: is_public, tier, seated=1');
r = await call('ub', { op: 'quickseat', tier: 'micro', name: 'Bob' });
ok(r.view.code === code && r.view.hand && !r.view.hand.done && room().seated === 2, 'B matched to same table, hand auto-starts');
r = await call('ua', { op: 'quickseat', tier: 'micro', name: 'Ada' }); ok(r.view.code === code && pts('ua') === 800, 'repeat quick-seat → same seat, no second buy-in');
r = await call('uc', { op: 'quickseat', tier: 'micro', name: 'Cyril' }); ok(r.view.code === code && !r.view.seats[r.view.me].inHand, 'C joins mid-hand, sits out this hand');
ok(!JSON.stringify(room().public_state).includes('"deck"') && room().public_state.seats.every((s: any) => !s || !Array.isArray(s.cards)), 'public_state has no deck / hole cards');
ok(DB.hole_cards.filter(h => h.room_id === room().id).length === 2, 'hole_cards rows only for players in hand');
r = await call('ud', { op: 'quickseat', tier: 'mid', name: 'Dana' }); ok(r.view.code !== code && r.points === 500, 'other tier → new table (buy-in 500)');
r = await call('ue', { op: 'quickseat', tier: 'high', name: 'Ema' }); ok(r.code === 'points' && !DB.rooms.some(x => x.tier === 'high'), 'high tier without points → error, no table');
r = await call('ua', { op: 'lobby' }); ok(r.tiers[0].players === 3 && r.tiers[0].tables === 1 && r.tiers[1].players === 1, 'lobby counts');
r = await call('ua', { op: 'start', code }); ok(r.code === 'public', 'host ops refused');
const st = (await call('ua', { op: 'state', code })).view; const bSeat = st.seats.findIndex((s: any) => s && s.name === 'Bob');
r = await call('ua', { op: 'report', code, seat: bSeat, reason: 'abuse' }); ok(r.ok && DB.reports.length === 1 && DB.reports[0].reported === 'ub', 'report stored');
r = await call('ua', { op: 'report', code, seat: st.me, reason: 'abuse' }); ok(r.code === 'bad_seat', 'self report refused');
for (let k = 0; k < 4; k++) r = await call('ua', { op: 'report', code, seat: bSeat, reason: 'spam' }); ok(r.code === 'rate' && r.status === 429, 'report rate limit → 429');
// leave mid-hand → fold + refund
const s0 = (await call('ub', { op: 'state', code })).view; const bStack = s0.seats[s0.me].stack, bp = pts('ub');
r = await call('ub', { op: 'leave', code }); ok(pts('ub') === bp + bStack && room().seated === 2, 'leave refunds stack, seated=2');
// 6 max
for (let k = 0; k < 5; k++) await call('x' + k, { op: 'quickseat', tier: 'micro', name: 'Hráč' + k });
const pubMicro = DB.rooms.filter(x => x.tier === 'micro' && x.status !== 'closed');
ok(pubMicro.length === 2 && pubMicro.some(x => x.seated === 6), '6 max → overflow to second table (' + pubMicro.map(x => x.seated) + ')');
// timeout auto-fold → sit out → reap s refundem (posun času)
{ let off = 0; const dn = Date.now.bind(Date); Date.now = () => dn() + off;
  const t2 = DB.rooms.find(x => x.tier === 'micro' && x.seated === 1 && x.status !== 'closed').code;
  await call('y1', { op: 'quickseat', tier: 'micro', name: 'Yan' });
  let v = (await call('y1', { op: 'state', code: t2 })).view; ok(v.code === t2 && v.hand && !v.hand.done, 'second table hand running');
  const humans = () => v.seats.filter((s: any) => s).map((s: any) => s.name);
  // nech hráče na tahu opakovaně vypršet (pokuta = fold), tick dělá ten druhý
  const firstName = v.seats.find((s: any) => s && s.name !== 'Yan').name; const other = firstName;
  let idle = '', ledger0 = DB.point_ledger.length, sat = false;
  for (let k = 0; k < 12 && !sat; k++) {
    off += 120000; v = (await call('y1', { op: 'tick', code: t2 })).view;
    sat = v.seats.some((s: any) => s && s.sitOut) || !v.seats.some((s: any) => s && s.name === other);
  }
  ok(sat, 'timeouts → player sat out / reaped (' + humans() + ')');
  for (let k = 0; k < 3; k++) { off += 60000; v = (await call('y1', { op: 'tick', code: t2 })).view; }
  const left = v.seats.filter((s: any) => s).length;
  ok(left === 1 && DB.point_ledger.slice(ledger0).some(l => l.reason === 'cashback' && l.delta > 0), 'idle player reaped with chip refund (' + humans() + ')');
  Date.now = dn; }
// private table still works
r = await call('p1', { op: 'create', settings: { max: 2, sb: 1, bb: 2, buyInBB: 100 }, name: 'Host' }); ok(/^RED-\d{4}$/.test(r.view.code) && r.view.isHost && !DB.rooms.find(x => x.code === r.view.code).is_public, 'private create works');
const pc = r.view.code; r = await call('p2', { op: 'join', code: pc, name: 'Eva' }); r = await call('p1', { op: 'start', code: pc }); ok(r.view.hand, 'private start works');
console.log(fails.length ? 'EDGE FAIL ' + fails.length : 'EDGE OK'); Deno.exit(fails.length ? 1 : 0);
