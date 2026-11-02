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
      if (bl.s >= 3.5) return { level: 'good', bluff: true, title: T('g.' + semi + 'Bluff'), text: T('bf.good', { why: bfWhy(bl.plus) }) + o };
      if (bl.s >= 2.5) return { level: 'ok', bluff: true, title: T('g.' + semi + 'BluffOk'), text: T('bf.ok', { why: bfWhy(bl.plus) }) + o + (bl.minus.length ? ' ' + T('bf.but', { why: bfWhy(bl.minus) }) : '') };
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
    // „slabá“ = bez hotové ruky (síla proti 3 náhodným rukám, deterministicky podle karet) – top pár a lepší už je hodnotová sázka, ne blaf
    let seed = 7; ctx.hole.concat(ctx.board).forEach(c => { seed = (seed * 53 + c + 1) >>> 0; });
    const srng = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const sv = strength(ctx.hole, ctx.board, 600, srng).v;
    const weak = sv < 0.42 || (semi && sv < 0.6);
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
    else v = equity(hole, board, [{}, {}, {}], iters || 400, rng).equity;   // proti 3 náhodným rukám → vysoká karta = slabá, top pár = silná
    const tier = board.length < 3 ? (v >= 0.72 ? 4 : v >= 0.5 ? 3 : v >= 0.36 ? 2 : v >= 0.22 ? 1 : 0)
      : (v >= 0.8 ? 4 : v >= 0.58 ? 3 : v >= 0.42 ? 2 : v >= 0.25 ? 1 : 0);
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
// ===== server =====
// Red River – Edge Function `table`: autoritativní server online stolů (soukromé s kódem RED-1234 + veřejné PUB-XXXXXX).
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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
}
class HttpErr extends Error { constructor(public code: string, public status = 400) { super(code); } }
const CODE_RE = /^(RED-\d{4}|PUB-[A-Z0-9]{6})$/;
const HEARTBEAT_MS = 60e3, FRESH_MS = 3 * 60e3;               // veřejný stůl je „živý“, pokud se ho někdo dotkl za poslední 3 min

// ---------- limity požadavků (tabulka rate_limits + funkce rr_hit z migrace public_tables) ----------
const LIMITS: Record<string, [number, number]> = { all: [240, 60], quickseat: [12, 60], report: [5, 600] };
async function limit(uid: string, bucket: string) {
  const [max, win] = LIMITS[bucket];
  const { data, error } = await admin.rpc('rr_hit', { uid, bucket, max_hits: max, window_secs: win });
  if (error) { console.warn('rr_hit', error.message); return; }   // migrace ještě nespuštěná → nepřekážet soukromým stolům
  if (data === false) throw new HttpErr('rate', 429);
}

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
  const base = { status: room.status, host: room.host, public_state: core.view(room, null), version: room.ver, updated_at: new Date(Date.now()).toISOString() };
  // deno-lint-ignore no-explicit-any
  const seats = room.seats.map((s: any, i: number) => s && { room_id: roomId, seat_no: i, user_id: s.bot ? null : s.uid, is_bot: !!s.bot, name: s.name, stack: s.stack, sit_out: !!s.sitOut }).filter(Boolean);
  // deno-lint-ignore no-explicit-any
  const holes = core.privateCards(room).map((p: any) => ({ room_id: roomId, hand_no: p.hand, user_id: p.uid, cards: p.cards }));
  // zápisy běží souběžně (dřív 6 dotazů za sebou); rooms se nepřepíše starší verzí (.lte version)
  await Promise.all([
    (async () => {
      const { error } = await admin.from('rooms').update({ ...base, is_public: core.isPub(room), tier: room.settings.tier ?? null, seated: core.humans(room).length }).eq('id', roomId).lte('version', room.ver);
      if (error) await admin.from('rooms').update(base).eq('id', roomId).lte('version', room.ver);   // sloupce is_public/tier/seated chybí (stará databáze)
    })(),
    (async () => { await admin.from('seats').delete().eq('room_id', roomId); if (seats.length) await admin.from('seats').insert(seats); })(),
    holes.length ? admin.from('hole_cards').upsert(holes, { onConflict: 'room_id,hand_no,user_id', ignoreDuplicates: true }) : null,
    room.handNo > 30 ? admin.from('hole_cards').delete().eq('room_id', roomId).lt('hand_no', room.handNo - 30) : null,
    room.last ? admin.from('hands').upsert({ room_id: roomId, hand_no: room.last.no, review: room.last }, { onConflict: 'room_id,hand_no', ignoreDuplicates: true }) : null,
  ]);
}

// ---------- práce na pozadí (po odeslání odpovědi) ----------
// EdgeRuntime.waitUntil nechá funkci doběhnout i po vrácení odpovědi. Zápisy projekcí (rooms/seats/hole_cards/hands)
// jednoho stolu jdou v rámci instance za sebou (fronta), aby se starší zápis nepředběhl novějším.
// Bez EdgeRuntime (testy, starší runtime) se čeká normálně.
// deno-lint-ignore no-explicit-any
const ER = (globalThis as any).EdgeRuntime;
const pubQueue = new Map<string, Promise<unknown>>();
// deno-lint-ignore no-explicit-any
function publishQueued(roomId: string, room: any): Promise<unknown> {
  const prev = pubQueue.get(roomId) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(() => publish(roomId, room)).catch((e) => console.warn('publish', e));
  pubQueue.set(roomId, next);
  next.finally(() => { if (pubQueue.get(roomId) === next) pubQueue.delete(roomId); });
  return next;
}
function background(p: Promise<unknown>): Promise<unknown> {
  if (ER?.waitUntil) { try { ER.waitUntil(p); return Promise.resolve(); } catch (_) { /* fallback: čekat */ } }
  return p;
}

// ---------- okamžité doručení hráčům (Realtime Broadcast, soukromý kanál rr-u-<uid>) ----------
// Každý člověk u stolu dostane SVŮJ pohled (jen své karty) hned po uložení – bez čekání na postgres_changes
// a bez dalšího dotazu 'state'. Kanál je privátní: číst smí jen vlastník (politika na realtime.messages),
// posílat jen server (klienti nemají insert politiku) → podvržení stavu není možné.
// deno-lint-ignore no-explicit-any
async function push(roomId: string, room: any) {
  // deno-lint-ignore no-explicit-any
  const messages = core.humans(room).filter((s: any) => s.uid).map((s: any) => ({ topic: 'rr-u-' + s.uid, event: 'view', private: true, payload: { roomId, view: core.view(room, s.uid) } }));
  if (!messages.length) return;
  const headers: Record<string, string> = { apikey: SERVICE_KEY, 'Content-Type': 'application/json' };
  if (SERVICE_KEY.startsWith('eyJ')) headers.Authorization = 'Bearer ' + SERVICE_KEY;     // legacy service_role JWT
  try {
    const r = await fetch(SUPABASE_URL + '/realtime/v1/api/broadcast', { method: 'POST', headers, body: JSON.stringify({ messages }) });
    if (!r.ok) console.warn('broadcast', r.status, (await r.text()).slice(0, 200));
  } catch (e) { console.warn('broadcast', e); }
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
      const [, , pts] = await Promise.all([publishQueued(r.id, room), push(r.id, room), points(uid)]);
      return { view: core.view(room, uid), roomId: r.id, points: pts };
    }
    throw new HttpErr('no_code', 500);
  } catch (e) { await credit(uid, st.buyIn, 'refund'); throw e; }
}

// ---------- všechny ostatní operace nad existujícím stolem ----------
// deno-lint-ignore no-explicit-any
async function mutate(uid: string, op: string, body: any, lim?: Promise<unknown>) {
  let code = String(body.code ?? '').toUpperCase().trim();
  if (!CODE_RE.test(code)) {                                   // bez kódu: poslední stůl, kde hráč sedí
    const { data } = await admin.from('seats').select('room_id, rooms!inner(code, status)').eq('user_id', uid).neq('rooms.status', 'closed').limit(1);
    // deno-lint-ignore no-explicit-any
    code = (data?.[0] as any)?.rooms?.code ?? '';
    if (!code) throw new HttpErr('no_room', 404);
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    // jeden dotaz místo dvou: rooms + vnořený room_state (1:1 přes room_id)
    const { data: r } = await admin.from('rooms').select('id, updated_at, room_state(state, version)').eq('code', code).maybeSingle();
    if (!r) throw new HttpErr('no_room', 404);
    // deno-lint-ignore no-explicit-any
    const st = (Array.isArray(r.room_state) ? r.room_state[0] : r.room_state) as any;
    if (!st) throw new HttpErr('no_room', 404);
    const room = st.state;
    if (lim) { await lim; lim = undefined; }                    // limit požadavků běžel souběžně s načtením; před změnou musí projít
    let debited = 0, debitWhy = '', refund = 0, changed = true;
    // deno-lint-ignore no-explicit-any
    let reaped: any[] = [];
    try {
      if (core.isPub(room)) { reaped = core.reap(room); if (reaped.length && op === 'state') changed = true; }
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
        case 'tick': case 'state': changed = core.tick(room) || reaped.length > 0; break;   // časovač posouvá kdokoli ze stolu
        default: throw new HttpErr('bad_op');
      }
      if (op !== 'join' && op !== 'state' && core.seatOf(room, uid) < 0 && op !== 'leave') throw new HttpErr('not_seated', 403);
      if (op === 'state' && core.seatOf(room, uid) < 0) throw new HttpErr('not_seated', 403);
      if (changed) {
        core.runBots(room);
        const { data: upd } = await admin.from('room_state').update({ state: room, version: st.version + 1 }).eq('room_id', r.id).eq('version', st.version).select('room_id');
        if (!upd?.length) { if (debited) await credit(uid, debited, 'refund', r.id); continue; }   // souběh → znovu
        // stav je uložený (autoritativní) → hned rozeslat pohledy hráčům; vrácení bodů a projekce běží souběžně.
        // U tahů (act/next/tick…) se na projekce nečeká (doběhnou na pozadí, ve frontě stolu) – klienti stav mají z broadcastu
        // a 'state' čte room_state. U změn sezení/bodů (join/leave/rebuy/sitIn, vyhazov, zavření) se čeká: z tabulek seats/rooms
        // čte quickseat a lobby.
        const seatsChange = op === 'join' || op === 'leave' || op === 'rebuy' || op === 'sitIn' || reaped.length > 0 || room.status === 'closed' || op === 'addBot' || op === 'removeBot' || op === 'start';
        const pub = publishQueued(r.id, room);
        await Promise.all([
          push(r.id, room),
          (async () => {
            if (refund) await credit(uid, refund, 'cashback', r.id);
            await Promise.all(reaped.map((x) => credit(x.uid, x.refund, 'cashback', r.id)));   // zvednutí od veřejného stolu (odpojení / nečinnost)
          })(),
          seatsChange ? pub : background(pub),
        ]);
      } else if (core.isPub(room) && room.status !== 'closed' && Date.now() - Date.parse(r.updated_at ?? '') > HEARTBEAT_MS) {
        // srdeční tep: čekající hráč u veřejného stolu (bez změny stavu) drží stůl „živý“ → najdou ho další hráči
        // a úklid (sweep) ho nezavře. Dřív stůl bez tahu po 10 min z výběru zmizel → kamarád dostal nový stůl.
        await admin.from('rooms').update({ updated_at: new Date(Date.now()).toISOString() }).eq('id', r.id);
      }
      const money = op === 'join' || op === 'leave' || op === 'rebuy';     // body jen tam, kde se mění (ušetří dotaz)
      return { view: core.view(room, uid), roomId: r.id, ...(money ? { points: await points(uid) } : {}) };
    } catch (e) {
      if (debited) await credit(uid, debited, 'refund', r.id);
      // deno-lint-ignore no-explicit-any
      const c = (e as any).code; if (c && !(e instanceof HttpErr)) throw new HttpErr(c);   // chyby jádra (not_your_turn…)
      throw e;
    }
  }
  throw new HttpErr('busy', 409);
}

// ---------- veřejné stoly ----------
// rychlé usazení: hráč už sedí u veřejného stolu → vrátí ho tam; jinak najde otevřený stůl dané úrovně
// (nejplnější, nedávno aktivní, < 6 lidí) nebo založí nový. Buy-in se odečte na serveru (debit_points).
// deno-lint-ignore no-explicit-any
async function quickseat(uid: string, body: any) {
  await limit(uid, 'quickseat');
  // deno-lint-ignore no-explicit-any
  const T = core.TIERS.find((x: any) => x.id === String(body.tier ?? ''));
  if (!T) throw new HttpErr('bad_tier');
  if (core.badName(body.name)) throw new HttpErr('bad_name');
  const { data: mine } = await admin.from('seats').select('room_id, rooms!inner(code, status, is_public, tier)').eq('user_id', uid).eq('rooms.is_public', true).neq('rooms.status', 'closed').limit(3);
  // deno-lint-ignore no-explicit-any
  for (const m of (mine ?? []) as any[]) {
    if (m.rooms?.tier === T.id) return await mutate(uid, 'state', { code: m.rooms.code });
    // sedí u jiné úrovně (např. zapomenutý stůl) → zvednout (žetony zpět) a usadit podle volby
    try { await mutate(uid, 'leave', { code: m.rooms.code }); } catch (e) { console.warn('qs leave', e); }
  }
  if (await points(uid) < T.bb * T.buyInBB) throw new HttpErr('points');
  const join = async (code: string) => {
    for (let k = 0; k < 3; k++) {                                // 'busy' (souběh) → zkusit znovu, ne přeskočit stůl
      try { return await mutate(uid, 'join', { code, name: body.name }); }
      catch (e) { if (e instanceof HttpErr && e.code === 'busy' && k < 2) { await new Promise((r) => setTimeout(r, 80 + Math.random() * 120)); continue; } throw e; }
    }
  };
  const openTables = async (exceptCode = '') => {
    const fresh = new Date(Date.now() - FRESH_MS).toISOString();
    let q = admin.from('rooms').select('code, seated, created_at').eq('is_public', true).eq('tier', T.id).eq('status', 'playing')
      .lt('seated', core.PUB_MAX).gt('updated_at', fresh);
    if (exceptCode) q = q.neq('code', exceptCode);
    const { data } = await q.order('seated', { ascending: false }).order('created_at', { ascending: true }).limit(8);
    return data ?? [];
  };
  for (const r of await openTables()) {
    try { return await join(r.code); }
    catch (e) { if (e instanceof HttpErr && ['full', 'closed', 'no_room', 'busy'].includes(e.code)) continue; throw e; }
  }
  for (let k = 0; k < 10; k++) {                                  // žádný volný → nový stůl
    const room = core.createPublic({ tier: T.id });
    const { data: r, error } = await admin.from('rooms').insert({ code: room.code, host: null, status: room.status, settings: room.settings,
      public_state: core.view(room, null), version: room.ver, is_public: true, tier: T.id, seated: 0 }).select('id, created_at').single();
    if (error) { if (error.code === '23505') continue; console.error(error); throw new HttpErr('server', 500); }
    await admin.from('room_state').insert({ room_id: r.id, state: room, version: 0 });
    const res = await join(room.code);
    // souběh: dva hráči přišli skoro současně, oba nic nenašli a oba založili stůl. Deterministické sloučení:
    // kdo má MLADŠÍ stůl, přesedne ke staršímu (created_at, pak kód) – starší stůl zůstane, mladší se zavře.
    // deno-lint-ignore no-explicit-any
    const older = (await openTables(room.code)).filter((o: any) => o.created_at < r.created_at || (o.created_at === r.created_at && o.code < room.code))
      // deno-lint-ignore no-explicit-any
      .sort((a: any, b: any) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
    for (const o of older) {
      try {
        await mutate(uid, 'leave', { code: room.code });           // prázdný stůl se zavře, žetony zpět
        return await join(o.code);
      } catch (e) {
        if (e instanceof HttpErr && ['full', 'closed', 'no_room', 'busy'].includes(e.code)) { try { return await join(room.code); } catch (_) { /* zkusit další */ } continue; }
        throw e;
      }
    }
    return res;
  }
  throw new HttpErr('no_code', 500);
}
async function lobby() {
  const fresh = new Date(Date.now() - FRESH_MS).toISOString();
  const { data } = await admin.from('rooms').select('tier, seated').eq('is_public', true).eq('status', 'playing').gt('updated_at', fresh).limit(1000);
  // deno-lint-ignore no-explicit-any
  return { tiers: core.TIERS.map((T: any) => { const rs = (data ?? []).filter((r: any) => r.tier === T.id && r.seated > 0);
    return { id: T.id, sb: T.sb, bb: T.bb, buyIn: T.bb * T.buyInBB, tables: rs.length, players: rs.reduce((s: number, r: { seated: number }) => s + r.seated, 0) }; }) };
}
const REASONS = ['abuse', 'name', 'cheat', 'spam', 'other'];
// deno-lint-ignore no-explicit-any
async function report(uid: string, body: any) {
  await limit(uid, 'report');
  const code = String(body.code ?? '').toUpperCase().trim();
  if (!CODE_RE.test(code)) throw new HttpErr('no_room', 404);
  const { data: r } = await admin.from('rooms').select('id').eq('code', code).maybeSingle();
  if (!r) throw new HttpErr('no_room', 404);
  const { data: st } = await admin.from('room_state').select('state').eq('room_id', r.id).single();
  if (!st) throw new HttpErr('no_room', 404);
  // deno-lint-ignore no-explicit-any
  let tg: any; try { tg = core.reportTarget(st.state, uid, Number(body.seat)); } catch (e) { throw new HttpErr((e as any).code ?? 'bad_seat'); }
  const reason = REASONS.includes(body.reason) ? body.reason : 'other';
  const { error } = await admin.from('reports').insert({ reporter: uid, reported: tg.uid, reported_name: tg.name, room_id: r.id, room_code: code, hand_no: tg.hand, reason });
  if (error) { console.error(error); throw new HttpErr('server', 500); }
  return { ok: true };
}

// ---------- úklid opuštěných stolů (volá cron s tajným klíčem) ----------
// soukromé stoly bez změny 6 h, veřejné bez změny 20 min → zavřít a žetony vrátit do bodů
async function sweep() {
  const old = new Date(Date.now() - 6 * 3600e3).toISOString(), oldPub = new Date(Date.now() - 20 * 60e3).toISOString();
  const { data: a } = await admin.from('rooms').select('id').neq('status', 'closed').lt('updated_at', old).limit(50);
  const { data: b } = await admin.from('rooms').select('id').eq('is_public', true).neq('status', 'closed').lt('updated_at', oldPub).limit(50);
  const rooms = [...new Map([...(a ?? []), ...(b ?? [])].map((r) => [r.id, r])).values()];
  let n = 0;
  for (const r of rooms) {
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

// ověření JWT: výsledek getUser si pamatujeme do vypršení tokenu (max 5 min) → o 1 síťový dotaz méně na každý tah
const userCache = new Map<string, { id: string; exp: number }>();
async function userOf(jwt: string): Promise<string | null> {
  if (!jwt) return null;
  const c = userCache.get(jwt); if (c && c.exp > Date.now()) return c.id;
  const { data } = await admin.auth.getUser(jwt);
  const id = data?.user?.id; if (!id) return null;
  let exp = Date.now() + 5 * 60e3;
  try { const p = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (p.exp) exp = Math.min(exp, p.exp * 1000 - 5000); } catch (_) { /* neprůhledný token */ }
  if (userCache.size > 2000) userCache.clear();
  userCache.set(jwt, { id, exp });
  return id;
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
    const uid = await userOf(jwt);
    if (!uid) throw new HttpErr('auth', 401);
    const user = { id: uid };
    const lim = limit(user.id, 'all');
    if (op === 'points' || op === 'lobby' || op === 'state' || op === 'tick') {   // čtení: limit souběžně (o dotaz rychlejší)
      const [, out] = await Promise.all([lim, op === 'points' ? points(user.id).then((n) => ({ points: n })) : op === 'lobby' ? lobby() : mutate(user.id, op, body)]);
      return json(out);
    }
    if (op === 'quickseat' || op === 'report' || op === 'create') {
      await lim;
      if (op === 'quickseat') return json(await quickseat(user.id, body));
      if (op === 'report') return json(await report(user.id, body));
      return json(await create(user.id, body));
    }
    lim.catch(() => {});                                        // tahy: limit souběžně s načtením stolu, čeká se na něj před změnou
    return json(await mutate(user.id, op, body, lim));
  } catch (e) {
    const code = e instanceof HttpErr ? e.code : 'server';
    if (!(e instanceof HttpErr)) console.error(e);
    return json({ code, error: code }, e instanceof HttpErr ? e.status : 500);
  }
});
