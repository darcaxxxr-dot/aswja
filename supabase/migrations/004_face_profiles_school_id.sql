-- ============================================
-- MIGRATION 004: Add school_id to face_profiles
-- ============================================
-- Tabel face_profiles tidak memiliki kolom school_id langsung.
-- Migration ini menambahkan kolom school_id dan mengisinya
-- dari relasi student_id -> students.school_id.

-- ============================================
-- 1. TAMBAH KOLOM school_id KE face_profiles
-- ============================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'face_profiles' and column_name = 'school_id'
  ) then
    alter table public.face_profiles
      add column school_id uuid references public.schools(id) on delete cascade;
  end if;
end$$;

-- ============================================
-- 2. BACKFILL: isi school_id dari students
-- ============================================
update public.face_profiles fp
set school_id = s.school_id
from public.students s
where fp.student_id = s.id
  and fp.school_id is null;

-- ============================================
-- 3. INDEX untuk performa query
-- ============================================
create index if not exists idx_face_profiles_school on public.face_profiles(school_id);

-- ============================================
-- 4. UPDATE RLS POLICY untuk face_profiles
-- ============================================
drop policy if exists "face_profiles_school_isolation" on public.face_profiles;
create policy "face_profiles_school_isolation"
  on public.face_profiles for all to authenticated
  using (school_id = public.get_user_school())
  with check (school_id = public.get_user_school());

-- ============================================
-- SELESAI
-- ============================================
