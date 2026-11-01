-- Red River – VEŘEJNÉ online stoly (hraj s kýmkoli) – doplněk k SETUP.sql
-- JAK SPUSTIT: Supabase Dashboard → SQL Editor → New query → vložit celý tento soubor → Run.
-- Bezpečné: nic nemaže, žádná data se neztratí; jde spustit opakovaně (if not exists / or replace).
-- Předpoklad: už běží soukromé stoly (SETUP.sql). Jen virtuální body, žádný výběr ani nákup za peníze.

do $$
begin
  if to_regclass('public.rooms') is null or to_regclass('public.room_state') is null or to_regclass('public.seats') is null
     or to_regprocedure('public.debit_points(uuid,bigint,text,uuid)') is null then
    raise exception 'Chybí základní tabulky – nejdřív spusť supabase/SETUP.sql (soukromé stoly).';
  end if;
end $$;

-- ---------- stoly: příznak veřejného stolu, úroveň sázek, počet sedících lidí (pro rychlé usazení) ----------
alter table public.rooms add column if not exists is_public boolean not null default false;
alter table public.rooms add column if not exists tier      text;
alter table public.rooms add column if not exists seated    int not null default 0;

-- kód stolu: soukromý RED-1234 nebo veřejný PUB-XXXXXX (jen rozšíření kontroly, stávající kódy dál platí)
alter table public.rooms drop constraint if exists rooms_code_check;
alter table public.rooms add constraint rooms_code_check check (code ~ '^(RED-[0-9]{4}|PUB-[A-Z0-9]{6})$');
alter table public.rooms drop constraint if exists rooms_tier_check;
alter table public.rooms add constraint rooms_tier_check check (tier is null or tier in ('micro', 'mid', 'high'));
alter table public.rooms drop constraint if exists rooms_seated_check;
alter table public.rooms add constraint rooms_seated_check check (seated between 0 and 9);

create index if not exists rooms_public_open_idx on public.rooms (tier, seated desc, updated_at desc)
  where is_public and status = 'playing';

-- ---------- nahlášení hráčů (čte jen správce v Dashboardu; klient nemá žádný přístup) ----------
create table if not exists public.reports (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  reporter      uuid references auth.users(id) on delete set null,
  reported      uuid references auth.users(id) on delete set null,
  reported_name text not null default '' check (char_length(reported_name) <= 32),
  room_id       uuid references public.rooms(id) on delete set null,
  room_code     text,
  hand_no       int,
  reason        text not null default 'other' check (reason in ('abuse', 'name', 'cheat', 'spam', 'other')),
  status        text not null default 'open' check (status in ('open', 'done', 'dismissed'))
);
create index if not exists reports_reported_idx on public.reports (reported, created_at desc);
create index if not exists reports_status_idx on public.reports (status, created_at desc);

-- ---------- limity požadavků (proti spamu) ----------
create table if not exists public.rate_limits (
  user_id      uuid not null,
  bucket       text not null,
  window_start timestamptz not null default now(),
  hits         int not null default 0,
  primary key (user_id, bucket)
);

-- vrací true = požadavek povolen; false = limit překročen (max_hits za window_secs sekund)
create or replace function public.rr_hit(uid uuid, bucket text, max_hits int, window_secs int) returns boolean
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare n int;
begin
  insert into public.rate_limits as r (user_id, bucket, window_start, hits) values (rr_hit.uid, rr_hit.bucket, now(), 1)
  on conflict (user_id, bucket) do update
    set hits = case when r.window_start < now() - make_interval(secs => rr_hit.window_secs) then 1 else r.hits + 1 end,
        window_start = case when r.window_start < now() - make_interval(secs => rr_hit.window_secs) then now() else r.window_start end
  returning r.hits into n;
  return n <= rr_hit.max_hits;
end $$;

-- ---------- práva: klient (anon/authenticated) nesmí nic, jen Edge Function (service_role) ----------
alter table public.reports     enable row level security;   -- bez policy = nepřístupné pro klienty
alter table public.rate_limits enable row level security;
revoke all on public.reports, public.rate_limits from anon, authenticated;
grant all on public.reports, public.rate_limits to service_role;
grant usage, select on all sequences in schema public to service_role;
revoke all on function public.rr_hit(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.rr_hit(uuid, text, int, int) to service_role;

-- staré záznamy limitů po dni smazat (volitelné, jde pustit kdykoli ručně):
-- delete from public.rate_limits where window_start < now() - interval '1 day';
