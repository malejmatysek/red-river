#!/bin/sh
# Zkopíruje sdílené herní jádro do Edge Function (jeden zdroj pravdy: online/core.js + engine.js).
# Spusť před každým `supabase functions deploy table`.
set -e
cd "$(dirname "$0")/.."
cp engine.js supabase/functions/_shared/engine.js
cp online/core.js supabase/functions/_shared/core.js
echo "shared core synced"
