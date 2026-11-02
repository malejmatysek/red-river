/* Red River – ligy (jako arény v Clash Royale). Jediné místo s konfigurací: názvy, hranice trofejí, odměny, logo.
   Barvy: jen červená #FF2D4A, černá, bílá a šedá – nižší ligy černobílé obrysy, červené přibývá s ligou. */
(function () {
  const R = '#FF2D4A', W = '#fff', G = '#6b6a73', K = '#0b0b0d';
  const LEAGUES = [
    { id: 'garage', name: { cs: 'Garáž u kámoše', en: "Buddy's Garage" }, min: 0, reward: {} },
    { id: 'pub', name: { cs: 'Hospoda U Lumiho', en: "Lumi's Pub" }, min: 150, reward: { pts: 500, badge: 1 } },
    { id: 'backroom', name: { cs: 'Zadní salonek', en: 'The Back Room' }, min: 400, reward: { pts: 1000, look: ['felt', 'forest'], blinds: 1, badge: 1 } },
    { id: 'riverboat', name: { cs: 'Říční parník', en: 'Riverboat' }, min: 800, reward: { pts: 1500, look: ['back', 'stripes'], badge: 1 } },
    { id: 'underground', name: { cs: 'Podzemní klub', en: 'Underground Club' }, min: 1400, reward: { pts: 2500, look: ['lumi', 'shades'], blinds: 2, badge: 1 } },
    { id: 'montecarlo', name: { cs: 'Kasino Monte Carlo', en: 'Casino Monte Carlo' }, min: 2200, reward: { pts: 5000, look: ['felt', 'midnight'], blinds: 3, badge: 1 } },
    { id: 'palace', name: { cs: 'Red River Palace', en: 'Red River Palace' }, min: 3200, reward: { pts: 10000, look: ['lumi', 'crown'], blinds: 4, badge: 1, crown: 1 } }
  ];
  // trofeje za ruku: výhra +, prohra po dobrovolném vstupu −; Klasická hra a online se počítají víc (bez nápověd)
  const TROPHY = { win: 3, sdWin: 2, loss: -1, classicX: 2, onlineX: 2 };

  /* ---------- logo (SVG 256×256) ---------- */
  const LC = [[-40, -10, 44], [14, -24, 50], [50, 14, 40], [-30, 28, 38], [10, 30, 42], [0, 4, 48]];
  const blob = (f, g) => `<g fill="${f}">${LC.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r + (g || 0)}"/>`).join('')}</g>`;
  const eyes = f => [[12, -20], [38, -13]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="7.5" ry="13.5" transform="rotate(-14 ${x} ${y})" fill="${f}"/>`).join('');
  const lumi = (mode, extra, tf) => {
    let b;
    if (mode === 'outline') b = blob(W, 4) + blob(K) + eyes(W);          // bílý obrys
    else if (mode === 'outlineG') b = blob(G, 4) + blob(K) + eyes(W);    // šedý obrys
    else if (mode === 'white') b = blob(W) + eyes(K);
    else if (mode === 'redW') b = blob(W, 5) + blob(R) + eyes(W);        // červený s bílým lemem
    else b = blob(R) + eyes(W);
    return `<g transform="${tf || 'translate(128 156) scale(.62)'}">${b}${extra || ''}</g>`;
  };
  const SH = 'M128 12 L224 50 V136 C224 192 182 228 128 246 C74 228 32 192 32 136 V50 Z';
  const SHI = 'M128 26 L211 59 V136 C211 184 175 215 128 231 C81 215 45 184 45 136 V59 Z';
  const clip = id => `<clipPath id="${id}"><path d="${SHI}"/></clipPath>`;
  function logo(i, size, uid) {
    const id = 'lg' + i + (uid || ''), L = LEAGUES[i];
    let bg = K, ring = G, ringW = 6, inner = '', front = '', lm = '';
    switch (L.id) {
      case 'garage':   // šedé obrysy, garážová vrata
        inner = [0, 1, 2, 3, 4, 5, 6].map(k => `<line x1="40" x2="216" y1="${70 + k * 16}" y2="${70 + k * 16}" stroke="#2a2a30" stroke-width="5"/>`).join('') + `<line x1="128" y1="26" x2="128" y2="52" stroke="${G}" stroke-width="3"/><circle cx="128" cy="58" r="7" fill="none" stroke="${W}" stroke-width="3"/>`;
        lm = lumi('outlineG'); break;
      case 'pub':      // bílý obrys, půllitr
        ring = W; ringW = 5;
        inner = [0, 1, 2].map(k => `<line x1="40" x2="216" y1="${92 + k * 34}" y2="${92 + k * 34}" stroke="#1f1f24" stroke-width="3"/>`).join('');
        front = `<g transform="translate(160 150)" fill="none" stroke="${W}" stroke-width="5" stroke-linejoin="round"><rect x="0" y="0" width="34" height="48" rx="5" fill="${K}"/><path d="M34 10 h8 a8 8 0 0 1 8 8 v12 a8 8 0 0 1 -8 8 h-8"/><path d="M-3 0 c4 -12 14 -10 18 -6 c6 -8 20 -4 22 6" fill="${W}"/><line x1="12" y1="12" x2="12" y2="40"/><line x1="23" y1="12" x2="23" y2="40"/></g>`;
        lm = lumi('outline', '', 'translate(112 160) scale(.56)'); break;
      case 'backroom': // bílá, lampa nad stolem, slabé červené světlo
        ring = W; ringW = 6;
        inner = `<path d="M128 26 V58" stroke="${W}" stroke-width="3"/><path d="M98 78 Q128 50 158 78 Z" fill="${W}"/><path d="M100 80 L60 236 H196 L156 80 Z" fill="${R}" opacity=".16"/><ellipse cx="128" cy="214" rx="78" ry="14" fill="none" stroke="#2a2a30" stroke-width="4"/>`;
        lm = lumi('white'); break;
      case 'riverboat': // kolo parníku, vlny, kapitánská čepice
        ring = W; ringW = 6;
        inner = `<g transform="translate(128 112)" fill="none" stroke="#3a3a42" stroke-width="5"><circle r="66"/><circle r="20"/>${[0, 30, 60, 90, 120, 150].map(a => `<line x1="-66" x2="66" transform="rotate(${a})"/>`).join('')}</g>` + [0, 1].map(k => `<path d="M40 ${212 + k * 14} q14 -10 28 0 t28 0 t28 0 t28 0 t28 0 t28 0" fill="none" stroke="${W}" stroke-width="4" opacity="${k ? .5 : 1}"/>`).join('');
        front = '';
        lm = lumi('red', `<g transform="translate(0 12)"><path d="M-30 -62 Q18 -96 66 -58 L60 -46 Q16 -64 -26 -50 Z" fill="${W}"/><rect x="-34" y="-52" width="104" height="12" rx="6" fill="${K}" transform="rotate(8 18 -46)"/><circle cx="18" cy="-74" r="6" fill="${R}"/></g>`, 'translate(128 150) scale(.6)');
        front = `<rect x="34" y="52" width="188" height="0"/>`; inner += ''; ring = W; break;
      case 'underground': // neonové cihly, brýle
        ring = R; ringW = 6;
        inner = [0, 1, 2, 3, 4, 5, 6, 7].map(k => { const y = 52 + k * 22, o = k % 2 ? 22 : 0; return `<line x1="40" x2="216" y1="${y}" y2="${y}" stroke="#222228" stroke-width="3"/>` + [0, 1, 2, 3, 4].map(j => `<line x1="${44 + o + j * 44}" x2="${44 + o + j * 44}" y1="${y}" y2="${y + 22}" stroke="#222228" stroke-width="3"/>`).join(''); }).join('') + `<text x="128" y="84" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-weight="800" font-size="26" fill="none" stroke="${R}" stroke-width="2.5" letter-spacing="3">CLUB</text>`;
        lm = lumi('red', `<g transform="rotate(-14 25 -16)" fill="${W}"><rect x="-2" y="-30" width="26" height="22" rx="7"/><rect x="28" y="-30" width="26" height="22" rx="7"/><rect x="20" y="-24" width="12" height="4"/><rect x="-24" y="-25" width="24" height="4" rx="2"/></g>`, 'translate(128 160) scale(.6)'); break;
      case 'montecarlo': // ruleta, smoking s motýlkem
        ring = R; ringW = 9;
        inner = `<g transform="translate(128 120)">${[...Array(16)].map((_, k) => { const a0 = k * 22.5 * Math.PI / 180, a1 = (k + 1) * 22.5 * Math.PI / 180, r = 74; return `<path d="M0 0 L${(r * Math.cos(a0)).toFixed(1)} ${(r * Math.sin(a0)).toFixed(1)} A${r} ${r} 0 0 1 ${(r * Math.cos(a1)).toFixed(1)} ${(r * Math.sin(a1)).toFixed(1)} Z" fill="${k % 2 ? R : '#1a1a1e'}" opacity=".55"/>`; }).join('')}<circle r="74" fill="none" stroke="${W}" stroke-width="3"/><circle r="30" fill="${K}"/></g>`;
        lm = lumi('red', `<path d="M-6 40 L20 74 L46 40 Z" fill="${W}"/><path d="M4 40 L20 50 L4 60 Z M36 40 L20 50 L36 60 Z" fill="${K}"/><circle cx="20" cy="50" r="5" fill="${K}"/>`, 'translate(122 158) scale(.62)');
        front = [[64, 70], [192, 70], [52, 120], [204, 120]].map(([x, y]) => `<path d="M${x} ${y - 7} L${x + 2} ${y - 2} L${x + 7} ${y} L${x + 2} ${y + 2} L${x} ${y + 7} L${x - 2} ${y + 2} L${x - 7} ${y} L${x - 2} ${y - 2} Z" fill="${W}"/>`).join(''); break;
      case 'palace':   // nejvíc červené: červený štít, bílý palác, korunka
        bg = R; ring = W; ringW = 7;
        inner = `<g fill="none" stroke="${W}" stroke-width="4" stroke-linejoin="round" opacity=".9"><path d="M70 214 V150 H186 V214"/><path d="M92 150 Q128 84 164 150"/><path d="M56 214 V166 L70 154 M200 214 V166 L186 154"/>${[86, 106, 150, 170].map(x => `<line x1="${x}" y1="164" x2="${x}" y2="206"/>`).join('')}</g>`;
        lm = lumi('redW', `<path d="M-14 -66 L-22 -102 L-2 -82 L14 -110 L30 -82 L50 -102 L42 -66 Z" fill="${W}" stroke="${K}" stroke-width="4" stroke-linejoin="round"/>`, 'translate(126 168) scale(.56)');
        front = [[62, 76], [194, 76], [128, 52]].map(([x, y]) => `<path d="M${x} ${y - 8} L${x + 2.5} ${y - 2.5} L${x + 8} ${y} L${x + 2.5} ${y + 2.5} L${x} ${y + 8} L${x - 2.5} ${y + 2.5} L${x - 8} ${y} L${x - 2.5} ${y - 2.5} Z" fill="${W}"/>`).join(''); break;
    }
    const s = size || 256;
    return `<svg class="lg-logo" viewBox="0 0 256 256" width="${s}" height="${s}" aria-hidden="true"><defs>${clip(id)}</defs>`
      + `<path d="${SH}" fill="${ring}"/><path d="${SH}" fill="none" stroke="${ring}" stroke-width="${ringW - 6 > 0 ? ringW - 6 : 0}"/>`
      + `<path d="${SHI}" fill="${bg}" transform="translate(128 128) scale(${1 - (ringW - 6) * 0.004}) translate(-128 -128)"/>`
      + `<g clip-path="url(#${id})">${inner}${lm}</g>${front}`
      + '</svg>';
  }
  const leagueOf = tr => { let i = 0; LEAGUES.forEach((l, k) => { if (tr >= l.min) i = k; }); return i; };
  window.RR_LEAGUES = { LEAGUES, TROPHY, logo, leagueOf };
  if (typeof module !== 'undefined') module.exports = window.RR_LEAGUES;
})();
