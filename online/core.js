/* Red River – online soukromé stoly: AUTORITATIVNÍ herní jádro (žádné DOM).
   Stejný kód běží v in-memory mocku (testy, offline ukázka) i v Supabase Edge Function (server).
   Klient nikdy nedostane balíček ani cizí karty: vše, co odchází ven, prochází přes view().
   Funguje v prohlížeči (window.RRCore), v Node (module.exports) i v Deno (globalThis.RRCore). */
(function (root) {
  'use strict';
  const BLINDS = [[1, 2], [5, 10], [25, 50], [50, 100]];
  const BUYIN_BB = [50, 100, 200];
  const TURN_MS = 30000, NEXT_MS = 6000, MAX_TIMEOUTS = 2;

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
      return { max, sb: bl[0], bb: bl[1], buyInBB: bbs, buyIn: bbs * bl[1], bots: !!s.bots, turnMs: TURN_MS };
    }

    /* ---------- místnost ---------- */
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
      let i = room.seats.findIndex(s => !s);
      if (i < 0) {                             // plno → uvolni místo po botovi (mimo rozehranou ruku)
        i = room.seats.findIndex((s, k) => s && s.bot && !(room.hand && !room.hand.done && P(room.hand, k)));
        if (i < 0) fail('full');
      }
      room.seats[i] = { uid, name: cleanName(name), bot: false, stack: room.settings.buyIn, sitOut: false, timeouts: 0 };
      touch(room); return { seat: i, cost: room.settings.buyIn };
    }
    /* vrací { refund } – žetony se vrací zpět do virtuálních bodů (žádný výběr peněz neexistuje) */
    function leave(room, uid) {
      const i = seatOf(room, uid); if (i < 0) return { refund: 0 };
      const h = room.hand;
      if (h && !h.done) { const p = P(h, i); if (p && !p.folded) { p.folded = true; log(h, i, 'fold', 0); if (h.toAct === i) h.toAct = -1; advance(room); } }
      const refund = room.seats[i].stack; room.seats[i] = null;
      if (room.host === uid) { const nh = humans(room)[0]; if (nh) room.host = nh.uid; }
      if (!humans(room).length) { room.status = 'closed'; room.hand = h && h.done ? h : null; }
      touch(room); return { refund };
    }
    function addBot(room, uid) {
      if (room.host !== uid) fail('not_host');
      const i = room.seats.findIndex(s => !s); if (i < 0) fail('full');
      room.botN = (room.botN || 0) + 1;
      const names = ['Bot Ada', 'Bot Bára', 'Bot Cyril', 'Bot Dan', 'Bot Ema', 'Bot Filip', 'Bot Gita', 'Bot Hugo', 'Bot Ivo'];
      room.seats[i] = { uid: null, name: names[(room.botN - 1) % names.length], bot: true, stack: room.settings.buyIn, sitOut: false, style: [0.1, 0, -0.08][room.botN % 3] };
      touch(room); return { seat: i };
    }
    function removeBot(room, uid, i) {
      if (room.host !== uid) fail('not_host');
      const s = room.seats[i]; if (!s || !s.bot) fail('bad_seat');
      if (room.hand && !room.hand.done && P(room.hand, i)) fail('in_hand');
      room.seats[i] = null; touch(room);
    }
    function rebuy(room, uid) {
      const i = seatOf(room, uid); if (i < 0) fail('not_seated');
      const s = room.seats[i]; if (s.stack >= room.settings.bb) fail('not_busted');
      if (room.hand && !room.hand.done && P(room.hand, i)) fail('in_hand');
      const cost = room.settings.buyIn - s.stack; s.stack = room.settings.buyIn; s.sitOut = false; s.timeouts = 0; touch(room); return { cost };
    }
    function sitIn(room, uid) { const i = seatOf(room, uid); if (i < 0) fail('not_seated'); room.seats[i].sitOut = false; room.seats[i].timeouts = 0; touch(room); }
    function start(room, uid) {
      if (room.host !== uid) fail('not_host');
      if (room.status !== 'lobby') fail('started');
      if (room.settings.bots) while (room.seats.some(s => !s)) addBot(room, uid);
      if (occupied(room).length < 2) fail('need_players');
      room.status = 'playing'; startHand(room); return {};
    }

    /* ---------- ruka ---------- */
    function startHand(room) {
      const st = room.settings;
      room.seats.forEach(s => { if (s && s.bot && s.stack < st.bb) s.stack = st.buyIn; });   // boti si dokoupí sami
      room.seats.forEach(s => { if (s && !s.bot && s.stack <= 0) s.sitOut = true; });
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
    function apply(room, i, a) {
      const h = room.hand, p = P(h, i), s = room.seats[i], L = legal(room, i);
      let t = String(a.t || a.type || ''); if (t === 'bet') t = 'raise';
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
      p.acted = true; if (!s.bot) s.timeouts = 0;
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
    function botDecide(room, i) {
      const h = room.hand, L = legal(room, i), hole = h.holes[i], st = room.seats[i].style || 0;
      const opp = h.players.filter(p => !p.folded && p.seat !== i).length;
      if (h.street === 0) {
        const c = PE.chen(hole[0], hole[1]) + st * 10 + (rng() - 0.5) * 2;
        if (c >= 11 && L.canRaise) return { t: 'raise', to: Math.min(L.maxTo, Math.max(L.minTo, h.curBet * 3)) };
        if (L.canCheck) return { t: 'check' };
        if (c >= 7 || (c >= 5 && L.toCall <= room.settings.bb)) return { t: 'call' };
        return { t: 'fold' };
      }
      const eq = PE.equity(hole, h.board, Array.from({ length: opp }, () => ({})), 250, rng).equity + st + (rng() - 0.5) * 0.1;
      const need = L.toCall / (L.pot + L.toCall || 1);
      if (L.canCheck) {
        if (eq > 0.62 && L.canRaise) return { t: 'raise', to: Math.min(L.maxTo, Math.max(L.minTo, Math.round(L.pot * 0.66))) };
        return { t: 'check' };
      }
      if (eq > 0.8 && L.canRaise) return { t: 'raise', to: Math.min(L.maxTo, Math.max(L.minTo, h.curBet * 3)) };
      if (eq > need + 0.04) return { t: 'call' };
      return { t: 'fold' };
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
        apply(room, i, { t: L.canCheck ? 'check' : 'fold' });
        if (s && !s.bot && ++s.timeouts >= MAX_TIMEOUTS) s.sitOut = true;
        ch = true;
      }
      if (room.status === 'playing' && (!room.hand || room.hand.done) && room.nextAt && now() >= room.nextAt) { startHand(room); ch = true; }
      if (room.status === 'playing' && room.waiting && !room.hand && occupied(room).filter(i => !room.seats[i].sitOut && room.seats[i].stack > 0).length >= 2) { startHand(room); ch = true; }
      if (ch) { runBots(room); touch(room); }
      return ch;
    }
    function next(room, uid) {                 // hostitel může rozdat hned (nečekat na odpočet)
      if (room.host !== uid) fail('not_host');
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
          dealer: h ? h.dealer === i : room.dealer === i, sb: h ? h.sb === i : false, bb: h ? h.bb === i : false,
          turn: !!(h && !h.done && h.toAct === i), cards, last: lastAct[i] ? { t: lastAct[i].t, a: lastAct[i].a, to: lastAct[i].to } : null };
      });
      const hostSeat = room.seats.find(s => s && !s.bot && s.uid === room.host);
      const out = { code: room.code, status: room.status, ver: room.ver, isHost: !!uid && room.host === uid, hostName: hostSeat ? hostSeat.name : '',
        settings: { max: room.settings.max, sb: room.settings.sb, bb: room.settings.bb, buyIn: room.settings.buyIn, buyInBB: room.settings.buyInBB, bots: room.settings.bots, turnMs: room.settings.turnMs },
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

    return { BLINDS, BUYIN_BB, CoreError, newCode, checkSettings, createRoom, join, leave, addBot, removeBot, rebuy, sitIn, start, next,
      act, legal, tick, runBots, view, privateCards, chips, seatOf, startHand };
  }

  const api = { makeCore, CoreError, BLINDS, BUYIN_BB, cryptoRandInt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RRCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
