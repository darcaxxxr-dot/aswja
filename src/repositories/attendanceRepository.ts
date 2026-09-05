import { db } from '@services/database/dexieSchema';
import { generateId, now, getOrCreateSchoolId, getOrCreateDeviceId } from '@utils/device';
import type {
  AttendanceRecord,
  AttendanceSession,
  AttendanceStatus,
  SessionStatus
} from '@models/types';

export interface CreateSessionInput {
  classId: string;
  date: string;
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

export class AttendanceRepository {
  async listSessions(): Promise<AttendanceSession[]> {
    return db.attendanceSessions.orderBy('createdAt').reverse().toArray();
  }

  async getSession(id: string): Promise<AttendanceSession | undefined> {
    return db.attendanceSessions.get(id);
  }

  async listSessionsByClass(classId: string, date?: string): Promise<AttendanceSession[]> {
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
      status: 'open',
      createdBy: input.createdBy,
      createdAt: ts
    };
    await db.attendanceSessions.add(row);
    return row;
  }

  async closeSession(id: string): Promise<AttendanceSession> {
    const existing = await db.attendanceSessions.get(id);
    if (!existing) throw new Error(`Session ${id} not found`);
    const updated: AttendanceSession = {
      ...existing,
      status: 'closed' as SessionStatus,
      endTime: now()
    };
    await db.attendanceSessions.put(updated);
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
      createdAt: ts
    };
    await db.attendanceRecords.add(row);
    return row;
  }

  async updateRecordStatus(id: string, status: AttendanceStatus): Promise<AttendanceRecord> {
    const existing = await db.attendanceRecords.get(id);
    if (!existing) throw new Error(`Record ${id} not found`);
    const updated: AttendanceRecord = { ...existing, status };
    await db.attendanceRecords.put(updated);
    return updated;
  }

  async removeRecord(id: string): Promise<void> {
    await db.attendanceRecords.delete(id);
  }
}

export const attendanceRepository = new AttendanceRepository();