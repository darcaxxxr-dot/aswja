-- Phase 6: School Identity Migration
-- This migration is additive and safe to run on production after backup.
-- It does NOT drop or rebuild any tables.
-- It adds provisioning RPCs and makes device_id nullable.

-- ============================================================
-- 1. Normalize profiles.school_id type to text (if needed)
--    The column must be TEXT: provision_school_for_current_user
--    compares it with '' and with the TEXT parameter. The direct
--    ALTER fails while a policy depends on the column, so the
--    dependent policy is dropped and recreated around the ALTER.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles'
      AND column_name = 'school_id'
      AND data_type = 'uuid'
  ) THEN
    DROP POLICY IF EXISTS "profiles_select_own_or_same_school" ON public.profiles;
    ALTER TABLE public.profiles ALTER COLUMN school_id TYPE TEXT USING school_id::text;
    CREATE POLICY "profiles_select_own_or_same_school"
      ON public.profiles
      FOR SELECT
      TO authenticated
      USING (
        id = auth.uid()
        OR school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

-- get_user_school() must be re-created after the school_id conversion above.
-- Its body was `SELECT school_id FROM profiles` — valid while the column was
-- uuid, but now returns text against the declared `RETURNS uuid`, which fails
-- at call time with 42P13 "return type mismatch". Casting the body to ::uuid
-- keeps the declared signature (no DROP needed, no policy dependency broken)
-- and works for both column types. Policies keep calling it with ::text.
CREATE OR REPLACE FUNCTION public.get_user_school()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id::uuid FROM public.profiles WHERE id = auth.uid();
$$;

-- schools.created_by is referenced by the provisioning RPCs but was never
-- defined in migration 005's schools table. Add it additively.
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS created_by text;

-- sync_logs is written by admin_provision_school but no migration ever
-- created it (001 only referenced it). Create it if missing.
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id text primary key default gen_random_uuid()::text,
  entity text not null,
  operation text not null,
  record_id text,
  status text,
  message text,
  device_id text,
  school_id text,
  created_at timestamptz default now()
);
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Make attendance_records.device_id nullable (additive)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance_records'
      AND column_name = 'device_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.attendance_records ALTER COLUMN device_id DROP NOT NULL;
  END IF;
END $$;

-- ============================================================
-- 3. Add indexes for School ID and timestamp if missing
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'attendance_records'
      AND indexname = 'idx_attendance_records_school_id'
  ) THEN
    CREATE INDEX idx_attendance_records_school_id ON public.attendance_records (school_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'attendance_records'
      AND indexname = 'idx_attendance_records_timestamp'
  ) THEN
    CREATE INDEX idx_attendance_records_timestamp ON public.attendance_records (timestamp);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'students'
      AND indexname = 'idx_students_school_id'
  ) THEN
    CREATE INDEX idx_students_school_id ON public.students (school_id);
  END IF;
END $$;

-- ============================================================
-- 4. Create provisioning audit table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.provisioning_audit (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  admin_user_id TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  school_id TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.provisioning_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_read_own_audit ON public.provisioning_audit;
CREATE POLICY admin_read_own_audit ON public.provisioning_audit
  FOR SELECT USING (auth.uid()::TEXT = admin_user_id);

-- ============================================================
-- 5. Create provisioning RPC: provision_school_for_current_user
-- ============================================================
CREATE OR REPLACE FUNCTION public.provision_school_for_current_user(p_school_id TEXT)
RETURNS TABLE(status TEXT, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid UUID;
  v_caller_profile RECORD;
  v_school_exists BOOLEAN;
  v_school_owned BOOLEAN;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RETURN QUERY SELECT 'error'::TEXT, 'Authentication required'::TEXT;
    RETURN;
  END IF;

  IF p_school_id IS NULL OR p_school_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN QUERY SELECT 'error'::TEXT, 'Invalid UUID format'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_caller_profile
  FROM public.profiles
  WHERE id = v_caller_uid;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'error'::TEXT, 'Profile not found'::TEXT;
    RETURN;
  END IF;

  IF v_caller_profile.school_id IS NOT NULL AND v_caller_profile.school_id <> '' THEN
    IF v_caller_profile.school_id = p_school_id THEN
      RETURN QUERY SELECT 'already_provisioned'::TEXT, 'School already provisioned for this user'::TEXT;
      RETURN;
    ELSE
      RETURN QUERY SELECT 'error'::TEXT, 'User already assigned to a different school'::TEXT;
      RETURN;
    END IF;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.schools WHERE id = p_school_id) INTO v_school_exists;

  IF v_school_exists THEN
    SELECT EXISTS (SELECT 1 FROM public.schools WHERE id = p_school_id AND created_by = v_caller_uid::text) INTO v_school_owned;
    IF v_school_owned THEN
      UPDATE public.profiles SET school_id = p_school_id WHERE id = v_caller_uid;
      RETURN QUERY SELECT 'already_provisioned'::TEXT, 'School already exists and is assigned to you'::TEXT;
      RETURN;
    ELSE
      RETURN QUERY SELECT 'error'::TEXT, 'School ID belongs to another user'::TEXT;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.schools (id, name, created_by, created_at, updated_at)
  VALUES (p_school_id, 'Sekolah', v_caller_uid::text, NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles SET school_id = p_school_id WHERE id = v_caller_uid;

  RETURN QUERY SELECT 'provisioned'::TEXT, 'School provisioned successfully'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_school_for_current_user(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_school_for_current_user(TEXT) TO authenticated;

-- ============================================================
-- 6. Create admin provisioning RPC: admin_provision_school
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_provision_school(p_school_id TEXT, p_target_user_id UUID)
RETURNS TABLE(status TEXT, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid UUID;
  v_caller_profile RECORD;
  v_school_id TEXT;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RETURN QUERY SELECT 'error'::TEXT, 'Authentication required'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_caller_profile
  FROM public.profiles
  WHERE id = v_caller_uid;

  IF NOT FOUND OR COALESCE(v_caller_profile.role, '') <> 'SUPERUSER' THEN
    RETURN QUERY SELECT 'error'::TEXT, 'Superuser access required'::TEXT;
    RETURN;
  END IF;

  IF p_school_id IS NULL OR p_school_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN QUERY SELECT 'error'::TEXT, 'Invalid UUID format'::TEXT;
    RETURN;
  END IF;

  IF p_target_user_id IS NULL THEN
    RETURN QUERY SELECT 'error'::TEXT, 'Target user ID is required'::TEXT;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
    RETURN QUERY SELECT 'error'::TEXT, 'Target user not found'::TEXT;
    RETURN;
  END IF;

  SELECT id INTO v_school_id FROM public.schools WHERE id = p_school_id;

  IF v_school_id IS NULL THEN
    INSERT INTO public.schools (id, name, created_by, created_at, updated_at)
    VALUES (p_school_id, 'Sekolah (Admin)', v_caller_uid::text, NOW(), NOW());
    v_school_id := p_school_id;
  END IF;

  UPDATE public.profiles SET school_id = p_school_id WHERE id = p_target_user_id;

  INSERT INTO public.sync_logs (entity, operation, record_id, status, created_at)
  VALUES ('admin_provision', 'assign_school', p_target_user_id::TEXT, 'completed', NOW());

  INSERT INTO public.provisioning_audit (admin_user_id, target_user_id, school_id, action, created_at)
  VALUES (v_caller_uid::TEXT, p_target_user_id::TEXT, p_school_id, 'assign_school', NOW());

  RETURN QUERY SELECT 'provisioned'::TEXT, 'Admin provisioning completed'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_provision_school(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_provision_school(TEXT, UUID) TO authenticated;

-- ============================================================
-- 7. Verify RLS policies are active and deny anon access
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'schools' AND schemaname = 'public') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'schools' AND policyname LIKE '%anon%'
    ) THEN
      RAISE NOTICE 'Schools table: Ensure RLS policies deny anon access';
    END IF;
  END IF;
END $$;