-- Family Fit — Supabase schema + RLS
-- Paste into the Supabase SQL editor (Dashboard → SQL → New query).
-- Run once on a fresh project. Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS.

-- ---------------------------------------------------------------------------
-- Profiles (one row per invited family member)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Family member display names for the competition.';

-- ---------------------------------------------------------------------------
-- Weigh-ins
-- ---------------------------------------------------------------------------
create table if not exists public.weigh_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  weight_lbs numeric(6, 2) not null check (weight_lbs > 0 and weight_lbs < 1000),
  recorded_on date not null default (timezone('utc', now()))::date,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists weigh_ins_user_id_recorded_on_idx
  on public.weigh_ins (user_id, recorded_on desc);

comment on table public.weigh_ins is 'Private weigh-in logs; readable by signed-in family for competition.';

-- ---------------------------------------------------------------------------
-- Exercise logs
-- ---------------------------------------------------------------------------
create table if not exists public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  activity text not null check (char_length(trim(activity)) > 0),
  duration_minutes integer not null check (duration_minutes > 0 and duration_minutes <= 1440),
  recorded_on date not null default (timezone('utc', now()))::date,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists exercise_logs_user_id_recorded_on_idx
  on public.exercise_logs (user_id, recorded_on desc);

comment on table public.exercise_logs is 'Exercise sessions; readable by signed-in family for competition.';

-- ---------------------------------------------------------------------------
-- Auto-create profile on invite accept / first sign-in
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(split_part(new.email, '@', 1)), ''),
      'Family member'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users invited before the trigger existed
insert into public.profiles (id, display_name)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(split_part(u.email, '@', 1)), ''),
    'Family member'
  )
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.weigh_ins enable row level security;
alter table public.exercise_logs enable row level security;

-- Profiles: signed-in family can read everyone; only update own row
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No insert/delete for clients; profile rows come from the auth trigger.

-- Weigh-ins: family can read; each member writes only their own
drop policy if exists "weigh_ins_select_authenticated" on public.weigh_ins;
create policy "weigh_ins_select_authenticated"
  on public.weigh_ins for select
  to authenticated
  using (true);

drop policy if exists "weigh_ins_insert_own" on public.weigh_ins;
create policy "weigh_ins_insert_own"
  on public.weigh_ins for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "weigh_ins_update_own" on public.weigh_ins;
create policy "weigh_ins_update_own"
  on public.weigh_ins for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "weigh_ins_delete_own" on public.weigh_ins;
create policy "weigh_ins_delete_own"
  on public.weigh_ins for delete
  to authenticated
  using (auth.uid() = user_id);

-- Exercise logs: same pattern
drop policy if exists "exercise_logs_select_authenticated" on public.exercise_logs;
create policy "exercise_logs_select_authenticated"
  on public.exercise_logs for select
  to authenticated
  using (true);

drop policy if exists "exercise_logs_insert_own" on public.exercise_logs;
create policy "exercise_logs_insert_own"
  on public.exercise_logs for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "exercise_logs_update_own" on public.exercise_logs;
create policy "exercise_logs_update_own"
  on public.exercise_logs for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "exercise_logs_delete_own" on public.exercise_logs;
create policy "exercise_logs_delete_own"
  on public.exercise_logs for delete
  to authenticated
  using (auth.uid() = user_id);

-- anon role has no policies → no public anonymous read of health data.
