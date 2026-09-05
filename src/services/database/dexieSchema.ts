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

    this.version(1).stores({
      schools: 'id, name, createdAt',
      academicYears: 'id, schoolId, name, isActive, startDate, endDate',
      classes: 'id, schoolId, academicYearId, grade, name, createdAt',
      students: 'id, schoolId, nis, classId, status, name, createdAt, [schoolId+classId], [schoolId+nis]',
      faceProfiles: 'id, studentId, modelVersion, createdAt',
      attendanceSessions: 'id, schoolId, classId, date, status, createdAt, [schoolId+classId+date]',
      attendanceRecords: 'id, schoolId, sessionId, studentId, status, timestamp, [sessionId+studentId], [sessionId+timestamp]',
      users: 'id, schoolId, username, role, createdAt, [schoolId+username]',
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

  async counts(): Promise<Record<string, number>> {
    const [
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
    ] = await Promise.all([
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