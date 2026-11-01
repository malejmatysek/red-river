# Red River – poker trenér (Texas Hold'em)

Návrh aplikace, která tě učí poker: ukazuje šance na výhru, radí, co zahrát (dá se vypnout), a po každém rozhodnutí vysvětlí, jestli bylo dobré a proč. Vzhled je minimalistický, inspirovaný aplikací **Offsuit**.

## 1. Koncept
- **Pro koho:** začátečníci a mírně pokročilí, kteří chtějí pochopit *proč* se hraje tak, jak se hraje – ne jen klikat.
- **Jak:** hraješ krátké tréninkové ruce proti 1–8 botům (výchozí 5 = 6-max, max. 9 hráčů). Během hry vidíš:
  - **Výhra %** – equity tvé ruky (Monte Carlo simulace, 5 000 rozdání za každé rozhodnutí),
  - **Doporučené tahy** (přepínač) – nejlepší akce a velikost sázky + krátké vysvětlení,
  - **Režim učení** – po každém tahu hodnocení (Správně / Dá se / Nepřesnost / Velká chyba) a na konci ruky rozbor.
- **Hlavní myšlenka učení:** hodnotit rozhodnutí, ne výsledek. Dobrý call může prohrát, špatný může vyhrát.

## 2. Vizuální styl (podle Offsuit)
Vycházím z ověřených obrázků z App Store a webu offsuit.link (uloženo v `research/`):
- čistě **černé pozadí**, tmavě šedé zaoblené panely (~`#24232A`), žádný zelený stůl,
- **bílé karty** se zaoblenými rohy: velká hodnota vlevo nahoře („10“, ne „T“), symbol barvy vlevo dole, srdce/káry červeně,
- neotočené karty boardu jako **červené rubové karty** (Offsuit má bílé s černými pruhy; u nás červené na přání),
- soupeři v **řadě nahoře** (avatar, jméno · pozice, stack, malý odznak D pro dealera); od 5 soupeřů ve **dvou kompaktních řadách**, hráč na tahu má zelený prstenec a zelenou pozici,
- akční tlačítka jako **tmavé pilulky** („Call 4“, „Raise 8“) + kulaté tlačítko se šipkou,
- vlastní karty dole vlevo přes sebe, vpravo panel s rukou a stackem,
- panel statistik „Win 71 %“ se **zeleným procentem** na tmavém panelu,
- čisté bezpatkové písmo, malé písmo v názvu značky („offsuit“ → u nás „Red River“).

Co jsem **nepřebíral**: avatary (Offsuit používá 3D postavičky – u nás iniciály v barevných kolečkách), logo, žádné jejich assety se v aplikaci nepoužívají.

## 3. Obrazovky
1. **Stůl (hlavní obrazovka)** – lišta (logo, přepínač *Doporučené tahy*, statistiky, nastavení) → soupeři → board + pot → panel šancí (Výhra %, aktuální ruka / síla startovní ruky) → karta doporučení → karta zpětné vazby → akční tlačítka → tvoje karty a stack.
2. **Velikost sázky** (spodní panel) – preflop 2,5 / 3 / 4 BB nebo 2,5× / 3× / 4×; postflop 1/3, 1/2, 2/3 potu, pot, all-in. Doporučená velikost je zvýrazněná.
3. **Rozbor ruky** (po skončení) – výsledek, karty ve showdownu, seznam tvých rozhodnutí s barevným hodnocením a vysvětlením, tlačítko *Další ruka*.
4. **Statistiky** – přesnost rozhodnutí, zisk v BB, BB/100, VPIP, PFR, % vyhraných rukou, počty hodnocení. Uloženo v prohlížeči.
5. **Nastavení** – Doporučené tahy, Šance na výhru, Režim učení, Krátké stacky, počet soupeřů (1–8).

## 4. Jak funguje „mozek“
- **Vyhodnocení rukou:** vlastní 7karetní evaluátor (otestováno na všech typech kombinací).
- **Equity:** Monte Carlo proti soupeřům, kteří jsou ještě ve hře. Pokud soupeř preflop navýšil / dorovnal, jeho ruka se losuje jen z odpovídajícího rozsahu (podle Chenova skóre: raise ≥ 8, 3-bet ≥ 11, call ≥ 5).
- **Preflop doporučení:** zjednodušený „chart“ podle Chenova vzorce a pozice (CO / BTN / SB / BB), situace: otevření, proti raise, proti 3-betu.
- **Postflop doporučení:** equity vs. **pot odds** (kolik % potřebuju k ziskovému callu) a vs. férový podíl 1/(počet hráčů). Value bet / menší bet / check, call / raise / fold.
- **Hodnocení:** shoda s doporučením = Správně, přijatelná alternativa = Dá se, jinak Nepřesnost; pokud jsi foldnul s výrazně lepší šancí, než bylo potřeba (nebo naopak callnul s výrazně horší, > 12 p. b.), je to Velká chyba. Ukazuje i hrubé EV callu.
- **Boti:** stejná logika + náhodný šum, občasný bluf a různé „povahy“ (Jana, Petr, Eva).

## 5. Prototyp (hotovo)
- `index.html` + `style.css` + `app.js` + `engine.js` – otevře se přímo v prohlížeči, bez instalace, mobile-first.
- Blindy 1/2, většina rukou začíná se stackem 200 (100 BB). S volbou *Krátké stacky* má asi každá 4. ruka hráč jen 6–15 BB (push/fold trénink) a asi každá 7. ruka má krátký stack některý bot (trénink callu proti all-inu). Zisk ruky = konečný − počáteční stack.
- **Pozice:** UTG, UTG+1, MP, LJ, HJ, CO, BTN, SB, BB podle počtu hráčů. Otevírací hranice (Chen): UTG/UTG+1 10, MP/LJ 9, HJ 8, CO 7, BTN 6, SB 7.
- **All-in jako samostatné doporučení:**
  - *Push/fold* při efektivním stacku ≤ 15 BB: push hranice UTG 10, UTG+1 9, MP 9, LJ 8, HJ 8, CO 7, BTN 6, SB 5 (heads-up 4), pod 11 BB o 1 a pod 8 BB o 2 volnější; re-shove proti navýšení jen se silnými rukama.
  - Proti 3-betu se 100 BB: QQ+/AK (Chen ≥ 14) → all-in.
  - Postflop: velmi silná ruka a SPR ≤ 1,5 → all-in; re-shove proti sázce, když by po callu zůstalo málo.
  - Call/fold proti all-inu: equity vs. pot odds (s tolerancí ±2–3 %).
  - Každá sázka ≥ 70 % stacku se doporučí rovnou jako all-in. Tlačítko *All-in* má tmavě červené pozadí a při doporučení zelený rámeček; hodnocení rozlišuje all-in od běžného raise (fold místo doporučeného pushe = velká chyba).
- Testy: `node test_equity.js` (equity a vyhodnocení rukou), `node test_play.js` (automaticky odehraje stovky rukou v headless Chrome a hlídá chyby a součet žetonů).

## 6. Roadmapa
1. **v0.2 – lepší učení:** kvízy („co bys tu zahrál?“ na připravených situacích), denní výzva, vysvětlení pojmů (pot odds, outs, pozice) jako krátké karty, počítání outů.
2. **v0.3 – přesnější strategie:** skutečné GTO/solver rozsahy pro 6-max a heads-up (tabulky podle pozice), range-vs-range equity, zohlednění velikosti sázek a hloubky stacků, Web Worker pro rychlejší simulace.
3. **v0.4 – režimy:** turnaje (rostoucí blindy, ICM tipy), 6-max stůl, historie rukou s přehráním, export statistik.
4. **v1.0 – mobilní aplikace:** nativní iOS/Android (React Native nebo Flutter), haptika, animace, offline režim, účty a synchronizace statistik, žebříčky a výzvy s přáteli.
5. **Monetizace (nápad):** zdarma základ, předplatné za pokročilé rozsahy, kvízy a detailní rozbory.

## 7. Známá omezení prototypu
- Doporučení jsou heuristiky (Chen + pot odds), **ne GTO solver** – pro začátečníka správný směr, pro pokročilé zjednodušené.
- Rozsahy soupeřů se odhadují jen podle preflop akce, postflop akce rozsah nezužují.
- Postflop EV ukazuje jen „okamžité“ EV callu (bez budoucích sázek / implied odds).
- Stacky se nepřenášejí mezi rukama (každá ruka má vlastní počáteční stacky); side-poty se počítají, ale zjednodušená pravidla pro krátký all-in raise (vždy znovu otevře sázení).
- Žádné zvuky ani animace žetonů; jen hra proti botům, ne proti lidem.
