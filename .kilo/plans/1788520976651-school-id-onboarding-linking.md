# Rencana Implementasi — School ID Onboarding dan Multi-Device Linking

**Status:** Implementation-ready — staging schema audit required before Phase 6  
**Tanggal:** 2026-09-10  
**Repository:** `C:\Users\user\Documents\workspace\smartfaceabsen`  
**Cakupan:** identitas sekolah, onboarding pertama, linking manual/QR, reset lokal, sinkronisasi Supabase, migration, pengujian, dan checkpoint development

---

## 1. Tujuan

Mengganti model identitas saat ini:

```text
Device ID + School ID dasar + School ID override
```

menjadi model yang lebih sederhana dan deterministik:

```text
School ID aktif
```

Aturan utama:

1. Aplikasi tidak lagi membuat School ID secara diam-diam saat boot.
2. Instalasi tanpa School ID harus melewati onboarding.
3. Onboarding menawarkan **Generate School ID baru** atau **Link ke School ID yang sudah ada**.
4. Link bukan override sementara, melainkan penggantian permanen School ID aktif.
5. Reset lokal biasa membersihkan data bisnis tetapi mempertahankan School ID aktif.
6. School ID aktif menjadi satu-satunya kunci isolasi untuk push, pull, query lokal, dan UI.
7. Device ID tidak lagi menjadi identitas aktif. Field legacy `attendance_records.device_id` tidak dipakai untuk routing atau isolasi.

---

## 2. Konteks dan Temuan Kode Saat Ini

### 2.1 Identitas masih bercampur

File terkait:

- `src/config/app.ts`
  - `deviceIdKey = 'sf_device_id'`
  - `schoolIdKey = 'sf_school_id'`
  - `schoolIdOverrideKey = 'sf_school_id_override'`
- `src/utils/device.ts`
  - `getOrCreateDeviceId()` membuat Device ID otomatis.
  - `getOrCreateSchoolId()` memilih override terlebih dahulu, lalu membuat UUID baru jika `sf_school_id` kosong.
  - `setSchoolIdOverride()` dan `clearSchoolIdOverride()` masih menjadi jalur perubahan identitas.
- `src/app.ts`
  - Memanggil `getOrCreateDeviceId()` dan `getOrCreateSchoolId()` sebelum onboarding.
  - Akibatnya instalasi baru mendapat School ID otomatis sebelum pengguna memilih Generate atau Link.
- `src/services/database/databaseService.ts`
  - `open()` memanggil `getOrCreateSchoolId()`, sehingga pembukaan IndexedDB juga dapat membuat ID.
- `src/services/settings/settingsService.ts`
  - `AppSettings.deviceId` dan School ID dibaca melalui fungsi auto-create.
- `src/pages/settings/settingsPage.ts`
  - Masih menampilkan **Set Override** dan **Reset ke auto**.
- `src/pages/dashboard/shell.ts`
  - Panel sync masih menampilkan link sebagai override dan menghapus data lokal sebelum menyimpan ID baru.
- `src/services/sync/qrLinkingService.ts`
  - QR menyimpan Supabase URL, anon key, School ID, dan timestamp.
  - `applyPayloadWithReset()` menghapus IndexedDB lalu menyimpan override.

### 2.2 Sinkronisasi sudah memakai School ID sebagai filter aktif

File terkait:

- `src/services/sync/syncService.ts`
  - `pushAll()` dan `pullAll()` membaca School ID aktif.
  - `cloudSelect()` memfilter tabel berdasarkan `school_id`.
  - `face_profiles` difilter melalui relasi `student_id -> students.school_id`.
  - Pull memakai last-write-wins berdasarkan `updated_at` / `updatedAt`.
- `src/services/sync/supabaseClient.ts`
  - Query cloud sudah memfilter School ID, tetapi belum menjadi satu-satunya mekanisme keamanan.
- `src/repositories/attendanceRepository.ts`
  - `AttendanceRecord.deviceId` diisi dari Device ID persisten.

### 2.3 Migration dan keamanan cloud

File terkait:

- `supabase/migrations/001_auth_rls.sql`
- `supabase/migrations/003_sync_columns.sql`
- `supabase/migrations/004_fix_uuid_columns.sql`
- `supabase/migrations/004_face_profiles_school_id.sql`
- `supabase/migrations/005_rebuild_all_tables.sql`
- `supabase/migrations/006_soft_delete.sql`
- `supabase/migrations/007_sync_fixes.sql`

Catatan penting:

- `005_rebuild_all_tables.sql` bersifat destruktif karena DROP tabel. Migration ini tidak boleh dijalankan pada production yang sudah memiliki data tanpa backup dan prosedur khusus.
- Beberapa migration lama memiliki perbedaan tipe `uuid` dan `text`, serta policy yang tidak konsisten.
- RLS saat ini bergantung pada `public.profiles.school_id` melalui `public.get_user_school()`. QR tidak boleh dianggap sebagai mekanisme otorisasi yang menggantikan RLS.
- `attendance_records.device_id` saat ini `text NOT NULL` pada schema rebuild.

---

## 3. Keputusan Desain

### 3.1 Model identitas yang dipilih

**Dipilih: School ID aktif sebagai satu-satunya identitas aktif.**

Tidak ada lagi:

- `sf_school_id_override`
- pilihan “Reset ke auto”
- School ID yang dibuat otomatis saat boot
- Device ID sebagai identitas aktif

Key lokal yang dipertahankan:

```text
sf_school_id
sf_onboarding_completed
sf_school_provisioning_pending
sf_school_link_pending
```

Key legacy yang harus dibersihkan setelah migrasi client:

```text
sf_device_id
sf_school_id_override
```

### 3.2 Generate School ID

Generate hanya terjadi ketika pengguna menekan tombol **Generate School ID baru** pada onboarding.

Urutan:

1. Validasi bahwa belum ada School ID aktif.
2. Buat UUID v4 menggunakan `crypto.randomUUID()`.
3. Simpan ke `sf_school_id`.
4. Tandai `sf_onboarding_completed = 'true'`.
5. Tandai `sf_school_provisioning_pending = 'true'`.
6. Jika user sudah login dan online, panggil provisioning RPC; jika belum, tunda sampai login/online.
7. Arahkan ke dashboard dengan status provisioning pending bila RPC belum selesai.
8. Bootstrap berikutnya hanya menjalankan initial sync setelah provisioning selesai.

Generate tidak boleh dipanggil oleh:

- `app.ts`
- `databaseService.open()`
- `settingsService.load()`
- repository
- sync service

### 3.3 Link dan Replace School ID

Link adalah penggantian permanen.

Urutan wajib:

1. Terima School ID target dari input manual atau QR.
2. Pastikan receiver menggunakan project Supabase yang sama.
3. Validasi UUID dan parameter payload.
4. Pastikan target berbeda dari School ID aktif.
5. Pastikan user sudah login.
6. Pastikan Supabase target dapat diakses.
7. Pastikan user yang login memang diizinkan mengakses School ID target.
8. Tampilkan konfirmasi destruktif yang menyebutkan ID lama dan ID baru.
9. Hentikan auto-sync, scanner kamera, dan operasi sync yang sedang berjalan.
10. Catat state transisi di `sf_school_link_pending`.
11. Hapus semua data bisnis lokal.
12. Simpan School ID baru sebagai satu-satunya School ID aktif.
13. Tandai onboarding tetap completed.
14. Hapus key legacy override dan Device ID jika masih ada.
15. Reload aplikasi.
16. Bootstrap melakukan pull data School ID baru.

Link tidak boleh:

- menyimpan target sebagai override
- mengubah konfigurasi Supabase receiver
- menyimpan dua School ID secara bersamaan
- melakukan push data lama setelah reset
- melanjutkan jika target tidak terverifikasi
- mengubah School ID tanpa konfirmasi eksplisit

### 3.4 Reset lokal

Reset lokal biasa harus mempertahankan:

```text
sf_school_id
sf_onboarding_completed
Supabase runtime config
session auth yang masih valid
```

Reset lokal harus menghapus:

```text
schools
academicYears
classes
students
faceProfiles
attendanceSessions
attendanceRecords
users lokal
settings lokal
syncQueue
sync.lastSyncAt
sync.lastError
```

Setelah reset, aplikasi tetap berada pada School ID yang sama dan dapat melakukan Pull Only untuk mengambil ulang data cloud.

**Batasan yang harus didokumentasikan:** full clear site data, uninstall PWA, atau penghapusan storage browser tetap dapat menghapus School ID. Browser-only storage tidak dapat menjamin identitas bertahan setelah data situs dihapus. Jika requirement-nya adalah “tidak pernah hilang meskipun site data dibersihkan”, diperlukan registrasi School ID di server dan mekanisme recovery berbasis akun; itu diluar cakupan implementasi client-only fase ini.

### 3.5 Device ID legacy

Device ID dihapus dari jalur identitas, bootstrap, settings, QR, dan repository.

Untuk menghindari migration destruktif mendadak:

- `AttendanceRecord.deviceId` diubah menjadi optional/nullable di client.
- Record baru tidak lagi mengisi nilai Device ID.
- Cloud column `attendance_records.device_id` dibuat nullable pada migration additive.
- Nilai lama tetap dapat dibaca selama masa kompatibilitas.
- Penghapusan kolom secara fisik direncanakan pada migration cleanup terpisah setelah tidak ada consumer.

Dengan demikian School ID tetap menjadi satu-satunya identitas aktif, sementara data historis tidak langsung rusak.

### 3.6 QR dan otorisasi

QR adalah mekanisme transfer konfigurasi dan School ID, bukan grant akses.

Payload QR minimum untuk scope project yang sudah dikonfigurasi:

```ts
{
  v: 2,
  purpose: 'school-link',
  projectRef: string,
  schoolId: string,
  schoolName?: string,
  issuedAt: number,
  expiresAt: number,
  nonce: string
}
```

Ketentuan:

- UUID School ID wajib valid.
- `projectRef` adalah identifier public Supabase project, bukan URL lengkap, anon key, token, password, service-role key, atau secret privat lainnya.
- Receiver membandingkan `projectRef` dengan project yang sedang dikonfigurasi; jika tidak sama, link ditolak sebelum reset lokal.
- QR memiliki masa berlaku maksimal 5 menit.
- Nonce bersifat audit/idempotency dan tidak dianggap sebagai otorisasi; QR tetap tidak memberi akses baru.
- Device baru tetap harus login dengan user yang diizinkan oleh RLS untuk School ID target.
- Jika produk membutuhkan QR dapat mendaftarkan user baru ke school tanpa akun yang sudah diizinkan, tambahkan RPC/Edge Function undangan terpisah. Itu tidak boleh disimulasikan dengan RLS longgar.

---

### 3.7 Selected contract — cloud provisioning for Generate

The current RLS model cannot safely accept an arbitrary client-generated School ID: the `schools` row and the current user's membership must exist before sync can succeed.

**Selected contract:** authenticated server provisioning. Generate creates the local UUID immediately and records a pending provisioning state. When the user is authenticated and online, an authenticated RPC/Edge Function creates the `schools` row and assigns the current user. Offline Generate remains usable, but sync remains unavailable until provisioning completes. Open RLS creation is rejected.

This decision updates Phase 1/2 to include pending provisioning state and Phase 6 to include authenticated SQL RPCs with idempotency and membership checks.

### 3.8 Selected flow — onboarding before shell

**Selected contract:** onboarding-first, with authentication required only for Link, cloud verification, and Generate provisioning.

Bootstrap reads identity and onboarding state before rendering the shell. A fresh or incomplete installation renders `/onboarding` without requiring a login. Generate can complete offline and queue provisioning; Link prompts for login when needed, verifies the target, then performs the destructive replacement. Protected routes remain gated until onboarding is complete.

This determines the Phase 1/2 state machine and preserves the offline Generate requirement without exposing protected data before identity is established.

### 3.9 Selected contract — QR project scope

**Selected contract:** QR links operate only within the Supabase project already configured on the receiver. QR v2 carries School ID and link metadata, but never URL or anon key. The receiver rejects the link if its configured project does not match the expected project context. This avoids changing auth sessions, project credentials, and RLS context during linking.

### 3.10 Selected contract — one school per user for this phase

**Selected contract:** one authenticated Supabase user belongs to one school during this change. `profiles.school_id` will be normalized to the same text type as `schools.id`; Generate assigns the current user to the newly provisioned school, and Link is allowed only when the authenticated user's membership already matches the target. Many-to-many membership is explicitly deferred.

This keeps Phase 6 additive and avoids introducing a new membership table, auth-role mapping, and multi-school UI in the same release.

### 3.11 Selected contract — legacy installs

**Selected contract:** preserve the existing valid School ID, verify cloud membership/row on the next authenticated bootstrap, and block sync if provisioning cannot be confirmed. Do not regenerate or silently switch the legacy ID.

- An existing valid `sf_school_id` is treated as onboarding-complete for UI purposes.
- A valid legacy `sf_school_id_override` is promoted once, the override key is cleared, and the promoted ID is subjected to the same cloud verification.
- If the cloud row or membership is absent, show a provisioning-pending/retry state and keep auto-sync disabled.
- Invalid or empty legacy identity still requires onboarding.

This preserves existing local data while preventing an unprovisioned tenant from being treated as synchronized.

### 3.12 Selected contract — post-generate UI

**Selected contract:** after offline Generate, show a restricted provisioning screen or dashboard shell with a login/retry CTA. Do not show protected business data, and keep auto-sync disabled until cloud membership is confirmed.

This preserves the offline-first Generate action without presenting incomplete local data as a fully synchronized school workspace.

### 3.13 Deployment baseline — audit before migration

The repository contains both additive migrations and the destructive `005_rebuild_all_tables.sql`. The implementation must not assume that every migration has been applied in order or that the current Supabase project matches the repository schema.

Before Phase 6, confirm the actual schema and migration history in staging/production, especially:
- whether `005_rebuild_all_tables.sql` has ever been applied;
- whether `profiles.school_id` is still `uuid` while `schools.id` is `text`;
- whether `face_profiles.school_id` exists or was removed by the rebuild;
- whether any anon grants/policies remain;
- whether the provisioning RPC can be added without dropping or recreating tenant tables.

**Selected verification method:** use a non-secret staging schema/migration audit (for example `information_schema`, `pg_dump --schema-only`, and applied migration names). Never put service-role keys or private credentials in chat.

**Implementation rule:** treat the deployed schema as unknown until audited; write `008_school_identity.sql` as additive/idempotent against the actual staging schema, and never use migration 005 as the production upgrade path.

### 3.14 Selected contract — superuser recovery exception

**Selected contract:** normal users can link or provision only the school that matches their one-school membership. A designated Supabase superuser may perform an explicit admin recovery/provisioning action outside that membership, with audit logging and a confirmation step. A QR code still cannot grant access by itself.

This preserves the one-school invariant for normal onboarding while retaining a controlled operational escape hatch for administrators.

### 3.15 Selected mechanism — SQL RPC in migration 008

**Selected mechanism:** implement provisioning as an authenticated SQL RPC in `supabase/migrations/008_school_identity.sql`, not as an Edge Function.

Required RPC contract:
- `provision_school_for_current_user(school_id text)` for normal Generate/recovery.
- Require `auth.uid() IS NOT NULL`; reject anon calls.
- Validate the input as a canonical UUID string before any write.
- Read the caller's `profiles` row and enforce one-school membership.
- If the school row does not exist, insert it idempotently with `created_by = auth.uid()` and a safe default name.
- If the school row already exists, succeed only when it is already owned/assigned to the caller; never let a caller claim another school by guessing its UUID.
- Update `profiles.school_id` only after the school row is confirmed.
- Use `SECURITY DEFINER`, a fixed `search_path`, narrow grants, and no public execute grant.
- Return a structured result indicating `already_provisioned`, `provisioned`, or a safe error category; do not expose internal SQL details.

Add a separate `admin_provision_school(school_id text, target_user_id uuid)` RPC for the selected superuser recovery exception. It must require `profiles.role = 'superuser'`, accept an explicit target user, write an audit row, and never be callable by normal users.

This keeps provisioning in one database migration, avoids a second secret-bearing deployment surface, and makes the security boundary reviewable in SQL.

---

## 4. Arsitektur Alur

### 4.1 Boot aplikasi

```text
main.ts
  -> bootstrap()
     -> baca School ID dan onboarding state
     -> buka IndexedDB tanpa membuat School ID
     -> inisialisasi Supabase client dari konfigurasi yang sudah ada
     -> restore session Auth di background
     -> jika belum onboarding:
          render /onboarding
          jangan render shell
          jangan mulai auto-sync
     -> jika sudah onboarding:
          render shell/router sesuai state Auth
          tampilkan status provisioning bila masih pending
          mulai auto-sync hanya setelah School ID valid dan provisioning selesai
```

### 4.2 Generate

```text
/onboarding
  -> Generate School ID baru
  -> crypto.randomUUID()
  -> simpan sf_school_id
  -> simpan sf_onboarding_completed
  -> simpan sf_school_provisioning_pending = true
  -> jika user sudah login dan online:
       panggil provisioning RPC
       -> sukses: clear pending, tampilkan workspace/dashboard, initial sync
       -> gagal: tetap di state pending, tampilkan retry
  -> jika offline/belum login:
       tampilkan restricted provisioning screen
       -> jangan tampilkan protected business data
       -> auto-sync ditahan
       -> retry saat login/online
```

### 4.3 Link manual/QR

```text
Show QR / input manual
  -> pastikan project Supabase receiver sama
  -> validasi target
  -> pastikan user login
  -> cek akses Supabase/RLS
  -> konfirmasi
  -> stop sync/camera
  -> catat pending replacement
  -> reset local business data
  -> simpan School ID baru
  -> hapus legacy keys
  -> reload
  -> pull School ID baru
```

### 4.4 Reset lokal

```text
Settings / Sync
  -> konfirmasi
  -> stop sync/camera
  -> reset semua tabel lokal
  -> pertahankan sf_school_id dan onboarding
  -> clear status sync
  -> refresh/reload
  -> pull ulang cloud
```

---

## 5. Tahapan Implementasi

### Phase 0 — Persiapan dan baseline

**Tujuan:** memastikan perubahan dimulai dari baseline yang aman.

Langkah:

1. Buat branch baru, misalnya `feature/school-id-onboarding`.
2. Catat commit baseline dan status working tree.
3. Backup data lokal melalui export JSON jika tersedia.
4. Backup schema/data Supabase sebelum migration.
5. Audit migration yang benar-benar sudah diterapkan di project production.
6. Jangan menjalankan `005_rebuild_all_tables.sql` pada production berisi data.
7. Siapkan tiga School ID uji:
   - `SCHOOL_A`
   - `SCHOOL_B`
   - `SCHOOL_NEGATIVE`
8. Siapkan dua user Supabase berbeda untuk uji RLS.

Checkpoint: `CP-00`.

### Phase 1 — School Identity contract

**File target:**

- `src/config/app.ts`
- `src/utils/device.ts`
- `src/services/database/databaseService.ts`
- `src/services/settings/settingsService.ts`
- semua repository yang memanggil `getOrCreateSchoolId()`

Langkah:

1. Tambahkan konstanta:
   - `schoolIdKey`
   - `onboardingCompletedKey`
   - `schoolProvisioningPendingKey`
   - `schoolLinkPendingKey`
2. Hapus `schoolIdOverrideKey` dari kontrak baru.
3. Buat fungsi identitas eksplisit:
   - `readActiveSchoolId(): string | null`
   - `requireActiveSchoolId(): string`
   - `generateSchoolId(): string`
   - `completeSchoolOnboarding(): void`
   - `isSchoolOnboardingCompleted(): boolean`
   - `markSchoolProvisioningPending()`
   - `readSchoolProvisioningPending()`
   - `clearSchoolProvisioningPending()`
   - `readPendingSchoolLink()`
   - `savePendingSchoolLink()`
   - `clearPendingSchoolLink()`
   - `resetLocalDataPreservingSchoolIdentity()`
4. Hapus perilaku auto-generate dari semua fungsi boot dan service.
5. Ubah semua caller menjadi `requireActiveSchoolId()`; jika ID belum ada, lempar error yang dapat ditangani onboarding.
6. Tambahkan kompatibilitas migrasi satu kali:
   - jika hanya `sf_school_id` lama ada, pertahankan dan anggap onboarding sudah selesai
   - jika `sf_school_id_override` ada dan valid, promoted menjadi School ID aktif lalu hapus override
   - jika tidak ada satu pun, wajib onboarding
7. Hapus `getOrCreateDeviceId()` dari bootstrap dan settings.

Pass criteria:

- Tidak ada UUID School ID baru setelah sekadar membuka aplikasi.
- Tidak ada caller yang memakai nama `getOrCreateSchoolId()` untuk membuat ID secara implisit.
- Tidak ada key override yang dipakai oleh logic baru.
- Typecheck lulus.

Fail criteria:

- Refresh halaman tanpa onboarding menghasilkan School ID baru.
- `databaseService.open()` membuat School ID.
- Settings load membuat School ID.
- Override masih memengaruhi hasil query.

Checkpoint: `CP-01`.

### Phase 2 — Onboarding route dan UI

**File target baru:**

- `src/pages/onboarding/onboardingPage.ts`
- `src/pages/onboarding/index.ts`

**File target existing:**

- `src/app.ts`
- `src/pages/dashboard/shell.ts`
- `src/config/app.ts`

Langkah:

1. Tambahkan route `/onboarding` dan restricted `/provisioning` atau state view yang tidak menampilkan data bisnis.
2. Render onboarding sebelum shell jika:
   - School ID null, atau
   - onboarding flag belum true.
3. Buat UI dengan dua pilihan jelas:
   - **Generate School ID baru**
   - **Link ke School ID yang sudah ada**
4. Untuk Link, sediakan input UUID dan tombol validasi. Jika project Supabase receiver tidak sesuai atau user belum login, tampilkan tindakan login/konfigurasi sebelum validasi target.
5. Tambahkan状态 error untuk:
   - UUID tidak valid
   - project Supabase tidak sesuai
   - Supabase belum dikonfigurasi
   - user belum login
   - target tidak dapat diakses
   - target sama dengan ID aktif
6. Tambahkan teks konsekuensi: Link akan menghapus data lokal school lama.
7. Pastikan route onboarding tidak memerlukan auth, tetapi aksi Link tetap memerlukan auth/otorisasi cloud.
8. Pastikan protected routes tidak dapat melewati gate onboarding.
9. Tambahkan accessibility minimal:
   - label input
   - focus setelah render
   - pesan error dengan `role="alert"`
   - tombol disable saat proses berjalan

Pass criteria:

- Instalasi baru selalu melihat onboarding.
- Generate dan Link terlihat jelas sebagai pilihan setara.
- Generate offline menyimpan ID dan state provisioning pending tanpa membuat row cloud.
- Restricted provisioning screen muncul sebelum cloud membership selesai.
- Tidak ada shell/dashboard protected sebelum onboarding selesai.
- Reload saat onboarding tidak membuat ID otomatis.
- Protected route dialihkan ke onboarding jika identity belum lengkap.

Fail criteria:

- Splash stuck.
- Router merender protected dashboard sebelum onboarding selesai.
- Restricted provisioning screen menampilkan data siswa/attendance sebelum provisioning selesai.
- Tombol Generate membuat lebih dari satu ID.
- Link dapat dilanjutkan tanpa target valid.

Checkpoint: `CP-02`.

### Phase 3 — Linking service dan QR v2

**File target:**

- `src/services/sync/qrLinkingService.ts`
- `src/pages/dashboard/shell.ts`
- `src/pages/onboarding/onboardingPage.ts`
- `src/services/sync/supabaseClient.ts`

Langkah:

1. Ubah payload QR menjadi schema v2 dengan `projectRef`, tanpa URL/key project.
2. Tambahkan validasi payload terpusat:
   - versi
   - purpose
   - `projectRef` cocok dengan konfigurasi receiver
   - School ID
   - timestamp/expiry
   - nonce
3. Buat satu fungsi utama, misalnya `linkToSchool(payload, options)`, yang dipakai manual dan QR.
4. Pisahkan fungsi:
   - `validateLinkPayload()`
   - `verifyTargetSchoolAccess()`
   - `prepareLocalReplacement()`
   - `commitSchoolReplacement()`
   - `recoverPendingSchoolReplacement()`
5. Hapus semua direct write ke `sf_school_id_override`.
6. Hapus Device ID dari payload QR.
7. Pastikan scanner berhenti pada sukses, gagal, close, dan unmount.
8. Tambahkan pending state agar reload di tengah transisi tidak meninggalkan state ambigu.
9. Setelah commit, reload dan biarkan bootstrap melakukan pull awal.
10. Jangan pull data target sebelum local reset selesai.

Pass criteria:

- Manual link dan QR memakai fungsi commit yang sama.
- QR expired ditolak.
- QR dari project Supabase berbeda ditolak sebelum perubahan storage.
- QR invalid tidak mengubah storage.
- Target yang sama ditolak tanpa reset.
- Target berbeda hanya disimpan setelah konfirmasi dan verifikasi akses.
- Setelah reload, hanya School ID baru yang terbaca.
- Scanner tidak tetap aktif setelah sukses/gagal.

Fail criteria:

- QR dapat mengubah School ID tanpa verifikasi akses.
- QR mengubah project Supabase receiver.
- QR berisi URL, anon key, atau secret privat.
- Override lama masih terbaca.
- Data school lama masih ada setelah replace.
- Proses stuck di pending state setelah reload.

Checkpoint: `CP-03`.

### Phase 4 — Reset lokal dan recovery

**File target:**

- `src/services/database/databaseService.ts`
- `src/pages/dashboard/shell.ts`
- `src/pages/settings/settingsPage.ts`
- `src/utils/device.ts`

Langkah:

1. Buat reset khusus yang mempertahankan identity keys.
2. Jangan memakai reset umum yang menghapus seluruh localStorage.
3. Hapus hanya key bisnis/sync yang ditentukan.
4. Pertahankan Supabase runtime config dan session auth.
5. Tambahkan recovery saat boot:
   - pending state belum commit dan data sudah terhapus -> commit ID baru
   - pending state gagal sebelum reset -> kembalikan ID lama
   - pending state tidak konsisten -> tampilkan error recovery dan jangan auto-generate
6. Ubah tombol Reset Local Data agar memakai reset khusus.
7. Hapus UI “Reset ke auto”.
8. Tambahkan log development yang mencatat before/after School ID tanpa mencetak data siswa atau embedding.

Pass criteria:

- Reset lokal mempertahankan School ID.
- Reset lokal mempertahankan onboarding flag.
- Setelah reset, Pull Only mengambil data school yang sama.
- Reset tidak menghapus session auth secara tidak sengaja.
- Pending replacement dapat diselesaikan setelah reload.

Fail criteria:

- Reset menghasilkan School ID baru.
- Reset menghapus onboarding flag.
- Reset menghapus runtime Supabase sehingga pull tidak mungkin.
- Pending state menyebabkan data lama dan baru tercampur.

Checkpoint: `CP-04`.

### Phase 5 — Sinkronisasi dan invariant School ID

**File target:**

- `src/services/sync/syncService.ts`
- `src/services/sync/supabaseClient.ts`
- `src/repositories/attendanceRepository.ts`
- `src/repositories/faceProfileRepository.ts`
- `src/models/types.ts`

Langkah:

1. Pastikan semua query lokal memakai `requireActiveSchoolId()` atau parameter School ID eksplisit.
2. Tambahkan defensive check pada Pull:
   - tolak row cloud yang `school_id` tidak sama dengan School ID aktif
   - untuk `face_profiles`, pastikan student asal memang milik School ID aktif
3. Perbaiki laporan error sinkronisasi:
   - error per tabel dari `cloudUpsert()` harus masuk `SyncReport.errors`
   - `runFullSync().ok` harus false jika ada tabel gagal, bukan hanya jika fungsi throw
4. Pastikan urutan push tetap parent-before-child:
   - schools
   - academic years
   - classes
   - students
   - face profiles
   - attendance sessions
   - attendance records
5. Pastikan `pushAll()` tidak mengirim row milik school lain.
6. Pastikan `startAutoSync()` tidak berjalan sebelum onboarding selesai.
7. Ubah `AttendanceRecord.deviceId` menjadi optional/nullable di client.
8. Hapus import/call `getOrCreateDeviceId()` dari repository.
9. Record baru tidak mengisi Device ID.
10. Tambahkan invariant test bahwa semua row lokal memiliki School ID aktif.

Pass criteria:

- Device A dan B dengan School ID sama dapat push/pull data.
- Device dengan School ID berbeda tidak saling melihat data.
- Error satu tabel membuat sync report gagal secara eksplisit.
- Face profile tidak dapat bocor melalui relasi student yang berbeda school.
- Record attendance baru tidak memerlukan Device ID.
- Auto-sync tidak berjalan sebelum onboarding.

Fail criteria:

- Cross-school data muncul di Pull.
- Push mengirim row school lain.
- Sync ditampilkan sukses padahal satu tabel gagal.
- Face profile target tidak dapat ditarik karena join/RLS salah.
- Record baru gagal karena `device_id NOT NULL`.

Checkpoint: `CP-05`.

### Phase 6 — Migration Supabase additive

**File target baru:**

- `supabase/migrations/008_school_identity.sql`
- Supabase SQL RPCs defined by migration 008:
  - `provision_school_for_current_user(text)`
  - `admin_provision_school(text, uuid)`

Migration harus additive dan aman dijalankan pada production setelah backup.

Rencana migration:

1. Tambahkan/normalisasi kolom yang dibutuhkan untuk sync correctness jika belum ada.
2. Tambahkan SQL RPC provisioning terautentikasi `provision_school_for_current_user(text)` yang:
   - hanya menerima UUID School ID yang baru dibuat client
   - membuat row `schools` secara idempotent
   - menetapkan membership user saat ini ke school tersebut
   - menolak school ID milik user/project lain
   - tidak memberikan akses anon
   - memakai `SECURITY DEFINER`, `search_path` tetap, grant sempit, dan tanpa public execute
3. Tambahkan SQL RPC `admin_provision_school(text, uuid)` untuk recovery superuser yang:
   - memverifikasi `profiles.role = 'superuser'`
   - menerima target user secara eksplisit
   - menulis audit log
   - tidak dapat dipanggil user normal
4. Ubah `attendance_records.device_id` menjadi nullable:

```sql
ALTER TABLE public.attendance_records
  ALTER COLUMN device_id DROP NOT NULL;
```

4. Tambahkan index yang diperlukan untuk School ID dan timestamp jika belum ada.
5. Tambahkan migration cleanup terpisah nanti untuk drop `device_id`, bukan di migration ini.
6. Audit dan perbaiki tipe `profiles.school_id` serta helper RLS agar konsisten dengan `schools.id` bertipe text.
7. Pastikan policy berikut aktif dan tidak memberikan akses anon:
   - schools
   - academic_years
   - classes
   - students
   - face_profiles
   - attendance_sessions
   - attendance_records
8. Tambahkan/verifikasi tabel audit untuk provisioning superuser; audit tidak boleh membuka data tenant ke user normal.
9. Jika diperlukan, tambahkan RPC membership/invitation terpisah. Jangan melemahkan RLS hanya agar QR linking berhasil.

Pass criteria:

- Migration dapat dijalankan pada staging yang meniru production.
- Data existing tidak hilang.
- `device_id` lama tetap terbaca.
- Record baru dapat ditulis tanpa `device_id`.
- Anon tidak dapat SELECT/INSERT data school.
- User school A tidak dapat membaca atau menulis school B.
- User yang diizinkan dapat push/pull school-nya.

Fail criteria:

- Migration DROP tabel atau data existing.
- RLS masih membuka akses anon.
- User dapat memilih School ID arbitrer tanpa membership/otorisasi.
- Migration membuat `device_id` wajib sehingga record baru gagal.

Checkpoint: `CP-06`.

### Phase 7 — Uji end-to-end

Gunakan kombinasi unit/pure-function test, browser test, dan Supabase integration test.

#### 7.1 Unit/pure-function test

Cakupan:

- UUID generation
- read/write active School ID
- onboarding flag
- legacy override promotion
- payload encode/decode
- expiry validation
- pending replacement state transition
- reset preservation

Pass:

- Semua test deterministik.
- Tidak ada side effect ke IndexedDB pada pure test.
- Semua invalid input ditolak.

Fail:

- Fungsi generate dipanggil saat read.
- Invalid payload diterima.
- Pending state dapat commit tanpa reset.

#### 7.2 Browser E2E

Skenario wajib:

1. **Fresh install**
   - hapus localStorage dan IndexedDB
   - buka `/`
   - harus muncul onboarding
   - localStorage belum memiliki School ID
2. **Generate**
   - klik Generate
   - tepat satu UUID tersimpan
   - onboarding completed
   - restricted provisioning screen muncul
   - protected data tidak muncul
   - reload tetap memakai UUID yang sama
3. **No silent generation**
   - buka aplikasi baru tanpa ID
   - refresh beberapa kali
   - ID tetap null sampai Generate ditekan
4. **Invalid manual link**
   - input bukan UUID
   - tidak ada perubahan storage
5. **Replace A -> B**
   - isi data lokal A
   - link ke B
   - konfirmasi
   - data A hilang
   - hanya B tersimpan
   - reload dan pull menampilkan data B
6. **QR parity**
   - Show QR dari device A
   - scan dari device B
   - hasil sama dengan manual link
7. **Expired QR**
   - ubah expiry payload pada test harness
   - scan ditolak
8. **Reset local**
   - reset pada device B
   - School ID B tetap
   - data lokal kosong
   - pull ulang berhasil
9. **Offline generate**
   - offline
   - Generate tetap berhasil
   - restricted provisioning screen muncul
   - sync ditandai belum tersedia, bukan gagal membuat ID
10. **Provisioning retry**
    - hasilkan ID saat offline/belum login
    - login atau kembali online
    - retry berhasil
    - pending clear dan sync dapat mulai
11. **Protected route gate**
    - hapus onboarding flag
    - buka `/students`
    - dialihkan ke onboarding
12. **PWA reload**
    - link/replace
    - reload
    - service worker tidak menampilkan School ID lama
13. **Regression**
    - class attendance
    - prayer attendance
    - enrollment
    - reports
    - settings
    - logout/login

Pass criteria browser:

- Tidak ada console error atau unhandled rejection.
- Tidak ada request ke school yang salah.
- Semua selector dan state transition stabil.
- Tidak ada data lama setelah replace/reset.
- QR scanner berhenti pada semua jalur keluar.

Fail criteria browser:

- ID berubah setelah refresh.
- Dashboard protected muncul sebelum onboarding/provisioning selesai.
- Data dua school共存 di IndexedDB.
- QR lama masih dapat dipakai setelah expired.
- Reset menghapus School ID.
- App stuck pada splash atau loading.

#### 7.3 Supabase integration test

Gunakan project staging atau schema khusus uji.

Skenario:

1. Buat school A dan B.
2. Buat user A dan user B.
3. Login user A:
   - hanya row A terlihat
   - insert/update/delete row B ditolak
4. Login user B:
   - hanya row B terlihat
   - insert/update/delete row A ditolak
5. Push dari device A:
   - semua parent/child rows masuk cloud dengan `school_id = A`
6. Pull dari device B yang memiliki School ID A:
   - semua row A masuk local
   - tidak ada row B
7. Pull dari device dengan School ID B:
   - hanya row B
8. Hapus soft-delete:
   - tombstone tidak muncul di UI
   - policy dan query tidak membuka data school lain
9. Hapus cleanup test data.

Pass criteria:

- Count exact sesuai fixture.
- Tidak ada cross-school row.
- RLS menolak akses yang tidak diizinkan.
- Migration rollback/forward dapat dijalankan pada staging.

Fail criteria:

- Anon dapat membaca data.
- User A dapat membaca data B.
- QR/config saja dapat melewati RLS.
- RPC provisioning dapat dipanggil anon.
- User dapat mengklaim School ID milik user lain.
- Superuser admin provisioning tidak tercatat di audit.
- Push/pull gagal karena schema column tidak sesuai.

Checkpoint: `CP-07`.

### Phase 8 — Rollout dan rollback

Rollout:

1. Deploy migration additive ke staging.
2. Jalankan `CP-06`.
3. Deploy client ke preview/PWA staging.
4. Jalankan `CP-02` sampai `CP-07`.
5. Backup production.
6. Terapkan migration production.
7. Deploy client production.
8. Monitor:
   - sync error
   - RLS 401/403
   - pending replacement
   - cross-school complaint
   - PWA cache version
9. Jangan menghapus kolom legacy sebelum satu release tanpa consumer.

Rollback client:

- Kembalikan commit client sebelumnya.
- Jangan menghapus `sf_school_id` saat rollback.
- Jangan mengembalikan override sebagai jalur aktif.
- Jika migration additive sudah diterapkan, rollback code harus tetap kompatibel dengan schema baru.

Rollback database:

- Gunakan backup sebelum migration.
- Jangan menjalankan DROP/rebuild sebagai rollback otomatis.
- Jika hanya `device_id` diubah menjadi nullable, rollback code tetap dapat membaca nilai lama.

Checkpoint: `CP-08`.

---

## 6. Matriks Pass/Fail Utama

| ID | Uji | Pass | Fail |
|---|---|---|---|
| GATE-01 | Fresh install | Onboarding muncul tanpa ID otomatis | ID muncul sebelum Generate/Link |
| GATE-02 | Generate | Satu UUID, onboarding true, restricted provisioning muncul | ID berubah atau data protected muncul sebelum provisioning |
| GATE-03 | Manual link | Validasi, konfirmasi, reset, commit ID baru | Override atau dua ID tersimpan |
| GATE-04 | QR link | Sama dengan manual link, expiry berlaku | QR bypass auth/RLS |
| GATE-05 | Reset lokal | Data hilang, School ID tetap | School ID ikut hilang |
| GATE-06 | Sync A/B | Data school sama tersedia di kedua device | Data school lain muncul |
| GATE-07 | RLS | Anon dan user lintas school ditolak | Ada akses lintas school |
| GATE-08 | Sync error | Error tabel membuat report fail | UI menampilkan sukses parsial sebagai sukses |
| GATE-09 | PWA reload | ID dan data tetap konsisten | Cache menampilkan ID lama |
| GATE-10 | Regression | Attendance, prayer, enrollment, reports tetap jalan | Fitur existing rusak |

Hard fail yang menghentikan rilis:

- cross-school data leakage
- anon RLS access
- silent School ID regeneration
- data lama tidak terhapus setelah replace
- reset menghapus School ID aktif
- QR mengandung secret privat
- migration destruktif tanpa backup
- sync report bohong saat ada error tabel

---

## 7. Checkpoint Record

Gunakan format berikut untuk setiap checkpoint. Catatan harus disimpan di changelog development atau ticket yang corres ponding; jangan hanya mengandalkan ingatan.

```markdown
## CP-XX — Nama checkpoint

- Tanggal:
- Commit:
- Branch:
- Environment:
- Tester/Developer:
- Preconditions:
- Perubahan yang diuji:
- Perintah yang dijalankan:
- Fixture/data uji:
- Hasil yang diharapkan:
- Hasil aktual:
- Bukti:
  - screenshot:
  - log:
  - query SQL:
  - output test:
- Status: PASS / FAIL / BLOCKED
- Defect/temuan:
- Tindakan lanjutan:
- Rollback yang tersedia:
- Approval:
```

### Daftar checkpoint wajib

| Checkpoint | Nama | Gate |
|---|---|---|
| CP-00 | Baseline, backup, dan audit migration | Phase 0 |
| CP-01 | School Identity contract | Phase 1 |
| CP-02 | Onboarding route dan UI | Phase 2 |
| CP-03 | Manual/QR linking dan pending recovery | Phase 3 |
| CP-04 | Reset lokal dan preservation School ID | Phase 4 |
| CP-05 | Sync invariant dan error reporting | Phase 5 |
| CP-06 | Migration additive dan RLS | Phase 6 |
| CP-07 | Browser + Supabase E2E | Phase 7 |
| CP-08 | Rollout, monitoring, dan rollback | Phase 8 |

### Contoh catatan minimal

```markdown
## CP-02 — Onboarding route dan UI

- Tanggal: 2026-09-10
- Commit: `<commit-hash>`
- Environment: Vite dev + Chromium desktop
- Preconditions: localStorage dan IndexedDB kosong
- Hasil yang diharapkan: `/` merender onboarding dan tidak membuat `sf_school_id`
- Hasil aktual: ...
- Bukti: screenshot onboarding, localStorage snapshot, console log
- Status: PASS
```

---

## 8. Risiko dan Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| QR dianggap sebagai otorisasi | Data school dapat bocor jika RLS longgar | QR hanya konfigurasi; akses tetap melalui auth + RLS/membership |
| Full site-data clear menghapus ID | User kehilangan School ID | Dokumentasikan recovery; opsi future: server registration |
| Migration lama destruktif | Data production hilang | Gunakan migration additive baru; jangan jalankan 005 pada production |
| Pending replacement gagal di tengah jalan | ID/data tidak konsisten | State machine + recovery saat boot |
| `device_id NOT NULL` | Record baru gagal setelah Device ID dihapus | Migration nullable sebelum deploy client |
| Face profile tanpa school_id langsung | Join/RLS kompleks dan rawan bocor | Uji relasi student; pertimbangkan kolom school_id langsung pada migration terpisah |
| Error sync per tabel tidak terlihat | User mengira sync sukses | Aggregasi error per tabel dan `ok=false` |
| Service worker stale | ID lama tampil setelah deploy | Versioning, hard reload, dan E2E PWA |
| Existing install punya override | Link lama masih memengaruhi query | Promote override sekali, lalu hapus key |

---

## 9. Asumsi dan Batasan

1. QR tidak memberi hak akses baru. User yang scan QR harus sudah memiliki akses Supabase ke School ID target.
2. School ID yang dihasilkan client hanya unik secara praktis karena UUID v4. Global one-device-one-ID setelah full site-data clear memerlukan server registry.
3. Device ID legacy tidak digunakan untuk isolasi, routing, atau link.
4. Kolom `attendance_records.device_id` tidak langsung di-drop pada rilis pertama; dibuat nullable terlebih dahulu.
5. Migration 005 tidak digunakan untuk upgrade production berisi data.
6. Jika requirement bisnis mengharuskan QR dapat mengundang user baru, tambahkan RPC/Edge Function invitation sebagai scope terpisah sebelum mengendurkan RLS.

---

## 10. Definition of Done

Implementasi dianggap selesai hanya jika:

- semua phase di atas selesai
- `npm run typecheck` lulus
- `npm run build` lulus
- CP-01 sampai CP-07 berstatus PASS
- tidak ada cross-school data leakage
- tidak ada silent School ID generation
- reset lokal mempertahankan School ID
- manual link dan QR link memiliki hasil yang sama
- RLS diverifikasi dengan dua user dan dua school
- migration additive telah diuji pada staging
- rollback client/database telah didokumentasikan
- tidak ada secret privat di QR, log, localStorage, atau bundle client
