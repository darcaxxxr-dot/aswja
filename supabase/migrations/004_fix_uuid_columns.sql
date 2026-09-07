-- ============================================
-- MIGRATION 004: Fix UUID column type mismatch
-- ============================================
-- App ini menggunakan format ID: PREFIX-UUID, contoh:
--   STU-..., CLS-..., FP-..., ATT-..., SES-...
-- Supabase default uuid tidak menerima format itu.
-- Strategi: drop semua FK & policy, alter tipe kolom, recreate policy.
-- FK tidak di-recreate karena app menggunakan cascade delete di level aplikasi.

-- ============================================
-- 1. DROP ALL FK CONSTRAINTS & POLICIES DULU
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

-- Drop policies
drop policy if exists "schools_select_own" on public.schools;
drop policy if exists "schools_admin_write" on public.schools;
drop policy if exists "academic_years_school_isolation" on public.academic_years;
drop policy if exists "classes_school_isolation" on public.classes;
drop policy if exists "students_school_isolation" on public.students;
drop policy if exists "face_profiles_school_isolation" on public.face_profiles;
drop policy if exists "attendance_sessions_school_isolation" on public.attendance_sessions;
drop policy if exists "attendance_records_school_isolation" on public.attendance_records;

-- ============================================
-- 2. ALTER COLUMN TYPES
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
-- 3. REBUILD RLS POLICIES
-- ============================================
create policy "schools_select_own"
  on public.schools for select to anon, authenticated
  using (id = public.get_user_school() or school_id = public.get_user_school());

create policy "schools_admin_write"
  on public.schools for all to anon, authenticated
  using (id = public.get_user_school() and (public.is_superuser() or public.get_user_role() = 'SUPERUSER'))
  with check (id = public.get_user_school() and (public.is_superuser() or public.get_user_role() = 'SUPERUSER'));

create policy "academic_years_school_isolation"
  on public.academic_years for all to anon, authenticated
  using (school_id = public.get_user_school())
  with check (school_id = public.get_user_school());

create policy "classes_school_isolation"
  on public.classes for all to anon, authenticated
  using (
    school_id = public.get_user_school()
    or academic_year_id in (
      select id from public.academic_years where school_id = public.get_user_school()
    )
  )
  with check (
    school_id = public.get_user_school()
    or academic_year_id in (
      select id from public.academic_years where school_id = public.get_user_school()
    )
  );

create policy "students_school_isolation"
  on public.students for all to anon, authenticated
  using (school_id = public.get_user_school())
  with check (school_id = public.get_user_school());

create policy "face_profiles_school_isolation"
  on public.face_profiles for all to anon, authenticated
  using (
    student_id in (
      select id from public.students where school_id = public.get_user_school()
    )
  )
  with check (
    student_id in (
      select id from public.students where school_id = public.get_user_school()
    )
  );

create policy "attendance_sessions_school_isolation"
  on public.attendance_sessions for all to anon, authenticated
  using (school_id = public.get_user_school())
  with check (school_id = public.get_user_school());

create policy "attendance_records_school_isolation"
  on public.attendance_records for all to anon, authenticated
  using (school_id = public.get_user_school())
  with check (school_id = public.get_user_school());

-- ============================================
-- 4. GRANT permissions
-- ============================================
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- ============================================
-- SELESAI
-- ============================================
