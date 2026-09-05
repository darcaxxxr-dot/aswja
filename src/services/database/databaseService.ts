import { db } from './dexieSchema';
import { getOrCreateSchoolId } from '@utils/device';

export class DatabaseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class DatabaseService {
  private openPromise: Promise<void> | null = null;

  isAvailable(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  async open(): Promise<void> {
    if (!this.isAvailable()) {
      throw new DatabaseError('IndexedDB tidak tersedia di browser ini.');
    }
    if (!this.openPromise) {
      this.openPromise = db.open().then(() => {
        const schoolId = getOrCreateSchoolId();
        console.info(`[db] opened, school=${schoolId}`);
      });
    }
    return this.openPromise;
  }

  async counts(): Promise<Record<string, number>> {
    await this.open();
    return db.counts();
  }

  async exportJson(): Promise<string> {
    await this.open();
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
      db.schools.toArray(),
      db.academicYears.toArray(),
      db.classes.toArray(),
      db.students.toArray(),
      db.faceProfiles.toArray(),
      db.attendanceSessions.toArray(),
      db.attendanceRecords.toArray(),
      db.users.toArray(),
      db.settings.toArray(),
      db.syncQueue.toArray()
    ]);
    return JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        counts: {
          schools: schools.length,
          academicYears: academicYears.length,
          classes: classes.length,
          students: students.length,
          faceProfiles: faceProfiles.length,
          attendanceSessions: attendanceSessions.length,
          attendanceRecords: attendanceRecords.length,
          users: users.length,
          settings: settings.length,
          syncQueue: syncQueue.length
        },
        data: {
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
        }
      },
      null,
      2
    );
  }

  async resetAll(): Promise<void> {
    await this.open();
    await db.resetAll();
  }

  async importJson(json: string): Promise<Record<string, number>> {
    await this.open();
    const parsed = JSON.parse(json);
    if (!parsed?.data) {
      throw new DatabaseError('File backup tidak valid.');
    }
    const data = parsed.data;
    await db.transaction(
      'rw',
      [db.schools, db.academicYears, db.classes, db.students, db.faceProfiles, db.attendanceSessions, db.attendanceRecords, db.users, db.settings, db.syncQueue],
      async () => {
        await db.resetAll();
        if (Array.isArray(data.schools)) await db.schools.bulkAdd(data.schools);
        if (Array.isArray(data.academicYears)) await db.academicYears.bulkAdd(data.academicYears);
        if (Array.isArray(data.classes)) await db.classes.bulkAdd(data.classes);
        if (Array.isArray(data.students)) await db.students.bulkAdd(data.students);
        if (Array.isArray(data.faceProfiles)) await db.faceProfiles.bulkAdd(data.faceProfiles);
        if (Array.isArray(data.attendanceSessions)) await db.attendanceSessions.bulkAdd(data.attendanceSessions);
        if (Array.isArray(data.attendanceRecords)) await db.attendanceRecords.bulkAdd(data.attendanceRecords);
        if (Array.isArray(data.users)) await db.users.bulkAdd(data.users);
        if (Array.isArray(data.settings)) await db.settings.bulkAdd(data.settings);
        if (Array.isArray(data.syncQueue)) await db.syncQueue.bulkAdd(data.syncQueue);
      }
    );
    return this.counts();
  }
}

export const databaseService = new DatabaseService();