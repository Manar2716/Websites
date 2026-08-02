-- ============================================================================
--  FADE & CO — barber booking platform
--  Schema, row level security, and the two RPCs the public site calls.
--
--  Run this once in the Supabase SQL editor (or `supabase db push`). It is
--  idempotent: re-running it drops and recreates policies and functions but
--  leaves table data alone.
--
--  Security model
--  --------------
--  There is exactly one admin, a row in `admin_users` pointing at an
--  `auth.users` record. The table has a singleton constraint, no RLS policies
--  of any kind, and is therefore unreachable through PostgREST — the only way
--  to add an admin is the SQL editor or the service role key. A customer
--  cannot promote themselves no matter what they send.
--
--  The public (anon) role can read published content and nothing else. It
--  never touches `appointments` or `customers` directly; both are written
--  through `create_booking()`, a SECURITY DEFINER function that validates the
--  slot before inserting. Availability comes from `get_available_slots()`,
--  which returns only free start times — no appointment rows, so one customer
--  can never enumerate another's booking.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";

-- ---------------------------------------------------------------------------
--  Types
-- ---------------------------------------------------------------------------
do $$ begin
  create type appointment_status as enum
    ('pending', 'confirmed', 'completed', 'cancelled', 'no_show');
exception when duplicate_object then null; end $$;

do $$ begin
  create type block_kind as enum ('holiday', 'vacation', 'block');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
--  Tables
-- ---------------------------------------------------------------------------

-- The single admin. No RLS policies => no API access => customers can never
-- insert here. Seeded by hand once, from the SQL editor.
create table if not exists public.admin_users (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  email       text,
  created_at  timestamptz not null default now(),
  -- Singleton: the unique constraint on a column that can only ever hold
  -- `true` means a second row is rejected by the database itself.
  only_one    boolean not null default true,
  constraint admin_users_singleton unique (only_one),
  constraint admin_users_singleton_true check (only_one)
);

create table if not exists public.services (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  slug              text unique,
  description       text not null default '',
  price_cents       integer not null default 0 check (price_cents >= 0),
  duration_minutes  integer not null default 30 check (duration_minutes between 5 and 480),
  icon              text not null default 'scissors',
  is_active         boolean not null default true,
  is_featured       boolean not null default false,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.barbers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  title          text not null default '',
  bio            text not null default '',
  photo_url      text,
  specialties    text[] not null default '{}',
  instagram      text,
  is_active      boolean not null default true,
  -- Vacation mode: while on, the barber is hidden from booking and
  -- `get_available_slots` returns nothing for them.
  on_vacation    boolean not null default false,
  vacation_note  text,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Opening hours. One row per weekday for the shop (barber_id null), plus
-- optional per-barber overrides. Breaks live here because a break is a
-- property of a working day, not an event.
create table if not exists public.schedules (
  id           uuid primary key default gen_random_uuid(),
  barber_id    uuid references public.barbers(id) on delete cascade,
  weekday      smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  is_closed    boolean not null default false,
  opens_at     time not null default '09:00',
  closes_at    time not null default '18:00',
  break_start  time,
  break_end    time,
  updated_at   timestamptz not null default now(),
  constraint schedules_hours_ordered check (is_closed or closes_at > opens_at),
  constraint schedules_break_paired check (
    (break_start is null and break_end is null)
    or (break_start is not null and break_end is not null and break_end > break_start)
  )
);
create unique index if not exists schedules_shop_weekday_idx
  on public.schedules (weekday) where barber_id is null;
create unique index if not exists schedules_barber_weekday_idx
  on public.schedules (barber_id, weekday) where barber_id is not null;

-- Holidays, blocked slots and vacation ranges. Shop-wide when barber_id is null.
create table if not exists public.time_blocks (
  id         uuid primary key default gen_random_uuid(),
  barber_id  uuid references public.barbers(id) on delete cascade,
  kind       block_kind not null default 'block',
  reason     text not null default '',
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  created_at timestamptz not null default now(),
  constraint time_blocks_ordered check (ends_at > starts_at)
);
create index if not exists time_blocks_range_idx on public.time_blocks (starts_at, ends_at);

create table if not exists public.customers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  phone          text not null,
  email          text,
  notes          text not null default '',
  favorite_barber_id uuid references public.barbers(id) on delete set null,
  visit_count    integer not null default 0,
  total_spend_cents integer not null default 0,
  last_visit_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- Phone is the identity: a returning customer is matched on it, so history
-- accumulates without asking anyone to create an account.
create unique index if not exists customers_phone_idx
  on public.customers (regexp_replace(phone, '[^0-9]', '', 'g'));

create table if not exists public.appointments (
  id           uuid primary key default gen_random_uuid(),
  reference    text not null unique,
  customer_id  uuid not null references public.customers(id) on delete cascade,
  barber_id    uuid not null references public.barbers(id) on delete restrict,
  service_id   uuid not null references public.services(id) on delete restrict,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  status       appointment_status not null default 'pending',
  price_cents  integer not null default 0,
  notes        text not null default '',
  is_walk_in   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint appointments_ordered check (ends_at > starts_at),
  -- The actual double-booking guard. Two live appointments for one barber can
  -- never overlap, whatever the application layer does — a race between two
  -- customers tapping the same slot is resolved by the database.
  constraint appointments_no_overlap exclude using gist (
    barber_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status <> 'cancelled')
);
create index if not exists appointments_starts_idx on public.appointments (starts_at desc);
create index if not exists appointments_barber_day_idx on public.appointments (barber_id, starts_at);
create index if not exists appointments_status_idx on public.appointments (status);
create index if not exists appointments_customer_idx on public.appointments (customer_id);

create table if not exists public.gallery (
  id          uuid primary key default gen_random_uuid(),
  image_url   text not null,
  caption     text not null default '',
  alt_text    text not null default '',
  sort_order  integer not null default 0,
  is_visible  boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  author_name   text not null,
  author_role   text not null default '',
  rating        smallint not null default 5 check (rating between 1 and 5),
  body          text not null,
  barber_id     uuid references public.barbers(id) on delete set null,
  is_published  boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

-- Every editable string on the public site, keyed by section. jsonb rather
-- than a column per field so new copy never needs a migration.
create table if not exists public.website_content (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Booking rules. Single row, id fixed at 1.
create table if not exists public.settings (
  id                       smallint primary key default 1 check (id = 1),
  timezone                 text not null default 'Europe/Amsterdam',
  currency                 text not null default 'EUR',
  currency_symbol          text not null default '€',
  booking_interval_minutes integer not null default 15 check (booking_interval_minutes between 5 and 120),
  default_duration_minutes integer not null default 30 check (default_duration_minutes between 5 and 480),
  buffer_minutes           integer not null default 0 check (buffer_minutes between 0 and 120),
  lead_time_minutes        integer not null default 60 check (lead_time_minutes >= 0),
  max_advance_days         integer not null default 60 check (max_advance_days between 1 and 365),
  auto_confirm             boolean not null default false,
  updated_at               timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
--  Triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['services','barbers','customers','appointments','schedules','settings','website_content']
  loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format(
      'create trigger touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- Customer lifetime stats follow appointment status rather than being written
-- by the client, so they stay right however the appointment was changed.
create or replace function public.sync_customer_stats()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  -- NEW is unassigned on DELETE and reading a field off it raises, so the
  -- operation has to be tested rather than coalesced over.
  if tg_op = 'DELETE' then cid := old.customer_id; else cid := new.customer_id; end if;

  update customers c set
    visit_count = coalesce(agg.visits, 0),
    total_spend_cents = coalesce(agg.spend, 0),
    last_visit_at = agg.last_visit
  from (
    select count(*) as visits,
           sum(price_cents) as spend,
           max(starts_at) as last_visit
    from appointments
    where customer_id = cid and status = 'completed'
  ) agg
  where c.id = cid;
  return null;
end $$;

drop trigger if exists sync_customer_stats on public.appointments;
create trigger sync_customer_stats
  after insert or update of status, price_cents or delete on public.appointments
  for each row execute function public.sync_customer_stats();

-- ---------------------------------------------------------------------------
--  Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_users where user_id = auth.uid());
$$;

create or replace function public.booking_reference()
returns text language sql volatile as $$
  -- Six characters from an alphabet with no 0/O/1/I, so it can be read aloud.
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                           1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 6);
$$;

-- ---------------------------------------------------------------------------
--  Availability
--
--  Returns the free start times for one barber, one service, one day. Every
--  rule lives here: opening hours, per-barber overrides, breaks, holidays,
--  blocks, vacation, lead time, booking horizon, and existing appointments.
-- ---------------------------------------------------------------------------
create or replace function public.get_available_slots(
  p_barber_id uuid,
  p_service_id uuid,
  p_date date
)
returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  s              settings%rowtype;
  sched          schedules%rowtype;
  v_duration     integer;
  v_dow          smallint;
  v_today        date;
  v_cursor       timestamptz;
  v_day_open     timestamptz;
  v_day_close    timestamptz;
  v_break_open   timestamptz;
  v_break_close  timestamptz;
  v_end          timestamptz;
  v_earliest     timestamptz;
begin
  select * into s from settings where id = 1;
  if not found then return; end if;

  select duration_minutes into v_duration
  from services where id = p_service_id and is_active;
  if v_duration is null then return; end if;

  perform 1 from barbers
   where id = p_barber_id and is_active and not on_vacation;
  if not found then return; end if;

  v_today := (now() at time zone s.timezone)::date;
  if p_date < v_today or p_date > v_today + s.max_advance_days then return; end if;

  v_dow := extract(dow from p_date)::smallint;

  -- Per-barber hours win over shop hours when present.
  select * into sched from schedules
   where barber_id = p_barber_id and weekday = v_dow;
  if not found then
    select * into sched from schedules
     where barber_id is null and weekday = v_dow;
  end if;
  if not found or sched.is_closed then return; end if;

  v_day_open  := timezone(s.timezone, (p_date + sched.opens_at)::timestamp);
  v_day_close := timezone(s.timezone, (p_date + sched.closes_at)::timestamp);
  if sched.break_start is not null then
    v_break_open  := timezone(s.timezone, (p_date + sched.break_start)::timestamp);
    v_break_close := timezone(s.timezone, (p_date + sched.break_end)::timestamp);
  end if;

  v_earliest := now() + make_interval(mins => s.lead_time_minutes);
  v_cursor := v_day_open;

  while v_cursor + make_interval(mins => v_duration) <= v_day_close loop
    v_end := v_cursor + make_interval(mins => v_duration + s.buffer_minutes);

    if v_cursor >= v_earliest
       and (v_break_open is null
            or not (tstzrange(v_cursor, v_end, '[)') && tstzrange(v_break_open, v_break_close, '[)')))
       and not exists (
         select 1 from appointments a
          where a.barber_id = p_barber_id
            and a.status <> 'cancelled'
            and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(v_cursor, v_end, '[)')
       )
       and not exists (
         select 1 from time_blocks b
          where (b.barber_id is null or b.barber_id = p_barber_id)
            and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(v_cursor, v_end, '[)')
       )
    then
      slot_start := v_cursor;
      slot_end := v_cursor + make_interval(mins => v_duration);
      return next;
    end if;

    v_cursor := v_cursor + make_interval(mins => s.booking_interval_minutes);
  end loop;
end $$;

-- Every barber's free slots for one day, for the "any barber" path in the
-- booking flow. One round trip instead of one per barber.
create or replace function public.get_available_slots_any(
  p_service_id uuid,
  p_date date
)
returns table (barber_id uuid, slot_start timestamptz, slot_end timestamptz)
language sql stable security definer set search_path = public as $$
  select b.id, s.slot_start, s.slot_end
  from barbers b
  cross join lateral get_available_slots(b.id, p_service_id, p_date) s
  where b.is_active and not b.on_vacation
  order by s.slot_start, b.sort_order;
$$;

-- Which of the next N days have any availability at all — what the date
-- picker needs to grey out full days without fetching every slot.
create or replace function public.get_available_days(
  p_barber_id uuid,
  p_service_id uuid,
  p_from date,
  p_days integer
)
returns table (day date, has_slots boolean)
language sql stable security definer set search_path = public as $$
  select d::date,
         exists (
           select 1 from barbers b
           where b.is_active and not b.on_vacation
             and (p_barber_id is null or b.id = p_barber_id)
             and exists (select 1 from get_available_slots(b.id, p_service_id, d::date))
         )
  from generate_series(p_from, p_from + (greatest(least(p_days, 120), 1) - 1), interval '1 day') d;
$$;

-- ---------------------------------------------------------------------------
--  Booking
--
--  The only write path open to anonymous visitors. Validates its own inputs,
--  re-checks availability inside the transaction, upserts the customer on
--  phone number, and lets the exclusion constraint settle any race.
-- ---------------------------------------------------------------------------
create or replace function public.create_booking(
  p_service_id uuid,
  p_barber_id uuid,
  p_starts_at timestamptz,
  p_name text,
  p_phone text,
  p_email text default null,
  p_notes text default ''
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  s            settings%rowtype;
  v_service    services%rowtype;
  v_customer   customers%rowtype;
  v_ends_at    timestamptz;
  v_ref        text;
  v_id         uuid;
  v_digits     text;
  v_name       text := btrim(coalesce(p_name, ''));
  v_email      text := nullif(btrim(lower(coalesce(p_email, ''))), '');
begin
  select * into s from settings where id = 1;

  if length(v_name) < 2 then
    raise exception 'Please enter your full name' using errcode = 'check_violation';
  end if;

  v_digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if length(v_digits) < 7 then
    raise exception 'Please enter a valid phone number' using errcode = 'check_violation';
  end if;

  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid email address' using errcode = 'check_violation';
  end if;

  select * into v_service from services where id = p_service_id and is_active;
  if not found then
    raise exception 'That service is no longer available' using errcode = 'no_data_found';
  end if;

  -- Trust nothing from the client: the slot must still be one the
  -- availability function is offering right now.
  if not exists (
    select 1 from get_available_slots(
      p_barber_id, p_service_id,
      (p_starts_at at time zone s.timezone)::date)
    where slot_start = p_starts_at
  ) then
    raise exception 'That time has just been taken. Please pick another slot.'
      using errcode = 'unique_violation';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_service.duration_minutes);

  select * into v_customer from customers
   where regexp_replace(phone, '[^0-9]', '', 'g') = v_digits;

  if found then
    update customers set
      name = v_name,
      phone = p_phone,
      email = coalesce(v_email, email),
      favorite_barber_id = coalesce(favorite_barber_id, p_barber_id)
    where id = v_customer.id
    returning * into v_customer;
  else
    insert into customers (name, phone, email, favorite_barber_id)
    values (v_name, p_phone, v_email, p_barber_id)
    returning * into v_customer;
  end if;

  loop
    v_ref := booking_reference();
    exit when not exists (select 1 from appointments where reference = v_ref);
  end loop;

  insert into appointments
    (reference, customer_id, barber_id, service_id, starts_at, ends_at,
     status, price_cents, notes)
  values
    (v_ref, v_customer.id, p_barber_id, p_service_id, p_starts_at, v_ends_at,
     (case when s.auto_confirm then 'confirmed' else 'pending' end)::appointment_status,
     v_service.price_cents, left(coalesce(p_notes, ''), 500))
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'reference', v_ref,
    'starts_at', p_starts_at,
    'ends_at', v_ends_at,
    'status', case when s.auto_confirm then 'confirmed' else 'pending' end,
    'service', v_service.name,
    'price_cents', v_service.price_cents,
    'barber', (select name from barbers where id = p_barber_id),
    'customer_name', v_customer.name
  );
exception
  when exclusion_violation then
    raise exception 'That time has just been taken. Please pick another slot.'
      using errcode = 'unique_violation';
end $$;

-- Look up one booking by reference + phone, for the confirmation page. Both
-- are required, so a reference on its own leaks nothing.
create or replace function public.get_booking(p_reference text, p_phone text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'reference', a.reference,
    'status', a.status,
    'starts_at', a.starts_at,
    'ends_at', a.ends_at,
    'price_cents', a.price_cents,
    'notes', a.notes,
    'service', s.name,
    'duration_minutes', s.duration_minutes,
    'barber', b.name,
    'barber_photo', b.photo_url,
    'customer_name', c.name,
    'customer_phone', c.phone,
    'customer_email', c.email
  )
  from appointments a
  join services s on s.id = a.service_id
  join barbers b on b.id = a.barber_id
  join customers c on c.id = a.customer_id
  where upper(a.reference) = upper(btrim(p_reference))
    and regexp_replace(c.phone, '[^0-9]', '', 'g')
        = regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
$$;

-- Let a customer cancel their own booking with reference + phone.
create or replace function public.cancel_booking(p_reference text, p_phone text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  select a.id into v_id
  from appointments a join customers c on c.id = a.customer_id
  where upper(a.reference) = upper(btrim(p_reference))
    and regexp_replace(c.phone, '[^0-9]', '', 'g')
        = regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
    and a.status in ('pending', 'confirmed')
    and a.starts_at > now();
  if v_id is null then
    raise exception 'No cancellable booking found for those details'
      using errcode = 'no_data_found';
  end if;
  update appointments set status = 'cancelled' where id = v_id;
  return jsonb_build_object('cancelled', true);
end $$;

-- ---------------------------------------------------------------------------
--  Row level security
--
--  Anonymous visitors read published content and call the three booking RPCs.
--  Everything else — every table write, every appointment and customer row —
--  requires is_admin().
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['admin_users','services','barbers','schedules','time_blocks',
                           'customers','appointments','gallery','reviews',
                           'website_content','settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- Drop every existing policy on our tables so this file can be re-run.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('admin_users','services','barbers','schedules','time_blocks',
                        'customers','appointments','gallery','reviews',
                        'website_content','settings')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- admin_users deliberately gets no policies at all: RLS is forced, so every
-- API request against it — read or write, authenticated or not — is denied.

-- Public reads, scoped to what is actually published.
create policy services_public_read on public.services
  for select using (is_active or is_admin());
create policy barbers_public_read on public.barbers
  for select using (is_active or is_admin());
create policy schedules_public_read on public.schedules
  for select using (true);
create policy time_blocks_public_read on public.time_blocks
  for select using (true);
create policy gallery_public_read on public.gallery
  for select using (is_visible or is_admin());
create policy reviews_public_read on public.reviews
  for select using (is_published or is_admin());
create policy content_public_read on public.website_content
  for select using (true);
create policy settings_public_read on public.settings
  for select using (true);

-- Admin writes.
do $$
declare t text;
begin
  foreach t in array array['services','barbers','schedules','time_blocks',
                           'gallery','reviews','website_content','settings']
  loop
    execute format(
      'create policy %1$s_admin_write on public.%1$s
         for all to authenticated
         using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- Customers and appointments are admin-only end to end. Anonymous booking
-- happens through create_booking(), which runs as its owner and bypasses this.
create policy customers_admin_all on public.customers
  for all to authenticated using (is_admin()) with check (is_admin());
create policy appointments_admin_all on public.appointments
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
--  Grants
--
--  Supabase grants the API roles broad table privileges by default, but this
--  file does not rely on that: table access is stated here explicitly, and the
--  policies above are what actually narrow it. Privilege and policy have to
--  agree — a grant without a matching policy still returns nothing.
--
--  `admin_users` is granted to nobody. Combined with forced RLS and no
--  policies, it is unreachable through the API by construction.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

revoke all on table public.admin_users from anon, authenticated;

do $$
declare t text;
begin
  -- Published content: anonymous read, admin write.
  foreach t in array array['services','barbers','schedules','time_blocks',
                           'gallery','reviews','website_content','settings']
  loop
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;

  -- Never anonymous: reachable only with an admin session, or through the
  -- SECURITY DEFINER booking functions.
  foreach t in array array['customers','appointments']
  loop
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

revoke all on function public.create_booking(uuid, uuid, timestamptz, text, text, text, text) from public;
revoke all on function public.get_available_slots(uuid, uuid, date) from public;
revoke all on function public.get_available_slots_any(uuid, date) from public;
revoke all on function public.get_available_days(uuid, uuid, date, integer) from public;
revoke all on function public.get_booking(text, text) from public;
revoke all on function public.cancel_booking(text, text) from public;

grant execute on function public.get_available_slots(uuid, uuid, date) to anon, authenticated;
grant execute on function public.get_available_slots_any(uuid, date) to anon, authenticated;
grant execute on function public.get_available_days(uuid, uuid, date, integer) to anon, authenticated;
grant execute on function public.create_booking(uuid, uuid, timestamptz, text, text, text, text) to anon, authenticated;
grant execute on function public.get_booking(text, text) to anon, authenticated;
grant execute on function public.cancel_booking(text, text) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
