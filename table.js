/* Red River – skutečný stůl: avatary, rozmístění míst kolem oválu a animace (žetony, all-in, fold, check, výhra).
   Sdílí ho offline hra (app.js) i online stoly (online/ui.js). Jen transform/opacity → 60 fps, bez knihoven. */
(function (root) {
  'use strict';
  let uid = 0;
  /* ---------- avatary (vlastní SVG, žádné licencované obrázky) ----------
     [id, vzácnost, cena]  cena: 0 = zdarma, {p} = body, {d} = diamanty, {ach} = jen za úspěch (koupit nejde) */
  const AV = [
    ['fox', 'free', 0], ['cat', 'free', 0], ['bear', 'free', 0], ['frog', 'free', 0], ['ace', 'free', 0], ['queen', 'free', 0],
    ['panda', 'common', { p: 1500 }], ['rabbit', 'common', { p: 1500 }], ['owl', 'common', { p: 2000 }],
    ['cowboy', 'rare', { d: 3 }], ['shades', 'rare', { d: 3 }], ['tiger', 'rare', { d: 4 }],
    ['robot', 'epic', { d: 7 }], ['alien', 'epic', { d: 7 }], ['ninja', 'epic', { d: 8 }],
    ['king', 'legend', { d: 12 }], ['dragon', 'legend', { d: 15 }],
    ['shark', 'excl', { ach: 'allin' }], ['wizard', 'excl', { ach: 'hands500' }], ['phoenix', 'excl', { ach: 'login7' }], ['diamond', 'excl', { ach: 'fullhouse' }]
  ];
  const BOT_AV = ['fox', 'cat', 'bear', 'frog', 'ace', 'queen', 'panda', 'rabbit', 'owl', 'cowboy', 'shades', 'tiger', 'ninja'];
  /* Všechny avatary jsou Lumi: stejný měkký „blob“ z kruhů, ploché barvy, dvě šikmé oválné oči.
     Liší se jen barvou / vzorem, výrazem a jedním drobným doplňkem. Vzácnější = kovové akcenty, záře, u legend jemný třpyt. */
  const LUMI_C = [[-40, -10, 44], [14, -24, 50], [50, 14, 40], [-30, 28, 38], [10, 30, 42], [0, 4, 48]];
  const EP = [[12, -20], [38, -13]];
  const B = (fill, grow, extra) => `<g fill="${fill}" ${extra || ''}>${LUMI_C.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r + (grow || 0)}"/>`).join('')}</g>`;
  const E = (fill, ry = 13.5, rx = 7.5) => EP.map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(-14 ${x} ${y})" fill="${fill}"/>`).join('');
  const arc = (x, y, c, up) => `<path d="M${x - 9} ${y + (up ? 4 : -2)} Q${x} ${y + (up ? -10 : 9)} ${x + 9} ${y + (up ? 4 : -2)}" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round" transform="rotate(-14 ${x} ${y})"/>`;
  const SLEEPY = c => EP.map(([x, y]) => arc(x, y, c)).join('');
  const WINK = c => E(c).split('/>')[0] + '/>' + arc(EP[1][0], EP[1][1], c, true);
  const SHADES = '<g transform="rotate(-14 25 -16)" fill="#0b0b0d"><rect x="-2" y="-30" width="26" height="20" rx="7"/><rect x="28" y="-30" width="26" height="20" rx="7"/><rect x="20" y="-24" width="12" height="4"/><rect x="-24" y="-25" width="24" height="4" rx="2"/></g><path d="M3 -24 L11 -27" stroke="rgba(255,255,255,.55)" stroke-width="3" stroke-linecap="round"/>';
  const CROWN = f => `<path d="M-14 -66 L-22 -100 L-2 -82 L14 -108 L30 -82 L50 -100 L42 -66 Z" fill="${f}" stroke="#0b0b0d" stroke-width="3" stroke-linejoin="round"/>`;
  const HAT = '<g fill="#0b0b0d"><ellipse cx="14" cy="-66" rx="70" ry="11"/><path d="M-24 -68 Q-22 -112 14 -110 Q50 -112 52 -68Z"/></g><rect x="-23" y="-80" width="74" height="7" fill="#FF2D4A"/>';
  const STRIPES = id => `<defs><pattern id="${id}" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="16" height="16" fill="#d63a3a"/><rect width="4" height="16" fill="rgba(255,255,255,.22)"/></pattern></defs>`;
  const SPADE = (x, y, s, f) => `<path transform="translate(${x} ${y}) scale(${s})" fill="${f}" d="M0,-62 C18,-34 62,-12 62,16 C62,40 36,50 12,36 C14,52 22,64 32,70 L-32,70 C-22,64 -14,52 -12,36 C-36,50 -62,40 -62,16 C-62,-12 -18,-34 0,-62 Z"/>`;
  // každý: (id) => [tělo v souřadnicích Lumiho, pozadí]
  const DRAW = {
    fox: () => B('#FF2D4A') + E('#fff'),                                                   // Rubín – klasický Lumi
    cat: () => B('#f2f2f4') + E('#111'),                                                    // Mlha – bílý
    bear: () => B('#4a4a54') + E('#fff'),                                                   // Grafit
    frog: () => B('#FF2D4A') + SLEEPY('#fff'),                                              // Klid – spokojeně přivřené oči
    ace: () => B('#f2f2f4') + E('#FF2D4A') + SPADE(-34, 26, 0.26, '#111'),                  // Eso – bílý se pikovým znakem
    queen: () => B('#7a1426') + E('#fff') + '<circle cx="-46" cy="16" r="6" fill="#fff"/>',  // Dáma – bordó s perlou
    panda: u => STRIPES(u + 'p') + B(`url(#${u}p)`) + E('#fff'),                           // Proužek
    rabbit: () => B('#FF2D4A') + WINK('#fff'),                                              // Mrk
    owl: () => B('#FF2D4A', 5) + B('#141417') + E('#FF2D4A'),  // Noc – černý s rudým obrysem
    cowboy: () => B('#FF2D4A') + E('#fff') + HAT,                                           // Fedora
    shades: () => B('#FF2D4A') + E('#fff') + SHADES,                                        // Brýle
    tiger: () => B('#2b2b32') + '<g stroke="#FF2D4A" stroke-width="7" stroke-linecap="round"><path d="M-62 -6 L-34 2"/><path d="M-60 18 L-30 20"/><path d="M68 2 L80 -6"/></g>' + E('#fff', 6, 8),  // Šelma – úzké oči
    robot: u => `<defs><linearGradient id="${u}m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f5f8"/><stop offset=".45" stop-color="#9ea3ad"/><stop offset=".7" stop-color="#e4e6eb"/><stop offset="1" stop-color="#6c707a"/></linearGradient></defs>` + B(`url(#${u}m)`) + '<g transform="rotate(-14 25 -16)"><rect x="-2" y="-24" width="56" height="12" rx="6" fill="#0b0b0d"/><rect x="6" y="-20" width="38" height="4" rx="2" fill="#FF2D4A"/></g>',  // Chrom
    alien: u => `<defs><filter id="${u}g" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="6"/></filter></defs>` + B('#FF2D4A', 4, `filter="url(#${u}g)" opacity=".75"`) + B('#0b0b0d') + E('#FF2D4A'),  // Neon – černý s rudou září
    ninja: () => B('#2b2b32') + '<path d="M-80 -28 Q14 -48 96 -8 L94 8 Q14 -30 -80 -10Z" fill="#FF2D4A"/><path d="M90 -2 L112 -14 L108 4Z" fill="#FF2D4A"/>' + E('#fff', 5.5, 8),  // Stín
    king: u => `<defs><linearGradient id="${u}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1b8"/><stop offset=".5" stop-color="#d4a433"/><stop offset="1" stop-color="#8a6414"/></linearGradient></defs>` + B('#FF2D4A') + E('#fff') + CROWN(`url(#${u}a)`),  // Král
    dragon: u => `<defs><radialGradient id="${u}f" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#ffd27a"/><stop offset=".45" stop-color="#ff5a2b"/><stop offset="1" stop-color="#b3122c"/></radialGradient></defs>` + B(`url(#${u}f)`) + E('#fff') + '<path d="M-30 -60 L-40 -96 L-14 -70Z M30 -72 L36 -108 L50 -74Z" fill="#b3122c"/>',  // Plamen
    shark: () => B('#FF2D4A') + '<g fill="none" stroke="#fff" stroke-width="6" stroke-dasharray="14 12" opacity=".9">' + LUMI_C.slice(0, 1).map(() => '<circle cx="4" cy="2" r="70"/>').join('') + '</g>' + E('#fff'),  // All-in – žetonový lem
    wizard: () => B('#f2f2f4') + E('#111') + '<circle cx="38" cy="-13" r="17" fill="none" stroke="#d4a433" stroke-width="4"/><path d="M54 -6 Q62 20 58 40" fill="none" stroke="#d4a433" stroke-width="2.5"/>',  // Mudrc – monokl
    phoenix: u => `<defs><linearGradient id="${u}p" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#b3122c"/><stop offset=".6" stop-color="#FF2D4A"/><stop offset="1" stop-color="#ffb02e"/></linearGradient></defs>` + '<path d="M-6 -66 Q-10 -96 8 -116 Q6 -96 22 -84 Q30 -104 46 -110 Q34 -90 40 -66Z" fill="#ffb02e"/>' + B(`url(#${u}p)`) + E('#fff'),  // Fénix
    diamond: () => B('#FF2D4A') + '<g fill="none" stroke="rgba(255,255,255,.35)" stroke-width="3" stroke-linejoin="round"><path d="M-84 -10 L-30 -50 L20 -74 L70 -30 L90 14"/><path d="M-30 -50 L0 4 L20 -74 M0 4 L70 -30 M0 4 L-68 50 M0 4 L52 52"/></g><path d="M-30 -50 L20 -74 L70 -30 L0 4Z" fill="rgba(255,255,255,.14)"/>' + E('#fff')  // Diamant – broušený
  };
  const RING = {
    free: '', common: '',
    rare: '<circle cx="32" cy="32" r="30.6" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.2"/>',
    epic: u => `<defs><linearGradient id="${u}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6b80"/><stop offset=".5" stop-color="#FF2D4A"/><stop offset="1" stop-color="#6d0f1d"/></linearGradient></defs><circle cx="32" cy="32" r="30.3" fill="none" stroke="url(#${u}r)" stroke-width="1.8"/>`,
    legend: u => `<defs><linearGradient id="${u}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1b8"/><stop offset=".5" stop-color="#d4a433"/><stop offset="1" stop-color="#7a5510"/></linearGradient><linearGradient id="${u}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><circle cx="32" cy="32" r="30.2" fill="none" stroke="url(#${u}r)" stroke-width="2.2"/><rect class="av-shim" x="-40" y="-10" width="22" height="84" fill="url(#${u}s)" transform="rotate(20 32 32)"><animate attributeName="x" values="-40;-40;90" keyTimes="0;.55;1" dur="3.6s" repeatCount="indefinite"/></rect>`,
    excl: '<circle cx="32" cy="32" r="30.4" fill="none" stroke="#FF2D4A" stroke-width="1.4"/><circle cx="32" cy="32" r="28.6" fill="none" stroke="rgba(255,45,74,.25)" stroke-width="1"/>'
  };
  const RAR = {}; AV.forEach(a => { RAR[a[0]] = a[1]; });
  function avatarSVG(id) {
    if (!DRAW[id]) id = 'fox';
    const u = 'rav' + (++uid), r = RAR[id], ring = RING[r], rg = typeof ring === 'function' ? ring(u) : ring;
    const glow = r === 'epic' || r === 'legend' ? `<circle cx="32" cy="38" r="20" fill="${r === 'legend' ? 'rgba(212,164,51,.18)' : 'rgba(255,45,74,.16)'}"/>` : '';
    return `<svg class="av-svg" viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="${u}b" cx=".5" cy=".38" r=".7"><stop offset="0" stop-color="#232329"/><stop offset="1" stop-color="#0c0c0f"/></radialGradient><clipPath id="${u}c"><circle cx="32" cy="32" r="32"/></clipPath></defs><g clip-path="url(#${u}c)"><circle cx="32" cy="32" r="32" fill="url(#${u}b)"/>${glow}<g transform="translate(31.5 35) scale(.262) translate(-3 0)">${DRAW[id](u)}</g>${rg}</g></svg>`;
  }
  const hash = s => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
  const botAv = name => BOT_AV[hash(name) % BOT_AV.length];
  const valid = id => !!DRAW[id];
  function myAv() { try { const w = JSON.parse(localStorage.getItem('pt_wallet') || '{}'); return (w.equip && valid(w.equip.avatar) && w.equip.avatar) || ''; } catch (e) { return ''; } }

  /* ---------- rozmístění kolem oválu ----------
     k = 0 je hráč (dole uprostřed), dál po směru hry: vlevo dole → nahoru → vpravo */
  function geo(felt, n) {
    const W = felt.clientWidth, H = felt.clientHeight, many = n > 6;
    const rx = W / 2 - (many ? 26 : 30), ry = H / 2 - (many ? 22 : 26);
    return { W, H, cx: W / 2, cy: H / 2, rx, ry, many };
  }
  function seatXY(g, k, n) {
    const a = (90 + k * 360 / n) * Math.PI / 180;
    return { x: g.cx + g.rx * Math.cos(a), y: g.cy + g.ry * Math.sin(a), side: Math.abs(Math.cos(a)) < 0.3 ? (Math.sin(a) < 0 ? 't' : 'b') : Math.cos(a) < 0 ? 'l' : 'r' };
  }
  function betXY(g, p, board) {
    if (p.side === 't') return { x: p.x + (g.many ? 0 : 64), y: p.y + (g.many ? 64 : 16) };
    const f = p.side === 'b' ? 0.42 : 0.56;
    let x = p.x + (g.cx - p.x) * f, y = p.y + (g.cy - p.y) * f;
    if (board && p.side === 'b') return { x: p.x, y: Math.min(board.b + 15, p.y - 40) };
    if (board && x > board.l - 22 && x < board.r + 22 && y > board.t - 12 && y < board.b + 12) y = p.y > g.cy ? board.b + 14 : board.t - 14;
    return { x, y };
  }
  /* seats: [{ el, bet }] v pořadí od hráče (index 0 = hráč, může být null) */
  function layout(felt, seats) {
    const n = seats.length; if (!felt || !n) return;
    const g = geo(felt, n), fr = felt.getBoundingClientRect();
    const bd = felt.querySelector('.table') || felt.querySelector('.board'); let board = null;
    if (bd) { const r = bd.getBoundingClientRect(); board = { l: r.left - fr.left, r: r.right - fr.left, t: r.top - fr.top, b: r.bottom - fr.top }; }
    felt.classList.toggle('many', g.many);
    seats.forEach((s, k) => {
      if (!s) return;
      const p = seatXY(g, k, n), b = betXY(g, p, board);
      if (s.el) { s.el.style.left = p.x.toFixed(1) + 'px'; s.el.style.top = p.y.toFixed(1) + 'px'; s.el.dataset.side = p.side; }
      if (s.bet) { s.bet.style.left = b.x.toFixed(1) + 'px'; s.bet.style.top = b.y.toFixed(1) + 'px'; }
    });
  }

  /* ---------- animace ---------- */
  const reduced = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const off = () => !!root.__FAST || reduced() || !!root.__RRNoAnim;
  const center = (el, felt) => { const r = el.getBoundingClientRect(), f = felt.getBoundingClientRect(); return { x: r.left - f.left + r.width / 2, y: r.top - f.top + r.height / 2 }; };
  const CH = ['#ff2d4a', '#f2f2f2', '#1d1d22', '#3b82f6', '#22c55e'];
  function chipEl(c) { const e = document.createElement('i'); e.className = 'fx-chip'; e.style.setProperty('--c', c); return e; }
  /* žetony z bodu A do bodu B (souřadnice v rámci stolu) */
  function chips(felt, from, to, count, o) {
    if (off() || !felt || !from || !to) return;
    o = o || {}; count = Math.max(1, Math.min(10, count | 0));
    for (let i = 0; i < count; i++) {
      const e = chipEl(o.color || CH[i % (o.allin ? 5 : 3)]); felt.appendChild(e);
      const jx = (Math.random() - 0.5) * 10, jy = (Math.random() - 0.5) * 6;
      e.style.left = from.x + 'px'; e.style.top = from.y + 'px';
      const dx = to.x - from.x + jx, dy = to.y - from.y + jy, lift = Math.min(40, Math.hypot(dx, dy) * 0.25);
      const a = e.animate([
        { transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 },
        { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - lift}px)) scale(1.05)`, opacity: 1, offset: 0.5 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.9)`, opacity: o.keep ? 1 : 0.15 }
      ], { duration: (o.dur || 420) + i * 18, delay: (o.delay || 0) + i * (o.gap || 45), easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'backwards' });
      a.onfinish = () => e.remove(); a.oncancel = () => e.remove();
    }
  }
  function pop(el, cls) { if (!el || off()) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), 1200); }
  function shake(el) { if (off() || !el || !el.animate) return; el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }], { duration: 320, easing: 'ease-out' }); }
  function muck(felt, cardEls, to) {
    if (off() || !felt) return;
    cardEls.forEach((c, i) => {
      if (!c || !c.isConnected || c.style.visibility === 'hidden') return;
      const r = c.getBoundingClientRect(); if (!r.width) return;
      const f = felt.getBoundingClientRect(), x = r.left - f.left, y = r.top - f.top;
      const e = document.createElement('div'); e.className = 'fx-muck';
      Object.assign(e.style, { left: x + 'px', top: y + 'px', width: r.width + 'px', height: r.height + 'px' }); felt.appendChild(e);
      const a = e.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${to.x - x - r.width / 2}px,${to.y - y - r.height / 2}px) rotate(${i ? 160 : -140}deg) scale(.6)`, opacity: 0 }],
        { duration: 480, delay: i * 50, easing: 'cubic-bezier(.4,.1,.6,1)', fill: 'backwards' });
      a.onfinish = () => e.remove();
    });
  }
  function ripple(felt, at) {
    if (off() || !felt || !at) return;
    const e = document.createElement('i'); e.className = 'fx-tap'; e.style.left = at.x + 'px'; e.style.top = at.y + 'px'; felt.appendChild(e);
    setTimeout(() => e.remove(), 700);
  }
  const nChips = (amt, bb) => Math.max(1, Math.min(8, Math.round(Math.log2(1 + amt / Math.max(1, bb)) + 1)));

  /* ---------- diff stavu stolu → animace (stejné pro offline i online) ----------
     st = { hand, bb, pot: el, seats: [{ key, el(avatar), bet(el), cards:[el], bet, last, folded, allIn, win }] } */
  function sync(felt, st) {
    if (!felt) return;
    const prev = felt.__rrPrev, potC = st.pot ? center(st.pot, felt) : { x: felt.clientWidth / 2, y: felt.clientHeight / 2 };
    const cur = {}; st.seats.forEach(s => { cur[s.key] = { bet: s.bet | 0, last: s.last || '', folded: !!s.folded, allIn: !!s.allIn, win: !!s.win }; });
    felt.__rrPrev = { hand: st.hand, seats: cur };
    if (!prev || prev.hand !== st.hand || off()) return;
    let toPot = false;
    st.seats.forEach(s => {
      const p = prev.seats[s.key], c = cur[s.key]; if (!p || !s.el) return;
      const at = center(s.el, felt), seatEl = s.el.closest('.opp,.seat-me') || s.el;
      if (c.bet > p.bet && s.betEl) { const to = center(s.betEl, felt); chips(felt, at, to, nChips(c.bet - p.bet, st.bb), { allin: c.allIn }); pop(s.betEl, 'bump'); }
      if (c.bet < p.bet && p.bet > 0 && s.betEl && !c.win) { chips(felt, center(s.betEl, felt), potC, nChips(p.bet, st.bb), { dur: 380, gap: 25 }); toPot = true; }
      if (c.allIn && !p.allIn) { pop(seatEl, 'fx-allin'); shake(felt); chips(felt, at, potC, 10, { allin: true, dur: 620, gap: 30 }); }
      if (c.folded && !p.folded) muck(felt, s.cards || [], potC);
      if (c.last !== p.last && c.last) { if (s.bubble) pop(s.bubble, 'fx-bub'); if (/^check/i.test(c.last)) ripple(felt, at); }
      if (c.win && !p.win) { const d = st.winDelay || 350; chips(felt, potC, at, 9, { dur: 700, gap: 50, delay: d }); setTimeout(() => pop(seatEl, 'fx-win'), d + 300); }
    });
    if (toPot && st.pot) setTimeout(() => pop(st.pot, 'bump'), 380);
  }
  const kind = s => { s = String(s || '').toLowerCase(); return !s ? '' : /^all/.test(s) ? 'allin' : /^fold/.test(s) ? 'fold' : /^check/.test(s) ? 'check' : /^(raise|bet)/.test(s) ? 'raise' : /^call/.test(s) ? 'call' : /^(sb|bb)/.test(s) ? 'blind' : ''; };
  function chipStack(n) { return `<span class="cstk">${[0, 1, 2].slice(0, Math.max(1, Math.min(3, n))).map(i => `<i style="--c:${CH[i]}"></i>`).join('')}</span>`; }


  /* ---------- volba velikosti sázky: velká částka, posuvník (jemný dole), −/+, rychlé volby, vlastní číslo ----------
     o = { min, max, bb, pot, toCall, curBet, isBet, rec, t, fmt, onGo(to, allin) } – všechno v „raise na“ částkách */
  function sizer(box, o) {
    const T = o.t, F = o.fmt || (n => String(n)), max = Math.max(1, Math.round(o.max)), bb = Math.max(1, o.bb | 0);
    const min = Math.min(max, Math.max(1, Math.round(o.min)));
    const clamp = v => { v = Math.round(v); if (v >= max) return max; if (v <= min) return min; const sn = Math.round(v / bb) * bb; return Math.min(max, Math.max(min, sn)); };
    const U = 1000, toU = v => max > min ? Math.round(Math.sqrt((v - min) / (max - min)) * U) : U;
    const fromU = u => (u >= U ? max : clamp(min + (max - min) * Math.pow(u / U, 2)));
    const base = o.pot + (o.isBet ? 0 : o.toCall), cb = o.isBet ? 0 : o.curBet;
    const quick = [['bs.half', cb + base * 0.5], ['bs.3q', cb + base * 0.75], ['bs.pot', cb + base], ['bs.2x', o.isBet ? o.pot * 2 : o.curBet * 2], ['bs.allinS', max]]
      .map(([k, v]) => [k, clamp(v)]);
    let to = clamp(o.start != null ? o.start : o.rec || min);
    const verb = v => (v >= max ? T('bs.allin', { n: F(v) }) : o.isBet ? T('bs.bet', { n: F(v) }) : T('bs.raiseTo', { n: F(v) }));
    box.innerHTML = `<div class="bs">
      <div class="bs-amt"><button class="bs-v" id="bsV" aria-label="${T('bs.type')}">${F(to)}</button><input class="bs-in" id="bsIn" type="number" inputmode="numeric" min="${min}" max="${max}" step="${bb}" hidden></div>
      <div class="bs-info" id="bsInfo"></div>
      <div class="bs-row no-swipe"><button class="bs-pm" id="bsMinus" aria-label="−">−</button><input type="range" class="bs-range" id="bsR" min="0" max="${U}" step="1" value="${toU(to)}"><button class="bs-pm" id="bsPlus" aria-label="+">+</button></div>
      <div class="bs-ends"><span>${T('bs.min', { n: F(min) })}</span><span>All-in ${F(max)}</span></div>
      <div class="bs-q">${quick.map(([k, v]) => `<button class="bs-c${v === o.rec ? ' rec' : ''}" data-q="${v}">${T(k)}</button>`).join('')}</div>
      <button class="btn primary wide bs-go" id="bsGo"></button></div>`;
    const $ = id => box.querySelector('#' + id);
    const draw = (fromRange) => {
      $('bsV').textContent = F(to); $('bsGo').textContent = verb(to); $('bsGo').classList.toggle('allin', to >= max);
      const pct = base > 0 ? Math.round((to - cb) / base * 100) : 0;
      $('bsInfo').textContent = T('bs.info', { x: String(Math.round(to / bb * 10) / 10).replace('.', T('bs.dec') === 'bs.dec' ? '.' : T('bs.dec')), p: pct });
      if (!fromRange) $('bsR').value = toU(to);
      const r = $('bsR'); r.style.setProperty('--p', (r.value / U * 100) + '%');
      let hit = false; box.querySelectorAll('[data-q]').forEach(b => { const on = !hit && +b.dataset.q === to; if (on) hit = true; b.classList.toggle('on', on); });
    };
    $('bsR').oninput = e => { const n = fromU(+e.target.value); if (n !== to && navigator.vibrate && o.vib) navigator.vibrate(3); to = n; draw(true); };
    $('bsR').onchange = () => draw(false);
    const step = d => { const st = to >= 40 * bb ? 5 * bb : bb; to = clamp(to >= max && d < 0 ? Math.floor((max - 1) / bb) * bb : to + d * st); draw(false); };
    $('bsMinus').onclick = () => step(-1); $('bsPlus').onclick = () => step(1);
    box.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { to = +b.dataset.q; draw(false); });
    $('bsV').onclick = () => { const i = $('bsIn'); $('bsV').hidden = true; i.hidden = false; i.value = to; i.focus(); i.select && i.select(); };
    const commit = () => { const i = $('bsIn'); if (i.hidden) return; const n = +i.value; if (n > 0) to = n >= max ? max : Math.min(max, Math.max(min, Math.round(n))); i.hidden = true; $('bsV').hidden = false; draw(false); };
    $('bsIn').onblur = commit; $('bsIn').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } };
    $('bsGo').onclick = () => { commit(); o.onGo(to, to >= max); };
    draw(false);
    return { get: () => to };
  }
  const api = { sizer, kind, AV, avatarSVG, botAv, valid, myAv, layout, sync, chips, pop, shake, muck, ripple, chipStack, center, off };
  root.RRT = api;
})(typeof window !== 'undefined' ? window : globalThis);
