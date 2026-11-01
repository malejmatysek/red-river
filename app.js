/* Poker trenér – herní smyčka a UI */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const BB = 2, SB = 1, START = 200;
  const BOT_NAMES = [['Jana', '#ffd3b5'], ['Petr', '#bfe3ff'], ['Eva', '#d9c8ff'], ['Tomáš', '#c8f0d4'], ['Lucie', '#ffc9d9'], ['Martin', '#fde9a9'], ['Kateřina', '#c9e6f0'], ['Ondřej', '#e3d5c8']];
  const STYLES = [{ loose: 0.03, aggr: 0.05, bluff: 0.10 }, { loose: -0.02, aggr: -0.05, bluff: 0.05 }, { loose: 0.06, aggr: 0.1, bluff: 0.14 },
    { loose: 0.0, aggr: 0.0, bluff: 0.08 }, { loose: 0.04, aggr: -0.03, bluff: 0.06 }, { loose: -0.03, aggr: 0.08, bluff: 0.12 },
    { loose: 0.02, aggr: 0.02, bluff: 0.09 }, { loose: 0.07, aggr: -0.05, bluff: 0.04 }];
  const POSITIONS = {   // od dealera (offset 0 = BTN)
    2: ['BTN', 'BB'], 3: ['BTN', 'SB', 'BB'], 4: ['BTN', 'SB', 'BB', 'CO'], 5: ['BTN', 'SB', 'BB', 'HJ', 'CO'],
    6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'], 7: ['BTN', 'SB', 'BB', 'UTG', 'LJ', 'HJ', 'CO'],
    8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'LJ', 'HJ', 'CO'], 9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO'] };
  const STREETS = ['Preflop', 'Flop', 'Turn', 'River'];
  const delay = () => (window.__FAST ? 0 : Math.max(300, 700 - 50 * (G.players.length || 3)));

  const load = (k, d) => { try { return Object.assign({}, d, JSON.parse(localStorage.getItem(k) || '{}')); } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const SETTINGS0 = { recs: true, odds: true, learn: true, opps: 5, shortStacks: true, v: 2 };
  const STATS0 = { hands: 0, won: 0, net: 0, vpip: 0, pfr: 0, decisions: 0, good: 0, ok: 0, meh: 0, bad: 0 };
  const settings = load('pt_settings', SETTINGS0);
  let stats = load('pt_stats', STATS0);
  if (settings.v !== 2) { settings.opps = 5; settings.shortStacks = true; settings.v = 2; save('pt_settings', settings); }   // nová verze: 6-max výchozí
  settings.opps = Math.max(1, Math.min(8, settings.opps | 0 || 5));

  const G = { players: [], dealer: -1, board: [], deck: [], street: 0, currentBet: 0, minRaise: BB, raises: 0,
    turn: -1, over: false, decisions: [], heroVpip: false, heroPfr: false, eq: null, rec: null, ctx: null, feedback: null, handNo: 0 };
  window.__G = G;

  /* ---------- pomocné ---------- */
  const n = () => G.players.length;
  const hero = () => G.players[0];
  const pot = () => G.players.reduce((s, p) => s + p.total, 0);
  const alive = () => G.players.filter(p => !p.folded);
  function posLabel(seat) {
    const off = (seat - G.dealer + n()) % n();
    return POSITIONS[n()][off];
  }
  function shuffle() {
    const d = []; for (let i = 0; i < 52; i++) d.push(i);
    const r = new Uint32Array(52); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(r) : r.forEach((_, i) => r[i] = Math.random() * 4e9);
    for (let i = 51; i > 0; i--) { const j = r[i] % (i + 1); [d[i], d[j]] = [d[j], d[i]]; }
    return d;
  }
  function put(p, amt) { amt = Math.min(amt, p.stack); p.stack -= amt; p.bet += amt; p.total += amt; if (p.stack === 0) p.allIn = true; return amt; }
  function findNext(from) {
    for (let i = 1; i <= n(); i++) {
      const s = (from + i) % n(), p = G.players[s];
      if (!p.folded && !p.allIn && (!p.acted || p.bet < G.currentBet)) return s;
    }
    return -1;
  }
  function rangeOf(p) { return p.pf === 'raise3' ? 11 : p.pf === 'raise' ? 8 : p.pf === 'shove' ? 6 : p.pf === 'call' ? 5 : 0; }
  // iterace simulace podle počtu soupeřů – UI zůstane svižné i proti 8 botům
  const heroIters = k => k <= 2 ? 5000 : k <= 5 ? 3500 : 2500;
  function ctxFor(seat, iters) {
    const p = G.players[seat];
    const opps = G.players.filter((q, i) => i !== seat && !q.folded);
    const toCall = Math.min(G.currentBet - p.bet, p.stack);
    const limpers = G.street === 0 && G.raises === 0 ? G.players.filter((q, i) => i !== seat && q.pf === 'limp').length : 0;
    const eqr = PE.equity(p.cards, G.board, opps.map(q => ({ minChen: rangeOf(q) })), iters);
    const eff = Math.min(p.stack + p.bet, Math.max(0, ...opps.map(q => q.stack + q.bet)));
    return { street: G.street, hole: p.cards, board: G.board.slice(), pot: pot(), toCall, currentBet: G.currentBet, myBet: p.bet,
      stack: p.stack, minRaiseTo: Math.min(G.currentBet + G.minRaise, p.bet + p.stack), bb: BB, position: posLabel(seat),
      numOpp: opps.length, raisesThisStreet: G.raises, limpers, eq: eqr.equity, eqr, eff };
  }

  /* ---------- průběh ruky ---------- */
  function setupPlayers() {
    const want = settings.opps + 1;
    if (G.players.length === want) return;
    G.players = [{ name: 'Ty', hero: true }];
    for (let i = 0; i < settings.opps; i++) G.players.push({ name: BOT_NAMES[i][0], color: BOT_NAMES[i][1], style: STYLES[i] });
    G.dealer = -1;
  }
  /* Stacky: většinou 100 BB, občas krátký stack (push/fold trénink) */
  function assignStacks() {
    G.players.forEach(p => p.start = START);
    G.scenario = '';
    if (!settings.shortStacks || window.__DEEP) return;
    const rnd = Math.random(), r = (a, b) => (a + Math.floor(Math.random() * (b - a + 1))) * BB;
    if (rnd < 0.25) { hero().start = r(6, 15); G.scenario = 'Krátký stack: ' + hero().start / BB + ' BB'; G.players.slice(1).forEach(p => p.start = r(20, 100)); }
    else if (rnd < 0.4) { const b = 1 + Math.floor(Math.random() * (n() - 1)); G.players[b].start = r(5, 14); G.scenario = G.players[b].name + ' má krátký stack'; }
    if (window.__FORCE_SHORT) { hero().start = window.__FORCE_SHORT * BB; G.scenario = 'Krátký stack: ' + window.__FORCE_SHORT + ' BB'; }
  }
  function startHand() {
    closeSheet();
    setupPlayers();
    G.handNo++;
    G.dealer = (G.dealer + 1) % n();
    G.deck = shuffle(); G.board = []; G.street = 0; G.over = false; G.decisions = []; G.feedback = null;
    G.heroVpip = G.heroPfr = false; G.winners = null; G.eq = null; G.eqStreet = -1;
    assignStacks();
    G.players.forEach(p => Object.assign(p, { stack: p.start, bet: 0, total: 0, folded: false, allIn: false, acted: false, last: '', pf: '', cards: [G.deck.pop(), G.deck.pop()], show: false }));
    const sbSeat = n() === 2 ? G.dealer : (G.dealer + 1) % n(), bbSeat = (sbSeat + 1) % n();
    put(G.players[sbSeat], SB); G.players[sbSeat].last = 'SB ' + SB;
    put(G.players[bbSeat], BB); G.players[bbSeat].last = 'BB ' + BB;
    G.currentBet = BB; G.minRaise = BB; G.raises = 0;
    G.turn = findNext(bbSeat);
    loop();
  }
  function loop() {
    if (G.over) return;
    if (alive().length === 1) return finish();
    if (G.turn < 0) return nextStreet();
    const p = G.players[G.turn];
    if (p.hero) {
      G.ctx = ctxFor(0, heroIters(alive().length - 1)); G.eq = G.ctx.eqr; G.rec = PE.recommend(G.ctx);
      render();
    } else {
      G.ctx = null; G.rec = null;
      if (G.street > 0 || G.eqStreet !== G.street) { G.eq = PE.equity(hero().cards, G.board, G.players.slice(1).filter(q => !q.folded).map(q => ({ minChen: rangeOf(q) })), heroIters(alive().length - 1) >> 1); G.eqStreet = G.street; }
      render();
      setTimeout(() => {
        const seat = G.turn; if (G.over || seat < 0 || G.players[seat].hero) return;
        const c = ctxFor(seat, n() > 5 ? 300 : 500);
        const d = PE.botDecide(c, G.players[seat].style);
        act(seat, d.action, d.to);
      }, delay());
    }
  }
  function act(seat, action, to) {
    const p = G.players[seat];
    const toCall = Math.min(G.currentBet - p.bet, p.stack);
    if (action === 'check' && toCall > 0) action = 'call';
    if (action === 'call' && toCall === 0) action = 'check';
    if (action === 'allin') { if (p.stack <= toCall) action = 'call'; else { action = 'raise'; to = p.bet + p.stack; } }
    if ((action === 'bet' || action === 'raise') && p.stack <= toCall) action = 'call';
    if (action === 'fold') { p.folded = true; p.last = 'Fold'; }
    else if (action === 'check') p.last = 'Check';
    else if (action === 'call') { put(p, toCall); p.last = p.allIn ? 'All-in' : 'Call ' + p.bet; if (G.street === 0 && !p.pf) p.pf = G.raises ? 'call' : 'limp'; }
    else {
      const max = p.bet + p.stack;
      to = Math.round(to || (G.currentBet + G.minRaise));
      to = Math.min(max, Math.max(to, Math.min(max, G.currentBet + G.minRaise)));
      put(p, to - p.bet);
      const inc = to - G.currentBet;
      if (inc >= G.minRaise) G.minRaise = inc;
      G.currentBet = Math.max(G.currentBet, to);
      G.raises++;
      if (G.street === 0) p.pf = p.allIn && p.start <= 15 * BB ? 'shove' : G.raises >= 2 ? 'raise3' : 'raise';
      G.players.forEach((q, i) => { if (i !== seat) q.acted = false; });
      p.last = (p.allIn ? 'All-in ' : (action === 'bet' ? 'Bet ' : 'Raise ')) + to;
    }
    p.acted = true;
    G.turn = findNext(seat);
    loop();
  }
  function heroAct(action, to) {
    if (G.turn !== 0 || G.over) return;
    const ctx = G.ctx, rec = G.rec, h = hero();
    if ((action === 'bet' || action === 'raise') && to >= h.stack + h.bet) action = 'allin';
    if (action === 'allin') to = h.stack + h.bet;
    const gr = PE.grade(rec, action, ctx);
    G.decisions.push({ street: G.street, action, to, rec, grade: gr, eq: ctx.eq });
    stats.decisions++; stats[gr.level]++;
    if (G.street === 0 && action !== 'fold' && !(action === 'check')) G.heroVpip = true;
    if (G.street === 0 && (action === 'raise' || action === 'bet' || action === 'allin')) G.heroPfr = true;
    G.feedback = settings.learn ? Object.assign({ street: G.street, act: action }, gr) : null;
    act(0, action, to);
  }
  function nextStreet() {
    G.players.forEach(p => { p.bet = 0; p.acted = false; if (!p.folded && !p.allIn) p.last = ''; });
    G.currentBet = 0; G.minRaise = BB; G.raises = 0;
    if (G.street === 3) return finish();
    G.street++;
    if (G.street === 1) G.board.push(G.deck.pop(), G.deck.pop(), G.deck.pop()); else G.board.push(G.deck.pop());
    const canAct = G.players.filter(p => !p.folded && !p.allIn).length;
    if (canAct <= 1) {                                  // all-in: dotočit board
      G.players.forEach(p => { if (!p.folded) p.show = true; });
      G.turn = -1; G.eq = PE.equity(hero().cards, G.board, G.players.slice(1).filter(q => !q.folded).map(q => ({ cards: q.cards })), 3000);
      render(); return setTimeout(() => !G.over && nextStreet(), delay() * 1.4);
    }
    G.turn = findNext(G.dealer);
    loop();
  }
  function finish() {
    G.over = true; G.turn = -1;
    const live = alive(); const total = pot();
    G.winners = [];
    if (live.length === 1) { live[0].stack += total; G.winners.push(live[0]); }
    else {
      while (G.board.length < 5) G.board.push(G.deck.pop());
      live.forEach(p => { p.show = true; p.score = PE.evaluate(p.cards.concat(G.board)); p.hand = PE.handName(p.cards.concat(G.board)); });
      const levels = [...new Set(G.players.map(p => p.total).filter(x => x > 0))].sort((a, b) => a - b);
      let prev = 0;
      for (const lv of levels) {
        const part = G.players.reduce((s, p) => s + Math.min(p.total, lv) - Math.min(p.total, prev), 0);
        const elig = live.filter(p => p.total >= lv);
        prev = lv; if (!elig.length || !part) continue;
        const best = Math.max(...elig.map(p => p.score));
        const ws = elig.filter(p => p.score === best);
        const share = Math.floor(part / ws.length);
        ws.forEach((w, i) => { w.stack += share + (i === 0 ? part - share * ws.length : 0); if (!G.winners.includes(w)) G.winners.push(w); });
      }
    }
    const net = hero().stack - hero().start;
    G.heroNet = net;
    stats.hands++; stats.net += net; if (net > 0) stats.won++;
    if (G.heroVpip) stats.vpip++; if (G.heroPfr) stats.pfr++;
    save('pt_stats', stats);
    render();
    setTimeout(showSummary, window.__FAST ? 0 : 900);
  }

  /* ---------- vykreslení ---------- */
  function cardHTML(c, size, extra) {
    const cls = ['card', size || ''];
    if (c == null) { cls.push('back'); return `<div class="${cls.join(' ')}"></div>`; }
    if (c === 'ghost') return `<div class="card ghost ${size || ''}"></div>`;
    const s = PE.SUITS[PE.suitOf(c)];
    if (s === 'h' || s === 'd') cls.push('red');
    if (extra) cls.push(extra);
    return `<div class="${cls.join(' ')}" data-c="${PE.cardStr(c)}"><span class="rk">${PE.RANKS[PE.rankOf(c)]}</span><span class="st">${PE.SUIT_SYM[s]}</span></div>`;
  }
  function render() {
    $('recToggle').checked = settings.recs;
    // soupeři
    $('opps').className = 'opps' + (n() > 5 ? ' compact' : '');
    document.body.classList.toggle('many', n() > 5);
    $('opps').style.gridTemplateColumns = n() > 5 ? `repeat(${Math.ceil((n() - 1) / 2)},1fr)` : '';
    $('opps').innerHTML = G.players.slice(1).map((p, i) => {
      const seat = i + 1;
      const cards = p.show ? p.cards.map(c => cardHTML(c, 'sm')).join('') : '';
      return `<div class="opp ${p.folded ? 'folded' : ''} ${G.turn === seat ? 'turn' : ''}">
        <div class="avatar" style="background:${p.color}">${p.name.slice(0, 2).toUpperCase()}${G.dealer === seat ? '<span class="dealer">D</span>' : ''}</div>
        <div class="name">${p.name} · <span class="pos">${posLabel(seat)}</span></div><div class="stk">${p.stack}${p.allIn && !G.over ? ' <em>all-in</em>' : ''}</div>
        <div class="chip ${p.last ? '' : 'empty'}">${p.last || '-'}</div>
        <div class="mini">${cards}</div></div>`;
    }).join('');
    // board
    let b = ''; for (let i = 0; i < 5; i++) b += i < G.board.length ? cardHTML(G.board[i]) : cardHTML(null);
    $('board').innerHTML = b;
    $('pot').textContent = pot();
    $('street').textContent = (G.over ? 'Konec ruky' : STREETS[G.street]) + (G.scenario ? ' · ' + G.scenario : '');
    // hráč
    const h = hero();
    $('heroCards').innerHTML = h.cards.map(c => cardHTML(c, 'lg')).join('');
    $('heroStack').textContent = h.stack;
    $('heroPos').innerHTML = posLabel(0) + (G.dealer === 0 ? ' · D' : '') + ' · ' + Math.round((h.stack + h.bet) / BB * 10) / 10 + ' BB';
    $('heroLast').textContent = h.last || '';
    // šance
    $('odds').classList.toggle('off', !settings.odds);
    const live = G.players.slice(1).filter(q => !q.folded).length;
    if (G.eq && !h.folded) {
      $('eqWin').textContent = Math.round(G.eq.equity * 100) + ' %';
      $('eqSub').textContent = live ? `proti ${live} ${live === 1 ? 'soupeři' : 'soupeřům'} · ${G.players.slice(1).some(q => !q.folded && rangeOf(q)) ? 'odhad rozsahu podle akcí' : 'náhodné ruce'} · remíza ${Math.round(G.eq.tie * 100)} %` : '';
    } else { $('eqWin').textContent = '–'; $('eqSub').textContent = h.folded ? 'Složeno' : ''; }
    $('madeLbl').textContent = G.street === 0 ? 'Start. ruka' : 'Ruka';
    $('made').textContent = G.street === 0 && G.board.length === 0 ? `${PE.handLabel(h.cards[0], h.cards[1])} · ${PE.chen(h.cards[0], h.cards[1])}/20` : PE.handName(h.cards.concat(G.board));
    // doporučení
    const showRec = settings.recs && G.turn === 0 && G.rec && !G.over;
    $('rec').hidden = !showRec;
    if (showRec) { $('recAct').textContent = recLabel(G.rec); $('recWhy').textContent = G.rec.why; }
    // zpětná vazba
    const fb = G.feedback;
    $('feedback').hidden = !fb || G.over;
    if (fb) { $('feedback').className = 'feedback ' + fb.level; $('feedback').innerHTML = `<b>${fb.title} <span style="color:var(--muted);font-weight:400;font-size:12px">· tvůj ${fb.act} (${STREETS[fb.street].toLowerCase()})</span></b><div class="txt">${fb.text}</div>`; }
    renderActions();
  }
  function recLabel(r) {
    const a = r.action;
    return a === 'allin' ? `All-in ${r.to}` : r.allinCall ? `Call all-in ${G.ctx.toCall}` : a === 'bet' ? `Bet ${r.to}` : a === 'raise' ? (r.to >= hero().stack + hero().bet ? `All-in ${r.to}` : `Raise na ${r.to}`) : a[0].toUpperCase() + a.slice(1);
  }
  function defaultSize() {
    const c = G.ctx;
    if (settings.recs && G.rec && G.rec.to && (G.rec.action === 'bet' || G.rec.action === 'raise' || G.rec.action === 'allin')) return G.rec.to;
    if (G.street === 0) return Math.max(c.minRaiseTo, Math.min(c.stack + c.myBet, G.raises ? G.currentBet * 3 : 3 * BB));
    return Math.max(c.minRaiseTo, Math.min(c.stack + c.myBet, c.toCall ? G.currentBet * 3 : Math.round(c.pot * 0.66)));
  }
  function renderActions() {
    const el = $('actions');
    if (G.over) { el.innerHTML = `<button class="btn primary" id="nextBtn">Další ruka</button>`; $('nextBtn').onclick = startHand; return; }
    if (G.turn !== 0) { el.innerHTML = `<div class="waiting">${hero().folded ? 'Složil jsi – dohrává se…' : G.turn > 0 ? G.players[G.turn].name + ' přemýšlí…' : 'Rozdává se…'}</div>`; return; }
    const c = G.ctx, h = hero(), r = settings.recs ? G.rec.action : '';
    const canRaise = h.stack > c.toCall;
    const size = defaultSize();
    const aggrName = c.toCall === 0 ? 'Bet' : 'Raise';
    const allin = size >= h.stack + h.bet;
    el.innerHTML = `
      <button class="btn ${r === 'fold' ? 'hint' : ''}" data-a="fold" ${c.toCall === 0 ? 'disabled' : ''}>Fold</button>
      <button class="btn ${r === 'check' || r === 'call' ? 'hint' : ''} ${c.toCall >= h.stack ? 'allin' : ''}" data-a="${c.toCall ? 'call' : 'check'}">${c.toCall ? (c.toCall >= h.stack ? 'All-in ' + c.toCall : 'Call ' + c.toCall) : 'Check'}</button>
      <button class="btn ${r === 'bet' || r === 'raise' || r === 'allin' ? 'hint' : ''} ${allin ? 'allin' : ''}" data-a="${allin ? 'allin' : c.toCall ? 'raise' : 'bet'}" data-to="${size}" ${canRaise ? '' : 'disabled'}>${allin ? 'All-in' : aggrName} ${size}</button>
      <button class="btn round" id="sizeBtn" ${canRaise ? '' : 'disabled'} aria-label="Velikost sázky">↑</button>`;
    el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => heroAct(b.dataset.a, +b.dataset.to || undefined));
    $('sizeBtn').onclick = showSizes;
  }

  /* ---------- panely ---------- */
  function openSheet(html) { $('sheet').innerHTML = '<div class="grab"></div>' + html; $('sheet').hidden = false; $('scrim').hidden = false; }
  function closeSheet() { $('sheet').hidden = true; $('scrim').hidden = true; }
  $('scrim').onclick = () => { if (!G.over) closeSheet(); else closeSheet(); };

  function showSizes() {
    const c = G.ctx, h = hero(), max = h.stack + h.bet;
    let opts;
    if (G.street === 0) opts = G.raises === 0 ? [[2.5 * BB, '2,5 BB'], [3 * BB, '3 BB'], [4 * BB, '4 BB']] : [[G.currentBet * 2.5, '2,5×'], [G.currentBet * 3, '3×'], [G.currentBet * 4, '4×']];
    else opts = c.toCall ? [[G.currentBet * 2.5, '2,5×'], [G.currentBet * 3, '3×'], [G.currentBet + c.pot + c.toCall, 'pot']] : [[c.pot / 3, '1/3 potu'], [c.pot / 2, '1/2 potu'], [c.pot * 0.66, '2/3 potu'], [c.pot, 'pot']];
    opts = opts.map(([v, l]) => [Math.min(max, Math.max(c.minRaiseTo, Math.round(v))), l]).concat([[max, 'all-in']]);
    const recTo = settings.recs && G.rec && G.rec.to;
    const verb = c.toCall ? 'Raise na' : 'Bet';
    openSheet(`<h2>Velikost sázky</h2><div class="sub">Minimum ${c.minRaiseTo} · pot ${c.pot}${recTo ? ' · doporučeno ' + recTo : ''}</div>
      <div class="sizes">${opts.map(([v, l]) => `<button class="btn ${v === recTo ? 'rec-size' : ''} ${v === max ? 'allin' : ''}" data-to="${v}">${v === max ? 'All-in' : verb} ${v}<small>${l}</small></button>`).join('')}</div>`);
    $('sheet').querySelectorAll('[data-to]').forEach(b => b.onclick = () => { closeSheet(); heroAct(c.toCall ? 'raise' : 'bet', +b.dataset.to); });
  }
  function showSummary() {
    if (!G.over) return;
    const net = G.heroNet, h = hero();
    const title = net > 0 ? `Vyhrál jsi ${net}` : net < 0 ? `Prohrál jsi ${-net}` : (G.winners.length > 1 ? 'Dělený pot' : 'Vyrovnáno');
    const wn = G.winners.map(w => w.hero ? 'ty' : w.name).join(', ');
    const sd = alive().length > 1;
    let html = `<h2>${title}</h2><div class="sub">${sd ? `Showdown – vyhrává ${wn} (${G.winners[0].hand.toLowerCase()})` : `Ostatní složili – pot bere ${wn}`} · pot ${pot()}</div>`;
    if (sd) {
      html += `<h3>Karty</h3><div style="display:flex;gap:6px;margin-bottom:6px">${G.board.map(c => cardHTML(c, 'sm')).join('')}</div>` + G.players.filter(p => p.show).map(p =>
        `<div class="showline ${G.winners.includes(p) ? 'winner' : ''}"><span class="who">${p.hero ? 'Ty' : p.name}</span>${p.cards.map(c => cardHTML(c, 'sm')).join('')}<span class="hn">${p.hand}</span></div>`).join('');
    }
    if (settings.learn) {
      html += `<h3>Rozbor tvých rozhodnutí</h3>`;
      html += G.decisions.length ? G.decisions.map(d => `<div class="dec"><span class="g ${d.grade.level}"></span><div><b>${STREETS[d.street]}: ${d.action}${d.to ? ' ' + d.to : ''}</b> · ${d.grade.title}${d.street ? ` · šance ${Math.round(d.eq * 100)} %` : ''}<div class="t">${d.grade.text}</div></div></div>`).join('')
        : `<div class="sub">V téhle ruce jsi nerozhodoval.</div>`;
      const good = G.decisions.filter(d => d.grade.level === 'good' || d.grade.level === 'ok').length;
      if (G.decisions.length) html += `<div class="sub" style="margin-top:10px">Tahle ruka: ${good}/${G.decisions.length} dobrých rozhodnutí. Výsledek ruky ovlivňuje i náhoda – hodnoť rozhodnutí, ne výsledek.</div>`;
    }
    html += `<button class="btn primary wide" id="sumNext">Další ruka</button>`;
    openSheet(html);
    $('sumNext').onclick = startHand;
  }
  function showStats() {
    const s = stats, pctv = (a, b) => b ? Math.round(a / b * 100) + ' %' : '–';
    const acc = s.decisions ? (s.good + s.ok) / s.decisions : null;
    openSheet(`<h2>Statistiky</h2><div class="sub">${s.hands} odehraných rukou · ukládá se v prohlížeči</div>
      <div class="grid">
        <div class="tile"><div class="lbl">Přesnost rozhodnutí</div><div class="v g">${acc == null ? '–' : Math.round(acc * 100) + ' %'}</div></div>
        <div class="tile"><div class="lbl">Zisk</div><div class="v ${s.net >= 0 ? 'g' : 'r'}">${(s.net / BB).toFixed(1)} BB</div></div>
        <div class="tile"><div class="lbl">VPIP</div><div class="v">${pctv(s.vpip, s.hands)}</div></div>
        <div class="tile"><div class="lbl">PFR</div><div class="v">${pctv(s.pfr, s.hands)}</div></div>
        <div class="tile"><div class="lbl">Vyhrané ruce</div><div class="v">${pctv(s.won, s.hands)}</div></div>
        <div class="tile"><div class="lbl">BB / 100 rukou</div><div class="v">${s.hands ? (s.net / BB / s.hands * 100).toFixed(1) : '–'}</div></div>
      </div>
      <h3>Rozhodnutí (${s.decisions})</h3>
      <div class="row"><span><span class="g good" style="display:inline-block;width:9px;height:9px;border-radius:50%"></span> Správně</span><span>${s.good}</span></div>
      <div class="row"><span><span class="g ok" style="display:inline-block;width:9px;height:9px;border-radius:50%"></span> Dá se</span><span>${s.ok}</span></div>
      <div class="row"><span><span class="g meh" style="display:inline-block;width:9px;height:9px;border-radius:50%"></span> Nepřesnost</span><span>${s.meh}</span></div>
      <div class="row"><span><span class="g bad" style="display:inline-block;width:9px;height:9px;border-radius:50%"></span> Velká chyba</span><span>${s.bad}</span></div>
      <div class="sub" style="margin-top:12px">VPIP = jak často dobrovolně dáš žetony do potu preflop. PFR = jak často preflop navyšuješ. Solidní hráč má PFR blízko VPIP.</div>
      <button class="btn wide" id="resetStats">Vynulovat statistiky</button>`);
    $('resetStats').onclick = () => { stats = Object.assign({}, STATS0); save('pt_stats', stats); showStats(); };
  }
  function toggleRow(key, title, sub) {
    return `<div class="row"><div>${title}<small>${sub}</small></div><label class="switch-pill" style="padding:6px"><input type="checkbox" data-k="${key}" ${settings[key] ? 'checked' : ''}><i></i></label></div>`;
  }
  function showSettings() {
    openSheet(`<h2>Nastavení</h2><div class="sub">Trénink Texas Hold'em, blindy 1/2, stack 200 (100 BB), občas krátké stacky.</div>
      ${toggleRow('recs', 'Doporučené tahy', 'Ukáže nejlepší akci a proč')}
      ${toggleRow('odds', 'Šance na výhru', 'Monte Carlo equity v procentech')}
      ${toggleRow('learn', 'Režim učení', 'Zpětná vazba po každém rozhodnutí')}
      ${toggleRow('shortStacks', 'Krátké stacky', 'Občas ruka s malým stackem – trénink push/fold a all-in')}
      <div class="row col"><div>Počet soupeřů<small>${settings.opps + 1} hráčů u stolu${settings.opps === 5 ? ' (6-max)' : settings.opps === 8 ? ' (plný stůl)' : ''} · projeví se od další ruky</small></div><div class="seg seg8">${[1, 2, 3, 4, 5, 6, 7, 8].map(k => `<button data-o="${k}" class="${settings.opps === k ? 'on' : ''}">${k}</button>`).join('')}</div></div>
      <button class="btn primary wide" id="closeSet">Hotovo</button>`);
    $('sheet').querySelectorAll('[data-k]').forEach(i => i.onchange = () => { settings[i.dataset.k] = i.checked; save('pt_settings', settings); render(); });
    $('sheet').querySelectorAll('[data-o]').forEach(b => b.onclick = () => { settings.opps = +b.dataset.o; save('pt_settings', settings); showSettings(); });
    $('closeSet').onclick = () => { closeSheet(); render(); };
  }
  $('recToggle').onchange = e => { settings.recs = e.target.checked; save('pt_settings', settings); render(); };
  $('statsBtn').onclick = showStats;
  document.addEventListener('click', e => { const t = e.target.closest('.rec-why,.feedback .txt'); if (t) t.classList.toggle('open'); });
  $('settingsBtn').onclick = showSettings;

  window.__poker = { startHand, heroAct, G, settings };
  startHand();
})();
