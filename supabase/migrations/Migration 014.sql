-- ============================================
-- MIGRATION 014: face_profiles — add school_id + restore relationship
-- ============================================
-- Konteks:
-- Migration 013 drop FK face_profiles_student_id_fkey untuk memungkinkan
-- push-out-of-order. Namun PostgREST membutuhkan FK untuk relationship
-- detection, sehingga query nested:
--   face_profiles?select=*,students!inner(school_id)
-- gagal dengan 400 "Could not find a relationship between..."
--
-- Solusi:
-- 1. Tambah kolom school_id langsung ke face_profiles (denormalisasi)
--    agar query bisa bypass nested join di masa depan
-- 2. Backfill dari students
-- 3. Trigger untuk auto-populate saat insert/update
-- 4. Re-add FK sebagai NOT VALID — tetap terdeteksi PostgREST,
--    tapi tidak memvalidasi row lama (push order tetap fleksibel
--    karena app retry parent-first saat FK violation)
-- 5. Update RLS policy untuk pakai face_profiles.school_id langsung
--    (lebih cepat dari subquery ke students)
-- ============================================

-- ============================================================
-- 1. Add school_id column (denormalized)
-- ============================================================
ALTER TABLE public.face_profiles
  ADD COLUMN IF NOT EXISTS school_id text;

-- ============================================================
-- 2. Backfill dari students
-- ============================================================
UPDATE public.face_profiles fp
SET school_id = s.school_id
FROM public.students s
WHERE fp.student_id = s.id
  AND (fp.school_id IS NULL OR fp.school_id = '');

-- ============================================================
-- 3. Trigger: auto-populate school_id dari student saat insert/update
-- ============================================================
CREATE OR REPLACE FUNCTION public.face_profiles_set_school_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id text;
BEGIN
  -- Hanya lookup jika school_id belum di-set
  IF NEW.school_id IS NULL OR NEW.school_id = '' THEN
    SELECT school_id INTO v_school_id
    FROM public.students
    WHERE id = NEW.student_id;

    IF v_school_id IS NOT NULL THEN
      NEW.school_id := v_school_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_face_profiles_set_school_id ON public.face_profiles;
CREATE TRIGGER trg_face_profiles_set_school_id
  BEFORE INSERT OR UPDATE OF student_id ON public.face_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.face_profiles_set_school_id();

-- ============================================================
-- 4. Index untuk filter school_id
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_face_profiles_school_id
  ON public.face_profiles(school_id);

-- ============================================================
-- 5. Re-add FK sebagai NOT VALID
--    - Terdeteksi PostgREST → nested query `students!inner(...)` works
--    - NOT VALID → tidak cek row lama, hanya row baru
--    - PostgREST tetap bisa resolve relasi karena conname ada di pg_constraint
-- ============================================================
ALTER TABLE public.face_profiles
  DROP CONSTRAINT IF EXISTS face_profiles_student_id_fkey;

ALTER TABLE public.face_profiles
  ADD CONSTRAINT face_profiles_student_id_fkey
  FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE
  NOT VALID;

-- ============================================================
-- 6. Update RLS policy untuk pakai school_id langsung
--    (lebih cepat dari subquery ke students)
-- ============================================================
DROP POLICY IF EXISTS "face_profiles_school_isolation" ON public.face_profiles;
CREATE POLICY "face_profiles_school_isolation"
  ON public.face_profiles FOR ALL TO authenticated
  USING (school_id::text = public.get_user_school()::text)
  WITH CHECK (school_id::text = public.get_user_school()::text);

-- ============================================================
-- 7. Verifikasi
-- ============================================================
DO $$
DECLARE
  v_count_backfilled int;
  v_count_orphan int;
  v_fk_exists boolean;
BEGIN
  SELECT COUNT(*) INTO v_count_backfilled
  FROM public.face_profiles
  WHERE school_id IS NOT NULL AND school_id <> '';

  SELECT COUNT(*) INTO v_count_orphan
  FROM public.face_profiles fp
  WHERE fp.school_id IS NULL OR fp.school_id = '';

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'face_profiles_student_id_fkey'
      AND conrelid = 'public.face_profiles'::regclass
  ) INTO v_fk_exists;

  RAISE NOTICE 'face_profiles: % rows with school_id, % orphans', v_count_backfilled, v_count_orphan;
  RAISE NOTICE 'FK face_profiles_student_id_fkey exists: %', v_fk_exists;
END $$;