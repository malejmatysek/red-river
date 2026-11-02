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
     await net.quickseat(tier, name) → view   veřejný stůl: sedne k otevřenému stolu dané úrovně (nebo založí nový)
     await net.lobby()              → { tiers: [{ id, tables, players }] }   kolik se hraje na veřejných stolech
     await net.report(seat, reason) nahlásí hráče u veřejného stolu
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
      this.log = []; this.reports = []; this.hits = new Map();
      this.demoBots = !!opts.demoBots;          // offline ukázka veřejných stolů: doplní označené boty, aby se dalo hrát i bez lidí
      this.limits = Object.assign({ all: [240, 60], quickseat: [12, 60], report: [5, 600] }, opts.limits || {});
      if (opts.autoTick !== false && typeof setInterval === 'function') { this.timer = setInterval(() => this.tickAll(), opts.tickMs || 400); if (this.timer.unref) this.timer.unref(); }
    }
    stop() { clearInterval(this.timer); }
    pts(uid) { if (!this.points.has(uid)) this.points.set(uid, START_POINTS); return this.points.get(uid); }
    debit(uid, n) { if (n <= 0) return; const p = this.pts(uid); if (p < n) throw err('points'); this.points.set(uid, p - n); this.log.push({ uid, d: -n }); }
    credit(uid, n) { if (n > 0) { this.points.set(uid, this.pts(uid) + n); this.log.push({ uid, d: n }); } }
    /* stejné limity jako server (rr_hit): max požadavků za okno v sekundách */
    hit(uid, bucket) {
      const [max, win] = this.limits[bucket] || [1e9, 60], k = uid + '|' + bucket, t = this.clock();
      let h = this.hits.get(k); if (!h || t - h.t0 >= win * 1000) { h = { t0: t, n: 0 }; this.hits.set(k, h); }
      if (++h.n > max) throw err('rate');
    }
    reapRoom(room) { this.core.reap(room).forEach(r => { this.credit(r.uid, r.refund); if (this.where.get(r.uid) === room.code) this.where.delete(r.uid); }); }
    quickseat(uid, a) {
      const C = this.core, T = C.TIERS.find(x => x.id === a.tier); if (!T) throw err('bad_tier');
      if (C.badName(a.name)) throw err('bad_name');
      if (this.pts(uid) < T.bb * T.buyInBB) throw err('points');
      const mine = this.where.get(uid), cur = mine && this.rooms.get(mine);
      if (cur && C.isPub(cur) && cur.status !== 'closed' && C.seatOf(cur, uid) >= 0) return cur;   // už sedí u veřejného stolu
      const open = [...this.rooms.values()].filter(r => C.isPub(r) && r.status !== 'closed' && r.settings.tier === T.id && C.humans(r).length < C.PUB_MAX)
        .sort((x, y) => C.humans(y).length - C.humans(x).length);
      let room = open[0];
      if (!room) { room = C.createPublic({ tier: T.id, code: (() => { let c; do c = C.newPubCode(); while (this.rooms.has(c)); return c; })() }); this.rooms.set(room.code, room); }
      const buy = room.settings.buyIn; this.debit(uid, buy);
      try { C.join(room, uid, a.name); } catch (e) { this.credit(uid, buy); throw e; }
      if (this.demoBots && C.humans(room).length === 1) {               // jen offline ukázka
        while (room.seats.filter(Boolean).length < 4) C.addBot(room, null, true);
        if (room.waiting && !room.hand) C.startHand(room);
      }
      this.where.set(uid, room.code);
      return room;
    }
    lobby() {
      const C = this.core;
      return { tiers: C.TIERS.map(T => { const rs = [...this.rooms.values()].filter(r => C.isPub(r) && r.status !== 'closed' && r.settings.tier === T.id);
        return { id: T.id, sb: T.sb, bb: T.bb, buyIn: T.bb * T.buyInBB, tables: rs.length, players: rs.reduce((s, r) => s + C.humans(r).length, 0) }; }) };
    }
    room(code) { const r = this.rooms.get(String(code || '').toUpperCase().trim()); if (!r) throw err('no_room'); return r; }
    notify(room) { const s = this.subs.get(room.code); if (s) s.forEach(sub => { try { sub.fn(this.core.view(room, sub.uid)); } catch (e) { console.error(e); } }); }
    async call(uid, op, a) {
      a = a || {};
      if (this.latency) await new Promise(r => setTimeout(r, this.latency));
      const C = this.core;
      try {
        let room;
        this.hit(uid, 'all');
        switch (op) {
          case 'points': return { points: this.pts(uid) };
          case 'lobby': return this.lobby();
          case 'quickseat': this.hit(uid, 'quickseat'); room = this.quickseat(uid, a); break;
          case 'report': {
            this.hit(uid, 'report'); room = this.room(a.code || this.where.get(uid));
            const tg = C.reportTarget(room, uid, a.seat);
            this.reports.push({ reporter: uid, reported: tg.uid, name: tg.name, code: room.code, hand: tg.hand, reason: String(a.reason || 'other').slice(0, 20) });
            return { ok: true };
          }
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
            if (C.isPub(room)) this.reapRoom(room);
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
    tickAll() { this.rooms.forEach(r => { if (r.status !== 'playing') return; const v = r.ver; this.core.tick(r); if (this.core.isPub(r)) this.reapRoom(r); if (r.ver !== v) this.notify(r); }); }
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
    quickseat(tier, name) { return this.op('quickseat', { tier, name, code: null }); }
    lobby() { return this.server.call(this.uid, 'lobby', {}); }
    report(seat, reason) { return this.server.call(this.uid, 'report', { code: this.code, seat, reason }); }
    onChange(fn) { this.fns.add(fn); return () => this.fns.delete(fn); }
  }

  /* ---------- klient proti Supabase (Edge Function + Realtime) ----------
     Všechny zápisy jdou přes Edge Function `table` (service role na serveru), klient do tabulek nikdy nepíše.
     Doručení změn (od nejrychlejšího):
       1) Realtime Broadcast na soukromém kanálu rr-u-<uid>: server po každé změně pošle každému hráči JEHO pohled
          (číst smí jen vlastník – politika v red-river-realtime.sql, posílat jen server) → vykreslí se hned, bez dalšího dotazu;
       2) postgres_changes (rooms.version / hole_cards s RLS) → signál, klient si vyžádá svůj pohled (jen když je novější);
       3) pojistka: když nic nepřijde, klient se sám zeptá ('state') – Realtime události se občas ztrácejí.
     Starší pohledy (nižší ver) se zahazují, takže pořadí doručení nevadí. */
  class SupabaseNet {
    constructor(cfg) { this.kind = 'supabase'; this.cfg = cfg; this.code = null; this.roomId = null; this.fns = new Set(); this.ch = null; this.sb = null; this.uid = null;
      this.ver = -1; this.vcode = null; this.lastAt = 0; this.cardsHand = -1; this.bcOk = false; this.uch = null; this.poll = null; this.inflight = false; }
    seen(v) {                       // zapamatuj si nejnovější pohled; vrací false pro zastaralý
      if (!v) return false;
      if (v.code === this.vcode && typeof v.ver === 'number' && v.ver < this.ver) return false;
      this.vcode = v.code; this.ver = v.ver; this.lastAt = Date.now();
      const me = v.seats && v.seats[v.me]; this.cardsHand = v.hand && me && Array.isArray(me.cards) ? v.hand.no : -1;
      return true;
    }
    emit(v) { if (this.seen(v)) this.fns.forEach(f => f(v)); }
    listenMine() {                  // soukromý kanál s mým pohledem (Broadcast) – bez SQL politiky se nepřipojí a jede se postaru
      if (this.uch || !this.uid) return;
      this.uch = this.sb.channel('rr-u-' + this.uid, { config: { private: true } })
        .on('broadcast', { event: 'view' }, m => { const p = m && m.payload; if (p && p.view && this.code && p.view.code === this.code) { this.bcOk = true; if (p.roomId && !this.roomId) this.roomId = p.roomId; this.emit(p.view); } })
        .subscribe(st => { if (st === 'CHANNEL_ERROR' && !this.bcOk) { const c = this.uch; this.uch = null; this.noBc = true; try { this.sb.removeChannel(c); } catch (e) {} } });
    }
    // region Edge Function přes query parametr, ne přes hlavičku x-region (tu CORS preflight funkce nepovoluje → v prohlížeči ERR_FAILED)
    fnName() { const f = this.cfg.FUNCTION || 'table', r = this.cfg.REGION; return r ? f + '?forceFunctionRegion=' + encodeURIComponent(r) : f; }
    refresh() {                     // vyžádej si svůj pohled (sloučí rychlé po sobě jdoucí podněty)
      clearTimeout(this.t);
      this.t = setTimeout(() => {
        if (this.inflight || !this.code) return; this.inflight = true; const code = this.code;
        this.call('state').then(r => { if (r.view && r.view.code === this.code && code === this.code) this.emit(r.view); }).catch(() => {}).finally(() => { this.inflight = false; });
      }, 40);
    }
    async ready() {
      if (!this.sb) {
        let mod; try { mod = await import('https://esm.sh/@supabase/supabase-js@2'); } catch (e) { throw err('offline'); }
        this.sb = mod.createClient(this.cfg.SUPABASE_URL, this.cfg.SUPABASE_ANON_KEY, { auth: { persistSession: true, storageKey: 'rr-online-auth' } });
      }
      let { data } = await this.sb.auth.getSession();
      if (!data.session) { const r = await this.sb.auth.signInAnonymously(); if (r.error) throw err('auth'); data = { session: r.data.session }; }
      this.uid = data.session.user.id;
      if (!this.noBc) { try { this.listenMine(); } catch (e) {} }
      let points;
      try { points = await this.points(); } catch (e) { throw err(e.code === 'auth' ? 'auth' : 'offline'); }   // funkce `table` nenasazená / nedostupná
      return { uid: this.uid, points };
    }
    async points() { const r = await this.call('points'); return r.points; }
    async call(op, a) {
      const { data, error } = await this.sb.functions.invoke(this.fnName(), { body: Object.assign({ op, code: this.code }, a) });
      if (error) { let code = 'server'; try { code = (await error.context.json()).code || code; } catch (e) {} throw err(code); }
      if (data && data.error) throw err(data.error);
      return data;
    }
    async op(op, a) {
      const r = await this.call(op, a);
      if (r.view) { await this.bind(r.view.code, r.roomId); if (!this.seen(r.view)) return null; }   // mezitím dorazil novější pohled
      return r.view;
    }
    async bind(code, roomId) {
      if (this.code === code && this.ch) return;
      if (this.ch) { await this.sb.removeChannel(this.ch); this.ch = null; }
      clearInterval(this.poll); this.poll = null;
      this.code = code; this.roomId = roomId || null;
      if (!code || !roomId) return;
      this.ch = this.sb.channel('room-' + roomId)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: 'id=eq.' + roomId }, p => {
          const n = p && p.new; if (n && typeof n.version === 'number' && this.vcode === code && n.version <= this.ver) return;   // už to mám (Broadcast)
          this.refresh();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hole_cards', filter: 'user_id=eq.' + this.uid }, p => {
          const n = p && p.new; if (n && typeof n.hand_no === 'number' && n.hand_no <= this.cardsHand) return;
          this.refresh();
        })
        .subscribe();
      // pojistka proti ztraceným událostem: při tichu se zeptej sám (s fungujícím Broadcastem zřídka)
      this.poll = setInterval(() => {
        if (!this.code || this.inflight) return;
        try { if (typeof document !== 'undefined' && document.hidden) return; } catch (e) {}
        if (Date.now() - this.lastAt > (this.bcOk ? 6000 : 2500)) { this.lastAt = Date.now(); this.refresh(); }
      }, 500);
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
    quickseat(tier, name) { return this.op('quickseat', { tier, name, code: null }); }
    lobby() { return this.call('lobby'); }
    report(seat, reason) { return this.call('report', { seat, reason }); }
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
    if (!shared) shared = new MockServer({ demoBots: !root.__RR_PUB_NOBOTS });
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
  const api = { MockServer, MockNet, SupabaseNet, makeNet, mockNet, mockServer: () => shared || (shared = new MockServer({ demoBots: !root.__RR_PUB_NOBOTS })), START_POINTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RRNet = api;
})(typeof window !== 'undefined' ? window : globalThis);
