# Red River – online soukromé stoly (větev `online`)

Hra s kamarády u soukromého stolu s kódem (např. `RED-4821`). Hraje se jen o **virtuální online body** –
nedají se vybrat, proměnit ani koupit. Server je autoritativní: míchá, rozdává, hlídá pořadí a částky.
U online stolů nejsou rady ani šance na výhru; po každé ruce je k dispozici **rozbor ruky**.

## Jak to funguje

| Část | Soubor | Co dělá |
|---|---|---|
| Jádro hry | `online/core.js` | pravidla, validace tahů, side poty, boti, časovač (30 s na tah), rozbor ruky. Běží na serveru (Edge Function) i v lokálním mocku. |
| Síť | `online/net.js` | `SupabaseNet` (Edge Function + Realtime) a `MockNet` (in-memory, offline ukázka a testy) – stejné rozhraní. |
| Obrazovky | `online/ui.js` | Hrát s kamarády → Založit stůl / Připojit kódem → lobby → stůl. CS/EN. |
| Konfigurace | `online/config.js` | URL projektu + **publishable** klíč (veřejný, patří do klienta). |
| Databáze | `supabase/SETUP.sql` | tabulky, práva, RLS, funkce pro body, Realtime. |
| Server | `supabase/functions/table/index.ts` (+ `_shared/`) | Edge Function `table`. Jednosouborová verze pro Dashboard: `supabase/dashboard/table.ts`. |

**Bezpečnost:** klient do tabulek nikdy nezapisuje (nemá na to práva). Balíček a karty všech hráčů jsou jen v tabulce
`room_state`, ke které klient nemá přístup vůbec. Svoje karty vidí hráč přes `hole_cards` (RLS: jen vlastník).
Body mění jen server (funkce `debit_points` / `credit_points` jsou jen pro serverovou roli). Míchání: `crypto.getRandomValues`
bez modulo zkreslení (Fisher–Yates).

## Nastavení Supabase (jednorázově, ~5 minut)

Projekt: `https://ffrmpprhcgyfbtabhmzu.supabase.co` (Evropa). **Service role / secret klíč nepotřebuješ nikam vyplňovat** –
Supabase ho do Edge Function vkládá sám.

1. **Databáze** – Dashboard → **SQL Editor** → *New query* → vlož celý obsah `supabase/SETUP.sql` → **Run**.
   Skript jde spustit i opakovaně. Práva k tabulkám uděluje explicitně (projekt má vypnuté automatické zpřístupnění nových tabulek).
2. **Anonymní přihlášení** – Dashboard → **Authentication → Sign In / Providers** → zapnout **Allow anonymous sign-ins**.
   (Hráči nemusí zakládat účet; každé zařízení dostane anonymní účet s 1000 online body.)
3. **Edge Function `table`** – jedna z možností:
   - **Dashboard:** Edge Functions → *Deploy a new function* → *Via Editor* → název **`table`** → smaž vzorový kód a vlož celý
     `supabase/dashboard/table.ts` → *Deploy*. Pak v detailu funkce (Details / Settings) **vypni „Verify JWT“**
     (funkce si přihlášení ověřuje sama; s novými klíči by kontrola brány volání odmítla).
   - **CLI:** `./supabase/sync-shared.sh && npx supabase login && npx supabase functions deploy table --project-ref ffrmpprhcgyfbtabhmzu`
     (`verify_jwt = false` je už v `supabase/config.toml`).
4. *(volitelné)* Edge Functions → **Secrets**:
   - `RR_ALLOWED_ORIGINS` – odkud smí aplikace volat (výchozí `https://malejmatysek.github.io,http://localhost:8080`).
   - `RR_SWEEP_SECRET` – jen pokud chceš úklid opuštěných stolů cronem (viz komentář na konci `SETUP.sql`).

Realtime se zapne samo (SQL přidá tabulky do publikace `supabase_realtime`).

### Které hodnoty jsou potřeba a kde je najít

| Hodnota | Kde | Kam |
|---|---|---|
| Project URL | Settings → **Data API** (nebo Settings → API) | už je v `online/config.js` |
| Publishable key (`sb_publishable_…`) nebo starý anon key | Settings → **API Keys** | už je v `online/config.js` (je veřejný, patří do klienta) |
| Secret / service_role key | Settings → API Keys | **nikam** – Edge Function ho dostane automaticky (`SUPABASE_SECRET_KEYS` / `SUPABASE_SERVICE_ROLE_KEY`). Nikdy do repa ani do klienta. |

## Bez serveru (ukázka a testy)

Dokud funkce `table` neodpovídá, aplikace sama přepne na **ukázkový režim** (lokální mock, štítek „UKÁZKA“).
Vynucení mocku: `?mock=1` v URL nebo `FORCE_MOCK: true` v `online/config.js`.

## Testy

```
node test_online.js                                    # jádro + mock: 300+ rukou, side poty, body, soukromí karet, míchání (χ²)
PW=…/playwright-core node test_online_ui.js            # UI: 2 hráči proti mocku (SHOTS=1 uloží screenshoty)
```

Server se ověřil i mimo prohlížeč: `deno check` Edge Function (obě verze) a `SETUP.sql` na lokálním PostgreSQL 17
se Supabase-like rolemi – spuštěno 2× za sebou, testy RLS (cizí karty, `room_state`, body, zápisy) prošly.
