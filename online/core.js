/* Red River – online soukromé stoly: AUTORITATIVNÍ herní jádro (žádné DOM).
   Stejný kód běží v in-memory mocku (testy, offline ukázka) i v Supabase Edge Function (server).
   Klient nikdy nedostane balíček ani cizí karty: vše, co odchází ven, prochází přes view().
   Funguje v prohlížeči (window.RRCore), v Node (module.exports) i v Deno (globalThis.RRCore). */
(function (root) {
  'use strict';
  const BLINDS = [[1, 2], [5, 10], [25, 50], [50, 100]];
  const BUYIN_BB = [50, 100, 200];
  const TURN_MS = 30000, NEXT_MS = 6000, MAX_TIMEOUTS = 2;
  /* veřejné stoly (hraj s kýmkoli): 3 úrovně sázek, max 6 míst, jen virtuální body, bez botů na serveru */
  const TIERS = [{ id: 'micro', sb: 1, bb: 2, buyInBB: 100 }, { id: 'mid', sb: 5, bb: 10, buyInBB: 50 }, { id: 'high', sb: 25, bb: 50, buyInBB: 50 }];
  const PUB_MAX = 6, REAP_MS = 90000;          // kdo stojí mimo hru (čas / bez žetonů) déle než 90 s, je zvednut od stolu a žetony se vrátí
  /* filtr přezdívek (veřejné stoly): bez diakritiky, leet → písmena, hledá kořeny sprostých slov / vydávání se za správce */
  const BAD = ['kurv', 'kurev', 'mrdk', 'pice', 'pic', 'pyc', 'kokot', 'curak', 'cur', 'zmrd', 'mrd', 'hovn', 'sracka', 'srac', 'debil', 'kreten', 'idiot', 'buzn', 'negr', 'cigos', 'cikan', 'zid', 'hitler', 'nazi', 'fuck', 'fck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'nigg', 'nigga', 'fag', 'retard', 'whore', 'slut', 'porn', 'sex', 'admin', 'moderator', 'redriver', 'support'];
  const BAD_EXACT = ['pica', 'pice', 'pico', 'picus', 'cur', 'mrd', 'zid', 'sex', 'fag', 'zmrd', 'srac'];
  function normName(n) {
    return String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[0@]/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5\$/g, 's').replace(/[$5]/g, 's').replace(/7/g, 't').replace(/[^a-z]/g, '');
  }
  function badName(n) {
    const s = normName(n), words = String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).map(normName);
    if (words.some(w => BAD_EXACT.includes(w))) return true;
    return BAD.filter(b => b.length >= 4).some(b => s.includes(b));
  }

  class CoreError extends Error { constructor(code) { super(code); this.code = code; } }
  const fail = code => { throw new CoreError(code); };

  /* nestranné náhodné číslo 0..n-1 z kryptografického generátoru (Web Crypto: prohlížeč, Node 19+, Deno) */
  function cryptoRandInt(n) {
    const c = root.crypto || (typeof globalThis !== 'undefined' && globalThis.crypto);
    if (!c || !c.getRandomValues) throw new Error('crypto.getRandomValues není k dispozici');
    const lim = Math.floor(0x100000000 / n) * n, u = new Uint32Array(1);
    do c.getRandomValues(u); while (u[0] >= lim);
    return u[0] % n;
  }

  function makeCore(deps) {
    deps = deps || {};
    const PE = deps.PE || root.PE;
    const now = deps.now || (() => Date.now());
    const randInt = deps.randInt || cryptoRandInt;
    const rng = () => randInt(0x40000000) / 0x40000000;

    /* ---------- pomocné ---------- */
    const seatOf = (room, uid) => room.seats.findIndex(s => s && !s.bot && s.uid === uid);
    const occupied = room => room.seats.map((s, i) => s ? i : -1).filter(i => i >= 0);
    const humans = room => room.seats.filter(s => s && !s.bot);
    const P = (h, i) => h.players.find(p => p.seat === i);
    const touch = room => { room.ver = (room.ver || 0) + 1; room.updated = now(); };
    const cleanName = n => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'Hráč';

    function shuffle() {                       // Fisher–Yates, kryptografické míchání na serveru
      const d = Array.from({ length: 52 }, (_, i) => i);
      for (let i = 51; i > 0; i--) { const j = randInt(i + 1); const x = d[i]; d[i] = d[j]; d[j] = x; }
      return d;
    }
    function newCode(taken) {
      for (let k = 0; k < 200; k++) { const c = 'RED-' + String(1000 + randInt(9000)); if (!taken || !taken(c)) return c; }
      fail('no_code');
    }
    function checkSettings(s) {
      s = s || {};
      const max = Math.round(+s.max || 6); if (max < 2 || max > 9) fail('bad_settings');
      const bl = BLINDS.find(b => b[0] === +s.sb && b[1] === +s.bb) || (s.sb == null ? BLINDS[0] : null); if (!bl) fail('bad_settings');
      const bbs = +s.buyInBB || 100; if (!BUYIN_BB.includes(bbs)) fail('bad_settings');
      const botLvl = [0, 1, 2].includes(+s.botLvl) ? +s.botLvl : 1;
      return { max, sb: bl[0], bb: bl[1], buyInBB: bbs, buyIn: bbs * bl[1], bots: !!s.bots, turnMs: TURN_MS, botLvl };
    }

    /* ---------- místnost ---------- */
    /* veřejný stůl: bez hostitele, hra běží sama (rozdá se, jakmile sedí aspoň 2 hráči) */
    function createPublic({ tier, code }) {
      const T = TIERS.find(x => x.id === tier); if (!T) fail('bad_tier');
      const st = Object.assign(checkSettings({ max: PUB_MAX, sb: T.sb, bb: T.bb, buyInBB: T.buyInBB }), { pub: true, tier: T.id });
      return { v: 1, code: code || newPubCode(), host: null, status: 'playing', waiting: true, settings: st, seats: Array(PUB_MAX).fill(null),
        handNo: 0, dealer: -1, hand: null, last: null, ver: 0, created: now(), updated: now(), botN: 0 };
    }
    function newPubCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = 'PUB-'; for (let k = 0; k < 6; k++) c += A[randInt(A.length)]; return c; }
    const isPub = room => !!(room.settings && room.settings.pub);
    const noPub = room => { if (isPub(room)) fail('public'); };
    function createRoom({ uid, name, code, settings }) {
      if (!uid) fail('auth');
      const st = checkSettings(settings);
      const room = { v: 1, code: code || newCode(), host: uid, status: 'lobby', settings: st, seats: Array(st.max).fill(null),
        handNo: 0, dealer: -1, hand: null, last: null, ver: 0, created: now(), updated: now(), botN: 0 };
      join(room, uid, name);
      return room;
    }
    /* vrací { seat, cost }; cost = kolik bodů musí server hráči odečíst (jen virtuální body) */
    function join(room, uid, name) {
      if (!uid) fail('auth');
      if (room.status === 'closed') fail('closed');
      const have = seatOf(room, uid); if (have >= 0) return { seat: have, cost: 0 };
      if (isPub(room) && badName(name)) fail('bad_name');
      let i = room.seats.findIndex(s => !s);
      if (i < 0) {                             // plno → uvolni místo po botovi (mimo rozehranou ruku)
        i = room.seats.findIndex((s, k) => s && s.bot && !(room.hand && !room.hand.done && P(room.hand, k)));
        if (i < 0) fail('full');
      }
      room.seats[i] = { uid, name: cleanName(name), bot: false, stack: room.settings.buyIn, sitOut: false, timeouts: 0 };
      // přisednutí během rozehrané ruky: hráč v ní není (nemá karty) a hraje až od další ruky
      if (isPub(room) && room.waiting && !room.hand) startHand(room);
      touch(room); return { seat: i, cost: room.settings.buyIn };
    }
    /* vrací { refund } – žetony se vrací zpět do virtuálních bodů (žádný výběr peněz neexistuje) */
    function leave(room, uid) {
      const i = seatOf(room, uid); if (i < 0) return { refund: 0 };
      const h = room.hand;
      if (h && !h.done) { const p = P(h, i); if (p && !p.folded) { p.folded = true; log(h, i, 'fold', 0); if (h.toAct === i) h.toAct = -1; advance(room); } }
      const refund = room.seats[i].stack; room.seats[i] = null;
      if (room.host === uid && !isPub(room)) { const nh = humans(room)[0]; if (nh) room.host = nh.uid; }
      if (!humans(room).length) { room.status = 'closed'; room.hand = h && h.done ? h : null; }
      touch(room); return { refund };
    }
    function addBot(room, uid, sys) {          // sys = jen lokální ukázka (mock) – server veřejným stolům boty nepřidává
      if (!sys) { noPub(room); if (room.host !== uid) fail('not_host'); }
      const i = room.seats.findIndex(s => !s); if (i < 0) fail('full');
      room.botN = (room.botN || 0) + 1;
      const names = ['Bot Ada', 'Bot Bára', 'Bot Cyril', 'Bot Dan', 'Bot Ema', 'Bot Filip', 'Bot Gita', 'Bot Hugo', 'Bot Ivo'];
      room.seats[i] = { uid: null, name: names[(room.botN - 1) % names.length], bot: true, stack: room.settings.buyIn, sitOut: false, style: PE.makeBot(room.settings.botLvl != null ? room.settings.botLvl : 1, rng) };
      touch(room); return { seat: i };
    }
    function removeBot(room, uid, i) {
      noPub(room); if (room.host !== uid) fail('not_host');
      const s = room.seats[i]; if (!s || !s.bot) fail('bad_seat');
      if (room.hand && !room.hand.done && P(room.hand, i)) fail('in_hand');
      room.seats[i] = null; touch(room);
    }
    function rebuy(room, uid) {
      const i = seatOf(room, uid); if (i < 0) fail('not_seated');
      const s = room.seats[i]; if (s.stack >= room.settings.bb) fail('not_busted');
      if (room.hand && !room.hand.done && P(room.hand, i)) fail('in_hand');
      const cost = room.settings.buyIn - s.stack; s.stack = room.settings.buyIn; s.sitOut = false; s.timeouts = 0; s.outSince = 0;
      if (isPub(room) && room.waiting && !room.hand) startHand(room);
      touch(room); return { cost };
    }
    function sitIn(room, uid) {
      const i = seatOf(room, uid); if (i < 0) fail('not_seated');
      const s = room.seats[i]; if (s.stack <= 0) fail('busted');
      s.sitOut = false; s.timeouts = 0; s.outSince = 0;
      if (isPub(room) && room.waiting && !room.hand) startHand(room);
      touch(room);
    }
    function start(room, uid) {
      noPub(room); if (room.host !== uid) fail('not_host');
      if (room.status !== 'lobby') fail('started');
      if (room.settings.bots) while (room.seats.some(s => !s)) addBot(room, uid);
      if (occupied(room).length < 2) fail('need_players');
      room.status = 'playing'; startHand(room); return {};
    }

    /* ---------- ruka ---------- */
    function startHand(room) {
      const st = room.settings;
      room.seats.forEach(s => { if (s && s.bot && s.stack < st.bb) s.stack = st.buyIn; });   // boti si dokoupí sami
      room.seats.forEach(s => { if (s && !s.bot && s.stack <= 0 && !s.sitOut) { s.sitOut = true; s.outSince = now(); } });
      const elig = occupied(room).filter(i => !room.seats[i].sitOut && room.seats[i].stack > 0);
      room.nextAt = 0;
      if (elig.length < 2) { room.hand = null; room.waiting = true; touch(room); return false; }
      room.waiting = false;
      const n = room.seats.length, nextOf = from => { for (let k = 1; k <= n; k++) { const j = (from + k) % n; if (elig.includes(j)) return j; } return -1; };
      room.dealer = nextOf(room.dealer < 0 ? n - 1 : room.dealer);
      const order = []; for (let j = room.dealer, k = 0; k < elig.length; k++) { j = nextOf(j); order.push(j); }   // od hráče po dealerovi
      const hu = elig.length === 2;
      const sb = hu ? room.dealer : order[0], bb = hu ? order[0] : order[1];
      const deck = shuffle();
      const h = { no: ++room.handNo, street: 0, board: [], deck, holes: {}, players: [], curBet: 0, minRaise: st.bb,
        dealer: room.dealer, sb, bb, toAct: -1, deadline: 0, done: false, actions: [], result: null, started: now() };
      order.forEach(i => { h.holes[i] = [deck.pop(), deck.pop()];
        h.players.push({ seat: i, uid: room.seats[i].uid, name: room.seats[i].name, bot: room.seats[i].bot, start: room.seats[i].stack, bet: 0, total: 0, folded: false, allIn: false, acted: false }); });
      room.hand = h;
      post(room, sb, st.sb, 'sb'); post(room, bb, st.bb, 'bb');
      h.curBet = Math.max(P(h, sb).bet, P(h, bb).bet);
      h.toAct = bb; h.toAct = nextToAct(room, bb);
      if (h.toAct < 0 || roundDone(h)) advance(room); else h.deadline = now() + st.turnMs;
      touch(room); return true;
    }
    function post(room, i, amt, t) { const h = room.hand, p = P(h, i), s = room.seats[i]; const a = Math.min(amt, s.stack); s.stack -= a; p.bet += a; p.total += a; if (!s.stack) p.allIn = true; log(h, i, t, a); }
    function log(h, i, t, a, to) { h.actions.push({ st: h.street, seat: i, t, a: a || 0, to: to || 0 }); }
    const canAct = p => !p.folded && !p.allIn;
    function nextToAct(room, from) {
      const h = room.hand, n = room.seats.length;
      for (let k = 1; k <= n; k++) { const j = (from + k) % n, p = P(h, j); if (p && canAct(p) && (!p.acted || p.bet < h.curBet)) return j; }
      return -1;
    }
    function roundDone(h) {
      const live = h.players.filter(canAct);
      if (live.length === 0) return true;
      if (live.length === 1 && h.players.filter(p => !p.folded).length > 1 && live[0].bet >= h.curBet) return true;
      return live.every(p => p.acted && p.bet === h.curBet);
    }
    function legal(room, i) {
      const h = room.hand; if (!h || h.done || h.toAct !== i) return null;
      const p = P(h, i), stack = room.seats[i].stack, toCall = Math.max(0, h.curBet - p.bet);
      const maxTo = p.bet + stack, minTo = Math.min(maxTo, h.curBet ? h.curBet + h.minRaise : room.settings.bb);
      const others = h.players.filter(q => q.seat !== i && canAct(q)).length;
      // navýšit lze, pokud mám víc než na dorovnání, ještě jsem v tomto kole nejednal (nebo bylo plně navýšeno) a někdo může odpovědět
      const canRaise = stack > toCall && !p.acted && others > 0;
      return { toCall: Math.min(toCall, stack), canCheck: toCall === 0, canRaise, minTo, maxTo, bet: p.bet, curBet: h.curBet,
        pot: h.players.reduce((s, q) => s + q.total, 0), stack, raiseIsBet: h.curBet === 0 };
    }
    /* akce hráče – plná validace (pořadí, typ, částka) */
    function act(room, uid, a) {
      const h = room.hand; if (!h || h.done) fail('no_hand');
      const i = seatOf(room, uid); if (i < 0) fail('not_seated');
      if (h.toAct !== i) fail('not_your_turn');
      return apply(room, i, a || {});
    }
    function apply(room, i, a, auto) {
      const h = room.hand, p = P(h, i), s = room.seats[i], L = legal(room, i);
      let t = String(a.t || a.type || ''); if (t === 'bet') t = 'raise';
      if (!s.bot && s.uid && L) { room.reads = room.reads || {}; const r = room.reads[s.uid] || (room.reads[s.uid] = {}); PE.readNote(r, h.street, t === 'raise' && L.raiseIsBet ? 'bet' : t, L.toCall > 0, true); }
      let to = Math.floor(+a.to);
      if (t === 'allin') { to = L.maxTo; t = to > h.curBet && L.canRaise ? 'raise' : 'call'; if (t === 'call' && L.toCall === 0) t = 'check'; }
      if (t === 'fold') { if (L.canCheck) t = 'check'; else { p.folded = true; log(h, i, 'fold'); } }
      if (t === 'check') { if (!L.canCheck) fail('cannot_check'); log(h, i, 'check'); }
      else if (t === 'call') {
        if (L.toCall <= 0) fail('nothing_to_call');
        const c = L.toCall; s.stack -= c; p.bet += c; p.total += c; if (!s.stack) p.allIn = true; log(h, i, p.allIn ? 'allin' : 'call', c, p.bet);
      } else if (t === 'raise') {
        if (!L.canRaise) fail('cannot_raise');
        if (!Number.isFinite(to)) fail('bad_amount');
        if (to > L.maxTo) to = L.maxTo;
        if (to < L.minTo && to !== L.maxTo) fail('raise_too_small');
        if (to <= h.curBet) fail('raise_too_small');
        const add = to - p.bet; s.stack -= add; p.bet = to; p.total += add; if (!s.stack) p.allIn = true;
        const inc = to - h.curBet;
        if (inc >= h.minRaise) { h.minRaise = inc; h.players.forEach(q => { if (q !== p && canAct(q)) q.acted = false; }); }
        h.curBet = to; log(h, i, p.allIn ? 'allin' : (L.raiseIsBet ? 'bet' : 'raise'), add, to);
      } else if (t !== 'fold') fail('bad_action');
      p.acted = true; if (!s.bot && !auto) s.timeouts = 0;           // automatický tah po vypršení času počítadlo nenuluje
      advance(room); touch(room); return {};
    }
    function advance(room) {
      const h = room.hand;
      for (let guard = 0; guard < 10; guard++) {
        const live = h.players.filter(p => !p.folded);
        if (live.length === 1) return finish(room, false);
        if (!roundDone(h)) { h.toAct = nextToAct(room, h.toAct < 0 ? h.dealer : h.toAct); if (h.toAct >= 0) { h.deadline = now() + room.settings.turnMs; return; } }
        // konec sázkového kola
        h.players.forEach(p => { p.bet = 0; if (canAct(p)) p.acted = false; });
        h.curBet = 0; h.minRaise = room.settings.bb;
        if (h.street === 3) return finish(room, true);
        h.street++; h.deck.pop();                                        // spálená karta
        if (h.street === 1) h.board.push(h.deck.pop(), h.deck.pop(), h.deck.pop()); else h.board.push(h.deck.pop());
        h.toAct = -1;
        if (h.players.filter(canAct).length >= 2) { h.toAct = nextToAct(room, h.dealer); h.deadline = now() + room.settings.turnMs; return; }
      }
    }
    function finish(room, showdown) {
      const h = room.hand, live = h.players.filter(p => !p.folded);
      if (room.reads) h.players.forEach(p => { if (!p.bot && p.uid && room.reads[p.uid]) PE.readHand(room.reads[p.uid]); });
      const levels = [...new Set(h.players.map(p => p.total).filter(x => x > 0))].sort((a, b) => a - b);
      let prev = 0; const pots = [];
      for (const lv of levels) {
        const amt = h.players.reduce((s, p) => s + Math.min(p.total, lv) - Math.min(p.total, prev), 0);
        const el = live.filter(p => p.total >= lv).map(p => p.seat);
        const last = pots[pots.length - 1];
        if (last && last.elig.join() === el.join()) last.amount += amt; else if (amt) pots.push({ amount: amt, elig: el });
        prev = lv;
      }
      const score = {}; if (showdown) live.forEach(p => { score[p.seat] = PE.evaluate(h.holes[p.seat].concat(h.board)); });
      const n = room.seats.length, dist = i => (i - h.dealer - 1 + n) % n;
      const won = {};
      for (const pot of pots) {
        let w = pot.elig;
        if (showdown && w.length > 1) { const best = Math.max(...w.map(i => score[i])); w = w.filter(i => score[i] === best); }
        w = w.slice().sort((a, b) => dist(a) - dist(b));
        const share = Math.floor(pot.amount / w.length); let rest = pot.amount - share * w.length;
        w.forEach(i => { const x = share + (rest-- > 0 ? 1 : 0); won[i] = (won[i] || 0) + x; if (room.seats[i]) room.seats[i].stack += x; });
        pot.winners = w; pot.cat = showdown && w.length ? PE.handCategory(score[w[0]]) : -1;
      }
      const reveal = {}; if (showdown && live.length > 1) live.forEach(p => { reveal[p.seat] = h.holes[p.seat].slice(); });
      h.done = true; h.toAct = -1; h.deadline = 0;
      h.result = { showdown: !!showdown && live.length > 1, pots: pots.map(p => ({ amount: p.amount, winners: p.winners, cat: p.cat })), won, reveal };
      room.last = {                                                     // rozbor ruky (veřejný – jen odkryté karty)
        no: h.no, board: h.board.slice(), dealer: h.dealer, sb: h.sb, bb: h.bb, actions: h.actions.slice(), result: h.result,
        players: h.players.map(p => ({ seat: p.seat, name: p.name, bot: p.bot, start: p.start, net: (won[p.seat] || 0) - p.total, folded: p.folded,
          cat: reveal[p.seat] ? PE.handCategory(score[p.seat]) : -1 })) };
      room.nextAt = now() + NEXT_MS;
    }

    /* ---------- boti a čas ---------- */
    /* bot: stejná „lidská“ AI jako v aplikaci (engine.js → PE.botDecide): styl, úroveň, blafy, check-raise, slowplay, přizpůsobení hráčům */
    function botDecide(room, i) {
      const h = room.hand, L = legal(room, i), hole = h.holes[i], me = P(h, i), s = room.seats[i];
      const live = h.players.filter(p => !p.folded), opps = live.filter(p => p.seat !== i);
      const N = room.seats.length, offD = seat => (seat - h.dealer - 1 + N) % N;      // pořadí po flopu (0 = první po dealerovi)
      let raises = 0, top = 0, st = 0, limpers = 0, pfAgg = -1, checked = false;
      for (const a of h.actions) {
        if (a.st !== st) { st = a.st; top = 0; }
        if (a.t === 'sb' || a.t === 'bb') { top = Math.max(top, a.a); continue; }
        const isR = a.t === 'bet' || a.t === 'raise' || (a.t === 'allin' && a.to > top);
        if (a.to) top = Math.max(top, a.to);
        if (a.st === 0 && isR) pfAgg = a.seat;
        if (a.st === h.street) { if (h.street === 0 && !raises && a.t === 'call') limpers++; if (isR) raises++; if (a.seat === i && a.t === 'check') checked = true; }
      }
      const wasR = new Set(h.actions.filter(a => a.st === 0 && (a.t === 'raise' || a.t === 'bet' || a.t === 'allin')).map(a => a.seat));
      const idx = h.players.findIndex(p => p.seat === i), position = PE.posName((idx + 1) % h.players.length, h.players.length);   // h.players začíná hráčem po dealerovi
      const ip = opps.every(p => offD(p.seat) < offD(i));
      const allInCall = L.toCall > 0 && L.toCall >= s.stack;
      const eq = h.street > 0 || allInCall ? PE.equity(hole, h.board, opps.map(p => ({ minChen: wasR.has(p.seat) ? 8 : 0 })), h.street > 0 ? 300 : 400, rng).equity : 0.5;
      let read = null;                                    // čtení lidí v ruce (součet)
      const rs = opps.filter(p => !p.bot && p.uid && room.reads && room.reads[p.uid]).map(p => room.reads[p.uid]);
      if (rs.length) { read = {}; rs.forEach(r => { for (const k in r) read[k] = (read[k] || 0) + (+r[k] || 0); }); read.n = Math.round(read.n / rs.length); }
      const ctx = { street: h.street, hole, board: h.board.slice(), pot: L.pot, toCall: L.toCall, currentBet: h.curBet, myBet: me.bet, stack: s.stack,
        minRaiseTo: L.minTo, bb: room.settings.bb, position, numOpp: opps.length, raisesThisStreet: raises, limpers, eq,
        eff: Math.min(L.maxTo, Math.max(0, ...opps.map(p => room.seats[p.seat].stack + p.bet))), pfAgg: pfAgg === i, checked, ip, read };
      const d = PE.botDecide(ctx, s.style, rng);
      if (d.action === 'fold') return L.canCheck ? { t: 'check' } : { t: 'fold' };
      if (d.action === 'check') return L.canCheck ? { t: 'check' } : { t: 'fold' };
      if (d.action === 'call') return L.canCheck ? { t: 'check' } : { t: 'call' };
      if (!L.canRaise) return L.canCheck ? { t: 'check' } : { t: 'call' };
      if (d.action === 'allin') return { t: 'raise', to: L.maxTo };
      return { t: 'raise', to: Math.min(L.maxTo, Math.max(L.minTo, Math.round(d.to || L.minTo))) };
    }
    function runBots(room) {
      let n = 0;
      while (room.hand && !room.hand.done && room.hand.toAct >= 0 && room.seats[room.hand.toAct] && room.seats[room.hand.toAct].bot && n < 200) {
        apply(room, room.hand.toAct, botDecide(room, room.hand.toAct)); n++;
      }
      return n;
    }
    /* časovač: kdokoli může zavolat; po vypršení tahu check/fold, po rozdání další ruka */
    function tick(room) {
      const h = room.hand; let ch = false;
      if (h && !h.done && h.deadline && now() >= h.deadline && h.toAct >= 0) {
        const i = h.toAct, s = room.seats[i], L = legal(room, i);
        apply(room, i, { t: L.canCheck ? 'check' : 'fold' }, true);
        if (s && !s.bot && ++s.timeouts >= MAX_TIMEOUTS && !s.sitOut) { s.sitOut = true; s.outSince = now(); }
        ch = true;
      }
      if (room.status === 'playing' && (!room.hand || room.hand.done) && room.nextAt && now() >= room.nextAt) { startHand(room); ch = true; }
      if (room.status === 'playing' && room.waiting && !room.hand && occupied(room).filter(i => !room.seats[i].sitOut && room.seats[i].stack > 0).length >= 2) { startHand(room); ch = true; }
      if (ch) { runBots(room); touch(room); }
      return ch;
    }
    /* veřejné stoly: zvedne od stolu hráče, kteří stojí mimo hru déle než REAP_MS (odpojení / bez žetonů).
       Vrací [{ uid, refund }] – server jim žetony vrátí do virtuálních bodů. */
    function reap(room) {
      if (!isPub(room) || room.status === 'closed') return [];
      const out = [], t = now();
      room.seats.forEach((s, i) => {
        if (!s || s.bot || !s.sitOut) return;
        if (!s.outSince) { s.outSince = t; return; }
        if (t - s.outSince < REAP_MS) return;
        if (room.hand && !room.hand.done && P(room.hand, i) && !P(room.hand, i).folded) return;
        out.push({ uid: s.uid, refund: leave(room, s.uid).refund });
      });
      return out;
    }
    /* nahlášení hráče: kdo hlásí, musí sedět u stolu; cíl je jiný člověk u stolu */
    function reportTarget(room, uid, seat) {
      const me = seatOf(room, uid); if (me < 0) fail('not_seated');
      const s = room.seats[Number(seat)]; if (!s || s.bot || s.uid === uid) fail('bad_seat');
      return { uid: s.uid, name: s.name, seat: Number(seat), hand: room.handNo };
    }
    function next(room, uid) {                 // hostitel může rozdat hned (nečekat na odpočet)
      noPub(room); if (room.host !== uid) fail('not_host');
      if (room.hand && !room.hand.done) fail('in_hand');
      room.nextAt = now(); tick(room); return {};
    }

    /* ---------- pohled pro jednoho hráče: jen jeho karty, cizí jen odkryté ve showdownu ---------- */
    function view(room, uid) {
      const me = uid ? seatOf(room, uid) : -1, h = room.hand;
      const rev = h && h.done && h.result ? h.result.reveal : {};
      const lastAct = {}; if (h) h.actions.forEach(a => { if (a.st === h.street || a.t === 'fold' || a.t === 'allin') lastAct[a.seat] = a; });
      const seats = room.seats.map((s, i) => {
        if (!s) return null;
        const p = h && P(h, i);
        let cards = 0;
        if (p) { if (i === me) cards = h.holes[i].slice(); else if (rev[i]) cards = rev[i].slice(); else if (!p.folded) cards = 2; }
        return { i, name: s.name, bot: s.bot, stack: s.stack, sitOut: !!s.sitOut, me: i === me, host: !s.bot && s.uid === room.host,
          inHand: !!p, bet: p ? p.bet : 0, total: p ? p.total : 0, folded: p ? p.folded : false, allIn: p ? p.allIn : false,
          outSince: s.sitOut ? (s.outSince || 0) : 0, dealer: h ? h.dealer === i : room.dealer === i, sb: h ? h.sb === i : false, bb: h ? h.bb === i : false,
          turn: !!(h && !h.done && h.toAct === i), cards, last: lastAct[i] ? { t: lastAct[i].t, a: lastAct[i].a, to: lastAct[i].to } : null };
      });
      const hostSeat = room.seats.find(s => s && !s.bot && s.uid === room.host);
      const out = { code: room.code, status: room.status, ver: room.ver, isHost: !!uid && room.host === uid, hostName: hostSeat ? hostSeat.name : '',
        settings: { max: room.settings.max, sb: room.settings.sb, bb: room.settings.bb, buyIn: room.settings.buyIn, buyInBB: room.settings.buyInBB, bots: room.settings.bots, turnMs: room.settings.turnMs, pub: !!room.settings.pub, tier: room.settings.tier || null },
        reapMs: REAP_MS,
        me, seats, handNo: room.handNo, waiting: !!room.waiting, nextAt: room.nextAt || 0, serverNow: now(), hand: null, last: null };
      if (h) out.hand = { no: h.no, street: h.street, board: h.board.slice(), pot: h.players.reduce((s, p) => s + p.total, 0), toAct: h.toAct, deadline: h.deadline,
        done: h.done, legal: me >= 0 ? legal(room, me) : null, result: h.done ? h.result : null };
      if (room.last) {
        out.last = JSON.parse(JSON.stringify(room.last));
        const mine = me >= 0 && room.hand && room.hand.no === room.last.no && room.hand.holes[me];
        if (mine) out.last.mine = { seat: me, cards: mine.slice() };
      }
      return out;
    }
    /* soukromé karty po hráčích – na serveru se ukládají do tabulky hole_cards (RLS: jen vlastník) */
    function privateCards(room) {
      const h = room.hand; if (!h) return [];
      return h.players.filter(p => p.uid).map(p => ({ uid: p.uid, hand: h.no, cards: h.holes[p.seat].slice() }));
    }
    function chips(room) { return room.seats.reduce((s, x) => s + (x ? x.stack : 0), 0) + (room.hand && !room.hand.done ? room.hand.players.reduce((s, p) => s + p.total, 0) : 0); }

    return { BLINDS, BUYIN_BB, TIERS, PUB_MAX, REAP_MS, CoreError, newCode, newPubCode, checkSettings, createRoom, createPublic, join, leave, addBot, removeBot, rebuy, sitIn, start, next,
      act, legal, tick, runBots, view, privateCards, chips, seatOf, startHand, reap, reportTarget, badName, cleanName, isPub, humans };
  }

  const api = { makeCore, CoreError, BLINDS, BUYIN_BB, TIERS, PUB_MAX, REAP_MS, badName, cryptoRandInt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RRCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
