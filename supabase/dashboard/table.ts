// @ts-nocheck
// Red River – Edge Function `table` (jeden soubor pro Dashboard editor). VYGENEROVÁNO: supabase/build-dashboard.sh – needitovat ručně.
import { createClient } from 'npm:@supabase/supabase-js@2';
// ===== engine.js (vyhodnocení rukou, equity) =====
/* Red River (poker trenér) – herní logika (karty, vyhodnocení, equity, doporučení, boti).
   Funguje v prohlížeči (window.PE) i v Node (module.exports). */
(function (root) {
  'use strict';
  const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const RCH = '23456789TJQKA';
  const SUITS = ['s','h','d','c'];
  const SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
  const rankOf = c => c >> 2, suitOf = c => c & 3;
  const cardStr = c => RCH[rankOf(c)] + SUITS[suitOf(c)];
  function parseCard(s) { return RCH.indexOf(s[0].toUpperCase()) * 4 + SUITS.indexOf(s[1].toLowerCase()); }
  const parseCards = s => (s.match(/[2-9TJQKA][shdc]/gi) || []).map(parseCard);

  /* ---------- 7karetní vyhodnocení: vyšší číslo = lepší ruka ---------- */
  /* texty přes i18n (window.I18N v prohlížeči, ./i18n.js v Node) */
  const I18 = root.I18N || (typeof require === 'function' ? require('./i18n.js') : null);
  const T = (k, p) => I18 ? I18.t(k, p) : k;
  const HAND_NAMES = { get length() { return 9; } };
  for (let i = 0; i < 9; i++) Object.defineProperty(HAND_NAMES, i, { get: () => T('hand.' + i), enumerable: true });
  function straightHigh(m) {
    m = (m << 1) | ((m >> 12) & 1);           // eso i jako nejnižší
    for (let h = 13; h >= 4; h--) if (((m >> (h - 4)) & 31) === 31) return h - 1;
    return -1;
  }
  function topBits(m, n, out) { for (let r = 12; r >= 0 && out.length < n; r--) if (m & (1 << r)) out.push(r); return out; }
  function score(cat, ks) { let s = cat; for (let i = 0; i < 5; i++) s = s * 16 + (ks[i] || 0); return s; }
  const rc = new Int8Array(13);
  function evaluate(cards) {
    rc.fill(0); const sm = [0,0,0,0], sc = [0,0,0,0]; let rm = 0;
    for (let i = 0; i < cards.length; i++) { const c = cards[i], r = c >> 2, s = c & 3; rc[r]++; sm[s] |= 1 << r; sc[s]++; rm |= 1 << r; }
    for (let s = 0; s < 4; s++) if (sc[s] >= 5) {
      const sh = straightHigh(sm[s]);
      if (sh >= 0) return score(8, [sh]);
      var flush = score(5, topBits(sm[s], 5, []));
    }
    let quad = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1, p3 = -1;
    for (let r = 12; r >= 0; r--) {
      const n = rc[r];
      if (n === 4) quad = r;
      else if (n === 3) { if (t1 < 0) t1 = r; else if (t2 < 0) t2 = r; }
      else if (n === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; else if (p3 < 0) p3 = r; }
    }
    if (quad >= 0) return score(7, [quad, topBits(rm & ~(1 << quad), 1, [])[0]]);
    if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) return score(6, [t1, Math.max(t2, p1)]);
    if (flush !== undefined) return flush;
    const sh = straightHigh(rm); if (sh >= 0) return score(4, [sh]);
    if (t1 >= 0) return score(3, [t1].concat(topBits(rm & ~(1 << t1), 2, [])));
    if (p2 >= 0) return score(2, [p1, p2, topBits(rm & ~(1 << p1) & ~(1 << p2), 1, [])[0]]);
    if (p1 >= 0) return score(1, [p1].concat(topBits(rm & ~(1 << p1), 3, [])));
    return score(0, topBits(rm, 5, []));
  }
  const handCategory = sc => Math.floor(sc / 1048576);
  const handName = cards => HAND_NAMES[handCategory(evaluate(cards))];

  /* ---------- Chenův vzorec (síla startovní ruky) ---------- */
  function chen(c1, c2) {
    let a = rankOf(c1), b = rankOf(c2); if (b > a) [a, b] = [b, a];
    const base = r => r === 12 ? 10 : r === 11 ? 8 : r === 10 ? 7 : r === 9 ? 6 : (r + 2) / 2;
    let s = base(a);
    if (a === b) return Math.max(5, Math.ceil(s * 2));
    if (suitOf(c1) === suitOf(c2)) s += 2;
    const gap = a - b - 1;
    s -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
    if (gap <= 1 && a < 10) s += 1;
    return Math.ceil(s);
  }
  function handLabel(c1, c2) {
    let a = rankOf(c1), b = rankOf(c2); if (b > a) [a, b] = [b, a];
    return RCH[a] + RCH[b] + (a === b ? '' : suitOf(c1) === suitOf(c2) ? 's' : 'o');
  }
  const CHEN = new Int8Array(52 * 52);
  for (let i = 0; i < 52; i++) for (let j = 0; j < 52; j++) if (i !== j) CHEN[i * 52 + j] = chen(i, j);

  /* ---------- Equity: Monte Carlo (soupeři s odhadovaným rozsahem) ----------
     opp: pole objektů {cards?: [c,c], minChen?: n}. Známé karty se použijí přímo. */
  function equity(hero, board, opps, iters, rng) {
    rng = rng || Math.random; iters = iters || 3000;
    const dead = new Uint8Array(52); hero.concat(board).forEach(c => dead[c] = 1);
    opps.forEach(o => o.cards && o.cards.forEach(c => dead[c] = 1));
    const base = []; for (let c = 0; c < 52; c++) if (!dead[c]) base.push(c);
    let win = 0, tie = 0, eq = 0;
    const deck = base.slice(), need = 5 - board.length;
    const all = new Array(7), oc = new Array(7);
    for (let it = 0; it < iters; it++) {
      let n = deck.length;
      const draw = () => { const k = (rng() * n) | 0, c = deck[k]; deck[k] = deck[n - 1]; deck[n - 1] = c; n--; return c; };
      const oh = [];
      for (let o = 0; o < opps.length; o++) {
        const op = opps[o];
        if (op.cards) { oh.push(op.cards); continue; }
        let a, b, tries = 0;
        for (;;) {
          a = draw(); b = draw();
          if (!op.minChen || CHEN[a * 52 + b] >= op.minChen || tries > 60) break;
          n += 2; tries++;                         // vrátit a táhnout znovu
        }
        oh.push([a, b]);
      }
      const bd = board.slice(); for (let i = 0; i < need; i++) bd.push(draw());
      for (let i = 0; i < 5; i++) all[i] = oc[i] = bd[i];
      all[5] = hero[0]; all[6] = hero[1];
      const hs = evaluate(all);
      let best = hs, cnt = 1, heroBest = true;
      for (let o = 0; o < oh.length; o++) {
        oc[5] = oh[o][0]; oc[6] = oh[o][1];
        const s = evaluate(oc);
        if (s > best) { best = s; heroBest = false; cnt = 1; }
        else if (s === best) cnt++;
      }
      if (heroBest && best === hs) { if (cnt === 1) { win++; eq += 1; } else { tie++; eq += 1 / cnt; } }
      
    }
    return { win: win / iters, tie: tie / iters, equity: eq / iters };
  }

  /* Přesný výpočet pro 2 známé ruce (všechny boardy) – pro testy */
  function exactHeadsUp(h1, h2, board) {
    board = board || [];
    const dead = new Uint8Array(52); h1.concat(h2, board).forEach(c => dead[c] = 1);
    const d = []; for (let c = 0; c < 52; c++) if (!dead[c]) d.push(c);
    const need = 5 - board.length; let w = 0, t = 0, tot = 0;
    const a = new Array(7), b = new Array(7);
    const rec = (start, picked) => {
      if (picked.length === need) {
        const bd = board.concat(picked);
        for (let i = 0; i < 5; i++) a[i] = b[i] = bd[i];
        a[5] = h1[0]; a[6] = h1[1]; b[5] = h2[0]; b[6] = h2[1];
        const x = evaluate(a), y = evaluate(b);
        if (x > y) w++; else if (x === y) t++; tot++; return;
      }
      for (let i = start; i < d.length; i++) { picked.push(d[i]); rec(i + 1, picked); picked.pop(); }
    };
    rec(0, []);
    return { win: w / tot, tie: t / tot, equity: (w + t / 2) / tot, boards: tot };
  }

  /* ---------- Doporučení tahu ----------
     ctx: {street, hole, board, pot, toCall, currentBet, myBet, stack, minRaiseTo, bb,
           position, numOpp, raisesThisStreet, facingRaise, eq, limpers, isPreflopAggressor} */
  const fmt = n => Math.round(n);
  const pct = x => Math.round(x * 100) + ' %';
  function clampTo(to, ctx) { return Math.max(ctx.minRaiseTo, Math.min(Math.round(to), ctx.stack + ctx.myBet)); }

  function recommend(ctx) {
    const allInTo = ctx.stack + ctx.myBet;
    // soupeř je all-in / sázka pokrývá celý náš stack → jen call nebo fold
    if (ctx.toCall > 0 && ctx.toCall >= ctx.stack) return recFacingAllIn(ctx);
    const r = ctx.street === 0 ? recPreflop(ctx) : recPostflop(ctx);
    // sázka, která by nechala méně než ~třetinu stacku, je prakticky all-in
    if ((r.action === 'raise' || r.action === 'bet') && r.to >= allInTo * 0.7) {
      r.to = allInTo; r.action = 'allin';
      r.why += ' ' + T('e.bigSize');
    }
    return r;
  }
  const bbs = (x, ctx) => Math.round(x / ctx.bb * 10) / 10;
  /* efektivní stack = menší z mého a největšího soupeřova (v žetonech) */
  const effOf = ctx => ctx.eff != null ? ctx.eff : ctx.stack + ctx.myBet;

  /* Pozice: od nejtěsnější (UTG) po nejvolnější (BTN). Hranice = minimální Chenovo skóre na otevření. */
  const OPEN_THR = { 'UTG': 10, 'UTG+1': 10, 'MP': 9, 'LJ': 9, 'HJ': 8, 'CO': 7, 'BTN': 6, 'SB': 7, 'BB': 9 };
  const PUSH_THR = { 'UTG': 10, 'UTG+1': 9, 'MP': 9, 'LJ': 8, 'HJ': 8, 'CO': 7, 'BTN': 6, 'SB': 5, 'BB': 7 };
  const EARLY = { 'UTG': 1, 'UTG+1': 1, 'MP': 1, 'LJ': 1 };

  function recFacingAllIn(ctx) {
    const need = ctx.toCall / (ctx.pot + ctx.toCall), eq = ctx.eq;
    const lab = handLabel(ctx.hole[0], ctx.hole[1]);
    const P = { call: fmt(ctx.toCall), pot: fmt(ctx.pot + ctx.toCall), need: pct(need), eq: pct(eq), lab: ctx.street === 0 ? ' ([[h:' + ctx.hole[0] + ',' + ctx.hole[1] + ']])' : '' };
    const base = T('e.ai.base', P) + ' ' + T('e.ai.eq', P);
    if (eq >= need + 0.02) return { action: 'call', alt: [], allinCall: true, why: base + ' ' + T('e.ai.call') };
    if (eq >= need - 0.03) return { action: 'call', alt: ['fold'], allinCall: true, why: base + ' ' + T('e.close') };
    return { action: 'fold', alt: [], why: base + ' ' + T('e.ai.fold') };
  }

  function recPreflop(ctx) {
    const c = chen(ctx.hole[0], ctx.hole[1]), lab = handLabel(ctx.hole[0], ctx.hole[1]);
    const pos = ctx.position, r = ctx.raisesThisStreet, bb = ctx.bb;
    const canCheck = ctx.toCall === 0, allInTo = ctx.stack + ctx.myBet;
    const effBB = effOf(ctx) / bb;
    const tag = T('e.tag', { lab: '[[h:' + ctx.hole[0] + ',' + ctx.hole[1] + ']]', c });
    const hu = ctx.numOpp === 1;
    const P = { tag, pos: '[[p:' + pos + ']]' };

    /* ---- krátký stack: push / fold (≤ 15 BB) ---- */
    if (effBB <= 15) {
      const adj = effBB <= 8 ? -2 : effBB <= 11 ? -1 : 0;
      P.sbb = `[[bb:${bbs(effOf(ctx), ctx)}]]`;
      if (r === 0) {
        P.thr = (hu ? (pos === 'BB' ? 7 : 4) : PUSH_THR[pos] || 7) + adj;
        if (c >= P.thr) return { action: 'allin', to: allInTo, alt: [], why: T('e.pf.push', P) };
        if (canCheck) return { action: 'check', alt: [], why: T('e.pf.pushCheck', P) };
        return { action: 'fold', alt: [], why: T('e.pf.pushFold', P) };
      }
      // proti navýšení s krátkým stackem: re-shove nebo fold
      P.thr = (pos === 'BB' ? 9 : 10) + adj + (r >= 2 ? 2 : 0);
      if (c >= P.thr || (r === 1 && lab === 'AKo')) return { action: 'allin', to: allInTo, alt: ['call'], why: T('e.pf.reshove', P) };
      return { action: 'fold', alt: [], why: T('e.pf.reshoveFold', P) };
    }

    if (r === 0) {
      P.thr = hu ? (pos === 'BB' ? 9 : 5) : (OPEN_THR[pos] || 8);
      if (c >= P.thr) {
        P.to = clampTo(3 * bb + (ctx.limpers || 0) * bb, ctx);
        return { action: canCheck ? 'bet' : 'raise', to: P.to, alt: [], why: T('e.pf.open', P) };
      }
      if (canCheck) return { action: 'check', alt: [], why: T('e.pf.bbCheck', P) };
      if (pos === 'SB' && hu && c >= 4) return { action: 'call', alt: ['fold'], why: T('e.pf.sbLimp', P) };
      return { action: 'fold', alt: [], why: T('e.pf.openFold', P) + (EARLY[pos] ? ' ' + T('e.pf.early') : '') + ' ' + T('e.pf.saves') };
    }
    // proti navýšení
    if (r === 1) {
      P.thr = pos === 'BB' ? 6 : EARLY[pos] ? 9 : 8;
      if (c >= 11 || lab === 'AKo') {
        P.to = clampTo(ctx.currentBet * 3, ctx);
        return { action: 'raise', to: P.to, alt: ['call', 'allin'], why: T('e.pf.3bet', P) };
      }
      P.call = fmt(ctx.toCall); P.share = pct(ctx.toCall / (ctx.pot + ctx.toCall));
      if (c >= P.thr) return { action: 'call', alt: ['fold'], why: T('e.pf.callRaise', P) };
      return { action: 'fold', alt: [], why: T('e.pf.foldRaise', P) };
    }
    // proti 3-betu a víc
    if (c >= 14) return { action: 'allin', to: allInTo, alt: ['raise', 'call'], why: T('e.pf.vs3allin', P) };
    if (c >= 11) return { action: 'call', alt: ['fold'], why: T('e.pf.vs3call', P) };
    return { action: 'fold', alt: [], why: T('e.pf.vs3fold', P) };
  }
  function recPostflop(ctx) {
    const eq = ctx.eq, n = Math.max(1, ctx.numOpp), fair = 1 / (n + 1);
    const strong = fair + (1 - fair) * 0.25, medium = fair + (1 - fair) * 0.05, raiseThr = fair + (1 - fair) * 0.42;
    const pot = ctx.pot, made = handName(ctx.hole.concat(ctx.board));
    const eqTxt = T('e.post.eq', { eq: pct(eq), made: made.toLowerCase() });
    const allInTo = ctx.stack + ctx.myBet;
    const spr = effOf(ctx) / Math.max(1, pot);
    const P = { eqTxt, fair: pct(fair), spr: spr.toFixed(1) };
    if (ctx.toCall === 0) {
      if (eq >= strong && spr <= 1.5) return { action: 'allin', to: allInTo, alt: ['bet'], why: T('e.post.jam', P) };
      if (eq >= strong) {
        P.to = clampTo(pot * 0.66, ctx);
        return { action: 'bet', to: P.to, alt: [], why: T('e.post.value', P) };
      }
      if (eq >= medium) {
        P.to = clampTo(pot * 0.4, ctx);
        return { action: 'bet', to: P.to, alt: ['check'], why: T('e.post.thin', P) };
      }
      return { action: 'check', alt: [], why: T('e.post.check', P) };
    }
    const need = ctx.toCall / (pot + ctx.toCall);
    P.odds = T('e.post.odds', { call: fmt(ctx.toCall), pot: fmt(pot + ctx.toCall), need: pct(need) });
    const leftAfterCall = ctx.stack - ctx.toCall;
    P.left = fmt(leftAfterCall);
    // po callu by zbylo málo → buď all-in (re-shove), nebo fold
    if (leftAfterCall <= (pot + 2 * ctx.toCall) * 0.5 && eq >= Math.max(need + 0.05, medium)) return { action: 'allin', to: allInTo, alt: ['call'], why: T('e.post.reshove', P) };
    if (eq >= raiseThr && ctx.stack > ctx.toCall) {
      P.to = clampTo(ctx.currentBet * 3, ctx);
      return { action: 'raise', to: P.to, alt: ['call', 'allin'], why: T('e.post.raise', P) };
    }
    if (eq >= need + 0.03) return { action: 'call', alt: eq >= strong ? ['raise'] : [], why: T('e.post.call', P) };
    if (eq >= need - 0.03) return { action: 'call', alt: ['fold'], why: `${eqTxt}. ${P.odds} ` + T('e.close') };
    return { action: 'fold', alt: [], why: T('e.post.fold', P) };
  }

  /* Hodnocení rozhodnutí hráče. Třídy: fold / passive (check, call) / aggr (bet, raise) / allin */
  const cls = a => a === 'fold' ? 'fold' : (a === 'check' || a === 'call') ? 'passive' : a === 'allin' ? 'allin' : 'aggr';
  function grade(rec, action, ctx) {
    const ev = ctx.toCall > 0 && ctx.eq != null ? ctx.eq * (ctx.pot + ctx.toCall) - ctx.toCall : null;
    const evTxt = ev != null && (ctx.street > 0 || ctx.toCall >= ctx.stack) ? ' ' + T('e.g.ev', { ev: (ev >= 0 ? '+' : '') + ev.toFixed(1) }) : '';
    const ca = cls(action), cr = cls(rec.action);
    const P = { rec: actName(rec.action), size: rec.to ? ' (' + rec.to + ')' : '' };
    if (ca === cr) return { level: 'good', title: T('g.good'), text: rec.why + evTxt };
    if (rec.alt.some(a => cls(a) === ca)) return { level: 'ok', title: T('g.ok'), text: T('e.g.was', P) + ' ' + rec.why + evTxt };
    // all-in vs. raise jsou si blízko, pokud je ruka silná
    if ((ca === 'allin' && cr === 'aggr') || (ca === 'aggr' && cr === 'allin'))
      return { level: 'ok', title: T('g.ok'), text: T('e.g.aggr', P) + ' ' + rec.why };
    let big = false;
    const need = ctx.toCall > 0 ? ctx.toCall / (ctx.pot + ctx.toCall) : 0;
    if (ctx.eq != null && ctx.toCall > 0 && (ctx.street > 0 || ctx.toCall >= ctx.stack))
      big = action === 'fold' ? ctx.eq - need > 0.12 : ca !== 'fold' && need - ctx.eq > 0.12;
    if (ca === 'allin' && cr !== 'aggr') big = big || (ctx.eq != null && ctx.eq < 1 / (ctx.numOpp + 1));   // all-in se slabou rukou
    if (cr === 'allin' && ca === 'fold') big = true;                                                        // fold místo pushe
    return { level: big ? 'bad' : 'meh', title: T(big ? 'g.bad' : 'g.meh'), text: T('e.g.better', P) + ' ' + rec.why + evTxt };
  }
  const actName = a => ({ fold: 'fold', check: 'check', call: 'call', bet: 'bet', raise: 'raise', allin: 'all-in' })[a] || a;

  /* Rozhodnutí bota: doporučení + šum + občasný bluf */
  function botDecide(ctx, style, rng) {
    rng = rng || Math.random;
    style = style || { loose: 0, aggr: 0, bluff: 0.08 };
    const c2 = Object.assign({}, ctx);
    if (ctx.street > 0) c2.eq = Math.max(0, Math.min(1, ctx.eq + (rng() - 0.5) * (style.noise != null ? style.noise : 0.12) + style.loose));
    let rec = recommend(c2);
    if (ctx.street === 0 && rec.action === 'fold' && rng() < (style.fish != null ? style.fish : 0.12) + style.loose) rec = { action: ctx.toCall ? 'call' : 'check' };
    if (ctx.street > 0 && ctx.toCall === 0 && rec.action === 'check' && rng() < style.bluff) rec = { action: 'bet', to: clampTo(ctx.pot * 0.5, ctx) };
    if ((rec.action === 'bet' || rec.action === 'raise') && rng() < 0.2 - style.aggr) rec = { action: ctx.toCall ? 'call' : 'check' };
    if (rec.action === 'allin' && ctx.street > 0 && rng() < 0.15) rec = { action: ctx.toCall ? 'call' : 'check' };
    return rec;
  }

  const api = { RANKS, RCH, SUITS, SUIT_SYM, rankOf, suitOf, cardStr, parseCard, parseCards, evaluate, handCategory,
    handName, HAND_NAMES, chen, handLabel, equity, exactHeadsUp, recommend, grade, botDecide, actName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PE = api;
})(typeof window !== 'undefined' ? window : globalThis);
// ===== online/core.js (autoritativní jádro) =====
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
// ===== server =====
// Red River – Edge Function `table`: autoritativní server online soukromých stolů.
// Klient posílá jen záměr ({ op, code, action }); server ověří uživatele (JWT), načte úplný stav
// z room_state (balíček + všechny karty), provede akci přes sdílené jádro (_shared/core.js – stejný kód
// jako mock v testech), uloží s optimistickým zámkem (version) a zveřejní jen bezpečné projekce:
//   rooms.public_state (bez cizích karet), seats, hole_cards (každý řádek vidí jen vlastník), hands (rozbor).
// Body jsou jen virtuální (profiles.points), buy-in se odečte, při odchodu se žetony vrátí. Žádný výběr peněz.

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
