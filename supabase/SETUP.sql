-- Red River – online soukromé stoly (Supabase / Postgres)
-- JAK SPUSTIT: Supabase Dashboard → SQL Editor → New query → vložit celý tento soubor → Run.
-- Skript jde spustit opakovaně (if not exists / drop if exists). Nepotřebuje service role klíč.
-- Princip: AUTORITATIVNÍ SERVER. Klient do tabulek nikdy nepíše – všechny zápisy dělá Edge Function `table`
-- se service role klíčem. Klient smí jen ČÍST (RLS) a poslouchat Realtime.
-- Body jsou jen virtuální: buy-in se odečte z profiles.points, při odchodu se žetony vrátí. Žádný výběr peněz neexistuje.

create extension if not exists pgcrypto;

-- ---------- profily a virtuální body ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default 'Hráč' check (char_length(name) between 1 and 16),
  points      bigint not null default 1000 check (points >= 0),
  last_refill date,
  created_at  timestamptz not null default now()
);

create table if not exists public.point_ledger (                 -- auditní stopa všech změn bodů
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  delta      bigint not null,
  reason     text not null check (reason in ('signup', 'buyin', 'cashback', 'rebuy', 'refill', 'refund')),
  room_id    uuid,
  created_at timestamptz not null default now()
);
create index if not exists point_ledger_user_id_created_at_desc_idx on public.point_ledger (user_id, created_at desc);

-- nový uživatel (i anonymní) → profil s 1000 body
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.point_ledger (user_id, delta, reason) values (new.id, 1000, 'signup');
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- stoly ----------
create table if not exists public.rooms (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique check (code ~ '^RED-[0-9]{4}$'),
  host         uuid references auth.users(id) on delete set null,
  status       text not null default 'lobby' check (status in ('lobby', 'playing', 'closed')),
  settings     jsonb not null,
  public_state jsonb not null default '{}'::jsonb,   -- core.view(room, null): BEZ balíčku a cizích karet
  version      int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists rooms_status_updated_at_idx on public.rooms (status, updated_at);

-- úplný stav serveru (balíček, karty všech hráčů) – RLS zapnuté a ŽÁDNÁ policy → čte jen service role
create table if not exists public.room_state (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  state   jsonb not null,
  version int not null default 0
);

create table if not exists public.seats (
  room_id   uuid not null references public.rooms(id) on delete cascade,
  seat_no   int not null check (seat_no between 0 and 8),
  user_id   uuid references auth.users(id) on delete set null,
  is_bot    boolean not null default false,
  name      text not null,
  stack     int not null default 0 check (stack >= 0),
  sit_out   boolean not null default false,
  primary key (room_id, seat_no)
);
create unique index if not exists seats_one_per_user on public.seats (room_id, user_id) where user_id is not null;
create index if not exists seats_user_id_idx on public.seats (user_id);

-- vlastní karty: každý řádek vidí jen jeho vlastník (RLS) – i přes Realtime
create table if not exists public.hole_cards (
  room_id  uuid not null references public.rooms(id) on delete cascade,
  hand_no  int not null,
  user_id  uuid not null references auth.users(id) on delete cascade,
  cards    smallint[] not null check (array_length(cards, 1) = 2),
  primary key (room_id, hand_no, user_id)
);

-- historie rukou + rozbor po ruce (jen veřejné údaje: akce, board, odkryté karty ze showdownu)
create table if not exists public.hands (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references public.rooms(id) on delete cascade,
  hand_no    int not null,
  review     jsonb not null,
  created_at timestamptz not null default now(),
  unique (room_id, hand_no)
);

-- ---------- přístupová práva (projekt má vypnuté „auto-expose new tables“ → vše explicitně) ----------
-- anon nesmí nic; authenticated jen SELECT (řádky dál filtruje RLS); service_role (Edge Function) vše.
revoke all on public.profiles, public.point_ledger, public.rooms, public.room_state, public.seats, public.hole_cards, public.hands from anon, authenticated;
grant select on public.profiles, public.point_ledger, public.rooms, public.seats, public.hole_cards, public.hands to authenticated;
grant all on public.profiles, public.point_ledger, public.rooms, public.room_state, public.seats, public.hole_cards, public.hands to service_role;
grant usage, select on all sequences in schema public to service_role;
-- room_state: authenticated nemá ani SELECT (balíček a cizí karty) – navíc RLS bez policy

-- ---------- RLS ----------
alter table public.profiles     enable row level security;
alter table public.point_ledger enable row level security;
alter table public.rooms        enable row level security;
alter table public.room_state   enable row level security;   -- bez policy = nepřístupné pro anon/authenticated
alter table public.seats        enable row level security;
alter table public.hole_cards   enable row level security;
alter table public.hands        enable row level security;

-- členství ve stolu (security definer, aby se policy nezacyklily přes seats)
create or replace function public.is_member(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.seats s where s.room_id = r and s.user_id = auth.uid());
$$;
revoke all on function public.is_member(uuid) from public;
grant execute on function public.is_member(uuid) to authenticated;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles     for select to authenticated using (id = auth.uid());
drop policy if exists "own ledger" on public.point_ledger;
create policy "own ledger" on public.point_ledger for select to authenticated using (user_id = auth.uid());
drop policy if exists "members read room" on public.rooms;
create policy "members read room" on public.rooms        for select to authenticated using (public.is_member(id));
drop policy if exists "members read seats" on public.seats;
create policy "members read seats" on public.seats        for select to authenticated using (public.is_member(room_id));
drop policy if exists "own hole cards" on public.hole_cards;
create policy "own hole cards" on public.hole_cards   for select to authenticated using (user_id = auth.uid());
drop policy if exists "members read hands" on public.hands;
create policy "members read hands" on public.hands        for select to authenticated using (public.is_member(room_id));
-- žádné insert/update/delete policy: klient nezapíše nic (body, stack, karty, akce jen přes Edge Function)
-- jediná výjimka: jméno v profilu
grant update (name) on public.profiles to authenticated;
drop policy if exists "rename self" on public.profiles;
create policy "rename self" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------- atomické pohyby bodů (volá jen Edge Function se service role) ----------
create or replace function public.debit_points(uid uuid, amount bigint, why text, room uuid default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare left_ bigint;
begin
  if amount < 0 then raise exception 'bad_amount'; end if;
  update public.profiles set points = points - amount where id = uid and points >= amount returning points into left_;
  if left_ is null then raise exception 'points' using errcode = 'P0001'; end if;
  insert into public.point_ledger (user_id, delta, reason, room_id) values (uid, -amount, why, room);
  return left_;
end $$;

create or replace function public.credit_points(uid uuid, amount bigint, why text, room uuid default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare left_ bigint;
begin
  if amount < 0 then raise exception 'bad_amount'; end if;
  update public.profiles set points = points + amount where id = uid returning points into left_;
  insert into public.point_ledger (user_id, delta, reason, room_id) values (uid, amount, why, room);
  return left_;
end $$;

revoke all on function public.debit_points(uuid, bigint, text, uuid)  from public, anon, authenticated;
revoke all on function public.credit_points(uuid, bigint, text, uuid) from public, anon, authenticated;
grant execute on function public.debit_points(uuid, bigint, text, uuid)  to service_role;
grant execute on function public.credit_points(uuid, bigint, text, uuid) to service_role;

-- denní doplnění zdarma (jen virtuální): když má hráč méně než 1000, jednou denně dorovná na 1000
create or replace function public.daily_refill() returns bigint
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid() for update;
  if p.id is null then raise exception 'auth'; end if;
  if p.points < 1000 and (p.last_refill is null or p.last_refill < current_date) then
    insert into public.point_ledger (user_id, delta, reason) values (p.id, 1000 - p.points, 'refill');
    update public.profiles set points = 1000, last_refill = current_date where id = p.id;
    return 1000;
  end if;
  return p.points;
end $$;
revoke all on function public.daily_refill() from public, anon;
grant execute on function public.daily_refill() to authenticated;

-- ---------- Realtime: klient dostává signál o změně (RLS platí i pro Realtime) ----------
do $$
declare t text;
begin
  foreach t in array array['rooms', 'seats', 'hole_cards', 'hands'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- úklid (volitelné, vyžaduje rozšíření pg_cron) ----------
-- Opuštěné stoly (bez změny 6 h) zavřít a žetony vrátit do bodů dělá Edge Function `table` operací `sweep`;
-- naplánovat lze např.:  select cron.schedule('rr-sweep', '*/30 * * * *', $$ select net.http_post(...) $$);

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
