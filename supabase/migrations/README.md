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
