-- ============================================
-- MIGRATION 013: Drop FK constraints for local-first sync
-- ============================================
-- Latar belakang:
-- Aplikasi ini PWA offline-first (Dexie + Supabase). Child rows sering
-- di-push sebelum parent rows tiba di server. Migration 005 me-recreate
-- FK constraints yang sebelumnya sudah di-drop di migration 004 dengan
-- alasan "app handles cascade". Akibatnya sync gagal dengan 409/23503:
--   - classes.academic_year_id  -> academic_years.id
--   - students.class_id         -> classes.id
--   - attendance_sessions.class_id -> classes.id
--   - attendance_records.session_id/student_id
--   - face_profiles.student_id
-- Integritas referensial tetap dijaga oleh:
--   1. Dexie (IndexedDB) di sisi klien
--   2. RLS school_id isolation di server
--   3. Soft-delete (deleted_at) — row tidak pernah benar-benar hilang
-- ============================================

-- ============================================================
-- 1. Drop FK yang menghambat sync ordering
-- ============================================================
ALTER TABLE public.classes
  DROP CONSTRAINT IF EXISTS classes_academic_year_id_fkey;

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_class_id_fkey;

ALTER TABLE public.attendance_sessions
  DROP CONSTRAINT IF EXISTS attendance_sessions_class_id_fkey;

ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_session_id_fkey;

ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_student_id_fkey;

ALTER TABLE public.face_profiles
  DROP CONSTRAINT IF EXISTS face_profiles_student_id_fkey;

-- school_id FK tetap dipertahankan karena school harus ada lebih dulu
-- (dijamin oleh provisioning). Jika ingin lebih permisif, drop juga:
-- ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_school_id_fkey;

-- ============================================================
-- 2. Index untuk mempercepat lookup saat app resolve relasi
--    (karena FK sudah tidak otomatis membuat index)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_classes_academic_year_id
  ON public.classes(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_students_class_id
  ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_sessions_class_id
  ON public.attendance_sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_records_session_id
  ON public.attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_records_student_id
  ON public.attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_face_profiles_student_id
  ON public.face_profiles(student_id);

-- ============================================================
-- 3. Verifikasi: tidak ada FK yang tersisa untuk kolom-kolom di atas
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname, conrelid::regclass::text AS tbl
    FROM pg_constraint
    WHERE contype = 'f'
      AND connamespace = 'public'::regnamespace
      AND conname IN (
        'classes_academic_year_id_fkey',
        'students_class_id_fkey',
        'attendance_sessions_class_id_fkey',
        'attendance_records_session_id_fkey',
        'attendance_records_student_id_fkey',
        'face_profiles_student_id_fkey'
      )
  LOOP
    RAISE WARNING 'FK masih ada: % on %', r.conname, r.tbl;
  END LOOP;

  RAISE NOTICE 'Migration 013: FK drop selesai';
END $$;