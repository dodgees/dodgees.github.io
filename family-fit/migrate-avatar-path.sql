-- Family Fit — ONE-SHOT fix when the live app says:
--   column profiles.avatar_path does not exist
--
-- Captain: Supabase Dashboard → SQL → New query → paste this entire file → Run.
-- Safe to re-run. Does not require re-running the full schema.sql.
-- Full schema (new projects): schema.sql

-- 1) Column
alter table public.profiles add column if not exists avatar_path text;
comment on column public.profiles.avatar_path is
  'Object path in the avatars storage bucket, e.g. {user_id}/avatar.webp';

-- 2) Own-row update policy must allow avatar_path (own folder only)
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

-- 3) Private avatars bucket + storage RLS
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
