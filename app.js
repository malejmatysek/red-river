/* Red River (poker trenér) – obrazovky, herní smyčka, trénink situací a UI */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const t = (k, p) => I18N.t(k, p);
  const APP_VERSION = '1.8.0', BUILD = 'v23';
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
  const BLINDS = [[1, 2], [5, 10], [25, 50], [50, 100], [100, 200]];   // vyšší sázky odemykají ligy (leagues.js)
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
  const SETTINGS0 = { recs: false, odds: true, learn: true, opps: 5, shortStacks: true, v: 4, diff: 1, blinds: 0, depth: 100, randomDepth: false,
    bankroll: true, speed: 0, sound: true, vibrate: true, lang: navLang.startsWith('en') ? 'en' : 'cs', level: 0, adv: false, gloss: true, cDiff: 1, cMeter: false };
  const STATS0 = { hands: 0, won: 0, netBB: 0, vpip: 0, pfr: 0, decisions: 0, good: 0, ok: 0, meh: 0, bad: 0, v: 4,
    br: 0, calls: 0, sawFlop: 0, sd: 0, sdWon: 0, allins: 0, bigPot: 0, profit: 0, recN: 0, recAgree: 0, best: -1, bestCards: [], types: {}, hist: [], histP: [], playSec: 0, days: {} };
  const fresh = o => JSON.parse(JSON.stringify(o));
  /* úrovně hráče: předvolby (jednotlivá nastavení jde pak změnit) */
  const LEVELS = [
    { speed: 0, meter: true, recs: false, odds: true, learn: true, adv: false, gloss: true },
    { speed: 1, meter: false, recs: false, odds: true, learn: true, adv: false, gloss: true },
    { speed: 2, meter: false, recs: false, odds: false, learn: false, adv: true, gloss: false }];
  const expert = () => settings.level === 2;
  let classic = false;                            // Klasická hra: proti botům úplně bez nápověd
  const helpOn = k => !classic && !expert() && !!settings[k];
  const DRILL0 = { n: 0, good: 0, ok: 0, meh: 0, bad: 0, streak: 0, best: 0 };
  const settings = load('pt_settings', SETTINGS0);
  if (settings.v !== 4) { if (settings.v !== 3 && settings.v !== 2) { settings.opps = 5; settings.shortStacks = true; } settings.recs = false; settings.v = 4; save('pt_settings', settings); }   // v1.6: nejdřív se rozhodni, rada jen za body
  if (settings.meter == null) settings.meter = settings.level === 0;          // ukazatel síly: výchozí zapnutý pro začátečníky
  settings.opps = Math.max(1, Math.min(8, settings.opps | 0 || 5));
  if (!I18N.has(settings.lang)) settings.lang = 'cs';
  I18N.set(settings.lang);
  let stats = load('pt_stats', fresh(STATS0));
  if (stats.v !== 3 && stats.v !== 4) { stats.netBB = (stats.net || 0) / 2; delete stats.net; stats.v = 3; }   // starší verze: zisk v žetonech při BB 2
  if (stats.v === 3) { stats = Object.assign(fresh(STATS0), stats, { v: 4 }); save('pt_stats', stats); }
  stats.playSec = +stats.playSec || 0; stats.days = Object.assign({}, stats.days); stats.types = Object.assign({}, stats.types); stats.hist = (stats.hist || []).slice(); stats.bestCards = (stats.bestCards || []).slice();
  if (!Array.isArray(stats.histP)) stats.histP = stats.hands ? [0, stats.profit] : [];   // v1.3: zisk z rukou zvlášť od zůstatku
  /* body: virtuální měna (žádné skutečné platby, žádný výběr) */
  const PTS = { hint: 5, start: 1000, daily: 500, refillMin: 200, refillTo: 1000, good: 5, ok: 2, streak: 50, lesson: 100, diaRate: 500, login7: 3 };
  const wallet = load('pt_wallet', { points: PTS.start, lastDaily: '', lessons: {}, v: 1 });
  wallet.lessons = Object.assign({}, wallet.lessons);
  /* v1.3: diamanty, úspěchy, vzhled, kolo štěstí, série dní, výzvy dne */
  const dayStr = d => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  const today = () => dayStr(new Date());
  const W13 = { diamonds: 0, ach: {}, flags: {}, owned: { back: { red: 1 }, felt: { black: 1 }, lumi: { classic: 1 } }, equip: { back: 'red', felt: 'black', lumi: 'classic' },
    wheelDay: '', login: { last: '', streak: 0, best: 0 }, day: { d: '', hands: 0, drill: 0, dstreak: 0, done: {} } };
  for (const k in W13) if (wallet[k] == null || typeof wallet[k] !== typeof W13[k]) wallet[k] = fresh(W13[k]);
  ['back', 'felt', 'lumi'].forEach(k => { wallet.owned[k] = Object.assign({}, W13.owned[k], wallet.owned[k]); if (!wallet.equip[k]) wallet.equip[k] = W13.equip[k]; });
  if (!wallet.wheelDay && wallet.lastDaily === today()) wallet.wheelDay = wallet.lastDaily;   // dnešní starý bonus = dnešní otočení
  const saveW = () => { save('pt_wallet', wallet); updatePts(); };
  const fmtPts = v => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  function updatePts() {
    [['ptsV', wallet.points], ['homePts', wallet.points], ['diaV', wallet.diamonds], ['homeDia', wallet.diamonds]].forEach(([id, v]) => { const e = document.getElementById(id); if (e) e.textContent = fmtPts(v); });
    const wb = document.getElementById('homeWheelBadge'); if (wb) wb.hidden = wallet.wheelDay === today();
    const ws = document.getElementById('homeWheelSub'); if (ws && typeof I18N !== 'undefined') ws.textContent = wallet.wheelDay === today() ? I18N.t('wh.next', { t: untilMidnight(true) }) : I18N.t('ui.wheelSub');
  }
  function untilMidnight(short) {
    const n = new Date(), m = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1), s = Math.max(0, Math.floor((m - n) / 1000));
    const h = Math.floor(s / 3600), mi = Math.floor(s / 60) % 60, se = s % 60, z = x => String(x).padStart(2, '0');
    return short ? `${h}:${z(mi)}` : `${h}:${z(mi)}:${z(se)}`;
  }
  function addDia(n, msg) { if (!n) return; wallet.diamonds = Math.max(0, wallet.diamonds + n); saveW(); if (msg && !FAST()) toast(msg); }
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
      tap: () => tone(1400, 0.03, 'sine', 0.015), unlock: () => A(),
      tick: () => tone(2300, 0.022, 'square', 0.018),
      jackpot: () => { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.34, 'triangle', 0.055, i * 0.09)); tone(2093, 0.6, 'sine', 0.04, 0.56); }
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
    nav.cur = id; if ($('helpOv')) $('helpOv').hidden = true; playClock(id === 'game'); updateTabs(id, prev); onShow(id, prev);
  }
  nav.go = id => { try { history.pushState({ s: id }, ''); } catch (e) {} show(id, 'fwd'); };
  nav.back = () => { if (history.state && history.state.s && history.state.s !== 'home') history.back(); else show('home', 'back'); };
  nav.home = () => { try { history.replaceState({ s: 'home' }, ''); } catch (e) {} show('home', 'back'); };
  window.addEventListener('popstate', e => { closeSheet(); show((e.state && e.state.s) || 'home', 'back'); });
  document.addEventListener('click', e => { if (e.target.closest('[data-back]')) { SFX.tap(); nav.back(); } });
  /* v1.4.1: spodní lišta Obchod / Domů / Profil */
  const TABS = ['shop', 'home', 'profile'];
  function updateTabs(id, prev) {
    const on = TABS.includes(id), bar = $('tabbar'); if (!bar) return;
    bar.hidden = !on; document.body.classList.toggle('tabs', on);
    bar.querySelectorAll('[data-tabgo]').forEach(b => { const a = b.dataset.tabgo === id; b.classList.toggle('on', a); if (a) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (on && id !== 'home') $('scr-' + id).classList.toggle('tabroot', !(prev === 'game' || prev === 'drill'));
  }
  $('tabbar').onclick = e => {
    const b = e.target.closest('[data-tabgo]'); if (!b) return;
    const id = b.dataset.tabgo; SFX.tap();
    if (id === nav.cur) { const sc = $('scr-' + id); if (sc) sc.scrollTo({ top: 0, behavior: noAnim() ? 'auto' : 'smooth' }); return; }
    if (id === 'home') return nav.home();
    if (nav.cur === 'home' || !TABS.includes(nav.cur)) return nav.go(id);
    try { history.replaceState({ s: id }, ''); } catch (err) {}
    show(id, TABS.indexOf(id) > TABS.indexOf(nav.cur) ? 'fwd' : 'back');
  };
  /* čas strávený u stolu (pro Profil) */
  let playT0 = 0;
  function playClock(run) {
    const now = Date.now();
    if (playT0) { const sec = Math.min(4 * 3600, Math.round((now - playT0) / 1000)); playT0 = 0;
      if (sec >= 5) { stats.playSec = (stats.playSec || 0) + sec; stats.days[today()] = 1;
        const keep = Object.keys(stats.days).sort().slice(-14); stats.days = Object.fromEntries(keep.map(k => [k, 1])); save('pt_stats', stats); } }
    if (run && !document.hidden) playT0 = now;
  }
  document.addEventListener('visibilitychange', () => playClock(nav.cur === 'game'));
  function onShow(id, prev) {
    if (id === 'home') { renderHome(); renderHomeGuide(); }
    if (id === 'profile') renderProfile();
    if (id === 'settings') renderSettings();
    if (id === 'stats') renderStats();
    if (id === 'learn') renderLearn();
    if (id === 'guide') renderGuide();
    if (id === 'shop') renderShop();
    if (id === 'wheel') renderWheel();
    if (id === 'ach') renderAch();
    if (prev === 'wheel' && id !== 'wheel') clearInterval(wheelTimer);
    if (id === 'drill') { if (!D.spot) drillNew(); else renderDrill(); }
    if (window.OnlineUI) window.OnlineUI.onShow(id, prev);   // online stoly (online/ui.js)
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
    const link = settings.gloss && !(classic && nav.cur === 'game') && !(o && o.nolink), used = new Set(), ph = [];
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
    const x = t('gl.' + k + '.x');
    return { title: t('gl.' + k + '.t'), text: t('gl.' + k + '.d'), ex: x !== 'gl.' + k + '.x' ? x : '' };
  }
  function openGloss(k) {
    const g = glossInfo(k);
    $('gloss').innerHTML = `<div class="grab"></div><div class="gl-k">${t('gl.title')}</div><h2>${g.title}</h2><p>${g.text}</p>${g.ex ? `<div class="gx"><b>${t('gl.ex')}</b> ${rich(g.ex, { nolink: true })}</div>` : ''}
      <div class="gl-btns"><button class="btn primary" id="glOk">${t('gl.ok')}</button><button class="btn ghostbtn" id="glAll">${t('gl.all')}</button></div>`;
    $('gloss').hidden = false; $('glossScrim').hidden = false; SFX.tap();
    $('glOk').onclick = closeGloss;
    $('glAll').onclick = () => { closeGloss(); closeSheet(); gdTab = 'terms'; if (nav.cur === 'guide') renderGuide(); else nav.go('guide'); };
  }
  function closeGloss() { $('gloss').hidden = true; $('glossScrim').hidden = true; }
  $('glossScrim').onclick = closeGloss;
  document.addEventListener('click', e => { const g = e.target.closest('[data-g]'); if (!g || g.closest('#gloss') || (classic && g.closest('#scr-game'))) return; e.stopPropagation(); e.preventDefault(); openGloss(g.dataset.g); }, true);

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
      numOpp: opps.length, raisesThisStreet: G.raises, limpers, eq: eqr.equity, eqr, eff,
      pfAgg: G.pfAgg === seat, ip: G.players.every((q, i) => i === seat || q.folded || postOrder(i) < postOrder(seat)),
      oppArch: opps.map(q => q.style && q.style.arch).filter(Boolean) };
  }
  const postOrder = s => (s - G.dealer - 1 + n()) % n();                     // pořadí po flopu

  /* ---------- boti: náhodná jména, styly podle obtížnosti ---------- */
  /* boti: lidská AI (engine.js → PE.makeBot / PE.botDecide) – styl (tight, agresivní, blafař, dorovnávač…) + úroveň botů */
  const botLvl = () => Math.max(0, Math.min(2, (classic ? settings.cDiff : settings.diff) | 0));
  function makeStyle() { return PE.makeBot(botLvl(), rnd); }
  function syncBotLvl() { const L = botLvl(); G.players.forEach(p => { if (!p.hero && p.style) { p.style = PE.botOf(p.style, rnd); p.style.skill = L; } }); }
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
      G.players.push(sb ? { name: sb.name, color: sb.color, style: PE.botOf(sb.style, rnd), stack: sb.stack > 0 ? sb.stack : START } : newBot());
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
    G.deck = newDeck(); G.board = []; G.street = 0; G.over = false; G.decisions = []; G.feedback = null; G.lastDec = null; G.coach = null; G.hold = false; G.hint = false; G.retry = false;
    G.pfAgg = -1; G.read = G.read || session.read || {}; G.players.forEach(p => p.chk = false);
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
    if (G.over || G.dealing || G.hold) return;
    if (alive().length === 1) return finish();
    if (G.turn < 0) return nextStreet();
    const p = G.players[G.turn];
    if (p.hero) {
      G.ctx = ctxFor(0, heroIters(alive().length - 1)); G.eq = G.ctx.eqr; G.rec = PE.recommend(G.ctx); G.hint = false; G.retry = false;
      render(); SFX.turn(); vib(12);
    } else {
      G.ctx = null; G.rec = null;
      if (G.street > 0 || G.eqStreet !== G.street) { G.eq = PE.equity(hero().cards, G.board, G.players.slice(1).filter(q => !q.folded).map(q => ({ minChen: rangeOf(q) })), heroIters(alive().length - 1) >> 1); G.eqStreet = G.street; }
      render();
      const hand = G.handNo;
      const go = () => {
        const seat = G.turn; if (G.over || seat < 0 || G.players[seat].hero || hand !== G.handNo) return;
        if (!FAST() && nav.cur !== 'game') { G.paused = go; return; }
        const c = ctxFor(seat, n() > 5 ? 300 : 500), me = G.players[seat];
        c.checked = !!me.chk;
        c.read = hero().folded ? null : G.read;
        const d = PE.botDecide(c, me.style, rnd);
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
    if (p.hero) PE.readNote(G.read || (G.read = {}), G.street, action, toCall > 0, true);   // boti si všímají tvých zvyků
    if (action === 'check') p.chk = true;
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
      G.raises++; if (G.street === 0) G.pfAgg = seat;
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
    const retry = !!G.retry, coach = coachOn();
    const snap = coach ? snapG() : null, recTxt = recLabel(rec);
    const dec = { street: G.street, action, to, ctx, grade: gr, eq: ctx.eq };
    G.decisions.push(dec);
    if (!retry && !classic) {                      // opakovaný pokus (a Klasická hra) se do hodnocení ani bodů nepočítá
      stats.decisions++; stats[gr.level]++;
      if (helpOn('recs') || G.hint) { stats.recN++; if (gr.level === 'good') stats.recAgree++; }
      if (G.street > 0) { if (action === 'bet' || action === 'raise' || (action === 'allin' && ctx.toCall < h.stack)) stats.br++; else if (action === 'call' || action === 'allin') stats.calls++; }
      if (gr.level === 'good') addPts(PTS.good); else if (gr.level === 'ok') addPts(PTS.ok);
      coachStreak = gr.level === 'good' || gr.level === 'ok' ? coachStreak + 1 : 0;
    }
    G.retry = false;
    if (coach) { G.coach = { fb: gr, ctx, rec, recTxt, action, to, snap, retry, street: G.street, hint: !!G.hint, streak: coachStreak }; G.hold = true; }
    if (G.street === 0 && action !== 'fold' && !(action === 'check')) G.heroVpip = true;
    if (G.street === 0 && (action === 'raise' || action === 'bet' || action === 'allin')) G.heroPfr = true;
    G.lastDec = dec;
    G.feedback = helpOn('learn') ? Object.assign({ street: G.street, act: action }, gr) : null;
    act(0, action, to);
    if (G.coach) render();
  }
  /* ---------- v1.6: trénink „nejdřív se rozhodni“ ---------- */
  let coachStreak = 0;
  const coachOn = () => helpOn('learn');
  const SNAP_SKIP = new Set(['paused', 'coach', 'hold', 'winners']);
  function snapG() { const o = {}; for (const k in G) if (!SNAP_SKIP.has(k) && typeof G[k] !== 'function') o[k] = G[k]; return JSON.stringify(o); }
  function coachGo() {
    if (!G.hold) return;
    G.coach = null; G.hold = false; lastActions = ''; SFX.tap();
    if (G.over) { render(); return; }
    loop(); render();
  }
  function coachRetry() {
    const c = G.coach; if (!c || !c.snap) return;
    Object.assign(G, JSON.parse(c.snap)); G.coach = null; G.hold = false; G.retry = true; lastActions = ''; SFX.tap();
    render();
  }
  function buyHint() {
    if (G.hint || !G.rec) return;
    if (wallet.points < PTS.hint) { toast(t('co.noPts')); return; }
    addPts(-PTS.hint); G.hint = true; lastActions = ''; SFX.chip(); render();
  }
  const ACT_NAME = a => ({ fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise', allin: 'All-in' })[a] || a;
  function whyNot(c) {
    // „Proč ne X?“ – ohodnocení doporučené akce (nebo nejbližší alternativy) stejným enginem
    const alt = c.fb.level === 'good' ? (c.action === 'fold' ? (c.ctx.toCall ? 'call' : 'check') : 'fold') : c.rec.action;
    const g = PE.grade(c.rec, alt, c.ctx);
    openSheet(`<h2>${t('co.whyNot', { a: ACT_NAME(alt) })}</h2><div class="sub">${g.title}</div><p class="why-p">${rich(g.text)}</p>
      <button class="btn primary wide" id="wnOk">${t('gl.ok')}</button>`);
    $('wnOk').onclick = closeSheet;
  }
  const pct = x => Math.round(x * 100) + ' %';
  function handHTML() {
    const h = hero();
    if (!G.revealed) return '–';
    if (!G.board.length) return rich(`[[st:${h.cards[0]},${h.cards[1]}]]`);
    return `<span class="gl" data-combo="1">${PE.handName(h.cards.concat(G.board))}</span>`;
  }
  function renderCoach() {
    const box = $('coach'), on = coachOn() || helpOn('recs');
    box.style.display = on ? '' : 'none';
    if (!on) return;
    const c = G.coach;
    const myTurn = G.turn === 0 && G.ctx && G.rec && !G.over && !G.dealing && !G.hold;
    box.classList.toggle('idle', !c && !myTurn);
    box.classList.toggle('fbk', !!c);
    $('odds').classList.toggle('cf-hide', !!c);
    if (c) {
      const f = c.fb, lv = f.level, x = c.ctx;
      $('feedback').className = 'cfb ' + lv;
      $('fbIc').textContent = lv === 'good' || lv === 'ok' ? '✓' : lv === 'meh' ? '½' : '✕';
      setText($('fbTitle'), t('co.t.' + lv));
      const mine = hero().last || ACT_NAME(c.action);
      setHTML($('fbSub'), c.retry ? t('co.s.retry', { a: mine }) : lv === 'good' ? t('co.s.good', { a: mine, n: PTS.good }) : lv === 'ok' ? t('co.s.ok', { a: mine, n: PTS.ok, r: c.recTxt }) : t('co.s.bad', { a: mine, r: c.recTxt }));
      setHTML($('fbCmp'), lv === 'good' ? '' : `<div class="no"><small>${t('co.yours')}</small><b>${mine}</b></div><div class="yes"><small>${t('co.better')}</small><b>${c.recTxt}</b></div>`);
      setHTML($('fbTxt'), rich(settings.level === 1 ? shortTxt(f.text) : f.text));
      const need = x.toCall ? x.toCall / (x.pot + x.toCall) : 0, ev = x.toCall ? Math.round(x.eq * (x.pot + x.toCall) - x.toCall) : 0;
      const cells = [[t('co.win'), pct(x.eq), x.eq >= Math.max(need, .5) ? 'g' : x.eq < need ? 'r' : '']];
      if (x.toCall) { cells.push([gl('ev', t('co.evCall')), (ev > 0 ? '+' : ev < 0 ? '−' : '') + Math.abs(ev), ev >= 0 ? 'g' : 'r']); cells.push([gl('potodds', t('co.potOdds')), pct(need), '']); }
      else cells.push([gl('pot', t('co.pot')), x.pot, '']);
      setHTML($('fbNums'), cells.map(([l, v, k]) => `<div><small>${l}</small><b class="${k}">${v}</b></div>`).join(''));
      setHTML($('fbBar'), x.toCall ? `<div class="ebar"><i class="${x.eq >= need ? 'g' : ''}" style="width:${Math.round(x.eq * 100)}%"></i><u style="left:${Math.round(need * 100)}%"></u></div><div class="ebar-l"><span>${t('co.need', { n: pct(need) })}</span><span>${t('co.have', { n: pct(x.eq) })}</span></div>` : '');
      setHTML($('fbStreak'), !c.retry && c.streak >= 2 ? `🔥 ${t('co.streak', { n: c.streak })}` : '');
      return;
    }
    if (!myTurn) return;
    const x = G.ctx, show = helpOn('recs') || G.hint;
    setText($('cqTag'), streetName(G.street) + ' · ' + t('co.turn'));
    setText($('cqH'), x.toCall ? t('co.qCall', { n: x.toCall }) : t('co.qFree'));
    setHTML($('cqP'), (G.board.length ? t('co.pPost', { h: handHTML() }) : t('co.pPre', { h: handHTML() })) + (coachOn() && !show ? ' ' + t('co.decide') : ''));
    $('rec').style.display = show ? '' : 'none';
    if (show) { setText($('recAct'), recLabel(G.rec)); setHTML($('recWhy'), rich(G.rec.why)); }
    $('hintBtn').style.display = show || !coachOn() ? 'none' : '';
    setHTML($('hintTxt'), t('co.lock', { n: PTS.hint }));
  }
  $('hintBtn').onclick = buyHint;
  function nextStreet() {
    G.players.forEach(p => { p.bet = 0; p.acted = false; p.chk = false; if (!p.folded && !p.allIn) p.last = ''; });
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
    trophiesForHand(heroWon && net > 0, sdHand, !heroWon && G.heroVpip && net < 0, classic ? LG.TROPHY.classicX : 1);
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
    if (!stats.histP.length) stats.histP.push(stats.profit - net);
    stats.histP.push(stats.profit);
    const thin = a => a.length > 400 ? a.filter((_, i, x) => i % 2 === 0 || i === x.length - 1) : a;
    stats.hist = thin(stats.hist); stats.histP = thin(stats.histP);
    if (heroWon && h0.allIn) wallet.flags.allinWin = 1;
    if (heroWon && pot() >= 50 * BB) wallet.flags.bigPot = 1;
    dayTick(); wallet.day.hands++; save('pt_wallet', wallet);
    save('pt_stats', stats);
    session.hands++; session.netBB = Math.round((session.netBB + net / BB) * 10) / 10;
    session.hero = hero().stack; session.dealer = G.dealer; session.bank = settings.bankroll;
    PE.readHand(G.read || (G.read = {})); session.read = G.read;
    session.bots = G.players.slice(1).map(p => ({ name: p.name, color: p.color, style: p.style, stack: p.stack }));
    save('pt_session', session);
    if (net > 0) { SFX.win(); vib([20, 40, 30]); }
    checkAch();
    render();
    const shown = G.players.filter(p => p.show && !p.hero).length;
    if (!expert() && !classic) setTimeout(() => { if (G.over && nav.cur === 'game') showSummary(); }, FAST() ? 0 : (1000 + shown * 450) * spd());
  }

  /* ---------- ukazatel síly ruky (jen vlastní karty + board; bez informací o soupeřích) ---------- */
  const meterOn = () => !!(classic ? settings.cMeter : settings.meter);
  const meterCache = { k: '', r: null };
  function meterHTML(hole, board) {
    const k = hole.join(',') + '|' + board.join(',');
    if (meterCache.k !== k) { meterCache.k = k; meterCache.r = PE.strength(hole, board, 500); }
    const r = meterCache.r;
    return `<span class="hsm-bar t${r.tier}">${[0, 1, 2, 3, 4].map(i => `<i class="${i <= r.tier ? 'f' : ''}"></i>`).join('')}</span><b>${t('hm.' + r.tier)}</b>`;
  }
  window.RRMeter = { html: meterHTML, on: () => !!settings.meter };
  function renderMeter() {
    const el = $('hsm'), h = hero(); if (!el) return;
    const show = meterOn() && h && h.cards && G.revealed && !h.folded && nav.cur === 'game';
    el.hidden = !show; if (show) setHTML(el, meterHTML(h.cards, G.board));
  }
  /* ---------- showdown: karty botů odkryté u stolu (všechny hry s boty) ---------- */
  function renderShowdown() {
    const el = $('sdStrip'); if (!el) return;
    const show = G.over && G.winners && alive().length > 1 && G.board.length === 5;
    el.hidden = !show; if (!show) { el.dataset.k = ''; return; }
    const k = G.handNo + '|' + G.players.filter(p => p.show).length; if (el.dataset.k === k) return; el.dataset.k = k;
    el.innerHTML = G.players.filter(p => p.show && !p.folded).map(p => `<div class="sd-row ${G.winners.includes(p) ? 'win' : ''}"><span class="sd-n">${pname(p)}</span><span class="sd-c">${p.cards.map(c => cardHTML(c, 'sm')).join('')}</span><span class="sd-h">${PE.handName(p.cards.concat(G.board))}</span>${G.winners.includes(p) ? '<span class="sd-w">✓</span>' : ''}</div>`).join('');
  }
  /* ---------- před hrou: úroveň botů (+ ukazatel síly) pro Trénovat i Klasickou hru ---------- */
  function openSetup(mode) {
    const cl = mode === 'classic', dk = cl ? 'cDiff' : 'diff', mk = cl ? 'cMeter' : 'meter';
    const draw = () => {
      openSheet(`<h2>${t(cl ? 'cl.title' : 'h.train')}</h2><div class="sub">${t(cl ? 'cl.setSub' : 'tr.setSub')}</div>
        <h3>${t('bl.title')}</h3><div class="bl-opts">${[0, 1, 2].map(v => `<button class="bl-opt ${(settings[dk] | 0) === v ? 'on' : ''}" data-bl="${v}"><b>${t('diff.' + v)}</b><small>${t('set.diffSub.' + v)}</small><span class="bl-dots">${'●'.repeat(v + 1)}${'○'.repeat(2 - v)}</span></button>`).join('')}</div>
        <div class="row setup-tg"><div>${t('hm.set')}<small>${t('hm.setSub')}</small></div><label class="tg"><input type="checkbox" id="setupMeter" ${settings[mk] ? 'checked' : ''}><i></i></label></div>
        ${cl ? `<div class="sub cl-note">${t('cl.note')}</div>` : ''}
        <button class="btn primary wide" id="setupGo">${t('cl.go')}</button>`);
      $('sheet').querySelectorAll('[data-bl]').forEach(b => b.onclick = () => { settings[dk] = +b.dataset.bl; save('pt_settings', settings); SFX.tap(); draw(); });
      $('setupMeter').onchange = e => { settings[mk] = e.target.checked; save('pt_settings', settings); };
      $('setupGo').onclick = () => { SFX.unlock(); classic = cl; closeSheet(); syncBotLvl(); lastActions = ''; nav.go('game'); };
    };
    draw();
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
      dl.textContent = 'D'; dl.dataset.g = 'dealer'; av.append(ini, dl);
      const nm = el('div', 'name'), nmT = el('span'), ps = el('span', 'pos'); nm.append(nmT, document.createTextNode(' · '), ps);
      const stk = el('div', 'stk'), stkT = el('span'); stk.dataset.g = 'stack'; const ai = el('em'); ai.textContent = 'all-in'; stk.append(stkT, ai);
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
    if (oppEls.length !== n() - 1) buildOpps();
    // soupeři
    G.players.slice(1).forEach((p, i) => {
      const e = oppEls[i], seat = i + 1;
      e.o.classList.toggle('folded', p.folded); e.o.classList.toggle('turn', G.turn === seat && !G.dealing);
      e.dl.style.visibility = G.dealer === seat ? '' : 'hidden';
      const pc = posLabel(seat); if (e.ps.dataset.g !== 'pos.' + pc || e.ps.title !== t('ps.' + pc)) { e.ps.dataset.g = 'pos.' + pc; e.ps.title = t('ps.' + pc); } setText(e.ps, pc); setText(e.stkT, p.stack);
      e.ai.style.display = p.allIn && !G.over ? '' : 'none';
      setText(e.chip, p.last || '-'); e.chip.classList.toggle('empty', !p.last); { const cg = chipTerm(p.last || ''); if ((e.chip.dataset.g || '') !== cg) { if (cg) e.chip.dataset.g = cg; else delete e.chip.dataset.g; } }
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
    const dmk = G.dealer === 0 ? ` <span class="dmini" id="heroDealer" data-g="dealer">D</span>` : '';
    setHTML($('heroPos'), settings.adv ? `${gl('pos.' + hp, hp)}${dmk} · ${gl('bb', hbb + ' BB')}` : `${gl('pos.' + hp, t('ps.' + hp))} <small>${hp}</small>${dmk}<br>${gl('bb', bbWords(hbb))}`);
    setText($('heroLast'), h.last || '');
    // šance
    $('odds').classList.toggle('off', !helpOn('odds')); $('odds').style.display = expert() || classic ? 'none' : '';
    $('kombiBtn').style.display = expert() || classic ? 'none' : ''; $('gameHelp').classList.toggle('dim', expert() || classic); updatePts();
    $('app').classList.toggle('classic', classic); renderMeter();
    renderShowdown();
    const tb = $('ptsTable'); if (tb) { tb.hidden = !settings.bankroll; setText(tb, settings.bankroll ? t('pts.table') + ' ' + fmtPts(h.stack + h.bet) : ''); }
    const live = G.players.slice(1).filter(q => !q.folded).length;
    if (G.eq && !h.folded && G.revealed) {
      setText($('eqWin'), Math.round(G.eq.equity * 100) + ' %');
      setText($('eqSub'), live ? t('g.eqSub', { n: live, vs: t(live === 1 ? 'g.opp1' : 'g.oppN'), r: t(G.players.slice(1).some(q => !q.folded && rangeOf(q)) ? 'g.rangeEst' : 'g.rangeRnd'), tie: Math.round(G.eq.tie * 100) }) : '\u00a0');
    } else { setText($('eqWin'), '–'); setText($('eqSub'), h.folded ? t('g.folded') : '\u00a0'); }
    setText($('madeLbl'), G.street === 0 ? t('g.startHand') : t('g.hand'));
    setHTML($('made'), handHTML());
    renderCoach();
    renderActions();
  }
  function recLabel(r) {
    const a = r.action, h = hero();
    return a === 'allin' ? `All-in ${r.to}` : r.allinCall ? t('a.callAllin', { n: G.ctx.toCall }) : a === 'bet' ? `Bet ${r.to}` : a === 'raise' ? (r.to >= h.stack + h.bet ? `All-in ${r.to}` : t('a.raiseTo', { n: r.to })) : a[0].toUpperCase() + a.slice(1);
  }
  function defaultSize() {
    const c = G.ctx;
    if ((helpOn('recs') || G.hint) && G.rec && G.rec.to && (G.rec.action === 'bet' || G.rec.action === 'raise' || G.rec.action === 'allin')) return G.rec.to;
    if (G.street === 0) return Math.max(c.minRaiseTo, Math.min(c.stack + c.myBet, G.raises ? G.currentBet * 3 : 3 * BB));
    return Math.max(c.minRaiseTo, Math.min(c.stack + c.myBet, c.toCall ? G.currentBet * 3 : Math.round(c.pot * 0.66)));
  }
  let lastActions = '';
  function renderActions() {
    const el2 = $('actions'); let html;
    if (G.coach) {
      const c = G.coach, bad = c.fb.level === 'meh' || c.fb.level === 'bad';
      html = (bad ? `<button class="btn" id="retryBtn">↺ ${t('co.retry')}</button>` : `<button class="btn" id="whyBtn">${t('co.whyNot', { a: ACT_NAME(c.fb.level === 'good' ? (c.action === 'fold' ? (c.ctx.toCall ? 'call' : 'check') : 'fold') : c.rec.action) })}</button>`)
        + `<button class="btn primary" id="goBtn">${G.over ? t('co.seeEnd') : t('co.go')}</button>`;
    }
    else if (G.over) html = (expert() ? `<button class="btn" id="revBtn">${t('m.review')}</button>` : '') + `<button class="btn primary" id="nextBtn">${t('g.nextHand')}</button>`;
    else if (G.turn !== 0 || G.dealing || !G.ctx || !G.rec) html = `<div class="waiting">${G.dealing ? t('g.dealing') + '…' : hero().folded ? t('g.foldedWait') : G.turn > 0 ? t('g.thinking', { a: G.players[G.turn].name }) : t('g.dealing') + '…'}</div>`;
    else {
      const c = G.ctx, h = hero(), r = helpOn('recs') || G.hint ? G.rec.action : '';
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
    if ($('goBtn')) $('goBtn').onclick = coachGo;
    if ($('retryBtn')) $('retryBtn').onclick = coachRetry;
    if ($('whyBtn')) $('whyBtn').onclick = () => whyNot(G.coach);
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
      <button class="mrow" data-m="shop">${ICON.pts(20)}<span>${t('pts.shop')}</span></button>
      <button class="mrow" data-m="wheel">${wheelMini(20)}<span>${t('wh.title')}</span></button>
      <button class="mrow" data-m="ach">${ICON.dia(20)}<span>${t('ach.title')}</span></button>
      ${G.over && G.handNo ? `<button class="mrow" data-m="summary">🧾<span>${t('m.summary')}</span></button>` : ''}
      <button class="mrow" data-m="learn">📘<span>${t('m.learn')}</span></button>
      <button class="mrow" data-m="home">🏠<span>${t('m.home')}</span></button></div>`);
    $('sheet').querySelectorAll('[data-m]').forEach(b => b.onclick = () => { const m = b.dataset.m; closeSheet();
      if (m === 'summary') showSummary(); else if (m === 'home') nav.back(); else nav.go(m); });
  }
  /* málo bodů → nabídka, jak je získat */
  function needPoints(need) {
    G.dealing = false; render();
    const wOk = wallet.wheelDay !== today(), exOk = wallet.diamonds > 0 && wallet.points < START, rfOk = wallet.points < PTS.refillMin;
    openSheet(`<h2>${t('pts.need')}</h2><div class="sub">${t('pts.needTxt', { n: fmtPts(need), h: fmtPts(wallet.points) })}</div>
      <div class="np-opts">
        <button class="btn wide ${wOk ? 'primary' : ''}" id="npWheel" ${wOk ? '' : 'disabled'}>${wheelMini()} ${wOk ? t('wh.go') : t('wh.next', { t: untilMidnight(true) })}</button>
        ${exOk ? `<button class="btn wide" id="npEx">${icx(t('dia.exBtn', { n: fmtPts(PTS.diaRate) }))} ${ICON.pts(15)}</button>` : ''}
        ${rfOk ? `<button class="btn wide" id="npRefill">${t('pts.refill')} → ${fmtPts(PTS.refillTo)}</button>` : ''}
        <button class="btn wide" id="npShop">${t('pts.toShop')}</button></div>`);
    $('npShop').onclick = () => { closeSheet(); nav.go('shop'); };
    if (wOk) $('npWheel').onclick = () => { closeSheet(); nav.go('wheel'); };
    if (exOk) $('npEx').onclick = () => { exchangeDia(); closeSheet(); if (wallet.points >= need) startHand(); else needPoints(need); };
    if (rfOk) $('npRefill').onclick = () => { refill(); closeSheet(); };
  }
  $('ptsBadge').onclick = () => nav.go('shop');
  $('kombiBtn').onclick = () => { SFX.tap(); openGuide('ranks'); };
  document.addEventListener('click', e => { if (e.target.closest('[data-combo]')) { e.preventDefault(); openCombo(); } });
  $('gameMenu').onclick = showGameMenu;
  $('gameHelp').onclick = openHelpOverlay;
  $('homeHelp').onclick = () => openScreenHelp('home');
  document.addEventListener('click', e => { const x = e.target.closest('.rec-why,.feedback .txt,.cfb .why'); if (x) x.classList.toggle('open'); });

  /* ---------- ligy (jako arény v Clash Royale): trofeje, odměny, obrazovka odemčení ---------- */
  const LG = window.RR_LEAGUES, LGS = LG.LEAGUES;
  let homeBank = null;
  const lgName = i => LGS[i].name[I18N.lang] || LGS[i].name.cs;
  function grantLeague(i, silent) {
    const r = LGS[i].reward || {};
    if (r.look) { const [k, id] = r.look; wallet.owned[k][id] = 1; if (!silent && (k !== 'lumi' || r.crown)) wallet.equip[k] = id; }
    if (r.badge) wallet.badges[LGS[i].id] = 1;
    if (r.pts && !silent) wallet.points = Math.round(wallet.points + r.pts);
  }
  if (wallet.trophies == null) {             // první spuštění s ligami: start podle dosavadních výher, odměny za prošlé ligy bez bodů
    wallet.badges = {}; wallet.trophies = Math.min(LGS[4].min, (stats.won || 0) * 2); wallet.league = LG.leagueOf(wallet.trophies);
    for (let i = 1; i <= wallet.league; i++) grantLeague(i, true);
    saveW();
  }
  wallet.badges = wallet.badges || {};
  const maxBlinds = () => LGS.slice(0, wallet.league + 1).reduce((m, l) => Math.max(m, l.reward.blinds || 0), 0);
  const lgQueue = [];
  function addTrophies(d) {
    if (!d) return;
    const floor = LGS[wallet.league].min;
    wallet.trophies = Math.max(floor, Math.round(wallet.trophies + d));
    while (wallet.league < LGS.length - 1 && wallet.trophies >= LGS[wallet.league + 1].min) { wallet.league++; grantLeague(wallet.league); lgQueue.push(wallet.league); }
    saveW(); applyLook(); renderLeagueRow();
    if (lgQueue.length) setTimeout(showLeagueUp, FAST() ? 0 : 1600);
  }
  /* trofeje za ruku: výhra +3 (+2 na showdownu), prohra po dobrovolném vstupu −1; Klasická hra a online ×2 */
  function trophiesForHand(won, sd, lost, mult) {
    const T = LG.TROPHY, d = won ? T.win + (sd ? T.sdWin : 0) : lost ? T.loss : 0;
    addTrophies(d * (mult || 1));
  }
  window.RRLeague = { hand: (won, sd, lost) => trophiesForHand(won, sd, lost, LG.TROPHY.onlineX), state: () => ({ trophies: wallet.trophies, league: wallet.league }), add: addTrophies };
  function lgProgress() {
    const i = wallet.league, cur = LGS[i], nx = LGS[i + 1];
    return { i, cur, nx, f: nx ? (wallet.trophies - cur.min) / (nx.min - cur.min) : 1 };
  }
  function renderLeagueRow() {
    const P = lgProgress(), ic = $('lgIc'); if (!ic) return;
    if (ic.dataset.i !== String(P.i)) { ic.innerHTML = LG.logo(P.i, 52, 'h'); ic.dataset.i = P.i; }
    setText($('lgName'), lgName(P.i));
    $('lgBar').style.width = Math.round(Math.min(1, P.f) * 100) + '%';
    setText($('lgSub'), P.nx ? t('lg.next', { n: fmtNum(P.nx.min - wallet.trophies), l: lgName(P.i + 1) }) : t('lg.top'));
    setHTML($('lgTr'), `${TROPHY_IC}<b>${fmtNum(wallet.trophies)}</b>`);
    $('homeLeague').classList.toggle('top', !P.nx);
    $('homeLeague').dataset.t = P.i < 2 ? 0 : P.i < 4 ? 1 : 2;
  }
  const TROPHY_IC = '<svg class="tr-ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v5M8 20h8"/></svg>';
  function rewardList(i) {
    const r = LGS[i].reward || {}, out = [];
    if (r.pts) out.push([ICON.pts(18), t('lg.rPts', { n: fmtNum(r.pts) })]);
    if (r.look) out.push(['<i class="rw-g">◐</i>', t('lg.rLook', { n: t(`lk.${r.look[0]}.${r.look[1]}`) })]);
    if (r.blinds) out.push(['<i class="rw-g">▲</i>', t('lg.rStakes', { b: BLINDS[r.blinds].join('/') })]);
    if (r.badge) out.push(['<i class="rw-g">★</i>', t('lg.rBadge')]);
    if (r.crown) out.push(['<i class="rw-g r">♛</i>', t('lg.rCrown')]);
    return out;
  }
  function showLeagueUp() {
    if (!lgQueue.length || !$('lgUp').hidden) return;
    const i = lgQueue.shift(), el = $('lgUp');
    el.className = 'lg-up l' + i;
    el.innerHTML = `<div class="lg-rays"></div><div class="lg-in"><div class="lg-kick">${t('lg.unlocked')}</div><div class="lg-big">${LG.logo(i, 210, 'u')}</div>
      <h1>${lgName(i)}</h1><div class="lg-tro">${TROPHY_IC} ${fmtNum(LGS[i].min)}</div>
      <div class="lg-rw">${rewardList(i).map(([ic, tx]) => `<div><span>${ic}</span>${tx}</div>`).join('')}</div>
      <button class="btn primary wide" id="lgOk">${t('lg.ok')}</button></div>`;
    el.hidden = false; SFX.win(); vib([20, 40, 20, 40, 60]);
    $('lgOk').onclick = () => { el.hidden = true; SFX.tap(); renderHome(); if (lgQueue.length) setTimeout(showLeagueUp, 300); };
  }
  function openLeagues() {
    const P = lgProgress();
    openSheet(`<h2>${t('lg.title')}</h2><div class="sub">${t('lg.how')}</div><div class="lg-list">${LGS.map((l, i) => {
      const st = i < P.i ? 'done' : i === P.i ? 'cur' : 'lock';
      return `<div class="lg-item ${st}" data-t="${i < 2 ? 0 : i < 4 ? 1 : 2}"><span class="lg-ic">${LG.logo(i, 56, 's' + i)}</span><div class="lg-it"><b>${lgName(i)}</b><small>${TROPHY_IC} ${fmtNum(l.min)}${st === 'done' ? ' · ✓' : st === 'cur' ? ' · ' + fmtNum(wallet.trophies) + (P.nx ? ' / ' + fmtNum(P.nx.min) : '') : ''}</small>
        ${i === P.i && P.nx ? `<span class="lg-bar"><i style="width:${Math.round(P.f * 100)}%"></i></span>` : ''}
        <div class="lg-rws">${rewardList(i).map(([ic, tx]) => `<span>${ic} ${tx}</span>`).join('')}</div></div></div>`; }).reverse().join('')}</div>`);
    const cur = $('sheet').querySelector('.lg-item.cur'); if (cur) setTimeout(() => cur.scrollIntoView({ block: 'center' }), 50);
  }
  $('homeLeague').onclick = () => { SFX.tap(); openLeagues(); };

  /* ---------- domovská obrazovka ---------- */
  function renderHome() {
    const acc = stats.decisions ? Math.round((stats.good + stats.ok) / stats.decisions * 100) + ' %' : '–';
    applyBlinds();
    const bank = settings.bankroll ? (G.players.length && G.tableKey === tableKey() ? hero().stack : session.key === `${settings.blinds}|${settings.depth}` && session.hero ? session.hero : START) : null;
    homeBank = { bank, acc, lbl: settings.bankroll ? t('h.bankroll') : t('h.profit'), v: bank != null ? fmtNum(bank) : (stats.profit >= 0 ? '+' : '') + fmtNum(stats.profit),
      sub: settings.bankroll && session.hands ? t('h.session', { n: session.hands, bb: (session.netBB >= 0 ? '+' : '−') + plain('[[bb:' + Math.abs(session.netBB) + ']]') }) : stats.hands ? t('h.total', { n: stats.hands }) : t('h.fresh') };
    renderLeagueRow();
    setText($('playLbl'), G.handNo ? t('h.continue') : t('h.train'));
    setText($('homeLvl'), t('lv.' + settings.level)); updatePts();
    setText($('homeAchSub'), t('ui.achSub', { n: Object.keys(wallet.ach).filter(k => ACH.some(a => a.id === k)).length, m: ACH.length }));
  }
  const fmtNum = v => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  $('playBtn').onclick = () => { SFX.unlock(); SFX.tap(); openSetup('train'); };
  $('homeClassic').onclick = () => { SFX.unlock(); SFX.tap(); openSetup('classic'); };
  $('drillBtn').onclick = () => { SFX.unlock(); nav.go('drill'); };
  $('homeStats').onclick = () => nav.go('stats');
  $('homeLearn').onclick = () => nav.go('learn');
  $('homeMenu').onclick = () => nav.go('settings');
  $('homeLvlBtn').onclick = () => nav.go('settings');
  $('homePtsBtn').onclick = () => nav.go('shop');
  $('homeDiaBtn').onclick = () => nav.go('ach');
  $('homeWheel').onclick = () => { SFX.unlock(); nav.go('wheel'); };
  $('homeAch').onclick = () => nav.go('ach');

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
        ${(() => { const mb = Math.max(maxBlinds(), +settings.blinds || 0), nl = LGS.findIndex(l => (l.reward.blinds || 0) > mb);
          return seg('blinds', t('set.blinds'), BLINDS.map((b, i) => [i, b.join('/')]).filter(([i]) => i <= mb), nl > 0 ? t('lg.stakesLock', { l: lgName(nl) }) : ''); })()}
        ${seg('depth', t('set.depth'), DEPTHS.map(d => [d, d + ' BB']), t('set.depthSub', { n: settings.depth * (BLINDS[settings.blinds] || BLINDS[0])[1] }))}
        ${tg('bankroll', t('set.bankroll'), t('set.bankrollSub'))}
        ${tg('randomDepth', t('set.random'), settings.bankroll ? t('set.randomOff') : t('set.randomSub'))}
        ${tg('shortStacks', t('set.short'), t('set.shortSub'))}
        <div class="note">${t('set.nextHand')}</div>
      </div>
      <h3>${t('set.help')}</h3><div class="grp">
        ${tg('meter', t('hm.set'), t('hm.setSub'))}
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
      if (k === 'diff' || k === 'cDiff') syncBotLvl();
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
  /* v1.4.1: ikonky typů hráče (Lumi) + Profil s grafem stylu */
  const LB = f => `<g fill="${f}"><circle cx="-40" cy="-10" r="44"/><circle cx="14" cy="-24" r="50"/><circle cx="50" cy="14" r="40"/><circle cx="-30" cy="28" r="38"/><circle cx="10" cy="30" r="42"/><circle cx="0" cy="4" r="48"/></g>`;
  const LEYES = '<ellipse cx="12" cy="-20" rx="9" ry="16" transform="rotate(-14 12 -20)" fill="#fff"/><ellipse cx="40" cy="-13" rx="9" ry="16" transform="rotate(-14 40 -13)" fill="#fff"/>';
  const LVB = 'viewBox="-100 -112 200 200" aria-hidden="true"';
  const TYPE_LUMI = {
    tag: `<svg ${LVB}>${LB('#FF2D4A')}<ellipse cx="12" cy="-14" rx="11" ry="6" fill="#fff"/><ellipse cx="42" cy="-8" rx="11" ry="6" fill="#fff"/><circle cx="15" cy="-13" r="3.5" fill="#111"/><circle cx="45" cy="-7" r="3.5" fill="#111"/><path d="M-2 -32 l26 9 M30 -20 l26 -2" stroke="#5a0b16" stroke-width="7" stroke-linecap="round"/></svg>`,
    lag: `<svg ${LVB}>${LB('#FF2D4A')}${LEYES}<path d="M-26 -112 l-22 44 h22 l-14 40 l40 -54 h-22 l14 -30z" fill="#fff" stroke="#000" stroke-width="5" stroke-linejoin="round"/></svg>`,
    rock: `<svg ${LVB}><defs><clipPath id="rkC"><circle cx="-40" cy="-10" r="44"/><circle cx="14" cy="-24" r="50"/><circle cx="50" cy="14" r="40"/><circle cx="-30" cy="28" r="38"/><circle cx="10" cy="30" r="42"/><circle cx="0" cy="4" r="48"/></clipPath></defs>${LB('#e8233f')}<g clip-path="url(#rkC)"><path d="M-100 -20 L-30 -60 L10 -100 L-100 -100Z" fill="#ff4a62"/><path d="M-30 -60 L40 -40 L100 -90 L10 -100Z" fill="#f73a54"/><path d="M40 -40 L100 20 L100 -90Z" fill="#c9182f"/><path d="M-100 -20 L-40 40 L-30 -60Z" fill="#d41c35"/><path d="M-40 40 L40 -40 L100 20 L60 100 L-60 100Z" fill="#b8142b"/><path d="M-30 -60 L40 -40 L-40 40Z" fill="#e02843"/><g fill="#6a0818" opacity=".7"><circle cx="-55" cy="10" r="4"/><circle cx="60" cy="40" r="5"/><circle cx="-10" cy="55" r="3.5"/><circle cx="30" cy="-60" r="3"/><circle cx="-60" cy="-35" r="3"/><circle cx="75" cy="-5" r="3"/></g><path d="M-30 -60 L40 -40 L100 20 M40 -40 L-40 40 M-100 -20 L-30 -60" stroke="#ff8a98" stroke-width="2.5" opacity=".5" fill="none"/></g><path d="M-14 -66 l10 20 l-14 14 l12 20 l-8 16" stroke="#4a0812" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M-10 -64 l10 20 l-14 14 l12 20" stroke="#ff8a98" stroke-width="2" fill="none" opacity=".5" transform="translate(4 0)"/><rect x="12" y="-20" width="16" height="7" rx="3.5" fill="#fff"/><rect x="38" y="-14" width="16" height="7" rx="3.5" fill="#fff"/></svg>`,
    station: `<svg ${LVB}>${LB('#FF2D4A')}<path d="M-20 -24 Q-40 30 -10 52 M86 -12 Q96 40 70 54" stroke="#2a0a10" stroke-width="5" fill="none"/><g transform="translate(26 -18) scale(1.3) translate(-26 18) rotate(-10 26 -16)"><rect x="-8" y="-38" width="30" height="40" rx="10" fill="#1a1a1e"/><rect x="30" y="-38" width="30" height="40" rx="10" fill="#1a1a1e"/><rect x="18" y="-28" width="16" height="14" rx="4" fill="#2c2c32"/><circle cx="7" cy="-28" r="11" fill="#3b3b44" stroke="#55555f" stroke-width="3"/><circle cx="45" cy="-28" r="11" fill="#3b3b44" stroke="#55555f" stroke-width="3"/><circle cx="3" cy="-32" r="4" fill="#fff" opacity=".85"/><circle cx="41" cy="-32" r="4" fill="#fff" opacity=".85"/></g></svg>`
  };
  const pctTxt = v => Math.round(v * 100) + ' %';
  const numTxt = v => I18N.lang === 'cs' ? v.toFixed(1).replace('.', ',') : v.toFixed(1);
  function fmtDur(sec) { const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60; return h ? t('pr.hm', { h, m }) : t('pr.m', { m }); }
  function radarHTML(s, ty) {
    const W = 326, H = 282, cx = W / 2, cy = 146, R = 92, has = !!ty;
    const vp = s.hands ? s.vpip / s.hands : 0, af = s.calls ? s.br / s.calls : s.br ? 3 : 0;
    const loose = Math.min(1, vp / 0.6), aggr = Math.min(1, af / 4), cl = x => Math.max(0.12, Math.min(1, x));
    const val = has ? { a: cl(aggr), v: cl(loose), p: cl(1 - aggr), o: cl(1 - loose) } : { a: .5, v: .5, p: .5, o: .5 };
    const P = [[cx, cy - R * val.a], [cx + R * val.v, cy], [cx, cy + R * val.p], [cx - R * val.o, cy]];
    const ring = k => `M${cx} ${cy - R * k} L${cx + R * k} ${cy} L${cx} ${cy + R * k} L${cx - R * k} ${cy}Z`;
    const Q = { tag: [3, 0, 70, 40], lag: [0, 1, 256, 40], rock: [3, 2, 70, 250], station: [1, 2, 256, 250] };
    let link = '';
    if (has) { const [i, j, ax, ay] = Q[ty], mx = (P[i][0] + P[j][0]) / 2, my = (P[i][1] + P[j][1]) / 2;
      link = `<path d="M${ax} ${ay} L${mx.toFixed(1)} ${my.toFixed(1)}" stroke="#FF2D4A" stroke-width="1" opacity=".9"/><circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="4" fill="#000" stroke="#FF2D4A" stroke-width="1.6"/>`; }
    const pc = (v, b) => (v / b * 100).toFixed(2) + '%';
    const chip = (k, pos) => `<div class="pr-ty ${ty === k ? 'on' : ''}" style="${pos}">${TYPE_LUMI[k]}<span>${t('pt.' + k)}</span></div>`;
    return `<div class="pr-ch"><svg class="pr-rad" viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs>
      <linearGradient id="prF" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF2D4A" stop-opacity=".75"/><stop offset=".6" stop-color="#9c1428" stop-opacity=".45"/><stop offset="1" stop-color="#3a3940" stop-opacity=".35"/></linearGradient>
      <radialGradient id="prB" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#2c2b33"/><stop offset="1" stop-color="#1f1e24"/></radialGradient></defs>
      <path d="${ring(1)}" fill="url(#prB)" stroke="#3a3940"/><path d="${ring(.66)}" fill="none" stroke="#34333b"/><path d="${ring(.33)}" fill="none" stroke="#34333b"/>
      <path d="M${cx} ${cy - R}V${cy + R}M${cx - R} ${cy}H${cx + R}" stroke="#3d3c44" stroke-dasharray="2 3"/>
      <path d="M${P.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' L')}Z" fill="${has ? 'url(#prF)' : 'rgba(142,141,150,.12)'}" stroke="${has ? '#FF2D4A' : '#55545c'}" stroke-width="1.6" stroke-linejoin="round" ${has ? '' : 'stroke-dasharray="4 4"'}/>
      ${has ? P.map(q => `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="2.6" fill="#fff"/>`).join('') : ''}${link}</svg>
      <div class="pr-ax" style="left:0;right:0;top:${pc(cy - R - 34, H)}"><b>${t('pr.aggr')}</b><span>${t('pr.aggrSub')}</span></div>
      <div class="pr-ax" style="left:0;right:0;top:${pc(cy + R + 5, H)}"><b>${t('pr.pass')}</b><span>${t('pr.passSub')}</span></div>
      <div class="pr-ax" style="left:0;width:${pc(cx - R - 2, W)};top:${pc(cy - 15, H)}"><b>${t('pr.tight')}</b><span>${t('pr.tightSub')}</span></div>
      <div class="pr-ax" style="right:0;width:${pc(cx - R - 2, W)};top:${pc(cy - 15, H)}"><b>${t('pr.loose')}</b><span>${t('pr.looseSub')}</span></div>
      ${chip('tag', 'left:0;top:5%')}${chip('lag', 'right:0;top:5%')}${chip('rock', 'left:0;bottom:1%')}${chip('station', 'right:0;bottom:1%')}</div>`;
  }
  function renderProfile() {
    const s = stats, ty = playerType(s), H = s.hands;
    $('profLvl').textContent = '🎓 ' + t('lv.' + settings.level);
    const vp = H ? s.vpip / H : 0, pf = H ? s.pfr / H : 0, af = s.calls ? s.br / s.calls : s.br ? 3 : 0;
    const seg = (n, f) => `<div class="pr-seg">${Array.from({ length: n }, (_, i) => `<i class="${i < f ? 'f' : ''}"></i>`).join('')}</div>`;
    const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return s.days[dayStr(d)] ? 1 : 0; });
    const nd = days.reduce((a, b) => a + b, 0);
    const card = (k, lbl, val, unit, bar, hint) => `<button class="pr-sc" data-prq="${k}"><div class="l">${lbl}<span class="q" aria-hidden="true">?</span></div><div class="v">${val}${unit ? `<small>${unit}</small>` : ''}</div>${bar}<div class="h">${hint}</div></button>`;
    const typeCard = ty ? `<div class="pr-type"><span class="ic">${TYPE_LUMI[ty]}</span><div><b>${t('pt.' + ty)}<small>${t('pt.' + ty + '.a')}</small></b><p>${t('pt.' + ty + '.d')}</p></div></div>`
      : `<div class="pr-type more"><span class="ic">${lumiSVG(wallet.equip.lumi)}</span><div><b>${t('stx.more')}</b><p>${t('stx.moreTxt', { n: MIN_TYPE, k: MIN_TYPE - H })}</p><div class="prog"><i style="width:${Math.min(100, H / MIN_TYPE * 100)}%"></i></div></div></div>`;
    const achN = Object.keys(wallet.ach).filter(k => ACH.some(a => a.id === k)).length;
    const P = lgProgress(), hb = homeBank || {};
    const bank = `<div class="bank pr-bank"><div><div class="lbl">${hb.lbl || t('h.profit')}</div><div class="v">${hb.v || '–'}</div></div><div><div class="lbl">${t('ui.accuracy')}</div><div class="v g">${hb.acc || '–'}</div></div><div class="s">${hb.sub || ''}</div></div>`;
    const lgCard = `<button class="pr-card pr-lg" id="prLg" data-t="${P.i < 2 ? 0 : P.i < 4 ? 1 : 2}"><span class="lg-ic">${LG.logo(P.i, 64, 'p')}</span><div class="lg-t"><span class="lg-k">${t('lg.kicker')}</span><b>${lgName(P.i)}</b>
      <span class="lg-bar"><i style="width:${Math.round(Math.min(1, P.f) * 100)}%"></i></span><small>${TROPHY_IC} ${fmtNum(wallet.trophies)}${P.nx ? ' / ' + fmtNum(P.nx.min) : ''}</small></div>
      <div class="pr-badges">${LGS.map((l, i) => wallet.badges[l.id] ? `<span class="pr-badge" title="${lgName(i)}">${LG.logo(i, 26, 'b' + i)}</span>` : '').join('')}</div></button>`;
    $('profBody').innerHTML = `${lgCard}${bank}<div class="pr-card"><div class="pr-hd"><b>${t('stx.type')}</b><span>${H ? t('pr.hands', { n: H }) : ''}</span></div>${radarHTML(s, ty)}${typeCard}</div>
      <div class="pr-grid">
        ${card('vpip', t('pr.vpip'), H ? pctTxt(vp) : '–', 'VPIP', seg(12, Math.round(Math.min(1, vp / 0.6) * 12)), t('pr.vpipH'))}
        ${card('pfr', t('pr.pfr'), H ? pctTxt(pf) : '–', 'PFR', seg(12, Math.round(Math.min(1, pf / 0.6) * 12)), t('pr.pfrH'))}
        ${card('af', t('pr.af'), s.calls || s.br ? numTxt(af) : '–', 'AF', seg(12, Math.round(Math.min(1, af / 4) * 12)), t('pr.afH'))}
        ${card('time', t('pr.time'), fmtDur(s.playSec || 0), '', `<div class="pr-seg">${days.map(d => `<i class="${d ? 'f' : ''}"></i>`).join('')}</div>`, t('pr.timeH', { n: nd }))}
      </div>
      <div class="pr-list">
        <button data-prgo="stats"><span class="li">📊</span>${t('ui.stats')}<span class="rt">${t('pr.statsSub')}</span><span class="ch">›</span></button>
        <button data-prgo="ach"><span class="li"><span data-ic="dia" data-sz="16"></span></span>${t('ach.title')}<span class="rt">${t('ach.sub', { n: achN, m: ACH.length })}</span><span class="ch">›</span></button>
        <button data-prgo="learn"><span class="li">📘</span>${t('ui.learn')}<span class="rt">${t('pr.learnSub')}</span><span class="ch">›</span></button>
        <button data-prgo="settings"><span class="li">⚙️</span>${t('ui.settings')}<span class="rt">${t('pr.setSub')}</span><span class="ch">›</span></button>
      </div>`;
    $('prLg').onclick = () => { SFX.tap(); openLeagues(); };
    $('profBody').querySelectorAll('[data-ic]').forEach(e => { e.innerHTML = ICON[e.dataset.ic](+e.dataset.sz || 16); });
    $('profBody').querySelectorAll('[data-prgo]').forEach(b => b.onclick = () => { SFX.tap(); nav.go(b.dataset.prgo); });
    $('profBody').querySelectorAll('[data-prq]').forEach(b => b.onclick = () => { const k = b.dataset.prq; SFX.tap();
      openSheet(`<h2>${t('pr.' + k)}</h2><p class="sx-d">${t('pr.' + k + 'Q')}</p><button class="btn primary wide" id="prOk">${t('gl.ok')}</button>`); $('prOk').onclick = closeSheet; });
  }
  $('profLvl').onclick = () => nav.go('settings');
  function lineChart(pts, signed, cls) {
    if (pts.length < 2) return `<div class="sub">${t('stx.noData')}</div>`;
    const W = 320, H = 120, P = 6, mn = Math.min(...pts, signed ? 0 : Infinity), mx = Math.max(...pts, signed ? 0 : -Infinity), rg = mx - mn || 1;
    const sg = v => signed ? (v > 0 ? '+' : v < 0 ? '−' : '') + fmtPts(Math.abs(v)) : fmtPts(v);
    const zy = H - P - (0 - mn) / rg * (H - 2 * P), zero = signed ? `<line x1="0" x2="${W}" y1="${zy.toFixed(1)}" y2="${zy.toFixed(1)}" class="zero"/>` : '';
    const xy = pts.map((v, i) => [P + i / (pts.length - 1) * (W - 2 * P), H - P - (v - mn) / rg * (H - 2 * P)]);
    const d = xy.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ');
    const last = xy[xy.length - 1];
    return `<svg class="chart ${cls || ''}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">${zero}<path d="${d} L${last[0].toFixed(1)} ${signed ? zy.toFixed(1) : H} L${P} ${signed ? zy.toFixed(1) : H} Z" class="area"/><path d="${d}" class="ln"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5" class="pt"/></svg>
      <div class="chart-ax"><span>${sg(mn)}</span><b class="${signed ? (pts[pts.length - 1] >= 0 ? 'g' : 'r') : ''}" data-end="${pts[pts.length - 1]}">${sg(pts[pts.length - 1])}</b><span>${sg(mx)}</span></div>`;
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
    const typeHTML = ty ? `<div class="ptype"><div class="pt-ic pt-lumi">${TYPE_LUMI[ty]}</div><div><b>${t('pt.' + ty)}</b>${settings.adv ? ` <small>${t('pt.' + ty + '.a')}</small>` : ''}<p>${t('pt.' + ty + '.d')}</p></div></div>
        <h3>${t('stx.tips')}</h3><div class="grp tips">${[1, 2, 3].map(i => `<div class="row"><span>${rich(t('tip.' + ty + '.' + i))}</span></div>`).join('')}</div>`
      : `<div class="ptype more"><div class="pt-ic">${lumiSVG(wallet.equip.lumi)}<span>🃏</span></div><div><b>${t('stx.more')}</b><p>${t('stx.moreTxt', { n: MIN_TYPE, k: MIN_TYPE - s.hands })}</p><div class="prog"><i style="width:${Math.min(100, s.hands / MIN_TYPE * 100)}%"></i></div></div></div>`;
    const best = s.best >= 0 && s.bestCards.length ? `<div class="row"><span>${PE.handName(s.bestCards)}</span><span class="ex">${s.bestCards.map(c => cardHTML(c, 'sm')).join('')}</span></div>` : `<div class="row"><span class="muted">${t('stx.noData')}</span></div>`;
    $('statsBody').innerHTML = `<h3>${t('stx.type')}</h3>${typeHTML}
      <h3>${t('stx.overview')}</h3><div class="sub">${t('stx.tap')}</div>
      <div class="grid stx">${M.map(([k, v]) => `<button class="tile" data-sx="${k}"><div class="lbl">${settings.adv ? t('sx.' + k + '.a') : t('sx.' + k)}</div><div class="v">${v}</div></button>`).join('')}</div>
      <h3>${t('stx.best')}</h3><div class="grp">${best}</div>
      <h3>${t('stx.chartPts')}</h3><div class="grp chartbox"><div class="chart-sub">${t('stx.chartPtsSub')}</div>${lineChart(s.histP, true)}</div>
      <h3>${t('stx.chartBal')}</h3><div class="grp chartbox"><div class="chart-sub">${t('stx.chartBalSub')}</div>${lineChart(s.hist, false, 'bal')}</div>
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
    const type = settings.drPack === 'bluff' ? 'bluff' : pick(types), deck = newDeck();
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
    } else if (type === 'bluff') {
      // blafování: slabá ruka / tah, checknuto k tobě (občas malá sázka), různí soupeři → blafovat, nebo ne?
      const street = 1 + randInt(3);
      deal(street === 1 ? 3 : street === 2 ? 4 : 5);
      const r = rnd(), nOpp = r < 0.1 ? 3 : r < 0.3 ? 2 : 1;
      const ARCHS = ['station', 'rock', 'tag', 'lag', 'maniac'], NAMES = ['Hana', 'Jakub', 'Eva'];
      s.arch = Array.from({ length: nOpp }, () => pick(ARCHS));
      s.opps = s.arch.map(a => ({ minChen: a === 'station' || a === 'maniac' ? 3 : a === 'rock' ? 8 : 6 }));
      s.pfAgg = rnd() < 0.65; s.pos = pick(['BTN', 'CO', 'BB', 'SB', 'HJ']); s.ip = s.pos === 'BTN' || s.pos === 'CO';
      const eq0 = PE.equity(hole, s.board, s.opps, 800).equity;
      const sv = PE.strength(hole, s.board, 500).v, dr = PE.draws(hole, s.board), semi = street < 3 && (dr.fd || dr.sd >= 2);
      if (eq0 >= 0.45 || !(sv < 0.42 || (semi && sv < 0.6))) return drillNew();   // chceme slabou ruku nebo tah, ne hotovou ruku
      let base = Math.round((6 * nOpp + 7) * (street === 1 ? 1 : street === 2 ? 1.6 : 2.4) * (0.8 + rnd() * 0.6));
      const stack = Math.round(200 - base / (nOpp + 1)), facing = nOpp === 1 && rnd() < 0.2;
      const bet = facing ? Math.max(DBB, Math.round(base * pick([0.33, 0.5]))) : 0;
      c = { street, pot: base + bet, toCall: bet, currentBet: bet, myBet: 0, stack, raisesThisStreet: facing ? 1 : 0, numOpp: nOpp, eff: stack,
        pfAgg: s.pfAgg, ip: s.ip, oppArch: s.arch.slice(), bluffDrill: true };
      s.desc = (facing ? t('dr.bBet', { st: streetName(street).toLowerCase(), b: bet, p: base, pct: Math.round(bet / base * 100) }) : t(nOpp > 1 ? 'dr.bChkN' : 'dr.bChk', { st: streetName(street).toLowerCase(), n: nOpp }))
        + ' ' + t(s.pfAgg ? 'dr.pfAgg' : 'dr.pfCall') + ' ' + s.arch.map((a, i) => t('dr.opp.' + a, { n: NAMES[i] })).join(', ') + '.';
      s.street = street;
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
    setText($('drKind'), t('drk.' + s.type) + ' · ' + t('dr.players', { n: s.type === 'bluff' ? c.numOpp + 1 : s.N }));
    setHTML($('drPacks'), ['mix', 'bluff'].map(k => `<button class="dr-pack ${(settings.drPack || 'mix') === k ? 'on' : ''}" data-pack="${k}">${t('dr.pack.' + k)}</button>`).join(''));
    $('drPacks').querySelectorAll('[data-pack]').forEach(b => b.onclick = () => { if ((settings.drPack || 'mix') === b.dataset.pack) return; settings.drPack = b.dataset.pack; save('pt_settings', settings); SFX.tap(); drillNew(); });
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
      $('drFbT').innerHTML = `${g.title} <span class="fb-sub">· ${g.bluff ? t('bf.sub') : t('dr.best', { a: recName(rec, c) })}</span>`;
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
    dayTick(); wallet.day.drill++; wallet.day.dstreak = Math.max(wallet.day.dstreak, drillSt.streak); save('pt_wallet', wallet);
    renderDrill(); checkAch();
  }

  const RANK_EX = { 9: 'Ah Kh Qh Jh Th', 8: '9s 8s 7s 6s 5s', 7: 'Qc Qd Qh Qs 7d', 6: 'Kh Kd Ks 4c 4h', 5: 'Ad Jd 8d 5d 2d', 4: 'Ts 9h 8d 7c 6s', 3: '7h 7c 7s Kd 2c', 2: 'Jc Jd 4s 4h Ad', 1: 'Ah Ad 9c 6s 3h', 0: 'Ad Jc 8h 5s 2d' };
  /* ---------- v1.6: Kombinace & pojmy (průvodce), kombinace u stolu, kvíz ---------- */
  const RK_ORDER = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
  const RK_HL = { 9: 5, 8: 5, 7: 4, 6: 5, 5: 5, 4: 5, 3: 3, 2: 4, 1: 2, 0: 1 };   // kolik prvních karet příkladu tvoří kombinaci
  const RK_FREQ = { 9: '0,003', 8: '0,03', 7: '0,17', 6: '2,6', 5: '3', 4: '4,6', 3: '4,8', 2: '23,5', 1: '43,8', 0: '17,4' };
  const freqTxt = i => (I18N.lang === 'en' ? RK_FREQ[i].replace(',', '.') : RK_FREQ[i]) + ' %';
  const cardsRow = (cs, size, hl) => cs.map((c, k) => cardHTML(c, size).replace('class="card', `class="card${hl != null && k >= hl ? ' dim' : ''}`)).join('');
  const GL_CATS = [['base', ['cards', 'preflop', 'flop', 'turn', 'river', 'suited', 'offsuit']], ['acts', ['fold', 'check', 'call', 'raise', 'allin', '3bet', 'pushfold']],
    ['table', ['dealer', 'blind', 'bb', 'pos', 'stack', 'pot', 'showdown']], ['nums', ['equity', 'potodds', 'ev', 'spr', 'range', 'strength']]];
  const GL_VIS = { cards: 'As Kd', preflop: 'As Kd', flop: 'Kh 7c 2d', turn: '9s', river: '3c', suited: 'Ah Kh', offsuit: 'Ah Kd',
    fold: 'Fold', check: 'Check', call: 'Call', raise: '!Raise', allin: '!All-in', '3bet': '3-bet', pushfold: 'Push/Fold', dealer: 'D', blind: 'SB · BB', bb: 'BB', pos: 'BTN',
    stack: '1 000', pot: 'Pot 24', showdown: '👀', equity: '62 %', potodds: '25 %', ev: '+11', spr: 'SPR 4', range: '22+', strength: '12/20' };
  function glVis(k) {
    const v = GL_VIS[k] || '';
    if (/^[2-9TJQKA][shdc]( |$)/.test(v)) return `<div class="gv-c">${cardsRow(PE.parseCards(v), 'xs')}</div>`;
    return `<span class="gchip${v[0] === '!' ? ' r' : ''}">${v.replace(/^!/, '')}</span>`;
  }
  let gdTab = 'ranks', gdCat = 'base', gdQ = '', quiz = null;
  function openGuide(tab) { closeSheet(); closeGloss(); gdTab = tab || gdTab; if (nav.cur === 'guide') renderGuide(); else nav.go('guide'); }
  function renderGuide() {
    document.querySelectorAll('#gdSeg [data-gt]').forEach(b => b.classList.toggle('on', b.dataset.gt === gdTab));
    const body = $('guideBody');
    if (gdTab === 'ranks') {
      body.innerHTML = `<div class="rkl">${RK_ORDER.map((i, n) => `<button class="rkr ${n < 3 ? 't' : ''}" data-rk="${i}"><span class="n">${n + 1}</span><span class="tx"><b>${t('rk.' + i)}</b><span>${t('rk.' + i + 'd')} · ${freqTxt(i)}</span></span><span class="rc">${cardsRow(PE.parseCards(RANK_EX[i]), 'xs', RK_HL[i])}</span></button>`).join('')}</div>
        <div class="gd-note">${t('gd.note')}</div><button class="btn wide" id="gdToQuiz" style="margin-top:12px">${t('gd.tryQuiz')}</button>`;
      $('gdToQuiz').onclick = () => { gdTab = 'quiz'; renderGuide(); };
    } else if (gdTab === 'terms') {
      body.innerHTML = `<label class="srch"><span>🔍</span><input id="gdSearch" type="search" placeholder="${t('gd.search')}" value="${gdQ.replace(/"/g, '&quot;')}"></label>
        <div class="cats">${GL_CATS.map(([c]) => `<button data-gc="${c}" class="${!gdQ && gdCat === c ? 'on' : ''}">${t('gd.c.' + c)}</button>`).join('')}</div><div class="gll" id="gdList"></div>`;
      const list = () => {
        const q = gdQ.trim().toLowerCase();
        const keys = q ? I18N.GLOSS.filter(k => (t('gl.' + k + '.t') + ' ' + t('gl.' + k + '.d')).toLowerCase().includes(q)) : GL_CATS.find(c => c[0] === gdCat)[1];
        $('gdList').innerHTML = keys.length ? keys.map(k => `<button class="gli" data-gk="${k}"><span class="vis">${glVis(k)}</span><span class="gtx"><b>${t('gl.' + k + '.t')}</b><span>${plain(t('gl.' + k + '.d'))}</span></span></button>`).join('') : `<div class="gd-note">${t('gd.none')}</div>`;
        body.querySelectorAll('[data-gc]').forEach(b => b.classList.toggle('on', !q && b.dataset.gc === gdCat));
      };
      list();
      $('gdSearch').oninput = e => { gdQ = e.target.value; list(); };
    } else {
      if (!quiz) quiz = { n: 0, ok: 0, streak: 0 };
      if (!quiz.cur) quiz.cur = quizDeal();
      const q = quiz.cur;
      body.innerHTML = `<div class="qz-h"><b>${t('gd.qTitle')}</b><span>${t('gd.qScore', { a: quiz.ok, b: quiz.n })}${quiz.streak > 1 ? ' · 🔥' + quiz.streak : ''}</span></div>
        ${q.hands.map((h, k) => `<button class="qz ${q.pick != null ? (k === q.win ? 'win' : k === q.pick ? 'lose' : '') : ''}" data-qz="${k}" ${q.pick != null ? 'disabled' : ''}><span class="qz-c">${cardsRow(h.cards, 'sm')}</span>${q.pick != null ? `<span class="qz-n">${t('rk.' + h.cat)}</span>` : `<span class="qz-n">${t(k ? 'gd.qB' : 'gd.qA')}</span>`}</button>`).join('')}
        ${q.pick != null ? `<div class="qz-fb ${q.pick === q.win ? 'good' : 'bad'}"><b>${q.pick === q.win ? t('gd.qOk') : t('gd.qBad')}</b> ${t('gd.qWhy', { a: t('rk.' + q.hands[q.win].cat), b: t('rk.' + q.hands[1 - q.win].cat).toLowerCase() })}</div><button class="btn primary wide" id="qzNext">${t('gd.qNext')}</button>` : ''}`;
      body.querySelectorAll('[data-qz]').forEach(b => b.onclick = () => { if (q.pick != null) return; q.pick = +b.dataset.qz; quiz.n++; if (q.pick === q.win) { quiz.ok++; quiz.streak++; SFX.chip(); vib(10); } else { quiz.streak = 0; SFX.fold(); vib([30, 40, 30]); } renderGuide(); });
      if ($('qzNext')) $('qzNext').onclick = () => { quiz.cur = quizDeal(); renderGuide(); };
    }
  }
  // kvíz: dvě 5karetní ruce různých kategorií (každá kategorie stejně často, ať to není pořád pár)
  function dealCat(want) {
    for (let tries = 0; tries < 4000; tries++) {
      const d = newDeck(); const cs = [];
      for (let i = 0; i < 5; i++) cs.push(d.splice(Math.floor(rnd() * d.length), 1)[0]);
      if (cat5(cs) === want) return cs;
    }
    return PE.parseCards(RANK_EX[want]);
  }
  function cat5(cs) { const sc = PE.evaluate(cs), c = PE.handCategory(sc); return c === 8 && Math.max(...cs.map(x => x >> 2)) === 12 && Math.min(...cs.map(x => x >> 2)) === 8 ? 9 : c; }
  function quizDeal() {
    const a = Math.floor(rnd() * 9); let b; do { b = Math.floor(rnd() * 9); } while (b === a);
    const ca = a >= 6 ? PE.parseCards(RANK_EX[a]).slice().sort(() => rnd() - .5) : dealCat(a), cb = b >= 6 ? PE.parseCards(RANK_EX[b]).slice().sort(() => rnd() - .5) : dealCat(b);
    const hands = [{ cards: ca, cat: a }, { cards: cb, cat: b }];
    return { hands, win: a > b ? 0 : 1, pick: null };
  }
  document.querySelectorAll('#gdSeg [data-gt]').forEach(b => b.onclick = () => { SFX.tap(); gdTab = b.dataset.gt; renderGuide(); });
  $('guideBody').addEventListener('click', e => {
    const g = e.target.closest('[data-gk]'); if (g) { openGloss(g.dataset.gk); return; }
    const c = e.target.closest('[data-gc]'); if (c) { gdCat = c.dataset.gc; gdQ = ''; renderGuide(); return; }
    const r = e.target.closest('[data-rk]'); if (r) openRankInfo(+r.dataset.rk);
  });
  function openRankInfo(i) {
    SFX.tap();
    const n = RK_ORDER.indexOf(i);
    openSheet(`<div class="gl-k">${t('gd.rankN', { n: n + 1 })}</div><h2>${t('rk.' + i)}</h2><div class="cb-c">${cardsRow(PE.parseCards(RANK_EX[i]), 'md', RK_HL[i])}</div>
      <p class="why-p">${t('rk.' + i + 'd')} ${t('gd.freq', { p: freqTxt(i) })}</p>${rankNeighbours(i)}
      <button class="btn primary wide" id="riOk" style="margin-top:14px">${t('gl.ok')}</button>`);
    $('riOk').onclick = closeSheet;
  }
  function rankNeighbours(i) {
    const n = RK_ORDER.indexOf(i), from = Math.max(0, Math.min(7, n - 1));
    return `<div class="rkl sm">${RK_ORDER.slice(from, from + 3).map((k, j) => `<div class="rkr ${k === i ? 'me' : 'fade'}"><span class="n">${from + j + 1}</span><span class="tx"><b>${t('rk.' + k)}</b></span><span class="rc">${cardsRow(PE.parseCards(RANK_EX[k]), 'xs', RK_HL[k])}</span></div>`).join('')}</div>`;
  }
  // klepnutí na „Tvoje ruka“ u stolu → jaká je to kombinace a kde je v žebříčku
  function best5(cs) {
    let best = null, bs = -1;
    const n = cs.length;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      const five = cs.filter((_, k) => k !== a && k !== b);
      if (n === 5) { return { cards: cs.slice(), sc: PE.evaluate(cs) }; }
      const sc = PE.evaluate(five); if (sc > bs) { bs = sc; best = five; }
    }
    if (n === 6) { cs.forEach((_, k) => { const f = cs.filter((_, j) => j !== k), sc = PE.evaluate(f); if (sc > bs) { bs = sc; best = f; } }); }
    return { cards: best, sc: bs };
  }
  function orderBest(cs, cat) {
    // nejdřív karty, které kombinaci tvoří, pak kickery (od nejvyšší)
    const cnt = {}; cs.forEach(c => { cnt[c >> 2] = (cnt[c >> 2] || 0) + 1; });
    const sorted = cs.slice().sort((x, y) => (cnt[y >> 2] - cnt[x >> 2]) || ((y >> 2) - (x >> 2)));
    const core = [1, 2, 3, 7].includes(cat) ? sorted.filter(c => cnt[c >> 2] >= 2).length : cat === 0 ? 1 : 5;
    return { cards: sorted, hl: core };
  }
  function openCombo() {
    if (!G.players.length || !G.revealed || !G.board.length) { openGuide('ranks'); return; }
    SFX.tap();
    const h = hero(), all = h.cards.concat(G.board), b = best5(all), cat = cat5(b.cards), o = orderBest(b.cards, cat), n = RK_ORDER.indexOf(cat);
    const beats = n > 0 ? t('rk.' + RK_ORDER[n - 1]) : '';
    openSheet(`<div class="gl-k">${t('gd.yours', { n: n + 1 })}</div><h2>${t('rk.' + cat)}</h2><div class="cb-c">${cardsRow(o.cards, 'md', o.hl)}</div>
      <p class="why-p">${n === 0 ? t('gd.top') : cat === 0 ? t('gd.bottom', { a: beats }) : t('gd.beats', { a: beats.toLowerCase(), b: t('rk.' + RK_ORDER[n + 1]).toLowerCase() })}</p>${rankNeighbours(cat)}
      <div class="gl-btns" style="margin-top:14px"><button class="btn" id="cbAll">${t('gd.all')}</button><button class="btn primary" id="cbOk">${t('gd.back')}</button></div>`);
    $('cbOk').onclick = closeSheet; $('cbAll').onclick = () => openGuide('ranks');
  }
  function renderHomeGuide() { const e = $('homeGuidePrev'); if (e) setHTML(e, cardsRow(PE.parseCards(RANK_EX[9]), 'xs')); }
  $('homeGuide').onclick = () => { SFX.tap(); try { localStorage.setItem('pt_guideSeen', '1'); } catch (e) {} openGuide('ranks'); };

  /* ---------- úvod (onboarding) ---------- */
  let obStep = 0, obReturn = false;
  const OB_N = 5;
  $('obLevels').innerHTML = '';
  [0, 1, 2].forEach(l => { const b = el('button', 'lv'); b.dataset.ol = l; b.innerHTML = `<span class="e">${['🌱', '🃏', '🔥'][l]}</span><span class="lv-t"><b data-i18n="ob.l${l}">${t('ob.l' + l)}</b><span data-i18n="ob.l${l}d">${t('ob.l' + l + 'd')}</span></span><i class="rad"></i>`; $('obLevels').appendChild(b); });
  // ukázkové karty v úvodu (kreslí se stejně jako ve hře)
  $('obBoard2').innerHTML = cardsRow(PE.parseCards('Kh 7c 2d'), 'xs');
  $('obHand3').innerHTML = cardsRow(PE.parseCards('As Kd'), 'md');
  function obRanks() { setHTML($('obRanks'), RK_ORDER.map((i, n) => `<div class="rkm ${n < 3 ? 'top' : ''}"><span class="n">${n + 1}</span><b>${t('rk.' + i)}</b><span class="rc">${cardsRow(PE.parseCards(RANK_EX[i]), 'xs', RK_HL[i])}</span></div>`).join('')); }
  $('obTrain').onclick = () => { SFX.unlock(); SFX.tap(); obDone(); if (!obReturn) setTimeout(() => nav.go('game'), 30); };
  $('obOnline').onclick = () => { SFX.unlock(); SFX.tap(); obDone(); if (!obReturn) setTimeout(() => nav.go('public'), 30); };
  $('obLevels').onclick = e => { const b = e.target.closest('[data-ol]'); if (!b) return; SFX.tap(); applyLevel(+b.dataset.ol); setLang(I18N.lang); };
  function obRender(dir) {
    const sl = $('obSlides').children;
    [...sl].forEach((x, i) => { x.classList.toggle('on', i === obStep); x.classList.remove('in-f', 'in-b'); if (i === obStep && dir && !noAnim()) { void x.offsetWidth; x.classList.add(dir > 0 ? 'in-f' : 'in-b'); } });
    setText($('obStep'), `${obStep + 1} / ${OB_N}`);
    [...$('obLevels').children].forEach(b => b.classList.toggle('on', +b.dataset.ol === settings.level));
    [...$('obDots').children].forEach((d, i) => d.classList.toggle('on', i === obStep));
    setText($('obNext'), obStep === OB_N - 1 ? t('ob.start') : t('ob.next'));
    $('obNext').style.visibility = obStep === OB_N - 1 ? 'hidden' : '';
    obRanks();
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

  /* ---------- v1.3: ikony měn, Lumi varianty, vzhled ---------- */
  let uid = 0;
  const LUMI_C = [[-40, -10, 44], [14, -24, 50], [50, 14, 40], [-30, 28, 38], [10, 30, 42], [0, 4, 48]];
  const blob = (fill, grow) => `<g fill="${fill}">${LUMI_C.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r + (grow || 0)}"/>`).join('')}</g>`;
  const eyes = (fill, sx) => [[12, -20], [38, -13]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="${7.5 * (sx || 1)}" ry="13.5" transform="rotate(-14 ${x} ${y})" fill="${fill}"/>`).join('');
  function lumiSVG(v, cls) {
    const id = 'lh' + (++uid);
    let body;
    if (v === 'ghost') body = blob('#fff') + eyes('#111');
    else if (v === 'noir') body = blob('#FF2D4A', 5) + blob('#111') + eyes('#FF2D4A');
    else if (v === 'striped') body = `<defs><pattern id="${id}" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="16" height="16" fill="#d63a3a"/><rect width="4" height="16" fill="rgba(255,255,255,.22)"/></pattern></defs>` + blob(`url(#${id})`) + eyes('#fff');
    else if (v === 'shades') body = blob('#FF2D4A') + eyes('#fff') + `<g transform="rotate(-14 25 -16)" fill="#111"><rect x="-2" y="-30" width="26" height="22" rx="7"/><rect x="28" y="-30" width="26" height="22" rx="7"/><rect x="20" y="-24" width="12" height="4"/><rect x="-24" y="-25" width="24" height="4" rx="2"/></g>`;
    else if (v === 'crown') body = blob('#FF2D4A') + eyes('#fff') + `<path d="M-14 -66 L-22 -100 L-2 -82 L14 -108 L30 -82 L50 -100 L42 -66 Z" fill="#fff" stroke="#111" stroke-width="3" stroke-linejoin="round"/>`;
    else body = blob('#FF2D4A') + eyes('#fff');
    return `<svg class="lumi-svg ${cls || ''}" viewBox="-96 -112 196 190" aria-hidden="true">${body}</svg>`;
  }
  /* body = Lumi žeton, diamant = červený Lumi krystal (inline SVG ve stylu loga) */
  const ICON = {
    pts: (s = 16) => `<svg class="cur-ic" viewBox="0 0 32 32" width="${s}" height="${s}" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#FF2D4A"/>${[0, 60, 120, 180, 240, 300].map(a => `<rect x="14.2" y="1" width="3.6" height="5" rx="1" fill="#fff" transform="rotate(${a} 16 16)"/>`).join('')}<circle cx="16" cy="16" r="9.5" fill="#d42039"/><ellipse cx="13.6" cy="15" rx="1.7" ry="3" fill="#fff" transform="rotate(-14 13.6 15)"/><ellipse cx="19.2" cy="16" rx="1.7" ry="3" fill="#fff" transform="rotate(-14 19.2 16)"/></svg>`,
    dia: (s = 16) => `<svg class="cur-ic" viewBox="0 0 32 32" width="${s}" height="${s}" aria-hidden="true"><path d="M9 4 H23 L30 12 L16 30 L2 12 Z" fill="#FF2D4A"/><path d="M2 12 H30 M9 4 L12 12 L16 30 M23 4 L20 12 L16 30 M12 12 L16 4 L20 12" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.1" stroke-linejoin="round"/><path d="M9 4 H23 L30 12 H2 Z" fill="rgba(255,255,255,.14)"/><ellipse cx="13.4" cy="16.5" rx="1.6" ry="2.8" fill="#fff" transform="rotate(-14 13.4 16.5)"/><ellipse cx="18.8" cy="17.3" rx="1.6" ry="2.8" fill="#fff" transform="rotate(-14 18.8 17.3)"/></svg>`
  };
  const icx = str => String(str).replace(/💎/g, ICON.dia(14)).replace(/🪙/g, ICON.pts(14));
  const wheelMini = (s = 18) => `<svg class="cur-ic" viewBox="0 0 32 32" width="${s}" height="${s}" aria-hidden="true">${[0, 1, 2, 3, 4, 5, 6, 7].map(i => { const a0 = (i * 45 - 90) * Math.PI / 180, a1 = ((i + 1) * 45 - 90) * Math.PI / 180;
    return `<path d="M16 17 L${(16 + 14 * Math.cos(a0)).toFixed(2)} ${(17 + 14 * Math.sin(a0)).toFixed(2)} A14 14 0 0 1 ${(16 + 14 * Math.cos(a1)).toFixed(2)} ${(17 + 14 * Math.sin(a1)).toFixed(2)} Z" fill="${i % 2 ? '#111' : '#FF2D4A'}"/>`; }).join('')}<circle cx="16" cy="17" r="14" fill="none" stroke="#fff" stroke-width="1.4"/><circle cx="16" cy="17" r="3.2" fill="#fff"/><path d="M12.5 0.5 H19.5 L16 6 Z" fill="#fff"/></svg>`;
  ICON.wheel = wheelMini;
  const LOOKS = {
    back: [['red', 0], ['noir', 3], ['dots', 3], ['stripes', 5], ['check', 8]],
    felt: [['black', 0], ['bordeaux', 4], ['graphite', 4], ['forest', 6], ['midnight', 6]],
    lumi: [['classic', 0], ['ghost', 4], ['striped', 5], ['noir', 6], ['shades', 8], ['crown', 12]]
  };
  function applyLook() {
    const e = wallet.equip, B = document.body;
    B.dataset.cback = e.back; B.dataset.cfelt = e.felt;
    const hl = $('homeLumi'); if (hl) hl.innerHTML = lumiSVG(e.lumi);
    const ml = $('meLumi'); if (ml) ml.innerHTML = lumiSVG(e.lumi);
  }
  function lookPreview(k, id) {
    if (k === 'back') return `<div class="lk-prev"><div class="card back lk-card" data-back-prev="${id}"></div></div>`;
    if (k === 'felt') return `<div class="lk-prev"><div class="lk-felt" data-felt-prev="${id}"><div class="card sm"><span class="rk">A</span><span class="st">♠</span></div><div class="card sm red"><span class="rk">K</span><span class="st">♥</span></div></div></div>`;
    return `<div class="lk-prev">${lumiSVG(id)}</div>`;
  }
  function buyLook(k, id, direct) {
    const it = LOOKS[k].find(x => x[0] === id); if (!it) return false;
    const name = t(`lk.${k}.${id}`);
    if (wallet.owned[k][id]) { wallet.equip[k] = id; saveW(); applyLook(); SFX.tap(); if (nav.cur === 'shop') renderShop(); return true; }
    if (wallet.diamonds < it[1]) { toast(t('lk.lack', { n: it[1] - wallet.diamonds })); SFX.fold(); return false; }
    const doBuy = () => { wallet.diamonds -= it[1]; wallet.owned[k][id] = 1; wallet.equip[k] = id; saveW(); applyLook(); SFX.win(); vib([15, 30, 15]); toast(t('lk.bought', { n: name })); if (nav.cur === 'shop') renderShop(); };
    if (direct) { doBuy(); return true; }
    openSheet(`<h2>${t('lk.buyQ', { n: name })}</h2><div class="lk-big">${lookPreview(k, id)}</div>
      <button class="btn primary wide" id="lkYes">${icx(t('lk.buy', { n: it[1] }))}</button><button class="btn wide" id="lkNo" style="margin-top:8px">${t('lk.cancel')}</button>`);
    $('lkYes').onclick = () => { closeSheet(); doBuy(); }; $('lkNo').onclick = closeSheet;
    return true;
  }

  /* ---------- úspěchy, výzvy dne, série dní ---------- */
  const catOf = sc => (sc >= 0 ? PE.handCategory(sc) : -1);
  const ACH = [
    ['hand1', 1, 1, () => stats.hands], ['win1', 1, 1, () => stats.won], ['good10', 10, 2, () => stats.good], ['type30', 30, 2, () => stats.hands],
    ['sd10', 10, 3, () => stats.sdWon], ['hands100', 100, 3, () => stats.hands], ['allin', 1, 2, () => wallet.flags.allinWin ? 1 : 0], ['bigpot', 1, 3, () => wallet.flags.bigPot ? 1 : 0],
    ['straight', 1, 2, () => catOf(stats.best) >= 4 ? 1 : 0], ['fullhouse', 1, 4, () => catOf(stats.best) >= 6 ? 1 : 0], ['good100', 100, 5, () => stats.good], ['hands500', 500, 8, () => stats.hands],
    ['drill25', 25, 2, () => drillSt.n], ['streak10', 10, 3, () => drillSt.best], ['lessons', 4, 2, () => LESSONS.filter(l => wallet.lessons[l[0]]).length], ['login7', 7, 5, () => wallet.login.best]
  ].map(([id, goal, dia, cur]) => ({ id, goal, dia, cur }));
  const CHAL = [['hands', 10, 1], ['drill', 10, 1], ['dstreak', 5, 2]];
  function dayTick() { if (wallet.day.d !== today()) wallet.day = { d: today(), hands: 0, drill: 0, dstreak: 0, done: {} }; }
  function loginTick() {
    const d = today(), L = wallet.login; if (L.last === d) return;
    const y = new Date(); y.setDate(y.getDate() - 1);
    L.streak = L.last === dayStr(y) ? L.streak + 1 : 1; L.last = d; L.best = Math.max(L.best || 0, L.streak);
    dayTick(); save('pt_wallet', wallet);
    if (L.streak % 7 === 0) addDia(PTS.login7, t('dia.login7', { n: PTS.login7 }));
  }
  function checkAch(quiet) {
    const msgs = []; let gain = 0;
    ACH.forEach(a => { if (!wallet.ach[a.id] && a.cur() >= a.goal) { wallet.ach[a.id] = today(); gain += a.dia; msgs.push(t('ach.got', { n: t('a.' + a.id), d: a.dia })); } });
    dayTick();
    CHAL.forEach(([k, goal, dia]) => { if (!wallet.day.done[k] && wallet.day[k] >= goal) { wallet.day.done[k] = 1; gain += dia; msgs.push(t('ch.got', { n: t('ch.' + k), d: dia })); } });
    if (!gain) return 0;
    wallet.diamonds += gain; saveW();
    if (!quiet || msgs.length) { if (!FAST()) { toast(msgs.length > 1 ? msgs[0] + ` (+${msgs.length - 1})` : msgs[0]); SFX.win(); vib([20, 40, 20]); } }
    if (nav.cur === 'ach') renderAch(); if (nav.cur === 'home') renderHome();
    return gain;
  }
  function renderAch() {
    dayTick();
    const done = ACH.filter(a => wallet.ach[a.id]).length, L = wallet.login;
    const bar = (c, g) => `<div class="prog"><i style="width:${Math.min(100, c / g * 100)}%"></i></div>`;
    $('achBody').innerHTML = `<div class="pts-hero dia-hero"><div class="lbl">${t('dia.name')}</div><div class="v">${ICON.dia(30)} <span id="achDia">${fmtPts(wallet.diamonds)}</span></div><div class="sub">${t('dia.what')}</div></div>
      <h3>${t('ach.streak')}</h3><div class="grp"><div class="row col"><div class="streak7">${[1, 2, 3, 4, 5, 6, 7].map(i => `<span class="${i <= ((L.streak - 1) % 7) + 1 ? 'on' : ''}">${i === 7 ? ICON.dia(14) : i}</span>`).join('')}</div><small>${icx(t('ach.streakTxt', { n: L.streak, d: PTS.login7 }))}</small></div></div>
      <h3>${t('ach.chal')} <small class="muted h3s">· ${t('ach.chalSub')}</small></h3><div class="grp">${CHAL.map(([k, g, d]) => { const c = Math.min(g, wallet.day[k] || 0), ok = wallet.day.done[k];
        return `<div class="row ach ${ok ? 'done' : ''}" data-ch="${k}"><div class="ach-t"><b>${t('ch.' + k)}</b>${bar(c, g)}<small>${c} / ${g}</small></div><span class="ach-r">${ok ? '✓' : '+' + d} ${ICON.dia(14)}</span></div>`; }).join('')}</div>
      <h3>${t('ach.list')} <small class="muted h3s">· ${t('ach.sub', { n: done, m: ACH.length })}</small></h3><div class="grp">${ACH.map(a => { const c = Math.min(a.goal, a.cur()), ok = !!wallet.ach[a.id];
        return `<div class="row ach ${ok ? 'done' : ''}" data-ach="${a.id}"><span class="ach-ic">${ok ? ICON.dia(22) : '<i></i>'}</span><div class="ach-t"><b>${t('a.' + a.id)}</b><small>${t('a.' + a.id + '.d')}</small>${ok ? '' : bar(c, a.goal)}</div><span class="ach-r">${ok ? t('ach.done') : '+' + a.dia + ' ' + ICON.dia(14)}</span></div>`; }).join('')}</div>`;
  }

  /* ---------- kolo štěstí (1× za kalendářní den, místní čas) ---------- */
  const SEG = [{ p: 100, w: 22 }, { p: 500, w: 12 }, { p: 200, w: 20 }, { p: 1000, w: 6 }, { p: 300, w: 16 }, { j: 5, w: 1.5 }, { p: 150, w: 20 }, { p: 2000, w: 2.5 }];
  const SEG_W = SEG.reduce((a, b) => a + b.w, 0);
  let wheelRot = 0, wheelBusy = false, wheelTimer = 0, wheelLast = null;
  function pickSeg() {
    let r; try { const u = new Uint32Array(1); crypto.getRandomValues(u); r = u[0] / 4294967296; } catch (e) { r = Math.random(); }
    r *= SEG_W; for (let i = 0; i < SEG.length; i++) { if ((r -= SEG[i].w) < 0) return i; } return 0;
  }
  function wheelSVG() {
    const R = 140, C = 150, pt = (a, r) => { const x = (a - 90) * Math.PI / 180; return [(C + r * Math.cos(x)).toFixed(2), (C + r * Math.sin(x)).toFixed(2)]; };
    const segs = SEG.map((s, i) => { const a0 = i * 45, a1 = a0 + 45, [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R), jack = !!s.j;
      const fill = jack ? '#fff' : i % 2 ? '#111' : '#FF2D4A', col = jack ? '#FF2D4A' : '#fff';
      const lab = jack ? `<g transform="translate(150 ${C - R + 34}) scale(1.05)"><g transform="translate(-13 -13) scale(.82)">${ICON.dia(32).replace(/<\/?svg[^>]*>/g, '')}</g></g><text x="150" y="${C - R + 62}" fill="${col}" class="wl sm">${t('wh.jackLbl')}</text>`
        : `<text x="150" y="${C - R + 40}" fill="${col}" class="wl">${fmtPts(s.p)}</text><g transform="translate(141 ${C - R + 50}) scale(.56)">${ICON.pts(32).replace(/<\/?svg[^>]*>/g, '')}</g>`;
      return `<path d="M${C} ${C} L${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} Z" fill="${fill}" stroke="#000" stroke-width="1.5"/><g transform="rotate(${a0 + 22.5} 150 150)">${lab}</g>`; }).join('');
    const dots = Array.from({ length: 24 }, (_, i) => { const [x, y] = pt(i * 15, R + 5); return `<circle cx="${x}" cy="${y}" r="2.2" class="wdot ${i % 2 ? 'b' : ''}"/>`; }).join('');
    return `<div class="wheel-wrap"><svg class="wheel-ptr" viewBox="0 0 30 34" aria-hidden="true"><path d="M3 2 H27 L15 32 Z" fill="#fff" stroke="#000" stroke-width="2" stroke-linejoin="round"/></svg>
      <svg class="wheel" viewBox="0 0 300 300" role="img" aria-label="${t('wh.title')}"><circle cx="150" cy="150" r="149" fill="#16151a"/><g id="wheelRot" style="transform:rotate(${wheelRot}deg);transform-origin:150px 150px">${segs}</g>${dots}<circle cx="150" cy="150" r="34" fill="#000" stroke="#2e2d35" stroke-width="3"/></svg>
      <div class="wheel-hub">${lumiSVG(wallet.equip.lumi)}</div></div>`;
  }
  function renderWheel() {
    clearInterval(wheelTimer);
    const used = wallet.wheelDay === today();
    const res = wheelLast ? (wheelLast.j ? t('wh.jack', { n: wheelLast.j }) : t('wh.won', { n: fmtPts(wheelLast.p) })) : '';
    $('wheelBody').innerHTML = `<div class="bal-row"><span>${ICON.pts(18)} <b id="whPts">${fmtPts(wallet.points)}</b></span><span>${ICON.dia(18)} <b id="whDia">${fmtPts(wallet.diamonds)}</b></span></div>
      <div class="sub center">${t('wh.sub')}</div>${wheelSVG()}
      <div class="wh-res ${wheelLast && wheelLast.j ? 'jack' : ''}" id="whRes">${icx(res)}</div>
      <button class="btn primary wide" id="whSpin" ${used || wheelBusy ? 'disabled' : ''}>${wheelBusy ? t('wh.spinning') : used ? t('wh.next', { t: `<span id="whCd">${untilMidnight()}</span>` }) : t('wh.spin')}</button>
      <h3>${t('wh.prizes')}</h3><div class="grp prizes">${SEG.map((s, i) => i).sort((a, b) => SEG[b].w - SEG[a].w).map(i => { const s = SEG[i];
        return `<div class="row"><span>${s.j ? `${ICON.dia(16)} <b>${t('wh.jackLbl')}</b> · ${icx(t('dia.got', { n: s.j }))}` : `${ICON.pts(16)} ${fmtPts(s.p)}`}</span><span class="muted">${(s.w / SEG_W * 100).toLocaleString(I18N.lang, { maximumFractionDigits: 1 })} %</span></div>`; }).join('')}</div>
      <div class="note">${t('wh.note')}</div>`;
    if (!used && !wheelBusy) $('whSpin').onclick = spinWheel;
    if (used) wheelTimer = setInterval(() => { if (wallet.wheelDay !== today()) { wheelLast = null; renderWheel(); updatePts(); return; } const c = $('whCd'); if (c) c.textContent = untilMidnight(); }, 1000);
  }
  function spinWheel() {
    if (wheelBusy || wallet.wheelDay === today()) return null;
    SFX.unlock();
    const i = pickSeg(), s = SEG[i];
    // výhra se uloží hned (zavření aplikace během točení o ni nepřipraví ani ji nezdvojí)
    wallet.wheelDay = today(); wallet.lastDaily = today();
    if (s.j) { wallet.diamonds += s.j; wallet.flags.jackpot = (wallet.flags.jackpot || 0) + 1; } else wallet.points += s.p;
    save('pt_wallet', wallet);
    const jitter = (Math.random() - 0.5) * 30, target = i * 45 + 22.5 + jitter;
    const from = wheelRot, to = from + 360 * 6 + ((((-target - from) % 360) + 360) % 360);
    const done = () => { wheelRot = to % 360; wheelBusy = false; wheelLast = s; updatePts(); renderWheel();
      if (s.j) { SFX.jackpot(); vib([40, 60, 40, 60, 120]); } else { SFX.win(); vib([20, 40, 30]); }
      if (nav.cur === 'home') renderHome(); };
    if (FAST() || nav.cur !== 'wheel') { wheelRot = to; done(); return i; }
    wheelBusy = true; wheelLast = null;
    const b = $('whSpin'); b.disabled = true; b.textContent = t('wh.spinning'); setText($('whRes'), '');
    const g = $('wheelRot'), dur = reduced() ? 1500 : 5200, t0 = performance.now();
    let lastSeg = Math.floor(from / 45);
    const ease = x => 1 - Math.pow(1 - x, 4);
    const step = now => {
      const x = Math.min(1, (now - t0) / dur), r = from + (to - from) * ease(x);
      g.style.transform = `rotate(${r}deg)`;
      const sg = Math.floor((r + 22.5) / 45); if (sg !== lastSeg) { lastSeg = sg; SFX.tick(); if (x < 0.85) vib(4); }
      if (x < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
    return i;
  }

  /* ---------- v1.3: nápověda „Co co znamená“ (stůl) + nápověda obrazovek + pořadí kombinací ---------- */
  const HV = ['seats', 'dealer', 'blinds', 'stacks', 'pot', 'board', 'win', 'rec', 'pos', 'cards', 'actions'];
  let hvItems = [], hvI = 0;
  const shown = e => { if (!e) return false; const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; for (let x = e; x && x !== document.body; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
  function hvTarget(k) {
    const q = s => [...document.querySelectorAll(s)];
    switch (k) {
      case 'seats': return $('opps');
      case 'dealer': return q('#opps .dealer').find(shown) || $('heroDealer') || null;
      case 'blinds': return q('#opps .chip').find(x => shown(x) && /^(SB|BB)\b/.test(x.textContent)) || null;
      case 'stacks': return q('#opps .stk').find(shown) || null;
      case 'pot': return document.querySelector('#scr-game .pot-row');
      case 'board': return $('board');
      case 'win': return $('odds');
      case 'rec': return $('coach');
      case 'pos': return $('heroPos');
      case 'cards': return $('heroCards');
      case 'actions': return $('actions');
    }
  }
  function openHelpOverlay() {
    SFX.tap(); closeSheet();
    hvItems = HV.map(k => ({ k, e: hvTarget(k) })).filter(x => shown(x.e));
    if (!hvItems.length) return;
    hvI = 0; $('helpOv').hidden = false; hvLayout();
  }
  function closeHelpOverlay() { $('helpOv').hidden = true; }
  function hvLayout() {
    const ov = $('helpOv'); if (ov.hidden) return;
    const W = innerWidth, H = innerHeight, placed = [];
    const rings = hvItems.map((it, i) => { const r = it.e.getBoundingClientRect(), p = 4;
      return `<div class="hv-ring ${i === hvI ? 'on' : ''}" style="left:${r.left - p}px;top:${r.top - p}px;width:${r.width + 2 * p}px;height:${r.height + 2 * p}px"></div>`; }).join('');
    const labels = hvItems.map((it, i) => { const r = it.e.getBoundingClientRect(), txt = t('hv.' + it.k + '.l'), w = Math.min(150, 26 + txt.length * 7.2), h = 24;
      let x = r.width < 60 ? r.right + 6 : r.left, y = r.top - h - 2;
      if (y < 6) y = r.top + 4;
      x = Math.max(6, Math.min(W - w - 6, x));
      for (let k = 0; k < 12 && placed.some(b => x < b.x + b.w + 4 && b.x < x + w + 4 && y < b.y + b.h + 3 && b.y < y + h + 3); k++) y += h + 4;
      placed.push({ x, y, w, h });
      return `<button class="hv-lab ${i === hvI ? 'on' : ''}" data-hv="${i}" style="left:${x}px;top:${y}px"><b>${i + 1}</b>${txt}</button>`; }).join('');
    const it = hvItems[hvI], r = it.e.getBoundingClientRect(), top = r.top + r.height / 2 > H * 0.5;
    ov.innerHTML = `<div class="hv-dim"></div>${rings}${labels}
      <div class="hv-card ${top ? 'hv-top' : 'hv-bot'}"><div class="hv-k">${t('hv.title')} · ${t('hv.of', { i: hvI + 1, n: hvItems.length })}<button class="hv-x" id="hvX" aria-label="${t('hv.close')}">✕</button></div>
        <h2>${t('hv.' + it.k + '.t')}</h2><p>${rich(t('hv.' + it.k + '.d'), { nolink: true })}</p>
        <div class="hv-nav"><button class="btn round" id="hvPrev" ${hvI ? '' : 'disabled'}>‹</button><button class="btn" id="hvRanks">${t('hv.ranks')}</button><button class="btn" id="hvGloss">${t('hv.gloss')}</button><button class="btn round" id="hvNext" ${hvI < hvItems.length - 1 ? '' : 'disabled'}>›</button></div>
        <div class="hv-tip">${t('hv.tap')}</div></div>`;
    ov.querySelectorAll('[data-hv]').forEach(b => b.onclick = () => { hvI = +b.dataset.hv; SFX.tap(); hvLayout(); });
    $('hvX').onclick = closeHelpOverlay;
    $('hvPrev').onclick = () => { if (hvI) { hvI--; hvLayout(); } };
    $('hvNext').onclick = () => { if (hvI < hvItems.length - 1) { hvI++; hvLayout(); } };
    $('hvRanks').onclick = () => { closeHelpOverlay(); openRanks(); };
    $('hvGloss').onclick = () => { closeHelpOverlay(); toGlossary(); };
    ov.querySelector('.hv-dim').onclick = closeHelpOverlay;
  }
  window.addEventListener('resize', () => { if (!$('helpOv').hidden) hvLayout(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('helpOv').hidden) closeHelpOverlay(); });
  function toGlossary() { openGuide('terms'); }
  function openRanks() { openGuide('ranks'); }
  const SCREEN_HELP = { home: 4, stats: 3, drill: 2, settings: 2, shop: 2, wheel: 1, ach: 2, learn: 1 };
  function openScreenHelp(id) {
    if (id === 'game') return openHelpOverlay();
    SFX.tap();
    const n = SCREEN_HELP[id] || 0;
    openSheet(`<h2>${t('hv.title')}</h2><div class="grp help-list">${Array.from({ length: n }, (_, i) => `<div class="row col"><b>${t(`help.${id}.${i + 1}t`)}</b><small>${t(`help.${id}.${i + 1}d`)}</small></div>`).join('')}</div>
      <div class="gl-btns" style="margin-top:14px"><button class="btn" id="hpRanks">${t('hv.ranks')}</button><button class="btn" id="hpGloss">${t('hv.gloss')}</button></div>
      <button class="btn primary wide" id="hpOk" style="margin-top:8px">${t('gl.ok')}</button>`);
    $('hpOk').onclick = closeSheet; $('hpRanks').onclick = openRanks; $('hpGloss').onclick = toGlossary;
  }
  ['settings', 'stats', 'shop', 'learn', 'wheel', 'ach', 'drill'].forEach(id => { const nv = document.querySelector(`#scr-${id} .nav`); if (!nv) return;
    const b = el('button', 'icon-btn help-btn'); b.textContent = '?'; b.dataset.help = id; b.dataset.i18nAria = 'hv.btn'; b.setAttribute('aria-label', t('hv.btn')); nv.appendChild(b); });
  document.addEventListener('click', e => { const b = e.target.closest('[data-help]'); if (b) openScreenHelp(b.dataset.help); });
  const chipTerm = s => /^(SB|BB)\b/.test(s) ? 'blind' : /^call/i.test(s) ? 'call' : /^(raise|bet)/i.test(s) ? 'raise' : /^fold/i.test(s) ? 'fold' : /^check/i.test(s) ? 'check' : /^all/i.test(s) ? 'allin' : '';

  /* ---------- body a obchod (bez skutečných plateb) ---------- */
  const LESSONS = [['pos', 'l.pos', 'l.posTxt'], ['odds', 'l.odds', 'l.oddsTxt'], ['push', 'l.push', 'l.pushTxt'], ['chen', 'l.chen', 'l.chenTxt']];
  let shopTab = 'pts';
  function exchangeDia() { if (wallet.diamonds < 1 || wallet.points >= START) return false; wallet.diamonds--; addPts(PTS.diaRate, t('dia.exDone', { n: fmtPts(PTS.diaRate) })); SFX.chip(); return true; }
  function refill() { if (wallet.points >= PTS.refillMin) return; addPts(PTS.refillTo - wallet.points, t('pts.got', { n: PTS.refillTo - wallet.points })); }
  function renderShop() {
    const wOk = wallet.wheelDay !== today(), refillOk = wallet.points < PTS.refillMin, exOk = wallet.diamonds > 0 && wallet.points < START;
    const hero = `<div class="sh-bal"><div><span>${t('pts.bal')}</span><b>${ICON.pts(24)}${fmtPts(wallet.points)}</b>${settings.bankroll && session.hero > 0 && session.bank ? `<small>${t('pts.table')}: ${fmtPts(session.hero)}</small>` : ''}</div>
      <div><span>${t('dia.name')}</span><b class="d">${ICON.dia(24)}${fmtPts(wallet.diamonds)}</b></div></div>`;
    const lookBtn = (k, id, price) => { const own = !!wallet.owned[k][id], on = wallet.equip[k] === id;
      return `<button class="sh-it ${on ? 'on' : ''}" data-lk="${k}:${id}"><span class="pv">${lookPreview(k, id)}</span><b>${t(`lk.${k}.${id}`)}</b><small>${t('lk.' + k)}</small><span class="pr">${on ? '✓ ' + t('lk.using') : own ? t('lk.use') : `${ICON.dia(13)} ${price}`}</span></button>`; };
    let body;
    if (shopTab === 'look') {
      body = `<div class="seg full shop-tabs"><button data-tab="pts">${t('pts.tabPts')}</button><button data-tab="look" class="on">${t('pts.tabLook')}</button></div>
        <div class="note">${t('lk.hint')}</div>` + ['back', 'felt', 'lumi'].map(k => `<h3>${t('lk.' + k)}</h3><div class="looks">${LOOKS[k].map(([id, price]) => {
        const own = !!wallet.owned[k][id], on = wallet.equip[k] === id;
        return `<button class="look ${on ? 'on' : ''}" data-lk="${k}:${id}">${lookPreview(k, id)}<b>${t(`lk.${k}.${id}`)}</b><span class="lk-st">${on ? '✓ ' + t('lk.using') : own ? t('lk.use') : `${ICON.dia(13)} ${price}`}</span></button>`; }).join('')}</div>`).join('');
    } else {
      const mini = wheelSVG().replace(' id="wheelRot"', '').replace(/ role="img" aria-label="[^"]*"/, ' aria-hidden="true"');
      const strip = [['lumi', 'shades'], ['felt', 'bordeaux'], ['back', 'noir'], ['lumi', 'crown'], ['felt', 'midnight'], ['back', 'stripes'], ['lumi', 'ghost'], ['back', 'check']]
        .map(([k, id]) => lookBtn(k, id, LOOKS[k].find(x => x[0] === id)[1])).join('');
      body = `<button class="sh-feat" id="shWheelCard"><span class="sh-ft"><span class="k">${wOk ? t('sh.freeToday') : t('wh.used')}</span><b>${t('wh.title')}</b><span class="p">${wOk ? t('sh.wheelSub') : t('wh.next', { t: untilMidnight(true) })}</span>
          <span class="sh-rbtn ${wOk ? '' : 'off'}" id="shWheel">${wOk ? t('sh.spin') : t('sh.look')}</span></span><span class="sh-wheel">${mini}</span></button>
        <div class="sh-two">
          <div class="sh-sm"><b>${t('pts.refill')}</b><span>${t('pts.refillSub', { n: fmtPts(PTS.refillTo) })}</span><button class="sh-pill ${refillOk ? 'r' : ''}" id="shRefill" ${refillOk ? '' : 'disabled'}>${refillOk ? t('pts.refillBtn') : t('pts.refillNo', { n: fmtPts(PTS.refillMin) })}</button></div>
          <div class="sh-sm"><b>${t('dia.ex')}</b><span>${icx(t('dia.exSub', { n: fmtPts(PTS.diaRate), m: fmtPts(START) }))}</span><button class="sh-pill ${exOk ? 'r' : ''}" id="shEx" ${exOk ? '' : 'disabled'}>${exOk ? icx(t('dia.exBtn', { n: fmtPts(PTS.diaRate) })) : wallet.diamonds ? t('dia.exNo', { m: fmtPts(START) }) : t('dia.exNone')}</button></div>
        </div>
        <div class="sh-h"><b>${t('pts.tabLook')}</b><button data-tab="look">${t('sh.all')} ›</button></div>
        <div class="sh-strip">${strip}</div>
        <div class="sh-h"><b>${t('pts.learn')}</b></div>
        <div class="sh-lst">${LESSONS.map(([k, ti]) => `<button data-les="${k}"><span>📘 ${t(ti)}</span><em class="${wallet.lessons[k] ? 'done' : ''}">${wallet.lessons[k] ? t('pts.lessonDone') : '+' + PTS.lesson}</em></button>`).join('')}</div>
        <h3>${t('pts.packs')}</h3><div class="packs">${[[1, 5000], [2, 20000], [3, 100000]].map(([i, v]) => `<div class="pack"><div class="pk-ic">${ICON.pts(20).repeat(i)}</div><b>${fmtPts(v)}</b><span>${t('pts.pack' + i)}</span><button class="btn sm soon" disabled>${t('pts.soon')}</button></div>`).join('')}</div>
        <h3>${t('pts.diaPacks')}</h3><div class="packs">${[[1, 10], [2, 50], [3, 120]].map(([i, v]) => `<div class="pack"><div class="pk-ic">${ICON.dia(20).repeat(i)}</div><b>${v}</b><span>${t('pts.pack' + i)}</span><button class="btn sm soon" disabled>${t('pts.soon')}</button></div>`).join('')}</div>
        <div class="note">${t('pts.soonNote')}</div>
        <h3>${t('pts.earn')}</h3><div class="grp"><div class="txtblk">${t('pts.earnTxt', { g: PTS.good, s: PTS.streak })}<br><br>${t('dia.what')}</div></div>`;
    }
    $('shopBody').innerHTML = `<div class="sh2">${hero}${body}</div><div class="about">${t('pts.virtual')}</div>`;
    $('shopBody').querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { shopTab = b.dataset.tab; SFX.tap(); renderShop(); $('scr-shop').scrollTop = 0; });
    $('shopBody').querySelectorAll('[data-lk]').forEach(b => b.onclick = () => { const [k, id] = b.dataset.lk.split(':'); buyLook(k, id); });
    if (shopTab === 'look') return;
    $('shWheelCard').onclick = () => { SFX.unlock(); nav.go('wheel'); };
    $('shRefill').onclick = () => { refill(); renderShop(); };
    $('shEx').onclick = () => { exchangeDia(); renderShop(); };
    $('shopBody').querySelectorAll('[data-les]').forEach(b => b.onclick = () => { const L = LESSONS.find(x => x[0] === b.dataset.les);
      openSheet(`<h2>${t(L[1])}</h2><div class="txtblk">${rich(t(L[2]))}</div><button class="btn primary wide" id="lesOk">${wallet.lessons[L[0]] ? t('gl.ok') : t('pts.lesson', { n: PTS.lesson })}</button>`);
      $('lesOk').onclick = () => { closeSheet(); if (!wallet.lessons[L[0]]) { wallet.lessons[L[0]] = 1; addPts(PTS.lesson, t('pts.got', { n: PTS.lesson })); checkAch(); } renderShop(); }; });
  }

  /* ---------- jazyk ---------- */
  function applyStatic() {
    document.documentElement.lang = I18N.lang;
    document.querySelectorAll('[data-i18n]').forEach(e => { e.textContent = t(e.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach(e => { e.innerHTML = rich(t(e.dataset.i18nHtml)); });
    document.querySelectorAll('[data-ic]').forEach(e => { e.innerHTML = ICON[e.dataset.ic](+e.dataset.sz || 16); });
    document.querySelectorAll('[data-i18n-aria]').forEach(e => e.setAttribute('aria-label', t(e.dataset.i18nAria)));
  }
  function setLang(l) {
    I18N.set(l); applyStatic(); lastActions = '';
    if (G.ctx && G.turn === 0) G.rec = PE.recommend(G.ctx);
    if (G.coach) G.coach.fb = PE.grade(G.coach.rec, G.coach.action, G.coach.ctx);
    if (G.lastDec && G.feedback) G.feedback = Object.assign({ street: G.lastDec.street, act: G.lastDec.action }, gradeOf(G.lastDec));
    if (G.players.length) render();
    obRender(0); renderHome(); if (D.spot) renderDrill();
    if (nav.cur === 'stats') renderStats(); if (nav.cur === 'learn') renderLearn(); if (nav.cur === 'shop') renderShop(); if (nav.cur === 'profile') renderProfile(); if (nav.cur === 'settings') renderSettings();
    if (nav.cur === 'wheel') renderWheel(); if (nav.cur === 'ach') renderAch();
    if (!$('sheet').hidden && G.over) showSummary(); else closeSheet();
    if (window.OnlineUI) window.OnlineUI.onLang();
  }

  /* ---------- oznámení (toast) + aktualizace ---------- */
  let toastT = 0;
  function toast(msg, btn, fn, sticky) {
    $('toastTxt').innerHTML = icx(String(msg).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c])); $('toastBtn').hidden = !btn; if (btn) { setText($('toastBtn'), btn); $('toastBtn').onclick = fn; }
    $('toast').hidden = false; $('toast').classList.remove('out');
    clearTimeout(toastT); if (!sticky) toastT = setTimeout(() => { $('toast').classList.add('out'); setTimeout(() => $('toast').hidden = true, 250); }, 2600);
  }
  /* sdílené pomůcky pro online stoly (online/ui.js) */
  window.RR = { nav, t, $, openSheet, closeSheet, toast, cardHTML, SFX, vib, fmtPts, rich, settings, applyStatic, noAnim };
  window.__rr = { updateReady: () => toast(t('upd.msg'), t('upd.btn'), () => location.reload(), true), toast };

  /* ---------- start ---------- */
  applyStatic();
  const onboarded = (() => { try { return localStorage.getItem('pt_onboarded') === '1'; } catch (e) { return true; } })();
  try { history.replaceState({ s: 'home' }, ''); } catch (e) {}
  if (onboarded) show('home'); else openOnboarding(false);
  const sp = $('splash');
  if (window.__NOSPLASH || FAST()) sp.remove();
  else setTimeout(() => { sp.classList.add('out'); setTimeout(() => sp.remove(), 420); }, reduced() ? 700 : 1500);

  applyLook(); loginTick(); checkAch(true); updatePts();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { loginTick(); updatePts(); if (nav.cur === 'wheel') renderWheel(); } });
  window.__poker = { startHand, heroAct, coachGo, coachRetry, buyHint, openGuide, openCombo, quizDeal, G, settings, drillNew, drillAnswer, D, nav, setLang, render, wallet, stats: () => stats, applyLevel, rich, plain, openGloss, checkAch, spinWheel: () => spinWheel(), ACH, today, exchangeDia, buyLook: (k, id) => buyLook(k, id, true), needPoints, openHelpOverlay, openRanks, openScreenHelp, pickSeg: () => SEG[pickSeg()] };
})();
