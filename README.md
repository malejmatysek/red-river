# Red River

**Red River** je minimalistický trenér Texas Hold'em: **šance na výhru v %**, **doporučené tahy** (dají se vypnout) a **zpětná vazba** po každém rozhodnutí. Funguje jako webová aplikace, která se dá nainstalovat na telefon (PWA) a běží i offline.

Živě: https://malejmatysek.github.io/red-river/ · Podrobný návrh: [NAVRH.md](NAVRH.md)

### Co umí (verze 1.1)
- úvodní logo s otočkou Lumi, 4krokový úvod (přeskočitelný, jde otevřít znovu v Nastavení)
- domovská obrazovka: **Hrát**, **Trénink situací** (nekonečné rozhodovací spoty), **Statistiky**, **Učení**
- plynulé rozdávání bez blikání (karty dolétnou k hráčům, tvoje se otočí), nekonečné kombinace (kryptografické míchání, různí boti, náhodná místa a hloubky stacků)
- Nastavení: doporučení / šance / učení, 1–8 soupeřů, obtížnost, blindy, velikost stacku, krátké stacky, trvalý bankroll, rychlost hry, zvuky, vibrace, **jazyk (čeština / English)**, vynulování statistik
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
  - `node verify_pwa.js` – manifest, service worker, oznámení o nové verzi a offline načtení pod podcestou `/poker-trainer/`
  - `node test_flicker.js <složka projektu> [složka na snímky]` – kontrola blikání (DOM + snímky po framech)
  - `node shots.js` – snímky obrazovek skutečné aplikace do `screenshots/app-*.png`
  - cestu k prohlížeči lze nastavit proměnnou `CHROME=/cesta/k/chrome`
