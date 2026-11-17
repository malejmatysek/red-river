/* Red River – hlášky a emoji u stolu (jen předvolby, žádný volný text).
   Sdílené offline i online: data, bublina u místa, výběr (sheet), cooldown, reakce botů podle stylu. */
(function (root) {
  'use strict';
  const EMOJI = ['😏', '🤫', '😂', '🥱', '🤔', '😬', '🔥', '💀', '🫡', '🧊', '🃏', '💸', '👀'];
  /* [id, balíček, skupina, cs, en] – balíček base = zdarma */
  const PH = [
    ['nic', 'base', 'prov', '„Nemám nic.“ 😏', '“I’ve got nothing.” 😏'],
    ['call', 'base', 'prov', '„Fakt chceš callnout?“', '“You really wanna call?”'],
    ['blaf', 'base', 'prov', '„Tohle je blaf… nebo ne?“', '“Is this a bluff… or not?”'],
    ['diky', 'base', 'prov', '„Díky za žetony.“ 💸', '“Thanks for the chips.” 💸'],
    ['beton', 'base', 'prov', '„Ruka jako beton.“', '“Rock-solid hand.”'],
    ['rychle', 'base', 'prov', '„Už jsi skládal rychleji.“', '“You used to fold faster.”'],
    ['mysli', 'base', 'prov', '„Přemýšlej… přemýšlej…“', '“Think… think…”'],
    ['klidne', 'base', 'prov', '„All-in? Klidně.“', '“All-in? Sure.”'],
    ['pristi', 'base', 'prov', '„Neboj, příště.“', '“Don’t worry, next time.”'],
    ['pekna', 'base', 'nice', '„Pěkná hra“', '“Nice hand”'],
    ['smula', 'base', 'nice', '„Smůla“', '“Unlucky”'],
    ['gg', 'base', 'nice', '„GG“', '“GG”'],
    ['hs', 'base', 'nice', '„Hodně štěstí“', '“Good luck”'],
    ['bolet', 'drsnak', 'pack', '„Tohle bude bolet.“', '“This is gonna hurt.”'],
    ['jdu', 'drsnak', 'pack', '„Jdu si pro tvoje žetony.“', '“Coming for your chips.”'],
    ['nemas', 'drsnak', 'pack', '„Na tohle nemáš.“', '“You can’t handle this.”'],
    ['milost', 'drsnak', 'pack', '„Bez milosti.“ 🧊', '“No mercy.” 🧊'],
    ['pravidla', 'drsnak', 'pack', '„Můj stůl, moje pravidla.“', '“My table, my rules.”'],
    ['strach', 'drsnak', 'pack', '„Cítím strach.“ 👀', '“I smell fear.” 👀'],
    ['deda', 'vtip', 'pack', '„Karty mi míchal děda.“', '“Grandpa shuffled these.”'],
    ['horoskop', 'vtip', 'pack', '„Hraju podle horoskopu.“ 🔮', '“Playing by my horoscope.” 🔮'],
    ['pizza', 'vtip', 'pack', '„Kdo vyhraje, platí pizzu.“ 🍕', '“Winner buys pizza.” 🍕'],
    ['film', 'vtip', 'pack', '„Tohle jsem viděl ve filmu.“ 🎬', '“Saw this in a movie.” 🎬'],
    ['utajeni', 'vtip', 'pack', '„Moje karty jsou přísně tajné.“ 🕶️', '“My cards are top secret.” 🕶️'],
    ['oops', 'vtip', 'pack', '„Ups, to jsem nechtěl… nebo jo.“', '“Oops, didn’t mean that… or did I.”']
  ];
  /* balíčky: cena v diamantech nebo odemknutí úspěchem (jako avatary) */
  const PACKS = { drsnak: { d: 25, ach: 'allin', ic: '🧊' }, vtip: { d: 15, ach: 'sd10', ic: '🎭' } };
  const BY = {}; PH.forEach(p => { BY[p[0]] = p; }); EMOJI.forEach((e, i) => { BY['e' + i] = ['e' + i, 'base', 'emo', e, e]; });
  const valid = id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(BY, id);
  const isEmoji = id => valid(id) && BY[id][2] === 'emo';
  const text = (id, lang) => (valid(id) ? BY[id][lang === 'en' ? 4 : 3] : '');
  const packOf = id => (valid(id) ? BY[id][1] : null);
  const COOLDOWN = 5000, SHOW_MS = 3000;
  let lastSent = 0;
  const ready = () => Date.now() - lastSent >= COOLDOWN;
  const left = () => Math.max(0, COOLDOWN - (Date.now() - lastSent));
  function mark(btn) {
    lastSent = Date.now();
    if (!btn) return;
    btn.classList.remove('cd'); void btn.offsetWidth; btn.classList.add('cd'); btn.disabled = true;
    setTimeout(() => { btn.classList.remove('cd'); btn.disabled = false; }, COOLDOWN);
  }
  /* bublina nad místem hráče (souřadnice v rámci stolu); jedna na místo, ~3 s */
  function show(felt, seatEl, id, lang) {
    if (!felt || !seatEl || !valid(id)) return null;
    const key = seatEl.dataset.emoKey || (seatEl.dataset.emoKey = 'k' + Math.random().toString(36).slice(2, 8));
    const old = felt.querySelector(`.emo-b[data-k="${key}"]`); if (old) old.remove();
    const r = seatEl.getBoundingClientRect(), f = felt.getBoundingClientRect();
    const b = document.createElement('div');
    b.className = 'emo-b' + (isEmoji(id) ? ' big' : ''); b.dataset.k = key; b.dataset.id = id;
    b.textContent = text(id, lang);
    const x = r.left - f.left + r.width / 2, y = r.top - f.top;
    b.style.left = Math.max(8, Math.min(f.width - 8, x)) + 'px'; b.style.top = y + 'px';
    felt.appendChild(b);
    // nevylézt ze stolu do stran
    const br = b.getBoundingClientRect();
    if (br.left < f.left + 4) b.style.setProperty('--dx', (f.left + 4 - br.left) + 'px');
    else if (br.right > f.right - 4) b.style.setProperty('--dx', (f.right - 4 - br.right) + 'px');
    setTimeout(() => { b.classList.add('out'); setTimeout(() => b.remove(), 260); }, SHOW_MS);
    return b;
  }
  /* výběr: emoji + hlášky; owned(pack) → bool; price(pack) → html; t = překlad */
  function pickerHTML(o) {
    const L = o.lang, own = o.owned, T = o.t;
    const row = (id, lock) => `<button class="emo-ph${lock ? ' lock' : ''}" data-emo="${id}" ${lock ? 'disabled' : ''}>${text(id, L)}</button>`;
    const grp = g => PH.filter(p => p[2] === g).map(p => row(p[0])).join('');
    const pack = k => { const P = PACKS[k], ok = own(k);
      return `<div class="emo-h"><b>${P.ic} ${T('emo.pk.' + k)}</b>${ok ? '' : `<button class="emo-buy" data-emopack="${k}">${o.price(k)}</button>`}</div>
        ${ok ? '' : `<div class="emo-note">${T('emo.orAch', { a: T('a.' + P.ach) })}</div>`}
        <div class="emo-list">${PH.filter(p => p[1] === k).map(p => row(p[0], !ok)).join('')}</div>`; };
    return `<h2>${T('emo.title')}</h2>${o.cd ? `<div class="sub">${T('emo.wait', { n: Math.ceil(o.cd / 1000) })}</div>` : ''}
      <div class="emo-grid">${EMOJI.map((e, i) => `<button class="emo-e" data-emo="e${i}" aria-label="${e}">${e}</button>`).join('')}</div>
      <div class="emo-h"><b>${T('emo.prov')}</b></div><div class="emo-list">${grp('prov')}</div>
      <div class="emo-h"><b>${T('emo.nice')}</b></div><div class="emo-list">${grp('nice')}</div>
      ${Object.keys(PACKS).map(pack).join('')}`;
  }
  /* ---------- boti (offline): reakce podle stylu ---------- */
  const BOT = {
    maniac: { p: 0.55, win: ['diky', 'nic', 'e11', 'e6', 'klidne', 'e0', 'rychle'], lose: ['e7', 'e5', 'pristi'], taunt: ['klidne', 'e6', 'call', 'e0'], allin: ['klidne', 'e6', 'call'] },
    lag: { p: 0.4, win: ['e1', 'nic', 'e0', 'blaf', 'e10'], lose: ['e4', 'e5', 'pekna'], taunt: ['e0', 'mysli', 'blaf', 'e12'], allin: ['mysli', 'e10', 'blaf'] },
    tag: { p: 0.22, win: ['gg', 'e8', 'pekna'], lose: ['pekna', 'e4', 'gg'], taunt: ['e8', 'hs', 'e4'], allin: ['e4', 'e12'] },
    station: { p: 0.32, win: ['e2', 'pekna', 'e2'], lose: ['smula', 'e5', 'e2', 'pristi'], taunt: ['e2', 'e4', 'smula'], allin: ['e5', 'e2'] },
    rock: { p: 0.12, win: ['beton', 'e9', 'gg'], lose: ['e3', 'gg'], taunt: ['e3', 'e9'], allin: ['beton', 'e9'] }
  };
  /* ev = 'win' | 'lose' | 'taunt' | 'allin'; vrací id nebo null */
  function botPick(arch, ev, rng, boost) {
    rng = rng || Math.random; const B = BOT[arch] || BOT.tag;
    if (rng() > Math.min(0.9, B.p * (boost || 1))) return null;
    const L = B[ev] || B.win; return L[Math.floor(rng() * L.length)];
  }
  root.RREmo = { EMOJI, PH, PACKS, COOLDOWN, SHOW_MS, valid, isEmoji, text, packOf, ready, left, mark, show, pickerHTML, botPick };
})(typeof window !== 'undefined' ? window : globalThis);
