-- ============================================
-- MIGRATION 001: Auth profiles + RLS policies
-- ============================================
-- Jalankan file ini di Supabase SQL Editor.
-- Idempotent: bisa dijalankan berulang tanpa efek samping.

-- ============================================
-- 1. PROFILES TABLE (linked ke auth.users)
-- ============================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid references public.schools(id) on delete set null,
  display_name text not null,
  role text not null default 'TEACHER' check (role in ('ADMIN', 'TEACHER')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_profiles_school on public.profiles(school_id);
create index if not exists idx_profiles_role on public.profiles(role);

-- Trigger: auto-create profile saat user sign up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'TEACHER')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================
-- 2. DROP OLD "anon all" POLICIES
-- ============================================
drop policy if exists "anon_all_schools" on public.schools;
drop policy if exists "anon_all_academic_years" on public.academic_years;
drop policy if exists "anon_all_classes" on public.classes;
drop policy if exists "anon_all_students" on public.students;
drop policy if exists "anon_all_face_profiles" on public.face_profiles;
drop policy if exists "anon_all_sessions" on public.attendance_sessions;
drop policy if exists "anon_all_records" on public.attendance_records;
drop policy if exists "anon_all_settings" on public.settings;
drop policy if exists "anon_all_sync_logs" on public.sync_logs;

-- ============================================
-- 3. ENABLE RLS (jika belum)
-- ============================================
alter table public.schools enable row level security;
alter table public.academic_years enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.face_profiles enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.settings enable row level security;
alter table public.sync_logs enable row level security;
alter table public.profiles enable row level security;

-- ============================================
-- 4. PROFILES POLICIES
-- ============================================
drop policy if exists "profiles_select_own_or_same_school" on public.profiles;
create policy "profiles_select_own_or_same_school"
  on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or school_id = (select school_id from public.profiles where id = auth.uid())
  );

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "profiles_admin_insert" on public.profiles;
create policy "profiles_admin_insert"
  on public.profiles
  for insert
  to authenticated
  with check (
    (select role from public.profiles where id = auth.uid()) = 'ADMIN'
    or id = auth.uid()  -- self insert allowed
  );

drop policy if exists "profiles_admin_delete" on public.profiles;
create policy "profiles_admin_delete"
  on public.profiles
  for delete
  to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'ADMIN');

-- ============================================
-- 5. HELPER: get_user_school()
-- ============================================
create or replace function public.get_user_school()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select school_id from public.profiles where id = auth.uid();
$$;

create or replace function public.get_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ============================================
-- 6. SCHOOL-ISOLATED POLICIES (per table)
-- ============================================
-- Prinsip: user hanya bisa akses data school mereka sendiri
-- (kecuali profiles yang boleh lihat satu sama lain dalam school sama)

-- Schools: read-only untuk authenticated users, hanya school sendiri
drop policy if exists "schools_select_own" on public.schools;
create policy "schools_select_own"
  on public.schools for select to authenticated
  using (id = public.get_user_school());

drop policy if exists "schools_admin_write" on public.schools;
create policy "schools_admin_write"
  on public.schools for all to authenticated
  using (id = public.get_user_school() and public.get_user_role() = 'ADMIN')
  with check (id = public.get_user_school() and public.get_user_role() = 'ADMIN');

-- Academic years
drop policy if exists "ay_school_isolation" on public.academic_years;
create policy "ay_school_isolation"
  on public.academic_years for all to authenticated
  using (school_id = public.get_user_school())
  with check (school_id = public.get_user_school());

-- Classes
drop policy if exists "classes_school_isolation" on public.classes;
create policy "classes_school_isolation"
  on public.classes for all to authenticated
  using (school_id = public.get_user_school())
  with check (school_id = public.get_user_school());

-- Students
drop policy if exists "students_school_isolation" on public.students;
create policy "students_school_isolation"
  on public.students for all to authenticated
  using (school_id = public.get_user_school())
  with check (school_id = public.get_user_school());

-- Face profiles
drop policy if exists "face_profiles_school_isolation" on public.face_profiles;
create policy "face_profiles_school_isolation"
  on public.face_profiles for all to authenticated
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

-- Attendance sessions
drop policy if exists "sessions_school_isolation" on public.attendance_sessions;
create policy "sessions_school_isolation"
  on public.attendance_sessions for all to authenticated
  using (school_id = public.get_user_school())
  with check (school_id = public.get_user_school());

-- Attendance records
drop policy if exists "records_school_isolation" on public.attendance_records;
create policy "records_school_isolation"
  on public.attendance_records for all to authenticated
  using (school_id = public.get_user_school())
  with check (school_id = public.get_user_school());

-- Settings
drop policy if exists "settings_school_isolation" on public.settings;
create policy "settings_school_isolation"
  on public.settings for all to authenticated
  using (school_id = public.get_user_school())
  with check (school_id = public.get_user_school());

-- Sync logs
drop policy if exists "sync_logs_school_isolation" on public.sync_logs;
create policy "sync_logs_school_isolation"
  on public.sync_logs for all to authenticated
  using (school_id = public.get_user_school())
  with check (school_id = public.get_user_school());

-- ============================================
-- 7. GRANT untuk authenticated role
-- ============================================
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- ============================================
-- SELESAI
-- ============================================
-- Setelah migration ini dijalankan, anon key tidak bisa akses data lagi.
-- Hanya user login (authenticated) yang punya akses, dan terisolasi per school.
