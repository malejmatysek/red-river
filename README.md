# Red River

**Red River** je minimalistický trenér Texas Hold'em: **šance na výhru v %**, **doporučené tahy** (dají se vypnout) a **zpětná vazba** po každém rozhodnutí. Funguje jako webová aplikace, která se dá nainstalovat na telefon (PWA) a běží i offline.

Živě: https://malejmatysek.github.io/red-river/ · Podrobný návrh: [NAVRH.md](NAVRH.md)

### Co umí (verze 1.3)
- úvodní logo s otočkou Lumi, 5krokový úvod (poslední krok = výběr úrovně), jde otevřít znovu v Nastavení
- **srozumitelně pro začátečníky**: karty jako malé kartičky místo zkratek (Q5o), pozice slovy („na dealerovi“, „první na tahu“), stack slovy („100 velkých blindů“), síla ruky „síla 5/20“
- **Slovníček**: podtržené pojmy jdou ťuknout (vysvětlení v okně), celý slovníček je v Učení; volitelně **Pokročilá zkratková notace** (AKo, BTN, BB) v Nastavení
- **úrovně Začátečník / Pokročilý / Expert** (vybírá se v úvodu, mění v Nastavení, zobrazená na domovské obrazovce):
  - Začátečník – doporučení, šance i podrobné vysvětlení zapnuté
  - Pokročilý – šance zapnuté, doporučení vypnutá (přepínač), krátká zpětná vazba
  - Expert – bez nápověd, rozbor ruky jen na vyžádání
- **body (jen virtuální, nedají se vyplatit)**: vstup ke stolu, body za výhry, dobrá rozhodnutí, série v tréninku a lekce
- **Kolo štěstí** (nahrazuje denní bonus): jedno točení zdarma denně (podle místního data), plynulá animace se zvukem a vibrací, vážené výhry 100–2 000 bodů a vzácný jackpot 5 💎; po použití odpočet do půlnoci, na domovské obrazovce tečka, když je k dispozici; nabízí se i v okně „Málo bodů“ a v obchodě
- **Diamanty 💎** (druhá měna): za **Úspěchy** (16 – první ruka, první výhra, 10 dobrých rozhodnutí, 100/500 rukou, all-in, postupka, full house…), **7 dní hraní v řadě**, jackpot na kole a **denní výzvy** (10 rukou, 10 situací v tréninku, série 5 správně); když dojdou body, 1 💎 = 500 bodů
- **Obchod → Vzhled**: za diamanty rub karet (červený výchozí, Noir, Puntíky, Pruhy, Šachovnice), barva plochy stolu – barví jen plochu s kartami, pozadí aplikace zůstává černé (černý, bordó, grafit, zelený, půlnoc) a varianty Lumiho (duch, proužky, noir, brýle, koruna); body i diamanty mají vlastní ikony ve stylu loga a ukazují se na domovské obrazovce i u stolu; balíčky za skutečné peníze jsou jen ukázka („Platby brzy“)
- **Nápověda „Co co znamená“**: tlačítko **?** u stolu otevře překryv se štítky přímo u prvků stolu (dealer D, blindy, stacky, pot, stůl, výhra %, doporučení, tvoje místo, karty, tlačítka) s vysvětlením; odkaz na **Pořadí kombinací** a celý **Slovníček**; **?** je i v záhlaví ostatních obrazovek; žeton D, štítky SB/BB/akcí a stacky jdou ťuknout; na úrovni Expert je ? ztlumené (otevře se jen na ťuknutí)
- **Statistiky**: odehrané/vyhrané ruce, jak často hraješ a navyšuješ (VPIP/PFR), agresivita, showdown, all-iny, největší pot, zisk v bodech, shoda s doporučením, nejlepší kombinace; **herní styl** od 30 rukou (Opatrná skála, Tichý žralok, Divoký maniak, Volající stanice) s tipy; dva jasně popsané grafy – **Zisk z rukou** (končí přesně na čísle „Zisk v bodech“) a **Zůstatek bodů** (včetně vstupů, kola, odměn) – a graf kombinací; vynulování
- pomalejší, čitelné otáčení karet a tahy botů (rychlost jde změnit)
- domovská obrazovka: **Hrát**, **Trénink situací**, **Statistiky**, **Učení**, **Kolo štěstí**, **Úspěchy**, **Body a obchod**
- plynulé rozdávání bez blikání, nekonečné kombinace (kryptografické míchání, různí boti, náhodná místa a hloubky stacků)
- Nastavení: úroveň, nápovědy, notace, slovníček, 1–8 soupeřů, obtížnost, blindy, stack, trvalý bankroll, rychlost, zvuky, vibrace, **jazyk (čeština / English)**, vynulování statistik
- oznámení „Nová verze je připravená – Obnovit“ po aktualizaci

## Instalace na telefon
Aplikace musí být na webu přes **https** (např. GitHub Pages: `https://malejmatysek.github.io/red-river/`).

**iPhone (Safari)**
1. Otevři adresu aplikace v **Safari**.
2. Klepni na **Sdílet** (čtvereček se šipkou).
3. Vyber **Přidat na plochu** → **Přidat**.
4. Spouštěj ikonou „Red River“ z plochy – otevře se na celou obrazovku bez lišty prohlížeče.

**Android (Chrome)**
1. Otevři adresu aplikace v **Chrome**.
2. Klepni na **⋮** (menu) → **Instalovat aplikaci** (případně *Přidat na plochu*).
3. Potvrď **Instalovat**.

Po prvním otevření se všechno uloží do mezipaměti, takže aplikace jde spustit i bez internetu.

## Spuštění na počítači
```bash
python3 -m http.server 8080   # pak otevři http://localhost:8080
```
(`index.html` jde otevřít i přímo ze souboru, jen bez offline režimu.)

## Vývoj
- `index.html`, `style.css`, `app.js` (obrazovky, UI a průběh hry), `engine.js` (vyhodnocení rukou, equity, doporučení, boti), `i18n.js` (všechny texty CZ/EN)
- `manifest.webmanifest`, `sw.js` (offline cache – **při změně souborů zvyš `VERSION` v `sw.js`**), `icons/`
- Testy (potřebují `npm install` a Chrome/Chromium):
  - `node test_equity.js` – equity a vyhodnocení rukou
  - `node test_play.js` – automaticky odehraje stovky rukou
  - `node test_v13.js` – kolo štěstí (1× denně, odpočet), diamanty, směna, vzhled, úspěchy, grafy, nápověda
  - `node verify_pwa.js` – manifest, service worker, oznámení o nové verzi a offline načtení pod podcestou `/poker-trainer/`
  - `node test_flicker.js <složka projektu> [složka na snímky]` – kontrola blikání (DOM + snímky po framech)
  - `node shots.js` – snímky obrazovek skutečné aplikace do `screenshots/app-*.png`
  - cestu k prohlížeči lze nastavit proměnnou `CHROME=/cesta/k/chrome`

## Online stoly (větev `online`, zatím nenasazeno)

Hra s kamarády u soukromého stolu s kódem, o virtuální body. Nastavení serveru (Supabase) a popis architektury: [ONLINE.md](ONLINE.md).
