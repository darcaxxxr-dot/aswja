-- ============================================
-- FIX SUPABASE DATABASE - Run in Supabase SQL Editor
-- ============================================

-- 1. Apply migration 010: Add sync_version columns and fix RLS
-- Drop conflicting policies
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

-- Add sync_version columns
alter table public.schools add column if not exists sync_version bigint not null default 1;
alter table public.academic_years add column if not exists sync_version bigint not null default 1;
alter table public.classes add column if not exists sync_version bigint not null default 1;
alter table public.students add column if not exists sync_version bigint not null default 1;
alter table public.face_profiles add column if not exists sync_version bigint not null default 1;
alter table public.attendance_sessions add column if not exists sync_version bigint not null default 1;
alter table public.attendance_records add column if not exists sync_version bigint not null default 1;
alter table public.users add column if not exists sync_version bigint not null default 1;

-- Indexes for sync_version
create index if not exists idx_sync_version_schools on public.schools(sync_version);
create index if not exists idx_sync_version_academic_years on public.academic_years(sync_version);
create index if not exists idx_sync_version_classes on public.classes(sync_version);
create index if not exists idx_sync_version_students on public.students(sync_version);
create index if not exists idx_sync_version_face_profiles on public.face_profiles(sync_version);
create index if not exists idx_sync_version_attendance_sessions on public.attendance_sessions(sync_version);
create index if not exists idx_sync_version_attendance_records on public.attendance_records(sync_version);
create index if not exists idx_sync_version_users on public.users(sync_version);

-- 2. Create missing academic year (a7dd7115-9ea9-4d2e-b69c-d4972d138410)
insert into public.academic_years (id, school_id, name, start_date, end_date, is_active, sync_version)
values ('a7dd7115-9ea9-4d2e-b69c-d4972d138410', 'bd04346f-0720-4e48-b81f-eab290ed7765', '2026/2027', '2026-07-01', '2027-06-30', false, 1)
on conflict (id) do update set
  school_id = excluded.school_id,
  name = excluded.name,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  is_active = excluded.is_active,
  sync_version = academic_years.sync_version + 1;

-- 3. Create academic year for 2027/2028 (5089b4fb-a8d0-4853-85d8-cd2363b657b2)
insert into public.academic_years (id, school_id, name, start_date, end_date, is_active, sync_version)
values ('5089b4fb-a8d0-4853-85d8-cd2363b657b2', 'bd04346f-0720-4e48-b81f-eab290ed7765', '2027/2028', '2027-07-01', '2028-06-30', false, 1)
on conflict (id) do update set
  school_id = excluded.school_id,
  name = excluded.name,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  is_active = excluded.is_active,
  sync_version = academic_years.sync_version + 1;

-- 4. Recreate clean RLS policies
-- Schools
create policy "schools_select_own_anon" on public.schools for select to anon using (id is not null and id <> '');
create policy "schools_select_own_auth" on public.schools for select to authenticated using (id = public.get_user_school()::text);
create policy "schools_admin_write_anon" on public.schools for all to anon using (id is not null and id <> '') with check (id is not null and id <> '');
create policy "schools_admin_write_auth" on public.schools for all to authenticated using (id = public.get_user_school()::text and public.get_user_role() = 'SUPERUSER') with check (id = public.get_user_school()::text and public.get_user_role() = 'SUPERUSER');

-- Academic years
create policy "anon_academic_years_sync" on public.academic_years for all to anon using (school_id is not null and school_id <> '') with check (school_id is not null and school_id <> '');
create policy "auth_academic_years_school_isolation" on public.academic_years for all to authenticated using (school_id = public.get_user_school()::text) with check (school_id = public.get_user_school()::text);

-- Classes
create policy "anon_classes_sync" on public.classes for all to anon using (school_id is not null and school_id <> '') with check (school_id is not null and school_id <> '');
create policy "auth_classes_school_isolation" on public.classes for all to authenticated using (school_id = public.get_user_school()::text) with check (school_id = public.get_user_school()::text);

-- Students
create policy "anon_students_sync" on public.students for all to anon using (school_id is not null and school_id <> '') with check (school_id is not null and school_id <> '');
create policy "auth_students_school_isolation" on public.students for all to authenticated using (school_id = public.get_user_school()::text) with check (school_id = public.get_user_school()::text);

-- Face profiles
create policy "anon_face_profiles_sync" on public.face_profiles for all to anon using (true) with check (true);
create policy "auth_face_profiles_school_isolation" on public.face_profiles for all to authenticated using (
  student_id in (select id from public.students where school_id = public.get_user_school()::text)
) with check (
  student_id in (select id from public.students where school_id = public.get_user_school()::text)
);

-- Attendance sessions
create policy "anon_attendance_sessions_sync" on public.attendance_sessions for all to anon using (school_id is not null and school_id <> '') with check (school_id is not null and school_id <> '');
create policy "auth_attendance_sessions_school_isolation" on public.attendance_sessions for all to authenticated using (school_id = public.get_user_school()::text) with check (school_id = public.get_user_school()::text);

-- Attendance records
create policy "anon_attendance_records_sync" on public.attendance_records for all to anon using (school_id is not null and school_id <> '') with check (school_id is not null and school_id <> '');
create policy "auth_attendance_records_school_isolation" on public.attendance_records for all to authenticated using (school_id = public.get_user_school()::text) with check (school_id = public.get_user_school()::text);

-- Users
create policy "anon_users_sync" on public.users for all to anon using (school_id is not null and school_id <> '') with check (school_id is not null and school_id <> '');
create policy "auth_users_school_isolation" on public.users for all to authenticated using (school_id = public.get_user_school()::text) with check (school_id = public.get_user_school()::text);

-- Settings
create policy "settings_read_anon" on public.settings for select to anon using (true);
create policy "settings_read_auth" on public.settings for select to authenticated using (true);
create policy "settings_admin_write_auth" on public.settings for all to authenticated using (public.is_superuser() or public.get_user_role() = 'SUPERUSER') with check (public.is_superuser() or public.get_user_role() = 'SUPERUSER');

-- Sync queue
create policy "sync_queue_read_anon" on public.sync_queue for select to anon using (true);
create policy "sync_queue_read_auth" on public.sync_queue for select to authenticated using (true);
create policy "sync_queue_admin_write_auth" on public.sync_queue for all to authenticated using (public.is_superuser() or public.get_user_role() = 'SUPERUSER') with check (public.is_superuser() or public.get_user_role() = 'SUPERUSER');
