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
  const BOT_AV = ['fox', 'cat', 'bear', 'frog', 'panda', 'rabbit', 'owl', 'cowboy', 'shades', 'tiger', 'robot', 'alien', 'ninja', 'ace', 'queen'];
  const eye = (x, y, r = 3.2, c = '#1a1a1f') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${x + r * .35}" cy="${y - r * .4}" r="${r * .33}" fill="#fff"/>`;
  const eyes = (y, dx = 8, r, c) => eye(32 - dx, y, r, c) + eye(32 + dx, y, r, c);
  const smile = (y, w = 6, c = '#1a1a1f') => `<path d="M${32 - w} ${y} Q32 ${y + w * .9} ${32 + w} ${y}" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>`;
  const person = (skin, shirt, hair) => `<path d="M10 66 Q12 46 32 46 Q52 46 54 66Z" fill="${shirt}"/><rect x="28" y="38" width="8" height="10" rx="3" fill="${skin}"/>${hair && hair.back || ''}<circle cx="32" cy="29" r="13" fill="${skin}"/>`;
  const DRAW = {
    fox: () => ['#ffb36b', '#e0631f', `<path d="M13 26 L17 7 L29 19Z M51 26 L47 7 L35 19Z" fill="#e8742a"/><path d="M16 22 L18 12 L25 19Z M48 22 L46 12 L39 19Z" fill="#2b1a12"/><ellipse cx="32" cy="35" rx="20" ry="17" fill="#f28c38"/><path d="M32 53 C21 53 14 44 15 37 C22 41 27 41 32 46 C37 41 42 41 49 37 C50 44 43 53 32 53Z" fill="#fff"/>${eyes(32, 8)}<ellipse cx="32" cy="45" rx="3" ry="2.2" fill="#1a1a1f"/>`],
    cat: () => ['#c9cbd6', '#6b6f80', `<path d="M13 30 L15 8 L28 20Z M51 30 L49 8 L36 20Z" fill="#8d92a3"/><path d="M16 24 L17 13 L24 20Z M48 24 L47 13 L40 20Z" fill="#f4a9b8"/><circle cx="32" cy="36" r="19" fill="#9aa0b2"/>${eyes(33, 8, 3.4, '#2f7a3c')}<path d="M30 41 L34 41 L32 43.5Z" fill="#f47f97"/><path d="M32 43.5 Q29 47 26 45 M32 43.5 Q35 47 38 45" fill="none" stroke="#3a3a44" stroke-width="1.6" stroke-linecap="round"/><path d="M10 38 L22 40 M10 44 L22 43 M54 38 L42 40 M54 44 L42 43" stroke="#eee" stroke-width="1.2" stroke-linecap="round"/>`],
    bear: () => ['#e6b98a', '#8a5a33', `<circle cx="15" cy="18" r="8" fill="#a86b3c"/><circle cx="49" cy="18" r="8" fill="#a86b3c"/><circle cx="15" cy="18" r="4" fill="#d9a876"/><circle cx="49" cy="18" r="4" fill="#d9a876"/><circle cx="32" cy="35" r="20" fill="#a86b3c"/><ellipse cx="32" cy="43" rx="10" ry="8" fill="#e3bb8c"/>${eyes(31, 8)}<ellipse cx="32" cy="40" rx="3.6" ry="2.6" fill="#2a1a10"/>${smile(45, 3.5)}`],
    frog: () => ['#b8f08a', '#3f9a3a', `<ellipse cx="32" cy="42" rx="23" ry="16" fill="#66c24f"/><circle cx="20" cy="25" r="9" fill="#66c24f"/><circle cx="44" cy="25" r="9" fill="#66c24f"/><circle cx="20" cy="25" r="5.5" fill="#fff"/><circle cx="44" cy="25" r="5.5" fill="#fff"/>${eye(21, 25, 3)}${eye(45, 25, 3)}<path d="M18 43 Q32 54 46 43" fill="none" stroke="#1f5a1c" stroke-width="2.4" stroke-linecap="round"/><circle cx="17" cy="40" r="3" fill="#f7a1a1" opacity=".7"/><circle cx="47" cy="40" r="3" fill="#f7a1a1" opacity=".7"/>`],
    ace: () => ['#ffd27a', '#ff2d4a', person('#f1c39b', '#d42039') + `<path d="M19 27 Q19 13 32 13 Q46 13 45 27 Q42 19 32 20 Q23 19 19 27Z" fill="#2a1d17"/>${eyes(30, 5, 2.2)}${smile(35, 4)}<path d="M28 52 L32 58 L36 52" fill="#fff"/>`],
    queen: () => ['#ffc2d6', '#a33a6b', `<path d="M16 44 Q14 18 32 15 Q50 18 48 44Z" fill="#5b2d1a"/>` + person('#e8b08e', '#111') + `<path d="M19 29 Q20 14 32 14 Q45 14 45 29 Q40 20 30 21 Q24 22 19 29Z" fill="#6b3820"/>${eyes(30, 5, 2.2)}${smile(35, 3.5, '#b8324f')}<circle cx="19" cy="34" r="1.8" fill="#ffd27a"/><circle cx="45" cy="34" r="1.8" fill="#ffd27a"/>`],
    panda: () => ['#dfe6ee', '#7d8a99', `<circle cx="16" cy="18" r="8" fill="#1d1d22"/><circle cx="48" cy="18" r="8" fill="#1d1d22"/><circle cx="32" cy="35" r="20" fill="#fff"/><ellipse cx="23" cy="33" rx="5.5" ry="7" fill="#1d1d22" transform="rotate(25 23 33)"/><ellipse cx="41" cy="33" rx="5.5" ry="7" fill="#1d1d22" transform="rotate(-25 41 33)"/>${eye(23.5, 32, 2.2, '#fff').replace('fill="#fff"/>', 'fill="#1d1d22"/>')}<circle cx="24" cy="32" r="2" fill="#fff"/><circle cx="40" cy="32" r="2" fill="#fff"/><ellipse cx="32" cy="42" rx="3.4" ry="2.4" fill="#1d1d22"/>${smile(46, 3)}`],
    rabbit: () => ['#ffd9e4', '#c76b8a', `<ellipse cx="23" cy="14" rx="5.5" ry="14" fill="#f2f2f5"/><ellipse cx="41" cy="14" rx="5.5" ry="14" fill="#f2f2f5"/><ellipse cx="23" cy="14" rx="2.6" ry="10" fill="#f7b5c8"/><ellipse cx="41" cy="14" rx="2.6" ry="10" fill="#f7b5c8"/><circle cx="32" cy="39" r="18" fill="#f2f2f5"/>${eyes(36, 7)}<path d="M30 42 L34 42 L32 44.5Z" fill="#f47f97"/><path d="M32 44.5 V48 M29 49 Q32 51 35 49" fill="none" stroke="#555" stroke-width="1.5" stroke-linecap="round"/>`],
    owl: () => ['#ffe2a8', '#8a6a3a', `<path d="M14 22 L18 10 L26 18Z M50 22 L46 10 L38 18Z" fill="#7a5530"/><ellipse cx="32" cy="38" rx="20" ry="22" fill="#9a6d3d"/><ellipse cx="32" cy="46" rx="12" ry="12" fill="#d9b483"/><circle cx="23" cy="30" r="8" fill="#ffd34d"/><circle cx="41" cy="30" r="8" fill="#ffd34d"/>${eye(23, 30, 4)}${eye(41, 30, 4)}<path d="M29 37 L35 37 L32 43Z" fill="#e8892b"/>`],
    cowboy: () => ['#ffd9a8', '#b5651d', person('#e0a47e', '#3b6ea8') + `<ellipse cx="32" cy="19" rx="24" ry="5" fill="#7a4a22"/><path d="M20 19 Q20 5 32 6 Q44 5 44 19Z" fill="#8f5a2b"/><rect x="20" y="15" width="24" height="3.5" fill="#3a2414"/>${eyes(30, 5, 2.2)}<path d="M25 36 Q32 33 39 36 Q32 39 25 36Z" fill="#5b3a1e"/>`],
    shades: () => ['#9fe7ff', '#2a6cff', person('#c98d62', '#111') + `<path d="M19 26 Q18 12 32 12 Q47 12 45 26 L45 22 Q40 15 32 16 Q23 15 19 22Z" fill="#111"/><rect x="20" y="25" width="10.5" height="7" rx="3" fill="#111"/><rect x="33.5" y="25" width="10.5" height="7" rx="3" fill="#111"/><rect x="30" y="27" width="4" height="1.6" fill="#111"/><path d="M22 27 L26 26" stroke="#5cf" stroke-width="1.4" stroke-linecap="round"/>${smile(36, 3.5)}<path d="M26 51 h12 v3 h-12z" fill="#ffd27a"/>`],
    tiger: () => ['#ffcf7a', '#d9661a', `<circle cx="15" cy="17" r="7" fill="#f08a24"/><circle cx="49" cy="17" r="7" fill="#f08a24"/><circle cx="15" cy="17" r="3.5" fill="#fff"/><circle cx="49" cy="17" r="3.5" fill="#fff"/><circle cx="32" cy="35" r="20" fill="#f08a24"/><path d="M32 15 L30 22 L34 22Z M14 30 L22 32 L14 35Z M50 30 L42 32 L50 35Z M18 23 L24 27 M46 23 L40 27" fill="#1d1d22" stroke="#1d1d22" stroke-width="2" stroke-linecap="round"/><ellipse cx="32" cy="45" rx="11" ry="8" fill="#fff"/>${eyes(32, 8, 3, '#2c6e2c')}<ellipse cx="32" cy="41" rx="3.4" ry="2.4" fill="#e8607a"/>${smile(46, 3)}`],
    robot: () => ['#a8f0ff', '#3c5a78', `<rect x="31" y="5" width="2.5" height="9" fill="#9aa4b1"/><circle cx="32.2" cy="5" r="3" fill="#ff2d4a"/><rect x="13" y="14" width="38" height="34" rx="9" fill="#c4ccd6"/><rect x="18" y="21" width="28" height="14" rx="6" fill="#1b2633"/><circle cx="25" cy="28" r="3.6" fill="#5cf"/><circle cx="39" cy="28" r="3.6" fill="#5cf"/><rect x="23" y="39" width="18" height="4" rx="2" fill="#7d8896"/><rect x="9" y="25" width="4" height="12" rx="2" fill="#9aa4b1"/><rect x="51" y="25" width="4" height="12" rx="2" fill="#9aa4b1"/><path d="M14 66 Q16 52 32 52 Q48 52 50 66Z" fill="#7d8896"/>`],
    alien: () => ['#c6ffb0', '#2c7a52', `<path d="M24 12 Q20 4 16 6 M40 12 Q44 4 48 6" stroke="#59d17a" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="16" cy="6" r="2.6" fill="#59d17a"/><circle cx="48" cy="6" r="2.6" fill="#59d17a"/><path d="M32 12 C48 12 52 26 48 36 C44 47 37 54 32 54 C27 54 20 47 16 36 C12 26 16 12 32 12Z" fill="#59d17a"/><ellipse cx="23" cy="32" rx="6" ry="8" fill="#111" transform="rotate(-25 23 32)"/><ellipse cx="41" cy="32" rx="6" ry="8" fill="#111" transform="rotate(25 41 32)"/><circle cx="21" cy="29" r="1.8" fill="#fff"/><circle cx="39" cy="29" r="1.8" fill="#fff"/>${smile(45, 3, '#1f5a35')}`],
    ninja: () => ['#ff8a8a', '#3a0d14', person('#e0a47e', '#1d1d22') + `<circle cx="32" cy="29" r="13.5" fill="#1d1d22"/><rect x="19" y="24" width="26" height="9" rx="4" fill="#e0a47e"/>${eyes(28.5, 5, 2.2)}<rect x="18" y="20" width="28" height="3.5" fill="#ff2d4a"/><path d="M45 21 L55 16 L53 23Z" fill="#ff2d4a"/>`],
    king: () => ['#fff0a8', '#c99a1c', person('#f1c39b', '#8a1530') + `<path d="M20 34 Q22 48 32 48 Q42 48 44 34 Q38 40 32 40 Q26 40 20 34Z" fill="#e9e9ee"/><path d="M19 22 L19 8 L25.5 14 L32 5 L38.5 14 L45 8 L45 22Z" fill="#ffd34d" stroke="#b8860b" stroke-width="1.4" stroke-linejoin="round"/><circle cx="32" cy="16" r="2.3" fill="#ff2d4a"/>${eyes(29, 5, 2.2)}<path d="M28 52 L32 56 L36 52" fill="#ffd34d"/>`],
    dragon: () => ['#ff9a6b', '#6a0f1c', `<path d="M18 20 L10 4 L24 15Z M46 20 L54 4 L40 15Z" fill="#ffd34d"/><path d="M14 30 Q14 14 32 14 Q50 14 50 30 L50 40 Q50 54 32 54 Q14 54 14 40Z" fill="#d42039"/><path d="M20 44 Q32 58 44 44 Q44 52 32 54 Q20 52 20 44Z" fill="#ff8a5c"/>${eye(23, 30, 3.4, '#ffd34d')}${eye(41, 30, 3.4, '#ffd34d')}<circle cx="28" cy="44" r="1.6" fill="#3a0d14"/><circle cx="36" cy="44" r="1.6" fill="#3a0d14"/><path d="M8 34 L14 32 L14 38Z M56 34 L50 32 L50 38Z" fill="#a8122c"/>`],
    shark: () => ['#9fd6ff', '#164a7a', `<path d="M32 4 L40 18 L26 18Z" fill="#5a7a96"/><ellipse cx="32" cy="36" rx="22" ry="19" fill="#6f8fab"/><path d="M12 40 Q32 60 52 40 Q48 52 32 54 Q16 52 12 40Z" fill="#eef4f8"/><path d="M18 42 L22 47 L26 43 L30 48 L34 43 L38 48 L42 43 L46 47" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/><path d="M17 42 Q32 50 47 42" fill="none" stroke="#2a3a48" stroke-width="2"/>${eyes(31, 11, 3)}<path d="M18 26 L26 29 M46 26 L38 29" stroke="#2a3a48" stroke-width="2.2" stroke-linecap="round"/>`],
    wizard: () => ['#c7b3ff', '#3a1f8a', person('#f1c39b', '#4b2aa8') + `<path d="M18 33 Q20 54 32 56 Q44 54 46 33 Q40 39 32 39 Q24 39 18 33Z" fill="#f4f4f8"/><path d="M14 22 L32 -2 L50 22Z" fill="#5a34c7"/><ellipse cx="32" cy="22" rx="20" ry="4" fill="#4527a0"/><path d="M28 8 l1.2 2.6 2.8.3-2.1 1.9.6 2.8-2.5-1.4-2.5 1.4.6-2.8-2.1-1.9 2.8-.3z" fill="#ffd34d"/>${eyes(29, 5, 2.2)}`],
    phoenix: () => ['#ffd36b', '#c2181f', `<path d="M32 2 Q36 12 30 16 Q40 10 42 20 Q48 12 46 4 Q56 16 46 26 L18 26 Q8 16 18 4 Q16 12 22 20 Q24 10 34 16 Q28 12 32 2Z" fill="#ffb02e"/><circle cx="32" cy="36" r="17" fill="#ff5a2b"/><path d="M15 40 Q4 44 6 56 Q14 48 20 50Z M49 40 Q60 44 58 56 Q50 48 44 50Z" fill="#ffb02e"/>${eyes(33, 7, 3)}<path d="M28 40 L36 40 L32 47Z" fill="#ffd34d"/>`],
    diamond: () => ['#9ff0ff', '#1a3a7a', `<path d="M17 18 H47 L58 31 L32 58 L6 31Z" fill="#5ad0ff"/><path d="M6 31 H58 M17 18 L24 31 L32 58 M47 18 L40 31 L32 58 M24 31 L32 18 L40 31" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.4" stroke-linejoin="round"/><path d="M17 18 H47 L58 31 H6Z" fill="rgba(255,255,255,.25)"/>${eyes(38, 7, 3)}${smile(44, 3.5)}`]
  };
  function avatarSVG(id) {
    const d = (DRAW[id] || DRAW.fox)(), g = 'rav' + (++uid);
    return `<svg class="av-svg" viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="${g}" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="${d[0]}"/><stop offset="1" stop-color="${d[1]}"/></radialGradient><clipPath id="${g}c"><circle cx="32" cy="32" r="32"/></clipPath></defs><g clip-path="url(#${g}c)"><circle cx="32" cy="32" r="32" fill="url(#${g})"/>${d[2]}</g></svg>`;
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

  const api = { kind, AV, avatarSVG, botAv, valid, myAv, layout, sync, chips, pop, shake, muck, ripple, chipStack, center, off };
  root.RRT = api;
})(typeof window !== 'undefined' ? window : globalThis);
