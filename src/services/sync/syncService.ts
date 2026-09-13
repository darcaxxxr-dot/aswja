import { db } from '@services/database/dexieSchema';
import { settingRepository } from '@repositories/index';
import { requireActiveSchoolId } from '@utils/device';
import { getSupabaseClient, SupabaseError, cloudSelect, cloudUpsert, emitSyncTelemetry } from './supabaseClient';
import type { ClassRoom, Student, FaceProfile, AttendanceSession, AttendanceRecord, AcademicYear, School, SessionType, PrayerName } from '@models/types';

export interface SyncReport {
  ok: boolean;
  pushed: Record<string, number>;
  pulled: Record<string, number>;
  errors: string[];
  durationMs: number;
  lastSyncAt: number;
}

export interface SyncStatusInfo {
  online: boolean;
  lastSyncAt: number;
  lastError?: string;
  pendingPush: number;
}

export interface PushOnlyReport {
  ok: boolean;
  pushed: Record<string, number>;
  errors: string[];
  durationMs: number;
  lastSyncAt: number;
  progress: Array<{ table: string; status: 'pending' | 'pushing' | 'complete' | 'error'; count?: number; error?: string }>;
}

const SYNC_KEYS = {
  lastSyncAt: 'sync.lastSyncAt',
  lastError: 'sync.lastError',
  syncErrors: 'sync.errors',
  autoEnabled: 'sync.autoEnabled',
  intervalMs: 'sync.intervalMs'
} as const;

const PUSH_TABLES = [
  { local: 'schools' as const, cloud: 'schools' },
  { local: 'academicYears' as const, cloud: 'academic_years' },
  { local: 'classes' as const, cloud: 'classes' },
  { local: 'students' as const, cloud: 'students' },
  { local: 'faceProfiles' as const, cloud: 'face_profiles' },
  { local: 'attendanceSessions' as const, cloud: 'attendance_sessions' },
  { local: 'attendanceRecords' as const, cloud: 'attendance_records' }
] as const;

const PULL_TABLES = [
  { local: 'schools' as const, cloud: 'schools' },
  { local: 'academicYears' as const, cloud: 'academic_years' },
  { local: 'classes' as const, cloud: 'classes' },
  { local: 'students' as const, cloud: 'students' },
  { local: 'faceProfiles' as const, cloud: 'face_profiles' },
  { local: 'attendanceSessions' as const, cloud: 'attendance_sessions' },
  { local: 'attendanceRecords' as const, cloud: 'attendance_records' }
] as const;

type TableKey = (typeof PUSH_TABLES)[number]['local'];

type TableRowMap = {
  schools: School;
  academicYears: AcademicYear;
  classes: ClassRoom;
  students: Student;
  faceProfiles: FaceProfile;
  attendanceSessions: AttendanceSession;
  attendanceRecords: AttendanceRecord;
};

function getCloudColumns(table: TableKey): string[] {
  switch (table) {
    case 'schools':
      return ['id', 'name', 'created_at', 'updated_at', 'deleted_at', 'sync_version'];
    case 'academicYears':
      return ['id', 'name', 'school_id', 'start_date', 'end_date', 'is_active', 'created_at', 'updated_at', 'deleted_at', 'sync_version'];
    case 'classes':
      return ['id', 'school_id', 'academic_year_id', 'grade', 'name', 'created_at', 'updated_at', 'deleted_at', 'sync_version'];
    case 'students':
      return ['id', 'school_id', 'nis', 'nisn', 'name', 'gender', 'class_id', 'status', 'created_at', 'updated_at', 'deleted_at', 'sync_version'];
    case 'faceProfiles':
      return ['id', 'student_id', 'embedding', 'model_version', 'quality_score', 'created_at', 'updated_at', 'deleted_at', 'sync_version'];
    case 'attendanceSessions':
      return ['id', 'school_id', 'class_id', 'date', 'start_time', 'end_time', 'status', 'session_type', 'prayer_name', 'created_by', 'created_at', 'updated_at', 'deleted_at', 'sync_version'];
    case 'attendanceRecords':
      return ['id', 'school_id', 'session_id', 'student_id', 'timestamp', 'status', 'confidence', 'created_at', 'updated_at', 'deleted_at', 'sync_version'];
    default:
      return [];
  }
}

function toCloudRow(table: TableKey, row: TableRowMap[TableKey]): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  switch (table) {
    case 'schools': {
      const r = row as School;
      out.id = r.id;
      out.name = r.name;
      out.created_at = new Date(r.createdAt).toISOString();
      if (r.updatedAt) out.updated_at = new Date(r.updatedAt).toISOString();
      if (r.deletedAt) out.deleted_at = new Date(r.deletedAt).toISOString();
      out.sync_version = r.syncVersion ?? 1;
      break;
    }
    case 'academicYears': {
      const r = row as AcademicYear;
      out.id = r.id;
      out.name = r.name;
      out.school_id = r.schoolId;
      out.start_date = r.startDate;
      out.end_date = r.endDate;
      out.is_active = r.isActive;
      out.created_at = new Date(r.createdAt).toISOString();
      if (r.updatedAt) out.updated_at = new Date(r.updatedAt).toISOString();
      if (r.deletedAt) out.deleted_at = new Date(r.deletedAt).toISOString();
      out.sync_version = r.syncVersion ?? 1;
      break;
    }
    case 'classes': {
      const r = row as ClassRoom;
      out.id = r.id;
      out.school_id = r.schoolId;
      out.academic_year_id = r.academicYearId;
      out.grade = r.grade;
      out.name = r.name;
      out.created_at = new Date(r.createdAt).toISOString();
      if (r.updatedAt) out.updated_at = new Date(r.updatedAt).toISOString();
      if (r.deletedAt) out.deleted_at = new Date(r.deletedAt).toISOString();
      out.sync_version = r.syncVersion ?? 1;
      break;
    }
    case 'students': {
      const r = row as Student;
      out.id = r.id;
      out.school_id = r.schoolId;
      out.nis = r.nis;
      out.nisn = r.nisn;
      out.name = r.name;
      out.gender = r.gender;
      out.class_id = r.classId;
      out.status = r.status;
      out.created_at = new Date(r.createdAt).toISOString();
      if (r.updatedAt) out.updated_at = new Date(r.updatedAt).toISOString();
      if (r.deletedAt) out.deleted_at = new Date(r.deletedAt).toISOString();
      out.sync_version = r.syncVersion ?? 1;
      break;
    }
    case 'faceProfiles': {
      const r = row as FaceProfile;
      out.id = r.id;
      out.student_id = r.studentId;
      out.embedding = Array.isArray(r.embedding) && r.embedding.every((e) => Array.isArray(e)) ? r.embedding : [];
      out.model_version = r.modelVersion;
      out.quality_score = r.qualityScore;
      out.created_at = new Date(r.createdAt).toISOString();
      if (r.updatedAt) out.updated_at = new Date(r.updatedAt).toISOString();
      if (r.deletedAt) out.deleted_at = new Date(r.deletedAt).toISOString();
      out.sync_version = r.syncVersion ?? 1;
      break;
    }
    case 'attendanceSessions': {
      const r = row as AttendanceSession;
      out.id = r.id;
      out.school_id = r.schoolId;
      out.class_id = r.classId;
      out.date = r.date;
      out.start_time = new Date(r.startTime).toISOString();
      if (r.endTime) out.end_time = new Date(r.endTime).toISOString();
      out.status = r.status;
      out.session_type = r.sessionType;
      if (r.prayerName) out.prayer_name = r.prayerName;
      out.created_by = r.createdBy;
      out.created_at = new Date(r.createdAt).toISOString();
      if (r.updatedAt) out.updated_at = new Date(r.updatedAt).toISOString();
      if (r.deletedAt) out.deleted_at = new Date(r.deletedAt).toISOString();
      out.sync_version = r.syncVersion ?? 1;
      break;
    }
    case 'attendanceRecords': {
      const r = row as AttendanceRecord;
      out.id = r.id;
      out.school_id = r.schoolId;
      out.session_id = r.sessionId;
      out.student_id = r.studentId;
      out.timestamp = new Date(r.timestamp).toISOString();
      out.status = r.status;
      out.confidence = r.confidence;
      out.created_at = new Date(r.createdAt).toISOString();
      if (r.updatedAt) out.updated_at = new Date(r.updatedAt).toISOString();
      if (r.deletedAt) out.deleted_at = new Date(r.deletedAt).toISOString();
      out.sync_version = r.syncVersion ?? 1;
      break;
    }
  }

  return out;
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function fromCloudRow<T extends { id: string; schoolId?: string; updatedAt?: number; createdAt?: number; timestamp?: number; startTime?: number; endTime?: number; deletedAt?: number; syncVersion?: number }>(table: TableKey, raw: Record<string, unknown>): T | null {
  if (!raw.id) return null;
  const id = String(raw.id);
  const createdAt = raw.created_at ? new Date(String(raw.created_at)).getTime() : Date.now();

  const processed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const camelKey = snakeToCamel(key);
    processed[camelKey] = value;
  }

  const deletedAt = processed.deletedAt ? new Date(String(processed.deletedAt)).getTime() : undefined;
  const updatedAt = processed.updatedAt ? new Date(String(processed.updatedAt)).getTime() : createdAt;
  const syncVersion = processed.syncVersion ? Number(processed.syncVersion) : 1;

  if (table === 'attendanceRecords') {
    const ar = processed as Record<string, unknown> & { sessionId: string; studentId: string; status: string; confidence: number; deviceId?: string | null };
    return {
      id,
      schoolId: String(ar.school_id ?? ''),
      sessionId: ar.sessionId,
      studentId: ar.studentId,
      timestamp: ar.timestamp ? new Date(String(ar.timestamp)).getTime() : Date.now(),
      status: ar.status as AttendanceRecord['status'],
      confidence: Number(ar.confidence ?? 0),
      deviceId: ar.deviceId ?? undefined,
      createdAt,
      updatedAt,
      deletedAt,
      syncVersion
    } as unknown as T;
  }

  if (table === 'attendanceSessions') {
    const s = processed as Record<string, unknown> & { classId: string; date: string; status: string; createdBy: string };
    return {
      id,
      schoolId: String(s.school_id ?? ''),
      classId: s.classId,
      date: s.date,
      startTime: s.start_time ? new Date(String(s.start_time)).getTime() : Date.now(),
      endTime: s.end_time ? new Date(String(s.end_time)).getTime() : undefined,
      status: s.status as AttendanceSession['status'],
      sessionType: (s.session_type as SessionType) ?? 'CLASS',
      prayerName: (s.prayer_name as PrayerName | undefined) ?? undefined,
      createdBy: s.createdBy ?? '',
      createdAt,
      updatedAt,
      deletedAt,
      syncVersion
    } as unknown as T;
  }

  if (table === 'faceProfiles') {
    const f = processed as Record<string, unknown> & { studentId: string; embedding: number[][]; modelVersion: string; qualityScore: number };
    return {
      id,
      studentId: f.studentId,
      embedding: Array.isArray(f.embedding) && f.embedding.every((e) => Array.isArray(e)) ? f.embedding : [],
      modelVersion: f.modelVersion ?? 'unknown',
      qualityScore: Number(f.qualityScore ?? 0),
      createdAt,
      updatedAt,
      deletedAt,
      syncVersion
    } as unknown as T;
  }

  if (table === 'students') {
    const s = processed as Record<string, unknown> & { nis: string; name: string; gender: string; classId: string };
    return {
      id,
      schoolId: String(s.school_id ?? ''),
      nis: s.nis,
      nisn: s.nisn as string | undefined,
      name: s.name,
      gender: s.gender as Student['gender'],
      classId: s.classId,
      status: (s.status as Student['status']) ?? 'active',
      createdAt,
      updatedAt,
      deletedAt,
      syncVersion
    } as unknown as T;
  }

  if (table === 'classes') {
    const c = processed as Record<string, unknown> & { name: string; grade: string; academicYearId: string };
    const academicYearId = c.academic_year_id ?? c.academicYearId ?? '';
    return {
      id,
      schoolId: String(c.school_id ?? ''),
      name: c.name,
      grade: c.grade,
      academicYearId: String(academicYearId),
      createdAt,
      updatedAt,
      deletedAt,
      syncVersion
    } as unknown as T;
  }

  if (table === 'academicYears') {
    const a = processed as Record<string, unknown> & { name: string; startDate: string; endDate: string; isActive: boolean };
    return {
      id,
      schoolId: String(a.school_id ?? ''),
      name: a.name,
      startDate: a.startDate,
      endDate: a.endDate,
      isActive: a.isActive ?? false,
      createdAt,
      updatedAt,
      deletedAt,
      syncVersion
    } as unknown as T;
  }

  if (table === 'schools') {
    const sh = processed as Record<string, unknown> & { name: string };
    return {
      id,
      name: sh.name,
      createdAt,
      updatedAt,
      deletedAt,
      syncVersion
    } as unknown as T;
  }

  return null;
}

export class SyncService {
  private intervalId: number | null = null;
  private listeners: Array<(status: SyncStatusInfo) => void> = [];
  private lastPushErrors: string[] = [];
  private lastPullErrors: string[] = [];

  onStatusChange(listener: (status: SyncStatusInfo) => void): () => void {
    this.listeners.push(listener);
    void this.getStatus().then((s) => listener(s));
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private async emit(): Promise<void> {
    const status = await this.getStatus();
    for (const l of this.listeners) l(status);
  }

  async getStatus(): Promise<SyncStatusInfo> {
    const [lastSyncAtStr, lastError, , queueCount] = await Promise.all([
      settingRepository.get(SYNC_KEYS.lastSyncAt),
      settingRepository.get(SYNC_KEYS.lastError),
      settingRepository.get(SYNC_KEYS.syncErrors),
      db.syncQueue.count()
    ]);
    return {
      online: navigator.onLine,
      lastSyncAt: lastSyncAtStr ? parseInt(lastSyncAtStr, 10) : 0,
      lastError: lastError ?? undefined,
      pendingPush: queueCount
    };
  }

  async getErrors(): Promise<string[]> {
    const stored = await settingRepository.get(SYNC_KEYS.syncErrors);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as unknown;
        if (Array.isArray(parsed)) return parsed.map((item) => String(item));
      } catch {
        // ignore malformed stored errors
      }
    }
    const lastError = await settingRepository.get(SYNC_KEYS.lastError);
    return lastError ? lastError.split(';').map((item) => item.trim()).filter(Boolean) : [];
  }

  async pushAll(): Promise<Record<string, number>> {
    if (!getSupabaseClient()) throw new SupabaseError('Supabase client not configured');
    const schoolId = requireActiveSchoolId();
    const result: Record<string, number> = {};

    const syncStart = performance.now();
    emitSyncTelemetry({
      timestamp: Date.now(),
      event: 'sync_start',
      schoolId,
      network: { online: navigator.onLine, latencyMs: 0 }
    });

    const existingSchool = await db.schools.get(schoolId);
    if (!existingSchool) {
      const ts = Date.now();
      await db.schools.put({
        id: schoolId,
        name: 'Sekolah',
        createdAt: ts,
        updatedAt: ts,
        syncVersion: 1
      });
    }

    const allStudents = await db.students.toArray();
    const studentSchoolMap = new Map<string, string>(allStudents.map((s) => [s.id, s.schoolId]));
    const mismatchedSchools = new Set<string>();

    for (const t of PUSH_TABLES) {
      const tableStart = performance.now();
      const all = (await db[t.local].toArray()) as TableRowMap[TableKey][];
      let schoolRows: TableRowMap[TableKey][];

      if (t.local === 'schools') {
        schoolRows = all.filter((r) => (r as School).id === schoolId);
      } else if (t.local === 'faceProfiles') {
        schoolRows = all.filter((r) => studentSchoolMap.get((r as FaceProfile).studentId) === schoolId);
      } else {
        schoolRows = all.filter((r) => (r as { schoolId?: string }).schoolId === schoolId);
        all.filter((r) => (r as { schoolId?: string }).schoolId && (r as { schoolId?: string }).schoolId !== schoolId)
          .forEach((r) => mismatchedSchools.add((r as { schoolId?: string }).schoolId as string));
      }

      if (schoolRows.length === 0) {
        result[t.cloud] = 0;
        continue;
      }

      const cloudRows = schoolRows.map((r) => toCloudRow(t.local, r));
      const columns = getCloudColumns(t.local);

      try {
        const { inserted, errors: upsertErrors } = await cloudUpsert(t.cloud, cloudRows as never[], columns);
        if (upsertErrors.length > 0) {
          console.warn(`[sync] Push ${t.cloud} errors:`, upsertErrors);
          this.lastPushErrors.push(...upsertErrors.map((e: string) => `${t.cloud}: ${e}`));
          for (const err of upsertErrors) {
            emitSyncTelemetry({
              timestamp: Date.now(),
              event: 'sync_error',
              schoolId,
              table: t.cloud,
              error: { code: 'UPSERT_ERROR', message: err }
            });
          }
          if (cloudRows.length > 0) {
            console.warn(`[sync] First row sample:`, JSON.stringify(cloudRows[0]));
          }
        } else if (inserted > 0) {
          // Bump local sync_version after successful push
          const tableRef = db[t.local] as unknown as { bulkPut: (rows: unknown[]) => Promise<unknown> };
          const updatedRows = schoolRows.map((r) => ({
            ...r,
            syncVersion: (r.syncVersion ?? 1) + 1
          }));
          await tableRef.bulkPut(updatedRows);
        }
        result[t.cloud] = inserted;
        emitSyncTelemetry({
          timestamp: Date.now(),
          event: 'sync_table_push',
          schoolId,
          table: t.cloud,
          durationMs: Math.round(performance.now() - tableStart),
          rowCount: inserted
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[sync] Push ${t.cloud} failed: ${msg}`);
        this.lastPushErrors.push(`${t.cloud}: ${msg}`);
        result[t.cloud] = 0;
        emitSyncTelemetry({
          timestamp: Date.now(),
          event: 'sync_error',
          schoolId,
          table: t.cloud,
          error: { code: 'PUSH_FAILED', message: msg }
        });
      }
    }
    if (mismatchedSchools.size > 0) {
      console.warn(`[sync] Push skipped rows from mismatched schools: ${Array.from(mismatchedSchools).join(', ')}`);
    }

    emitSyncTelemetry({
      timestamp: Date.now(),
      event: 'sync_complete',
      schoolId,
      durationMs: Math.round(performance.now() - syncStart)
    });

    return result;
  }

  async pullAll(sinceMs?: number): Promise<Record<string, number>> {
    if (!getSupabaseClient()) throw new SupabaseError('Supabase client not configured');
    const schoolId = requireActiveSchoolId();
    const sinceIso = sinceMs ? new Date(sinceMs).toISOString() : undefined;
    const result: Record<string, number> = {};

    const syncStart = performance.now();
    emitSyncTelemetry({
      timestamp: Date.now(),
      event: 'sync_start',
      schoolId,
      network: { online: navigator.onLine, latencyMs: 0 }
    });

    for (const t of PULL_TABLES) {
      const tableStart = performance.now();
      try {
        const { data, error } = await cloudSelect(t.cloud, schoolId, sinceIso);
        if (error) {
          console.warn(`[sync] Pull ${t.cloud} error:`, error);
          emitSyncTelemetry({
            timestamp: Date.now(),
            event: 'sync_error',
            schoolId,
            table: t.cloud,
            error: { code: 'PULL_ERROR', message: error }
          });
          continue;
        }
        const rows = (data ?? []) as Record<string, unknown>[];
        if (rows.length === 0) {
          result[t.cloud] = 0;
          continue;
        }

        const mismatchedSchoolRows = rows.filter((r) => String(r.school_id ?? '') !== schoolId);
        if (mismatchedSchoolRows.length > 0) {
          console.warn(`[sync] Pull ${t.cloud}: ${mismatchedSchoolRows.length} rows have mismatched school_id, skipping`);
        }
        const safeRows = rows.filter((r) => String(r.school_id ?? '') === schoolId);
        if (safeRows.length === 0) {
          result[t.cloud] = 0;
          continue;
        }

        const tableRef = db[t.local] as unknown as { bulkGet: (ids: string[]) => Promise<unknown[]>; bulkPut: (rows: unknown[]) => Promise<unknown> };
        const incomingIds = safeRows.map((r) => String((r as { id: unknown }).id));
        let localRows: Array<{ id: string; updatedAt?: number; createdAt?: number; schoolId?: string; syncVersion?: number }> = [];
        try {
          localRows = (await tableRef.bulkGet(incomingIds)) as Array<{ id: string; updatedAt?: number; createdAt?: number; schoolId?: string; syncVersion?: number }>;
        } catch {
          localRows = [];
        }
        const localById = new Map(localRows.filter((r) => r && r.id).map((r) => [r.id, r]));

        const toWrite: TableRowMap[TableKey][] = [];
        let skipped = 0;
        let conflicts = 0;
        for (const raw of safeRows) {
          const local = localById.get(String(raw.id));
          
          const localUpdated = local?.updatedAt ?? 0;
          const cloudSyncVersion = raw.sync_version ? Number(raw.sync_version) : 1;
          const localSyncVersion = local?.syncVersion ?? 0;

          const localSchoolId = local?.schoolId as string | undefined;
          const schoolIdChanged = localSchoolId != null && localSchoolId !== '' && localSchoolId !== schoolId;

          // sync_version based conflict detection:
          // if local syncVersion >= cloudSyncVersion and localUpdated > 0,
          // keep local unless schoolId changed.
          if (local && localUpdated > 0 && localSyncVersion >= cloudSyncVersion && !schoolIdChanged) {
            skipped++;
            if (localSyncVersion > cloudSyncVersion) {
              conflicts++;
            }
            continue;
          }

          const converted = fromCloudRow<TableRowMap[TableKey]>(t.local, raw);
          if (converted) toWrite.push(converted);
        }
        if (toWrite.length > 0) {
          await tableRef.bulkPut(toWrite);
        }
        if (skipped > 0) {
          console.info(`[sync] Pull ${t.cloud}: ${toWrite.length} applied, ${skipped} skipped (local newer), ${conflicts} conflicts`);
        }
        result[t.cloud] = toWrite.length;
        emitSyncTelemetry({
          timestamp: Date.now(),
          event: 'sync_table_pull',
          schoolId,
          table: t.cloud,
          durationMs: Math.round(performance.now() - tableStart),
          rowCount: toWrite.length
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[sync] Pull ${t.cloud} failed: ${msg}`);
        emitSyncTelemetry({
          timestamp: Date.now(),
          event: 'sync_error',
          schoolId,
          table: t.cloud,
          error: { code: 'PULL_FAILED', message: msg }
        });
      }
    }

    emitSyncTelemetry({
      timestamp: Date.now(),
      event: 'sync_complete',
      schoolId,
      durationMs: Math.round(performance.now() - syncStart)
    });

    return result;
  }

  async pushOnly(): Promise<PushOnlyReport> {
    const start = performance.now();
    const result: Record<string, number> = {};
    const errors: string[] = [];
    const progress: Array<{ table: string; status: 'pending' | 'pushing' | 'complete' | 'error'; count?: number; error?: string }> = [];

    if (!getSupabaseClient()) {
      errors.push('Supabase client not configured');
      return {
        ok: false,
        pushed: result,
        errors,
        durationMs: 0,
        lastSyncAt: 0,
        progress: PUSH_TABLES.map((t) => ({ table: t.cloud, status: 'error', error: 'Supabase not configured' }))
      };
    }

    const schoolId = requireActiveSchoolId();

    progress.push({ table: 'schools', status: 'pushing' });
    const existingSchool = await db.schools.get(schoolId);
    if (!existingSchool) {
      const ts = Date.now();
      await db.schools.put({
        id: schoolId,
        name: 'Sekolah',
        createdAt: ts,
        updatedAt: ts
      });
    }
    result.schools = 1;
    progress[progress.length - 1] = { table: 'schools', status: 'complete', count: 1 };

    const allStudents = await db.students.toArray();
    const studentSchoolMap = new Map<string, string>(allStudents.map((s) => [s.id, s.schoolId]));

    const sequentialTables = PUSH_TABLES.slice(1);

    for (const t of sequentialTables) {
      progress.push({ table: t.cloud, status: 'pushing' });

      const all = (await db[t.local].toArray()) as TableRowMap[TableKey][];
      let schoolRows: TableRowMap[TableKey][];

      if (t.local === 'faceProfiles') {
        schoolRows = all.filter((r) => studentSchoolMap.get((r as FaceProfile).studentId) === schoolId);
      } else {
        schoolRows = all.filter((r) => (r as { schoolId?: string }).schoolId === schoolId);
      }

      if (schoolRows.length === 0) {
        result[t.cloud] = 0;
        progress[progress.length - 1] = { table: t.cloud, status: 'complete', count: 0 };
        continue;
      }

      const cloudRows = schoolRows.map((r) => toCloudRow(t.local, r));
      const columns = getCloudColumns(t.local);

      try {
        const { inserted, errors: upsertErrors } = await cloudUpsert(t.cloud, cloudRows as never[], columns);
        if (upsertErrors.length > 0) {
          console.warn(`[sync] Push ${t.cloud} errors:`, upsertErrors);
          errors.push(...upsertErrors);
          progress[progress.length - 1] = { table: t.cloud, status: 'error', count: inserted, error: upsertErrors[0] };
        } else {
          result[t.cloud] = inserted;
          progress[progress.length - 1] = { table: t.cloud, status: 'complete', count: inserted };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[sync] Push ${t.cloud} failed: ${msg}`);
        errors.push(`${t.cloud}: ${msg}`);
        progress[progress.length - 1] = { table: t.cloud, status: 'error', error: msg };
      }
    }

    const now = Date.now();
    const ok = errors.length === 0;
    if (ok) {
      this.lastPushErrors = [];
    }
    await settingRepository.set(SYNC_KEYS.lastSyncAt, String(now));
    if (!ok) {
      await settingRepository.set(SYNC_KEYS.lastError, errors[errors.length - 1]);
      await settingRepository.set(SYNC_KEYS.syncErrors, JSON.stringify(errors));
    } else {
      await settingRepository.set(SYNC_KEYS.lastError, '');
      await settingRepository.set(SYNC_KEYS.syncErrors, '');
    }

    await this.emit();

    return {
      ok,
      pushed: result,
      errors,
      durationMs: Math.round(performance.now() - start),
      lastSyncAt: now,
      progress
    };
  }

  async runFullSync(): Promise<SyncReport> {
    const start = performance.now();
    let pushed: Record<string, number> = {};
    let pulled: Record<string, number> = {};

    if (!navigator.onLine) {
      await settingRepository.set(SYNC_KEYS.lastError, 'offline');
      await settingRepository.set(SYNC_KEYS.syncErrors, JSON.stringify(['offline']));
      return {
        ok: false,
        pushed,
        pulled,
        errors: ['offline'],
        durationMs: 0,
        lastSyncAt: 0
      };
    }

    if (!getSupabaseClient()) {
      await settingRepository.set(SYNC_KEYS.lastError, 'supabase not configured');
      await settingRepository.set(SYNC_KEYS.syncErrors, JSON.stringify(['supabase not configured']));
      return {
        ok: false,
        pushed,
        pulled,
        errors: ['supabase not configured'],
        durationMs: 0,
        lastSyncAt: 0
      };
    }

    try {
      pushed = await this.pushAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[sync] push failed: ${msg}`);
      this.lastPushErrors.push(`push: ${msg}`);
    }

    try {
      pulled = await this.pullAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[sync] pull failed: ${msg}`);
      this.lastPullErrors.push(`pull: ${msg}`);
    }

    const errors = [...this.lastPushErrors, ...this.lastPullErrors];
    const now = Date.now();
    const ok = errors.length === 0;
    if (ok) {
      this.lastPushErrors = [];
      this.lastPullErrors = [];
    }
    await settingRepository.set(SYNC_KEYS.lastSyncAt, String(now));
    if (!ok) {
      await settingRepository.set(SYNC_KEYS.lastError, errors[errors.length - 1]);
      await settingRepository.set(SYNC_KEYS.syncErrors, JSON.stringify(errors));
    } else {
      await settingRepository.set(SYNC_KEYS.lastError, '');
      await settingRepository.set(SYNC_KEYS.syncErrors, '');
    }

    await this.emit();

    return {
      ok,
      pushed,
      pulled,
      errors,
      durationMs: Math.round(performance.now() - start),
      lastSyncAt: now
    };
  }

  async startAutoSync(intervalMs: number = 30000): Promise<void> {
    await settingRepository.set(SYNC_KEYS.autoEnabled, 'true');
    await settingRepository.set(SYNC_KEYS.intervalMs, String(intervalMs));
    this.stopAutoSync();
    const tick = async () => {
      if (!navigator.onLine) return;
      const auto = await settingRepository.get(SYNC_KEYS.autoEnabled);
      if (auto !== 'true') return;
      await this.runFullSync().catch(() => undefined);
    };
    this.intervalId = window.setInterval(() => void tick(), intervalMs);
    void this.runFullSync().catch(() => undefined);
    window.addEventListener('online', () => void tick());
  }

  stopAutoSync(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    void settingRepository.set(SYNC_KEYS.autoEnabled, 'false');
  }

  async enqueue(entity: string, operation: string, recordId: string): Promise<void> {
    await db.syncQueue.add({
      id: `${entity}-${operation}-${recordId}-${Date.now()}`,
      entity: entity as never,
      operation: operation as never,
      recordId,
      status: 'pending',
      retryCount: 0,
      createdAt: Date.now()
    });
    await this.emit();
  }
}

export const syncService = new SyncService();