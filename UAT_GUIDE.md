# Panduan UAT — SmartFace Attendance

> **Versi**: 0.1.0 (MVP)
> **Tanggal**: 2026-09-05
> **Target User**: SUPERUSER (Admin Madrasah Aliyah Aswaja)
> **Environment**: https://aswja.vercel.app + Supabase project `yrjlmmlnfabbsozhahjn`
> **Durasi UAT**: 1–2 hari

---

## Daftar Isi

1. [Environment Setup (Pra-UAT)](#1-environment-setup-pra-uat)
2. [Akun Test](#2-akun-test)
3. [Test Plan & Standar PASS](#3-test-plan--standar-pass)
   - [TC-01: Auth & Session](#tc-01-auth--session)
   - [TC-02: Master Data](#tc-02-master-data)
   - [TC-03: Face Enrollment](#tc-03-face-enrollment)
   - [TC-04: Attendance Engine](#tc-04-attendance-engine)
   - [TC-05: Dashboard & Reports](#tc-05-dashboard--reports)
   - [TC-06: Sync ke Supabase](#tc-06-sync-ke-supabase)
   - [TC-07: Settings & RBAC](#tc-07-settings--rbac)
   - [TC-08: PWA & Offline](#tc-08-pwa--offline)
4. [Bug Reporting Template](#bug-reporting-template)
5. [Sign-off](#sign-off)

---

## 1. Environment Setup (Pra-UAT)

### 1.1 Backend (Supabase)

Pastikan migration sudah dijalankan:

| # | Migration | Tujuan | Cara Cek |
|---|---|---|---|
| 1 | `001_auth_rls.sql` | Auth + RLS policies | Supabase SQL Editor: `select count(*) from pg_policies where schemaname='public'` harusnya **> 0** |
| 2 | `002_superuser.sql` | 3-role hierarchy | `select * from public.profiles` — pastikan kolom `role` punya 3 nilai valid |

Cara menjalankan:
1. Buka https://supabase.com/dashboard/project/yrjlmmlnfabbsozhahjn/sql/new
2. Copy-paste isi file `supabase/migrations/001_auth_rls.sql` → Run.
3. Copy-paste isi file `supabase/migrations/002_superuser.sql` → Run.

### 1.2 Akun SUPERUSER

Buat user baru:
1. **Authentication** → **Users** → **Add user**.
2. Email: `superuser@aswja.local`
3. Password: `Aswaja@2026!`
4. **Auto Confirm User**: ON
5. Klik **Add user**.
6. Copy **User UID** (UUID format).

Promote ke SUPERUSER:
```sql
update public.profiles
set role = 'SUPERUSER',
    sub_role = 'KEPALA_MADRASAH',
    display_name = 'Superuser UAT',
    school_id = '00000000-0000-0000-0000-000000000001',
    updated_at = now()
where id = '<USER_UID>';
```

### 1.3 School di Supabase

```sql
insert into public.schools (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Madrasah Aliyah Aswaja')
on conflict (id) do nothing;
```

### 1.4 Frontend (Vercel)

1. Buka https://aswja.vercel.app
2. **Hard refresh**: `Ctrl+Shift+R` (Win) / `Cmd+Shift+R` (Mac).
3. Cek **Environment Variables** di Vercel dashboard:
   - `VITE_SUPABASE_URL` = `https://yrjlmmlnfabbsozhahjn.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = (anon public key)

### 1.5 Browser Setup

1. Buka DevTools (F12) → tab **Console**.
2. Pastikan tidak ada error merah saat halaman load.
3. Hard refresh: **Ctrl+Shift+R**.

---

## 2. Akun Test

| Akun | Email | Password | Role | Sub-role | Digunakan Untuk |
|---|---|---|---|---|---|
| Superuser | `superuser@aswja.local` | `Aswaja@2026!` | SUPERUSER | KEPALA_MADRASAH | TC-01, TC-02, TC-07 (full access) |
| Test User | _(akan dibuat saat TC-07)_ | _(acak)_ | USER | GURU_BINA_ASRAMA | TC-07 (limited access) |
| Test Operator | _(akan dibuat saat TC-07)_ | _(acak)_ | OPERATOR | — | TC-07 (view-only) |

---

## 3. Test Plan & Standar PASS

> **Standar PASS Umum**: 100% test case harus PASS untuk MVP siap production.
> Jika ada FAIL, catat di [Bug Reporting Template](#bug-reporting-template).

---

### TC-01: Auth & Session

| # | Test Case | Langkah | Expected | PASS/FAIL |
|---|---|---|---|---|
| TC-01.1 | Buka root URL | Buka `https://aswja.vercel.app` (tanpa trailing slash) | Otomatis redirect ke `/login` | ☐ |
| TC-01.2 | Buka `/dashboard` tanpa login | Logout, ketik `/dashboard` di address bar | Redirect ke `/login` | ☐ |
| TC-01.3 | Login SUPERUSER | Email + password benar → klik Login | Redirect ke `/dashboard`, header tampil `Superuser UAT · SUPERUSER/KEPALA_MADRASAH` | ☐ |
| TC-01.4 | Login wrong password | Email benar + password salah | Error message: "Invalid login credentials" | ☐ |
| TC-01.5 | Login non-existent user | Email tidak ada | Error message: "Invalid login credentials" | ☐ |
| TC-01.6 | Session persistent | Login → refresh halaman | Tetap logged in, tidak ke `/login` | ☐ |
| TC-01.7 | Idle timer display | Setelah login, lihat header | Badge `⏱ 30:00` countdown | ☐ |
| TC-01.8 | Idle decrement | Tunggu 1 menit | Badge jadi `⏱ 29:xx` | ☐ |
| TC-01.9 | Auto-logout setelah 30 menit idle | Buka tab, tinggal 30 menit, kembali | Auto-logout → kembali ke `/login` dengan banner "Session expired" | ☐ |
| TC-01.10 | Activity reset idle | Login → idle 25 menit → klik sesuatu | Idle timer reset ke 30:00 | ☐ |
| TC-01.11 | Logout manual | Settings → klik "Logout" | Redirect ke `/login` | ☐ |
| TC-01.12 | School ID format | Login → Settings → lihat School ID | Format UUID: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | ☐ |

**Kriteria PASS TC-01**: Semua 12 test PASS.

---

### TC-02: Master Data (Kelas, Siswa, Import)

| # | Test Case | Langkah | Expected | PASS/FAIL |
|---|---|---|---|---|
| TC-02.1 | Buka /classes | Klik menu "Kelas" | Halaman "Manajemen Kelas" tampil, kosong | ☐ |
| TC-02.2 | Tambah kelas | Isi grade "XII", nama "XII IPA 1", academic year "2026/2027" → Tambah | Muncul di list, counter "1 kelas" | ☐ |
| TC-02.3 | Tambah kelas duplikat | Coba tambah kelas dengan nama sama | Muncul di list tanpa error (allowed) | ☐ |
| TC-02.4 | Tambah kelas tanpa field | Kosongkan field wajib → Tambah | Error: "Tingkat, nama, dan academic year wajib diisi." | ☐ |
| TC-02.5 | Edit kelas | Klik "Edit" → ubah nama → OK | Nama terupdate di list | ☐ |
| TC-02.6 | Hapus kelas dengan siswa | Tambah siswa di kelas → coba hapus kelas | Error: "Kelas masih memiliki siswa." | ☐ |
| TC-02.7 | Hapus kelas kosong | Hapus kelas yang tidak ada siswa | Kelas hilang dari list | ☐ |
| TC-02.8 | Buka /students | Klik menu "Siswa" | Halaman Manajemen Siswa tampil, kosong | ☐ |
| TC-02.9 | Tambah siswa | Pilih kelas, isi NIS, nama, gender → Tambah | Muncul di list, counter updated | ☐ |
| TC-02.10 | Tambah siswa NIS duplikat | Coba tambah NIS yang sama | Row baru ditambahkan (allowed, sesuai PRD) | ☐ |
| TC-02.11 | Search siswa | Ketik nama/NIS di search | List filter sesuai keyword | ☐ |
| TC-02.12 | Filter by kelas | Pilih kelas di dropdown | List hanya siswa di kelas itu | ☐ |
| TC-02.13 | Edit siswa | Klik "Edit" → ubah nama → OK | Nama terupdate | ☐ |
| TC-02.14 | Hapus siswa | Klik "Hapus" → confirm | Siswa hilang (cascade: face profile juga hilang) | ☐ |
| TC-02.15 | Buka /students/import | Klik menu "Siswa" → cari link "Import" | Halaman Import Siswa tampil | ☐ |
| TC-02.16 | Isi sample CSV | Klik "Isi Sample" → Parse & Preview | 4 row valid, 0 invalid | ☐ |
| TC-02.17 | Import CSV dengan auto-create | Centang "Auto-create kelas jika belum ada" → Import | 4 siswa + 2 kelas baru dibuat | ☐ |
| TC-02.18 | Import CSV invalid | Paste CSV dengan NIS kosong → Parse | Error per row: "NIS kosong" | ☐ |
| TC-02.19 | Skip invalid & import valid | Buat CSV dengan 3 valid + 2 invalid → Skip invalid → Import | Hanya 3 row valid yang masuk | ☐ |
| TC-02.20 | Persistensi | Tambah 5 siswa → refresh | Data masih ada (IndexedDB persist) | ☐ |

**Kriteria PASS TC-02**: Semua 20 test PASS.

**Test Data CSV untuk TC-02.17**:
```csv
NIS,NISN,Nama,L/P,Kelas
24001,1234567890,Ahmad Fauzan,L,XII IPA 1
24002,1234567891,Fatimah Azzahra,P,XII IPA 1
24003,1234567892,Ali Rahman,L,XII IPA 2
24004,1234567893,Nia Kurniasih,P,XII IPA 2
```

---

### TC-03: Face Enrollment

| # | Test Case | Langkah | Expected | PASS/FAIL |
|---|---|---|---|---|
| TC-03.1 | Buka /enrollment | Klik menu "Enrollment" | Halaman "Face Enrollment" tampil | ☐ |
| TC-03.2 | Mulai Kamera | Klik "Mulai Kamera" → izinkan permission | Video preview tampil | ☐ |
| TC-03.3 | Load AI Models | Klik "Load AI Models" | Status "ready" dalam <10 detik | ☐ |
| TC-03.4 | Switch kamera | Klik "Switch" | Kamera berubah front↔back | ☐ |
| TC-03.5 | Enroll siswa (pose front) | Pilih siswa → klik "Enroll" → hadap depan | Progress: "Pose 1/3: Hadap Depan" | ☐ |
| TC-03.6 | Enroll siswa (pose left) | Otomatis lanjut hadap kiri | Progress: "Pose 2/3: Hadap Kiri" | ☐ |
| TC-03.7 | Enroll siswa (pose right) | Otomatis lanjut hadap kanan | Progress: "Pose 3/3: Hadap Kanan" | ☐ |
| TC-03.8 | Enroll selesai | Tunggu sampai "Selesai" | Avg quality ≥ 0.4, status berubah ke "✓ sudah ada face profile" | ☐ |
| TC-03.9 | Re-enroll siswa | Klik "Re-Enroll" pada siswa yang sudah enrolled | Pose 1-3 lagi, profile di-replace | ☐ |
| TC-03.10 | Hapus face profile | Klik "Hapus" pada siswa dengan profile → confirm | Profile hilang, status kembali "⚠ belum ada" | ☐ |
| TC-03.11 | Enroll 5 siswa | Enroll 5 siswa berbeda | Semua 5 tampil "✓ sudah ada face profile" | ☐ |
| TC-03.12 | Persistensi enrollment | Refresh halaman | Face profile siswa masih ada | ☐ |
| TC-03.13 | Filter "Belum ada profile" | Pilih filter "Belum ada profile" | Hanya siswa tanpa profile | ☐ |
| TC-03.14 | Filter "Sudah ada profile" | Pilih filter "Sudah ada profile" | Hanya siswa dengan profile | ☐ |
| TC-03.15 | Quality rendah | Enroll dalam kondisi gelap | Error: "Kualitas wajah rendah..." | ☐ |

**Kriteria PASS TC-03**: Semua 15 test PASS, dengan catatan:
- TC-03.15: dokumentasikan quality score yang didapat, kalau <0.4 itu PASS (tolak)
- Kalau HP tidak bisa face detection di kondisi minim cahaya, cukup catat sebagai LIMITATION

---

### TC-04: Attendance Engine

| # | Test Case | Langkah | Expected | PASS/FAIL |
|---|---|---|---|---|
| TC-04.1 | Buka /attendance | Klik menu "Absensi" | Halaman Sesi Absensi tampil | ☐ |
| TC-04.2 | Buka sesi | Pilih kelas dengan siswa enrolled → klik "Buka Sesi" | Info sesi tampil, status "open" | ☐ |
| TC-04.3 | Mulai Kamera + Load AI | Mulai Kamera → Load AI | Camera aktif, models loaded | ☐ |
| TC-04.4 | Set on-time ke 07:15 | Settings → Aturan Absensi → On-time 07:15 → Simpan | Tersimpan | ☐ |
| TC-04.5 | Recognition siswa enrolled | Klik "Mulai Recognition Loop" → hadap siswa enrolled | HADIR atau TERLAMBAT (tergantung jam sekarang) | ☐ |
| TC-04.6 | Tabel siswa update | Lihat tabel siswa | Siswa yang baru di-scan muncul dengan status + timestamp | ☐ |
| TC-04.7 | Duplicate prevention | Scan siswa yang sama 2x | Yang ke-2: "⚠ sudah diabsen" log, TIDAK duplicate | ☐ |
| TC-04.8 | Scan siswa tidak dikenal | Hadap orang yang belum enrolled | Log: "No match" | ☐ |
| TC-04.9 | Koreksi status post-recognition | Klik dropdown status di tabel siswa → pilih TERLAMBAT | Status updated | ☐ |
| TC-04.10 | Manual entry | Klik "Manual" siswa yang belum diabsen → input "IZIN" | Status IZIN tersimpan | ☐ |
| TC-04.11 | Hapus record | Klik "Batal" di record | Record hilang, siswa kembali "belum" | ☐ |
| TC-04.12 | Test kelas salah | Posisikan wajah siswa dari kelas lain | Log: "⚠ ... bukan anggota kelas ini" | ☐ |
| TC-04.13 | Close sesi | Klik "Close Sesi" → confirm | Sesi status "closed", endTime tercatat | ☐ |
| TC-04.14 | Auto status HADIR vs TERLAMBAT | Ubah on-time ke waktu lewat (mis. 00:00) → scan | Status HADIR (karena lewat on-time) | ☐ |
| TC-04.15 | Auto status TERLAMBAT | Ubah on-time ke waktu yang akan datang (mis. 23:59) → scan | Status TERLAMBAT | ☐ |
| TC-04.16 | Persistensi sesi close | Close sesi → refresh → buka lagi | Sesi sebelumnya tetap "closed" | ☐ |

**Kriteria PASS TC-04**: Semua 16 test PASS.

**Data Setup TC-04**:
- 5 siswa enrolled (dari TC-03)
- 1 siswa tidak enrolled
- Set on-time ke `00:00` (semua = HADIR) atau `23:59` (semua = TERLAMBAT) untuk test yang reliable

---

### TC-05: Dashboard & Reports

| # | Test Case | Langkah | Expected | PASS/FAIL |
|---|---|---|---|---|
| TC-05.1 | Buka /dashboard | Klik menu "Dashboard" | Halaman Dashboard tampil | ☐ |
| TC-05.2 | Top stats real | Dashboard menampilkan metrics | Total Siswa, HADIR, TERLAMBAT, IZIN/SAKIT, ALPA, Belum | ☐ |
| TC-05.3 | Per-class progress | Buka sesi → absensi 2 siswa → refresh dashboard | Kelas tampil dengan progress bar | ☐ |
| TC-05.4 | Recent attendance | Dashboard menampilkan 20 terakhir | HADIR (hijau), TERLAMBAT (kuning), ALPA (merah) | ☐ |
| TC-05.5 | Buka /reports | Klik menu "Laporan" | Halaman Laporan tampil | ☐ |
| TC-05.6 | Filter by kelas | Pilih kelas di dropdown → Terapkan | Tabel hanya siswa di kelas itu | ☐ |
| TC-05.7 | Filter by date range | Pilih "Dari" kemarin, "Sampai" hari ini → Terapkan | Tabel hanya record di range | ☐ |
| TC-05.8 | Filter by status | Pilih status TERLAMBAT → Terapkan | Tabel hanya record TERLAMBAT | ☐ |
| TC-05.9 | Reset filter | Klik "Reset" | Semua filter clear, tabel full | ☐ |
| TC-05.10 | Export CSV | Klik "Export CSV" | File `smartface-attendance-YYYY-MM-DD-HH-MM-SS.csv` terdownload | ☐ |
| TC-05.11 | CSV content | Buka CSV di Excel/Sheets | Header: date, time, class, nis, nisn, student_name, status, confidence, device_id, session_id, record_id | ☐ |
| TC-05.12 | CSV UTF-8 | Buka di Excel | Karakter Indonesia (nama) tampil benar | ☐ |

**Kriteria PASS TC-05**: Semua 12 test PASS.

**Catatan TC-05.12**: Export pakai BOM UTF-8 agar Excel detect encoding.

---

### TC-06: Sync ke Supabase

| # | Test Case | Langkah | Expected | PASS/FAIL |
|---|---|---|---|---|
| TC-06.1 | Login sebagai superuser | Settings → School ID → Copy | UUID ter-copy | ☐ |
| TC-06.2 | Setup school di Supabase | SQL: `insert into public.schools (id, name) values ('<COPIED_UUID>', 'Aswaja')` | Berhasil | ☐ |
| TC-06.3 | Link profile ke school | SQL: `update public.profiles set school_id = '<COPIED_UUID>' where email='superuser@aswja.local'` | 1 row updated | ☐ |
| TC-06.4 | Buka /supabase-test | Klik menu → Supabase Test (jika ada) atau DevTools lihat sync badge | Halaman sync test tampil | ☐ |
| TC-06.5 | Test Koneksi | Klik "Test Koneksi" | Latency <500ms, "✓ Berhasil terhubung" | ☐ |
| TC-06.6 | Counts local vs cloud | Klik "Refresh Counts" | Tabel menampilkan LOCAL & CLOUD counts side-by-side | ☐ |
| TC-06.7 | Full Sync | Klik "Full Sync" | "✓ OK" muncul, pushed & pulled counts | ☐ |
| TC-06.8 | Verify di Supabase | Buka Supabase Table Editor | Tabel `schools` ada 1 row "Aswaja" | ☐ |
| TC-06.9 | Verify classes | Cek tabel `classes` | Rows yang dibuat lokal muncul di cloud | ☐ |
| TC-06.10 | Verify students | Cek tabel `students` | Rows siswa muncul di cloud | ☐ |
| TC-06.11 | Verify face_profiles | Cek tabel `face_profiles` | Embedding 128-dimensi ter-upload | ☐ |
| TC-06.12 | Verify attendance_records | Cek tabel `attendance_records` | Record absensi ada dengan device_id | ☐ |
| TC-06.13 | Sync badge di header | Lihat header di semua halaman | "Sync: ✓ <time>" setelah sync berhasil | ☐ |
| TC-06.14 | Manual sync | Klik sync badge | Trigger sync manual, status update | ☐ |
| TC-06.15 | Auto-sync active | Tunggu 30 detik (auto-sync interval) | Sinkronisasi terjadi otomatis | ☐ |
| TC-06.16 | RLS protection | Buka Supabase SQL Editor: `select * from public.students where school_id != auth.uid()::text` | Hanya data school sendiri yang visible | ☐ |
| TC-06.17 | Offline sync skip | Chrome DevTools → Network: Offline → tunggu 30s | Sync badge jadi "offline", no error spam | ☐ |
| TC-06.18 | Online resume | Toggle online → tunggu 30s | Sync resume otomatis | ☐ |
| TC-06.19 | Multi-device sync | Buka di device 2 (login superuser) → klik Full Sync | Data dari device 1 muncul di device 2 | ☐ |
| TC-06.20 | Conflict resolution | Device 1 edit siswa → sync. Device 2 edit siswa sama → sync | Last-write-wins (updated_at) | ☐ |

**Kriteria PASS TC-06**: Semua 20 test PASS.

---

### TC-07: Settings & RBAC

| # | Test Case | Langkah | Expected | PASS/FAIL |
|---|---|---|---|---|
| TC-07.1 | Buka Settings | Login superuser → Settings | Halaman Pengaturan tampil | ☐ |
| TC-07.2 | Edit nama sekolah | Ubah "Madrasah Aliyah Aswaja" → Simpan | Tersimpan, tampil di Settings | ☐ |
| TC-07.3 | Edit threshold | Geser slider threshold → Simpan | Tersimpan, default 0.80 | ☐ |
| TC-07.4 | Edit attendance rules | Ubah on-time 06:30 → Simpan | Tersimpan | ☐ |
| TC-07.5 | Edit sync interval | Ubah ke 60s → Simpan | Auto-sync jadi 60s | ☐ |
| TC-07.6 | Enable/disable auto-sync | Uncheck → Simpan | Auto-sync stop | ☐ |
| TC-07.7 | Manual sync | Klik "Sync Sekarang" | Sync jalan, status update | ☐ |
| TC-07.8 | Logout dari Settings | Klik "Logout" | Redirect ke `/login` | ☐ |
| TC-07.9 | Akun section | Lihat section "Akun" | Email, role SUPERUSER, sub-role KEPALA_MADRASAH tampil | ☐ |
| TC-07.10 | Supabase connection status | Lihat section "Supabase Connection" | "✓ Connected (env)" atau "✓ Connected (runtime)" | ☐ |
| TC-07.11 | Reset Database (DANGER) | Settings → Danger Zone → Reset DB → confirm 2x | Semua data IndexedDB hilang, redirect atau refresh | ☐ |
| TC-07.12 | Buat akun USER | Login SUPERUSER → (TODO: perlu halaman Admin → Users) | Akun baru dibuat dengan role USER, sub-role Guru Bina | ☐ |
| TC-07.13 | Buat akun OPERATOR | Sama seperti TC-07.12 | Akun baru role OPERATOR | ☐ |
| TC-07.14 | Login sebagai USER | Logout → login USER | Bisa akses Siswa, Enrollment, Absensi | ☐ |
| TC-07.15 | RBAC: USER tidak bisa edit Settings | Login USER → Settings | "Akses Ditolak. Hanya role SUPERUSER..." | ☐ |
| TC-07.16 | RBAC: OPERATOR view-only | Login OPERATOR → Absensi | Hanya bisa view, tidak bisa record | ☐ |
| TC-07.17 | School ID Copy | Settings → Copy School ID | UUID copied to clipboard | ☐ |
| TC-07.18 | Override School ID | Isi UUID valid → Set Override | School ID berubah, log "Refresh halaman" | ☐ |
| TC-07.19 | Override dengan UUID invalid | Isi "bukan-uuid" → Set Override | Log error: "Format UUID tidak valid" | ☐ |
| TC-07.20 | Reset override | Klik "Reset ke auto" | Override hilang, kembali ke auto UUID | ☐ |

**Catatan TC-07.12 & TC-07.13**: Saat ini belum ada halaman UI untuk manage users. **EXPECTED FAIL** untuk test ini, akan diimplementasi di sprint berikutnya. Catat sebagai KNOWN LIMITATION.

**Kriteria PASS TC-07**: Test 1-11 & 14-20 PASS. Test 12-13 di-skip atau dicatat sebagai LIMITATION.

---

### TC-08: PWA & Offline

| # | Test Case | Langkah | Expected | PASS/FAIL |
|---|---|---|---|---|
| TC-08.1 | PWA install button | Buka di Chrome desktop/HP | Tombol "Install App" muncul setelah beberapa detik | ☐ |
| TC-08.2 | PWA install dialog | Klik "Install App" | Native install dialog muncul | ☐ |
| TC-08.3 | PWA installed | Install → buka dari home screen | Terbuka standalone, tidak ada address bar | ☐ |
| TC-08.4 | PWA icons | Cek home screen | Icon SmartFace tampil | ☐ |
| TC-08.5 | Offline mode (DevTools) | DevTools → Network: Offline → refresh | App tetap load (cached) | ☐ |
| TC-08.6 | Offline AI model | Offline → buka /enrollment → Load AI | Model loaded dari cache | ☐ |
| TC-08.7 | Offline recognition | Offline → /attendance → mulai loop | Recognition jalan, HADIR/TERLAMBAT masuk | ☐ |
| TC-08.8 | Offline sync attempt | Offline | Sync badge "offline" (bukan error) | ☐ |
| TC-08.9 | Online resume | Toggle online | Sync resume otomatis | ☐ |
| TC-08.10 | Service worker registered | DevTools → Application → Service Workers | SW aktif, scope "/" | ☐ |
| TC-08.11 | Model cache | DevTools → Application → Cache Storage | Cache `smartface-models` ada | ☐ |
| TC-08.12 | App shell cache | DevTools → Application → Cache Storage | Cache app shell ada | ☐ |

**Kriteria PASS TC-08**: Test 1-9 & 10-12 PASS.

**Catatan**: PWA install penuh mungkin hanya jalan di Chrome Android. Chrome desktop menampilkan tombol install tapi proses install-nya mungkin beda.

---

## 4. Bug Reporting Template

Jika ada test FAIL, laporkan dengan format:

```markdown
### Bug Report

**Test Case**: TC-XX.Y
**Severity**: [Critical/High/Medium/Low]
**Steps to Reproduce**:
1. ...
2. ...
3. ...

**Expected**: ...
**Actual**: ...
**Screenshot/Video**: _(link jika ada)_
**Browser**: Chrome 130 / Android 14
**Console Log**:
```
[paste error]
```

**Device Info**:
- HP: Samsung Galaxy A14
- OS: Android 14
- Network: Wi-Fi 5G
```

Severity levels:
- **Critical**: App crash, data loss, security issue
- **High**: Major feature broken, no workaround
- **Medium**: Feature broken tapi ada workaround
- **Low**: Cosmetic, minor UX issue

---

## 5. Sign-off

### Test Results Summary

| Test Suite | Total | PASS | FAIL | Notes |
|---|---|---|---|---|
| TC-01: Auth & Session | 12 | ___ | ___ | |
| TC-02: Master Data | 20 | ___ | ___ | |
| TC-03: Face Enrollment | 15 | ___ | ___ | |
| TC-04: Attendance Engine | 16 | ___ | ___ | |
| TC-05: Dashboard & Reports | 12 | ___ | ___ | |
| TC-06: Sync ke Supabase | 20 | ___ | ___ | |
| TC-07: Settings & RBAC | 20 | ___ | ___ | TC-07.12-13 known limitation |
| TC-08: PWA & Offline | 12 | ___ | ___ | |
| **TOTAL** | **127** | **___** | **___** | |

### Kriteria Lolos UAT

- ✅ 100% test case PASS (kecuali yang di-mark KNOWN LIMITATION)
- ✅ 0 bug Critical
- ✅ 0 bug High (atau ada workaround yang disetujui)
- ✅ Bug Medium/Low didokumentasikan untuk sprint berikutnya

### Sign-off

- **Tester**: ___________________ Tanggal: ____/____/2026
- **Signature**: ___________________

---

## Lampiran A: Default School UUID

Untuk referensi, default school UUID yang dipakai di Supabase:

```
00000000-0000-0000-0000-000000000001
```

## Lampiran B: Akun Test Default

```
Superuser: superuser@aswja.local / Aswaja@2026!
```

## Lampiran C: Environment Info

```
App URL: https://aswja.vercel.app
Supabase Project: yrjlmmlnfabbsozhahjn
Region: Singapore (sin1)
Bundle: dist/index-*.js (lazy-loaded)
Total precache: 48 entries (~1.7 MB)
```

## Lampiran D: Quick Reset

Jika IndexedDB korup:
1. DevTools → Application → Storage → Clear site data
2. Refresh

Jika School ID perlu di-reset:
```javascript
// DevTools Console
localStorage.removeItem('sf_school_id');
localStorage.removeItem('sf_school_id_override');
location.reload();
```

---

**Semoga UAT lancar! Hubungi tim development jika ada pertanyaan atau butuh guidance.**
