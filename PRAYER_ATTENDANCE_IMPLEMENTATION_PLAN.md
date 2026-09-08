# Prayer Attendance Implementation Plan

## Objective
Add Subuh/Dhuhur/Ashar/Maghrib/Isya prayer attendance tracking to ASWJA, alongside existing class-based attendance. Uses a **polymorphic session type** (`SESSION_TYPE_CLASS` | `SESSION_TYPE_PRAYER`) so both attendance types share the same infrastructure without breaking existing class attendance flow.

## Background
- Current `AttendanceSession` model (src/models/types.ts:46) has: `id`, `schoolId`, `classId`, `date`, `startTime`, `endTime`, `status`, `createdBy`, `createdAt`
- `AttendanceRecord` model (src/models/types.ts:59) has: `id`, `schoolId`, `sessionId`, `studentId`, `timestamp`, `status`, `confidence`, `deviceId`
- Supabase sync service (src/services/sync/syncService.ts) uses `getExistingColumns()` to dynamically filter columns before upsert
- Existing class attendance works via: open session → scan face → match → record attendance
- Prayer attendance follows same flow but with different config (on-time/late thresholds per sholat) and `sessionType = 'PRAYER'`, `prayerName` field

---

## Phase 1 — Database Schema & Types

### 1.1 Update `src/models/types.ts`
- Add `SessionType` enum: `'CLASS' | 'PRAYER'`
- Add `PrayerName` type: `'SUBUH' | 'DHUHUR' | 'ASHAR' | 'MAGHRIB' | 'ISYA'`
- Extend `AttendanceSession`:
  - `sessionType: SessionType` — default `'CLASS'`
  - `prayerName?: PrayerName` — nullable, only set when `sessionType === 'PRAYER'`
- Extend `AttendanceRecord` (optional):
  - No changes needed; `sessionId` already links to `AttendanceSession` which carries `prayerName`

### 1.2 Dexie v4 Migration — `src/services/database/dexieSchema.ts`
- Bump from v3 → v4
- Add `sessionType` column to `attendanceSessions` table
- Add `prayerName` column to `attendanceSessions` table (nullable)
- Update stores():
  ```
  attendanceSessions: 'id, schoolId, classId, date, status, sessionType, prayerName, createdAt, [schoolId+classId+date]'
  ```
- Add compound index for prayer queries:
  ```
  [schoolId+sessionType+date+prayerName]
  ```

### 1.3 Supabase Migration SQL — `supabase/migrations/003_sync_columns.sql` (append/extend)
- Add `session_type` column to `public.attendance_sessions` (text, not null, default 'CLASS')
- Add `prayer_name` column to `public.attendance_sessions` (text, nullable)
- Add index: `idx_attendance_sessions_session_type_date` on `(session_type, date)`
- The existing `003_sync_columns.sql` already adds `academic_year_id` to `classes` and `school_id` to `schools`; the new columns will be handled in a future migration or appended to `003_sync_columns.sql`

### 1.4 Sync Service Column Lists — `src/services/sync/syncService.ts`
- In `getCloudColumns()` for `attendanceSessions`, add `'session_type'` and `'prayer_name'` to the returned column array (they are nullable, so safe to include)
- The `getExistingColumns()` already filters by `information_schema.columns`, so if columns don't exist in production DB, they are silently ignored — no code change required, but document that migration 003 must be applied

---

## Phase 2 — Repository & Service Overloads

### 2.1 Repository Overloads — `src/repositories/`
- `attendanceRepository.ts` — add overloads:
  - `listPrayerSessions(schoolId: string, date?: string): Promise<AttendanceSession[]>`
  - `listPrayerSessionsByName(schoolId: string, prayerName: PrayerName, date?: string): Promise<AttendanceSession[]>`
  - `countPrayerAttendance(schoolId: string, prayerName: PrayerName): Promise<number>`

### 2.2 Attendance Config Service — `src/services/attendance/`
- `attendanceConfigService.load()` — extend to return `prayerConfig` object per `prayerName`:
  ```typescript
  prayer: {
    onTime: Record<PrayerName, string>;  // e.g. SUBUH: "06:00"
    lateAfter: Record<PrayerName, string>;  // e.g. SUBUH: "06:15"
    closeAt: Record<PrayerName, string>;  // e.g. SUBUH: "06:30"
  }
  ```
- `attendanceConfigService.save()` — persist prayer config to `src/services/settings/settingsService.ts` (add new KEYS) and Dexie `settings` table
- Default prayer config (if none stored):
  - SUBUH: onTime 05:55, lateAfter 06:15, closeAt 06:30
  - DHUHUR: onTime 11:55, lateAfter 13:15, closeAt 14:30
  - ASHR: onTime 13:30, lateAfter 14:45, closeAt 16:00
  - MAGHRIB: onTime 16:20, lateAfter 16:45, closeAt 17:15
  - ISYA: onTime 18:10, lateAfter 18:40, closeAt 19:15

### 2.3 Attendance Service — `src/services/attendance/attendanceService.ts`
- Extend `recognizeForSession()` to accept session with `sessionType` and `prayerName`
- Determine auto status using **prayer config** instead of class time config:
  - Look up `prayerConfig[prayerName].onTime` / `lateAfter` / `closeAt`
  - Compare `result.timestamp` against those thresholds
- Extend `recordAttendance()` to store `prayerName` on the attendance record (via session link) — or simply rely on `sessionId` join to get `prayerName`

---

## Phase 3 — UI: Prayer Attendance Tab

### 3.1 Dashboard/Attendance Page — `src/pages/attendance/attendancePage.ts`
- Add tab toggle: **"Absensi Kelas"** / **"Shalat"** (radio buttons or pill tabs)
- When **Shalat** tab is active:
  - Load prayer sessions instead of class sessions
  - Show prayer name selector (Subuh/Dhuhur/Ashar/Maghrib/Isya)
  - Show prayer time config (on-time / late-after / close) — read from `attendanceConfigService.load()` or allow manual override per sholat
  - Hide class-specific UI (grade, academic year)
  - Session form: date + prayer name (no class selection)
- When **Absensi Kelas** tab is active:
  - Existing behavior (unchanged)

### 3.2 Prayer Session Form — UI components
- Date input (today default)
- Prayer name dropdown: SUBUH / DHUHUR / ASHR / MAGHRIB / ISYA
- Time inputs per sholat: On-time until, Late after, Close at (populated from config, editable)
- Button: "Buka Sesi Sholat"
- Below: list of students with face profiles, showing their last attendance status per sholat

### 3.3 Recognition Loop Adaptation — `src/pages/attendance/attendancePage.ts`
- The `startLoop()` / `loop()` already uses `attendanceService.recognizeForSession(video, currentSession, config)`
- No major change needed; just ensure `currentSession.prayerName` is set when in prayer mode
- The `determineAutoStatus(cfg)` function already distinguishes HADIR/TERLAMBAT based on time; for prayer, use `prayerConfig[prayerName]`

---

## Phase 4 — Settings: Prayer Config

### 4.1 Settings Page — `src/pages/settings/settingsPage.ts`
- Add section **"Aturan Shalat"** (SECTIONS array new key: `'prayer'`)
- Per-sholat inputs:
  - Subuh: On-time until, Late after, Close at
  - Dhuhur: On-time until, Late after, Close at
  - Ashar: On-time until, Late after, Close at
  - Maghrib: On-time until, Late after, Close at
  - Isya: On-time until, Late after, Close at
- Each input is a `<input type="time">`
- Save button stores per-sholat times to `settingsService.save()` under new keys (e.g. `prayer.subuh.onTimeUntil`, `prayer.dhuhr.lateAfter`, etc.)
- Display last-saved times in the UI

### 4.2 Settings Service — `src/services/settings/settingsService.ts`
- Add new `KEYS` entries for prayer config (use reverse-domain style: `prayer.subuh.onTimeUntil`, etc.)
- Extend `AppSettings` interface with `prayer: { subuh: { onTimeUntil: string; lateAfter: string; closeAt: string }; dhuhr: ...; ashar: ...; maghrib: ...; isya: ... }`
- Extend `load()` and `save()` to handle the new keys (optional — can also use localStorage or Dexie `settings` table directly; keep consistent with existing pattern)

---

## Phase 5 — Sync Resilience

### 5.1 Ensure Migration 003 is Applied
- The production Supabase DB must run `003_sync_columns.sql` (or its updated version with `session_type`, `prayer_name`)
- If columns are missing, `getExistingColumns()` returns empty Set, and sync silently filters them out — data still syncs for existing columns only
- Document: after deploying code changes, run the SQL migration on the target Supabase project

### 5.2 Sync Flow for Prayer Sessions
- `pushAll()` in `syncService.ts` already iterates `PUSH_TABLES` which includes `attendanceSessions`
- `toCloudRow()` for `attendanceSessions` will now include `session_type` and `prayer_name` (added in Phase 1.4)
- `getExistingColumns()` will filter columns that exist; if migration not applied, those two columns are simply omitted from the upsert — no error, just those fields lost until migration applied

---

## Verification Plan

### Manual Verification (after implementation)
1. Navigate to `/attendance`
2. Toggle to **"Shalat"** tab
3. Select date (today) and prayer name (e.g. Subuh)
4. Click "Buka Sesi Sholat"
5. Kamera aktif → scan wajah siswa
6. Verify:
   - Auto status: scan before `onTimeUntil` → HADIR, after → TERLAMBAT
   - Correct prayer config applied (subuh thresholds vs isya thresholds)
   - Feedback shows student name + status + prayer name
   - Sound effects play (attendance-ok, attendance-retry, attendance-already)
7. Toggle back to **"Absensi Kelas"** tab → verify class attendance still works unchanged
8. Open Settings → "Aturan Shalat" section → adjust times → verify saved and reflected in attendance tab

### Build Verification
Run `npm run build` after all changes. Ensure no TypeScript errors. Check that:
- `src/models/types.ts` compiles with new enums
- `src/services/database/dexieSchema.ts` v4 migration syntax valid
- `src/services/sync/syncService.ts` `getCloudColumns()` includes new fields
- `src/pages/attendance/attendancePage.ts` tab toggle UI valid
- `src/pages/settings/settingsPage.ts` new section valid

---

## File Changes Summary

| File | Change Type |
|---|---|
| `src/models/types.ts` | Add `SessionType`, `PrayerName`; extend `AttendanceSession` |
| `src/services/database/dexieSchema.ts` | Bump to v4; add `sessionType`, `prayerName` columns + index |
| `supabase/migrations/003_sync_columns.sql` | Add `session_type`, `prayer_name` columns to `attendance_sessions` |
| `src/services/sync/syncService.ts` | Add `session_type`, `prayer_name` to `getCloudColumns()` for attendanceSessions |
| `src/repositories/attendanceRepository.ts` | Add `listPrayerSessions*`, `countPrayerAttendance` overloads |
| `src/services/attendance/attendanceConfigService.ts` | Prayer config load/save, default values |
| `src/services/attendance/attendanceService.ts` | Recognize with prayer config, auto status via prayer thresholds |
| `src/pages/attendance/attendancePage.ts` | Tab toggle (Kelas / Shalat); prayer session UI; prayer config integration |
| `src/pages/settings/settingsPage.ts` | New "Aturan Shalat" section + per-sholat time inputs |
| `src/services/settings/settingsService.ts` | New KEYS for prayer config; load/save extensions |
| `src/services/sound/sound.ts` | No changes needed; existing effects suffice |

---