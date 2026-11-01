/* Red River online – síťová vrstva.
   Jednotné rozhraní Net (stejné pro mock i Supabase):
     net.kind                       'mock' | 'supabase'
     await net.ready()              přihlášení (Supabase: anonymní účet), vrací { uid, points }
     await net.points()             online body hráče (jen virtuální, uložené na serveru)
     await net.create(settings, name) → view       založí stůl (odečte buy-in)
     await net.join(code, name)     → view         připojí ke stolu podle kódu (odečte buy-in)
     await net.leave()                              odejde, žetony se vrátí do online bodů
     await net.start() / addBot() / removeBot(i) / next() / rebuy() / sitIn()
     await net.act({ t: 'fold'|'check'|'call'|'raise'|'allin', to })
     await net.state() / net.tick()
     net.onChange(fn)               fn(view) při každé změně stolu; vrací odhlášení
   Chyby: Promise reject s { code } (např. not_your_turn, raise_too_small, full, no_room, points). */
(function (root) {
  'use strict';
  const Core = root.RRCore || (typeof require === 'function' ? require('./core.js') : null);
  const PE = root.PE || (typeof require === 'function' ? require('../engine.js') : null);
  const err = code => Object.assign(new Error(code), { code });
  const START_POINTS = 1000;

  /* ---------- in-memory „server“ (sdílený všemi MockNet klienty v jednom procesu/stránce) ---------- */
  class MockServer {
    constructor(opts) {
      opts = opts || {};
      this.clock = opts.now || (() => Date.now());
      this.core = Core.makeCore({ PE, now: () => this.clock(), randInt: opts.randInt });
      this.rooms = new Map(); this.points = new Map(); this.subs = new Map(); this.where = new Map();
      this.latency = opts.latency || 0;
      this.log = [];
      if (opts.autoTick !== false && typeof setInterval === 'function') { this.timer = setInterval(() => this.tickAll(), opts.tickMs || 400); if (this.timer.unref) this.timer.unref(); }
    }
    stop() { clearInterval(this.timer); }
    pts(uid) { if (!this.points.has(uid)) this.points.set(uid, START_POINTS); return this.points.get(uid); }
    debit(uid, n) { if (n <= 0) return; const p = this.pts(uid); if (p < n) throw err('points'); this.points.set(uid, p - n); this.log.push({ uid, d: -n }); }
    credit(uid, n) { if (n > 0) { this.points.set(uid, this.pts(uid) + n); this.log.push({ uid, d: n }); } }
    room(code) { const r = this.rooms.get(String(code || '').toUpperCase().trim()); if (!r) throw err('no_room'); return r; }
    notify(room) { const s = this.subs.get(room.code); if (s) s.forEach(sub => { try { sub.fn(this.core.view(room, sub.uid)); } catch (e) { console.error(e); } }); }
    async call(uid, op, a) {
      a = a || {};
      if (this.latency) await new Promise(r => setTimeout(r, this.latency));
      const C = this.core;
      try {
        let room;
        switch (op) {
          case 'points': return { points: this.pts(uid) };
          case 'create': {
            const st = C.checkSettings(a.settings);
            this.debit(uid, st.buyIn);
            try { room = C.createRoom({ uid, name: a.name, settings: a.settings, code: C.newCode(c => this.rooms.has(c)) }); }
            catch (e) { this.credit(uid, st.buyIn); throw e; }
            this.rooms.set(room.code, room); this.where.set(uid, room.code); break;
          }
          case 'join': {
            room = this.room(a.code);
            if (C.seatOf(room, uid) < 0) {
              if (room.status === 'closed') throw err('closed');
              this.debit(uid, room.settings.buyIn);
              try { C.join(room, uid, a.name); } catch (e) { this.credit(uid, room.settings.buyIn); throw e; }
            }
            this.where.set(uid, room.code); break;
          }
          default: {
            room = this.room(a.code || this.where.get(uid));
            if (op === 'leave') { const r = C.leave(room, uid); this.credit(uid, r.refund); this.where.delete(uid); }
            else if (op === 'start') C.start(room, uid);
            else if (op === 'addBot') C.addBot(room, uid);
            else if (op === 'removeBot') C.removeBot(room, uid, a.seat);
            else if (op === 'act') C.act(room, uid, a.action);
            else if (op === 'next') C.next(room, uid);
            else if (op === 'tick') C.tick(room);
            else if (op === 'sitIn') C.sitIn(room, uid);
            else if (op === 'rebuy') { const s = room.seats[C.seatOf(room, uid)]; const need = s ? room.settings.buyIn - s.stack : 0; this.debit(uid, need); try { C.rebuy(room, uid); } catch (e) { this.credit(uid, need); throw e; } }
            else if (op !== 'state') throw err('bad_op');
          }
        }
        if (op !== 'state') { C.runBots(room); this.notify(room); }
        return { view: C.view(room, uid), points: this.pts(uid) };
      } catch (e) { throw err(e.code || 'server'); }
    }
    tickAll() { this.rooms.forEach(r => { if (r.status === 'playing' && this.core.tick(r)) this.notify(r); }); }
    subscribe(code, uid, fn) { if (!this.subs.has(code)) this.subs.set(code, new Set()); const sub = { uid, fn }; this.subs.get(code).add(sub); return () => this.subs.get(code).delete(sub); }
  }

  /* ---------- klient proti mocku ---------- */
  class MockNet {
    constructor(server, uid) { this.kind = 'mock'; this.server = server; this.uid = uid || 'u-' + Math.random().toString(36).slice(2, 10); this.code = null; this.fns = new Set(); this.unsub = null; }
    async ready() { return { uid: this.uid, points: this.server.pts(this.uid) }; }
    async points() { return this.server.pts(this.uid); }
    bind(code) {
      if (this.code === code && this.unsub) return;
      if (this.unsub) this.unsub(); this.code = code;
      this.unsub = code ? this.server.subscribe(code, this.uid, v => this.fns.forEach(f => f(v))) : null;
    }
    async op(op, a) { const r = await this.server.call(this.uid, op, Object.assign({ code: this.code }, a)); if (r.view) this.bind(r.view.status === 'closed' && op === 'leave' ? null : r.view.code); return r.view; }
    create(settings, name) { return this.op('create', { settings, name }); }
    join(code, name) { return this.op('join', { code: String(code).toUpperCase().trim(), name }); }
    async leave() { const v = await this.op('leave'); this.bind(null); return v; }
    start() { return this.op('start'); }
    addBot() { return this.op('addBot'); }
    removeBot(seat) { return this.op('removeBot', { seat }); }
    next() { return this.op('next'); }
    rebuy() { return this.op('rebuy'); }
    sitIn() { return this.op('sitIn'); }
    act(action) { return this.op('act', { action }); }
    state() { return this.op('state'); }
    tick() { return this.op('tick'); }
    onChange(fn) { this.fns.add(fn); return () => this.fns.delete(fn); }
  }

  /* ---------- klient proti Supabase (Edge Function + Realtime) ----------
     Všechny zápisy jdou přes Edge Function `table` (service role na serveru), klient do tabulek nikdy nepíše.
     Realtime posílá jen signál „stůl se změnil“ (rooms.version / hole_cards s RLS) → klient si vyžádá svůj pohled. */
  class SupabaseNet {
    constructor(cfg) { this.kind = 'supabase'; this.cfg = cfg; this.code = null; this.roomId = null; this.fns = new Set(); this.ch = null; this.sb = null; this.uid = null; }
    async ready() {
      if (!this.sb) {
        let mod; try { mod = await import('https://esm.sh/@supabase/supabase-js@2'); } catch (e) { throw err('offline'); }
        this.sb = mod.createClient(this.cfg.SUPABASE_URL, this.cfg.SUPABASE_ANON_KEY, { auth: { persistSession: true, storageKey: 'rr-online-auth' } });
      }
      let { data } = await this.sb.auth.getSession();
      if (!data.session) { const r = await this.sb.auth.signInAnonymously(); if (r.error) throw err('auth'); data = { session: r.data.session }; }
      this.uid = data.session.user.id;
      let points;
      try { points = await this.points(); } catch (e) { throw err(e.code === 'auth' ? 'auth' : 'offline'); }   // funkce `table` nenasazená / nedostupná
      return { uid: this.uid, points };
    }
    async points() { const r = await this.call('points'); return r.points; }
    async call(op, a) {
      const { data, error } = await this.sb.functions.invoke(this.cfg.FUNCTION || 'table', { body: Object.assign({ op, code: this.code }, a) });
      if (error) { let code = 'server'; try { code = (await error.context.json()).code || code; } catch (e) {} throw err(code); }
      if (data && data.error) throw err(data.error);
      return data;
    }
    async op(op, a) { const r = await this.call(op, a); if (r.view) await this.bind(r.view.code, r.roomId); return r.view; }
    async bind(code, roomId) {
      if (this.code === code && this.ch) return;
      if (this.ch) { await this.sb.removeChannel(this.ch); this.ch = null; }
      this.code = code; this.roomId = roomId || null;
      if (!code || !roomId) return;
      const refresh = () => { clearTimeout(this.t); this.t = setTimeout(() => this.call('state').then(r => r.view && this.fns.forEach(f => f(r.view))).catch(() => {}), 60); };
      this.ch = this.sb.channel('room-' + roomId)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: 'id=eq.' + roomId }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hole_cards', filter: 'user_id=eq.' + this.uid }, refresh)
        .subscribe();
    }
    create(settings, name) { return this.op('create', { settings, name }); }
    join(code, name) { return this.op('join', { code: String(code).toUpperCase().trim(), name }); }
    async leave() { const v = await this.op('leave'); await this.bind(null); return v; }
    start() { return this.op('start'); }
    addBot() { return this.op('addBot'); }
    removeBot(seat) { return this.op('removeBot', { seat }); }
    next() { return this.op('next'); }
    rebuy() { return this.op('rebuy'); }
    sitIn() { return this.op('sitIn'); }
    act(action) { return this.op('act', { action }); }
    state() { return this.op('state'); }
    tick() { return this.op('tick'); }
    onChange(fn) { this.fns.add(fn); return () => this.fns.delete(fn); }
  }

  /* výběr: se Supabase konfigurací skutečný server, jinak lokální mock (offline ukázka).
     Vynucení mocku: ?mock=1 v URL, RR_ONLINE_CONFIG.FORCE_MOCK nebo window.__RR_MOCK (testy). */
  let shared = null;
  function wantMock(cfg) {
    if (cfg.FORCE_MOCK || root.__RR_MOCK) return true;
    try { return /[?&]mock=1\b/.test(root.location.search); } catch (e) { return false; }
  }
  function mockNet() {
    if (!shared) shared = new MockServer();
    let uid = null; try { uid = localStorage.getItem('rr_mock_uid'); if (!uid) { uid = 'u-' + Math.random().toString(36).slice(2, 10); localStorage.setItem('rr_mock_uid', uid); } } catch (e) {}
    return new MockNet(shared, uid);
  }
  function makeNet(cfg) {
    cfg = cfg || root.RR_ONLINE_CONFIG || {};
    // klient přijme nový publishable klíč (sb_publishable_…) i starý anon JWT (eyJ…); sb_secret_ do klienta nikdy
    const key = String(cfg.SUPABASE_ANON_KEY || '');
    if (cfg.SUPABASE_URL && key && !/^sb_secret_/.test(key) && !wantMock(cfg)) return new SupabaseNet(cfg);
    return mockNet();
  }
  const api = { MockServer, MockNet, SupabaseNet, makeNet, mockNet, mockServer: () => shared || (shared = new MockServer()), START_POINTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RRNet = api;
})(typeof window !== 'undefined' ? window : globalThis);
