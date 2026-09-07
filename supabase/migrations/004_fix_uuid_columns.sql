-- ============================================
-- MIGRATION 004: Fix UUID column type mismatch
-- ============================================
-- App ini menggunakan format ID: PREFIX-UUID, contoh:
--   STU-..., CLS-..., FP-..., ATT-..., SES-...
-- Supabase default uuid tidak menerima format itu.
-- Ubah kolom ID jadi text agar sync berfungsi.

-- ============================================
-- 1. schools
-- ============================================
alter table public.schools alter column id type text using id::text;

-- ============================================
-- 2. academic_years
-- ============================================
alter table public.academic_years alter column id type text using id::text;
alter table public.academic_years alter column school_id type text using school_id::text;

-- ============================================
-- 3. classes
-- ============================================
alter table public.classes alter column id type text using id::text;
alter table public.classes alter column school_id type text using school_id::text;
alter table public.classes alter column academic_year_id type text using academic_year_id::text;

-- ============================================
-- 4. students
-- ============================================
alter table public.students alter column id type text using id::text;
alter table public.students alter column school_id type text using school_id::text;
alter table public.students alter column class_id type text using class_id::text;

-- ============================================
-- 5. face_profiles
-- ============================================
alter table public.face_profiles alter column id type text using id::text;
alter table public.face_profiles alter column student_id type text using student_id::text;

-- ============================================
-- 6. attendance_sessions
-- ============================================
alter table public.attendance_sessions alter column id type text using id::text;
alter table public.attendance_sessions alter column school_id type text using school_id::text;
alter table public.attendance_sessions alter column class_id type text using class_id::text;

-- ============================================
-- 7. attendance_records
-- ============================================
alter table public.attendance_records alter column id type text using id::text;
alter table public.attendance_records alter column school_id type text using school_id::text;
alter table public.attendance_records alter column session_id type text using session_id::text;
alter table public.attendance_records alter column student_id type text using student_id::text;

-- ============================================
-- 8. users
-- ============================================
alter table public.users alter column id type text using id::text;
alter table public.users alter column school_id type text using school_id::text;

-- ============================================
-- SELESAI
-- ============================================
