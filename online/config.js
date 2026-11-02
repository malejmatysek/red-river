/* Red River online – konfigurace serveru.
   Dokud je klíč prázdný (nebo FORCE_MOCK / ?mock=1), online stoly běží proti lokálnímu in-memory mocku (offline ukázka, testy).
   SUPABASE_URL a SUPABASE_ANON_KEY jsou veřejné hodnoty (smí být v klientovi). Service role klíč sem NIKDY nepatří. */
window.RR_ONLINE_CONFIG = {
  SUPABASE_URL: 'https://ffrmpprhcgyfbtabhmzu.supabase.co',   // Project Settings → API → Project URL
  SUPABASE_ANON_KEY: 'sb_publishable_PRH6hx-Hf33yRRh61NRfkQ_q4dFVjLd',   // veřejný publishable klíč (sb_publishable_…) nebo starý anon JWT – Settings → API Keys. Secret/service_role klíč sem NIKDY.
  FUNCTION: 'table',       // název Edge Function (supabase/functions/table)
  REGION: '',              // Edge Function poběží vedle databáze (Irsko) – jinak se volá nejbližší region a každý dotaz do DB letí přes oceán
  FORCE_MOCK: false        // true = vždy lokální mock (offline ukázka); totéž ?mock=1 v URL
};
