-- ============================================
-- MIGRATION 003: Fix sync column mismatches
-- ============================================
-- Jalankan file ini di Supabase SQL Editor.
-- Menambahkan kolom yang hilang agar sync berfungsi.

-- ============================================
-- 1. TAMBAH academicYearId KE classes TABLE
-- ============================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'classes' and column_name = 'academic_year_id'
  ) then
    alter table public.classes add column academic_year_id uuid;
  end if;
end$$;

create index if not exists idx_classes_academic_year on public.classes(academic_year_id);

-- ============================================
-- 2. TAMBAH school_id KE schools TABLE
-- ============================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'schools' and column_name = 'school_id'
  ) then
    alter table public.schools add column school_id uuid references public.schools(id) on delete set null;
  end if;
end$$;

create index if not exists idx_schools_parent on public.schools(school_id);

-- ============================================
-- 3. TAMBAH session_type & prayer_name KE attendance_sessions TABLE
-- ============================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'attendance_sessions' and column_name = 'session_type'
  ) then
    alter table public.attendance_sessions add column session_type text not null default 'CLASS';
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'attendance_sessions' and column_name = 'prayer_name'
  ) then
    alter table public.attendance_sessions add column prayer_name text;
  end if;
end$$;

create index if not exists idx_attendance_sessions_session_type on public.attendance_sessions(session_type);

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

-- ============================================
-- 4. RLS POLICIES - ALLOW anon + authenticated FOR SYNC
-- ============================================
-- Schools
drop policy if exists "schools_select_own" on public.schools;
create policy "schools_select_own"
  on public.schools for select to anon, authenticated
  using (id = public.get_user_school() or school_id = public.get_user_school());

drop policy if exists "schools_admin_write" on public.schools;
create policy "schools_admin_write"
  on public.schools for all to anon, authenticated
  using (id = public.get_user_school() and (public.is_superuser() or public.get_user_role() = 'SUPERUSER'))
  with check (id = public.get_user_school() and (public.is_superuser() or public.get_user_role() = 'SUPERUSER'));

-- Academic Years
drop policy if exists "academic_years_school_isolation" on public.academic_years;
create policy "academic_years_school_isolation"
  on public.academic_years for all to anon, authenticated
  using (school_id = public.get_user_school())
  with check (school_id = public.get_user_school());

-- Classes
drop policy if exists "classes_school_isolation" on public.classes;
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

-- Students
drop policy if exists "students_school_isolation" on public.students;
create policy "students_school_isolation"
  on public.students for all to anon, authenticated
  using (school_id = public.get_user_school())
  with check (school_id = public.get_user_school());

-- Face Profiles
drop policy if exists "face_profiles_school_isolation" on public.face_profiles;
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

-- Attendance Sessions
drop policy if exists "attendance_sessions_school_isolation" on public.attendance_sessions;
create policy "attendance_sessions_school_isolation"
  on public.attendance_sessions for all to anon, authenticated
  using (school_id = public.get_user_school())
  with check (school_id = public.get_user_school());

-- Attendance Records
drop policy if exists "attendance_records_school_isolation" on public.attendance_records;
create policy "attendance_records_school_isolation"
  on public.attendance_records for all to anon, authenticated
  using (school_id = public.get_user_school())
  with check (school_id = public.get_user_school());

-- ============================================
-- 5. SETUP default school_id untuk existing data
-- ============================================
update public.schools set school_id = id where school_id is null;
update public.classes set academic_year_id = (select id from public.academic_years where school_id = public.get_user_school() limit 1) where academic_year_id is null;

-- ============================================
-- 6. GRANT permissions ke anon + authenticated
-- ============================================
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- ============================================
-- SELESAI
-- ============================================