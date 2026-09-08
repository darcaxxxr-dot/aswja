-- ============================================
-- MIGRATION 004: Fix UUID column type mismatch AND apply full RLS policies
-- ============================================
-- This migration fixes the text/uuid type inconsistency from minimal migration 003
-- and applies the full RLS policies with proper ::text casts.
--
-- Strategy:
-- 1. Drop all FK constraints and policies to allow type changes
-- 2. Change all ID columns from uuid to text for consistency with prefix-uuid IDs
-- 3. Backfill academic_year_id for existing classes
-- 4. Recreate RLS policies with ::text casts since get_user_school() returns uuid
-- 5. Grant permissions (FK constraints are NOT recreated as app handles cascade)

-- ============================================
-- 1. DROP ALL FK CONSTRAINTS & POLICIES
-- ============================================

-- Schools
alter table public.schools drop constraint if exists "schools_school_id_fkey";

-- Academic Years
alter table public.academic_years drop constraint if exists "academic_years_school_id_fkey";

-- Classes
alter table public.classes drop constraint if exists "classes_school_id_fkey";
alter table public.classes drop constraint if exists "classes_academic_year_id_fkey";

-- Students
alter table public.students drop constraint if exists "students_school_id_fkey";
alter table public.students drop constraint if exists "students_class_id_fkey";

-- Face Profiles
alter table public.face_profiles drop constraint if exists "face_profiles_student_id_fkey";

-- Attendance Sessions
alter table public.attendance_sessions drop constraint if exists "attendance_sessions_school_id_fkey";
alter table public.attendance_sessions drop constraint if exists "attendance_sessions_class_id_fkey";

-- Attendance Records
alter table public.attendance_records drop constraint if exists "attendance_records_school_id_fkey";
alter table public.attendance_records drop constraint if exists "attendance_records_session_id_fkey";
alter table public.attendance_records drop constraint if exists "attendance_records_student_id_fkey";

-- Users (table may not exist yet)
do $$
begin
   if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'users') then
      alter table public.users drop constraint if exists "users_school_id_fkey";
   end if;
end$$;

-- Drop policies for all tables we will alter
drop policy if exists "schools_select_own" on public.schools;
drop policy if exists "schools_admin_write" on public.schools;
drop policy if exists "academic_years_school_isolation" on public.academic_years;
drop policy if exists "classes_school_isolation" on public.classes;
drop policy if exists "students_school_isolation" on public.students;
drop policy if exists "face_profiles_school_isolation" on public.face_profiles;
drop policy if exists "attendance_sessions_school_isolation" on public.attendance_sessions;
drop policy if exists "attendance_records_school_isolation" on public.attendance_records;
drop policy if exists "users_school_isolation" on public.users;
drop policy if exists "profiles_select_own_or_same_school" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_admin_insert" on public.profiles;
drop policy if exists "profiles_admin_delete" on public.profiles;
drop policy if exists "settings_read" on public.settings;
drop policy if exists "settings_admin_write" on public.settings;

-- Conditional policy drops for tables that may not exist
do $$
begin
   if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'sync_logs') then
      drop policy if exists "sync_logs_school_isolation" on public.sync_logs;
   end if;
end$$;

do $$
begin
   if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'sync_queue') then
      drop policy if exists "sync_queue_read" on public.sync_queue;
      drop policy if exists "sync_queue_admin_write" on public.sync_queue;
   end if;
end$$;

-- ============================================
-- 2. ALTER COLUMN TYPES FROM UUID TO TEXT
-- ============================================

alter table public.schools alter column id type text using id::text;
alter table public.schools alter column school_id type text using school_id::text;

alter table public.academic_years alter column id type text using id::text;
alter table public.academic_years alter column school_id type text using school_id::text;

alter table public.classes alter column id type text using id::text;
alter table public.classes alter column school_id type text using school_id::text;
alter table public.classes alter column academic_year_id type text using academic_year_id::text;

alter table public.students alter column id type text using id::text;
alter table public.students alter column school_id type text using school_id::text;
alter table public.students alter column class_id type text using class_id::text;

alter table public.face_profiles alter column id type text using id::text;
alter table public.face_profiles alter column student_id type text using student_id::text;

alter table public.attendance_sessions alter column id type text using id::text;
alter table public.attendance_sessions alter column school_id type text using school_id::text;
alter table public.attendance_sessions alter column class_id type text using class_id::text;

alter table public.attendance_records alter column id type text using id::text;
alter table public.attendance_records alter column school_id type text using school_id::text;
alter table public.attendance_records alter column session_id type text using session_id::text;
alter table public.attendance_records alter column student_id type text using student_id::text;

-- Users (table may not exist yet)
do $$
begin
   if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'users') then
      alter table public.users alter column id type text using id::text;
      alter table public.users alter column school_id type text using school_id::text;
   end if;
end$$;

-- ============================================
-- 3. BACKFILL academic_year_id FOR EXISTING CLASSES
-- ============================================

-- Populate academic_year_id from academic_years table based on school_id
update public.classes 
set academic_year_id = (
  select id 
  from public.academic_years 
  where school_id = classes.school_id 
  limit 1
) 
where academic_year_id is null;

-- ============================================
-- 4. ENABLE RLS FOR ALL SYNC TABLES
-- ============================================

alter table public.schools enable row level security;
alter table public.academic_years enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.face_profiles enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.sync_logs enable row level security;
alter table public.sync_queue enable row level security;

-- Users (table may not exist yet)
do $$
begin
   if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'users') then
      alter table public.users enable row level security;
   end if;
end$$;

-- ============================================
-- 5. RECREATE RLS POLICIES WITH ::text CASTS
-- ============================================
-- Note: get_user_school() returns uuid, so we cast to text for comparison

-- Schools policies
create policy "schools_select_own"
  on public.schools for select to anon, authenticated
  using (id = public.get_user_school()::text or school_id = public.get_user_school()::text);

create policy "schools_admin_write"
  on public.schools for all to anon, authenticated
  using (id = public.get_user_school()::text and (public.is_superuser() or public.get_user_role() = 'SUPERUSER'))
  with check (id = public.get_user_school()::text and (public.is_superuser() or public.get_user_role() = 'SUPERUSER'));

-- Academic Years policies
create policy "academic_years_school_isolation"
  on public.academic_years for all to anon, authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

-- Classes policies
create policy "classes_school_isolation"
  on public.classes for all to anon, authenticated
  using (school_id = public.get_user_school()::text or academic_year_id in (
    select id from public.academic_years where school_id = public.get_user_school()::text
  ))
  with check (school_id = public.get_user_school()::text or academic_year_id in (
    select id from public.academic_years where school_id = public.get_user_school()::text
  ));

-- Students policies
create policy "students_school_isolation"
  on public.students for all to anon, authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

-- Face Profiles policies
create policy "face_profiles_school_isolation"
  on public.face_profiles for all to anon, authenticated
  using (student_id in (
    select id from public.students where school_id = public.get_user_school()::text
  ))
  with check (student_id in (
    select id from public.students where school_id = public.get_user_school()::text
  ));

-- Attendance Sessions policies
create policy "attendance_sessions_school_isolation"
  on public.attendance_sessions for all to anon, authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

-- Attendance Records policies
create policy "attendance_records_school_isolation"
  on public.attendance_records for all to anon, authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

-- Users policies
create policy "users_school_isolation"
  on public.users for all to anon, authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

-- Profiles policies
-- Note: profiles.id and profiles.school_id are uuid (NOT altered by this migration)
create policy "profiles_select_own_or_same_school"
  on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or school_id = (select school_id from public.profiles where id = auth.uid())
  );

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_admin_insert"
  on public.profiles
  for insert
  to authenticated
  with check (
    (select role from public.profiles where id = auth.uid()) = 'ADMIN'
    or id = auth.uid()
  );

create policy "profiles_admin_delete"
  on public.profiles
  for delete
  to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'ADMIN');

-- Settings policies
create policy "settings_read"
  on public.settings for select to anon, authenticated
  using (true);

create policy "settings_admin_write"
  on public.settings for all to anon, authenticated
  using (public.is_superuser() or public.get_user_role() = 'SUPERUSER')
  with check (public.is_superuser() or public.get_user_role() = 'SUPERUSER');

-- Sync Logs policies (table may not exist)
do $$
begin
   if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'sync_logs') then
      drop policy if exists "sync_logs_school_isolation" on public.sync_logs;
      create policy "sync_logs_school_isolation"
        on public.sync_logs for all to anon, authenticated
        using (school_id = public.get_user_school()::text)
        with check (school_id = public.get_user_school()::text);
   end if;
end$$;

-- Sync Queue policies (table may not exist)
do $$
begin
   if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'sync_queue') then
      drop policy if exists "sync_queue_read" on public.sync_queue;
      create policy "sync_queue_read"
        on public.sync_queue for select to anon, authenticated
        using (true);
      
      drop policy if exists "sync_queue_admin_write" on public.sync_queue;
      create policy "sync_queue_admin_write"
        on public.sync_queue for all to anon, authenticated
        using (public.is_superuser() or public.get_user_role() = 'SUPERUSER')
        with check (public.is_superuser() or public.get_user_role() = 'SUPERUSER');
   end if;
end$$;

-- ============================================
-- 6. GRANT permissions
-- ============================================
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;