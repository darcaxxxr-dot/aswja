import { db } from '@services/database/dexieSchema';
import { settingRepository } from '@repositories/index';
import { getOrCreateSchoolId } from '@utils/device';
import { getSupabaseClient, SupabaseError, cloudSelect, cloudUpsert } from './supabaseClient';
import type { ClassRoom, Student, FaceProfile, AttendanceSession, AttendanceRecord, AcademicYear, School } from '@models/types';

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

const SYNC_KEYS = {
  lastSyncAt: 'sync.lastSyncAt',
  lastError: 'sync.lastError',
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

function camelToSnake(str: string): string {
  // Converts camelCase to snake_case
  return str.replace(/[A-Z]/g, (letter, index) => (index === 0 ? letter.toLowerCase() : '_' + letter.toLowerCase()));
}

function toCloudRow(table: TableKey, row: TableRowMap[TableKey]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  // Convert camelCase keys to snake_case for Supabase compatibility
  const camelKeys = Object.keys(out) as string[];
  for (const key of camelKeys) {
    const snakeKey = camelToSnake(key);
    if (snakeKey !== key) {
      out[snakeKey] = out[key];
      // Remove camelCase key to avoid duplication
      delete out[key];
    }
  }

  if (table === 'faceProfiles') {
    const fp = row as FaceProfile;
    out.embedding = Array.isArray(fp.embedding) ? fp.embedding : [];
  }
  if (table === 'attendanceRecords') {
    const ar = row as AttendanceRecord;
    out.timestamp = new Date(ar.timestamp).toISOString();
    out.created_at = new Date(ar.createdAt).toISOString();
  } else if (table === 'attendanceSessions') {
    const s = row as AttendanceSession;
    out.start_time = new Date(s.startTime).toISOString();
    if (s.endTime) out.end_time = new Date(s.endTime).toISOString();
    out.date = typeof s.date === 'string' ? s.date : new Date(s.date).toISOString().slice(0, 10);
    out.created_at = new Date(s.createdAt).toISOString();
  } else {
    out.created_at = new Date(row.createdAt).toISOString();
    if ('updatedAt' in row && row.updatedAt) {
      out.updated_at = new Date(row.updatedAt).toISOString();
    }
  }
  return out;
}

function snakeToCamel(str: string): string {
  // Converts snake_case to camelCase
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function fromCloudRow<T extends { id: string; schoolId?: string; updatedAt?: number; createdAt?: number; timestamp?: number; startTime?: number; endTime?: number }>(table: TableKey, raw: Record<string, unknown>): T | null {
  if (!raw.id) return null;
  const id = String(raw.id);
  const createdAt = raw.created_at ? new Date(String(raw.created_at)).getTime() : Date.now();
  const updatedAt = raw.updated_at ? new Date(String(raw.updated_at)).getTime() : Date.now();

  // Convert snake_case keys in raw to camelCase for local type compatibility
  const processed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const camelKey = snakeToCamel(key);
    processed[camelKey] = value;
  }

  if (table === 'attendanceRecords') {
    const ar = processed as Record<string, unknown> & { sessionId: string; studentId: string; status: string; confidence: number; deviceId: string };
    return {
      id,
      schoolId: String(ar.school_id ?? ''),
      sessionId: ar.sessionId,
      studentId: ar.studentId,
      timestamp: ar.timestamp ? new Date(String(ar.timestamp)).getTime() : Date.now(),
      status: ar.status as AttendanceRecord['status'],
      confidence: Number(ar.confidence ?? 0),
      deviceId: ar.deviceId ?? '',
      createdAt
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
      createdBy: s.createdBy ?? '',
      createdAt
    } as unknown as T;
  }

  if (table === 'faceProfiles') {
    const f = processed as Record<string, unknown> & { studentId: string; embedding: number[]; modelVersion: string; qualityScore: number };
    return {
      id,
      studentId: f.studentId,
      embedding: Array.isArray(f.embedding) ? f.embedding : [],
      modelVersion: f.modelVersion ?? 'unknown',
      qualityScore: Number(f.qualityScore ?? 0),
      createdAt,
      updatedAt
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
      updatedAt
    } as unknown as T;
  }

  if (table === 'classes') {
    const c = processed as Record<string, unknown> & { name: string; grade: string; academicYearId: string };
    // Try to get academicYearId from both possible keys (snake_case from DB)
    const academicYearId = c.academic_year_id ?? c.academicYearId ?? '';
    return {
      id,
      schoolId: String(c.school_id ?? ''),
      name: c.name,
      grade: c.grade,
      academicYearId: String(academicYearId),
      createdAt,
      updatedAt
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
      createdAt
    } as unknown as T;
  }

  if (table === 'schools') {
    const sh = processed as Record<string, unknown> & { name: string };
    return {
      id,
      name: sh.name,
      createdAt,
      updatedAt
    } as unknown as T;
  }

  return null;
}

export class SyncService {
  private intervalId: number | null = null;
  private listeners: Array<(status: SyncStatusInfo) => void> = [];

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
    const [lastSyncAtStr, lastError, queueCount] = await Promise.all([
      settingRepository.get(SYNC_KEYS.lastSyncAt),
      settingRepository.get(SYNC_KEYS.lastError),
      db.syncQueue.count()
    ]);
    return {
      online: navigator.onLine,
      lastSyncAt: lastSyncAtStr ? parseInt(lastSyncAtStr, 10) : 0,
      lastError: lastError ?? undefined,
      pendingPush: queueCount
    };
  }

  async pushAll(): Promise<Record<string, number>> {
    if (!getSupabaseClient()) throw new SupabaseError('Supabase client not configured');
    const schoolId = getOrCreateSchoolId();
    const result: Record<string, number> = {};

    // Build a studentId → schoolId lookup map for faceProfiles injection
    const allStudents = await db.students.toArray();
    const studentSchoolMap = new Map<string, string>(allStudents.map((s) => [s.id, s.schoolId]));

    for (const t of PUSH_TABLES) {
      const all = (await db[t.local].toArray()) as TableRowMap[TableKey][];

      // Filter rows that belong to this school
      let schoolRows: TableRowMap[TableKey][];
      if (t.local === 'schools') {
        // Schools: push all (root entity)
        schoolRows = all;
      } else if (t.local === 'faceProfiles') {
        // FaceProfiles: filter by student's schoolId
        schoolRows = all.filter((r) => {
          const fp = r as FaceProfile;
          return studentSchoolMap.get(fp.studentId) === schoolId;
        });
      } else {
        // All other tables: filter by direct schoolId field
        schoolRows = all.filter((r) => (r as { schoolId?: string }).schoolId === schoolId);
      }

      const cloudRows = schoolRows.map((r) => {
        const row = toCloudRow(t.local, r);
        // Inject school_id into face_profiles cloud row
        if (t.local === 'faceProfiles') {
          const fp = r as FaceProfile;
          row.school_id = studentSchoolMap.get(fp.studentId) ?? schoolId;
        }
        return row;
      });

      const { inserted, errors } = await cloudUpsert(t.cloud, cloudRows as never[]);
      if (errors.length > 0) {
        throw new SupabaseError(`Push ${t.cloud}: ${errors.join('; ')}`);
      }
      result[t.cloud] = inserted;
    }
    return result;
  }

  async pullAll(sinceMs?: number): Promise<Record<string, number>> {
    if (!getSupabaseClient()) throw new SupabaseError('Supabase client not configured');
    const schoolId = getOrCreateSchoolId();
    const sinceIso = sinceMs ? new Date(sinceMs).toISOString() : undefined;
    const result: Record<string, number> = {};

    for (const t of PULL_TABLES) {
      const { data, error } = await cloudSelect(t.cloud, schoolId, sinceIso);
      if (error) throw new SupabaseError(`Pull ${t.cloud}: ${error}`);
      const rows = (data ?? []) as Record<string, unknown>[];
      const localRows = rows
        .map((r) => fromCloudRow<TableRowMap[TableKey]>(t.local, r))
        .filter((r): r is TableRowMap[TableKey] => r !== null);
      if (localRows.length > 0) {
        const tableRef = db[t.local] as unknown as { bulkPut: (rows: unknown[]) => Promise<unknown> };
        await tableRef.bulkPut(localRows);
      }
      result[t.cloud] = localRows.length;
    }
    return result;
  }

  async runFullSync(): Promise<SyncReport> {
    const start = performance.now();
    const errors: string[] = [];
    let pushed: Record<string, number> = {};
    let pulled: Record<string, number> = {};

    if (!navigator.onLine) {
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
      return {
        ok: false,
        pushed,
        pulled,
        errors: ['supabase not configured'],
        durationMs: 0,
        lastSyncAt: 0
      };
    }

    // Allow sync without authentication - use schoolId for RLS
    const schoolId = getOrCreateSchoolId();
    if (!schoolId) {
      return {
        ok: false,
        pushed,
        pulled,
        errors: ['schoolId not available'],
        durationMs: 0,
        lastSyncAt: 0
      };
    }

    try {
      pushed = await this.pushAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[sync] push failed: ${msg}`);
      errors.push(`push: ${msg}`);
    }

    try {
      pulled = await this.pullAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[sync] pull failed: ${msg}`);
      errors.push(`pull: ${msg}`);
    }

    const now = Date.now();
    const ok = errors.length === 0;
    await settingRepository.set(SYNC_KEYS.lastSyncAt, String(now));
    if (!ok) {
      await settingRepository.set(SYNC_KEYS.lastError, errors.join('; '));
    } else {
      await settingRepository.set(SYNC_KEYS.lastError, '');
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