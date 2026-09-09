import { db } from '@services/database/dexieSchema';
import { generateId, now, getOrCreateSchoolId, getOrCreateDeviceId } from '@utils/device';
import { syncService } from '@services/sync/syncService';
import type {
  AttendanceRecord,
  AttendanceSession,
  AttendanceStatus,
  SessionStatus,
  SessionType,
  PrayerName
} from '@models/types';

/** Fire-and-forget push to Supabase after local write */
function pushAsync(): void {
  void syncService.pushAll().catch(() => undefined);
}

export interface CreateSessionInput {
  classId: string;
  date: string;
  sessionType: SessionType;
  prayerName?: PrayerName;
  startTime?: number;
  createdBy: string;
}

export interface RecordAttendanceInput {
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
  timestamp?: number;
  confidence: number;
}

/**
 * PRAYER SESSION HELPERS
 * -------------------------------------------------------
 * Prayer sessions differ from class sessions:
 * - classId is not required (prayer is school-wide, not class-specific)
 * - prayerName specifies which prayer
 * - No startTime/endTime concept the same way (or use prayer times)
 * - sessionType = 'PRAYER'
 */

export class AttendanceRepository {
  /** Prayer times config (can be moved to settings later) */
  static PRAYER_TIMES: Record<'SUBUH' | 'DHUHUR' | 'ASHAR' | 'MAGHRIB' | 'ISYA', { hours: number; minutes: number }> = {
    SUBUH: { hours: 4, minutes: 30 },
    DHUHUR: { hours: 12, minutes: 0 },
    ASHAR: { hours: 15, minutes: 0 },
    MAGHRIB: { hours: 18, minutes: 0 },
    ISYA: { hours: 19, minutes: 0 }
  };

  async listSessions(): Promise<AttendanceSession[]> {
    return db.attendanceSessions.orderBy('createdAt').reverse().toArray();
  }

  async getSession(id: string): Promise<AttendanceSession | undefined> {
    return db.attendanceSessions.get(id);
  }

  async listSessionsByClass(classId: string, date?: string, sessionType?: SessionType): Promise<AttendanceSession[]> {
    if (sessionType === 'PRAYER') {
      // Prayer sessions: search by schoolId + date + sessionType + prayerName (if specified)
      if (date) {
        return db.attendanceSessions
          .where('[schoolId+date+sessionType+prayerName]')
          .between([getOrCreateSchoolId(), date, 'CLASS', ''], [getOrCreateSchoolId(), date, 'PRAYER', '\uffff'])
          .toArray();
      }
      return db.attendanceSessions
        .where('sessionType')
        .equals('PRAYER')
        .and((s: AttendanceSession) => s.date === date)
        .toArray();
    }
    // Original class session logic
    if (date) {
      return db.attendanceSessions
        .where('[schoolId+classId+date]')
        .between([getOrCreateSchoolId(), classId, date], [getOrCreateSchoolId(), classId, date + '\uffff'])
        .toArray();
    }
    return db.attendanceSessions.where('classId').equals(classId).toArray();
  }

   async createSession(input: CreateSessionInput): Promise<AttendanceSession> {
    const ts = now();
    const row: AttendanceSession = {
      id: generateId('SES'),
      schoolId: getOrCreateSchoolId(),
      classId: input.classId,
      date: input.date,
      startTime: input.startTime ?? ts,
      status: 'open' as SessionStatus,
      sessionType: input.sessionType,
      prayerName: input.prayerName,
      createdBy: input.createdBy,
      createdAt: ts,
      updatedAt: ts
    };
    await db.attendanceSessions.add(row);
    pushAsync();
    return row;
  }

  async closeSession(id: string): Promise<AttendanceSession> {
    const existing = await db.attendanceSessions.get(id);
    if (!existing) throw new Error(`Session ${id} not found`);
    const ts = now();
    const updated: AttendanceSession = {
      ...existing,
      status: 'closed' as SessionStatus,
      endTime: ts,
      updatedAt: ts
    };
    await db.attendanceSessions.put(updated);
    pushAsync();
    return updated;
  }

  async listRecords(sessionId: string): Promise<AttendanceRecord[]> {
    return db.attendanceRecords
      .where('sessionId')
      .equals(sessionId)
      .sortBy('timestamp');
  }

  async hasRecord(sessionId: string, studentId: string): Promise<boolean> {
    const rec = await db.attendanceRecords
      .where('[sessionId+studentId]')
      .equals([sessionId, studentId])
      .first();
    return !!rec;
  }

  async recordAttendance(input: RecordAttendanceInput): Promise<AttendanceRecord> {
    const duplicate = await this.hasRecord(input.sessionId, input.studentId);
    if (duplicate) {
      throw new Error(`Siswa sudah diabsen pada sesi ini.`);
    }
    const ts = now();
    const row: AttendanceRecord = {
      id: generateId('ATT'),
      schoolId: getOrCreateSchoolId(),
      sessionId: input.sessionId,
      studentId: input.studentId,
      timestamp: input.timestamp ?? ts,
      status: input.status,
      confidence: input.confidence,
      deviceId: getOrCreateDeviceId(),
      createdAt: ts,
      updatedAt: ts
    };
    await db.attendanceRecords.add(row);
    pushAsync();
    return row;
  }

  async updateRecordStatus(id: string, status: AttendanceStatus): Promise<AttendanceRecord> {
    const existing = await db.attendanceRecords.get(id);
    if (!existing) throw new Error(`Record ${id} not found`);
    const ts = now();
    const updated: AttendanceRecord = { ...existing, status, updatedAt: ts };
    await db.attendanceRecords.put(updated);
    pushAsync();
    return updated;
  }

  async removeRecord(id: string): Promise<void> {
    await db.attendanceRecords.delete(id);
  }

  /** NEW: Create a prayer session for a specific prayer */
  async createPrayerSession(
    date: string,
    prayerName: PrayerName,
    createdBy: string,
    classId?: string
  ): Promise<AttendanceSession> {
    return this.createSession({
      classId: classId || '',
      date,
      sessionType: 'PRAYER',
      prayerName,
      createdBy
    });
  }

  /** NEW: List all prayer sessions for a date (optionally filtered by schoolId) */
  async listPrayerSessions(date: string, schoolId?: string): Promise<AttendanceSession[]> {
    if (schoolId) {
      return db.attendanceSessions
        .where('[schoolId+classId+date+sessionType+prayerName]')
        .between([schoolId, '', date, 'CLASS', ''], [schoolId, '', date, 'PRAYER', '\uffff'])
        .toArray();
    }
    return db.attendanceSessions
      .where('sessionType')
      .equals('PRAYER')
      .and((s: AttendanceSession) => s.date === date)
      .toArray();
  }

  /** NEW: List prayer sessions by prayer name for a specific school and date */
  async listPrayerSessionsByName(schoolId: string, prayerName: PrayerName, date?: string): Promise<AttendanceSession[]> {
    if (date) {
      return db.attendanceSessions
        .where('[schoolId+classId+date+sessionType+prayerName]')
        .between([schoolId, '', date, 'CLASS', ''], [schoolId, '', date, 'PRAYER', prayerName + '\uffff'])
        .toArray();
    }
    return db.attendanceSessions
      .where('sessionType')
      .equals('PRAYER')
      .and((s: AttendanceSession) => s.schoolId === schoolId && s.prayerName === prayerName)
      .toArray();
  }

  /** NEW: Count attendance records for a prayer name in a specific school */
  async countPrayerAttendance(schoolId: string, prayerName: PrayerName): Promise<number> {
    let sessionId: string | undefined;
    const sessions = await this.listPrayerSessionsByName(schoolId, prayerName);
    if (sessions.length === 0) return 0;
    const openSessions = sessions.filter((s) => s.status === 'open');
    if (openSessions.length > 0) {
      sessionId = openSessions[0].id;
    } else {
      sessionId = sessions[0].id;
    }
    return db.attendanceRecords
      .where('sessionId')
      .equals(sessionId)
      .count();
  }

  /** NEW: Get prayer session by name */
  async getPrayerSession(date: string, prayerName: PrayerName): Promise<AttendanceSession | undefined> {
    return db.attendanceSessions
      .where('sessionType')
      .equals('PRAYER')
      .and((s: AttendanceSession) => s.date === date && s.prayerName === prayerName)
      .first();
  }
}

export const attendanceRepository = new AttendanceRepository();