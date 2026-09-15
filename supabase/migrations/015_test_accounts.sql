-- ============================================
-- TEST ACCOUNTS: Create Superuser, Kepala Sekolah, Operator
-- ============================================
-- Run this in Supabase SQL Editor (requires service_role key).
-- These accounts use Supabase Auth and profiles table.
-- Passwords are set via auth.admin.create_user.
-- ============================================

-- ============================================================
-- 0. Ensure profiles table exists with correct schema
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id text,
  display_name text NOT NULL,
  role text NOT NULL DEFAULT 'OPERATOR',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- 1. SUPERUSER (can provision any school)
--    Email: superuser@aswja.local
--    Password: Aswaja@2026!
-- ============================================================
SELECT auth.admin.create_user(
  email => 'superuser@aswja.local',
  password => 'Aswaja@2026!',
  user_metadata => jsonb_build_object(
    'display_name', 'Superuser ASWJA',
    'role', 'SUPERUSER',
    'sub_role', 'KEPALA_MADRASAH'
  )
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. KEPALA SEKOLAH (school admin)
--    Email: kepala@aswja.local
--    Password: Aswaja@2026!
-- ============================================================
SELECT auth.admin.create_user(
  email => 'kepala@aswja.local',
  password => 'Aswaja@2026!',
  user_metadata => jsonb_build_object(
    'display_name', 'Kepala Sekolah',
    'role', 'USER',
    'sub_role', 'KEPALA_MADRASAH'
  )
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. OPERATOR (regular staff)
--    Email: operator@aswja.local
--    Password: Aswaja@2026!
-- ============================================================
SELECT auth.admin.create_user(
  email => 'operator@aswja.local',
  password => 'Aswaja@2026!',
  user_metadata => jsonb_build_object(
    'display_name', 'Operator',
    'role', 'OPERATOR',
    'sub_role', null
  )
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. Ensure profiles exist for all test users
--    (trigger may not fire for auth.admin.create_user)
-- ============================================================
INSERT INTO public.profiles (id, display_name, role, school_id)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1)),
  COALESCE(u.raw_user_meta_data->>'role', 'OPERATOR'),
  NULL
FROM auth.users u
WHERE u.email IN ('superuser@aswja.local', 'kepala@aswja.local', 'operator@aswja.local')
AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  role = EXCLUDED.role;

-- ============================================================
-- 5. Create test school if not exists
-- ============================================================
INSERT INTO public.schools (id, name, created_by, created_at, updated_at)
VALUES (
  'a518421e-7a2b-40a2-bcfd-b59cc5d5fc49',
  'MAN IC Kota Palangkaraya',
  (SELECT id FROM auth.users WHERE email = 'superuser@aswja.local' LIMIT 1),
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 6. Assign school to test users via profiles
-- ============================================================
UPDATE public.profiles p
SET school_id = 'a518421e-7a2b-40a2-bcfd-b59cc5d5fc49'
WHERE p.id IN (
  SELECT id FROM auth.users
  WHERE email IN ('superuser@aswja.local', 'kepala@aswja.local', 'operator@aswja.local')
)
AND p.school_id IS NULL;

-- ============================================================
-- 7. Verify all test accounts
-- ============================================================
SELECT
  u.email,
  u.raw_user_meta_data->>'role' AS role,
  u.raw_user_meta_data->>'sub_role' AS sub_role,
  p.school_id,
  p.display_name
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE u.email IN ('superuser@aswja.local', 'kepala@aswja.local', 'operator@aswja.local')
ORDER BY u.email;

-- ============================================================
-- ACCOUNT SUMMARY
-- ============================================================
-- Email                 | Password      | Role       | Sub Role
-- ----------------------|---------------|------------|-----------------
-- superuser@aswja.local | Aswaja@2026!  | SUPERUSER  | KEPALA_MADRASAH
-- kepala@aswja.local    | Aswaja@2026!  | USER       | KEPALA_MADRASAH
-- operator@aswja.local  | Aswaja@2026!  | OPERATOR   | (null)
--
-- IMPORTANT: auth.admin.create_user requires service_role key.
-- If you get permission denied, use the Supabase Dashboard:
--   Authentication → Users → Add User
-- Or use the Supabase CLI:
--   supabase auth admin create-user --email superuser@aswja.local --password Aswaja@2026!
--
-- For the app, login with these credentials at:
--   https://aswja.vercel.app/login
