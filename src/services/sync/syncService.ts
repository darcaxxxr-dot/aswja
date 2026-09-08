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

// ===== PERBAIKAN: Mapping per tabel =====
function getCloudColumns(table: TableKey): string[] {
  switch (table) {
    case 'schools':
      return ['id', 'name', 'created_at', 'deleted_at'];
    case 'academicYears':
      return ['id', 'name', 'school_id', 'start_date', 'end_date', 'is_active', 'created_at', 'deleted_at'];
    case 'classes':
      return ['id', 'school_id', 'academic_year_id', 'grade', 'name', 'created_at', 'deleted_at'];
    case 'students':
      return ['id', 'school_id', 'nis', 'nisn', 'name', 'gender', 'class_id', 'status', 'created_at', 'updated_at', 'deleted_at'];
    case 'faceProfiles':
      return ['id', 'student_id', 'embedding', 'model_version', 'quality_score', 'created_at', 'updated_at', 'deleted_at'];
    case 'attendanceSessions':
      return ['id', 'school_id', 'class_id', 'date', 'start_time', 'end_time', 'status', 'created_by', 'created_at', 'deleted_at'];
    case 'attendanceRecords':
      return ['id', 'school_id', 'session_id', 'student_id', 'timestamp', 'status', 'confidence', 'device_id', 'created_at', 'deleted_at'];
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
      if (r.deletedAt) out.deleted_at = new Date(r.deletedAt).toISOString();
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
      if (r.deletedAt) out.deleted_at = new Date(r.deletedAt).toISOString();
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
      if (r.deletedAt) out.deleted_at = new Date(r.deletedAt).toISOString();
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
      out.created_by = r.createdBy;
      out.created_at = new Date(r.createdAt).toISOString();
      if (r.deletedAt) out.deleted_at = new Date(r.deletedAt).toISOString();
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
      out.device_id = r.deviceId;
      out.created_at = new Date(r.createdAt).toISOString();
      if (r.deletedAt) out.deleted_at = new Date(r.deletedAt).toISOString();
      break;
    }
  }

  return out;
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function fromCloudRow<T extends { id: string; schoolId?: string; updatedAt?: number; createdAt?: number; timestamp?: number; startTime?: number; endTime?: number; deletedAt?: number }>(table: TableKey, raw: Record<string, unknown>): T | null {
  if (!raw.id) return null;
  const id = String(raw.id);
  const createdAt = raw.created_at ? new Date(String(raw.created_at)).getTime() : Date.now();

  // Convert snake_case keys in raw to camelCase for local type compatibility
  const processed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const camelKey = snakeToCamel(key);
    processed[camelKey] = value;
  }

  // Parse deletedAt from cloud (snake_case → camelCase already done above)
  const deletedAt = processed.deletedAt ? new Date(String(processed.deletedAt)).getTime() : undefined;
  const updatedAt = processed.updatedAt ? new Date(String(processed.updatedAt)).getTime() : createdAt;

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
      createdAt,
      updatedAt,
      deletedAt
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
      createdAt,
      updatedAt,
      deletedAt
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
      deletedAt
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
      deletedAt
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
      deletedAt
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
      updatedAt: createdAt
    } as unknown as T;
  }

  return null;
}

export class SyncService {
  private intervalId: number | null = null;
  private listeners: Array<(status: SyncStatusInfo) => void> = [];
  private schemaCache: Record<string, Set<string>> = {};

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

  private async getExistingColumns(table: string): Promise<Set<string>> {
    if (this.schemaCache[table]) return this.schemaCache[table];
    const client = getSupabaseClient();
    if (!client) return new Set();
    try {
      const { data } = await client.from('information_schema.columns').select('column_name').eq('table_name', table).eq('table_schema', 'public');
      const cols = new Set((data ?? []).map((r: { column_name: string }) => r.column_name));
      this.schemaCache[table] = cols;
      return cols;
    } catch {
      return new Set();
    }
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

    // Ensure school record exists in IndexedDB so FK constraints in cloud are satisfied.
    // Without this, academic_years/classes/students/face_profiles push will fail with 23503.
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

    // Build a studentId → schoolId lookup map for faceProfiles injection
    const allStudents = await db.students.toArray();
    const studentSchoolMap = new Map<string, string>(allStudents.map((s) => [s.id, s.schoolId]));

    for (const t of PUSH_TABLES) {
      const all = (await db[t.local].toArray()) as TableRowMap[TableKey][];

      // Filter rows that belong to this school
      let schoolRows: TableRowMap[TableKey][];
      if (t.local === 'schools') {
        // Force-include the current school record so it gets pushed first
        schoolRows = all.filter((r) => (r as School).id === schoolId);
      } else if (t.local === 'faceProfiles') {
        schoolRows = all.filter((r) => {
          const fp = r as FaceProfile;
          return studentSchoolMap.get(fp.studentId) === schoolId;
        });
      } else {
        schoolRows = all.filter((r) => (r as { schoolId?: string }).schoolId === schoolId);
      }

      if (schoolRows.length === 0) {
        result[t.cloud] = 0;
        continue;
      }

      // Konversi ke cloud rows
      const cloudRows = schoolRows.map((r) => {
        const row = toCloudRow(t.local, r);
        // face_profiles tidak punya kolom school_id di cloud (resolved via student_id)
        return row;
      });

      // Dapatkan kolom yang valid untuk tabel ini
      let columns = getCloudColumns(t.local);
      const existingCols = await this.getExistingColumns(t.cloud);
      if (existingCols.size > 0) {
        columns = columns.filter((c) => existingCols.has(c));
      }

      try {
        const { inserted, errors } = await cloudUpsert(t.cloud, cloudRows as never[], columns);
        if (errors.length > 0) {
          console.warn(`[sync] Push ${t.cloud} errors:`, errors);
          // Log first row sample for debugging
          if (cloudRows.length > 0) {
            console.warn(`[sync] First row sample:`, JSON.stringify(cloudRows[0]));
          }
        }
        result[t.cloud] = inserted;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[sync] Push ${t.cloud} failed: ${msg}`);
        result[t.cloud] = 0;
        // Lanjut ke tabel berikutnya, jangan throw agar sync tabel lain tetap berjalan
      }
    }
    return result;
  }

  async pullAll(sinceMs?: number): Promise<Record<string, number>> {
    if (!getSupabaseClient()) throw new SupabaseError('Supabase client not configured');
    const schoolId = getOrCreateSchoolId();
    const sinceIso = sinceMs ? new Date(sinceMs).toISOString() : undefined;
    const result: Record<string, number> = {};

    for (const t of PULL_TABLES) {
      try {
        const { data, error } = await cloudSelect(t.cloud, schoolId, sinceIso);
        if (error) {
          console.warn(`[sync] Pull ${t.cloud} error:`, error);
          continue;
        }
        const rows = (data ?? []) as Record<string, unknown>[];
        if (rows.length === 0) {
          result[t.cloud] = 0;
          continue;
        }

        // Last-write-wins: hanya overwrite local jika cloud updatedAt lebih baru
        const tableRef = db[t.local] as unknown as { bulkGet: (ids: string[]) => Promise<unknown[]>; bulkPut: (rows: unknown[]) => Promise<unknown> };
        const incomingIds = rows.map((r) => String((r as { id: unknown }).id));
        let localRows: Array<{ id: string; updatedAt?: number; createdAt?: number }> = [];
        try {
          localRows = (await tableRef.bulkGet(incomingIds)) as Array<{ id: string; updatedAt?: number; createdAt?: number }>;
        } catch {
          localRows = [];
        }
        const localById = new Map(localRows.filter((r) => r && r.id).map((r) => [r.id, r]));

        const toWrite: TableRowMap[TableKey][] = [];
        let skipped = 0;
        for (const raw of rows) {
          const local = localById.get(String(raw.id));
          const cloudUpdated = raw.updated_at ? new Date(String(raw.updated_at)).getTime() : 0;
          // Untuk last-write-wins: hanya skip jika local punya updatedAt DAN lebih baru
          // Jika local.updatedAt tidak ada (mis. tabel lama), pakai 0 supaya cloud overwrite
          const localUpdated = local?.updatedAt ?? 0;
          if (local && localUpdated > 0 && localUpdated > cloudUpdated) {
            // Local lebih baru - skip
            skipped++;
            continue;
          }
          const converted = fromCloudRow<TableRowMap[TableKey]>(t.local, raw);
          if (converted) toWrite.push(converted);
        }
        if (toWrite.length > 0) {
          await tableRef.bulkPut(toWrite);
        }
        if (skipped > 0) {
          console.info(`[sync] Pull ${t.cloud}: ${toWrite.length} applied, ${skipped} skipped (local newer)`);
        }
        result[t.cloud] = toWrite.length;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[sync] Pull ${t.cloud} failed: ${msg}`);
        // Continue with other tables
      }
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