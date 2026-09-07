-- ============================================
-- MIGRATION 006: Soft-delete support
-- ============================================
-- Menambahkan kolom `deleted_at` ke semua tabel yang di-sync.
-- Saat row dihapus di satu device, kita set `deleted_at = now()` (bukan hapus fisik).
-- Sync service akan propagate ini ke device lain.
-- Row dengan `deleted_at IS NOT NULL` disembunyikan dari UI tapi tetap ada di IndexedDB.

-- schools
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_schools_deleted ON public.schools(deleted_at);

-- academic_years
ALTER TABLE public.academic_years ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_academic_years_deleted ON public.academic_years(deleted_at);

-- classes
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_classes_deleted ON public.classes(deleted_at);

-- students
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_students_deleted ON public.students(deleted_at);

-- face_profiles
ALTER TABLE public.face_profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_face_profiles_deleted ON public.face_profiles(deleted_at);

-- attendance_sessions
ALTER TABLE public.attendance_sessions ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_sessions_deleted ON public.attendance_sessions(deleted_at);

-- attendance_records
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_records_deleted ON public.attendance_records(deleted_at);

-- users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_users_deleted ON public.users(deleted_at);

-- ============================================
-- SELESAI
-- ============================================
