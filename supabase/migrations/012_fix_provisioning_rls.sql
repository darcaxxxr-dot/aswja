-- ============================================
-- MIGRATION 012: Fix provisioning and RLS for text school_id
-- ============================================
-- Fixes:
-- 1. get_user_school() returns text to match profiles.school_id type
-- 2. admin_provision_school accepts TEXT for p_target_user_id
-- 3. RLS policies use text comparison consistently
-- 4. SUPERUSER role check uses auth.uid() instead of stale metadata
-- ============================================

-- ============================================================
-- 1. Fix get_user_school() to return TEXT (matching column type)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_school()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(school_id, '') FROM public.profiles WHERE id = auth.uid();
$$;

-- ============================================================
-- 2. Fix get_user_role() to return text consistently
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(role, 'OPERATOR') FROM public.profiles WHERE id = auth.uid();
$$;

-- ============================================================
-- 3. Recreate profiles policies using text comparison
-- ============================================================
DROP POLICY IF EXISTS "profiles_select_own_or_same_school" ON public.profiles;
CREATE POLICY "profiles_select_own_or_same_school"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ============================================================
-- 4. Fix admin_provision_school to accept TEXT user_id
--    and use auth.uid() for caller verification (not stale metadata)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_provision_school(p_school_id TEXT, p_target_user_id TEXT)
RETURNS TABLE(status TEXT, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid UUID;
  v_caller_profile RECORD;
  v_target_profile RECORD;
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

  IF p_target_user_id IS NULL OR p_target_user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN QUERY SELECT 'error'::TEXT, 'Target user ID is required'::TEXT;
    RETURN;
  END IF;

  -- Verify target user exists (p_target_user_id is a UUID string)
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id::UUID) THEN
    RETURN QUERY SELECT 'error'::TEXT, 'Target user not found'::TEXT;
    RETURN;
  END IF;

  SELECT id INTO v_school_id FROM public.schools WHERE id = p_school_id;

  IF v_school_id IS NULL THEN
    INSERT INTO public.schools (id, name, created_by, created_at, updated_at)
    VALUES (p_school_id, 'Sekolah (Admin)', v_caller_uid::text, NOW(), NOW());
    v_school_id := p_school_id;
  END IF;

  -- Force-assign the school_id regardless of existing value
  UPDATE public.profiles SET school_id = p_school_id WHERE id = p_target_user_id::UUID;

  INSERT INTO public.sync_logs (entity, operation, record_id, status, created_at)
  VALUES ('admin_provision', 'assign_school', p_target_user_id, 'completed', NOW());

  INSERT INTO public.provisioning_audit (admin_user_id, target_user_id, school_id, action, created_at)
  VALUES (v_caller_uid::TEXT, p_target_user_id, p_school_id, 'assign_school', NOW());

  RETURN QUERY SELECT 'provisioned'::TEXT, 'Admin provisioning completed'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_provision_school(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_provision_school(TEXT, TEXT) TO authenticated;

-- ============================================================
-- 5. Fix provision_school_for_current_user to allow SUPERUSER override
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

  -- SUPERUSERs can always re-assign their school
  IF v_caller_profile.role = 'SUPERUSER' THEN
    UPDATE public.profiles SET school_id = p_school_id WHERE id = v_caller_uid;
    RETURN QUERY SELECT 'provisioned'::TEXT, 'SUPERUSER school reassigned'::TEXT;
    RETURN;
  END IF;

  -- Non-SUPERUSER: check if already assigned
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
-- 6. Recreate school-isolated RLS policies using text get_user_school()
-- ============================================================
DROP POLICY IF EXISTS "ay_school_isolation" ON public.academic_years;
CREATE POLICY "ay_school_isolation"
  ON public.academic_years FOR ALL TO authenticated
  USING (school_id = public.get_user_school())
  WITH CHECK (school_id = public.get_user_school());

DROP POLICY IF EXISTS "classes_school_isolation" ON public.classes;
CREATE POLICY "classes_school_isolation"
  ON public.classes FOR ALL TO authenticated
  USING (school_id = public.get_user_school())
  WITH CHECK (school_id = public.get_user_school());

DROP POLICY IF EXISTS "students_school_isolation" ON public.students;
CREATE POLICY "students_school_isolation"
  ON public.students FOR ALL TO authenticated
  USING (school_id = public.get_user_school())
  WITH CHECK (school_id = public.get_user_school());

DROP POLICY IF EXISTS "face_profiles_school_isolation" ON public.face_profiles;
CREATE POLICY "face_profiles_school_isolation"
  ON public.face_profiles FOR ALL TO authenticated
  USING (
    student_id IN (
      SELECT id FROM public.students WHERE school_id = public.get_user_school()
    )
  )
  WITH CHECK (
    student_id IN (
      SELECT id FROM public.students WHERE school_id = public.get_user_school()
    )
  );

DROP POLICY IF EXISTS "sessions_school_isolation" ON public.attendance_sessions;
CREATE POLICY "sessions_school_isolation"
  ON public.attendance_sessions FOR ALL TO authenticated
  USING (school_id = public.get_user_school())
  WITH CHECK (school_id = public.get_user_school());

DROP POLICY IF EXISTS "records_school_isolation" ON public.attendance_records;
CREATE POLICY "records_school_isolation"
  ON public.attendance_records FOR ALL TO authenticated
  USING (school_id = public.get_user_school())
  WITH CHECK (school_id = public.get_user_school());

DROP POLICY IF EXISTS "settings_school_isolation" ON public.settings;
CREATE POLICY "settings_school_isolation"
  ON public.settings FOR ALL TO authenticated
  USING (school_id = public.get_user_school())
  WITH CHECK (school_id = public.get_user_school());

DROP POLICY IF EXISTS "sync_logs_school_isolation" ON public.sync_logs;
CREATE POLICY "sync_logs_school_isolation"
  ON public.sync_logs FOR ALL TO authenticated
  USING (school_id = public.get_user_school())
  WITH CHECK (school_id = public.get_user_school());

-- ============================================================
-- 7. Ensure profiles role is correctly set for SUPERUSER
--    Update any profile that has SUPABASE_METADATA role = SUPERUSER
-- ============================================================
DO $$
BEGIN
  UPDATE public.profiles p
  SET role = 'SUPERUSER'
  WHERE p.id IN (
    SELECT auth.uid()
    WHERE auth.uid() IS NOT NULL
  )
  AND EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = p.id
    AND u.raw_user_meta_data->>'role' = 'SUPERUSER'
  )
  AND p.role <> 'SUPERUSER';
END $$;

-- ============================================================
-- 8. Grant execute on new/updated functions
-- ============================================================
GRANT EXECUTE ON FUNCTION public.get_user_school() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_provision_school(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provision_school_for_current_user(TEXT) TO authenticated;

-- ============================================================
-- 9. Verify RLS is enabled on all tables
-- ============================================================
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('pg_stat_user_tables') LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = tbl) THEN
      RAISE NOTICE 'Table % has no RLS policies — ensure RLS is enabled', tbl;
    END IF;
  END LOOP;
END $$;
