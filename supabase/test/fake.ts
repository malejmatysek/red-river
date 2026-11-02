// in-memory náhrada supabase-js pro test Edge Function (jen metody, které server používá)
// deno-lint-ignore-file
export const DB: Record<string, any[]> = { profiles: [], rooms: [], room_state: [], seats: [], hole_cards: [], hands: [], reports: [], rate_limits: [], point_ledger: [] };
const uuid = () => crypto.randomUUID();
const get = (row: any, col: string) => col.includes('.') ? (row[col.split('.')[0]] ?? {})[col.split('.')[1]] : row[col];
class Q {
  f: any[] = []; op = 'select'; payload: any; cols = '*'; one = 0; lim = 1e9; ord: any[] = []; ret = false; opts: any = {};
  constructor(public t: string) {}
  select(c = '*') { if (this.op === 'select') this.cols = c; else this.ret = true; return this; }
  insert(p: any) { this.op = 'insert'; this.payload = p; return this; }
  upsert(p: any, o: any) { this.op = 'upsert'; this.payload = p; this.opts = o || {}; return this; }
  update(p: any) { this.op = 'update'; this.payload = p; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c: string, v: any) { this.f.push((r: any) => get(r, c) === v); return this; }
  neq(c: string, v: any) { this.f.push((r: any) => get(r, c) !== v); return this; }
  lte(c: string, v: any) { this.f.push((r: any) => get(r, c) <= v); return this; }
  lt(c: string, v: any) { this.f.push((r: any) => get(r, c) < v); return this; }
  gt(c: string, v: any) { this.f.push((r: any) => get(r, c) > v); return this; }
  order(c: string, o: any) { this.ord.push([c, o && o.ascending === false ? -1 : 1]); return this; }
  limit(n: number) { this.lim = n; return this; }
  single() { this.one = 1; return this; }
  maybeSingle() { this.one = 2; return this; }
  then(res: any, rej: any) { const go = () => { try { res(this.run()); } catch (e) { rej(e); } }; if (OPT.delay) setTimeout(go, Math.random() * OPT.delay); else go(); }
  rows() {
    let rows = DB[this.t];
    const m = /(\w+)!inner\(([^)]*)\)/.exec(this.cols);
    if (m) rows = rows.map(r => { const j = DB[m[1]].find(x => x.id === r.room_id); return j ? { ...r, [m[1]]: j } : null; }).filter(Boolean);
    if (this.t === 'rooms' && /(^|[ ,])room_state\(/.test(this.cols)) rows = rows.map(r => ({ ...r, room_state: DB.room_state.find(x => x.room_id === r.id) ?? null }));
    return rows;
  }
  run(): any {
    const T = DB[this.t];
    if (this.op === 'insert' || this.op === 'upsert') {
      const arr = Array.isArray(this.payload) ? this.payload : [this.payload]; const out = [];
      for (const p0 of arr) {
        const p = structuredClone(p0);
        if (this.t === 'rooms') { if (T.some(r => r.code === p.code)) return { data: null, error: { code: '23505', message: 'dup' } };
          Object.assign(p, { id: p.id ?? uuid(), updated_at: new Date(Date.now()).toISOString(), seated: p.seated ?? 0, is_public: p.is_public ?? false }); }
        if (this.t === 'profiles') p.points = p.points ?? 1000;
        if (this.t === 'seats' && p.user_id && T.some(r => r.room_id === p.room_id && r.user_id === p.user_id)) return { data: null, error: { code: '23505', message: 'seat dup' } };
        if (this.op === 'upsert') { const keys = String(this.opts.onConflict).split(','); if (T.some(r => keys.every(k => r[k] === p[k]))) continue; }
        T.push(p); out.push(p);
      }
      const d = this.ret ? (this.one ? out[0] : out) : null; return { data: d, error: null };
    }
    let rows = this.rows().filter(r => this.f.every(fn => fn(r)));
    if (this.op === 'update') { const ids = new Set(rows.map(r => r)); const real = T.filter(r => this.f.every(fn => fn(r))); real.forEach(r => Object.assign(r, structuredClone(this.payload))); return { data: this.ret ? real : null, error: null }; }
    if (this.op === 'delete') { DB[this.t] = T.filter(r => !this.f.every(fn => fn(r))); return { data: null, error: null }; }
    for (const [c, d] of this.ord.slice().reverse()) rows = rows.slice().sort((a, b) => (get(a, c) > get(b, c) ? 1 : get(a, c) < get(b, c) ? -1 : 0) * d);
    rows = rows.slice(0, this.lim).map(r => structuredClone(r));
    if (this.one) { if (!rows.length && this.one === 1) return { data: null, error: { code: 'PGRST116' } }; return { data: rows[0] ?? null, error: null }; }
    return { data: rows, error: null };
  }
}
const prof = (uid: string) => { let p = DB.profiles.find(x => x.id === uid); if (!p) { p = { id: uid, points: 1000 }; DB.profiles.push(p); } return p; };
export const OPT = { delay: 0 };
export const BROADCASTS: any[] = [];
(globalThis as any).fetch = async (url: string, init: any) => { BROADCASTS.push({ url, ...JSON.parse(init.body) }); return new Response('{}', { status: 202 }); };
export const RATE: Record<string, number> = {};
export function createClient() {
  return {
    from: (t: string) => new Q(t),
    auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
    rpc: async (fn: string, a: any) => {
      if (fn === 'debit_points') { const p = prof(a.uid); if (p.points < a.amount) return { data: null, error: { message: 'points' } }; p.points -= a.amount; DB.point_ledger.push({ user_id: a.uid, delta: -a.amount, reason: a.why }); return { data: p.points, error: null }; }
      if (fn === 'credit_points') { const p = prof(a.uid); p.points += a.amount; DB.point_ledger.push({ user_id: a.uid, delta: a.amount, reason: a.why }); return { data: p.points, error: null }; }
      if (fn === 'rr_hit') { const k = a.uid + '|' + a.bucket; RATE[k] = (RATE[k] || 0) + 1; return { data: RATE[k] <= a.max_hits, error: null }; }
      return { data: null, error: { message: 'no fn' } };
    },
  };
}
