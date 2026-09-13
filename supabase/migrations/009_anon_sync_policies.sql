-- ============================================
-- MIGRATION 009: Allow anon sync writes
-- ============================================
-- Karena aplikasi ini PWA local-first dan sering menggunakan
-- anon key untuk sinkronisasi, kita perlu policy khusus untuk
-- role anon yang mengizinkan insert/update/delete selama
-- school_id terisi (bukan NULL/kosong).
-- Policy existing untuk authenticated tetap unchanged.

-- ============================================================
-- 1. Drop existing policies that apply to anon (from migration 005)
-- ============================================================
-- Migration 005 created policies with "to anon, authenticated"
-- We need to drop those and recreate with separate anon/authenticated policies

drop policy if exists "schools_select_own" on public.schools;
drop policy if exists "schools_admin_write" on public.schools;
drop policy if exists "academic_years_school_isolation" on public.academic_years;
drop policy if exists "classes_school_isolation" on public.classes;
drop policy if exists "students_school_isolation" on public.students;
drop policy if exists "face_profiles_school_isolation" on public.face_profiles;
drop policy if exists "attendance_sessions_school_isolation" on public.attendance_sessions;
drop policy if exists "attendance_records_school_isolation" on public.attendance_records;
drop policy if exists "users_school_isolation" on public.users;

-- ============================================================
-- 2. Schools: separate policies for anon and authenticated
-- ============================================================
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

-- ============================================================
-- 3. Academic years: separate policies for anon and authenticated
-- ============================================================
create policy "anon_academic_years_sync"
  on public.academic_years for all to anon
  using (school_id is not null and school_id <> '')
  with check (school_id is not null and school_id <> '');

create policy "auth_academic_years_school_isolation"
  on public.academic_years for all to authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

-- ============================================================
-- 4. Classes: separate policies for anon and authenticated
-- ============================================================
create policy "anon_classes_sync"
  on public.classes for all to anon
  using (school_id is not null and school_id <> '')
  with check (school_id is not null and school_id <> '');

create policy "auth_classes_school_isolation"
  on public.classes for all to authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

-- ============================================================
-- 5. Students: separate policies for anon and authenticated
-- ============================================================
create policy "anon_students_sync"
  on public.students for all to anon
  using (school_id is not null and school_id <> '')
  with check (school_id is not null and school_id <> '');

create policy "auth_students_school_isolation"
  on public.students for all to authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

-- ============================================================
-- 6. Face profiles: separate policies for anon and authenticated
-- ============================================================
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

-- ============================================================
-- 7. Attendance sessions: separate policies for anon and authenticated
-- ============================================================
create policy "anon_attendance_sessions_sync"
  on public.attendance_sessions for all to anon
  using (school_id is not null and school_id <> '')
  with check (school_id is not null and school_id <> '');

create policy "auth_attendance_sessions_school_isolation"
  on public.attendance_sessions for all to authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

-- ============================================================
-- 8. Attendance records: separate policies for anon and authenticated
-- ============================================================
create policy "anon_attendance_records_sync"
  on public.attendance_records for all to anon
  using (school_id is not null and school_id <> '')
  with check (school_id is not null and school_id <> '');

create policy "auth_attendance_records_school_isolation"
  on public.attendance_records for all to authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

-- ============================================================
-- 9. Users: separate policies for anon and authenticated
-- ============================================================
create policy "anon_users_sync"
  on public.users for all to anon
  using (school_id is not null and school_id <> '')
  with check (school_id is not null and school_id <> '');

create policy "auth_users_school_isolation"
  on public.users for all to authenticated
  using (school_id = public.get_user_school()::text)
  with check (school_id = public.get_user_school()::text);

-- ============================================================
-- 10. Settings and sync_queue: allow anon for sync
-- ============================================================
drop policy if exists "settings_read" on public.settings;
drop policy if exists "settings_admin_write" on public.settings;
drop policy if exists "sync_queue_read" on public.sync_queue;
drop policy if exists "sync_queue_admin_write" on public.sync_queue;

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

-- ============================================================
-- SELESAI
-- ============================================================
-- Catatan: policy ini hanya membuka akses untuk anon key.
-- Isolasi antar school tetap dipegang oleh aplikasi melalui
-- filter school_id di setiap query, bukan oleh RLS untuk anon.
-- Untuk user yang login via Supabase Auth, policy authenticated
-- tetap mengecek public.get_user_school().