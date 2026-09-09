-- ============================================
-- MIGRATION 007: Add missing columns for sync correctness
-- ============================================
-- Migration 005 rebuild tables but omitted several columns needed for proper sync:
--   - updated_at on academic_years, classes, attendance_sessions, attendance_records
--   - session_type and prayer_name on attendance_sessions
-- This migration adds them to existing databases that already ran migration 005.
-- For fresh databases, migration 005 already includes these columns.

-- ============================================
-- 1. ADD updated_at TO attendance_sessions
-- ============================================
ALTER TABLE public.attendance_sessions ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();

-- ============================================
-- 2. ADD session_type AND prayer_name TO attendance_sessions
-- ============================================
ALTER TABLE public.attendance_sessions ADD COLUMN IF NOT EXISTS session_type text not null default 'CLASS';
ALTER TABLE public.attendance_sessions ADD COLUMN IF NOT EXISTS prayer_name text;

-- ============================================
-- 3. ADD updated_at TO attendance_records
-- ============================================
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();

-- ============================================
-- 4. ADD updated_at TO academic_years
-- ============================================
ALTER TABLE public.academic_years ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();

-- ============================================
-- 5. ADD updated_at TO classes
-- ============================================
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();

-- ============================================
-- 6. INDEXES for new columns
-- ============================================
CREATE INDEX IF NOT EXISTS idx_sessions_session_type ON public.attendance_sessions(session_type);
CREATE INDEX IF NOT EXISTS idx_sessions_prayer_name ON public.attendance_sessions(prayer_name);
CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON public.attendance_sessions(updated_at);
CREATE INDEX IF NOT EXISTS idx_records_updated_at ON public.attendance_records(updated_at);
CREATE INDEX IF NOT EXISTS idx_academic_years_updated_at ON public.academic_years(updated_at);
CREATE INDEX IF NOT EXISTS idx_classes_updated_at ON public.classes(updated_at);

-- ============================================
-- 7. UPDATE existing attendance_sessions records
--    Set session_type to 'CLASS' where NULL (legacy data)
-- ============================================
UPDATE public.attendance_sessions SET session_type = 'CLASS' WHERE session_type IS NULL;

-- ============================================
-- SELESAI
-- ============================================
