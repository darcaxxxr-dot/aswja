# SmartFace Attendance — Deployment Guide

## Stack
- **Frontend**: Vite + TypeScript (PWA)
- **Database**: IndexedDB (Dexie) + Supabase (PostgreSQL)
- **Camera + Face AI**: MediaDevices API + face-api.js (TinyFaceDetector, FaceLandmark68, FaceRecognitionNet)
- **Hosting**: Vercel (recommended) atau Netlify/Cloudflare Pages

## Arsitektur Offline-First

```
[Browser PWA]
  ├─ IndexedDB (local) ← source of truth saat offline
  ├─ Face AI (on-device)
  └─ Auto-sync 30s → Supabase
              ↓
        [PostgreSQL]
```

Internet **bukan syarat** untuk absensi. Sync dilakukan saat online.

## Deploy ke Vercel

### 1. Push ke GitHub (sudah dilakukan)
```bash
git remote -v
# origin  https://github.com/darcaxxxr-dot/aswja.git (fetch/push)
```

### 2. Import ke Vercel
1. Buka https://vercel.com → **Sign in** dengan GitHub.
2. Klik **"Add New Project"**.
3. Pilih repo **darcaxxxr-dot/aswja**.
4. Framework Preset: **Vite** (auto-detect).
5. **Environment Variables** (Production + Preview + Development):
   - `VITE_SUPABASE_URL` = `https://yrjlmmlnfabbsozhahjn.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = (anon public key Anda)

6. Klik **Deploy**.
7. Tunggu ~2 menit. App live di `https://aswja-<hash>.vercel.app`.

### 3. Setup Supabase untuk Production

#### 3.1 Run Migration
1. Buka https://supabase.com/dashboard/project/yrjlmmlnfabbsozhahjn/sql/new
2. Copy-paste isi file `supabase/migrations/001_auth_rls.sql`.
3. Klik **Run**.

#### 3.2 Disable Email Confirmation (opsional, untuk pilot)
1. Supabase Dashboard → Authentication → Providers → Email.
2. Disable "Confirm email".
3. Save.

#### 3.3 Create Superuser
1. Supabase Dashboard → Authentication → Users → **Add User**.
2. Email: `superuser@aswja.local`
3. Password: (generate strong, mis. `Aswaja@2026!`).
4. **Auto Confirm User**: ON.
5. Klik user yang baru dibuat → copy **User UID**.
6. Promote ke SUPERUSER via SQL Editor:
   ```sql
   update public.profiles
   set role = 'SUPERUSER',
       sub_role = 'KEPALA_MADRASAH',
       display_name = 'Superuser UAT',
       school_id = '00000000-0000-0000-0000-000000000001',
       updated_at = now()
   where id = '<USER_UID>';
   ```

#### 3.3a Setup School ID di Browser (PENTING!)

School ID yang dipakai IndexedDB di browser harus **sama** dengan `school_id` di Supabase profiles. Format HARUS **UUID** (PostgreSQL `uuid` type, bukan string `SCH-XXXX`).

1. Buka https://aswja.vercel.app → `/login`
2. Login sebagai superuser
3. Buka **Settings** → Section "Nama Sekolah"
4. **Copy School ID** (UUID) via tombol "Copy"
5. Di Supabase SQL Editor, set profile.school_id = UUID dari Settings:
   ```sql
   update public.profiles set school_id = '<uuid-dari-settings>' where id = '<USER_UID>';
   ```
6. Atau jika ingin pakai UUID existing, set **Override School ID** di Settings browser.

**Penting:** Tanpa School ID yang cocok (UUID), query `GET /schools?school_id=eq.<id>` akan return **400 Bad Request**. Auto-sync hanya berjalan setelah login, jadi error ini hanya muncul setelah user authenticated.

Atau gunakan SQL untuk create school + link profile sekaligus (di Supabase SQL Editor):
```sql
insert into public.schools (id, name)
values ('<UUID_DARI_SETTINGS>', 'Madrasah Aliyah Aswaja')
on conflict (id) do nothing;

update public.profiles
set school_id = '<UUID_DARI_SETTINGS>'
where id = '<USER_UID>';
```

### 4. Custom Domain (opsional)
Vercel → Settings → Domains → Add domain sekolah (mis. `absen.sekolah.sch.id`).

Update DNS: CNAME `absen` → `cname.vercel-dns.com`.

## Environment Variables

| Variable | Value | Required |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` | Yes |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` (anon public) | Yes |

**Override runtime** (untuk testing): bisa di-set di `/settings` → Supabase Connection → Runtime config. Disimpan di localStorage, tidak perlu rebuild.

## Verifikasi Deployment

Setelah deploy, test:

1. **App terbuka**: https://aswja-xxx.vercel.app → dashboard.
2. **Install button muncul** di Chrome Android.
3. **Login**: ke `/login` → login dengan admin yang dibuat di step 3.3.
4. **Test koneksi Supabase**: `/supabase-test` → Test Koneksi → latency <500ms.
5. **Sync test**: Push Lokal → Cloud → cek row count di Supabase Table Editor.
6. **Multi-device**: buka di device kedua (login sama) → Pull → data dari device 1 muncul.
7. **Offline**: Chrome DevTools → Network: Offline → buka app → tetap jalan.

## Monitoring (opsional)

Tambahkan Vercel Analytics:
1. Vercel Dashboard → Project → Analytics tab → Enable.
2. Bundle: 1.5 MB JS + 6.8 MB model = ~8 MB initial load.
3. Target: First Contentful Paint < 2s.

## Backup & Recovery

- **Local backup**: Settings → Backup → Export JSON.
- **Cloud backup**: Supabase Database → Backups (otomatis harian di paid plan, manual di free plan).
- **Restore**: Settings → Backup → Import JSON.

## Catatan Penting

- `.env` di-ignore oleh `.gitignore` — JANGAN push ke GitHub.
- `VITE_SUPABASE_ANON_KEY` aman di-expose (RLS akan guard).
- Model weights (6.8 MB) di-cache 1 tahun di service worker.
- App fully offline-capable setelah first install + online load.
- PWA installable di Chrome Android dengan HTTPS (Vercel default).

## Troubleshooting

### App tidak bisa install
- Pastikan HTTPS (Vercel otomatis).
- Buka di Chrome Android (bukan Firefox/Safari PWA terbatas).

### Camera tidak jalan
- Izinkan permission di browser.
- Pastikan pakai HTTPS (camera API butuh secure context).

### Supabase connection error
- Cek env vars di Vercel dashboard.
- Cek RLS policies sudah diaktifin (lihat `supabase/migrations/`).
- Cek di `/supabase-test` → "Test Koneksi".

### Sync tidak jalan
- Pastikan auto-sync enabled di `/settings`.
- Cek browser console untuk error.
- Cek di `/supabase-test` → "Full Sync".