-- Family Fit — Supabase schema + RLS
-- Paste into the Supabase SQL editor (Dashboard → SQL → New query).
-- Run once on a fresh project. Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS.
--
-- LIVE ERROR "column profiles.avatar_path does not exist"?
--   Do not re-run this whole file first — paste migrate-avatar-path.sql instead (one-shot).

-- ---------------------------------------------------------------------------
-- Profiles (one row per family member / auth user)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_path text,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Family member display names and optional avatar paths for the competition.';
comment on column public.profiles.avatar_path is 'Object path in the avatars storage bucket, e.g. {user_id}/avatar.webp';

-- Additive migration for projects that ran an older schema.sql
alter table public.profiles add column if not exists avatar_path text;

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
-- Entry encouragement (comments + reactions on weigh-ins / exercise logs)
-- ---------------------------------------------------------------------------
create table if not exists public.entry_comments (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  weigh_in_id uuid references public.weigh_ins (id) on delete cascade,
  exercise_log_id uuid references public.exercise_logs (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entry_comments_one_target check (
    (weigh_in_id is not null and exercise_log_id is null)
    or (weigh_in_id is null and exercise_log_id is not null)
  ),
  constraint entry_comments_body_len check (
    char_length(trim(body)) >= 1
    and char_length(body) <= 280
  )
);

create index if not exists entry_comments_weigh_in_id_idx
  on public.entry_comments (weigh_in_id, created_at)
  where weigh_in_id is not null;

create index if not exists entry_comments_exercise_log_id_idx
  on public.entry_comments (exercise_log_id, created_at)
  where exercise_log_id is not null;

comment on table public.entry_comments is
  'Short encouragement comments on family weigh-ins or exercise logs.';

create table if not exists public.entry_reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  weigh_in_id uuid references public.weigh_ins (id) on delete cascade,
  exercise_log_id uuid references public.exercise_logs (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  constraint entry_reactions_one_target check (
    (weigh_in_id is not null and exercise_log_id is null)
    or (weigh_in_id is null and exercise_log_id is not null)
  ),
  constraint entry_reactions_emoji_allowed check (
    emoji in ('👍', '❤️', '🎉', '💪', '🔥')
  )
);

create unique index if not exists entry_reactions_weigh_unique
  on public.entry_reactions (user_id, emoji, weigh_in_id)
  where weigh_in_id is not null;

create unique index if not exists entry_reactions_exercise_unique
  on public.entry_reactions (user_id, emoji, exercise_log_id)
  where exercise_log_id is not null;

create index if not exists entry_reactions_weigh_in_id_idx
  on public.entry_reactions (weigh_in_id)
  where weigh_in_id is not null;

create index if not exists entry_reactions_exercise_log_id_idx
  on public.entry_reactions (exercise_log_id)
  where exercise_log_id is not null;

comment on table public.entry_reactions is
  'Emoji reactions on family weigh-ins or exercise logs; one row per member, emoji, and entry.';

-- ---------------------------------------------------------------------------
-- Auto-create profile on sign-up / first auth user insert
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

-- Backfill profiles for users created before the trigger existed
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
alter table public.entry_comments enable row level security;
alter table public.entry_reactions enable row level security;

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
  with check (
    auth.uid() = id
    and (
      avatar_path is null
      or avatar_path ~ ('^' || auth.uid()::text || '/avatar\.(webp|jpe?g|png)$')
    )
  );

-- No insert/delete for clients; profile rows come from the auth trigger (sign-up) or the backfill above.

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

-- Entry comments: family can read; each member writes/edits/deletes only their own
drop policy if exists "entry_comments_select_authenticated" on public.entry_comments;
create policy "entry_comments_select_authenticated"
  on public.entry_comments for select
  to authenticated
  using (true);

drop policy if exists "entry_comments_insert_own" on public.entry_comments;
create policy "entry_comments_insert_own"
  on public.entry_comments for insert
  to authenticated
  with check (auth.uid() = author_id);

drop policy if exists "entry_comments_update_own" on public.entry_comments;
create policy "entry_comments_update_own"
  on public.entry_comments for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

drop policy if exists "entry_comments_delete_own" on public.entry_comments;
create policy "entry_comments_delete_own"
  on public.entry_comments for delete
  to authenticated
  using (auth.uid() = author_id);

-- Entry reactions: family can read; each member adds/removes only their own (no impersonation)
drop policy if exists "entry_reactions_select_authenticated" on public.entry_reactions;
create policy "entry_reactions_select_authenticated"
  on public.entry_reactions for select
  to authenticated
  using (true);

drop policy if exists "entry_reactions_insert_own" on public.entry_reactions;
create policy "entry_reactions_insert_own"
  on public.entry_reactions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "entry_reactions_delete_own" on public.entry_reactions;
create policy "entry_reactions_delete_own"
  on public.entry_reactions for delete
  to authenticated
  using (auth.uid() = user_id);

-- anon role has no policies → no public anonymous read of health data.

-- ---------------------------------------------------------------------------
-- Avatars (Supabase Storage)
-- Captain: create bucket "avatars" in Dashboard → Storage if this INSERT fails.
-- Private bucket; signed-in family reads via storage RLS + createSignedUrl in the app.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  524288,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_select_authenticated" on storage.objects;
create policy "avatars_select_authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
