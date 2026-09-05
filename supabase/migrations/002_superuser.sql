-- ============================================
-- MIGRATION 002: 3-role hierarchy + superuser
-- ============================================
-- Jalankan SETELAH 001_auth_rls.sql.
-- Idempotent: bisa dijalankan berulang.

-- ============================================
-- 1. UPDATE profiles.role CHECK constraint
-- ============================================
do $$
begin
  -- Drop old constraint
  if exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles drop constraint profiles_role_check;
  end if;
end$$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('SUPERUSER', 'USER', 'OPERATOR'));

-- Add sub_role column
alter table public.profiles
  add column if not exists sub_role text
  check (sub_role in ('KEPALA_MADRASAH', 'WAKAMAD_KEASRAMAAN', 'GURU_BINA_ASRAMA', null));

-- Add helper function for role check
create or replace function public.is_superuser()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role = 'SUPERUSER'
  );
$$;

-- ============================================
-- 2. UPDATE handle_new_user trigger
-- ============================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_role text := coalesce(new.raw_user_meta_data->>'role', 'OPERATOR');
  user_sub_role text := new.raw_user_meta_data->>'sub_role';
  user_display_name text := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1));
begin
  if user_role not in ('SUPERUSER', 'USER', 'OPERATOR') then
    user_role := 'OPERATOR';
  end if;
  if user_sub_role is not null and user_sub_role not in ('KEPALA_MADRASAH', 'WAKAMAD_KEASRAMAAN', 'GURU_BINA_ASRAMA') then
    user_sub_role := null;
  end if;
  insert into public.profiles (id, display_name, role, sub_role)
  values (new.id, user_display_name, user_role, user_sub_role)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Trigger already exists from migration 001; keep as is.

-- ============================================
-- 3. UPDATE get_user_role to return new enum
-- ============================================
-- (no change needed - function returns text, callers check value)

-- ============================================
-- 4. UPDATE policies to use is_superuser()
-- ============================================

-- Profiles: only SUPERUSER can manage all users
drop policy if exists "profiles_select_own_or_same_school" on public.profiles;
create policy "profiles_select_own_or_same_school"
  on public.profiles for select to authenticated
  using (
    public.is_superuser()
    or id = auth.uid()
    or school_id = (select school_id from public.profiles where id = auth.uid())
  );

drop policy if exists "profiles_admin_insert" on public.profiles;
create policy "profiles_admin_insert"
  on public.profiles for insert to authenticated
  with check (
    public.is_superuser()
    or id = auth.uid()  -- self insert via signup trigger (security definer bypasses this)
  );

drop policy if exists "profiles_admin_delete" on public.profiles;
create policy "profiles_admin_delete"
  on public.profiles for delete to authenticated
  using (public.is_superuser());

-- Schools: only SUPERUSER can write
drop policy if exists "schools_admin_write" on public.schools;
create policy "schools_admin_write"
  on public.schools for all to authenticated
  using (id = public.get_user_school() and (public.is_superuser() or public.get_user_role() = 'SUPERUSER'))
  with check (id = public.get_user_school() and (public.is_superuser() or public.get_user_role() = 'SUPERUSER'));

-- ============================================
-- 5. CREATE SUPERUSER ACCOUNT (untuk UAT)
-- ============================================
-- Buat user di Supabase Auth Dashboard, atau gunakan SQL ini:
-- CATATAN: Supabase Auth users TIDAK bisa di-insert via SQL langsung
-- (perlu API call ke auth endpoint). Gunakan Dashboard atau signup UI.

-- Setelah user dibuat via UI, jalankan SQL ini untuk promote ke SUPERUSER:
/*
update auth.users
set raw_user_meta_data = jsonb_build_object(
  'display_name', 'Superuser UAT',
  'role', 'SUPERUSER',
  'sub_role', 'KEPALA_MADRASAH'
)
where email = 'superuser@aswja.local';

-- Profile akan auto-update via trigger, atau jalankan manual:
insert into public.profiles (id, display_name, role, sub_role, school_id)
select id, 'Superuser UAT', 'SUPERUSER', 'KEPALA_MADRASAH', '00000000-0000-0000-0000-000000000001'
from auth.users where email = 'superuser@aswja.local'
on conflict (id) do update set
  role = excluded.role,
  sub_role = excluded.sub_role,
  display_name = excluded.display_name,
  school_id = excluded.school_id;
*/

-- ============================================
-- 6. SCHOOL bootstrap (sama dengan migration 001)
-- ============================================
-- (sudah ada dari migration 001; di sini hanya verifikasi)
insert into public.schools (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Madrasah Aliyah Aswaja')
on conflict (id) do nothing;

-- ============================================
-- DONE
-- ============================================
-- LANGKAH SELANJUTNYA UNTUK MEMBUAT SUPERUSER:
-- 1. Buka Supabase Dashboard → Authentication → Users → "Add user"
-- 2. Email: superuser@aswja.local
-- 3. Password: (password kuat Anda)
-- 4. Auto Confirm: ON
-- 5. Klik "Add user"
-- 6. Copy user ID
-- 7. Jalankan SQL ini (ganti <USER_ID>):
--
--    update public.profiles
--    set role = 'SUPERUSER',
--        sub_role = 'KEPALA_MADRASAH',
--        display_name = 'Superuser UAT',
--        school_id = '00000000-0000-0000-0000-000000000001'
--    where id = '<USER_ID>';
