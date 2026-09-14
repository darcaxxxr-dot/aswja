-- ============================================
-- MIGRATION 011: School settings sync + face_profiles RLS hardening
-- ============================================
-- 1. school_settings: per-school synced configuration so every device
--    shares one set of attendance times, thresholds, liveness and sound
--    settings ("1 persepsi antar device"). Rows are keyed
--    "{school_id}:{key}". The legacy public.settings table is left
--    untouched (it stays device-local for internal state like sync.*).
-- 2. face_profiles: drop the blanket anon policy (using (true)) — the
--    table holds biometric embeddings and must not be readable/writable
--    by the anon role. Authenticated access stays school-isolated via
--    the existing auth policy (students join).

-- ============================================================
-- 1. school_settings table
-- ============================================================
create table if not exists public.school_settings (
  id text primary key,
  school_id text not null,
  key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  sync_version bigint not null default 1
);

create unique index if not exists idx_school_settings_school_key
  on public.school_settings(school_id, key);
create index if not exists idx_school_settings_updated
  on public.school_settings(updated_at);

alter table public.school_settings enable row level security;

drop policy if exists "anon_school_settings_sync" on public.school_settings;
drop policy if exists "auth_school_settings_sync" on public.school_settings;

create policy "anon_school_settings_sync"
  on public.school_settings for all to anon
  using (school_id is not null and school_id <> '')
  with check (school_id is not null and school_id <> '');

create policy "auth_school_settings_sync"
  on public.school_settings for all to authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

-- ============================================================
-- 2. face_profiles: biometric data requires authentication
-- ============================================================
drop policy if exists "anon_face_profiles_sync" on public.face_profiles;
