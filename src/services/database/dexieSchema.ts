import Dexie, { type Table } from 'dexie';
import type {
  AcademicYear,
  AttendanceRecord,
  AttendanceSession,
  ClassRoom,
  FaceProfile,
  School,
  Setting,
  Student,
  SyncQueueItem,
  User
} from '@models/types';

export class SmartFaceDB extends Dexie {
  schools!: Table<School, string>;
  academicYears!: Table<AcademicYear, string>;
  classes!: Table<ClassRoom, string>;
  students!: Table<Student, string>;
  faceProfiles!: Table<FaceProfile, string>;
  attendanceSessions!: Table<AttendanceSession, string>;
  attendanceRecords!: Table<AttendanceRecord, string>;
  users!: Table<User, string>;
  settings!: Table<Setting, string>;
  syncQueue!: Table<SyncQueueItem, string>;

  constructor() {
    super('smartface_attendance');

    this.version(4).stores({
      schools: 'id, name, createdAt, deletedAt',
      academicYears: 'id, schoolId, name, isActive, startDate, endDate, createdAt, updatedAt, deletedAt',
      classes: 'id, schoolId, academicYearId, grade, name, createdAt, deletedAt, [schoolId+grade+name]',
      students: 'id, schoolId, nis, classId, status, name, createdAt, deletedAt, [schoolId+classId], [schoolId+nis]',
      faceProfiles: 'id, studentId, modelVersion, createdAt, deletedAt',
      attendanceSessions: 'id, schoolId, classId, date, status, createdAt, deletedAt, [schoolId+classId+date]',
      attendanceRecords: 'id, schoolId, sessionId, studentId, status, timestamp, deletedAt, [sessionId+studentId], [sessionId+timestamp]',
      users: 'id, schoolId, username, role, createdAt, deletedAt, [schoolId+username]',
      settings: 'key, updatedAt',
      syncQueue: 'id, entity, operation, status, createdAt, [entity+status]'
    });

    // v5: Add prayer attendance support - sessionType and prayerName columns
    this.version(5).stores({
      schools: 'id, name, createdAt, deletedAt',
      academicYears: 'id, schoolId, name, isActive, startDate, endDate, createdAt, updatedAt, deletedAt',
      classes: 'id, schoolId, academicYearId, grade, name, createdAt, deletedAt, [schoolId+grade+name]',
      students: 'id, schoolId, nis, classId, status, name, createdAt, deletedAt, [schoolId+classId], [schoolId+nis]',
      faceProfiles: 'id, studentId, modelVersion, createdAt, deletedAt',
      attendanceSessions: 'id, schoolId, classId, date, status, createdAt, deletedAt, sessionType, prayerName, [schoolId+classId+date+sessionType+prayerName]',
      attendanceRecords: 'id, schoolId, sessionId, studentId, status, timestamp, deletedAt, [sessionId+studentId], [sessionId+timestamp]',
      users: 'id, schoolId, username, role, createdAt, deletedAt, [schoolId+username]',
      settings: 'key, updatedAt',
      syncQueue: 'id, entity, operation, status, createdAt, [entity+status]'
    });
  }

  async resetAll(): Promise<void> {
    await this.transaction(
      'rw',
      [
        this.schools,
        this.academicYears,
        this.classes,
        this.students,
        this.faceProfiles,
        this.attendanceSessions,
        this.attendanceRecords,
        this.users,
        this.settings,
        this.syncQueue
      ],
      async () => {
        await Promise.all([
          this.schools.clear(),
          this.academicYears.clear(),
          this.classes.clear(),
          this.students.clear(),
          this.faceProfiles.clear(),
          this.attendanceSessions.clear(),
          this.attendanceRecords.clear(),
          this.users.clear(),
          this.settings.clear(),
          this.syncQueue.clear()
        ]);
      }
    );
  }

  /** Soft-delete a row by id (sets deletedAt = now). */
  async softDelete(table: 'schools' | 'academicYears' | 'classes' | 'students' | 'faceProfiles' | 'attendanceSessions' | 'attendanceRecords' | 'users', id: string): Promise<void> {
    const t = this[table] as unknown as { update: (id: string, changes: Record<string, unknown>) => Promise<unknown> };
    await t.update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
  }

  /** Hard-delete rows where deletedAt < cutoff (cleanup tombstones older than N days). */
  async purgeDeleted(cutoffMs: number): Promise<number> {
    const tables: Array<'schools' | 'academicYears' | 'classes' | 'students' | 'faceProfiles' | 'attendanceSessions' | 'attendanceRecords' | 'users'> =
      ['schools', 'academicYears', 'classes', 'students', 'faceProfiles', 'attendanceSessions', 'attendanceRecords', 'users'];
    let purged = 0;
    for (const t of tables) {
      const tbl = this[t] as unknown as { filter: (fn: (r: { deletedAt?: number }) => boolean) => { toArray: () => Promise<unknown[]>; delete: () => Promise<number> } };
      const rows = await tbl.filter((r) => (r.deletedAt ?? 0) < cutoffMs && (r.deletedAt ?? 0) > 0).toArray();
      for (const r of rows) {
        await (this[t] as unknown as { delete: (id: string) => Promise<unknown> }).delete((r as { id: string }).id);
        purged++;
      }
    }
    return purged;
  }

  async counts(): Promise<Record<string, number>> {
    const [schools, academicYears, classes, students, faceProfiles, attendanceSessions, attendanceRecords, users, settings, syncQueue] = await Promise.all([
      this.schools.count(),
      this.academicYears.count(),
      this.classes.count(),
      this.students.count(),
      this.faceProfiles.count(),
      this.attendanceSessions.count(),
      this.attendanceRecords.count(),
      this.users.count(),
      this.settings.count(),
      this.syncQueue.count()
    ]);
    return {
      schools,
      academicYears,
      classes,
      students,
      faceProfiles,
      attendanceSessions,
      attendanceRecords,
      users,
      settings,
      syncQueue
    };
  }
}

export const db = new SmartFaceDB();