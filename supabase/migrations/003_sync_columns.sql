-- ============================================
-- MIGRATION 003: Fix sync column mismatches
-- ============================================
-- Jalankan file ini di Supabase SQL Editor.
-- Menambahkan kolom yang hilang agar sync berfungsi.

-- ============================================
-- 1. TAMBAH academicYearId KE classes TABLE
-- ============================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'classes' and column_name = 'academic_year_id'
  ) then
    alter table public.classes add column academic_year_id uuid;
  end if;
end$$;

create index if not exists idx_classes_academic_year on public.classes(academic_year_id);

-- ============================================
-- 2. TAMBAH school_id KE schools TABLE
-- ============================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'schools' and column_name = 'school_id'
  ) then
    alter table public.schools add column school_id uuid references public.schools(id) on delete set null;
  end if;
end$$;

create index if not exists idx_schools_parent on public.schools(school_id);

-- ============================================
-- 3. UPDATE RLS POLICIES untuk schools
-- ============================================
drop policy if exists "schools_select_own" on public.schools;
create policy "schools_select_own"
  on public.schools for select to authenticated
  using (id = public.get_user_school() or school_id = public.get_user_school());

drop policy if exists "schools_admin_write" on public.schools;
create policy "schools_admin_write"
  on public.schools for all to authenticated
  using (id = public.get_user_school() and (public.is_superuser() or public.get_user_role() = 'SUPERUSER'))
  with check (id = public.get_user_school() and (public.is_superuser() or public.get_user_role() = 'SUPERUSER'));

-- ============================================
-- 4. UPDATE RLS POLICIES untuk classes (gunakan academic_year_id)
-- ============================================
drop policy if exists "classes_school_isolation" on public.classes;
create policy "classes_school_isolation"
  on public.classes for all to authenticated
  using (
    school_id = public.get_user_school()
    or academic_year_id in (
      select id from public.academic_years where school_id = public.get_user_school()
    )
  )
  with check (
    school_id = public.get_user_school()
    or academic_year_id in (
      select id from public.academic_years where school_id = public.get_user_school()
    )
  );

-- ============================================
-- 5. SETUP default school_id untuk existing data
-- ============================================
update public.schools set school_id = id where school_id is null;
update public.classes set academic_year_id = (select id from public.academic_years where school_id = public.get_user_school() limit 1) where academic_year_id is null;

-- ============================================
-- SELESAI
-- ============================================