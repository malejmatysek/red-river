#!/bin/sh
# Vyrobí JEDEN soubor pro vložení do Supabase Dashboard → Edge Functions → Deploy a new function → Via Editor
# (jádro hry + vyhodnocení rukou + server v jednom souboru, bez _shared importů).
set -e
cd "$(dirname "$0")/.."
./supabase/sync-shared.sh >/dev/null
OUT=supabase/dashboard/table.ts
mkdir -p supabase/dashboard
{
  echo "// @ts-nocheck"
  echo "// Red River – Edge Function \`table\` (jeden soubor pro Dashboard editor). VYGENEROVÁNO: supabase/build-dashboard.sh – needitovat ručně."
  echo "import { createClient } from 'npm:@supabase/supabase-js@2';"
  echo "// ===== engine.js (vyhodnocení rukou, equity) ====="
  cat engine.js
  echo "// ===== online/core.js (autoritativní jádro) ====="
  cat online/core.js
  echo "// ===== server ====="
  grep -v "^import " supabase/functions/table/index.ts
} > "$OUT"
echo "built $OUT ($(wc -l < "$OUT") řádků)"
