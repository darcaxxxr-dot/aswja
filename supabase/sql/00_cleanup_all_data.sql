-- ============================================
-- SQL CLEANUP: Hapus semua data dan reset
-- ============================================
-- Jalankan di Supabase SQL Editor untuk reset semua data dari awal.
-- AMAN: Tidak menghapus tabel, hanya isinya.
-- Tabel RLS & struktur tetap utuh.

-- Nonaktifkan trigger & constraint untuk performa (opsional)
SET session_replication_role = 'replica';

-- Hapus data dari child ke parent (FK order)
TRUNCATE TABLE public.attendance_records CASCADE;
TRUNCATE TABLE public.attendance_sessions CASCADE;
TRUNCATE TABLE public.face_profiles CASCADE;
TRUNCATE TABLE public.students CASCADE;
TRUNCATE TABLE public.classes CASCADE;
TRUNCATE TABLE public.academic_years CASCADE;
TRUNCATE TABLE public.users CASCADE;
TRUNCATE TABLE public.settings CASCADE;
TRUNCATE TABLE public.sync_queue CASCADE;
TRUNCATE TABLE public.schools CASCADE;

SET session_replication_role = 'origin';

-- Verifikasi: tampilkan jumlah rows di setiap tabel (semua harus 0)
SELECT
  'schools' as table_name, COUNT(*) as row_count FROM public.schools
  UNION ALL SELECT 'academic_years', COUNT(*) FROM public.academic_years
  UNION ALL SELECT 'classes', COUNT(*) FROM public.classes
  UNION ALL SELECT 'students', COUNT(*) FROM public.students
  UNION ALL SELECT 'face_profiles', COUNT(*) FROM public.face_profiles
  UNION ALL SELECT 'attendance_sessions', COUNT(*) FROM public.attendance_sessions
  UNION ALL SELECT 'attendance_records', COUNT(*) FROM public.attendance_records
  UNION ALL SELECT 'users', COUNT(*) FROM public.users
  UNION ALL SELECT 'settings', COUNT(*) FROM public.settings
  UNION ALL SELECT 'sync_queue', COUNT(*) FROM public.sync_queue;
