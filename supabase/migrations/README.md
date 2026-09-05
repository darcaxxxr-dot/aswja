# Supabase Migrations

Folder ini berisi SQL migration scripts. Jalankan berurutan di **Supabase SQL Editor**.

## 001_auth_rls.sql

Membuat tabel `profiles` (linked ke `auth.users`), trigger auto-create profile saat signup, dan **Row Level Security (RLS) policies** berbasis `auth.uid()`.

### Apa yang dilakukan
1. Tabel `profiles` (id, school_id, display_name, role, timestamps).
2. Trigger `on_auth_user_created` — auto-create profile saat user sign up (extract `display_name` & `role` dari `raw_user_meta_data`).
3. Helper functions `get_user_school()` & `get_user_role()`.
4. **Drop semua policy `anon_all_*`** (yang membuka akses penuh untuk anon key).
5. **Enable RLS** di semua tabel.
6. **Buat policy school-isolation**: user hanya bisa akses data school mereka sendiri.
7. Grant permissions ke `authenticated` role.

## 002_superuser.sql

Update role hierarchy menjadi 3-level: **SUPERUSER** > **USER** > **OPERATOR**.

### Apa yang dilakukan
1. Update CHECK constraint `profiles.role` ke enum baru.
2. Tambah kolom `sub_role` untuk role spesifik di bawah USER (Kepala Madrasah, Wakamad Keasramaan, Guru Bina Asrama).
3. Update trigger `handle_new_user` untuk handle enum baru.
4. Tambah function `is_superuser()`.
5. Update policies: hanya SUPERUSER yang bisa delete profiles, manage all users, write schools.
6. Bootstrap school "Madrasah Aliyah Aswaja" (id `00000000-0000-0000-0000-000000000001`).

### Role Hierarchy

| Role | Rank | Default Sub-role | Capabilities |
|---|---|---|---|
| **SUPERUSER** | 3 | (tidak ada) | Full access: manage users, delete db, settings, all data |
| **USER** | 2 | KEPALA_MADRASAH / WAKAMAD_KEASRAMAAN / GURU_BINA_ASRAMA | Manage students, enrollment, attendance, backup, view reports |
| **OPERATOR** | 1 | (tidak ada) | View dashboard + reports, basic attendance input |

### Cara Buat Superuser untuk UAT

1. **Jalankan kedua migration** (001 lalu 002) di Supabase SQL Editor.
2. **Buat user baru** di Supabase Dashboard → Authentication → Users → **Add user**:
   - Email: `superuser@aswja.local`
   - Password: (pilih password kuat, mis. `Aswaja@2026!`)
   - **Auto Confirm User**: ON
3. **Copy user ID** (UUID).
4. **Jalankan SQL ini** (ganti `<USER_ID>`):
   ```sql
   update public.profiles
   set role = 'SUPERUSER',
       sub_role = 'KEPALA_MADRASAH',
       display_name = 'Superuser UAT',
       school_id = '00000000-0000-0000-0000-000000000001'
   where id = '<USER_ID>';
   ```
5. **Login** di app dengan email + password di atas.

### Cara Jalankan
1. Buka https://supabase.com/dashboard/project/yrjlmmlnfabbsozhahjn/sql/new
2. Copy-paste isi `001_auth_rls.sql`.
3. Klik **Run**.

### Setelah Migration
- Anon key **tidak bisa** baca/write data.
- User yang login via Supabase Auth **bisa** akses data school-nya.
- Multi-tenant ready: ADMIN di school A tidak bisa lihat data school B.

### Testing
```sql
-- Setelah migration, cek policy yang aktif
select schemaname, tablename, policyname
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```
