# Product Requirements Document (PRD)
# SmartFace Attendance

> **Sistem Absensi Siswa Berbasis Face Recognition menggunakan Smartphone Android**
>
> **Platform:** Web Application / Progressive Web App (PWA)  
> **Frontend:** Vite + TypeScript  
> **Architecture:** Offline-First  
> **Database MVP:** IndexedDB + Dexie (local cache) + Supabase (cloud)  
> **Cloud Sync:** Built-in pada MVP (background sync)  
> **Target Device:** Smartphone Android  
> **Version:** 1.0  
> **Status:** Development Planning

---

# 1. Product Overview

## 1.1 Product Name

**SmartFace Attendance**

Nama ini merupakan nama kerja (*working title*) dan dapat diubah sebelum implementasi produksi.

## 1.2 Product Vision

Membangun sistem absensi siswa berbasis **Face Recognition** yang dapat digunakan menggunakan **kamera smartphone Android**, dengan karakteristik:

- Mudah digunakan.
- Low cost.
- Tidak membutuhkan perangkat khusus.
- Tidak bergantung pada layanan AI berbayar.
- Tetap dapat bekerja tanpa koneksi internet.
- Database dapat dikelola sendiri oleh sekolah.
- Mudah dikembangkan dan dipelihara.
- Dapat digunakan sebagai PWA tanpa harus membuat APK native pada tahap awal.

Alur utama sistem:

```text
Siswa
  ↓
Kamera Smartphone
  ↓
Face Detection
  ↓
Face Recognition
  ↓
Identifikasi Siswa
  ↓
Validasi Attendance
  ↓
Simpan Data
  ↓
Database Lokal
  ↓
Dashboard / Export / Sync
```

---

# 2. Problem Statement

Sistem absensi siswa konvensional memiliki beberapa kelemahan.

## 2.1 Absensi Manual

Permasalahan:

- Membutuhkan waktu.
- Guru harus memanggil siswa satu per satu.
- Berpotensi terjadi kesalahan pencatatan.
- Rekap absensi membutuhkan pekerjaan tambahan.
- Sulit melakukan monitoring secara cepat.

## 2.2 QR Code atau Kartu

Permasalahan:

- Kartu dapat dipinjamkan kepada siswa lain.
- QR Code dapat difoto atau dibagikan.
- Membutuhkan media fisik.
- Tetap memiliki potensi manipulasi.

## 2.3 Face Recognition Berbasis Cloud

Permasalahan:

- Membutuhkan koneksi internet.
- Berpotensi membutuhkan biaya API.
- Bergantung kepada pihak ketiga.
- Data biometrik dapat keluar dari sistem sekolah.
- Maintenance lebih kompleks.

> **Catatan revisi:** SmartFace Attendance tetap **offline-first** untuk proses recognition (AI berjalan di perangkat), namun **database & sinkronisasi** menggunakan Supabase agar data aman, dapat di-backup otomatis, dan dapat diakses multi-device.

---

# 3. Proposed Solution

SmartFace Attendance menggunakan pendekatan **Offline-First Face Recognition**.

Sebagian besar proses dilakukan langsung pada perangkat:

```text
┌─────────────────────────────┐
│     SMARTPHONE ANDROID      │
│                             │
│  Camera                     │
│     ↓                       │
│  Face Detection             │
│     ↓                       │
│  Face Embedding             │
│     ↓                       │
│  Face Matching              │
│     ↓                       │
│  Attendance                 │
│     ↓                       │
│  IndexedDB                  │
└──────────────┬──────────────┘
               │
               │ Optional Sync
               ▼
┌─────────────────────────────┐
│         CLOUD SERVER        │
│                             │
│ PostgreSQL / Supabase       │
│ Authentication              │
│ Backup                      │
│ Multi Device Sync           │
└─────────────────────────────┘
```

Dengan pendekatan tersebut:

> **Internet bukan syarat utama untuk melakukan absensi.**

Alur data:

```text
┌─────────────────────────────┐
│     SMARTPHONE ANDROID      │
│                             │
│  Camera                     │
│     ↓                       │
│  Face Detection             │
│     ↓                       │
│  Face Embedding             │
│     ↓                       │
│  Face Matching (LOCAL)      │
│     ↓                       │
│  Attendance                 │
│     ↓                       │
│  IndexedDB (Dexie)          │
│     ↓                       │
│  Sync Queue                 │
└──────────────┬──────────────┘
               │ Background Sync (saat online)
               ▼
┌─────────────────────────────┐
│         SUPABASE            │
│                             │
│ PostgreSQL                  │
│ Auth                        │
│ Storage                     │
│ Row Level Security          │
│ Realtime (opsional)         │
└─────────────────────────────┘
```

Internet hanya diperlukan untuk:

- Sinkronisasi data ke cloud.
- Backup otomatis.
- Multi-device.
- Administrasi berbasis web (admin dashboard).
- Update aplikasi.

---

# 4. Product Principles

Sistem dikembangkan berdasarkan prinsip berikut.

## 4.1 Offline First

Aplikasi harus tetap dapat digunakan ketika:

- Wi-Fi mati.
- Internet sekolah bermasalah.
- Tidak tersedia jaringan seluler.

Alur utama:

```text
Recognition
    ↓
Attendance
    ↓
IndexedDB
```

Tidak boleh bergantung pada server untuk proses absensi inti.

---

## 4.2 Privacy First

Data biometrik merupakan data sensitif.

Sistem diutamakan menyimpan:

```text
Face Embedding
```

bukan:

```text
Foto wajah mentah
```

Sebisa mungkin proses recognition dilakukan secara lokal.

---

## 4.3 Simple

Guru harus dapat menggunakan sistem tanpa memahami:

- AI.
- Database.
- Server.
- Face embedding.
- Machine learning.

Pengalaman pengguna harus sederhana:

```text
Buka aplikasi
      ↓
Pilih kelas
      ↓
Mulai absensi
      ↓
Siswa melihat kamera
      ↓
Selesai
```

---

## 4.4 Low Cost

Target biaya:

- Tidak membutuhkan server AI.
- Tidak membutuhkan API Face Recognition berbayar.
- Tidak membutuhkan perangkat khusus.
- Menggunakan smartphone Android yang tersedia.

---

## 4.5 Self Managed

Sekolah harus dapat mengelola sendiri:

- Data siswa.
- Data kelas.
- Face enrollment.
- Absensi.
- Backup.
- Export data.

> **Revisi:** "Self-managed" tetap berlaku, namun backend menggunakan **Supabase (managed PostgreSQL)** sehingga sekolah tidak perlu mengoperasikan server sendiri. Akses data tetap melalui aplikasi PWA dan dashboard admin web.

---

## 4.6 Progressive Enhancement

Sistem tidak dibangun sekaligus.

Tahapan:

```text
Proof of Concept
        ↓
MVP
        ↓
Pilot Project
        ↓
Production
        ↓
Cloud Sync
        ↓
Advanced Features
```

---

# 5. Target Users

## 5.1 Admin

Admin memiliki akses untuk:

- Mengelola siswa.
- Mengelola kelas.
- Melakukan face enrollment.
- Mengatur jadwal absensi.
- Melihat laporan.
- Backup database.
- Restore database.
- Mengatur perangkat.

---

## 5.2 Guru

Guru dapat:

- Memulai sesi absensi.
- Memilih kelas.
- Melakukan scanning wajah.
- Melihat hasil absensi.
- Mengubah status siswa jika diperlukan.

---

## 5.3 Siswa

Siswa tidak memerlukan akun.

Alur:

```text
Datang
  ↓
Menghadap Kamera
  ↓
Wajah Terdeteksi
  ↓
Identitas Dikenali
  ↓
Absensi Tercatat
```

---

# 6. Product Scope

## 6.1 MVP Features

| Feature | Priority |
|---|---|
| Camera Access | High |
| Face Detection | High |
| Face Recognition | High |
| Student Management | High |
| Face Enrollment | High |
| Attendance Session | High |
| Attendance Recording | High |
| Duplicate Prevention | High |
| Offline Mode | High |
| IndexedDB | High |
| Supabase Backend | High |
| Auth (Supabase Auth) | High |
| Background Sync | High |
| Row Level Security | High |
| Dashboard | Medium |
| CSV Export | Medium |
| PWA Installation | Medium |

---

## 6.2 Out of Scope untuk MVP

Fitur berikut tidak menjadi prioritas awal:

- WhatsApp notification.
- Parent notification.
- Multi-school (multi-tenant).
- Payroll integration.
- Advanced analytics.
- Native Android APK.
- AI behavior analytics.
- Advanced anti-spoofing (passive liveness).
- Offline-only mode (MVP tetap menggunakan Supabase sebagai backend utama; IndexedDB hanya sebagai cache lokal).

---

# 7. User Flow

## 7.1 Initial Setup

```text
Admin Login
      ↓
Setup School
      ↓
Create Academic Year
      ↓
Create Classes
      ↓
Import Students
      ↓
Face Enrollment
      ↓
System Ready
```

---

# 8. Student Management

Data minimal siswa:

```text
Student ID
NIS / NISN
Nama
Jenis Kelamin
Kelas
Status
```

Contoh:

| ID | NIS | Nama | Kelas |
|---|---|---|---|
| STU-001 | 24001 | Ahmad Fauzan | XII IPA 1 |
| STU-002 | 24002 | Fatimah Azzahra | XII IPA 1 |

---

# 9. Face Enrollment

## 9.1 Enrollment Flow

```text
Select Student
      ↓
Open Camera
      ↓
Detect Face
      ↓
Check Face Quality
      ↓
Capture Sample
      ↓
Generate Face Embedding
      ↓
Save Face Profile
```

---

## 9.2 Recommended Enrollment Samples

Minimal:

```text
1. Front
2. Slight Left
3. Slight Right
```

Opsional:

```text
4. Slight Up
5. Slight Down
```

Tujuan:

Meningkatkan stabilitas recognition dalam berbagai posisi wajah.

---

# 10. Attendance Flow

```text
Teacher Opens Application
        ↓
Select Class
        ↓
Create Attendance Session
        ↓
Open Camera
        ↓
Student Looks at Camera
        ↓
Face Detection
        ↓
Face Quality Check
        ↓
Liveness Check
        ↓
Generate Embedding
        ↓
Similarity Matching
        ↓
Student Identified?
        │
        ├── No
        │      ↓
        │   Unknown
        │
        └── Yes
               ↓
        Duplicate Check
               ↓
        Attendance Status
               ↓
        Save Record
               ↓
        Success Feedback
```

---

# 11. Attendance Status

Status minimal:

```text
HADIR
TERLAMBAT
IZIN
SAKIT
ALPA
```

Face Recognition menghasilkan status otomatis:

```text
HADIR
atau
TERLAMBAT
```

Status lainnya diinput oleh guru/admin.

---

# 12. Attendance Rules

Contoh konfigurasi:

| Setting | Time |
|---|---|
| Attendance Start | 06:30 |
| On Time Until | 07:15 |
| Late After | 07:15 |
| Attendance Close | 08:00 |

Logika:

```text
06:30 – 07:15
      ↓
HADIR

07:15 – 08:00
      ↓
TERLAMBAT
```

---

# 13. Duplicate Prevention

Satu siswa hanya boleh memiliki satu attendance record dalam satu session.

Logical constraint:

```text
student_id
+
attendance_session_id
=
UNIQUE
```

Contoh:

```text
Ahmad
07:02
✓ Attendance Recorded

Ahmad
07:05
⚠ Already Recorded
```

---

# 14. Face Recognition Architecture

Sistem tidak menggunakan metode sederhana:

```text
Camera
  ↓
Compare Photo
```

Tetapi:

```text
Camera
  ↓
Face Detection
  ↓
Face Alignment
  ↓
Face Embedding
  ↓
Vector Representation
  ↓
Similarity Search
  ↓
Identity Matching
```

Contoh konseptual:

```text
Ahmad
[0.14, -0.27, 0.88, ...]

Fatimah
[-0.31, 0.71, 0.22, ...]

Input
[0.15, -0.25, 0.87, ...]
```

Hasil:

```text
Ahmad     → 0.94
Fatimah   → 0.31
Unknown   → 0.22
```

Jika threshold:

```text
>= 0.80
```

maka:

```text
0.94 → MATCH
0.31 → NOT MATCH
```

> Threshold akhir tidak boleh ditentukan secara asal. Threshold harus dikalibrasi berdasarkan hasil pengujian pada siswa dan perangkat target.

---

# 15. Liveness Detection

Tujuan:

Mencegah penggunaan:

- Foto.
- Screenshot.
- Gambar wajah.

Tahap awal menggunakan **Active Liveness Challenge**.

Contoh:

```text
Silakan kedipkan mata
```

atau:

```text
Silakan hadapkan wajah ke kiri
```

Flow:

```text
Face Detected
      ↓
Challenge
      ↓
Movement Detected
      ↓
Recognition
      ↓
Attendance
```

Advanced anti-spoofing menjadi fitur tahap berikutnya.

---

# 16. Database Design

## 16.1 students

```text
id
nis
name
gender
class_id
status
created_at
updated_at
```

---

## 16.2 classes

```text
id
name
grade
academic_year_id
created_at
updated_at
```

---

## 16.3 face_profiles

```text
id
student_id
embedding
model_version
quality_score
created_at
updated_at
```

---

## 16.4 attendance_sessions

```text
id
class_id
date
start_time
end_time
status
created_by
created_at
```

---

## 16.5 attendance_records

```text
id
session_id
student_id
timestamp
status
confidence
device_id
created_at
```

---

## 16.6 users

```text
id
name
username
password_hash
role
created_at
updated_at
```

---

## 16.7 settings

```text
key
value
updated_at
```

---

## 16.8 sync_queue

Digunakan untuk sinkronisasi lokal → Supabase.

```text
id
entity
operation
record_id
status
retry_count
created_at
synced_at
```

Contoh:

```json
{
  "entity": "attendance",
  "operation": "create",
  "recordId": "ATT-001",
  "status": "pending"
}
```

---

## 16.9 Skema Supabase (PostgreSQL)

Skema tabel di Supabase **mirroring** dengan IndexedDB. Tiap tabel di Supabase memiliki kolom `id` (UUID), `school_id`, `device_id`, `created_at`, `updated_at`, dan flag `synced_at` untuk konsistensi dua arah.

Tabel:

```text
schools
academic_years
classes
students
face_profiles
attendance_sessions
attendance_records
users (relasi ke auth.users Supabase)
settings
sync_logs
```

### 16.9.1 Contoh DDL — students

```sql
create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  nis text not null,
  nisn text,
  name text not null,
  gender text check (gender in ('L','P')),
  class_id uuid references public.classes(id),
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (school_id, nis)
);
```

### 16.9.2 Contoh DDL — attendance_records

```sql
create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  session_id uuid references public.attendance_sessions(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  timestamp timestamptz not null,
  status text check (status in ('HADIR','TERLAMBAT','IZIN','SAKIT','ALPA')),
  confidence real,
  device_id text,
  created_at timestamptz default now(),
  unique (session_id, student_id)
);
```

### 16.9.3 Contoh DDL — face_profiles

```sql
create table public.face_profiles (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete cascade,
  embedding real[] not null,    -- array float hasil embedding
  model_version text not null,
  quality_score real,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

> **Catatan privasi:** embedding disimpan terenkripsi di-rest (at-rest encryption) oleh Supabase. Akses dibatasi RLS (lihat Section 24).

### 16.9.4 Row Level Security (RLS)

Aktifkan RLS di semua tabel. Contoh policy untuk `attendance_records`:

```sql
alter table public.attendance_records enable row level security;

create policy "school_isolation"
on public.attendance_records
for all
using (school_id = (auth.jwt() ->> 'school_id')::uuid);
```

---

# 17. Local Database Architecture

Database lokal:

```text
Application
      ↓
Service Layer
      ↓
Repository Layer
      ↓
Dexie
      ↓
IndexedDB
```

UI tidak boleh langsung berinteraksi dengan IndexedDB.

---

# 18. Technology Stack

## 18.1 Frontend

```text
Vite
TypeScript
HTML
CSS
```

---

## 18.2 Database

```text
Dexie.js
    ↓
IndexedDB
```

---

## 18.3 Camera

Menggunakan:

```text
MediaDevices API
```

Contoh konsep:

```typescript
navigator.mediaDevices.getUserMedia()
```

---

## 18.4 Face Recognition Engine

Komponen yang diperlukan:

```text
Face Detection
Face Landmark
Face Embedding
Similarity Matching
```

Pemilihan model harus mempertimbangkan:

- Ukuran model.
- Performa Android.
- Akurasi.
- Lisensi.
- Offline capability.
- Browser compatibility.
- Kecepatan inference.

---

# 19. Project Architecture

```text
smartface-attendance/
│
├── public/
│   ├── icons/
│   └── models/
│
├── src/
│   │
│   ├── components/
│   │
│   ├── pages/
│   │   ├── dashboard/
│   │   ├── students/
│   │   ├── enrollment/
│   │   ├── attendance/
│   │   ├── reports/
│   │   └── settings/
│   │
│   ├── services/
│   │   ├── camera/
│   │   ├── face/
│   │   ├── attendance/
│   │   ├── database/
│   │   └── sync/
│   │
│   ├── repositories/
│   │
│   ├── models/
│   │
│   ├── utils/
│   │
│   ├── config/
│   │
│   ├── router/
│   │
│   ├── styles/
│   │
│   ├── app.ts
│   └── main.ts
│
├── tests/
│
├── index.html
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

# 20. Programming Language

Sistem menggunakan:

```text
TypeScript
```

Alasan:

- Type safety.
- Mengurangi runtime error.
- Mempermudah maintenance.
- Lebih aman untuk struktur data kompleks.
- Cocok untuk aplikasi yang akan berkembang.

Contoh:

```typescript
interface Student {
  id: string;
  nis: string;
  name: string;
  classId: string;
}
```

```typescript
interface AttendanceRecord {
  id: string;
  studentId: string;
  sessionId: string;
  timestamp: number;
  status: AttendanceStatus;
  confidence: number;
}
```

---

# 21. PWA Requirements

Aplikasi harus dapat diinstall sebagai PWA.

Komponen:

```text
manifest.json
service worker
offline cache
application icons
install prompt
```

Target:

```text
Chrome Android
      ↓
Add to Home Screen
      ↓
SmartFace Attendance
```

---

# 22. Offline Architecture

```text
┌─────────────────────────────┐
│     ANDROID SMARTPHONE      │
│                             │
│ Camera                      │
│    ↓                        │
│ Face AI                     │
│    ↓                        │
│ Recognition                 │
│    ↓                        │
│ IndexedDB                   │
│    ↓                        │
│ Sync Queue                  │
└──────────────┬──────────────┘
               │
               │ Internet Available
               ▼
┌─────────────────────────────┐
│        CLOUD BACKEND        │
│                             │
│ PostgreSQL                  │
│ Authentication              │
│ Backup                      │
└─────────────────────────────┘
```

---

# 23. Cloud Architecture — Future Phase

Setelah MVP stabil:

```text
Vite Application
       ↓
Supabase
       ↓
PostgreSQL
       ↓
Authentication
       ↓
Row Level Security
       ↓
Cloud Backup
```

Keuntungan:

- PostgreSQL.
- Authentication.
- API.
- Backup.
- Multi-device synchronization.

---

# 24. Security Requirements

## Authentication

Role minimal:

```text
ADMIN
TEACHER
```

---

## Authorization

Contoh:

| Action | Admin | Teacher |
|---|---:|---:|
| Manage Students | ✓ | Limited |
| Face Enrollment | ✓ | Optional |
| Attendance | ✓ | ✓ |
| Delete Database | ✓ | ✗ |
| Backup | ✓ | ✓ |
| Settings | ✓ | Limited |

---

## Data Protection

Face embedding:

- Tidak disimpan di URL.
- Tidak disimpan di localStorage.
- Tidak diekspos melalui UI.
- Tidak dikirim ke pihak ketiga tanpa kebutuhan yang jelas.

Untuk versi produksi, kebijakan retensi, kontrol akses, backup, dan perlindungan data biometrik harus dirancang sesuai regulasi yang berlaku dan kebijakan institusi.

---

# 25. Backup & Recovery

Admin harus dapat:

## Backup

```text
Export Database
      ↓
JSON Backup
```

Contoh:

```text
smartface-backup-2026-09-04.json
```

## Export Attendance

Format:

```text
CSV
```

Format berikut dapat ditambahkan kemudian:

```text
XLSX
PDF
```

---

# 26. Device Management

Setiap perangkat memiliki:

```text
device_id
```

Contoh:

```text
DEVICE-001
```

Attendance record:

```text
attendance
      ↓
device_id
```

Ini diperlukan jika nantinya sistem menggunakan:

```text
HP Guru A
HP Guru B
Tablet Kelas
Kiosk Absensi
```

---

# 27. Dashboard Requirements

Dashboard minimal:

```text
┌──────────────────────────────┐
│ SMARTFACE ATTENDANCE         │
├──────────────────────────────┤
│                              │
│ TOTAL SISWA                  │
│ 480                          │
│                              │
│ HADIR        TERLAMBAT       │
│ 451              12          │
│                              │
│ BELUM ABSEN                  │
│ 17                           │
├──────────────────────────────┤
│ Recent Attendance            │
│                              │
│ 07:01 Ahmad       ✓          │
│ 07:02 Fatimah     ✓          │
│ 07:03 Ali         ✓          │
└──────────────────────────────┘
```

---

# 28. Application Routes

```text
/dashboard

/students

/students/import

/students/:id

/enrollment

/classes

/attendance

/attendance/:id

/reports

/settings

/backup
```

---

# 29. UX Requirements

Attendance screen harus:

- Mobile-first.
- Tombol besar.
- Mudah digunakan dengan satu tangan.
- Kontras tinggi.
- Feedback visual cepat.
- Tidak membutuhkan banyak input.
- Mendukung feedback suara opsional.

Contoh:

```text
┌─────────────────────────┐
│                         │
│     SCAN WAJAH          │
│                         │
│      [ CAMERA ]         │
│                         │
│                         │
│   ✓ AHMAD FAUZAN        │
│   XII IPA 1             │
│   07:03:21              │
│                         │
└─────────────────────────┘
```

---

# 30. Performance Requirements

## Face Detection

Target awal:

```text
≤ 500 ms
```

Target sebenarnya akan disesuaikan berdasarkan perangkat Android target.

---

## Recognition

Target:

```text
< 1–2 detik
```

---

## Full Attendance Flow

Target:

```text
Face visible
      ↓
Recognition
      ↓
Validation
      ↓
Save Attendance

≤ 2 detik
```

dalam kondisi normal.

---

# 31. Accuracy Requirements

Pengujian harus menggunakan data nyata.

Contoh:

```text
50 siswa
×
5 kondisi pengujian
```

Kondisi:

- Cahaya terang.
- Cahaya rendah.
- Menggunakan kacamata.
- Sudut wajah.
- Jarak berbeda.

Metrik:

```text
True Positive
False Positive
False Negative
Unknown
```

Prinsip utama:

> False acceptance harus diminimalkan.

Lebih baik:

```text
Siswa diminta scan ulang
```

daripada:

```text
Siswa A dikenali sebagai Siswa B
```

---

# 32. Development Roadmap

## PHASE 0 — Technical Feasibility

### Objective

Membuktikan bahwa kamera dan AI dapat berjalan pada perangkat Android target.

### Scope

```text
Vite
  ↓
Camera
  ↓
Face Detection
```

### Checkpoint P0

**PASS jika:**

- Kamera berjalan.
- Permission berfungsi.
- Face detection berjalan.
- Tidak crash.
- Performa dapat diterima.

```text
PASS → P1
FAIL → Fix Technical Issue
```

---

# 33. PHASE 1 — Face Recognition Proof of Concept

### Objective

Membuktikan sistem dapat mengenali identitas wajah.

### Scope

```text
Camera
  ↓
Face Detection
  ↓
Face Embedding
  ↓
Similarity Matching
```

Gunakan:

```text
10 siswa
```

### Checkpoint P1

```text
Known Face
    ↓
Correct Identity

Unknown Face
    ↓
UNKNOWN
```

Jika checkpoint gagal:

> Jangan melanjutkan ke dashboard atau cloud.

Perbaiki recognition terlebih dahulu.

---

# 34. PHASE 2 — Student Management & Enrollment

### Scope

- Tambah siswa.
- Edit siswa.
- Hapus siswa.
- Face enrollment.
- Re-enrollment.
- Enrollment status.

### Checkpoint P2

Admin dapat melakukan seluruh proses enrollment tanpa bantuan developer.

---

# 35. PHASE 3 — Attendance Engine

### Scope

```text
Attendance Session
+
Recognition
+
Duplicate Prevention
+
Timestamp
+
Status
```

### Checkpoint P3

Test:

```text
20 siswa
1 smartphone
```

Target:

```text
Recognition berjalan stabil
Duplicate tidak tercatat
Attendance tersimpan
```

---

# 36. PHASE 4 — Dashboard & Reporting

### Scope

- Attendance list.
- Student list.
- Search.
- Filter.
- Class filter.
- Daily report.
- CSV export.

### Checkpoint P4

Guru dapat:

```text
Mulai absensi
      ↓
Melihat hasil
      ↓
Mencari siswa
      ↓
Export data
```

tanpa bantuan developer.

---

# 37. PHASE 5 — PWA & Offline

### Scope

```text
Manifest
Service Worker
Cache
Offline Access
Installability
```

### Critical Checkpoint P5

Lakukan:

```text
Install Application
      ↓
Disable Wi-Fi
      ↓
Disable Mobile Data
      ↓
Open Application
      ↓
Start Camera
      ↓
Face Recognition
      ↓
Save Attendance
```

Jika berhasil:

```text
PASS
```

Jika tidak:

```text
Fix Offline Architecture
```

---

# 38. PHASE 6 — Pilot Project

Jangan langsung diterapkan ke seluruh sekolah.

Pilot:

```text
1 Kelas
20–40 Siswa
3–7 Hari
```

Data yang dicatat:

```text
Recognition Success Rate
False Recognition
Unknown Rate
Average Scan Duration
Battery Usage
Device Temperature
Crash Log
```

---

# 39. PHASE 7 — Optimization

Optimasi berdasarkan data pilot.

Variabel:

```text
Recognition Threshold
Camera Resolution
Inference Frequency
Frame Processing
Model Size
Database Query
UI Performance
```

---

# 40. PHASE 8 — Production Rollout

Deployment dilakukan bertahap:

```text
1 Kelas
  ↓
1 Tingkat
  ↓
Multiple Classes
  ↓
Full School
```

Tidak disarankan:

```text
Direct Full Deployment
```

tanpa pilot.

---

# 41. Development Gate System

```text
P0 — Camera
│
├── PASS → P1
└── FAIL → FIX
           ↓
P1 — Recognition
│
├── PASS → P2
└── FAIL → STOP & FIX
           ↓
P2 — Enrollment
│
├── PASS → P3
└── FAIL → FIX
           ↓
P3 — Attendance
│
├── PASS → P4
└── FAIL → FIX
           ↓
P4 — Dashboard
│
├── PASS → P5
└── FAIL → FIX
           ↓
P5 — Offline
│
├── PASS → PILOT
└── FAIL → FIX
           ↓
PILOT
│
├── PASS → PRODUCTION
└── FAIL → OPTIMIZATION
```

---

# 42. Definition of Done — MVP

## Functional

- [ ] Student CRUD.
- [ ] Class CRUD.
- [ ] Face enrollment.
- [ ] Re-enrollment.
- [ ] Camera access.
- [ ] Face detection.
- [ ] Face recognition.
- [ ] Unknown face detection.
- [ ] Attendance session.
- [ ] Attendance recording.
- [ ] Duplicate prevention.
- [ ] Late calculation.
- [ ] Dashboard.
- [ ] Search.
- [ ] CSV export.

## Offline

- [ ] Application opens offline.
- [ ] AI works offline.
- [ ] IndexedDB works offline.
- [ ] Attendance works offline.

## PWA

- [ ] Installable.
- [ ] Application icon.
- [ ] Service worker.
- [ ] Offline cache.

## Security

- [ ] Authentication.
- [ ] Role authorization.
- [ ] Backup.
- [ ] Data access control.

---

# 43. Git Strategy

Branch structure:

```text
main
│
├── develop
│
├── feature/camera
├── feature/face-recognition
├── feature/enrollment
├── feature/attendance
├── feature/dashboard
└── feature/pwa
```

Commit convention:

```text
feat: add camera service

feat: implement face detection

feat: add student repository

feat: add attendance session

fix: prevent duplicate attendance

fix: improve recognition threshold
```

---

# 44. Development Environment

Required:

```text
Node.js
npm
Vite
TypeScript
VS Code
Git
Google Chrome
Android Smartphone
```

Project initialization:

```bash
npm create vite@latest smartface-attendance -- --template vanilla-ts

cd smartface-attendance

npm install

npm run dev
```

Development server:

```text
http://localhost:5173
```

---

# 45. Recommended Development Sequence

Development dilakukan secara bertahap:

```text
01 — Vite + TypeScript
          ↓
02 — Application Shell
          ↓
03 — Camera Service
          ↓
04 — Face Detection
          ↓
05 — Face Embedding
          ↓
06 — Recognition Engine
          ↓
07 — IndexedDB
          ↓
08 — Student Management
          ↓
09 — Face Enrollment
          ↓
10 — Attendance Engine
          ↓
11 — Dashboard
          ↓
12 — Reporting & Export
          ↓
13 — PWA
          ↓
14 — Offline Testing
          ↓
15 — Pilot Project
          ↓
16 — Cloud Sync
```

---

# 46. Future Architecture

Setelah sistem MVP stabil:

```text
                    SMARTFACE
                        │
          ┌─────────────┴─────────────┐
          │                           │
      ANDROID PWA                 ADMIN WEB
          │                           │
       CAMERA                     DASHBOARD
          │                           │
     FACE AI                    MANAGEMENT
          │                           │
      INDEXEDDB                       │
          │                           │
          └─────────────┬─────────────┘
                        │
                       SYNC
                        │
                   SUPABASE
                        │
              ┌─────────┴─────────┐
              │                   │
          POSTGRESQL            BACKUP
```

---

# 47. Recommended Sprint Plan

## Sprint 1 — Foundation

### Goal

Membuat fondasi aplikasi.

### Deliverables

- Vite.
- TypeScript.
- Project structure.
- Routing.
- Basic UI.
- Camera access.

### Checkpoint

```text
Android Camera Working
```

---

## Sprint 2 — Face AI

### Goal

Face Detection dan Face Recognition.

### Deliverables

- AI model integration.
- Face detection.
- Face embedding.
- Similarity matching.

### Checkpoint

```text
Known Face → Correct Identity
Unknown Face → Unknown
```

---

## Sprint 3 — Local Database

### Goal

Student database dan face profile.

### Deliverables

- Dexie.
- IndexedDB.
- Student repository.
- Face profile storage.

### Checkpoint

```text
Close Application
      ↓
Open Again
      ↓
Data Still Available
```

---

## Sprint 4 — Enrollment

### Deliverables

- Enrollment page.
- Multi-sample capture.
- Face quality validation.
- Re-enrollment.

---

## Sprint 5 — Attendance Engine

### Deliverables

- Attendance session.
- Duplicate prevention.
- Timestamp.
- Status calculation.

---

## Sprint 6 — Dashboard & Reporting

### Deliverables

- Dashboard.
- Attendance history.
- Search.
- Filter.
- CSV export.

---

## Sprint 7 — PWA

### Deliverables

- Installable application.
- Service worker.
- Offline cache.

---

## Sprint 8 — Pilot

### Target

```text
1 Class
20–40 Students
```

### Duration

```text
3–7 Days
```

---

# 48. Final Recommendation

Arsitektur yang direkomendasikan untuk tahap pertama:

```text
VITE
  +
TYPESCRIPT
  +
VANILLA UI / LIGHTWEIGHT UI ARCHITECTURE
  +
FACE AI
  +
DEXIE
  +
INDEXEDDB
  +
PWA
```

Arsitektur tersebut dipilih karena:

- Relatif ringan.
- Low cost.
- Mudah dikembangkan.
- Tidak membutuhkan backend pada MVP.
- Dapat bekerja offline.
- Cocok untuk Android.
- Mudah di-maintain.
- Dapat dikembangkan menjadi cloud architecture.

---

# 49. Immediate Next Step

Development dimulai dari:

```text
SPRINT 1

Vite
  +
TypeScript
  +
Project Architecture
  +
Application Shell
  +
Camera Service
```

Setelah Sprint 1 berhasil:

```text
CHECKPOINT P0
```

Jika kamera berjalan stabil pada smartphone Android:

```text
SPRINT 2
↓
Face Detection
↓
Face Recognition Proof of Concept
```

---

# END OF PRD

**SmartFace Attendance — Offline-First Face Recognition Attendance System**

> Prinsip utama proyek:
>
> **Buktikan AI terlebih dahulu, bangun sistem kedua, dan scale setelah pilot berhasil.**