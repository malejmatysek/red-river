-- Red River – rychlé doručení stavu stolu (Realtime Broadcast, soukromé kanály).
-- Server (Edge Function `table`) po každé změně stolu pošle každému hráči JEHO pohled na kanál rr-u-<jeho uid>.
-- Tato politika zajistí, že kanál rr-u-<uid> smí poslouchat jen přihlášený uživatel s tímto uid.
-- Posílat do kanálu smí jen server (klienti nemají insert politiku) → stav stolu nejde podvrhnout.
-- Bez této politiky hra funguje dál (pomaleji, přes postgres_changes + dotazy).
drop policy if exists "rr: vlastni kanal se stavem stolu" on realtime.messages;
create policy "rr: vlastni kanal se stavem stolu" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) = 'rr-u-' || (select auth.uid())::text
  );
