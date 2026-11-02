// deno-lint-ignore-file
// režim s EdgeRuntime.waitUntil: tahy vrátí odpověď a broadcast hned, projekce (rooms/seats/hole_cards) doběhnou na pozadí ve frontě stolu
import { DB, BROADCASTS } from './fake.ts';
const pending: Promise<unknown>[] = []; (globalThis as any).EdgeRuntime = { waitUntil: (p: Promise<unknown>) => { pending.push(p); } };
let H: any; (Deno as any).serve = (h: any) => { H = h; };
Deno.env.set('SUPABASE_URL', 'http://x'); Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test');
await import('../functions/table/index.ts');
const call = async (uid: string, body: any, origin = 'https://malejmatysek.github.io') => { const r = await H(new Request('http://x', { method: 'POST', headers: { Authorization: 'Bearer ' + uid, origin }, body: JSON.stringify(body) })); return { status: r.status, h: r.headers, ...(await r.json()) }; };
const fails: string[] = []; const ok = (c: any, m: string) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m); };
const pre = await H(new Request('http://x', { method: 'OPTIONS', headers: { origin: 'https://malejmatysek.github.io' } }));
ok(pre.headers.get('Access-Control-Allow-Headers')!.includes('x-region') && pre.headers.get('Access-Control-Allow-Origin') === 'https://malejmatysek.github.io', 'CORS preflight allows x-region');
let r = await call('a', { op: 'create', settings: { max: 2, sb: 1, bb: 2, buyInBB: 100 }, name: 'Ada' }); const code = r.view.code;
await call('b', { op: 'join', code, name: 'Bob' }); r = await call('a', { op: 'start', code });
const room = () => DB.rooms.find((x: any) => x.code === code);
ok(room().version === r.view.ver, 'start awaits projections (seats change)');
let acts = 0;
for (let k = 0; k < 30; k++) {
  const v = (await call('a', { op: 'state', code })).view; if (!v.hand || v.hand.done) break;
  const who = v.hand.toAct === v.me ? 'a' : 'b'; const L = (await call(who, { op: 'state', code })).view.hand.legal;
  const nb = BROADCASTS.length; r = await call(who, { op: 'act', code, action: L.canCheck ? { t: 'check' } : { t: 'call' } }); acts++;
  ok(r.status === 200 && BROADCASTS.length > nb && BROADCASTS.at(-1).messages.every((m: any) => m.payload.view.ver === r.view.ver), 'act ' + k + ': response + broadcast with new version');
}
await Promise.all(pending);
const st = DB.room_state.find((x: any) => x.room_id === room().id);
ok(acts > 2 && room().version === st.state.ver, 'after background work rooms.version = room_state (' + room().version + '/' + st.state.ver + ')');
ok(room().public_state.seats.every((s: any) => !s || !Array.isArray(s.cards)) || room().public_state.hand?.done, 'public_state still without hole cards');
console.log(fails.length ? 'EDGE BG FAIL ' + fails.length : 'EDGE BG OK'); Deno.exit(fails.length ? 1 : 0);
