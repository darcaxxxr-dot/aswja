-- ============================================
-- MIGRATION 010: Sync hardening — drop conflicting policies,
-- add sync_version, devices/sync_audit tables, and recreate
-- clean anon/auth RLS policies.
-- ============================================

-- ============================================================
-- 1. Drop existing policies that may conflict with migration 005/009
-- ============================================================
drop policy if exists "schools_select_own_anon" on public.schools;
drop policy if exists "schools_select_own_auth" on public.schools;
drop policy if exists "schools_admin_write_anon" on public.schools;
drop policy if exists "schools_admin_write_auth" on public.schools;
drop policy if exists "anon_academic_years_sync" on public.academic_years;
drop policy if exists "auth_academic_years_school_isolation" on public.academic_years;
drop policy if exists "anon_classes_sync" on public.classes;
drop policy if exists "auth_classes_school_isolation" on public.classes;
drop policy if exists "anon_students_sync" on public.students;
drop policy if exists "auth_students_school_isolation" on public.students;
drop policy if exists "anon_face_profiles_sync" on public.face_profiles;
drop policy if exists "auth_face_profiles_school_isolation" on public.face_profiles;
drop policy if exists "anon_attendance_sessions_sync" on public.attendance_sessions;
drop policy if exists "auth_attendance_sessions_school_isolation" on public.attendance_sessions;
drop policy if exists "anon_attendance_records_sync" on public.attendance_records;
drop policy if exists "auth_attendance_records_school_isolation" on public.attendance_records;
drop policy if exists "anon_users_sync" on public.users;
drop policy if exists "auth_users_school_isolation" on public.users;
drop policy if exists "settings_read_anon" on public.settings;
drop policy if exists "settings_read_auth" on public.settings;
drop policy if exists "settings_admin_write_auth" on public.settings;
drop policy if exists "sync_queue_read_anon" on public.sync_queue;
drop policy if exists "sync_queue_read_auth" on public.sync_queue;
drop policy if exists "sync_queue_admin_write_auth" on public.sync_queue;

-- Also drop legacy policies from migration 005 just in case they still exist
drop policy if exists "schools_select_own" on public.schools;
drop policy if exists "schools_admin_write" on public.schools;
drop policy if exists "academic_years_school_isolation" on public.academic_years;
drop policy if exists "classes_school_isolation" on public.classes;
drop policy if exists "students_school_isolation" on public.students;
drop policy if exists "face_profiles_school_isolation" on public.face_profiles;
drop policy if exists "attendance_sessions_school_isolation" on public.attendance_sessions;
drop policy if exists "attendance_records_school_isolation" on public.attendance_records;
drop policy if exists "users_school_isolation" on public.users;
drop policy if exists "settings_read" on public.settings;
drop policy if exists "settings_admin_write" on public.settings;
drop policy if exists "sync_queue_read" on public.sync_queue;
drop policy if exists "sync_queue_admin_write" on public.sync_queue;

-- ============================================================
-- 2. Add sync_version columns for optimistic concurrency
-- ============================================================
alter table public.schools add column if not exists sync_version bigint not null default 1;
alter table public.academic_years add column if not exists sync_version bigint not null default 1;
alter table public.classes add column if not exists sync_version bigint not null default 1;
alter table public.students add column if not exists sync_version bigint not null default 1;
alter table public.face_profiles add column if not exists sync_version bigint not null default 1;
alter table public.attendance_sessions add column if not exists sync_version bigint not null default 1;
alter table public.attendance_records add column if not exists sync_version bigint not null default 1;
alter table public.users add column if not exists sync_version bigint not null default 1;

-- Indexes to help conflict checks
create index if not exists idx_sync_version_schools on public.schools(sync_version);
create index if not exists idx_sync_version_academic_years on public.academic_years(sync_version);
create index if not exists idx_sync_version_classes on public.classes(sync_version);
create index if not exists idx_sync_version_students on public.students(sync_version);
create index if not exists idx_sync_version_face_profiles on public.face_profiles(sync_version);
create index if not exists idx_sync_version_attendance_sessions on public.attendance_sessions(sync_version);
create index if not exists idx_sync_version_attendance_records on public.attendance_records(sync_version);
create index if not exists idx_sync_version_users on public.users(sync_version);

-- ============================================================
-- 3. Device registry
-- ============================================================
create table if not exists public.devices (
  id text primary key,
  school_id text not null references public.schools(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  last_seen_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_devices_school on public.devices(school_id);
create index if not exists idx_devices_user on public.devices(user_id);

-- ============================================================
-- 4. Sync audit log
-- ============================================================
create table if not exists public.sync_audit (
  id text primary key default gen_random_uuid()::text,
  school_id text not null,
  operation text not null,
  table_name text not null,
  rows_affected integer,
  status text not null,
  error_code text,
  error_message text,
  client_ip text,
  user_agent text,
  created_at timestamptz default now()
);

create index if not exists idx_sync_audit_school on public.sync_audit(school_id);
create index if not exists idx_sync_audit_created on public.sync_audit(created_at);

-- ============================================================
-- 5. Recreate clean RLS policies
-- ============================================================

-- Schools
create policy "schools_select_own_anon"
  on public.schools for select to anon
  using (id is not null and id <> '');

create policy "schools_select_own_auth"
  on public.schools for select to authenticated
  using (id = public.get_user_school()::text);

create policy "schools_admin_write_anon"
  on public.schools for all to anon
  using (id is not null and id <> '')
  with check (id is not null and id <> '');

create policy "schools_admin_write_auth"
  on public.schools for all to authenticated
  using (id = public.get_user_school()::text and public.get_user_role() = 'SUPERUSER')
  with check (id = public.get_user_school()::text and public.get_user_role() = 'SUPERUSER');

-- Academic years
create policy "anon_academic_years_sync"
  on public.academic_years for all to anon
  using (school_id is not null and school_id <> '')
  with check (school_id is not null and school_id <> '');

create policy "auth_academic_years_school_isolation"
  on public.academic_years for all to authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

-- Classes
create policy "anon_classes_sync"
  on public.classes for all to anon
  using (school_id is not null and school_id <> '')
  with check (school_id is not null and school_id <> '');

create policy "auth_classes_school_isolation"
  on public.classes for all to authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

-- Students
create policy "anon_students_sync"
  on public.students for all to anon
  using (school_id is not null and school_id <> '')
  with check (school_id is not null and school_id <> '');

create policy "auth_students_school_isolation"
  on public.students for all to authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

-- Face profiles
create policy "anon_face_profiles_sync"
  on public.face_profiles for all to anon
  using (true)
  with check (true);

create policy "auth_face_profiles_school_isolation"
  on public.face_profiles for all to authenticated
  using (
    student_id in (
      select id from public.students where school_id = public.get_user_school()::text
    )
  )
  with check (
    student_id in (
      select id from public.students where school_id = public.get_user_school()::text
    )
  );

-- Attendance sessions
create policy "anon_attendance_sessions_sync"
  on public.attendance_sessions for all to anon
  using (school_id is not null and school_id <> '')
  with check (school_id is not null and school_id <> '');

create policy "auth_attendance_sessions_school_isolation"
  on public.attendance_sessions for all to authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

-- Attendance records
create policy "anon_attendance_records_sync"
  on public.attendance_records for all to anon
  using (school_id is not null and school_id <> '')
  with check (school_id is not null and school_id <> '');

create policy "auth_attendance_records_school_isolation"
  on public.attendance_records for all to authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

-- Users
create policy "anon_users_sync"
  on public.users for all to anon
  using (school_id is not null and school_id <> '')
  with check (school_id is not null and school_id <> '');

create policy "auth_users_school_isolation"
  on public.users for all to authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

-- Settings
create policy "settings_read_anon"
  on public.settings for select to anon
  using (true);

create policy "settings_read_auth"
  on public.settings for select to authenticated
  using (true);

create policy "settings_admin_write_auth"
  on public.settings for all to authenticated
  using (public.is_superuser() or public.get_user_role() = 'SUPERUSER')
  with check (public.is_superuser() or public.get_user_role() = 'SUPERUSER');

-- Sync queue
create policy "sync_queue_read_anon"
  on public.sync_queue for select to anon
  using (true);

create policy "sync_queue_read_auth"
  on public.sync_queue for select to authenticated
  using (true);

create policy "sync_queue_admin_write_auth"
  on public.sync_queue for all to authenticated
  using (public.is_superuser() or public.get_user_role() = 'SUPERUSER')
  with check (public.is_superuser() or public.get_user_role() = 'SUPERUSER');

-- Devices
create policy "anon_devices_read"
  on public.devices for select to anon
  using (school_id is not null and school_id <> '');

create policy "anon_devices_write"
  on public.devices for all to anon
  using (school_id is not null and school_id <> '')
  with check (school_id is not null and school_id <> '');

create policy "auth_devices_access"
  on public.devices for all to authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

-- Sync audit
create policy "anon_sync_audit_write"
  on public.sync_audit for insert to anon
  with check (school_id is not null and school_id <> '');

create policy "anon_sync_audit_read"
  on public.sync_audit for select to anon
  using (school_id is not null and school_id <> '');

create policy "auth_sync_audit_access"
  on public.sync_audit for all to authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

-- ============================================================
-- SELESAI
-- ============================================================
