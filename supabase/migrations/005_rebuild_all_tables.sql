-- ============================================
-- MIGRATION 005: Rebuild all tables from scratch
-- ============================================
-- Semua ID di app ini menggunakan format PREFIX-UUID (text).
-- Migrasi ini drop dan recreate semua tabel dengan schema yang benar.

-- ============================================
-- 1. DROP ALL TABLES ( cascade untuk bersihkan FK/Policy/Index )
-- ============================================
drop table if exists public.sync_queue cascade;
drop table if exists public.attendance_records cascade;
drop table if exists public.attendance_sessions cascade;
drop table if exists public.face_profiles cascade;
drop table if exists public.students cascade;
drop table if exists public.classes cascade;
drop table if exists public.academic_years cascade;
drop table if exists public.users cascade;
drop table if exists public.settings cascade;
drop table if exists public.schools cascade;

-- ============================================
-- 2. CREATE TABLES
-- ============================================

-- Schools
create table public.schools (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Academic Years
create table public.academic_years (
  id text primary key,
  school_id text not null references public.schools(id) on delete cascade,
  name text not null,
  start_date text not null,
  end_date text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Classes
create table public.classes (
  id text primary key,
  school_id text not null references public.schools(id) on delete cascade,
  academic_year_id text references public.academic_years(id) on delete set null,
  grade text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Students
create table public.students (
  id text primary key,
  school_id text not null references public.schools(id) on delete cascade,
  nis text not null,
  nisn text,
  name text not null,
  gender text not null,
  class_id text references public.classes(id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Face Profiles
create table public.face_profiles (
  id text primary key,
  student_id text not null references public.students(id) on delete cascade,
  embedding jsonb not null,
  model_version text not null,
  quality_score numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Attendance Sessions
create table public.attendance_sessions (
  id text primary key,
  school_id text not null references public.schools(id) on delete cascade,
  class_id text not null references public.classes(id) on delete cascade,
  date text not null,
  start_time timestamptz not null default now(),
  end_time timestamptz,
  status text not null default 'open',
  session_type text not null default 'CLASS',
  prayer_name text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Attendance Records
create table public.attendance_records (
  id text primary key,
  school_id text not null references public.schools(id) on delete cascade,
  session_id text not null references public.attendance_sessions(id) on delete cascade,
  student_id text not null references public.students(id) on delete cascade,
  timestamp timestamptz not null default now(),
  status text not null,
  confidence numeric not null default 0,
  device_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Users
create table public.users (
  id text primary key,
  school_id text not null references public.schools(id) on delete cascade,
  name text not null,
  username text not null,
  password_hash text not null,
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Settings
create table public.settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Sync Queue
create table public.sync_queue (
  id text primary key,
  entity text not null,
  operation text not null,
  record_id text not null,
  status text not null default 'pending',
  retry_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  synced_at timestamptz
);

-- ============================================
-- 3. INDEXES
-- ============================================
create index idx_academic_years_school on public.academic_years(school_id);
create index idx_classes_school on public.classes(school_id);
create index idx_students_school on public.students(school_id);
create index idx_students_class on public.students(class_id);
create index idx_face_profiles_student on public.face_profiles(student_id);
create index idx_sessions_school_class_date on public.attendance_sessions(school_id, class_id, date);
create index idx_records_session on public.attendance_records(session_id);
create index idx_records_student on public.attendance_records(student_id);
create index idx_users_school on public.users(school_id);
create index idx_sync_queue_status on public.sync_queue(status);

-- ============================================
-- 4. RLS POLICIES
-- ============================================
-- Catatan: public.get_user_school() me-return uuid, jadi harus di-cast ke text.
-- public.get_user_role() & is_superuser() return text/boolean (aman).

create policy "schools_select_own"
  on public.schools for select to anon, authenticated
  using (id = public.get_user_school()::text);

create policy "schools_admin_write"
  on public.schools for all to anon, authenticated
  using (id = public.get_user_school()::text and (public.is_superuser() or public.get_user_role() = 'SUPERUSER'))
  with check (id = public.get_user_school()::text and (public.is_superuser() or public.get_user_role() = 'SUPERUSER'));

create policy "academic_years_school_isolation"
  on public.academic_years for all to anon, authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

create policy "classes_school_isolation"
  on public.classes for all to anon, authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

create policy "students_school_isolation"
  on public.students for all to anon, authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

create policy "face_profiles_school_isolation"
  on public.face_profiles for all to anon, authenticated
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

create policy "attendance_sessions_school_isolation"
  on public.attendance_sessions for all to anon, authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

create policy "attendance_records_school_isolation"
  on public.attendance_records for all to anon, authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

create policy "users_school_isolation"
  on public.users for all to anon, authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

-- Settings: read-only untuk sync, write hanya untuk admin
create policy "settings_read"
  on public.settings for select to anon, authenticated
  using (true);

create policy "settings_admin_write"
  on public.settings for all to anon, authenticated
  using (public.is_superuser() or public.get_user_role() = 'SUPERUSER')
  with check (public.is_superuser() or public.get_user_role() = 'SUPERUSER');

-- Sync Queue: read-only, write hanya untuk admin
create policy "sync_queue_read"
  on public.sync_queue for select to anon, authenticated
  using (true);

create policy "sync_queue_admin_write"
  on public.sync_queue for all to anon, authenticated
  using (public.is_superuser() or public.get_user_role() = 'SUPERUSER')
  with check (public.is_superuser() or public.get_user_role() = 'SUPERUSER');

-- ============================================
-- 5. GRANT permissions
-- ============================================
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- ============================================
-- SELESAI
-- ============================================
