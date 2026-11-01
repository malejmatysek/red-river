/* Red River (poker trenér) – obrazovky, herní smyčka, trénink situací a UI */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const t = (k, p) => I18N.t(k, p);
  const APP_VERSION = '1.2.0', BUILD = 'v8';
  const FAST = () => !!window.__FAST;
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const noAnim = () => FAST() || reduced();

  /* ---------- náhoda: crypto.getRandomValues, bez modulo zkreslení ---------- */
  const u32 = (() => { const buf = new Uint32Array(64); let i = 64; const hasC = window.crypto && crypto.getRandomValues;
    return () => { if (i >= 64) { if (hasC) crypto.getRandomValues(buf); else for (let k = 0; k < 64; k++) buf[k] = Math.random() * 4294967296 >>> 0; i = 0; } return buf[i++]; }; })();
  const rnd = () => u32() / 4294967296;
  function randInt(n) { const lim = Math.floor(4294967296 / n) * n; let x; do x = u32(); while (x >= lim); return x % n; }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const newDeck = () => shuffle(Array.from({ length: 52 }, (_, i) => i));
  const pick = a => a[randInt(a.length)];

  /* ---------- konstanty ---------- */
  let BB = 2, SB = 1, START = 200;
  const BLINDS = [[1, 2], [5, 10], [25, 50]];
  const DEPTHS = [20, 50, 100, 200];
  const NAME_POOL = ['Jana', 'Petr', 'Eva', 'Tomáš', 'Lucie', 'Martin', 'Kateřina', 'Ondřej', 'Pavel', 'Tereza', 'Jakub', 'Veronika', 'Lukáš', 'Klára', 'Marek', 'Barbora', 'Adam', 'Zuzana', 'Filip', 'Monika', 'David', 'Alena', 'Vojta', 'Hana'];
  const COLORS = ['#ffd3b5', '#bfe3ff', '#d9c8ff', '#c8f0d4', '#ffc9d9', '#fde9a9', '#c9e6f0', '#e3d5c8', '#f7c6a3', '#b8f0e6', '#e6c8f7', '#d7f0b5'];
  const POSITIONS = {   // od dealera (offset 0 = BTN)
    2: ['BTN', 'BB'], 3: ['BTN', 'SB', 'BB'], 4: ['BTN', 'SB', 'BB', 'CO'], 5: ['BTN', 'SB', 'BB', 'HJ', 'CO'],
    6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'], 7: ['BTN', 'SB', 'BB', 'UTG', 'LJ', 'HJ', 'CO'],
    8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'LJ', 'HJ', 'CO'], 9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO'] };
  const SPEED = [2.2, 1, 0.5];
  const spd = () => SPEED[settings.speed] || 1;
  const delay = () => (FAST() ? 0 : Math.max(380, 800 - 50 * (G.players.length || 3)) * spd());
  const streetName = i => t('st.' + i);

  /* ---------- úložiště ---------- */
  const load = (k, d) => { try { return Object.assign({}, d, JSON.parse(localStorage.getItem(k) || '{}')); } catch (e) { return Object.assign({}, d); } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const navLang = ((navigator.languages && navigator.languages[0]) || navigator.language || 'cs').toLowerCase();
  const SETTINGS0 = { recs: true, odds: true, learn: true, opps: 5, shortStacks: true, v: 3, diff: 1, blinds: 0, depth: 100, randomDepth: false,
    bankroll: true, speed: 0, sound: true, vibrate: true, lang: navLang.startsWith('en') ? 'en' : 'cs', level: 0, adv: false, gloss: true };
  const STATS0 = { hands: 0, won: 0, netBB: 0, vpip: 0, pfr: 0, decisions: 0, good: 0, ok: 0, meh: 0, bad: 0, v: 4,
    br: 0, calls: 0, sawFlop: 0, sd: 0, sdWon: 0, allins: 0, bigPot: 0, profit: 0, recN: 0, recAgree: 0, best: -1, bestCards: [], types: {}, hist: [] };
  const fresh = o => JSON.parse(JSON.stringify(o));
  /* úrovně hráče: předvolby (jednotlivá nastavení jde pak změnit) */
  const LEVELS = [
    { speed: 0, diff: 0, recs: true, odds: true, learn: true, adv: false, gloss: true },
    { speed: 1, diff: 1, recs: false, odds: true, learn: true, adv: false, gloss: true },
    { speed: 2, diff: 2, recs: false, odds: false, learn: false, adv: true, gloss: false }];
  const expert = () => settings.level === 2;
  const helpOn = k => !expert() && !!settings[k];
  const DRILL0 = { n: 0, good: 0, ok: 0, meh: 0, bad: 0, streak: 0, best: 0 };
  const settings = load('pt_settings', SETTINGS0);
  if (settings.v !== 3) { if (settings.v !== 2) { settings.opps = 5; settings.shortStacks = true; } settings.v = 3; save('pt_settings', settings); }
  settings.opps = Math.max(1, Math.min(8, settings.opps | 0 || 5));
  if (!I18N.has(settings.lang)) settings.lang = 'cs';
  I18N.set(settings.lang);
  let stats = load('pt_stats', fresh(STATS0));
  if (stats.v !== 3 && stats.v !== 4) { stats.netBB = (stats.net || 0) / 2; delete stats.net; stats.v = 3; }   // starší verze: zisk v žetonech při BB 2
  if (stats.v === 3) { stats = Object.assign(fresh(STATS0), stats, { v: 4 }); save('pt_stats', stats); }
  stats.types = Object.assign({}, stats.types); stats.hist = (stats.hist || []).slice(); stats.bestCards = (stats.bestCards || []).slice();
  /* body: virtuální měna (žádné skutečné platby, žádný výběr) */
  const PTS = { start: 1000, daily: 500, refillMin: 200, refillTo: 1000, good: 5, ok: 2, streak: 50, lesson: 100 };
  const wallet = load('pt_wallet', { points: PTS.start, lastDaily: '', lessons: {}, v: 1 });
  wallet.lessons = Object.assign({}, wallet.lessons);
  const saveW = () => { save('pt_wallet', wallet); updatePts(); };
  const fmtPts = v => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  function updatePts() { const e = document.getElementById('ptsV'); if (e) e.textContent = fmtPts(wallet.points); const h = document.getElementById('homePts'); if (h) h.textContent = fmtPts(wallet.points); }
  function addPts(n, msg) { if (!n) return; wallet.points = Math.max(0, Math.round(wallet.points + n)); saveW(); if (msg && !FAST()) toast(msg); }
  let drillSt = load('pt_drill', DRILL0);
  let session = load('pt_session', { key: '', hero: 0, bots: [], hands: 0, netBB: 0, dealer: -1 });

  const G = { players: [], dealer: -1, board: [], deck: [], street: 0, currentBet: 0, minRaise: BB, raises: 0, tableKey: '',
    turn: -1, over: true, decisions: [], heroVpip: false, heroPfr: false, eq: null, rec: null, ctx: null, feedback: null, handNo: 0,
    dealing: false, revealed: false, paused: null };
  window.__G = G;

  /* ---------- zvuky (WebAudio) a vibrace ---------- */
  const SFX = (() => {
    let ac = null, nbuf = null;
    const A = () => { if (!settings.sound || FAST()) return null;
      try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) { return null; } return ac; };
    function tone(f, d, type, v, when, f2) {
      const a = A(); if (!a) return; const t0 = a.currentTime + (when || 0);
      const o = a.createOscillator(), g = a.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v || 0.05, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + d + 0.03);
    }
    function noise(d, v, freq) {
      const a = A(); if (!a) return;
      if (!nbuf) { nbuf = a.createBuffer(1, a.sampleRate * 0.2, a.sampleRate); const ch = nbuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1; }
      const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t0 = a.currentTime;
      s.buffer = nbuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
      g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      s.connect(f); f.connect(g); g.connect(a.destination); s.start(t0); s.stop(t0 + d + 0.02);
    }
    return {
      deal: () => noise(0.06, 0.12, 2400), flip: () => noise(0.04, 0.09, 4200),
      chip: () => { tone(1900, 0.07, 'triangle', 0.035); tone(2700, 0.06, 'triangle', 0.025, 0.035); },
      fold: () => tone(260, 0.14, 'sine', 0.04, 0, 150),
      turn: () => { tone(880, 0.12, 'sine', 0.045); tone(1320, 0.18, 'sine', 0.035, 0.09); },
      win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.26, 'triangle', 0.05, i * 0.085)),
      tap: () => tone(1400, 0.03, 'sine', 0.015), unlock: () => A()
    };
  })();
  const vib = p => { if (settings.vibrate && navigator.vibrate && !FAST()) try { navigator.vibrate(p); } catch (e) {} };

  /* ---------- navigace mezi obrazovkami (s historií – funguje i systémové „zpět“) ---------- */
  const nav = { cur: null };
  window.__nav = nav;
  function show(id, dir) {
    const prev = nav.cur; if (prev === id) return;
    const a = $('scr-' + id), b = prev && $('scr-' + prev);
    if (b) { b.classList.remove('active', 'enter-f', 'enter-b'); if (!noAnim()) { b.classList.add('leaving'); setTimeout(() => b.classList.remove('leaving'), 280); } }
    a.classList.remove('enter-f', 'enter-b', 'leaving'); a.classList.add('active');
    if (!noAnim() && prev) { void a.offsetWidth; a.classList.add(dir === 'back' ? 'enter-b' : 'enter-f'); }
    a.scrollTop = 0;
    nav.cur = id; onShow(id, prev);
  }
  nav.go = id => { try { history.pushState({ s: id }, ''); } catch (e) {} show(id, 'fwd'); };
  nav.back = () => { if (history.state && history.state.s && history.state.s !== 'home') history.back(); else show('home', 'back'); };
  nav.home = () => { try { history.replaceState({ s: 'home' }, ''); } catch (e) {} show('home', 'back'); };
  window.addEventListener('popstate', e => { closeSheet(); show((e.state && e.state.s) || 'home', 'back'); });
  document.addEventListener('click', e => { if (e.target.closest('[data-back]')) { SFX.tap(); nav.back(); } });
  function onShow(id, prev) {
    if (id === 'home') renderHome();
    if (id === 'settings') renderSettings();
    if (id === 'stats') renderStats();
    if (id === 'learn') renderLearn();
    if (id === 'shop') renderShop();
    if (id === 'drill') { if (!D.spot) drillNew(); else renderDrill(); }
    if (id === 'game') {
      render();
      if (!G.handNo) startHand();
      else if (G.paused) { const f = G.paused; G.paused = null; setTimeout(f, 250); }
    }
  }

  /* ---------- srozumitelný text: karty jako čipy, pozice slovy, slovníček ---------- */
  const cardOf = x => /^\d+$/.test(x) ? +x : PE.parseCards(x)[0];
  function chip(c) { const s = PE.SUITS[PE.suitOf(c)]; return `<span class="cc${s === 'h' || s === 'd' ? ' r' : ''}">${PE.RANKS[PE.rankOf(c)]}<i>${PE.SUIT_SYM[s]}</i></span>`; }
  function bbWords(x) {
    const v = Math.round(x * 10) / 10, num = I18N.lang === 'cs' ? String(v).replace('.', ',') : String(v);
    if (settings.adv) return num + ' BB';
    const k = I18N.lang === 'cs' ? (v % 1 ? 'bb.frac' : v === 1 ? 'bb.1' : v >= 2 && v <= 4 ? 'bb.few' : 'bb.many') : v === 1 ? 'bb.1' : 'bb.many';
    return num + ' ' + t(k);
  }
  const gl = (g, txt, extra) => `<span class="gl" data-g="${g}"${extra || ''}>${txt}</span>`;
  const posShort = code => settings.adv ? code : t('ps.' + code);
  function token(kind, arg) {
    if (kind === 'h') { const cs = arg.split(',').map(cardOf);
      return settings.adv ? gl('cards', PE.handLabel(cs[0], cs[1])) : `<span class="hand" data-g="cards">${cs.map(chip).join('\u2009')}</span>`; }
    if (kind === 'p') return gl('pos.' + arg, settings.adv ? (I18N.lang === 'cs' ? 'na ' : 'on the ') + arg : t('pp.' + arg));
    if (kind === 'pn') return gl('pos.' + arg, settings.adv ? arg : '„' + t('ps.' + arg) + '“');
    if (kind === 'bb') return gl('bb', bbWords(+arg));
    if (kind === 'st') { const cs = arg.split(',').map(cardOf), c = PE.chen(cs[0], cs[1]);
      return settings.adv ? gl('strength', PE.handLabel(cs[0], cs[1]) + ' · ' + c + '/20') : gl('strength', t('st.str', { c })); }
    return '';
  }
  const termRx = {};
  function termsFor(l) {
    if (termRx[l]) return termRx[l];
    return (termRx[l] = (I18N.TERMS[l] || []).map(([k, src]) => [k, new RegExp('(?<![\\p{L}\\-])(' + src + ')(?![\\p{L}])', 'iu')]));
  }
  function autolink(txt, used, ph) {
    for (const [k, rx] of termsFor(I18N.lang)) {
      if (used.has(k)) continue;
      const m = rx.exec(txt); if (!m) continue;
      used.add(k); ph.push(gl(k, m[1]));
      txt = txt.slice(0, m.index) + '\u0001' + (ph.length - 1) + '\u0002' + txt.slice(m.index + m[1].length);
    }
    return txt;
  }
  function rich(str, o) {
    str = String(str == null ? '' : str);
    const link = settings.gloss && !(o && o.nolink), used = new Set(), ph = [];
    const out = str.split(/(<[^>]+>|\[\[[^\]]+\]\])/).map(part => {
      if (!part) return '';
      if (part[0] === '<') return part;
      const m = /^\[\[(\w+):([^\]]*)\]\]$/.exec(part);
      if (m) return token(m[1], m[2]);
      return link ? autolink(part, used, ph) : part;
    }).join('');
    return out.replace(/\u0001(\d+)\u0002/g, (_, i) => ph[+i]);
  }
  const plain = s => rich(s, { nolink: true }).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const setHTML = (e, h) => { if (e.__h !== h) { e.__h = h; e.innerHTML = h; } };
  const shortTxt = s => String(s).split(/(?<=[.!?])\s+(?=[A-ZÁ-Ž\[])/u).slice(0, 2).join(' ');   // pokročilý: jen 2 věty
  /* vysvětlení pojmu (nad ostatními panely) */
  function glossInfo(k) {
    if (k.startsWith('pos.')) { const c = k.slice(4); return { title: t('ps.' + c) + ' (' + c + ')', text: t('gp.' + c) }; }
    return { title: t('gl.' + k + '.t'), text: t('gl.' + k + '.d') };
  }
  function openGloss(k) {
    const g = glossInfo(k);
    $('gloss').innerHTML = `<div class="grab"></div><div class="gl-k">${t('gl.title')}</div><h2>${g.title}</h2><p>${g.text}</p>
      <div class="gl-btns"><button class="btn primary" id="glOk">${t('gl.ok')}</button><button class="btn ghostbtn" id="glAll">${t('gl.all')}</button></div>`;
    $('gloss').hidden = false; $('glossScrim').hidden = false; SFX.tap();
    $('glOk').onclick = closeGloss;
    $('glAll').onclick = () => { closeGloss(); closeSheet(); if (nav.cur !== 'learn') nav.go('learn'); setTimeout(() => { const x = $('glossary'); if (x) x.scrollIntoView({ block: 'start' }); }, 60); };
  }
  function closeGloss() { $('gloss').hidden = true; $('glossScrim').hidden = true; }
  $('glossScrim').onclick = closeGloss;
  document.addEventListener('click', e => { const g = e.target.closest('[data-g]'); if (!g || g.closest('#gloss')) return; e.stopPropagation(); e.preventDefault(); openGloss(g.dataset.g); }, true);

  /* ---------- pomocné ---------- */
  const n = () => G.players.length;
  const hero = () => G.players[0];
  const pot = () => G.players.reduce((s, p) => s + p.total, 0);
  const alive = () => G.players.filter(p => !p.folded);
  const pname = p => p.hero ? t('you') : p.name;
  function posLabel(seat) { const off = (seat - G.dealer + n()) % n(); return POSITIONS[n()][off]; }
  function put(p, amt) { amt = Math.min(amt, p.stack); p.stack -= amt; p.bet += amt; p.total += amt; if (p.stack === 0) p.allIn = true; return amt; }
  function findNext(from) {
    for (let i = 1; i <= n(); i++) { const s = (from + i) % n(), p = G.players[s]; if (!p.folded && !p.allIn && (!p.acted || p.bet < G.currentBet)) return s; }
    return -1;
  }
  function rangeOf(p) { return p.pf === 'raise3' ? 11 : p.pf === 'raise' ? 8 : p.pf === 'shove' ? 6 : p.pf === 'call' ? 5 : 0; }
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

  /* ---------- boti: náhodná jména, styly podle obtížnosti ---------- */
  function makeStyle() {
    const j = a => (rnd() * 2 - 1) * a;
    const arche = pick(['tight', 'loose', 'aggro', 'station', 'normal', 'normal']);
    const s = [
      { loose: 0.06, aggr: -0.07, bluff: 0.05, noise: 0.26, fish: 0.32 },
      { loose: 0.02, aggr: 0.0, bluff: 0.08, noise: 0.12, fish: 0.12 },
      { loose: -0.02, aggr: 0.08, bluff: 0.11, noise: 0.05, fish: 0.04 }][settings.diff] || {};
    const st = { loose: s.loose + j(0.03), aggr: s.aggr + j(0.04), bluff: Math.max(0.01, s.bluff + j(0.03)), noise: s.noise, fish: s.fish };
    if (arche === 'tight') { st.loose -= 0.04; st.fish *= 0.5; }
    if (arche === 'loose') { st.loose += 0.05; st.fish += 0.08; }
    if (arche === 'aggro') { st.aggr += 0.08; st.bluff += 0.05; }
    if (arche === 'station') { st.aggr -= 0.08; st.fish += 0.1; }
    return st;
  }
  function newBot(stack) {
    const used = new Set(G.players.map(p => p.name));
    const name = pick(NAME_POOL.filter(x => !used.has(x)));
    const usedC = new Set(G.players.map(p => p.color));
    return { name, color: pick(COLORS.filter(c => !usedC.has(c)).concat(COLORS).slice(0, 12)), style: makeStyle(), stack: stack || START };
  }
  const tableKey = () => `${settings.opps}|${settings.blinds}|${settings.depth}|${settings.bankroll ? 1 : 0}`;
  function applyBlinds() { [SB, BB] = BLINDS[settings.blinds] || BLINDS[0]; START = (settings.depth || 100) * BB; }
  /* žetony ze stolu zpět do bodů (změna stolu / nová session) */
  function cashOut() {
    if (session.key && session.hero > 0 && session.bank) { const v = session.hero; wallet.points += v; session.hero = 0; session.bank = false; save('pt_session', session); saveW(); if (!FAST()) toast(t('pts.cashout', { n: fmtPts(v) })); }
  }
  function setupPlayers() {
    const key = tableKey();
    if (G.tableKey === key && G.players.length === settings.opps + 1) return true;
    const skey0 = `${settings.blinds}|${settings.depth}`;
    const resume0 = settings.bankroll && session.key === skey0 && session.hero > 0;
    if (!resume0) { cashOut(); if (settings.bankroll && wallet.points < START) return false; }
    G.tableKey = key;
    G.players = [{ name: 'Ty', hero: true, stack: START }];
    const skey = `${settings.blinds}|${settings.depth}`;
    const resume = settings.bankroll && session.key === skey && session.hero > 0;
    if (resume) G.players[0].stack = session.hero;
    for (let i = 0; i < settings.opps; i++) {
      const sb = resume && session.bots[i];
      G.players.push(sb ? { name: sb.name, color: sb.color, style: sb.style, stack: sb.stack > 0 ? sb.stack : START } : newBot());
    }
    if (!resume) { session = { key: skey, hero: START, bots: [], hands: 0, netBB: 0, dealer: -1, bank: settings.bankroll }; if (settings.bankroll) { wallet.points -= START; saveW(); } save('pt_session', session); }
    G.dealer = resume && session.dealer >= 0 && session.dealer < n() ? session.dealer : randInt(n()) - 1;
    buildOpps();
    return true;
  }
  /* Stacky: trvalý bankroll (přenáší se, dokupuje se) nebo nová hloubka každou ruku */
  function assignStacks() {
    G.scenario = ''; G.rebuy = false;
    const r = (a, b) => (a + randInt(b - a + 1)) * BB;
    if (settings.bankroll) {
      G.players.forEach((p, i) => {
        if (p.stack < BB) {
          if (p.hero) { p.stack = START; wallet.points -= START; saveW(); G.rebuy = true; G.scenario = t('sc.rebuy'); session.rebuys = (session.rebuys || 0) + 1; }
          else { const nb = newBot(settings.shortStacks && rnd() < 0.3 ? r(8, 40) : START); G.scenario = t('sc.swap', { a: p.name, b: nb.name }); Object.assign(p, nb); updateOppStatic(i); }
        }
      });
      if (!G.scenario && rnd() < 0.03 && n() > 2) { const i = 1 + randInt(n() - 1), old = G.players[i].name, nb = newBot(); G.scenario = t('sc.swap', { a: old, b: nb.name }); Object.assign(G.players[i], nb); updateOppStatic(i); }
      G.players.forEach(p => p.start = p.stack);
    } else {
      G.players.forEach(p => p.start = settings.randomDepth ? r(15, 150) : START);
      if (rnd() < 0.06 && n() > 2) { const i = 1 + randInt(n() - 1), old = G.players[i].name, nb = newBot(); G.scenario = t('sc.swap', { a: old, b: nb.name }); Object.assign(G.players[i], nb); updateOppStatic(i); }
      if (settings.shortStacks && !window.__DEEP) {
        const x = rnd();
        if (x < 0.22) { hero().start = r(6, 15); G.scenario = t('sc.short', { n: '[[bb:' + hero().start / BB + ']]' }); G.players.slice(1).forEach(p => p.start = Math.max(p.start, r(20, 100))); }
        else if (x < 0.36) { const b = 1 + randInt(n() - 1); G.players[b].start = r(5, 14); G.scenario = t('sc.botShort', { a: G.players[b].name }); }
      }
      if (window.__FORCE_SHORT) { hero().start = window.__FORCE_SHORT * BB; G.scenario = t('sc.short', { n: '[[bb:' + window.__FORCE_SHORT + ']]' }); }
      G.players.forEach(p => p.stack = p.start);
    }
  }

  /* ---------- průběh ruky ---------- */
  function startHand() {
    closeSheet();
    if (G.dealing) return;
    applyBlinds();
    if (!setupPlayers()) return needPoints(START);
    if (settings.bankroll && hero().stack < BB && wallet.points < START) return needPoints(START);
    if (!settings.bankroll && wallet.points < START) return needPoints(START);
    const prevShown = G.players.map(p => p.cards && !p.folded ? 2 : 0);
    G.handNo++;
    G.dealer = (G.dealer + 1) % n();
    G.deck = newDeck(); G.board = []; G.street = 0; G.over = false; G.decisions = []; G.feedback = null; G.lastDec = null;
    G.heroVpip = G.heroPfr = G.heroFlop = false; G.winners = null; G.eq = null; G.eqStreet = -1; G.ctx = null; G.rec = null;
    assignStacks();
    G.players.forEach((p, i) => Object.assign(p, { bet: 0, total: 0, folded: false, allIn: false, acted: false, last: '', pf: '', cards: [G.deck.pop(), G.deck.pop()], show: false, seen: noAnim() ? 2 : prevShown[i] }));
    const sbSeat = n() === 2 ? G.dealer : (G.dealer + 1) % n(), bbSeat = (sbSeat + 1) % n();
    put(G.players[sbSeat], SB); G.players[sbSeat].last = 'SB ' + SB;
    put(G.players[bbSeat], BB); G.players[bbSeat].last = 'BB ' + BB;
    G.currentBet = BB; G.minRaise = BB; G.raises = 0;
    G.turn = findNext(bbSeat);
    G.revealed = noAnim();
    if (noAnim()) return loop();
    G.dealing = true;
    render();                                   // staré karty se otočí rubem nahoru (board i ruka)
    setTimeout(() => dealAnim(() => { G.dealing = false; loop(); }), 300 * spd());
  }
  /* Rozdání: karty letí od středu stolu postupně ke každému hráči (2 kola), pak se ti otočí tvoje karty */
  function dealAnim(done) {
    G.players.forEach(p => p.seen = 0); render();
    const order = []; for (let r = 0; r < 2; r++) for (let k = 1; k <= n(); k++) order.push([(G.dealer + k) % n(), r]);
    const gap = Math.max(40, (n() > 6 ? 60 : 80) * spd()), dur = 340 * spd();
    const br = $('board').getBoundingClientRect(), sx = br.left + br.width / 2, sy = br.top + br.height / 2;
    order.forEach(([seat, r], i) => setTimeout(() => {
      const p = G.players[seat]; if (!p) return;
      const target = seat === 0 ? heroSlots[r] : oppEls[seat - 1] && oppEls[seat - 1].m[r];
      SFX.deal();
      if (!target || nav.cur !== 'game') { p.seen = r + 1; return; }
      const tr = target.getBoundingClientRect();
      const f = document.createElement('div');
      f.className = 'card back fly ' + (seat === 0 ? 'lg' : 'sm');
      Object.assign(f.style, { left: tr.left + 'px', top: tr.top + 'px', width: tr.width + 'px', height: tr.height + 'px' });
      document.body.appendChild(f);
      const dx = sx - (tr.left + tr.width / 2), dy = sy - (tr.top + tr.height / 2), sc = seat === 0 ? 0.7 : 1.8;
      const a = f.animate([{ transform: `translate(${dx}px,${dy}px) scale(${sc}) rotate(${r ? 8 : -8}deg)`, opacity: 0.6 }, { transform: 'none', opacity: 1 }],
        { duration: dur, easing: 'cubic-bezier(.2,.75,.25,1)' });
      a.onfinish = () => { p.seen = r + 1; target.style.visibility = ''; f.remove(); };
    }, i * gap));
    setTimeout(() => { G.players.forEach(p => p.seen = 2); G.revealed = true; render(); SFX.flip(); setTimeout(done, 380 * spd()); }, (order.length - 1) * gap + dur + 60);
  }
  function loop() {
    if (G.over || G.dealing) return;
    if (alive().length === 1) return finish();
    if (G.turn < 0) return nextStreet();
    const p = G.players[G.turn];
    if (p.hero) {
      G.ctx = ctxFor(0, heroIters(alive().length - 1)); G.eq = G.ctx.eqr; G.rec = PE.recommend(G.ctx);
      render(); SFX.turn(); vib(12);
    } else {
      G.ctx = null; G.rec = null;
      if (G.street > 0 || G.eqStreet !== G.street) { G.eq = PE.equity(hero().cards, G.board, G.players.slice(1).filter(q => !q.folded).map(q => ({ minChen: rangeOf(q) })), heroIters(alive().length - 1) >> 1); G.eqStreet = G.street; }
      render();
      const hand = G.handNo;
      const go = () => {
        const seat = G.turn; if (G.over || seat < 0 || G.players[seat].hero || hand !== G.handNo) return;
        if (!FAST() && nav.cur !== 'game') { G.paused = go; return; }
        const c = ctxFor(seat, n() > 5 ? 300 : 500);
        const d = PE.botDecide(c, G.players[seat].style, rnd);
        act(seat, d.action, d.to);
      };
      setTimeout(go, delay());
    }
  }
  function act(seat, action, to) {
    const p = G.players[seat];
    const toCall = Math.min(G.currentBet - p.bet, p.stack);
    if (action === 'check' && toCall > 0) action = 'call';
    if (action === 'call' && toCall === 0) action = 'check';
    if (action === 'allin') { if (p.stack <= toCall) action = 'call'; else { action = 'raise'; to = p.bet + p.stack; } }
    if ((action === 'bet' || action === 'raise') && p.stack <= toCall) action = 'call';
    if (action === 'fold') { p.folded = true; p.last = 'Fold'; SFX.fold(); }
    else if (action === 'check') p.last = 'Check';
    else if (action === 'call') { put(p, toCall); p.last = p.allIn ? 'All-in' : 'Call ' + p.bet; if (G.street === 0 && !p.pf) p.pf = G.raises ? 'call' : 'limp'; SFX.chip(); }
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
      SFX.chip(); if (p.hero) vib(8);
    }
    p.acted = true;
    G.turn = findNext(seat);
    loop();
  }
  function heroAct(action, to) {
    if (G.turn !== 0 || G.over || G.dealing) return;
    const ctx = G.ctx, rec = G.rec, h = hero();
    if ((action === 'bet' || action === 'raise') && to >= h.stack + h.bet) action = 'allin';
    if (action === 'allin') to = h.stack + h.bet;
    const gr = PE.grade(rec, action, ctx);
    const dec = { street: G.street, action, to, ctx, grade: gr, eq: ctx.eq };
    G.decisions.push(dec);
    stats.decisions++; stats[gr.level]++;
    if (helpOn('recs')) { stats.recN++; if (gr.level === 'good') stats.recAgree++; }
    if (G.street > 0) { if (action === 'bet' || action === 'raise' || (action === 'allin' && ctx.toCall < h.stack)) stats.br++; else if (action === 'call' || action === 'allin') stats.calls++; }
    if (gr.level === 'good') addPts(PTS.good); else if (gr.level === 'ok') addPts(PTS.ok);
    if (G.street === 0 && action !== 'fold' && !(action === 'check')) G.heroVpip = true;
    if (G.street === 0 && (action === 'raise' || action === 'bet' || action === 'allin')) G.heroPfr = true;
    G.lastDec = dec;
    G.feedback = helpOn('learn') ? Object.assign({ street: G.street, act: action }, gr) : null;
    act(0, action, to);
  }
  function nextStreet() {
    G.players.forEach(p => { p.bet = 0; p.acted = false; if (!p.folded && !p.allIn) p.last = ''; });
    G.currentBet = 0; G.minRaise = BB; G.raises = 0;
    if (G.street === 3) return finish();
    G.street++;
    if (G.street === 1) { G.board.push(G.deck.pop(), G.deck.pop(), G.deck.pop()); if (!hero().folded) G.heroFlop = true; } else G.board.push(G.deck.pop());
    const canAct = G.players.filter(p => !p.folded && !p.allIn).length;
    if (canAct <= 1) {                            // všichni (kromě max. jednoho) all-in → dorozdat
      G.turn = -1; render();
      setTimeout(() => { if (!G.over) nextStreet(); }, FAST() ? 0 : 800 * spd());
      return;
    }
    G.turn = findNext(G.dealer);
    loop();
  }
  function finish() {
    G.over = true; G.turn = -1;
    const live = alive();
    G.winners = [];
    if (live.length === 1) { live[0].stack += pot(); G.winners.push(live[0]); }
    else {
      while (G.board.length < 5) G.board.push(G.deck.pop());
      live.forEach(p => { p.show = true; p.score = PE.evaluate(p.cards.concat(G.board)); });
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
    const net = hero().stack - hero().start, h0 = hero(), heroWon = G.winners.includes(h0), sdHand = live.length > 1;
    G.heroNet = net;
    stats.hands++; stats.netBB = Math.round((stats.netBB + net / BB) * 10) / 10; if (heroWon) stats.won++;
    if (G.heroVpip) stats.vpip++; if (G.heroPfr) stats.pfr++;
    if (G.heroFlop) stats.sawFlop++;
    if (sdHand && !h0.folded) { stats.sd++; if (heroWon) stats.sdWon++; }
    if (h0.allIn) stats.allins++;
    if (heroWon) stats.bigPot = Math.max(stats.bigPot, pot());
    stats.profit += net;
    if (!h0.folded && G.board.length >= 3) {
      const sc = PE.evaluate(h0.cards.concat(G.board)), cat = PE.handCategory(sc);
      stats.types[cat] = (stats.types[cat] || 0) + 1;
      if (sc > stats.best) { stats.best = sc; stats.bestCards = h0.cards.concat(G.board); }
    }
    if (!settings.bankroll) { wallet.points += net; saveW(); }
    stats.hist.push(Math.round(wallet.points + (settings.bankroll ? h0.stack : 0)));
    if (stats.hist.length > 400) stats.hist = stats.hist.filter((_, i) => i % 2 === 0);
    save('pt_stats', stats);
    session.hands++; session.netBB = Math.round((session.netBB + net / BB) * 10) / 10;
    session.hero = hero().stack; session.dealer = G.dealer; session.bank = settings.bankroll;
    session.bots = G.players.slice(1).map(p => ({ name: p.name, color: p.color, style: p.style, stack: p.stack }));
    save('pt_session', session);
    if (net > 0) { SFX.win(); vib([20, 40, 30]); }
    render();
    const shown = G.players.filter(p => p.show && !p.hero).length;
    if (!expert()) setTimeout(() => { if (G.over && nav.cur === 'game') showSummary(); }, FAST() ? 0 : (1000 + shown * 450) * spd());
  }

  /* ---------- vykreslení: trvalé DOM prvky, mění se jen obsah (žádné blikání) ---------- */
  function cardInner(c) { const s = PE.SUITS[PE.suitOf(c)]; return `<span class="rk">${PE.RANKS[PE.rankOf(c)]}</span><span class="st">${PE.SUIT_SYM[s]}</span>`; }
  function cardHTML(c, size) {
    if (c == null) return `<div class="card back ${size || ''}"></div>`;
    const s = PE.SUITS[PE.suitOf(c)];
    return `<div class="card ${size || ''} ${s === 'h' || s === 'd' ? 'red' : ''}">${cardInner(c)}</div>`;
  }
  function paint(e, size) {
    const k = e.dataset.want; e.dataset.k = k;
    if (k === 'b') { e.className = 'card back ' + size; e.innerHTML = ''; return; }
    const c = +k, s = PE.SUITS[PE.suitOf(c)];
    e.className = 'card ' + size + (s === 'h' || s === 'd' ? ' red' : ''); e.innerHTML = cardInner(c);
  }
  /* nastaví kartu; při změně ji otočí (scaleX) – rozvržení se nehne */
  function setCard(e, c, size, o) {
    const key = c == null ? 'b' : String(c);
    if (e.dataset.want === key) return;
    e.dataset.want = key;
    if (!o || !o.flip || noAnim() || !e.dataset.k || !e.animate) return paint(e, size);
    const go = () => {
      if (e.dataset.k === e.dataset.want) return;
      const d = 150 * spd();
      const a1 = e.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: d, easing: 'ease-in', fill: 'forwards' });
      a1.onfinish = () => { paint(e, size); e.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: d * 1.15, easing: 'ease-out' }); a1.cancel(); };
    };
    o.delay ? setTimeout(go, o.delay) : go();
  }
  const setText = (e, v) => { v = String(v); if (e.textContent !== v) e.textContent = v; };
  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

  const boardSlots = [], heroSlots = [...$('heroCards').children];
  for (let i = 0; i < 5; i++) { const s = el('div', 'card back'); s.dataset.want = s.dataset.k = 'b'; boardSlots.push(s); $('board').appendChild(s); }
  heroSlots.forEach(s => { s.className = 'card back lg'; s.dataset.want = s.dataset.k = 'b'; });
  let oppEls = [];
  function buildOpps() {
    const box = $('opps'); box.textContent = '';
    oppEls = G.players.slice(1).map(() => {
      const o = el('div', 'opp'), av = el('div', 'avatar'), ini = el('span'), dl = el('span', 'dealer');
      dl.textContent = 'D'; av.append(ini, dl);
      const nm = el('div', 'name'), nmT = el('span'), ps = el('span', 'pos'); nm.append(nmT, document.createTextNode(' · '), ps);
      const stk = el('div', 'stk'), stkT = el('span'), ai = el('em'); ai.textContent = 'all-in'; stk.append(stkT, ai);
      const chip = el('div', 'chip'), mini = el('div', 'mini');
      const m = [el('div', 'card sm back'), el('div', 'card sm back')]; m.forEach(x => { x.dataset.want = x.dataset.k = 'b'; mini.appendChild(x); });
      o.append(av, nm, stk, chip, mini); box.appendChild(o);
      return { o, av, ini, dl, nmT, ps, stkT, ai, chip, mini, m };
    });
    box.className = 'opps' + (n() > 5 ? ' compact' : '');
    document.body.classList.toggle('many', n() > 5);
    box.style.gridTemplateColumns = n() > 5 ? `repeat(${Math.ceil((n() - 1) / 2)},1fr)` : '';
    G.players.forEach((p, i) => i && updateOppStatic(i));
  }
  function updateOppStatic(seat) {
    const e = oppEls[seat - 1], p = G.players[seat]; if (!e) return;
    e.av.style.background = p.color; setText(e.ini, p.name.slice(0, 2).toUpperCase()); setText(e.nmT, p.name);
  }
  function render() {
    if (!G.players.length) return;
    $('recToggle').checked = settings.recs;
    if (oppEls.length !== n() - 1) buildOpps();
    // soupeři
    G.players.slice(1).forEach((p, i) => {
      const e = oppEls[i], seat = i + 1;
      e.o.classList.toggle('folded', p.folded); e.o.classList.toggle('turn', G.turn === seat && !G.dealing);
      e.dl.style.visibility = G.dealer === seat ? '' : 'hidden';
      const pc = posLabel(seat); if (e.ps.dataset.g !== 'pos.' + pc || e.ps.title !== t('ps.' + pc)) { e.ps.dataset.g = 'pos.' + pc; e.ps.title = t('ps.' + pc); } setText(e.ps, pc); setText(e.stkT, p.stack);
      e.ai.style.display = p.allIn && !G.over ? '' : 'none';
      setText(e.chip, p.last || '-'); e.chip.classList.toggle('empty', !p.last);
      e.mini.classList.toggle('gone', p.folded && !p.show);
      const ord = G.players.slice(1, seat).filter(q => q.show).length;   // showdown: soupeři se otáčí postupně
      e.m.forEach((m, k) => { setCard(m, p.show ? p.cards[k] : null, 'sm', { flip: true, delay: p.show ? (ord * 420 + k * 140) * spd() : k * 80 }); m.style.visibility = p.seen > k ? '' : 'hidden'; });
      e.mini.classList.toggle('open', !!p.show);
    });
    // board
    boardSlots.forEach((s, i) => setCard(s, i < G.board.length ? G.board[i] : null, '', { flip: true, delay: G.street === 1 && i < 3 ? i * 170 * spd() : 0 }));
    setText($('pot'), pot());
    setText($('street'), (G.over ? t('g.handOver') : G.dealing ? t('g.dealing') : streetName(G.street)) + (G.scenario ? ' · ' + plain(G.scenario) : ''));
    // hráč
    const h = hero();
    heroSlots.forEach((s, i) => { setCard(s, G.revealed ? h.cards[i] : null, 'lg', { flip: true, delay: i * 130 }); s.style.visibility = h.seen > i ? '' : 'hidden'; });
    $('heroPanel').classList.toggle('turn', G.turn === 0 && !G.over && !G.dealing);
    setText($('heroStack'), h.stack);
    const hp = posLabel(0), hbb = Math.round((h.stack + h.bet) / BB * 10) / 10;
    setHTML($('heroPos'), settings.adv ? `${gl('pos.' + hp, hp)}${G.dealer === 0 ? ' · D' : ''} · ${gl('bb', hbb + ' BB')}` : `${gl('pos.' + hp, t('ps.' + hp))} <small>${hp}</small><br>${gl('bb', bbWords(hbb))}`);
    setText($('heroLast'), h.last || '');
    // šance
    $('odds').classList.toggle('off', !helpOn('odds')); $('odds').style.display = expert() ? 'none' : '';
    $('recPill').style.display = expert() ? 'none' : ''; updatePts();
    const tb = $('ptsTable'); if (tb) { tb.hidden = !settings.bankroll; setText(tb, settings.bankroll ? t('pts.table') + ' ' + fmtPts(h.stack + h.bet) : ''); }
    const live = G.players.slice(1).filter(q => !q.folded).length;
    if (G.eq && !h.folded && G.revealed) {
      setText($('eqWin'), Math.round(G.eq.equity * 100) + ' %');
      setText($('eqSub'), live ? t('g.eqSub', { n: live, vs: t(live === 1 ? 'g.opp1' : 'g.oppN'), r: t(G.players.slice(1).some(q => !q.folded && rangeOf(q)) ? 'g.rangeEst' : 'g.rangeRnd'), tie: Math.round(G.eq.tie * 100) }) : '\u00a0');
    } else { setText($('eqWin'), '–'); setText($('eqSub'), h.folded ? t('g.folded') : '\u00a0'); }
    setText($('madeLbl'), G.street === 0 ? t('g.startHand') : t('g.hand'));
    setHTML($('made'), !G.revealed ? '–' : G.street === 0 && G.board.length === 0 ? rich(`[[st:${h.cards[0]},${h.cards[1]}]]`) : PE.handName(h.cards.concat(G.board)));
    // doporučení (místo zůstává rezervované → nic neposkakuje)
    $('rec').style.display = helpOn('recs') ? '' : 'none';
    const showRec = helpOn('recs') && G.turn === 0 && G.rec && G.ctx && !G.over && !G.dealing;
    $('rec').classList.toggle('idle', !showRec);
    if (showRec) { setText($('recAct'), recLabel(G.rec)); setHTML($('recWhy'), rich(G.rec.why)); }
    // zpětná vazba
    const fb = G.feedback;
    $('feedback').style.display = helpOn('learn') ? '' : 'none';
    $('feedback').className = 'feedback ' + (fb ? fb.level : '') + (!fb || G.over ? ' idle' : '');
    if (fb) { $('fbTitle').innerHTML = `${fb.title} <span class="fb-sub">· ${t('g.yourAct', { a: fb.act, s: streetName(fb.street).toLowerCase() })}</span>`; setHTML($('fbTxt'), rich(settings.level === 1 ? shortTxt(fb.text) : fb.text)); }
    renderActions();
  }
  function recLabel(r) {
    const a = r.action, h = hero();
    return a === 'allin' ? `All-in ${r.to}` : r.allinCall ? t('a.callAllin', { n: G.ctx.toCall }) : a === 'bet' ? `Bet ${r.to}` : a === 'raise' ? (r.to >= h.stack + h.bet ? `All-in ${r.to}` : t('a.raiseTo', { n: r.to })) : a[0].toUpperCase() + a.slice(1);
  }
  function defaultSize() {
    const c = G.ctx;
    if (helpOn('recs') && G.rec && G.rec.to && (G.rec.action === 'bet' || G.rec.action === 'raise' || G.rec.action === 'allin')) return G.rec.to;
    if (G.street === 0) return Math.max(c.minRaiseTo, Math.min(c.stack + c.myBet, G.raises ? G.currentBet * 3 : 3 * BB));
    return Math.max(c.minRaiseTo, Math.min(c.stack + c.myBet, c.toCall ? G.currentBet * 3 : Math.round(c.pot * 0.66)));
  }
  let lastActions = '';
  function renderActions() {
    const el2 = $('actions'); let html;
    if (G.over) html = (expert() ? `<button class="btn" id="revBtn">${t('m.review')}</button>` : '') + `<button class="btn primary" id="nextBtn">${t('g.nextHand')}</button>`;
    else if (G.turn !== 0 || G.dealing || !G.ctx || !G.rec) html = `<div class="waiting">${G.dealing ? t('g.dealing') + '…' : hero().folded ? t('g.foldedWait') : G.turn > 0 ? t('g.thinking', { a: G.players[G.turn].name }) : t('g.dealing') + '…'}</div>`;
    else {
      const c = G.ctx, h = hero(), r = helpOn('recs') ? G.rec.action : '';
      const canRaise = h.stack > c.toCall, size = defaultSize(), allin = size >= h.stack + h.bet;
      html = `<button class="btn ${r === 'fold' ? 'hint' : ''}" data-a="fold" ${c.toCall === 0 ? 'disabled' : ''}>Fold</button>
      <button class="btn ${r === 'check' || r === 'call' ? 'hint' : ''} ${c.toCall >= h.stack ? 'allin' : ''}" data-a="${c.toCall ? 'call' : 'check'}">${c.toCall ? (c.toCall >= h.stack ? 'All-in ' + c.toCall : 'Call ' + c.toCall) : 'Check'}</button>
      <button class="btn ${r === 'bet' || r === 'raise' || r === 'allin' ? 'hint' : ''} ${allin ? 'allin' : ''}" data-a="${allin ? 'allin' : c.toCall ? 'raise' : 'bet'}" data-to="${size}" ${canRaise ? '' : 'disabled'}>${allin ? 'All-in' : c.toCall ? 'Raise' : 'Bet'} ${size}</button>
      <button class="btn round" id="sizeBtn" ${canRaise ? '' : 'disabled'} aria-label="${t('g.size')}">↑</button>`;
    }
    if (html === lastActions) return;
    lastActions = html; el2.innerHTML = html;
    if ($('nextBtn')) $('nextBtn').onclick = () => { SFX.unlock(); startHand(); };
    if ($('revBtn')) $('revBtn').onclick = showSummary;
    el2.querySelectorAll('[data-a]').forEach(b => b.onclick = () => heroAct(b.dataset.a, +b.dataset.to || undefined));
    if ($('sizeBtn')) $('sizeBtn').onclick = showSizes;
  }

  /* ---------- spodní panely ---------- */
  function openSheet(html) { $('sheet').innerHTML = '<div class="grab"></div>' + html; $('sheet').hidden = false; $('scrim').hidden = false; }
  function closeSheet() { $('sheet').hidden = true; $('scrim').hidden = true; }
  $('scrim').onclick = closeSheet;
  function showSizes() {
    const c = G.ctx, h = hero(), max = h.stack + h.bet;
    let opts;
    if (G.street === 0) opts = G.raises === 0 ? [[2.5 * BB, bbWords(2.5)], [3 * BB, bbWords(3)], [4 * BB, bbWords(4)]] : [[G.currentBet * 2.5, '2,5×'], [G.currentBet * 3, '3×'], [G.currentBet * 4, '4×']];
    else opts = c.toCall ? [[G.currentBet * 2.5, '2,5×'], [G.currentBet * 3, '3×'], [G.currentBet + c.pot + c.toCall, 'pot']] : [[c.pot / 3, t('sz.third')], [c.pot / 2, t('sz.half')], [c.pot * 0.66, t('sz.twoThirds')], [c.pot, 'pot']];
    opts = opts.map(([v, l]) => [Math.min(max, Math.max(c.minRaiseTo, Math.round(v))), l]).concat([[max, 'all-in']]);
    const recTo = helpOn('recs') && G.rec && G.rec.to;
    const verb = c.toCall ? t('a.raiseToV') : 'Bet';
    openSheet(`<h2>${t('sz.title')}</h2><div class="sub">${t('sz.sub', { min: c.minRaiseTo, pot: c.pot })}${recTo ? ' · ' + t('sz.rec', { n: recTo }) : ''}</div>
      <div class="sizes">${opts.map(([v, l]) => `<button class="btn ${v === recTo ? 'rec-size' : ''} ${v === max ? 'allin' : ''}" data-to="${v}">${v === max ? 'All-in' : verb} ${v}<small>${l}</small></button>`).join('')}</div>`);
    $('sheet').querySelectorAll('[data-to]').forEach(b => b.onclick = () => { closeSheet(); heroAct(c.toCall ? 'raise' : 'bet', +b.dataset.to); });
  }
  const gradeOf = d => PE.grade(PE.recommend(d.ctx), d.action, d.ctx);   // přepočet → vždy v aktuálním jazyce
  function showSummary() {
    if (!G.over) return;
    const net = G.heroNet;
    const title = net > 0 ? t('s.won', { n: net }) : net < 0 ? t('s.lost', { n: -net }) : (G.winners.length > 1 ? t('s.split') : t('s.even'));
    const wn = G.winners.map(w => w.hero ? t('you').toLowerCase() : w.name).join(', ');
    const sd = alive().length > 1;
    let html = `<h2>${title}</h2><div class="sub">${sd ? t('s.sd', { w: wn, h: PE.handName(G.winners[0].cards.concat(G.board)).toLowerCase() }) : t('s.folds', { w: wn })} · pot ${pot()}</div>`;
    if (sd) {
      html += `<h3>${t('s.cards')}</h3><div class="sum-board">${G.board.map(c => cardHTML(c, 'sm')).join('')}</div>` + G.players.filter(p => p.show).map(p =>
        `<div class="showline ${G.winners.includes(p) ? 'winner' : ''}"><span class="who">${pname(p)}</span>${p.cards.map(c => cardHTML(c, 'sm')).join('')}<span class="hn">${PE.handName(p.cards.concat(G.board))}</span></div>`).join('');
    }
    if (helpOn('learn') || expert()) {
      html += `<h3>${t('s.review')}</h3>`;
      const gs = G.decisions.map(gradeOf);
      html += G.decisions.length ? G.decisions.map((d, i) => `<div class="dec"><span class="g ${gs[i].level}"></span><div><b>${streetName(d.street)}: ${d.action}${d.to ? ' ' + d.to : ''}</b> · ${gs[i].title}${d.street ? ` · ${t('s.eq', { n: Math.round(d.eq * 100) })}` : ''}<div class="t">${rich(gs[i].text)}</div></div></div>`).join('')
        : `<div class="sub">${t('s.noDec')}</div>`;
      const good = gs.filter(g => g.level === 'good' || g.level === 'ok').length;
      if (G.decisions.length) html += `<div class="sub" style="margin-top:10px">${t('s.tally', { a: good, b: G.decisions.length })}</div>`;
    }
    html += `<button class="btn primary wide" id="sumNext">${t('g.nextHand')}</button>`;
    openSheet(html);
    $('sumNext').onclick = startHand;
  }
  function showGameMenu() {
    openSheet(`<h2>Red River</h2><div class="menu-list">
      <button class="mrow" data-m="settings">⚙️<span>${t('m.settings')}</span></button>
      <button class="mrow" data-m="stats">📊<span>${t('m.stats')}</span></button>
      <button class="mrow" data-m="shop">🪙<span>${t('pts.shop')}</span></button>
      ${G.over && G.handNo ? `<button class="mrow" data-m="summary">🧾<span>${t('m.summary')}</span></button>` : ''}
      <button class="mrow" data-m="learn">📘<span>${t('m.learn')}</span></button>
      <button class="mrow" data-m="home">🏠<span>${t('m.home')}</span></button></div>`);
    $('sheet').querySelectorAll('[data-m]').forEach(b => b.onclick = () => { const m = b.dataset.m; closeSheet();
      if (m === 'summary') showSummary(); else if (m === 'home') nav.back(); else nav.go(m); });
  }
  /* málo bodů → nabídka, jak je získat */
  function needPoints(need) {
    G.dealing = false; render();
    openSheet(`<h2>${t('pts.need')}</h2><div class="sub">${t('pts.needTxt', { n: fmtPts(need), h: fmtPts(wallet.points) })}</div>
      <button class="btn primary wide" id="npShop">${t('pts.toShop')}</button>`);
    $('npShop').onclick = () => { closeSheet(); nav.go('shop'); };
  }
  $('ptsBadge').onclick = () => nav.go('shop');
  $('recToggle').onchange = e => { settings.recs = e.target.checked; save('pt_settings', settings); lastActions = ''; render(); };
  $('gameMenu').onclick = showGameMenu;
  document.addEventListener('click', e => { const x = e.target.closest('.rec-why,.feedback .txt'); if (x) x.classList.toggle('open'); });

  /* ---------- domovská obrazovka ---------- */
  function renderHome() {
    const acc = stats.decisions ? Math.round((stats.good + stats.ok) / stats.decisions * 100) + ' %' : '–';
    applyBlinds();
    const bank = settings.bankroll ? (G.players.length && G.tableKey === tableKey() ? hero().stack : session.key === `${settings.blinds}|${settings.depth}` && session.hero ? session.hero : START) : null;
    setText($('bankLbl'), settings.bankroll ? t('h.bankroll') : t('h.profit'));
    setText($('bankV'), bank != null ? fmtNum(bank) : (stats.profit >= 0 ? '+' : '') + fmtNum(stats.profit));
    setText($('accV'), acc);
    setText($('bankS'), settings.bankroll && session.hands ? t('h.session', { n: session.hands, bb: (session.netBB >= 0 ? '+' : '−') + plain('[[bb:' + Math.abs(session.netBB) + ']]') }) : stats.hands ? t('h.total', { n: stats.hands }) : t('h.fresh'));
    setText($('playLbl'), G.handNo ? t('h.continue') : t('h.play'));
    setText($('playSub'), t('h.playSub', { n: settings.opps + 1, sb: SB, bb: BB, d: plain('[[bb:' + settings.depth + ']]'), diff: t('diff.' + settings.diff).toLowerCase() }));
    setText($('homeLvl'), t('lv.' + settings.level)); updatePts();
    setText($('homeBuyin'), settings.bankroll ? t('pts.buyin', { n: fmtPts(START) }) : '');
  }
  const fmtNum = v => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  $('playBtn').onclick = () => { SFX.unlock(); nav.go('game'); };
  $('drillBtn').onclick = () => { SFX.unlock(); nav.go('drill'); };
  $('homeStats').onclick = () => nav.go('stats');
  $('homeLearn').onclick = () => nav.go('learn');
  $('homeMenu').onclick = () => nav.go('settings');
  $('homeLvlBtn').onclick = () => nav.go('settings');
  $('homePtsBtn').onclick = () => nav.go('shop');
  $('homeShop').onclick = () => nav.go('shop');

  /* ---------- nastavení ---------- */
  const tg = (k, title, sub) => `<div class="row"><div>${title}${sub ? `<small>${sub}</small>` : ''}</div><label class="tg"><input type="checkbox" data-k="${k}" ${settings[k] ? 'checked' : ''}><i></i></label></div>`;
  const seg = (k, title, opts, sub) => `<div class="row col"><div>${title}${sub ? `<small>${sub}</small>` : ''}</div><div class="seg full">${opts.map(([v, l]) => `<button data-s="${k}" data-v="${v}" class="${String(settings[k]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
  let confirmReset = false;
  function renderSettings() {
    const nOpp = settings.opps;
    $('setBody').innerHTML = `
      <h3>${t('set.level')}</h3><div class="grp">
        <div class="row col"><div><small>${t('set.levelSub')}</small></div><div class="seg full">${[0, 1, 2].map(l => `<button data-lv="${l}" class="${settings.level === l ? 'on' : ''}">${t('lv.' + l)}</button>`).join('')}</div><small class="lvd">${t('lv.' + settings.level + 'd')}</small></div>
      </div>
      <h3>${t('set.table')}</h3><div class="grp">
        ${seg('opps', t('set.opps'), [1, 2, 3, 4, 5, 6, 7, 8].map(k => [k, k]), t('set.oppsSub', { n: nOpp + 1, x: nOpp === 5 ? ' (6-max)' : nOpp === 8 ? ' ' + t('set.full') : '' }))}
        ${seg('diff', t('set.diff'), [[0, t('diff.0')], [1, t('diff.1')], [2, t('diff.2')]], t('set.diffSub.' + settings.diff))}
        ${seg('blinds', t('set.blinds'), BLINDS.map((b, i) => [i, b.join('/')]))}
        ${seg('depth', t('set.depth'), DEPTHS.map(d => [d, d + ' BB']), t('set.depthSub', { n: settings.depth * (BLINDS[settings.blinds] || BLINDS[0])[1] }))}
        ${tg('bankroll', t('set.bankroll'), t('set.bankrollSub'))}
        ${tg('randomDepth', t('set.random'), settings.bankroll ? t('set.randomOff') : t('set.randomSub'))}
        ${tg('shortStacks', t('set.short'), t('set.shortSub'))}
        <div class="note">${t('set.nextHand')}</div>
      </div>
      <h3>${t('set.help')}</h3><div class="grp">
        ${expert() ? `<div class="note">${t('set.expertOff')}</div>` : tg('recs', t('set.recs'), t('set.recsSub')) + tg('odds', t('set.odds'), t('set.oddsSub')) + tg('learn', t('set.learn'), t('set.learnSub'))}
        ${tg('adv', t('set.adv'), t('set.advSub'))}${tg('gloss', t('set.gloss'), t('set.glossSub'))}
      </div>
      <h3>${t('set.game')}</h3><div class="grp">
        ${seg('lang', t('set.lang'), [['cs', 'Čeština'], ['en', 'English']])}
        ${seg('speed', t('set.speed'), [[0, t('sp.0')], [1, t('sp.1')], [2, t('sp.2')]])}
        ${tg('sound', t('set.sound'))}${tg('vibrate', t('set.vibrate'), navigator.vibrate ? '' : t('set.vibNo'))}
      </div>
      <h3>${t('set.other')}</h3><div class="grp">
        <button class="row link" id="setIntro"><span>${t('set.intro')}</span><span class="val"></span></button>
        <button class="row link" id="setSession"><span>${t('set.newSession')}<small>${t('set.newSessionSub')}</small></span><span class="val"></span></button>
        <button class="row link" id="setReset"><span class="danger">${confirmReset ? t('set.resetConfirm') : t('set.reset')}</span></button>
        <div class="row"><span>${t('set.about')}</span><span class="muted">Red River ${APP_VERSION} · ${BUILD}</span></div>
      </div>
      <div class="about">${t('set.aboutTxt')}</div>`;
    const B = $('setBody');
    B.querySelectorAll('[data-k]').forEach(i => i.onchange = () => { settings[i.dataset.k] = i.checked; save('pt_settings', settings); SFX.tap(); if (i.dataset.k === 'bankroll') renderSettings(); lastActions = ''; if (i.dataset.k === 'adv' || i.dataset.k === 'gloss') setLang(I18N.lang); else if (G.players.length) render(); });
    B.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => { applyLevel(+b.dataset.lv); SFX.tap(); setLang(I18N.lang); renderSettings(); });
    B.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
      const k = b.dataset.s, v = k === 'lang' ? b.dataset.v : +b.dataset.v;
      settings[k] = v; save('pt_settings', settings); SFX.tap();
      if (k === 'lang') setLang(v);
      if (k === 'diff') G.players.slice(1).forEach(p => p.style = makeStyle());
      renderSettings();
    });
    $('setIntro').onclick = () => openOnboarding(true);
    $('setSession').onclick = () => { cashOut(); session = { key: '', hero: 0, bots: [], hands: 0, netBB: 0, dealer: -1 }; save('pt_session', session); G.tableKey = ''; toast(t('set.sessionDone')); };
    $('setReset').onclick = () => { if (!confirmReset) { confirmReset = true; renderSettings(); setTimeout(() => { confirmReset = false; if (nav.cur === 'settings') renderSettings(); }, 4000); return; }
      confirmReset = false; stats = fresh(STATS0); drillSt = Object.assign({}, DRILL0); save('pt_stats', stats); save('pt_drill', drillSt); renderSettings(); toast(t('set.resetDone')); };
  }

  function applyLevel(l) {
    settings.level = l; Object.assign(settings, LEVELS[l]); save('pt_settings', settings);
    G.players.slice(1).forEach(p => p.style = makeStyle()); lastActions = '';
  }

  /* ---------- statistiky v2: metriky s vysvětlením, styl hráče, grafy ---------- */
  const MIN_TYPE = 30;
  function playerType(s) {
    if (s.hands < MIN_TYPE) return null;
    const vpip = s.vpip / s.hands, pfr = s.pfr / s.hands, af = s.calls ? s.br / s.calls : s.br ? 3 : 1;
    const tight = vpip <= 0.28, aggr = af >= 1.5 || (vpip > 0 && pfr / vpip >= 0.6 && af >= 1);
    return tight ? (aggr ? 'tag' : 'rock') : (aggr ? 'lag' : 'station');
  }
  const TYPE_ICON = { tag: '🦈', rock: '🪨', lag: '🔥', station: '📞' };
  function lineChart(pts) {
    if (pts.length < 2) return `<div class="sub">${t('stx.noData')}</div>`;
    const W = 320, H = 120, P = 6, mn = Math.min(...pts), mx = Math.max(...pts), rg = mx - mn || 1;
    const xy = pts.map((v, i) => [P + i / (pts.length - 1) * (W - 2 * P), H - P - (v - mn) / rg * (H - 2 * P)]);
    const d = xy.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ');
    const last = xy[xy.length - 1];
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"><path d="${d} L${last[0].toFixed(1)} ${H} L${P} ${H} Z" class="area"/><path d="${d}" class="ln"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5" class="pt"/></svg>
      <div class="chart-ax"><span>${fmtPts(mn)}</span><span>${fmtPts(pts[pts.length - 1])}</span><span>${fmtPts(mx)}</span></div>`;
  }
  function barChart(types) {
    const tot = Object.values(types).reduce((a, b) => a + b, 0);
    if (!tot) return `<div class="sub">${t('stx.noData')}</div>`;
    const mx = Math.max(...Object.values(types));
    return `<div class="bars">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => { const v = types[i] || 0;
      return `<div class="bar"><span class="bl">${t('hand.' + i)}</span><span class="bt"><i style="width:${v ? Math.max(3, v / mx * 100) : 0}%"></i></span><span class="bv">${v}</span></div>`; }).join('')}</div>`;
  }
  let confirmStats = false;
  function renderStats() {
    const s = stats, pc = (a, b) => b ? Math.round(a / b * 100) + ' %' : '–';
    const af = s.calls ? (s.br / s.calls).toFixed(1) : s.br ? '∞' : '–';
    const M = [
      ['hands', s.hands], ['won', s.hands ? `${s.won} <small>(${pc(s.won, s.hands)})</small>` : '–'], ['vpip', pc(s.vpip, s.hands)], ['pfr', pc(s.pfr, s.hands)],
      ['af', af], ['wtsd', pc(s.sd, s.sawFlop)], ['wsd', pc(s.sdWon, s.sd)], ['allin', s.allins], ['bigpot', s.bigPot ? fmtPts(s.bigPot) : '–'],
      ['profit', `<span class="${s.profit >= 0 ? 'g' : 'r'}">${s.profit > 0 ? '+' : ''}${fmtPts(s.profit)}</span>`], ['agree', pc(s.recAgree, s.recN)], ['acc', pc(s.good + s.ok, s.decisions)]];
    const ty = playerType(s), d = drillSt, dot = c => `<span class="gdot g ${c}"></span>`;
    const typeHTML = ty ? `<div class="ptype"><div class="pt-ic"><img src="icons/lumi.svg" alt=""><span>${TYPE_ICON[ty]}</span></div><div><b>${t('pt.' + ty)}</b>${settings.adv ? ` <small>${t('pt.' + ty + '.a')}</small>` : ''}<p>${t('pt.' + ty + '.d')}</p></div></div>
        <h3>${t('stx.tips')}</h3><div class="grp tips">${[1, 2, 3].map(i => `<div class="row"><span>${rich(t('tip.' + ty + '.' + i))}</span></div>`).join('')}</div>`
      : `<div class="ptype more"><div class="pt-ic"><img src="icons/lumi.svg" alt=""><span>🃏</span></div><div><b>${t('stx.more')}</b><p>${t('stx.moreTxt', { n: MIN_TYPE, k: MIN_TYPE - s.hands })}</p><div class="prog"><i style="width:${Math.min(100, s.hands / MIN_TYPE * 100)}%"></i></div></div></div>`;
    const best = s.best >= 0 && s.bestCards.length ? `<div class="row"><span>${PE.handName(s.bestCards)}</span><span class="ex">${s.bestCards.map(c => cardHTML(c, 'sm')).join('')}</span></div>` : `<div class="row"><span class="muted">${t('stx.noData')}</span></div>`;
    $('statsBody').innerHTML = `<h3>${t('stx.type')}</h3>${typeHTML}
      <h3>${t('stx.overview')}</h3><div class="sub">${t('stx.tap')}</div>
      <div class="grid stx">${M.map(([k, v]) => `<button class="tile" data-sx="${k}"><div class="lbl">${settings.adv ? t('sx.' + k + '.a') : t('sx.' + k)}</div><div class="v">${v}</div></button>`).join('')}</div>
      <h3>${t('stx.best')}</h3><div class="grp">${best}</div>
      <h3>${t('stx.chartPts')}</h3><div class="grp chartbox">${lineChart(s.hist)}</div>
      <h3>${t('stx.chartHands')}</h3><div class="grp chartbox">${barChart(s.types)}</div>
      <h3>${t('stat.decisions', { n: s.decisions })}</h3><div class="grp">
        <div class="row"><span>${dot('good')} ${t('g.good')}</span><span>${s.good}</span></div>
        <div class="row"><span>${dot('ok')} ${t('g.ok')}</span><span>${s.ok}</span></div>
        <div class="row"><span>${dot('meh')} ${t('g.meh')}</span><span>${s.meh}</span></div>
        <div class="row"><span>${dot('bad')} ${t('g.bad')}</span><span>${s.bad}</span></div></div>
      <h3>${t('stx.drill')}</h3><div class="grp">
        <div class="row"><span>${t('stat.drillN')}</span><span>${d.n}</span></div>
        <div class="row"><span>${t('stat.drillAcc')}</span><span>${pc(d.good + d.ok, d.n)}</span></div>
        <div class="row"><span>${t('stat.best')}</span><span>${d.best}</span></div></div>
      <div class="grp" style="margin-top:14px"><button class="row link" id="stReset"><span class="danger">${confirmStats ? t('stx.resetConfirm') : t('stx.reset')}</span></button></div>`;
    $('statsBody').querySelectorAll('[data-sx]').forEach(b => b.onclick = () => { const k = b.dataset.sx; SFX.tap();
      openSheet(`<h2>${t('sx.' + k)}${settings.adv ? '' : ` <small class="muted">${t('sx.' + k + '.a')}</small>`}</h2><p class="sx-d">${t('sx.' + k + '.d')}</p><button class="btn primary wide" id="sxOk">${t('gl.ok')}</button>`);
      $('sxOk').onclick = closeSheet; });
    $('stReset').onclick = () => { if (!confirmStats) { confirmStats = true; renderStats(); setTimeout(() => { confirmStats = false; if (nav.cur === 'stats') renderStats(); }, 4000); return; }
      confirmStats = false; stats = fresh(STATS0); save('pt_stats', stats); renderStats(); toast(t('stx.resetDone')); };
  }

  /* ---------- učení ---------- */
  function renderLearn() {
    const ex = s => PE.parseCards(s).map(c => cardHTML(c, 'sm')).join('');
    const hands = [['AsKsQsJsTs', 8], ['9h9c9d9s2c', 7], ['KhKcKd7s7h', 6], ['2h5h9hJhKh', 5], ['5c6d7h8s9c', 4], ['QsQhQd4c8s', 3], ['JdJsTcTh3s', 2], ['AdAc9s6h2d', 1], ['AhJd8c5s3h', 0]];
    $('learnBody').innerHTML = `
      <button class="btn wide ghostbtn" id="learnIntro">${t('l.intro')}</button>
      <h3>${t('l.ranks')}</h3><div class="grp">${hands.map(([h, i], k) => `<div class="row lrow"><span><b>${k + 1}.</b> ${t('hand.' + i)}</span><span class="ex">${ex(h)}</span></div>`).join('')}</div>
      <h3>${t('l.pos')}</h3><div class="grp"><div class="txtblk">${t('l.posTxt')}</div></div>
      <h3>${t('l.odds')}</h3><div class="grp"><div class="txtblk">${t('l.oddsTxt')}</div></div>
      <h3>${t('l.push')}</h3><div class="grp"><div class="txtblk">${t('l.pushTxt')}</div></div>
      <h3>${t('l.chen')}</h3><div class="grp"><div class="txtblk">${t('l.chenTxt')}</div></div>
      <h3 id="glossary">${t('gl.title')}</h3><div class="sub">${t('gl.hint')}</div><div class="grp gloss-list">${I18N.GLOSS.map(k => `<button class="row link" data-g="${k}"><span>${t('gl.' + k + '.t')}</span><span class="val"></span></button>`).join('')}
        ${['BTN', 'CO', 'HJ', 'UTG', 'SB', 'BB'].map(c => `<button class="row link" data-g="pos.${c}"><span>${t('ps.' + c)} <small>${c}</small></span><span class="val"></span></button>`).join('')}</div>`;
    $('learnIntro').onclick = () => openOnboarding(true);
  }

  /* ---------- trénink situací: nekonečné náhodné spoty ---------- */
  const D = { spot: null, answered: null };
  const DBB = 2;
  function preOrder(N) { const P = POSITIONS[N]; return N === 2 ? ['BTN', 'BB'] : P.slice(3).concat(['BTN', 'SB', 'BB']); }
  function drillNew() {
    const types = ['push', 'push', 'vsOpen', 'vsShove', 'flopBet', 'flopBet', 'checked', 'checked', 'turnBet', 'riverBet', 'lowSpr'];
    const type = pick(types), deck = newDeck();
    const hole = [deck.pop(), deck.pop()];
    let N = 2 + randInt(8);
    const s = { type, hole, board: [], street: 0, N, opps: [] };
    const ord = () => preOrder(N);
    const blindOf = pos => pos === 'SB' || (N === 2 && pos === 'BTN') ? 1 : pos === 'BB' ? 2 : 0;
    const deal = k => { for (let i = 0; i < k; i++) s.board.push(deck.pop()); };
    let c;
    if (type === 'push') {
      const o = ord(), i = randInt(o.length - 1), pos = o[i], eff = 5 + randInt(11), my = blindOf(pos);
      s.pos = pos; s.eff = eff;
      s.opps = Array.from({ length: o.length - 1 - i }, () => ({ minChen: 0 }));
      c = { street: 0, pot: 3, toCall: DBB - my, currentBet: DBB, myBet: my, stack: eff * DBB - my, raisesThisStreet: 0, numOpp: s.opps.length, eff: eff * DBB };
      s.desc = t('dr.push', { n: N, pos: `[[p:${pos}]]`, eff: `[[bb:${eff}]]` });
    } else if (type === 'vsOpen' || type === 'vsShove') {
      if (N < 3) N = s.N = 3 + randInt(7);
      const o = ord(), vi = randInt(Math.max(1, o.length - 3)), hi = vi + 1 + randInt(o.length - vi - 1);
      const vpos = o[vi], pos = o[hi], my = blindOf(pos);
      s.pos = pos; s.vpos = vpos;
      if (type === 'vsOpen') {
        const open = pick([5, 6, 6, 7]);
        s.opps = [{ minChen: 8 }];
        c = { street: 0, pot: 3 + open - (blindOf(vpos)), toCall: open - my, currentBet: open, myBet: my, stack: 200 - my, raisesThisStreet: 1, numOpp: 1, eff: 200 };
        s.desc = t('dr.open', { v: `[[pn:${vpos}]]`, x: `[[bb:${open / DBB}]]`, pos: `[[p:${pos}]]` });
      } else {
        const sh = 6 + randInt(10), heff = 4 + randInt(Math.max(1, sh - 4));
        s.opps = [{ minChen: 6 }];
        c = { street: 0, pot: 3 + sh * DBB - blindOf(vpos), toCall: sh * DBB - my, currentBet: sh * DBB, myBet: my, stack: heff * DBB - my, raisesThisStreet: 1, numOpp: 1, eff: heff * DBB };
        s.desc = t('dr.shove', { v: `[[pn:${vpos}]]`, x: `[[bb:${sh}]]`, pos: `[[p:${pos}]]`, h: `[[bb:${heff}]]` });
      }
    } else {
      // postflop: preflop navýšení + dorovnání, soupeř(i) s odhadnutým rozsahem
      const street = type === 'turnBet' ? 2 : type === 'riverBet' ? 3 : type === 'checked' ? 1 + randInt(3) : 1;
      deal(street === 1 ? 3 : street === 2 ? 4 : 5);
      const nOpp = type === 'checked' && rnd() < 0.35 ? 2 : 1;
      s.opps = Array.from({ length: nOpp }, (_, i) => ({ minChen: i ? 5 : pick([5, 8, 8]) }));
      s.pos = pick(['BTN', 'CO', 'BB', 'SB', 'HJ']); s.ip = s.pos === 'BTN' || s.pos === 'CO';
      let base = (6 * nOpp + 7) * (street === 1 ? 1 : street === 2 ? 1.6 : 2.4);
      base = Math.round(base * (0.8 + rnd() * 0.6));
      let stack = Math.round(200 - base / (nOpp + 1));
      if (type === 'lowSpr') { stack = Math.round(base * (0.6 + rnd() * 1.1)); }
      const facing = type === 'flopBet' || type === 'turnBet' || type === 'riverBet' || (type === 'lowSpr' && rnd() < 0.5);
      const bet = facing ? Math.max(DBB, Math.round(base * pick([0.33, 0.5, 0.66, 0.75, 1]))) : 0;
      c = { street, pot: base + bet, toCall: Math.min(bet, stack), currentBet: bet, myBet: 0, stack, raisesThisStreet: facing ? 1 : 0, numOpp: nOpp, eff: stack };
      s.desc = facing ? t('dr.bet', { st: streetName(street).toLowerCase(), b: bet, p: base, pct: Math.round(bet / base * 100) }) : t(nOpp > 1 ? 'dr.checkedN' : 'dr.checked', { st: streetName(street).toLowerCase(), n: nOpp });
      if (type === 'lowSpr') s.desc += ' ' + t('dr.spr', { x: (stack / base).toFixed(1) });
      s.street = street;
    }
    c.hole = hole; c.board = s.board.slice(); c.bb = DBB; c.position = s.pos; c.limpers = 0;
    c.minRaiseTo = Math.min(c.stack + c.myBet, c.currentBet ? c.currentBet * 2 : DBB);
    const eqr = PE.equity(hole, s.board, s.opps, 4000);
    c.eq = eqr.equity; c.eqr = eqr;
    s.ctx = c; s.street = c.street;
    D.spot = s; D.answered = null;
    renderDrill();
  }
  function drillSize(c, rec) {
    if (rec.to && (rec.action === 'bet' || rec.action === 'raise')) return rec.to;
    const raw = c.street === 0 ? (c.raisesThisStreet ? c.currentBet * 3 : 3 * DBB) : c.toCall ? c.currentBet * 3 : Math.round(c.pot * 0.66);
    return Math.max(c.minRaiseTo, Math.min(c.stack + c.myBet, raw));
  }
  function renderDrill() {
    const s = D.spot; if (!s) return;
    const c = s.ctx, rec = PE.recommend(c), A = D.answered;
    setText($('drScore'), `${drillSt.good + drillSt.ok} / ${drillSt.n}` + (drillSt.streak > 1 ? ` · 🔥${drillSt.streak}` : ''));
    setText($('drKind'), t('drk.' + s.type) + ' · ' + t('dr.players', { n: s.N }));
    setHTML($('drDesc'), rich(s.desc));
    $('drBoard').innerHTML = [0, 1, 2, 3, 4].map(i => i < s.board.length ? cardHTML(s.board[i]) : `<div class="card ghost"></div>`).join('');
    setText($('drStreet'), streetName(c.street) + ' · ' + posShort(s.pos));
    setText($('drPot'), c.pot);
    $('drHero').innerHTML = s.hole.map(x => cardHTML(x, 'lg')).join('');
    const bb = x => Math.round(x / DBB * 10) / 10;
    $('drInfo').innerHTML = `<div><span class="lbl">${t('dr.stack')}</span><b>${c.stack}</b> <small>${plain('[[bb:' + bb(c.stack + c.myBet) + ']]')}</small></div>
      <div><span class="lbl">${t('dr.toCall')}</span><b>${c.toCall || '–'}</b>${c.toCall ? ` <small>${t('dr.need', { n: Math.round(c.toCall / (c.pot + c.toCall) * 100) })}</small>` : ''}</div>
      <div><span class="lbl">${t('g.hand')}</span><b>${c.street === 0 ? rich(`[[st:${s.hole[0]},${s.hole[1]}]]`) : PE.handName(s.hole.concat(s.board))}</b></div>`;
    // výsledek
    $('drResult').classList.toggle('idle', !A);
    if (A) {
      const g = PE.grade(rec, A.action, c);
      $('drFb').className = 'feedback ' + g.level;
      $('drFbT').innerHTML = `${g.title} <span class="fb-sub">· ${t('dr.best', { a: recName(rec, c) })}</span>`;
      setHTML($('drFbX'), rich(g.text));
      setText($('drEq'), t('dr.eqLine', { eq: Math.round(c.eq * 100), po: c.toCall ? Math.round(c.toCall / (c.pot + c.toCall) * 100) + ' %' : '–' }));
    }
    // akce
    const allin = c.stack + c.myBet, size = drillSize(c, rec), cls = a => (A ? (a === rec.action || (rec.action === 'raise' && a === 'bet') || (a === 'call' && rec.action === 'check') ? 'hint ' : '') + (A.action === a ? 'chosen' : '') : '');
    const facingAll = c.toCall >= c.stack;
    let html = `<div class="dr-grid">
      <button class="btn ${cls('fold')}" data-d="fold" ${c.toCall === 0 ? 'disabled' : ''}>Fold</button>
      <button class="btn ${cls(c.toCall ? 'call' : 'check')} ${facingAll ? 'allin' : ''}" data-d="${c.toCall ? 'call' : 'check'}">${c.toCall ? (facingAll ? 'All-in ' + c.toCall : 'Call ' + c.toCall) : 'Check'}</button>
      ${facingAll ? '' : `<button class="btn ${cls(c.toCall ? 'raise' : 'bet')}" data-d="${c.toCall ? 'raise' : 'bet'}" data-to="${size}" ${size >= allin ? 'disabled' : ''}>${c.toCall ? t('a.raiseTo', { n: size }) : 'Bet ' + size}</button>
      <button class="btn allin ${cls('allin')}" data-d="allin">All-in ${allin}</button>`}</div>`;
    if (A) html += `<button class="btn primary wide" id="drNext">${t('dr.next')}</button>`;
    $('drActions').innerHTML = html;
    if (!A) $('drActions').querySelectorAll('[data-d]').forEach(b => b.onclick = () => drillAnswer(b.dataset.d, +b.dataset.to || undefined));
    else $('drNext').onclick = () => { SFX.tap(); drillNew(); };
  }
  function recName(r, c) {
    const a = r.action;
    return a === 'allin' ? 'all-in' : r.allinCall ? 'call all-in' : a === 'raise' ? t('a.raiseTo', { n: r.to }).toLowerCase() : a === 'bet' ? 'bet ' + r.to : a;
  }
  function drillAnswer(action, to) {
    if (D.answered) return;
    const c = D.spot.ctx;
    if ((action === 'bet' || action === 'raise') && to >= c.stack + c.myBet) action = 'allin';
    D.answered = { action, to };
    const g = PE.grade(PE.recommend(c), action, c);
    drillSt.n++; drillSt[g.level]++;
    if (g.level === 'good' || g.level === 'ok') { drillSt.streak++; drillSt.best = Math.max(drillSt.best, drillSt.streak); SFX.chip(); vib(10);
      if (drillSt.streak % 5 === 0) addPts(PTS.streak, t('pts.streak', { n: drillSt.streak, p: PTS.streak })); }
    else { drillSt.streak = 0; SFX.fold(); vib([30, 40, 30]); }
    save('pt_drill', drillSt);
    renderDrill();
  }

  /* ---------- úvod (onboarding) ---------- */
  let obStep = 0, obReturn = false;
  const OB_N = 5;
  $('obLevels').innerHTML = '';
  [0, 1, 2].forEach(l => { const b = el('button', 'lvl'); b.dataset.ol = l; b.innerHTML = `<b data-i18n="lv.${l}">${t('lv.' + l)}</b><span data-i18n="lv.${l}d">${t('lv.' + l + 'd')}</span>`; $('obLevels').appendChild(b); });
  $('obLevels').onclick = e => { const b = e.target.closest('[data-ol]'); if (!b) return; SFX.tap(); applyLevel(+b.dataset.ol); setLang(I18N.lang); };
  function obRender(dir) {
    const sl = $('obSlides').children;
    [...sl].forEach((x, i) => { x.classList.toggle('on', i === obStep); x.classList.remove('in-f', 'in-b'); if (i === obStep && dir && !noAnim()) { void x.offsetWidth; x.classList.add(dir > 0 ? 'in-f' : 'in-b'); } });
    setText($('obStep'), `${obStep + 1} / ${OB_N}`);
    [...$('obLevels').children].forEach(b => b.classList.toggle('on', +b.dataset.ol === settings.level));
    [...$('obDots').children].forEach((d, i) => d.classList.toggle('on', i === obStep));
    setText($('obNext'), obStep === OB_N - 1 ? t('ob.start') : t('ob.next'));
  }
  function openOnboarding(fromSettings) { obStep = 0; obReturn = !!fromSettings; obRender(0); if (fromSettings) nav.go('onboarding'); else show('onboarding'); }
  function obDone() {
    try { localStorage.setItem('pt_onboarded', '1'); } catch (e) {}
    if (obReturn) nav.back(); else { try { history.replaceState({ s: 'home' }, ''); } catch (e) {} show('home', 'fwd'); }
  }
  $('obNext').onclick = () => { SFX.unlock(); SFX.tap(); if (obStep < OB_N - 1) { obStep++; obRender(1); } else obDone(); };
  $('obSkip').onclick = obDone;
  // swipe v úvodu
  (() => { let x0 = null; const z = $('obSlides');
    z.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    z.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (dx < -50 && obStep < OB_N - 1) { obStep++; obRender(1); } else if (dx > 50 && obStep > 0) { obStep--; obRender(-1); } }); })();

  /* ---------- body a obchod (bez skutečných plateb) ---------- */
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  const LESSONS = [['pos', 'l.pos', 'l.posTxt'], ['odds', 'l.odds', 'l.oddsTxt'], ['push', 'l.push', 'l.pushTxt'], ['chen', 'l.chen', 'l.chenTxt']];
  function renderShop() {
    const dailyOk = wallet.lastDaily !== today(), refillOk = wallet.points < PTS.refillMin;
    $('shopBody').innerHTML = `<div class="pts-hero"><div class="lbl">${t('pts.bal')}</div><div class="v">🪙 ${fmtPts(wallet.points)}</div>${settings.bankroll && session.hero > 0 && session.bank ? `<div class="sub">${t('pts.table')}: ${fmtPts(session.hero)}</div>` : ''}</div>
      <div class="grp">
        <div class="row"><div>${t('pts.daily')}<small>${t('pts.dailySub', { n: PTS.daily })}</small></div><button class="btn sm ${dailyOk ? 'primary' : ''}" id="shDaily" ${dailyOk ? '' : 'disabled'}>${dailyOk ? t('pts.claim') : t('pts.claimed')}</button></div>
        <div class="row"><div>${t('pts.refill')}<small>${t('pts.refillSub', { n: fmtPts(PTS.refillTo) })}</small></div><button class="btn sm ${refillOk ? 'primary' : ''}" id="shRefill" ${refillOk ? '' : 'disabled'}>${refillOk ? t('pts.refillBtn') : t('pts.refillNo', { n: PTS.refillMin })}</button></div>
      </div>
      <h3>${t('pts.learn')}</h3><div class="grp">${LESSONS.map(([k, ti]) => `<div class="row"><span>📘 ${t(ti)}</span><button class="btn sm ${wallet.lessons[k] ? '' : 'primary'}" data-les="${k}">${wallet.lessons[k] ? t('pts.lessonDone') : t('pts.lesson', { n: PTS.lesson })}</button></div>`).join('')}</div>
      <h3>${t('pts.packs')}</h3><div class="packs">${[[1, 5000], [2, 20000], [3, 100000]].map(([i, v]) => `<div class="pack"><div class="pk-ic">${'🪙'.repeat(i)}</div><b>${fmtPts(v)}</b><span>${t('pts.pack' + i)}</span><button class="btn sm soon" disabled>${t('pts.soon')}</button></div>`).join('')}</div>
      <div class="note">${t('pts.soonNote')}</div>
      <h3>${t('pts.earn')}</h3><div class="grp"><div class="txtblk">${t('pts.earnTxt', { g: PTS.good, s: PTS.streak })}</div></div>
      <div class="about">${t('pts.virtual')}</div>`;
    $('shDaily').onclick = () => { if (wallet.lastDaily === today()) return; wallet.lastDaily = today(); addPts(PTS.daily, t('pts.got', { n: PTS.daily })); SFX.win(); renderShop(); };
    $('shRefill').onclick = () => { if (wallet.points >= PTS.refillMin) return; addPts(PTS.refillTo - wallet.points, t('pts.got', { n: PTS.refillTo - wallet.points })); renderShop(); };
    $('shopBody').querySelectorAll('[data-les]').forEach(b => b.onclick = () => { const L = LESSONS.find(x => x[0] === b.dataset.les);
      openSheet(`<h2>${t(L[1])}</h2><div class="txtblk">${rich(t(L[2]))}</div><button class="btn primary wide" id="lesOk">${wallet.lessons[L[0]] ? t('gl.ok') : t('pts.lesson', { n: PTS.lesson })}</button>`);
      $('lesOk').onclick = () => { closeSheet(); if (!wallet.lessons[L[0]]) { wallet.lessons[L[0]] = 1; addPts(PTS.lesson, t('pts.got', { n: PTS.lesson })); } renderShop(); }; });
  }

  /* ---------- jazyk ---------- */
  function applyStatic() {
    document.documentElement.lang = I18N.lang;
    document.querySelectorAll('[data-i18n]').forEach(e => { e.textContent = t(e.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach(e => { e.innerHTML = rich(t(e.dataset.i18nHtml)); });
    document.querySelectorAll('[data-i18n-aria]').forEach(e => e.setAttribute('aria-label', t(e.dataset.i18nAria)));
  }
  function setLang(l) {
    I18N.set(l); applyStatic(); lastActions = '';
    if (G.ctx && G.turn === 0) G.rec = PE.recommend(G.ctx);
    if (G.lastDec && G.feedback) G.feedback = Object.assign({ street: G.lastDec.street, act: G.lastDec.action }, gradeOf(G.lastDec));
    if (G.players.length) render();
    obRender(0); renderHome(); if (D.spot) renderDrill();
    if (nav.cur === 'stats') renderStats(); if (nav.cur === 'learn') renderLearn(); if (nav.cur === 'shop') renderShop(); if (nav.cur === 'settings') renderSettings();
    if (!$('sheet').hidden && G.over) showSummary(); else closeSheet();
  }

  /* ---------- oznámení (toast) + aktualizace ---------- */
  let toastT = 0;
  function toast(msg, btn, fn, sticky) {
    setText($('toastTxt'), msg); $('toastBtn').hidden = !btn; if (btn) { setText($('toastBtn'), btn); $('toastBtn').onclick = fn; }
    $('toast').hidden = false; $('toast').classList.remove('out');
    clearTimeout(toastT); if (!sticky) toastT = setTimeout(() => { $('toast').classList.add('out'); setTimeout(() => $('toast').hidden = true, 250); }, 2600);
  }
  window.__rr = { updateReady: () => toast(t('upd.msg'), t('upd.btn'), () => location.reload(), true), toast };

  /* ---------- start ---------- */
  applyStatic();
  const onboarded = (() => { try { return localStorage.getItem('pt_onboarded') === '1'; } catch (e) { return true; } })();
  try { history.replaceState({ s: 'home' }, ''); } catch (e) {}
  if (onboarded) show('home'); else openOnboarding(false);
  const sp = $('splash');
  if (window.__NOSPLASH || FAST()) sp.remove();
  else setTimeout(() => { sp.classList.add('out'); setTimeout(() => sp.remove(), 420); }, reduced() ? 700 : 1500);

  updatePts();
  window.__poker = { startHand, heroAct, G, settings, drillNew, drillAnswer, D, nav, setLang, render, wallet, stats: () => stats, applyLevel, rich, plain, openGloss };
})();
