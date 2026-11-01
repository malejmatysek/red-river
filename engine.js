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
    const P = { call: fmt(ctx.toCall), pot: fmt(ctx.pot + ctx.toCall), need: pct(need), eq: pct(eq), lab: ctx.street === 0 ? ' (' + lab + ')' : '' };
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
    const tag = T('e.tag', { lab, c });
    const hu = ctx.numOpp === 1;
    const P = { tag, pos };

    /* ---- krátký stack: push / fold (≤ 15 BB) ---- */
    if (effBB <= 15) {
      const adj = effBB <= 8 ? -2 : effBB <= 11 ? -1 : 0;
      P.sbb = `${bbs(effOf(ctx), ctx)} BB`;
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
