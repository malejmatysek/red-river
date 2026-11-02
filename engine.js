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
    const pf = {}, r = ctx.street === 0 ? recPreflop(ctx, pf) : recPostflop(ctx);
    if (ctx.street === 0 && pf.thr != null) { r.thr = pf.thr; r.chen = chen(ctx.hole[0], ctx.hole[1]); }
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

  function recPreflop(ctx, out) {
    const c = chen(ctx.hole[0], ctx.hole[1]), lab = handLabel(ctx.hole[0], ctx.hole[1]);
    const pos = ctx.position, r = ctx.raisesThisStreet, bb = ctx.bb;
    const canCheck = ctx.toCall === 0, allInTo = ctx.stack + ctx.myBet;
    const effBB = effOf(ctx) / bb;
    const tag = T('e.tag', { lab: '[[h:' + ctx.hole[0] + ',' + ctx.hole[1] + ']]', c });
    const hu = ctx.numOpp === 1;
    const P = Object.assign(out || {}, { tag, pos: '[[p:' + pos + ']]' });

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
    // blafování: dobrý blaf / semi-blaf, špatný blaf (dorovnávač, víc soupeřů), propásnutý blaf v tréninku blafů
    const bl = ctx.street > 0 && ctx.board && ctx.board.length >= 3 && ctx.hole ? bluffEval(ctx) : null;
    if (ca === cr) {
      if (bl && ctx.bluffDrill && cr === 'passive' && ctx.toCall === 0 && bl.weak && bl.s >= 3.5)
        return { level: 'ok', title: T('g.ok'), text: T('bf.missed', { why: bfWhy(bl.plus) }) + ' ' + rec.why };
      return { level: 'good', title: T('g.good'), text: rec.why + evTxt };
    }
    if (rec.alt.some(a => cls(a) === ca)) return { level: 'ok', title: T('g.ok'), text: T('e.g.was', P) + ' ' + rec.why + evTxt };
    if (bl && bl.weak && (ca === 'aggr' || ca === 'allin') && cr !== 'aggr' && cr !== 'allin') {
      const semi = bl.semi ? 'semi' : 'pure', o = bl.outs ? ' ' + T('bf.outs', { n: bl.outs }) : '';
      if (bl.bad) return { level: 'bad', title: T('g.badBluff'), text: T('bf.bad', { why: bfWhy(bl.minus) }) + ' ' + T('e.g.better', P) };
      if (bl.s >= 3.5) return { level: 'good', title: T('g.' + semi + 'Bluff'), text: T('bf.good', { why: bfWhy(bl.plus) }) + o };
      if (bl.s >= 2.5) return { level: 'ok', title: T('g.' + semi + 'BluffOk'), text: T('bf.ok', { why: bfWhy(bl.plus) }) + o + (bl.minus.length ? ' ' + T('bf.but', { why: bfWhy(bl.minus) }) : '') };
      return { level: 'meh', title: T('g.meh'), text: T('bf.weak', { why: bfWhy(bl.minus.length ? bl.minus : ['few']) }) + ' ' + T('e.g.better', P) + ' ' + rec.why };
    }
    // hraniční ruka preflop → jen „Šlo to líp“ s vysvětlením podle pozice
    if (ctx.street === 0 && rec.thr != null && rec.chen != null && Math.abs(rec.chen - rec.thr) <= 1 && ctx.toCall < ctx.stack && ca !== 'allin') {
      const pos = ctx.position, grp = EARLY[pos] ? 'early' : pos === 'HJ' ? 'mid' : pos === 'CO' || pos === 'BTN' ? 'late' : pos === 'SB' ? 'sb' : pos === 'BB' ? 'bb' : 'mid';
      return { level: 'meh', title: T('g.border'), text: T('bd.txt', { c: rec.chen, thr: rec.thr, pos: '[[p:' + pos + ']]' }) + ' ' + T('bd.' + grp) + ' ' + T('e.g.better', P) };
    }
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
  /* ---------- hodnocení blafu ---------- */
  function boardScare(board) {
    const sc = [0, 0, 0, 0]; board.forEach(c => sc[suitOf(c)]++);
    const flush = Math.max(...sc) >= 3, high = board.some(c => rankOf(c) >= 11);
    const rs = [...new Set(board.map(rankOf))].sort((a, b) => a - b);
    let conn = false; for (let i = 0; i + 2 < rs.length; i++) if (rs[i + 2] - rs[i] <= 4) conn = true;
    const last = board.length > 3 ? board[board.length - 1] : null, prev = board.slice(0, -1);
    const lastScare = last != null && ((rankOf(last) >= 10 && prev.every(c => rankOf(c) < rankOf(last))) || sc[suitOf(last)] === 3);
    return { flush, high, conn, lastScare, scary: flush || high || conn || lastScare };
  }
  /* Body pro blaf: agresor z preflopu, pozice, strašidelný board, tahy (semi-blaf), jeden soupeř, těsný soupeř;
     minus: víc soupeřů, dorovnávač, blaf-raise proti sázce. weak = ruka, která sází hlavně kvůli fold equity. */
  function bluffEval(ctx) {
    const d = ctx.street < 3 ? draws(ctx.hole, ctx.board) : { outs: 0, fd: false, sd: 0 };
    const semi = d.fd || d.sd >= 2 || d.outs >= 8, b = boardScare(ctx.board), n = ctx.numOpp || 1, arch = ctx.oppArch || [];
    const st = arch.filter(a => a === 'station').length, tight = arch.filter(a => a === 'rock' || a === 'tag').length;
    const plus = [], minus = []; let s = 0;
    if (ctx.pfAgg) { s++; plus.push('agg'); }
    if (ctx.ip) { s++; plus.push('ip'); }
    if (b.scary) { s++; plus.push(b.lastScare ? 'scare' : b.flush ? 'flush' : b.high ? 'high' : 'conn'); }
    if (semi) { const combo = d.fd && d.sd >= 2; s += combo ? 2 : 1; plus.push(combo ? 'combo' : d.fd ? 'fd' : 'sd'); }
    if (n === 1) { s++; plus.push('hu'); } else { s -= (n - 1) * 1.5; minus.push('multi'); }
    if (tight && !st) { s += 0.5; plus.push('tight'); }
    if (st) { s -= 3; minus.push('station'); }
    if (ctx.toCall > 0) { s -= semi ? 0.5 : 1.5; minus.push('raise'); }
    const weak = ctx.eq != null && (ctx.eq < 0.42 || (semi && ctx.eq < 0.55));
    const bad = st > 0 || n >= 3 || (n === 2 && !semi) || s < 0.5;
    return { s, semi, plus, minus, weak, bad, outs: ctx.street < 3 ? d.outs : 0 };
  }
  const bfWhy = ks => ks.map(k => T('bf.r.' + k)).join(', ');

  const actName = a => ({ fold: 'fold', check: 'check', call: 'call', bet: 'bet', raise: 'raise', allin: 'all-in' })[a] || a;

  /* Rozhodnutí bota: doporučení + šum + občasný bluf */
  /* ================= boti: lidský styl hry =================
     Každý bot má ARCHETYP (styl) a ÚROVEŇ (0 začátečník, 1 pokročilý, 2 profík).
     Styl určuje, jak volně hraje, jak často sází, blafuje, dorovnává, hraje pomalu (slowplay) a dělá check-raise.
     Úroveň určuje přesnost odhadu síly ruky (šum), počet chyb, míru blafování a jestli se přizpůsobuje hráči.
     Rozhodnutí jsou smíšená (náhodná s váhami) → bot není čitelný ani se stejnými kartami. */
  const ARCH = {
    rock:    { tight: 1.5, aggr: 0.45, bluff: 0.04, sticky: -0.04, slow: 0.15, cr: 0.10, semi: 0.25, three: 0.02, limp: 0.10 },
    tag:     { tight: 0,  aggr: 0.75, bluff: 0.12, sticky: 0.00,  slow: 0.12, cr: 0.18, semi: 0.55, three: 0.08, limp: 0.04 },
    lag:     { tight: -1.8, aggr: 0.85, bluff: 0.20, sticky: 0.02,  slow: 0.08, cr: 0.22, semi: 0.65, three: 0.15, limp: 0.05 },
    maniac:  { tight: -3, aggr: 0.95, bluff: 0.34, sticky: 0.04,  slow: 0.05, cr: 0.25, semi: 0.75, three: 0.26, limp: 0.10 },
    station: { tight: -3, aggr: 0.25, bluff: 0.04, sticky: 0.12,  slow: 0.30, cr: 0.05, semi: 0.15, three: 0.02, limp: 0.60 }
  };
  const ARCH_W = [   // pravděpodobnost stylů podle úrovně (začátečnický stůl je „rybí“, profíci hrají hlavně tight/loose-agresivně)
    { station: 3, rock: 2, maniac: 1, lag: 1, tag: 1 },
    { station: 2, rock: 1, maniac: 1, lag: 2, tag: 2 },
    { station: 1, rock: 1, maniac: 1, lag: 2, tag: 3 }];
  const SKILL = [   // šum v odhadu equity, chyby, násobek blafů, váha přizpůsobení hráči
    { noise: 0.16, mistake: 0.14, bluffX: 0.35, adapt: 0 },
    { noise: 0.08, mistake: 0.06, bluffX: 0.80, adapt: 0.5 },
    { noise: 0.03, mistake: 0.015, bluffX: 1.00, adapt: 1 }];
  function pickW(w, rng) { let s = 0; for (const k in w) s += w[k]; let r = rng() * s; for (const k in w) { r -= w[k]; if (r < 0) return k; } return Object.keys(w)[0]; }
  /* nový bot: { arch, skill, ...parametry s malým rozptylem } */
  function makeBot(skill, rng, arch) {
    rng = rng || Math.random; skill = Math.max(0, Math.min(2, skill | 0));
    arch = ARCH[arch] ? arch : pickW(ARCH_W[skill], rng);
    const a = ARCH[arch], j = x => (rng() * 2 - 1) * x;
    return { arch, skill, tight: a.tight + j(0.5), aggr: clamp01(a.aggr + j(0.06)), bluff: Math.max(0.01, a.bluff + j(0.03)), sticky: a.sticky + j(0.015),
      slow: clamp01(a.slow + j(0.04)), cr: clamp01(a.cr + j(0.04)), semi: clamp01(a.semi + j(0.08)), three: clamp01(a.three + j(0.03)), limp: clamp01(a.limp + j(0.05)) };
  }
  const clamp01 = x => Math.max(0, Math.min(1, x));
  /* starý formát stylu (loose/aggr/bluff…) → nový bot */
  function botOf(style, rng) {
    if (style && style.arch && ARCH[style.arch]) return style;
    const s = style || {}, skill = s.noise != null ? (s.noise >= 0.2 ? 0 : s.noise >= 0.09 ? 1 : 2) : 1;
    const arch = (s.loose || 0) > 0.05 ? 'station' : (s.aggr || 0) > 0.08 ? 'lag' : (s.loose || 0) < -0.02 ? 'rock' : 'tag';
    return makeBot(skill, rng || Math.random, arch);
  }
  const POS = { 2: ['BTN', 'BB'], 3: ['BTN', 'SB', 'BB'], 4: ['BTN', 'SB', 'BB', 'CO'], 5: ['BTN', 'SB', 'BB', 'HJ', 'CO'],
    6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'], 7: ['BTN', 'SB', 'BB', 'UTG', 'LJ', 'HJ', 'CO'],
    8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'LJ', 'HJ', 'CO'], 9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO'] };
  const posName = (off, n) => (POS[Math.max(2, Math.min(9, n))] || POS[6])[off] || 'MP';
  /* tahy na flush / postupku (jen z vlastních karet + boardu) */
  function draws(hole, board) {
    if (board.length < 3 || board.length > 4) return { outs: 0, fd: false, sd: 0 };
    const all = hole.concat(board), sc = [0, 0, 0, 0]; all.forEach(c => sc[suitOf(c)]++);
    let fd = false; for (let s = 0; s < 4; s++) if (sc[s] === 4 && hole.some(c => suitOf(c) === s)) fd = true;
    let m = 0; all.forEach(c => { m |= 1 << rankOf(c); });
    const straight = mm => { const x = (mm << 1) | ((mm >> 12) & 1); for (let lo = 0; lo <= 9; lo++) if (((x >> lo) & 31) === 31) return true; return false; };
    let sdR = 0; for (let r = 0; r < 13; r++) if (!(m & (1 << r)) && straight(m | (1 << r))) sdR++;
    let sd = sdR >= 2 ? 2 : sdR;
    if (handCategory(evaluate(all)) >= 4) sd = 0;   // postupka už je
    const outs = (fd ? 9 : 0) + (sd === 2 ? 8 : sd === 1 ? 4 : 0) - (fd && sd ? 2 : 0);
    return { outs, fd, sd };
  }
  /* síla ruky jen z vlastních karet a boardu (pro ukazatel u hráče): 0..1 + stupeň 0–4 (slabá … monstrum) */
  function strength(hole, board, iters, rng) {
    let v;
    if (board.length < 3) { const c = chen(hole[0], hole[1]); v = Math.max(0, Math.min(1, (c - 1) / 19)); }
    else v = equity(hole, board, [{}], iters || 400, rng).equity;
    const tier = board.length < 3 ? (v >= 0.72 ? 4 : v >= 0.5 ? 3 : v >= 0.36 ? 2 : v >= 0.22 ? 1 : 0)
      : (v >= 0.88 ? 4 : v >= 0.72 ? 3 : v >= 0.56 ? 2 : v >= 0.4 ? 1 : 0);
    return { v, tier };
  }
  /* čtení hráče: { n: rozdané ruce, vp: dobrovolně do hrnce, fb: čelil sázce po flopu, ff: z toho fold, ag: agresivní akce, pa: pasivní akce } */
  function readAdj(read, w) {
    const R = { fold: 1, thin: 0, sticky: 0, steal: 1 };
    if (!read || !w || !(read.n >= 6)) return R;
    const k = w * Math.min(1, read.n / 15);
    if (read.fb >= 4) { const ftb = read.ff / read.fb; R.fold = 1 + k * Math.max(-0.7, Math.min(1, (ftb - 0.45) * 2.5)); if (ftb < 0.35) R.thin = k * 0.25; }
    const acts = (read.ag || 0) + (read.pa || 0); if (acts >= 6) { const af = read.ag / acts; R.sticky = k * Math.max(-0.03, Math.min(0.08, (af - 0.35) * 0.25)); }
    const vp = read.vp / read.n; if (vp < 0.2) R.steal = 1 + k; else if (vp > 0.5) R.steal = 1 - 0.5 * k;
    return R;
  }
  const BIG = { BTN: 1.5, CO: 1, HJ: 0.5, SB: 0.3, BB: 0 };
  /* rozhodnutí bota. ctx = jako pro recommend (+ volitelně pfAgg, checked, ip, read). Vrací { action, to }. */
  function botDecide(ctx, style, rng) {
    rng = rng || Math.random;
    const b = botOf(style, rng), S = SKILL[b.skill], R = readAdj(ctx.read, S.adapt);
    const allInTo = ctx.stack + ctx.myBet, bb = ctx.bb || 2, n = Math.max(1, ctx.numOpp || 1);
    const chance = p => rng() < p;
    const sizeTo = to => { to = clampTo(to, ctx); return to >= allInTo * 0.7 ? { action: 'allin', to: allInTo } : null; };
    const bet = frac => { const to = ctx.myBet + Math.max(bb, ctx.pot * frac); return sizeTo(to) || { action: ctx.currentBet > 0 ? 'raise' : 'bet', to: clampTo(to, ctx) }; };
    const raise = mult => { const to = ctx.currentBet * mult + (ctx.street > 0 ? ctx.pot * 0.15 : 0); return sizeTo(to) || { action: 'raise', to: clampTo(to, ctx) }; };
    const passive = () => ({ action: ctx.toCall ? 'call' : 'check' });
    const fold = () => (ctx.toCall ? { action: 'fold' } : { action: 'check' });
    const canRaise = ctx.stack > ctx.toCall;
    // soupeř nás dává all-in → jen call / fold podle šancí (začátečník víc „věří“ ruce)
    if (ctx.toCall > 0 && ctx.toCall >= ctx.stack) {
      const need = ctx.toCall / (ctx.pot + ctx.toCall);
      const eq = ctx.street === 0 ? ctx.eq : ctx.eq + (rng() - 0.5) * S.noise;
      return eq + b.sticky + R.sticky - (b.skill === 0 ? 0.05 : 0) >= need ? { action: 'call' } : chance(S.mistake) ? { action: 'call' } : { action: 'fold' };
    }
    /* ---------------- preflop ---------------- */
    if (ctx.street === 0) {
      const effBB = (ctx.eff != null ? ctx.eff : allInTo) / bb, pos = ctx.position || 'MP';
      if (effBB <= 15 && b.skill > 0) {                // krátký stack: push/fold tabulka + styl
        const r = recommend(Object.assign({}, ctx, { hole: ctx.hole }));
        if (r.action === 'fold' && chance(b.bluff * S.bluffX * 0.6 * R.steal)) return { action: 'allin', to: allInTo };
        if (r.action !== 'fold' && b.arch === 'rock' && chance(0.2)) return fold();
        return r.action === 'allin' || r.action === 'raise' || r.action === 'bet' ? { action: r.action, to: r.to } : r.action === 'fold' ? fold() : passive();
      }
      const c = chen(ctx.hole[0], ctx.hole[1]) - b.tight + (BIG[pos] || -0.5) + (rng() - 0.5) * S.noise * 12;
      const r = ctx.raisesThisStreet || 0;
      if (r === 0) {
        const thr = OPEN_THR[pos] || 9, limpers = ctx.limpers || 0;
        if (c >= thr) {
          if (c >= 15 && chance(b.slow * 0.35)) return passive();                       // slowplay esa (limp / jen check)
          if (c < thr + 3 && chance(b.limp)) return passive();                          // pasivní styl: limp
          const to = bb * (2.5 + rng()) + limpers * bb;
          return sizeTo(to) || { action: 'raise', to: clampTo(to, ctx) };
        }
        if ((pos === 'BTN' || pos === 'CO' || pos === 'SB') && !limpers && chance(b.bluff * 1.4 * S.bluffX * R.steal))   // krádež blindů
          return sizeTo(bb * 2.5) || { action: 'raise', to: clampTo(bb * 2.5, ctx) };
        if (!ctx.toCall) return { action: 'check' };
        if (c >= thr - 2.5 && chance(b.limp + 0.15)) return { action: 'call' };
        return chance(S.mistake * (b.arch === 'station' ? 3 : 1)) ? { action: 'call' } : { action: 'fold' };
      }
      const price = ctx.toCall / bb, ip = pos === 'BTN' || pos === 'CO';
      if (r === 1) {
        const v3 = 12.5 + b.tight * 0.5;
        if (c >= v3) return chance(b.slow * 0.5) ? { action: 'call' } : raise(ip ? 3 : 3.6);
        if (c >= 7 && c < v3 && canRaise && chance(b.three * S.bluffX * R.steal)) return raise(ip ? 3 : 3.6);   // lehký 3-bet (blaf)
        const callThr = 9 + b.tight * 0.5 - b.sticky * 15 - (pos === 'BB' ? 1.5 : 0) + (price > 6 ? 1.5 : 0);
        if (c >= callThr) return { action: 'call' };
        return chance(S.mistake * 1.5) ? { action: 'call' } : fold();
      }
      if (c >= 15 + b.tight * 0.3) return effBB < 40 || chance(0.4) ? { action: 'allin', to: allInTo } : raise(2.3);
      if (c >= 12 + b.tight * 0.5 - b.sticky * 10) return { action: 'call' };
      if (canRaise && chance(b.three * 0.25 * S.bluffX)) return raise(2.3);
      return fold();
    }
    /* ---------------- po flopu ---------------- */
    const fair = 1 / (n + 1), eq = Math.max(0, Math.min(1, ctx.eq + (rng() - 0.5) * S.noise));
    const rel = (eq - fair) / (1 - fair);                       // 0 = průměr, 1 = jistota
    const dr = ctx.street < 3 ? draws(ctx.hole, ctx.board) : { outs: 0 };
    const bluffP = p => p * S.bluffX * R.fold * (n === 1 ? 1 : n === 2 ? 0.55 : 0.25) * (ctx.ip ? 1.15 : 1);
    if (ctx.toCall === 0) {
      if (rel > 0.62) {
        const monster = rel > 0.82;
        if (monster && ctx.street < 3 && chance(b.slow + (b.cr * 0.5))) return { action: 'check' };   // slowplay / past na check-raise
        if (!ctx.ip && n <= 2 && chance(b.cr * 0.8)) return { action: 'check' };                      // silná ruka mimo pozici: check s plánem check-raise
        if (chance(0.55 + 0.45 * b.aggr)) return bet((monster ? 0.66 : 0.5) + rng() * 0.25 + R.thin * 0.6);
        return { action: 'check' };
      }
      if (rel > 0.25) {
        if (ctx.pfAgg && ctx.street === 1 && chance(0.45 + 0.35 * b.aggr)) return bet(0.33 + rng() * 0.2);   // c-bet
        if (chance(0.25 * b.aggr + R.thin)) return bet(0.33 + rng() * 0.25);                                 // tenká hodnota / ochrana
        return { action: 'check' };
      }
      if (dr.outs >= 8 && chance(b.semi * S.bluffX * (n === 1 ? 1 : 0.6))) return bet(0.5 + rng() * 0.25);   // semi-blaf
      if (dr.outs >= 4 && chance(b.semi * 0.4 * S.bluffX)) return bet(0.4 + rng() * 0.2);
      if (ctx.pfAgg && ctx.street === 1 && chance(bluffP(0.35 + 0.4 * b.aggr))) return bet(0.33 + rng() * 0.2);  // c-bet blaf
      if (chance(bluffP(b.bluff * (ctx.street === 3 ? 1.3 : 1)))) return bet(0.5 + rng() * 0.3);               // čistý blaf
      return { action: 'check' };
    }
    const need = ctx.toCall / (ctx.pot + ctx.toCall), crBonus = ctx.checked ? b.cr * 2 : 0;
    if (rel > 0.8 && canRaise) {
      if (chance((ctx.checked ? 0.25 : 0.3 + 0.4 * b.aggr) + crBonus) && chance(1 - b.slow * 0.5)) return raise(2.5 + rng() * 0.6);   // (check-)raise
      return { action: 'call' };                                                                                                         // slowplay
    }
    if (rel > 0.55) { if (canRaise && chance(0.12 * b.aggr + (ctx.checked ? b.cr * 0.6 : 0))) return raise(2.5 + rng() * 0.5); return { action: 'call' }; }
    const implied = dr.outs >= 8 ? 0.07 : dr.outs >= 4 ? 0.025 : 0;
    const callEq = eq + b.sticky + R.sticky + implied + (b.skill === 0 ? (rel > 0 ? 0.08 : 0) : 0);   // začátečník přehlíží pot odds
    if (dr.outs >= 8 && canRaise && chance(b.semi * 0.3 * S.bluffX * (ctx.checked ? 1.5 : 1))) return raise(2.5 + rng() * 0.5);   // semi-blaf raise
    if (callEq >= need + (b.skill === 2 ? 0.01 : 0.03)) return chance(S.mistake * 0.5) ? { action: 'fold' } : { action: 'call' };
    if (canRaise && n === 1 && chance(bluffP(b.bluff * 0.22))) return raise(2.6 + rng() * 0.6);                        // blaf raise
    return chance(S.mistake) ? { action: 'call' } : { action: 'fold' };
  }
  /* čtení hráče: zápis jedné akce (street, typ, čelil sázce) */
  function readNote(read, street, action, facing, voluntary) {
    if (!read) return;
    if (street === 0) { if (voluntary && (action === 'call' || action === 'raise' || action === 'bet' || action === 'allin')) read.vpH = 1; return; }
    if (facing) { read.fb = (read.fb || 0) + 1; if (action === 'fold') read.ff = (read.ff || 0) + 1; }
    if (action === 'bet' || action === 'raise' || action === 'allin') read.ag = (read.ag || 0) + 1; else if (action === 'call' || action === 'check') read.pa = (read.pa || 0) + 1;
  }
  function readHand(read) { if (!read) return; read.n = (read.n || 0) + 1; if (read.vpH) read.vp = (read.vp || 0) + 1; read.vpH = 0; }

  const api = { RANKS, RCH, SUITS, SUIT_SYM, rankOf, suitOf, cardStr, parseCard, parseCards, evaluate, handCategory,
    handName, HAND_NAMES, chen, handLabel, equity, exactHeadsUp, recommend, grade, botDecide, actName, makeBot, botOf, draws, strength, posName, readNote, readHand, ARCH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PE = api;
})(typeof window !== 'undefined' ? window : globalThis);
