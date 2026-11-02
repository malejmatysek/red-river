/* Red River – online stoly: obrazovky (Hrát s kamarády → Založit / Připojit → lobby → stůl; Hrát online → úroveň → rychlé usazení → stůl).
   Server je autoritativní (online/core.js v Edge Function nebo v lokálním mocku); klient jen zobrazuje svůj pohled a posílá akce.
   U online stolů NEJSOU rady, šance na výhru ani hodnocení tahů – jen rozbor ruky po jejím skončení. */
(function () {
  'use strict';
  const R = window.RR; if (!R || !window.RRNet) return;
  const { nav, t, $, SFX, vib, fmtPts } = R;
  try { if (/[?&]mock=1\b/.test(location.search)) window.__RR_MOCK = true; } catch (e) {}   // zapamatovat dřív, než se URL uklidí

  /* ---------- texty CS / EN ---------- */
  Object.assign(I18N.DICT.cs, {
    'on.title': 'Hrát s kamarády', 'on.tileSub': 'Soukromý stůl s kódem, body bez hodnoty', 'on.create': 'Založit stůl', 'on.createSub': 'Ty jsi hostitel – nastavíš hráče, vklad a blindy',
    'on.join': 'Připojit kódem', 'on.joinSub': 'Kamarád ti pošle kód stolu, např. RED-4821', 'on.lobby': 'Stůl', 'on.pts': 'Online body', 'on.ptsSub': 'Jen pro hru s kamarády, nedají se vybrat ani proměnit',
    'on.demo': 'Ukázkový režim (offline) – stůl běží jen v tomto zařízení. Skutečný server se zapne po nastavení Supabase.', 'on.demoBadge': 'UKÁZKA',
    'on.offline': 'Server pro online stoly zatím neodpovídá – zapínám ukázkový režim.', 'on.authOff': 'Přihlášení na server selhalo (anonymní přihlášení je asi vypnuté) – zapínám ukázkový režim.',
    'on.name': 'Tvoje jméno u stolu', 'on.namePh': 'např. Matyáš', 'on.players': 'Počet hráčů', 'on.blinds': 'Blindy', 'on.buyin': 'Vklad (buy-in)', 'on.bots': 'Doplnit volná místa boty',
    'on.botsSub': 'Boti hrají jen když chybí lidi; hostitel je může přidat i ručně', 'on.cost': 'Vstup stojí {n} bodů', 'on.createBtn': 'Založit stůl', 'on.code': 'Kód stolu', 'on.joinBtn': 'Připojit',
    'on.copy': 'Kopírovat odkaz', 'on.share': 'Sdílet', 'on.copied': 'Odkaz zkopírován', 'on.shareTxt': 'Pojď si zahrát Red River! Stůl {c}', 'on.seats': 'Místa u stolu', 'on.free': 'volné místo',
    'on.host': 'hostitel', 'on.bot': 'bot', 'on.you': 'ty', 'on.addBot': 'Přidat bota', 'on.start': 'Začít hru', 'on.waitHost': 'Čeká se, až hostitel spustí hru…', 'on.needTwo': 'Ke startu jsou potřeba aspoň 2 hráči (nebo bot).',
    'on.leave': 'Odejít od stolu', 'on.leaveQ': 'Odejít od stolu?', 'on.leaveTxt': 'Žetony, které máš u stolu, se ti vrátí jako online body.', 'on.leaveOk': 'Odejít', 'on.cancel': 'Zůstat',
    'on.resume': 'Vrátit se ke stolu {c}', 'on.yourTurn': 'Jsi na tahu', 'on.waitFor': 'Hraje {n}…', 'on.nextIn': 'Další ruka za {s} s', 'on.nextNow': 'Rozdat hned', 'on.waitPlayers': 'Čeká se na hráče…',
    'on.review': 'Rozbor ruky', 'on.reviewT': 'Rozbor ruky #{n}', 'on.reviewNone': 'Zatím se nedohrála žádná ruka.', 'on.won': '{n} vyhrává {a}', 'on.split': 'Dělí se', 'on.youWon': 'Vyhráváš {a}',
    'on.rebuy': 'Dokoupit žetony ({n} bodů)', 'on.busted': 'Došly ti žetony.', 'on.sitOut': 'Stojíš mimo hru (vypršel čas).', 'on.sitIn': 'Vrátit se do hry', 'on.raiseTo': 'Raise na {n}', 'on.betTo': 'Bet {n}',
    'on.min': 'Min', 'on.half': '½ potu', 'on.pot': 'Pot', 'on.allin': 'All-in', 'on.back': 'Zpět', 'on.showdown': 'Showdown', 'on.foldWin': 'ostatní složili', 'on.yourCards': 'Tvoje karty',
    'on.closed': 'Stůl byl zavřen.', 'on.noHints': 'U online stolů nejsou rady ani šance na výhru – jen rozbor ruky po jejím konci.', 'on.timeLeft': '{s} s', 'on.timeout': 'čas',
    'on.blindsV': 'Blindy {sb}/{bb}', 'on.buyinV': 'Vklad {n}', 'on.inviteHint': 'Pošli kamarádům kód nebo odkaz. Kdo ho otevře, sedne si k tvému stolu.',
    'on.err.points': 'Nemáš dost online bodů.', 'on.err.full': 'Stůl je plný.', 'on.err.no_room': 'Stůl s tímto kódem neexistuje.', 'on.err.closed': 'Stůl je už zavřený.', 'on.err.started': 'Hra už běží.',
    'on.err.not_host': 'Tohle může jen hostitel.', 'on.err.need_players': 'Potřebuješ aspoň 2 hráče.', 'on.err.not_your_turn': 'Teď nejsi na tahu.', 'on.err.raise_too_small': 'Navýšení je moc malé.',
    'on.err.bad_code': 'Kód má tvar RED-1234.', 'on.err.offline': 'Server je nedostupný.', 'on.err.auth': 'Přihlášení selhalo.', 'on.err.in_hand': 'Ruka ještě běží.', 'on.err.any': 'Něco se nepovedlo ({c}).',
    'on.a.fold': 'Fold', 'on.a.check': 'Check', 'on.a.call': 'Call', 'on.a.bet': 'Bet', 'on.a.raise': 'Raise', 'on.a.allin': 'All-in', 'on.a.sb': 'SB', 'on.a.bb': 'BB', 'on.a.timeout': 'čas vypršel',
    'pub.ptsSub': 'Jen virtuální body pro online hru – nedají se vybrat ani proměnit', 'pub.title': 'Hrát online', 'pub.tileSub': 'Veřejné stoly – hraj s kýmkoli, body bez hodnoty', 'pub.nick': 'Přezdívka u stolu', 'pub.nickSub': 'Uvidí ji všichni u stolu. Sprostá nebo urážlivá jména nejdou.',
    'pub.tiers': 'Vyber sázky', 'pub.t.micro': 'Mikro', 'pub.t.mid': 'Střední', 'pub.t.high': 'Vysoké', 'pub.sit': 'Rychle si sednout', 'pub.buy': 'Vstup {n} bodů',
    'pub.live': '{p} · {t}', 'pub.liveNone': 'Zatím nikdo – založíš nový stůl', 'pub.rules': 'Max 6 hráčů u stolu · 30 s na tah · kdo odejde nebo nestihne tah, složí karty · jen virtuální body, nic se nedá vybrat · u online stolů nejsou rady.',
    'pub.demo': 'Ukázkový režim (offline) – stůl běží jen v tomto zařízení a doplní ho boti. Se skutečným serverem hraješ proti lidem.', 'pub.resume': 'Vrátit se ke stolu ({t})',
    'pub.badge': 'Veřejný', 'pub.nextHand': 'Přisedl jsi během ruky – hraješ od další.', 'pub.reap': 'Bez návratu tě za {s} s zvedneme od stolu (žetony se vrátí).',
    'pub.report': 'Nahlásit hráče', 'pub.reportQ': 'Koho chceš nahlásit?', 'pub.reportWhy': 'Důvod', 'pub.reportNone': 'U stolu není nikdo jiný.', 'pub.reported': 'Díky, nahlášení jsme přijali.',
    'pub.r.abuse': 'Urážky / chování', 'pub.r.name': 'Nevhodné jméno', 'pub.r.cheat': 'Podvádění / spolupráce', 'pub.r.spam': 'Spam', 'pub.r.other': 'Jiné', 'pub.send': 'Nahlásit',
    'on.err.bad_name': 'Tahle přezdívka u veřejných stolů nejde – zkus jinou.', 'on.err.rate': 'Moc požadavků najednou – chvilku počkej.', 'on.err.public': 'U veřejného stolu to nejde.', 'on.err.bad_tier': 'Neznámá úroveň sázek.',
    'on.err.busted': 'Nejdřív si dokup žetony.', 'on.err.bad_seat': 'Tohoto hráče nejde nahlásit.'
  });
  Object.assign(I18N.DICT.en, {
    'on.title': 'Play with friends', 'on.tileSub': 'Private table with a code, points have no value', 'on.create': 'Create table', 'on.createSub': "You're the host – set players, buy-in and blinds",
    'on.join': 'Join with code', 'on.joinSub': 'A friend sends you the table code, e.g. RED-4821', 'on.lobby': 'Table', 'on.pts': 'Online points', 'on.ptsSub': 'Only for playing with friends, never withdrawable or exchangeable',
    'on.demo': 'Demo mode (offline) – the table only runs on this device. The real server switches on once Supabase is set up.', 'on.demoBadge': 'DEMO',
    'on.offline': "The online server isn't responding yet – switching to demo mode.", 'on.authOff': 'Server sign-in failed (anonymous sign-in is probably off) – switching to demo mode.',
    'on.name': 'Your name at the table', 'on.namePh': 'e.g. Alex', 'on.players': 'Players', 'on.blinds': 'Blinds', 'on.buyin': 'Buy-in', 'on.bots': 'Fill empty seats with bots',
    'on.botsSub': 'Bots only play when people are missing; the host can also add them by hand', 'on.cost': 'Entry costs {n} points', 'on.createBtn': 'Create table', 'on.code': 'Table code', 'on.joinBtn': 'Join',
    'on.copy': 'Copy link', 'on.share': 'Share', 'on.copied': 'Link copied', 'on.shareTxt': "Let's play Red River! Table {c}", 'on.seats': 'Seats', 'on.free': 'empty seat',
    'on.host': 'host', 'on.bot': 'bot', 'on.you': 'you', 'on.addBot': 'Add bot', 'on.start': 'Start game', 'on.waitHost': 'Waiting for the host to start…', 'on.needTwo': 'You need at least 2 players (or a bot) to start.',
    'on.leave': 'Leave table', 'on.leaveQ': 'Leave the table?', 'on.leaveTxt': 'Chips you have at the table go back to your online points.', 'on.leaveOk': 'Leave', 'on.cancel': 'Stay',
    'on.resume': 'Back to table {c}', 'on.yourTurn': 'Your turn', 'on.waitFor': '{n} is acting…', 'on.nextIn': 'Next hand in {s} s', 'on.nextNow': 'Deal now', 'on.waitPlayers': 'Waiting for players…',
    'on.review': 'Hand review', 'on.reviewT': 'Hand review #{n}', 'on.reviewNone': 'No hand has finished yet.', 'on.won': '{n} wins {a}', 'on.split': 'Split', 'on.youWon': 'You win {a}',
    'on.rebuy': 'Rebuy chips ({n} points)', 'on.busted': "You're out of chips.", 'on.sitOut': "You're sitting out (timed out).", 'on.sitIn': 'Sit back in', 'on.raiseTo': 'Raise to {n}', 'on.betTo': 'Bet {n}',
    'on.min': 'Min', 'on.half': '½ pot', 'on.pot': 'Pot', 'on.allin': 'All-in', 'on.back': 'Back', 'on.showdown': 'Showdown', 'on.foldWin': 'everyone else folded', 'on.yourCards': 'Your cards',
    'on.closed': 'The table was closed.', 'on.noHints': 'Online tables have no tips or win odds – only a hand review once the hand is over.', 'on.timeLeft': '{s} s', 'on.timeout': 'time',
    'on.blindsV': 'Blinds {sb}/{bb}', 'on.buyinV': 'Buy-in {n}', 'on.inviteHint': 'Send friends the code or link. Whoever opens it sits down at your table.',
    'on.err.points': "You don't have enough online points.", 'on.err.full': 'The table is full.', 'on.err.no_room': 'No table with this code.', 'on.err.closed': 'The table is closed.', 'on.err.started': 'The game is already running.',
    'on.err.not_host': 'Only the host can do that.', 'on.err.need_players': 'You need at least 2 players.', 'on.err.not_your_turn': "It's not your turn.", 'on.err.raise_too_small': 'Raise is too small.',
    'on.err.bad_code': 'The code looks like RED-1234.', 'on.err.offline': 'Server unavailable.', 'on.err.auth': 'Sign-in failed.', 'on.err.in_hand': 'The hand is still running.', 'on.err.any': 'Something went wrong ({c}).',
    'on.a.fold': 'Fold', 'on.a.check': 'Check', 'on.a.call': 'Call', 'on.a.bet': 'Bet', 'on.a.raise': 'Raise', 'on.a.allin': 'All-in', 'on.a.sb': 'SB', 'on.a.bb': 'BB', 'on.a.timeout': 'timed out',
    'pub.ptsSub': 'Virtual points for online play only – never withdrawable or exchangeable', 'pub.title': 'Play online', 'pub.tileSub': 'Public tables – play with anyone, points have no value', 'pub.nick': 'Nickname at the table', 'pub.nickSub': 'Everyone at the table sees it. Rude or offensive names are not allowed.',
    'pub.tiers': 'Choose stakes', 'pub.t.micro': 'Micro', 'pub.t.mid': 'Medium', 'pub.t.high': 'High', 'pub.sit': 'Quick seat', 'pub.buy': 'Entry {n} points',
    'pub.live': '{p} · {t}', 'pub.liveNone': 'Nobody yet – you will open a new table', 'pub.rules': 'Max 6 players per table · 30 s per move · leaving or timing out folds your hand · virtual points only, nothing can be withdrawn · no tips at online tables.',
    'pub.demo': 'Demo mode (offline) – the table only runs on this device and is filled with bots. With the real server you play against people.', 'pub.resume': 'Back to your table ({t})',
    'pub.badge': 'Public', 'pub.nextHand': 'You sat down mid-hand – you play from the next one.', 'pub.reap': "If you don't come back within {s} s you'll be removed from the table (chips are returned).",
    'pub.report': 'Report player', 'pub.reportQ': 'Who do you want to report?', 'pub.reportWhy': 'Reason', 'pub.reportNone': 'Nobody else is at the table.', 'pub.reported': 'Thanks, your report was received.',
    'pub.r.abuse': 'Abuse / behaviour', 'pub.r.name': 'Inappropriate name', 'pub.r.cheat': 'Cheating / collusion', 'pub.r.spam': 'Spam', 'pub.r.other': 'Other', 'pub.send': 'Report',
    'on.err.bad_name': "That nickname isn't allowed at public tables – try another.", 'on.err.rate': 'Too many requests – wait a moment.', 'on.err.public': "That's not possible at a public table.", 'on.err.bad_tier': 'Unknown stakes.',
    'on.err.busted': 'Rebuy chips first.', 'on.err.bad_seat': "This player can't be reported."
  });
  R.applyStatic();

  /* ---------- stav ---------- */
  const COLORS = ['#ffd3b5', '#bfe3ff', '#d9c8ff', '#c8f0d4', '#ffc9d9', '#fde9a9', '#c9e6f0', '#e3d5c8', '#f7c6a3'];
  const BLINDS = RRCore.BLINDS, BUYIN_BB = RRCore.BUYIN_BB;
  const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const S = { net: null, ready: null, points: null, view: null, off: null, demo: false, note: '', clock: 0, form: Object.assign({ max: 6, bl: 0, bbs: 100, bots: true }, store.get('rr_on_form', {})),
    raiseOpen: false, raiseTo: 0, busy: false, lastTick: 0, timer: 0, lastHandSeen: 0 };
  const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
  const myName = () => store.get('rr_on_name', '') || (I18N.lang === 'cs' ? 'Hráč' : 'Player');
  const errText = e => { const c = (e && e.code) || 'any'; const k = 'on.err.' + c; const s = t(k); return s === k ? t('on.err.any', { c }) : s; };
  const fail = e => { R.toast(errText(e)); vib(30); };
  const serverNow = () => Date.now() + S.clock;

  function useNet(net) {
    if (S.off) S.off(); S.net = net; S.demo = net.kind === 'mock';
    S.off = net.onChange(v => setView(v));
    return net;
  }
  /* připojení: Supabase, při nedostupnosti ukázkový mock (s upozorněním) */
  function ensure() {
    if (!S.ready) S.ready = (async () => {
      useNet(RRNet.makeNet());
      try { const r = await S.net.ready(); S.points = r.points; }
      catch (e) {
        if (S.net.kind === 'mock') throw e;
        S.note = e.code === 'auth' ? t('on.authOff') : t('on.offline');
        useNet(RRNet.mockNet()); const r = await S.net.ready(); S.points = r.points;
      }
      const code = store.get('rr_on_code', '');
      if (code) { try { S.net.code = code; await rejoinState(code); if (!S.view) S.net.code = null; } catch (e) { store.set('rr_on_code', ''); } }
      return S.net;
    })().catch(e => { S.ready = null; throw e; });
    return S.ready;
  }
  async function rejoinState(code) {   // po obnovení stránky: jsem stále u stolu? (jen čtení – nikdy znovu nekupuje vstup)
    const v = await S.net.state();
    if (v && v.me >= 0 && v.status !== 'closed') setView(v); else store.set('rr_on_code', '');
  }
  async function refreshPoints() { try { S.points = await S.net.points(); } catch (e) {} }

  function setView(v) {
    if (!v) return;
    // pořadí doručení (odpověď / Broadcast / dotaz) není zaručené → starší verzi stejného stolu zahodit
    if (S.view && v.code === S.view.code && typeof v.ver === 'number' && typeof S.view.ver === 'number' && v.ver < S.view.ver) return;
    if (S.pending && (v.code !== S.pending.code || v.ver > S.pending.ver)) S.pending = null;
    const prev = S.view; S.view = v; S.clock = (v.serverNow || Date.now()) - Date.now();
    if (v.status === 'closed' || v.me < 0) {
      store.set('rr_on_code', ''); S.view = null;
      if (nav.cur === 'lobby' || nav.cur === 'ontable') { R.toast(t('on.closed')); nav.home(); nav.go(prev && prev.settings && prev.settings.pub ? 'public' : 'online'); }
      return;
    }
    store.set('rr_on_code', v.code);
    if (v.hand && (!prev || !prev.hand || prev.hand.no !== v.hand.no)) { S.raiseOpen = false; SFX.deal(); }
    if (v.hand && v.hand.toAct === v.me && !v.hand.done && !(prev && prev.hand && prev.hand.toAct === v.me && prev.hand.no === v.hand.no)) { SFX.turn(); vib(20); }
    if (v.hand && v.hand.done && !(prev && prev.hand && prev.hand.done && prev.hand.no === v.hand.no)) { const w = v.hand.result && v.hand.result.won && v.hand.result.won[v.me]; if (w) SFX.win();
      /* trofeje do ligy – jen za ruku, kterou jsem viděl běžet (ne po načtení stránky) */
      const me = (v.seats || [])[v.me];
      if (window.RRLeague && me && me.inHand && prev && prev.hand && prev.hand.no === v.hand.no) try { RRLeague.hand(w > 0, !!v.hand.result.showdown, !(w > 0) && me.total > ((v.settings && v.settings.bb) || 0)); } catch (e) {}
    }
    if (v.status === 'playing' && nav.cur === 'lobby') nav.go('ontable');
    if (nav.cur === 'lobby') renderLobby(); else if (nav.cur === 'ontable') renderTable(); else if (nav.cur === 'online') renderHome(); else if (nav.cur === 'public') renderPublic();
  }
  async function run(fn) {
    if (S.busy) return; S.busy = true;
    try { const v = await fn(); if (v) setView(v); return v; } catch (e) { fail(e); } finally { S.busy = false; }
  }

  /* ---------- Hrát s kamarády ---------- */
  function renderHome() {
    const b = $('onBody'); if (!b) return;
    if (!S.net) { b.innerHTML = '<div class="note">…</div>'; ensure().then(renderHome, e => { b.innerHTML = `<div class="note">${esc(errText(e))}</div>`; }); return; }
    const v = S.view;
    b.innerHTML = `${S.demo ? `<div class="on-demo"><b>${t('on.demoBadge')}</b> ${esc(S.note || t('on.demo'))}</div>` : ''}
      <div class="pts-hero"><div class="lbl">${t('on.pts')}</div><div class="v">${fmtPts(S.points || 0)}</div><div class="sub">${t('on.ptsSub')}</div></div>
      ${v ? `<button class="btn primary wide on-resume" id="onResume">${t('on.resume', { c: v.code })}</button>` : ''}
      <div class="menu on-menu">
        <button class="mi wide" id="onCreate"><span class="ic">＋</span><div class="mi-t"><b>${t('on.create')}</b><span>${t('on.createSub')}</span></div></button>
        <button class="mi wide" id="onJoin"><span class="ic">#</span><div class="mi-t"><b>${t('on.join')}</b><span>${t('on.joinSub')}</span></div></button>
      </div>
      <div class="note">${t('on.noHints')}</div>`;
    $('onCreate').onclick = () => { SFX.tap(); nav.go('oncreate'); };
    $('onJoin').onclick = () => { SFX.tap(); nav.go('onjoin'); };
    if (v) $('onResume').onclick = () => nav.go(v.status === 'playing' ? 'ontable' : 'lobby');
  }

  /* ---------- Založit stůl ---------- */
  const seg = (id, opts, cur) => `<div class="seg full on-seg" id="${id}">${opts.map(([val, lbl]) => `<button data-v="${val}" class="${String(val) === String(cur) ? 'on' : ''}">${lbl}</button>`).join('')}</div>`;
  function renderCreate() {
    const f = S.form, bl = BLINDS[f.bl] || BLINDS[0], cost = f.bbs * bl[1];
    $('onCreateBody').innerHTML = `
      <h3>${t('on.name')}</h3><div class="grp"><input class="on-input" id="ocName" maxlength="16" autocomplete="nickname" placeholder="${esc(t('on.namePh'))}" value="${esc(store.get('rr_on_name', ''))}"></div>
      <h3>${t('on.players')}</h3>${seg('ocMax', [2, 3, 4, 5, 6, 7, 8, 9].map(n => [n, n]), f.max)}
      <h3>${t('on.blinds')}</h3>${seg('ocBl', BLINDS.map((b, i) => [i, b[0] + '/' + b[1]]), f.bl)}
      <h3>${t('on.buyin')}</h3>${seg('ocBuy', BUYIN_BB.map(n => [n, n + ' BB']), f.bbs)}
      <div class="grp" style="margin-top:14px"><label class="row on-check"><div>${t('on.bots')}<small>${t('on.botsSub')}</small></div><span class="switch-pill"><input type="checkbox" id="ocBots" ${f.bots ? 'checked' : ''}><i></i></span></label></div>
      <div class="note" id="ocCost">${t('on.cost', { n: fmtPts(cost) })} · ${t('on.pts')}: ${fmtPts(S.points || 0)}</div>
      <button class="btn primary wide" id="ocGo">${t('on.createBtn')}</button>`;
    const pickSeg = (id, key, num) => $(id).querySelectorAll('button').forEach(b => b.onclick = () => { f[key] = num ? +b.dataset.v : b.dataset.v; store.set('rr_on_form', f); SFX.tap(); renderCreate(); });
    pickSeg('ocMax', 'max', 1); pickSeg('ocBl', 'bl', 1); pickSeg('ocBuy', 'bbs', 1);
    $('ocBots').onchange = e => { f.bots = e.target.checked; store.set('rr_on_form', f); };
    $('ocName').onchange = e => store.set('rr_on_name', e.target.value.trim().slice(0, 16));
    $('ocGo').onclick = () => { store.set('rr_on_name', $('ocName').value.trim().slice(0, 16)); SFX.tap();
      run(async () => { await ensure(); const v = await S.net.create({ max: f.max, sb: bl[0], bb: bl[1], buyInBB: f.bbs, bots: f.bots }, myName()); await refreshPoints(); history.replaceState({ s: 'online' }, ''); S.view = v; nav.go('lobby'); return v; }); };
  }

  /* ---------- Připojit kódem ---------- */
  function renderJoin(pre) {
    $('onJoinBody').innerHTML = `
      <h3>${t('on.code')}</h3><div class="on-codebox"><span>RED-</span><input id="ojCode" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="1234" value="${esc(pre || '')}" autocomplete="off"></div>
      <h3>${t('on.name')}</h3><div class="grp"><input class="on-input" id="ojName" maxlength="16" autocomplete="nickname" placeholder="${esc(t('on.namePh'))}" value="${esc(store.get('rr_on_name', ''))}"></div>
      <div class="note">${t('on.joinSub')}</div>
      <button class="btn primary wide" id="ojGo">${t('on.joinBtn')}</button>`;
    const inp = $('ojCode'); inp.oninput = () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 4); };
    $('ojGo').onclick = () => {
      const digits = inp.value.replace(/\D/g, ''); if (digits.length !== 4) return fail({ code: 'bad_code' });
      store.set('rr_on_name', $('ojName').value.trim().slice(0, 16)); SFX.tap();
      run(async () => { await ensure(); const v = await S.net.join('RED-' + digits, myName()); await refreshPoints(); history.replaceState({ s: 'online' }, ''); S.view = v; nav.go(v.status === 'playing' ? 'ontable' : 'lobby'); return v; });
    };
  }

  /* ---------- Hrát online: veřejné stoly ---------- */
  const isPubView = v => !!(v && v.settings && v.settings.pub);
  const tierName = id => t('pub.t.' + id);
  const plural = (n, cs, en) => I18N.lang === 'cs' ? `${n} ${n === 1 ? cs[0] : n >= 2 && n <= 4 ? cs[1] : cs[2]}` : `${n} ${n === 1 ? en[0] : en[1]}`;
  const liveTxt = n => t('pub.live', { p: plural(n.players, ['hráč', 'hráči', 'hráčů'], ['player', 'players']), t: plural(n.tables, ['stůl', 'stoly', 'stolů'], ['table', 'tables']) });
  const tableTitle = v => isPubView(v) ? `${t('pub.badge')} · ${tierName(v.settings.tier)} ${v.settings.sb}/${v.settings.bb}` : v.code;
  let lobbyInfo = null;
  function renderPublic() {
    const b = $('pubBody'); if (!b) return;
    if (!S.net) { b.innerHTML = '<div class="note">…</div>'; ensure().then(renderPublic, e => { b.innerHTML = `<div class="note">${esc(errText(e))}</div>`; }); return; }
    const v = S.view, tiers = RRCore.TIERS;
    const info = id => lobbyInfo && lobbyInfo.tiers && lobbyInfo.tiers.find(x => x.id === id);
    b.innerHTML = `${S.demo ? `<div class="on-demo"><b>${t('on.demoBadge')}</b> ${esc(S.note || t('pub.demo'))}</div>` : ''}
      <div class="pts-hero"><div class="lbl">${t('on.pts')}</div><div class="v">${fmtPts(S.points || 0)}</div><div class="sub">${t('pub.ptsSub')}</div></div>
      ${v ? `<button class="btn primary wide on-resume" id="pubResume">${esc(isPubView(v) ? t('pub.resume', { t: tierName(v.settings.tier) }) : t('on.resume', { c: v.code }))}</button>` : ''}
      <h3>${t('pub.nick')}</h3><div class="grp"><input class="on-input" id="pubName" maxlength="16" autocomplete="nickname" placeholder="${esc(t('on.namePh'))}" value="${esc(store.get('rr_on_name', ''))}"></div>
      <div class="note">${t('pub.nickSub')}</div>
      <h3>${t('pub.tiers')}</h3>
      <div class="pub-tiers">${tiers.map(T => { const buy = T.bb * T.buyInBB, n = info(T.id), poor = (S.points || 0) < buy;
        return `<div class="pub-tier${poor ? ' poor' : ''}" data-tier="${T.id}"><div class="pub-tl"><b>${tierName(T.id)}</b><span class="pub-bl">${T.sb}/${T.bb}</span></div>
          <div class="pub-meta">${t('pub.buy', { n: fmtPts(buy) })} · ${n ? (n.players ? liveTxt(n) : t('pub.liveNone')) : '&nbsp;'}</div>
          <button class="btn primary wide pub-sit" data-sit="${T.id}" ${poor ? 'disabled' : ''}>${t('pub.sit')}</button></div>`; }).join('')}</div>
      <div class="note">${t('pub.rules')}</div>`;
    if (v) $('pubResume').onclick = () => nav.go(v.status === 'playing' ? 'ontable' : 'lobby');
    $('pubName').onchange = e => store.set('rr_on_name', e.target.value.trim().slice(0, 16));
    b.querySelectorAll('[data-sit]').forEach(x => x.onclick = () => {
      const nm = $('pubName').value.trim().slice(0, 16); store.set('rr_on_name', nm); SFX.tap();
      if (nm && RRCore.badName(nm)) return fail({ code: 'bad_name' });
      run(async () => { await ensure(); const v2 = await S.net.quickseat(x.dataset.sit, myName()); await refreshPoints(); history.replaceState({ s: 'public' }, ''); S.view = v2; nav.go('ontable'); return v2; });
    });
    if (!S.lobbyAt || Date.now() - S.lobbyAt > 5000) { S.lobbyAt = Date.now(); S.net.lobby().then(r => { lobbyInfo = r; if (nav.cur === 'public') renderPublic(); }).catch(() => {}); }
  }
  function openReport() {
    const v = S.view; if (!v) return;
    const others = v.seats.filter(s => s && !s.me && !s.bot);
    if (!others.length) { R.openSheet(`<h2>${t('pub.report')}</h2><div class="txtblk">${t('pub.reportNone')}</div>`); return; }
    let who = others[0].i, why = 'abuse';
    const draw = () => {
      R.openSheet(`<h2>${t('pub.reportQ')}</h2><div class="grp">${others.map(s => `<button class="row pub-who${s.i === who ? ' on' : ''}" data-who="${s.i}"><span>${esc(s.name)}</span><span>${s.i === who ? '●' : '○'}</span></button>`).join('')}</div>
        <h3>${t('pub.reportWhy')}</h3>${seg('rpWhy', ['abuse', 'name', 'cheat', 'spam', 'other'].map(r => [r, t('pub.r.' + r)]), why)}
        <div class="actions"><button class="btn" id="rpNo">${t('on.cancel')}</button><button class="btn primary" id="rpGo">${t('pub.send')}</button></div>`);
      document.querySelectorAll('[data-who]').forEach(x => x.onclick = () => { who = +x.dataset.who; draw(); });
      $('rpWhy').querySelectorAll('button').forEach(x => x.onclick = () => { why = x.dataset.v; draw(); });
      $('rpNo').onclick = R.closeSheet;
      $('rpGo').onclick = () => { R.closeSheet(); S.net.report(who, why).then(() => R.toast(t('pub.reported')), fail); };
    };
    draw();
  }

  /* ---------- lobby ---------- */
  const link = code => location.origin + location.pathname + '?join=' + encodeURIComponent(code);
  function renderLobby() {
    const v = S.view, b = $('lobbyBody'); if (!b) return;
    if (!v) { b.innerHTML = ''; return; }
    const seated = v.seats.filter(Boolean).length;
    b.innerHTML = `${S.demo ? `<div class="on-demo"><b>${t('on.demoBadge')}</b> ${t('on.demo')}</div>` : ''}
      <div class="on-codecard"><div class="lbl">${t('on.code')}</div><div class="on-bigcode" id="lbCode">${esc(v.code)}</div>
        <div class="on-meta">${t('on.blindsV', { sb: v.settings.sb, bb: v.settings.bb })} · ${t('on.buyinV', { n: fmtPts(v.settings.buyIn) })} · ${seated}/${v.settings.max}</div>
        <div class="gl-btns on-share"><button class="btn sm" id="lbCopy">${t('on.copy')}</button>${navigator.share ? `<button class="btn sm" id="lbShare">${t('on.share')}</button>` : ''}</div>
        <div class="note">${t('on.inviteHint')}</div></div>
      <h3>${t('on.seats')}</h3><div class="grp on-seats">${v.seats.map((s, i) => s ? `<div class="row"><div class="on-seat"><span class="avatar sm" style="background:${s.bot ? '#3a3941' : COLORS[i % COLORS.length]}">${esc(s.name.slice(0, 2).toUpperCase())}</span><div><b>${esc(s.name)}</b><small>${[s.me ? t('on.you') : '', s.host ? '👑 ' + t('on.host') : '', s.bot ? '🤖 ' + t('on.bot') : ''].filter(Boolean).join(' · ') || '&nbsp;'}</small></div></div>${v.isHost && s.bot ? `<button class="btn sm" data-rmbot="${i}">✕</button>` : `<span class="on-stack">${fmtPts(s.stack)}</span>`}</div>`
        : `<div class="row on-free"><span>${i + 1}. ${t('on.free')}</span></div>`).join('')}</div>
      ${v.isHost ? `<div class="actions on-lb-act"><button class="btn" id="lbBot" ${seated >= v.settings.max ? 'disabled' : ''}>${t('on.addBot')}</button><button class="btn primary" id="lbStart">${t('on.start')}</button></div>
        <div class="note">${seated < 2 && !v.settings.bots ? t('on.needTwo') : '&nbsp;'}</div>` : `<div class="note on-wait">${t('on.waitHost')}</div>`}
      <button class="btn wide on-leave" id="lbLeave">${t('on.leave')}</button>`;
    $('lbCopy').onclick = () => { const l = link(v.code); (navigator.clipboard ? navigator.clipboard.writeText(l) : Promise.reject()).then(() => R.toast(t('on.copied')), () => R.toast(l)); };
    if ($('lbShare')) $('lbShare').onclick = () => navigator.share({ title: 'Red River', text: t('on.shareTxt', { c: v.code }), url: link(v.code) }).catch(() => {});
    b.querySelectorAll('[data-rmbot]').forEach(x => x.onclick = () => run(() => S.net.removeBot(+x.dataset.rmbot)));
    if (v.isHost) { $('lbBot').onclick = () => run(() => S.net.addBot()); $('lbStart').onclick = () => run(async () => { const r = await S.net.start(); return r; }); }
    $('lbLeave').onclick = askLeave;
  }
  function askLeave() {
    R.openSheet(`<h2>${t('on.leaveQ')}</h2><div class="txtblk">${t('on.leaveTxt')}</div><div class="actions"><button class="btn" id="lvNo">${t('on.cancel')}</button><button class="btn primary" id="lvYes">${t('on.leaveOk')}</button></div>`);
    $('lvNo').onclick = R.closeSheet;
    $('lvYes').onclick = () => { R.closeSheet(); const pub = isPubView(S.view); run(async () => { await S.net.leave(); store.set('rr_on_code', ''); S.view = null; await refreshPoints(); nav.home(); nav.go(pub ? 'public' : 'online'); return null; }); };
  }

  /* ---------- stůl ---------- */
  const card = (c, size) => R.cardHTML(c, size);
  function actLabel(a) {
    if (!a) return '';
    const k = 'on.a.' + a.t, name = t(k) === k ? a.t : t(k);
    return a.t === 'fold' || a.t === 'check' ? name : `${name} ${fmtPts(a.to || a.a || 0)}`;
  }
  function pendLabel(a) { const n = t('on.a.' + a.t); return (n === 'on.a.' + a.t ? a.t : n) + (a.to ? ' ' + fmtPts(a.to) : '') + ' …'; }
  function seatOrder(v) {   // od hráče po směru: soupeři vlevo → vpravo
    const n = v.seats.length, me = v.me, out = [];
    for (let k = 1; k < n; k++) { const i = (me + k) % n; if (v.seats[i]) out.push(v.seats[i]); }
    return out;
  }
  function resultLine(v) {
    const r = v.hand && v.hand.done && v.hand.result; if (!r) return '';
    const won = r.won || {}, ids = Object.keys(won).map(Number).filter(i => won[i] > 0);
    const main = r.pots && r.pots[0];
    const cat = r.showdown && main && main.cat >= 0 ? ' · ' + t('hand.' + main.cat) : (r.showdown ? '' : ' · ' + t('on.foldWin'));
    if (won[v.me] > 0 && ids.length === 1) return t('on.youWon', { a: fmtPts(won[v.me]) }) + cat;
    return ids.map(i => t('on.won', { n: v.seats[i] ? v.seats[i].name : '?', a: fmtPts(won[i]) })).join(' · ') + cat;
  }
  // přepis DOM jen při skutečné změně (časté aktualizace pak neblikají a nešetří baterii)
  function setHTML(id, html) { const el = $(id); if (el && el.__h !== html) { el.innerHTML = html; el.__h = html; } }
  function renderTable() {
    const v = S.view; if (!v || !$('otOpps')) return;
    const h = v.hand, me = v.seats[v.me] || {}, L = h && h.legal;
    $('otCode').textContent = tableTitle(v) + (S.demo ? ' · ' + t('on.demoBadge') : '');
    $('otHand').textContent = h ? '#' + h.no : '';
    // soupeři
    const opps = seatOrder(v), many = opps.length > 4;
    $('otOpps').className = 'opps' + (many ? ' compact' : '');
    $('otOpps').style.gridTemplateColumns = many ? `repeat(${Math.ceil(opps.length / 2)},1fr)` : '';
    setHTML('otOpps', opps.map(s => {
      const cards = Array.isArray(s.cards) ? s.cards.map(c => card(c, 'sm')).join('') : s.cards === 2 ? card(null, 'sm') + card(null, 'sm') : '';
      const win = h && h.done && h.result && h.result.won && h.result.won[s.i] > 0;
      return `<div class="opp${s.folded ? ' folded' : ''}${s.turn ? ' turn' : ''}${win ? ' on-win' : ''}${s.sitOut ? ' on-out' : ''}" data-seat="${s.i}">
        <div class="avatar" style="background:${s.bot ? '#3a3941;color:#ddd' : COLORS[s.i % COLORS.length]}">${esc(s.name.slice(0, 2).toUpperCase())}${s.dealer ? '<span class="dealer">D</span>' : ''}</div>
        <div class="name">${esc(s.name)}${s.bot ? ' 🤖' : ''}</div><div class="stk">${fmtPts(s.stack)}${s.allIn ? ' <em>all-in</em>' : ''}</div>
        <div class="chip ${s.last || s.bet ? '' : 'empty'}">${esc(s.last ? actLabel(s.last) : s.bet ? fmtPts(s.bet) : '·')}</div><div class="mini">${cards}</div></div>`;
    }).join(''));
    // board + pot
    const board = h ? h.board : [];
    setHTML('otBoard', Array.from({ length: 5 }, (_, i) => board[i] != null ? card(board[i]) : '<div class="card ghost"></div>').join(''));
    $('otPot').textContent = fmtPts(h ? h.pot : 0);
    $('otStreet').textContent = h ? (h.done ? (h.result && h.result.showdown ? t('on.showdown') : '') : t('st.' + h.street)) : '';
    // moje karty
    const mine = Array.isArray(me.cards) ? me.cards : null;
    const myWin = h && h.done && h.result && h.result.won && h.result.won[v.me] > 0;
    setHTML('otHero', mine ? mine.map(c => card(c, 'lg' + (myWin ? ' win' : ''))).join('') : '<div class="card lg ghost"></div><div class="card lg ghost"></div>');
    $('otHero').classList.toggle('on-folded', !!me.folded);
    const myTurn = h && !h.done && h.toAct === v.me;
    const pend = S.pending && S.pending.code === v.code ? S.pending.a : null;
    setHTML('otMe', `<div class="lbl">${esc(me.name || '')}${me.dealer ? ' · D' : ''}${me.sb ? ' · SB' : ''}${me.bb ? ' · BB' : ''}</div><div class="stack">${fmtPts(me.stack || 0)}</div><div class="hero-last">${pend ? esc(pendLabel(pend)) : me.last ? esc(actLabel(me.last)) : ''}</div>${mine && !me.folded && window.RRMeter && window.RRMeter.on() ? `<div class="hsm">${window.RRMeter.html(mine, board)}</div>` : ''}${myTurn && !pend ? '<div class="on-timer"><i id="otBar"></i></div>' : ''}`);
    // stav + akce
    const st = $('otStatus'); let stHTML = '';
    const reap = isPubView(v) && me.sitOut ? `<div class="note pub-reap" id="otReap"></div>` : '';
    if (me.sitOut && me.stack > 0) stHTML = `<div class="on-msg">${t('on.sitOut')}</div>${reap}<button class="btn primary wide" id="otSitIn">${t('on.sitIn')}</button>`;
    else if (me.stack < v.settings.bb && (!h || h.done || !me.inHand || me.folded)) stHTML = `<div class="on-msg">${t('on.busted')}</div>${reap}<button class="btn primary wide" id="otRebuy">${t('on.rebuy', { n: fmtPts(v.settings.buyIn - (me.stack || 0)) })}</button>`;
    else if (h && !h.done && !me.inHand) stHTML = `<div class="on-msg">${t('pub.nextHand')}</div>`;
    else if (h && h.done) stHTML = `<div class="on-result">${esc(resultLine(v))}</div><div class="on-row"><span class="on-next" id="otNext"></span><button class="btn sm" id="otReview">${t('on.review')}</button>${v.isHost && !isPubView(v) ? `<button class="btn sm primary" id="otDeal">${t('on.nextNow')}</button>` : ''}</div>`;
    else if (!h || v.waiting) stHTML = `<div class="on-msg">${t('on.waitPlayers')}</div>`;
    else if (!myTurn && h.toAct >= 0 && v.seats[h.toAct]) stHTML = `<div class="on-msg">${t('on.waitFor', { n: esc(v.seats[h.toAct].name) })} <span id="otLeft"></span></div>`;
    else if (myTurn) stHTML = `<div class="on-msg on-turn">${t('on.yourTurn')} <span id="otLeft"></span></div>`;
    st.innerHTML = stHTML;
    if ($('otSitIn')) $('otSitIn').onclick = () => run(() => S.net.sitIn());
    if ($('otRebuy')) $('otRebuy').onclick = () => run(async () => { const r = await S.net.rebuy(); await refreshPoints(); return r; });
    if ($('otReview')) $('otReview').onclick = openReview;
    if ($('otDeal')) $('otDeal').onclick = () => run(() => S.net.next());
    renderActions(v, myTurn ? L : null);
    clock();
  }
  function sizes(L) {
    const pot = L.pot, call = L.toCall, cb = L.curBet;
    const clamp = x => Math.max(L.minTo, Math.min(L.maxTo, Math.round(x)));
    return [['on.min', L.minTo], ['on.half', clamp(cb + (pot + call) / 2)], ['on.pot', clamp(cb + pot + call)], ['on.allin', L.maxTo]];
  }
  function renderActions(v, L) {
    const a = $('otActions'), rz = $('otRaise');
    if (L && S.pending && S.pending.code === v.code) { a.innerHTML = `<div class="on-pending"><span class="spin"></span>${esc(pendLabel(S.pending.a))}</div>`; rz.hidden = true; return; }
    if (!L) { a.innerHTML = ''; rz.hidden = true; S.raiseOpen = false; return; }
    const callTxt = L.canCheck ? t('on.a.check') : `${t('on.a.call')} ${fmtPts(L.toCall)}`;
    a.innerHTML = `<button class="btn" id="oaFold" ${L.canCheck ? 'disabled' : ''}>${t('on.a.fold')}</button><button class="btn" id="oaCall">${callTxt}</button>${L.canRaise ? `<button class="btn ${S.raiseOpen ? 'primary' : ''}" id="oaRaise">${L.raiseIsBet ? t('on.a.bet') : t('on.a.raise')}…</button>` : ''}`;
    $('oaFold').onclick = () => send({ t: 'fold' });
    $('oaCall').onclick = () => send({ t: L.canCheck ? 'check' : 'call' });
    if ($('oaRaise')) $('oaRaise').onclick = () => { S.raiseOpen = !S.raiseOpen; S.raiseTo = S.raiseTo && S.raiseTo >= L.minTo && S.raiseTo <= L.maxTo ? S.raiseTo : L.minTo; SFX.tap(); renderActions(v, L); };
    rz.hidden = !(S.raiseOpen && L.canRaise);
    if (rz.hidden) return;
    const lab = n => (L.raiseIsBet ? t('on.betTo', { n: fmtPts(n) }) : t('on.raiseTo', { n: fmtPts(n) }));
    rz.innerHTML = `<div class="on-sizes">${sizes(L).map(([k, to]) => `<button class="btn sm ${to === S.raiseTo ? 'primary' : ''}" data-to="${to}">${t(k)}</button>`).join('')}</div>
      <input type="range" id="orRange" min="${L.minTo}" max="${L.maxTo}" step="1" value="${S.raiseTo}"><button class="btn primary wide" id="orGo">${lab(S.raiseTo)}</button>`;
    rz.querySelectorAll('[data-to]').forEach(b => b.onclick = () => { S.raiseTo = +b.dataset.to; SFX.tap(); renderActions(v, L); });
    $('orRange').oninput = e => { S.raiseTo = +e.target.value; $('orGo').textContent = lab(S.raiseTo); };
    $('orGo').onclick = () => send(S.raiseTo >= L.maxTo ? { t: 'allin' } : { t: 'raise', to: S.raiseTo });
  }
  function send(a) {
    if (S.busy || S.pending) return;
    SFX[a.t === 'fold' ? 'fold' : 'chip'](); S.raiseOpen = false;
    // okamžitá odezva: tah se hned ukáže jako odeslaný (server ho potvrdí novou verzí stolu)
    const v = S.view; S.pending = v ? { code: v.code, ver: v.ver, a } : null;
    if (v) renderTable();
    run(() => S.net.act(a)).finally(() => { if (S.pending && S.view && S.view.ver <= S.pending.ver) { S.pending = null; renderTable(); } });
  }
  /* rozbor ruky – po skončení: akce po ulicích, odkryté karty, kdo kolik vyhrál (bez šancí a rad během hry) */
  function openReview() {
    const v = S.view, L = v && v.last;
    if (!L) { R.openSheet(`<h2>${t('on.review')}</h2><div class="txtblk">${t('on.reviewNone')}</div>`); return; }
    const name = i => { const p = L.players.find(x => x.seat === i); return p ? p.name : '?'; };
    const reveal = (L.result && L.result.reveal) || {};
    const streets = [0, 1, 2, 3].map(st => { const acts = L.actions.filter(a => a.st === st); if (!acts.length) return '';
      const brd = st ? L.board.slice(0, st + 2).map(c => card(c, 'sm')).join('') : '';
      return `<div class="row col"><b>${t('st.' + st)} <span class="on-rv-board">${brd}</span></b><small>${acts.map(a => `${esc(name(a.seat))}: ${esc(actLabel(a))}`).join(' · ')}</small></div>`; }).join('');
    const mine = L.mine ? `<div class="row"><span>${t('on.yourCards')}</span><span class="on-rv-cards">${L.mine.cards.map(c => card(c, 'sm')).join('')}</span></div>` : '';
    const ppl = L.players.map(p => `<div class="row"><div><b>${esc(p.name)}</b>${p.cat >= 0 ? `<small>${t('hand.' + p.cat)}</small>` : p.folded ? `<small>${t('on.a.fold')}</small>` : ''}</div><span class="on-rv-cards">${reveal[p.seat] ? reveal[p.seat].map(c => card(c, 'sm')).join('') : ''}</span><span class="${p.net > 0 ? 'on-pos' : p.net < 0 ? 'on-neg' : ''}">${p.net > 0 ? '+' : ''}${fmtPts(p.net)}</span></div>`).join('');
    R.openSheet(`<h2>${t('on.reviewT', { n: L.no })}</h2><div class="on-rv-board big">${L.board.map(c => card(c, 'sm')).join('')}</div>
      <div class="grp">${mine}${ppl}</div><h3>${t('on.review')}</h3><div class="grp">${streets}</div><button class="btn primary wide" id="rvOk">${t('gl.ok')}</button>`);
    $('rvOk').onclick = R.closeSheet;
  }
  /* časovač tahu + automatické dorovnání času na serveru (tick) */
  function clock() {
    clearInterval(S.timer);
    if (nav.cur !== 'ontable' || !S.view) return;
    const step = () => {
      const v = S.view; if (!v || nav.cur !== 'ontable') return clearInterval(S.timer);
      const h = v.hand, now = serverNow(), me = v.seats[v.me];
      if ($('otReap') && me && me.outSince) $('otReap').textContent = t('pub.reap', { s: Math.max(0, Math.ceil((me.outSince + (v.reapMs || 90000) - now) / 1000)) });
      // veřejný stůl: server nemá vlastní hodiny → klient ho každých ~5 s „pošťouchne“ (rozdání, zvednutí nečinných)
      if (isPubView(v) && Date.now() - S.lastTick > 5000 && (!h || h.done || v.waiting || v.seats.some(s => s && s.sitOut))) poke();
      if (h && !h.done && h.deadline) {
        const left = Math.max(0, h.deadline - now), s = Math.ceil(left / 1000);
        if ($('otLeft')) $('otLeft').textContent = t('on.timeLeft', { s });
        if ($('otBar')) $('otBar').style.width = (100 * left / (v.settings.turnMs || 30000)) + '%';
        if (left <= 0) poke();
      } else if (h && h.done && v.nextAt) {
        const left = Math.max(0, v.nextAt - now);
        if ($('otNext')) $('otNext').textContent = t('on.nextIn', { s: Math.ceil(left / 1000) });
        if (left <= 0) poke();
      }
    };
    step(); S.timer = setInterval(step, 250);
  }
  function poke() {   // čas vypršel → požádej server, ať pokročí (server sám ověří čas)
    if (Date.now() - S.lastTick < 1500 || !S.net) return; S.lastTick = Date.now();
    S.net.tick().then(v => v && setView(v)).catch(() => {});
  }

  /* ---------- napojení na navigaci ---------- */
  const OnlineUI = {
    onShow(id, prev) {
      if (prev === 'ontable' && id !== 'ontable') { clearInterval(S.timer); }
      if (id === 'online') renderHome();
      if (id === 'public') renderPublic();
      if (id === 'oncreate') { ensure().then(renderCreate, fail); renderCreate(); }
      if (id === 'onjoin') renderJoin(OnlineUI._pre);
      if (id === 'lobby') { if (S.view && S.view.status === 'playing') return nav.go('ontable'); renderLobby(); }
      if (id === 'ontable') { if (!S.view) return nav.back(); renderTable(); }
    },
    onLang() { if (nav.cur && /^(online|public|oncreate|onjoin|lobby|ontable)$/.test(nav.cur)) OnlineUI.onShow(nav.cur, nav.cur); },
    state: S, ensure, setView, _pre: ''
  };
  window.OnlineUI = OnlineUI;
  $('homeOnline').onclick = () => { SFX.tap(); nav.go('online'); };
  if ($('homePublic')) $('homePublic').onclick = () => { SFX.tap(); nav.go('public'); };
  $('otMenu').onclick = () => {
    const pub = isPubView(S.view);
    R.openSheet(`<h2>${esc(S.view ? tableTitle(S.view) : '')}</h2><div class="menu-list"><button class="btn wide" id="omReview">${t('on.review')}</button>${pub ? `<button class="btn wide" id="omReport">${t('pub.report')}</button>` : `<button class="btn wide" id="omCopy">${t('on.copy')}</button>`}<button class="btn wide" id="omLeave">${t('on.leave')}</button></div><div class="note">${t('on.noHints')}</div>`);
    $('omReview').onclick = openReview;
    if (pub) $('omReport').onclick = openReport;
    if (!pub) $('omCopy').onclick = () => { R.closeSheet(); const l = link(S.view.code); (navigator.clipboard ? navigator.clipboard.writeText(l) : Promise.reject()).then(() => R.toast(t('on.copied')), () => R.toast(l)); };
    $('omLeave').onclick = askLeave;
  };
  // odkaz s pozvánkou: ?join=RED-1234
  try {
    const m = /[?&]join=(?:RED-)?(\d{4})/i.exec(location.search);
    if (m) { OnlineUI._pre = m[1]; history.replaceState({ s: 'home' }, '', location.pathname); setTimeout(() => { nav.go('online'); nav.go('onjoin'); }, 50); }
  } catch (e) {}
})();
