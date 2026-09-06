# Architecture Documentation: Enrollment & Attendance Menus

## 1. File Responsibility Map

### 1.1 Enrollment Menu

| File | Responsibility |
|------|---------------|
| `src/pages/enrollment/enrollmentPage.ts` | UI controller: camera placeholders, student table, enrollment workflow orchestration, overlay canvas drawing (bounding box, quality score, center guide lines), button bindings |
| `src/services/enrollment/enrollmentService.ts` | Application service: `enrollStudent`, `enrollStudentWithFlow` (liveness + 3 poses × 3 retries), `reEnroll`, `loadAllEmbeddings`, `removeProfile`, `recognize` helper |
| `src/services/face/faceEnrollmentService.ts` | Core face enrollment: `captureSample` (detection + quality + blur gate), `enroll` (5-sample multi-vector capture, returns `EmbeddingRecord` with `number[][]` embedding) |
| `src/services/face/faceEmbeddingService.ts` | Low-level embedding extraction: `computeFromVideo`, `computeFromImage`, `computeQualityScore`, Laplacian variance sharpness/lighting stats, blur threshold constant |
| `src/services/face/faceMatchingService.ts` | Matching engine: Euclidean distance / cosine similarity, adaptive threshold, multi-vector best-match aggregation, `averageEmbeddings` utility |
| `src/services/face/faceRecognitionService.ts` | Recognition orchestration: `recognize`, `recognizeFromEmbedding`, `detectOnly` — delegates to embedding + matching services |
| `src/services/face/modelLoader.ts` | Model lifecycle: lazy-load TinyFaceDetector, FaceLandmark68Net, FaceRecognitionNet, initializes WebGL backend |
| `src/services/face/livenessService.ts` | Liveness challenge: blink detection (EAR), turn-left/right (nose displacement), max duration timeout |
| `src/services/face/types.ts` | Face-domain types: `FaceBox`, `EmbeddingRecord` (multi-vector `number[][]`), `EnrollmentSample`, `LivenessResult`, `FaceError` |
| `src/repositories/faceProfileRepository.ts` | Persistence: CRUD for `faceProfiles` table, `replaceForStudent` (bulk delete + bulk add), `listForStudent`, `getPrimaryForStudent` |
| `src/repositories/studentRepository.ts` | Student CRUD; cascade delete of face profiles when student removed |
| `src/models/types.ts` | Domain model: `FaceProfile.embedding` is `number[][]` (5 vectors × 128-d), `Student`, `ClassRoom` |
| `src/config/app.ts` | `FACE_CONFIG.inputSize = 224`, `FACE_CONFIG.scoreThreshold = 0.45` |
| `src/services/sync/syncService.ts` | Cloud sync: serializes `number[][]` embeddings to Supabase, injects `school_id` into `face_profiles` rows |

### 1.2 Attendance Menu

| File | Responsibility |
|------|---------------|
| `src/pages/attendance/attendancePage.ts` | UI controller: class/session selection, camera start/stop, recognition loop RAF, overlay box drawing, student table rendering, manual/override attendance actions, time config form |
| `src/services/attendance/attendanceService.ts` | Application service: `AttendanceConfigService` (load/save on-time/late/close thresholds), `determineAutoStatus`, `openSession`, `closeSession`, `recognizeForSession` (liveness + face match + record), `recordAttendance`, `markManual`, `updateStatus`, `getSessionSummary` |
| `src/services/face/faceRecognitionService.ts` | Recognition: same service as enrollment, called here with `db` of all student embeddings |
| `src/services/face/livenessService.ts` | Optional liveness gate before attendance recognition |
| `src/services/face/modelLoader.ts` | Ensures models loaded before recognition loop |
| `src/repositories/attendanceRepository.ts` | Persistence: `createSession`, `closeSession`, `listRecords`, `recordAttendance` (duplicate guard via `[sessionId+studentId]` index), `updateRecordStatus`, `removeRecord` |
| `src/repositories/studentRepository.ts` | Student lookup by class for session roster |
| `src/repositories/classRepository.ts` | Class list for session selection dropdown |
| `src/repositories/settingRepository.ts` | Loads/saves attendance config (`attendance.onTimeUntil`, `attendance.lateAfter`, `attendance.closeAt`, `face.threshold`) |
| `src/models/types.ts` | Domain models: `AttendanceSession`, `AttendanceRecord`, `AttendanceStatus`, `SessionStatus` |
| `src/services/sync/syncService.ts` | Syncs `attendance_sessions` and `attendance_records` to Supabase; maps timestamps to ISO strings |

---

## 2. Business Process

### 2.1 Enrollment Flow

```
[Admin/Guru]
    │
    ▼
Pilih Siswa (belum punya profile)
    │
    ▼
Mulai Kamera + Load AI Models
    │
    ▼
Verifikasi Liveness (3 retries)
    │   ├─ blink  → EAR threshold
    │   ├─ turn_left  → nose displacement kiri
    │   └─ turn_right → nose displacement kanan
    ▼
Capture 5 Samples (multi-vector)
    │   ├─ Pose: front / left / right (cycling)
    │   ├─ Per sample: detect face → quality score → blur gate (lapVar ≥ 100)
    │   └─ Retry per pose: 3x
    ▼
Simpan ke IndexedDB (faceProfiles)
    │   └─ embedding: number[][] (5 × 128-d vectors)
    ▼
Push ke Supabase (async)
```

**Business Rules:**
- Setiap siswa minimal 1 face profile (5 embeddings).
- Enrollment menggantikan semua profile lama (`replaceForStudent`).
- Liveness wajib sebelum enrollment (konfigurasi `face.livenessChallenge`).
- Sample ditolak jika quality < 0.4 atau Laplacian variance < 100.

### 2.2 Attendance Flow

```
[Admin/Guru]
    │
    ▼
Pilih Kelas + Buka Sesi (date = hari ini)
    │   └─ Session: status=open, createdBy=admin
    ▼
Mulai Kamera + Load AI Models
    │
    ▼
Mulai Recognition Loop (~600ms interval)
    │
    ├─ [Optional] Liveness Check
    │   └─ Jika gagal → skip frame
    │
    ├─ Face Detection + Embedding
    │   └─ TinyFaceDetector inputSize=224
    │
    ├─ Matching vs Database (multi-vector)
    │   ├─ Euclidean distance per stored vector
    │   ├─ Ambil distance minimum per student
    │   └─ Threshold: configurable (default 0.48)
    │
    ├─ Jika MATCHED:
    │   ├─ Validasi student ada di kelas sesi ini
    │   ├─ Cek duplicate (sessionId + studentId)
    │   └─ Record attendance:
    │       ├─ HADIR jika before on-time
    │       └─ TERLAMBAT jika after on-time
    │
    └─ Overlay: bounding box + label + confidence
    ▼
Close Sesi (manual)
    └─ status → closed, endTime diset
```

**Business Rules:**
- Sesi per kelas per hari (unique: `schoolId + classId + date`).
- Satu siswa maksimal 1 record per sesi (duplicate guard).
- Auto-status: before `onTimeUntil` → HADIR, after → TERLAMBAT.
- Manual override: ADMIN/GURU bisa ubah status ke IZIN/SAKIT/ALPA.
- Liveness optional via config `attendance.livenessEnabled`.

---

## 3. Technical Explanation

### 3.1 Face AI Pipeline

```
Video Frame (640×480)
    │
    ▼
TinyFaceDetector (inputSize=224, scoreThreshold=0.45)
    │   └─ WebGL backend via faceapi.tf.setBackend('webgl')
    ▼
FaceLandmark68Net → 68 landmarks
    │
    ▼
FaceRecognitionNet → 128-d descriptor
    │
    ▼
ROI Stats (64×64 crop → grayscale → Laplacian)
    │   ├─ sharpness = lapVar / 150 (clamped 0-1)
    │   ├─ lighting = luminance + contrast score
    │   └─ lapVar: variance Laplacian untuk blur gate
    ▼
Quality Score = 0.3×detection + 0.25×sizeRatio + 0.15×centering + 0.15×sharpness + 0.15×lighting
```

### 3.2 Multi-Vector Matching

| Aspect | Detail |
|--------|--------|
| Storage | `FaceProfile.embedding: number[][]` — 5 vectors × 128 dimensi |
| Enrollment | 5 samples diambil (pose cycling front/left/right), TIDAK di-average |
| Matching | Untuk setiap student, hitung Euclidean distance ke semua 5 stored vectors, ambil **minimum** |
| Threshold | Default 0.48 (Euclidean distance), adaptive lift `+min(0.03, log10(N)×0.008)` |
| Fallback | Jika `embedding` adalah `number[]` (legacy), wrapping ke `[embedding]` |

### 3.3 Blur Gate

| Metric | Value | Action |
|--------|-------|--------|
| Laplacian variance (`lapVar`) | < 100 | Reject sample: "Wajah terlalu blur" |
| Quality score | < 0.4 | Reject sample: "Kualitas wajah rendah" |
| Both checked in | `captureSample()` | Throw `FaceError` → retry up to 3x |

### 3.4 Liveness Challenges

| Challenge | Detection Logic | Default |
|-----------|----------------|---------|
| `blink` | Both eyes EAR < 0.18 untuk 1 frame | Default |
| `turn_left` | Nose X displacement < -0.012 (relative to first frame), minimal vertikal | Optional |
| `turn_right` | Nose X displacement > +0.012 | Optional |

**Config keys:** `face.livenessChallenge`, `attendance.livenessEnabled`.

### 3.5 Key Algorithms

- **Eye Aspect Ratio (EAR):** `(vertical1 + vertical2) / (2 × horizontal)` — untuk blink detection.
- **Adaptive Threshold:** `baseThreshold + min(0.03, log10(dbSize) × 0.008)` — mencegah false positive saat database besar.
- **Duplicate Guard:** Compound index `[sessionId+studentId]` di Dexie + explicit `hasRecord()` check sebelum insert.

---

## 4. Database Relations

### 4.1 Entity Relationship (IndexedDB / Dexie)

```
School (1) ───< (N) AcademicYear
   │
   ├───< (N) ClassRoom
   │        │
   │        ├───< (N) Student
   │        │        │
   │        │        ├───< (N) FaceProfile  (embedding: number[][])
   │        │        │
   │        │        └───< (N) AttendanceRecord
   │        │
   │        └───< (N) AttendanceSession
   │                 │
   │                 └───< (N) AttendanceRecord
   │
   └───< (N) User

Setting (key-value, no FK)
SyncQueue (entity + operation + status)
```

### 4.2 Table Definitions (Dexie)

| Table | Primary Key | Indexed Fields | Compound Indexes |
|-------|-------------|----------------|------------------|
| `schools` | `id` | `name`, `createdAt` | — |
| `academicYears` | `id` | `schoolId`, `name`, `isActive`, `startDate`, `endDate`, `createdAt`, `updatedAt` | — |
| `classes` | `id` | `schoolId`, `academicYearId`, `grade`, `name`, `createdAt` | `[schoolId+grade+name]` |
| `students` | `id` | `schoolId`, `nis`, `classId`, `status`, `name`, `createdAt` | `[schoolId+classId]`, `[schoolId+nis]` |
| `faceProfiles` | `id` | `studentId`, `modelVersion`, `createdAt` | — |
| `attendanceSessions` | `id` | `schoolId`, `classId`, `date`, `status`, `createdAt` | `[schoolId+classId+date]` |
| `attendanceRecords` | `id` | `schoolId`, `sessionId`, `studentId`, `status`, `timestamp` | `[sessionId+studentId]`, `[sessionId+timestamp]` |
| `users` | `id` | `schoolId`, `username`, `role`, `createdAt` | `[schoolId+username]` |
| `settings` | `key` | `updatedAt` | — |
| `syncQueue` | `id` | `entity`, `status`, `createdAt` | `[entity+status]` |

### 4.3 Critical Relations & Integrity

| Relation | Enforcement |
|----------|-------------|
| `Student → ClassRoom` | `student.classId` references `classes.id` (app-level) |
| `Student → FaceProfile` | Cascade delete via transaction: hapus student → hapus `faceProfiles` where `studentId` |
| `AttendanceSession → ClassRoom` | `session.classId` references `classes.id` |
| `AttendanceRecord → AttendanceSession` | `record.sessionId` references `sessions.id` |
| `AttendanceRecord → Student` | `record.studentId` references `students.id` |
| `AttendanceRecord` uniqueness | Compound index `[sessionId+studentId]` + `hasRecord()` guard |
| `AttendanceSession` uniqueness per day | Compound index `[schoolId+classId+date]` + `listSessionsByClass` lookup |

### 4.4 Supabase Cloud Mapping

| Local Table | Cloud Table | Notes |
|-------------|-------------|-------|
| `faceProfiles` | `face_profiles` | `embedding` serialized as `number[][]` JSON; `school_id` injected from student's `schoolId` |
| `attendanceSessions` | `attendance_sessions` | `startTime`/`endTime` → `start_time`/`end_time` ISO strings; `date` kept as `YYYY-MM-DD` |
| `attendanceRecords` | `attendance_records` | `timestamp` → ISO string; `createdAt` → `created_at` |
| `students` | `students` | `school_id` injected |
| `classes` | `classes` | `school_id`, `academic_year_id` injected |
| `syncQueue` | _(not synced)_ | Local-only queue |

---

## 5. Configuration Reference

| Key | Default | Used By | Description |
|-----|---------|---------|-------------|
| `FACE_CONFIG.inputSize` | `224` | TinyFaceDetector | Ukuran input inference (px) |
| `FACE_CONFIG.scoreThreshold` | `0.45` | TinyFaceDetector | Minimum detection confidence |
| `face.minQualityScore` | `0.4` | Enrollment | Minimum quality score untuk sample |
| `face.livenessChallenge` | `blink` | Enrollment, Attendance | Tipe liveness challenge |
| `attendance.onTimeUntil` | `07:15` | Attendance | Batas jam HADIR |
| `attendance.lateAfter` | `07:15` | Attendance | Batas awal TERLAMBAT |
| `attendance.closeAt` | `08:00` | Attendance | Batas akhir sesi |
| `face.threshold` | `0.48` | Attendance | Euclidean distance threshold |
| `attendance.livenessEnabled` | `false` | Attendance | Enable/disable liveness sebelum absensi |

---

## 6. Route Map

| Route | Page File | Service |
|-------|-----------|---------|
| `/enrollment` | `src/pages/enrollment/enrollmentPage.ts` | `enrollmentService` |
| `/attendance` | `src/pages/attendance/attendancePage.ts` | `attendanceService` |

---

## 7. Data Flow Diagram (Text)

```
Enrollment:
  enrollmentPage.ts
    → enrollmentService.enrollStudentWithFlow()
      → livenessService.runChallenge()
      → faceEnrollmentService.enroll()
        → faceEmbeddingService.computeFromVideo() × 5
          → faceapi.detectSingleFace().withFaceLandmarks().withFaceDescriptor()
          → computeRoiStats() → quality + lapVar
        → returns EmbeddingRecord { embedding: number[][], ... }
      → faceProfileRepository.replaceForStudent()
        → db.faceProfiles.bulkAdd()
        → syncService.pushAll() [fire-and-forget]

Attendance:
  attendancePage.ts
    → attendanceService.openSession()
      → attendanceRepository.createSession()
    → loop: attendanceService.recognizeForSession()
      → livenessService.runChallenge() [optional]
      → faceRecognitionService.recognize()
        → faceEmbeddingService.computeFromVideo()
        → faceMatchingService.findBestMatch() [multi-vector, Euclidean]
      → attendanceService.recordAttendance()
        → attendanceRepository.recordAttendance()
          → duplicate guard via hasRecord()
        → syncService.pushAll() [fire-and-forget]
```
