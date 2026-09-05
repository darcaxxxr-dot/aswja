import { attendanceRepository, studentRepository, classRepository, faceProfileRepository, settingRepository } from '@repositories/index';
import { cameraService } from '@services/camera';
import { faceRecognitionService, livenessService, faceModelLoader, type RecognitionResult, type LivenessChallenge } from '@services/face';
import type { AttendanceRecord, AttendanceSession, AttendanceStatus, ClassRoom, Student } from '@models/types';

export interface AttendanceConfig {
  onTimeUntil: string;
  lateAfter: string;
  closeAt: string;
  threshold: number;
  livenessEnabled: boolean;
  livenessChallenge: LivenessChallenge;
}

export const DEFAULT_ATTENDANCE_CONFIG: AttendanceConfig = {
  onTimeUntil: '07:15',
  lateAfter: '07:15',
  closeAt: '08:00',
  threshold: 0.8,
  livenessEnabled: false,
  livenessChallenge: 'blink'
};

function parseHHMM(value: string | undefined, fallback: string): { hours: number; minutes: number } {
  const v = (value ?? fallback).trim();
  const m = v.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return parseHHMM(fallback, fallback);
  const h = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  const min = Math.max(0, Math.min(59, parseInt(m[2], 10)));
  return { hours: h, minutes: min };
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export class AttendanceConfigService {
  async load(): Promise<AttendanceConfig> {
    const [onTime, late, close, threshold, liveness, challenge] = await Promise.all([
      settingRepository.get('attendance.onTimeUntil'),
      settingRepository.get('attendance.lateAfter'),
      settingRepository.get('attendance.closeAt'),
      settingRepository.get('face.threshold'),
      settingRepository.get('attendance.livenessEnabled'),
      settingRepository.get('attendance.livenessChallenge')
    ]);
    return {
      onTimeUntil: onTime ?? DEFAULT_ATTENDANCE_CONFIG.onTimeUntil,
      lateAfter: late ?? DEFAULT_ATTENDANCE_CONFIG.lateAfter,
      closeAt: close ?? DEFAULT_ATTENDANCE_CONFIG.closeAt,
      threshold: parseFloat(threshold ?? String(DEFAULT_ATTENDANCE_CONFIG.threshold)),
      livenessEnabled: liveness === 'true',
      livenessChallenge: (challenge as LivenessChallenge) ?? DEFAULT_ATTENDANCE_CONFIG.livenessChallenge
    };
  }

  async save(config: Partial<AttendanceConfig>): Promise<void> {
    if (config.onTimeUntil !== undefined) await settingRepository.set('attendance.onTimeUntil', config.onTimeUntil);
    if (config.lateAfter !== undefined) await settingRepository.set('attendance.lateAfter', config.lateAfter);
    if (config.closeAt !== undefined) await settingRepository.set('attendance.closeAt', config.closeAt);
    if (config.threshold !== undefined) await settingRepository.set('face.threshold', String(config.threshold));
    if (config.livenessEnabled !== undefined) await settingRepository.set('attendance.livenessEnabled', String(config.livenessEnabled));
    if (config.livenessChallenge !== undefined) await settingRepository.set('attendance.livenessChallenge', config.livenessChallenge);
  }
}

export const attendanceConfigService = new AttendanceConfigService();

export function determineAutoStatus(config: AttendanceConfig, now: Date = new Date()): 'HADIR' | 'TERLAMBAT' {
  const cutoff = parseHHMM(config.onTimeUntil, DEFAULT_ATTENDANCE_CONFIG.onTimeUntil);
  const cutoffMin = cutoff.hours * 60 + cutoff.minutes;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin <= cutoffMin ? 'HADIR' : 'TERLAMBAT';
}

export class AttendanceService {
  private getEmbeddings = async (): Promise<Array<{ id: string; label: string; embedding: number[]; qualityScore: number; createdAt: number; studentId: string }>> => {
    const students = await studentRepository.list();
    const out: Array<{ id: string; label: string; embedding: number[]; qualityScore: number; createdAt: number; studentId: string }> = [];
    for (const s of students) {
      const profiles = await faceProfileRepository.listForStudent(s.id);
      for (const p of profiles) {
        out.push({
          id: p.id,
          label: s.name,
          embedding: p.embedding,
          qualityScore: p.qualityScore,
          createdAt: p.createdAt,
          studentId: s.id
        });
      }
    }
    return out;
  };

  async openSession(classId: string, createdBy: string, date: string = todayDateString()): Promise<AttendanceSession> {
    const existing = await attendanceRepository.listSessionsByClass(classId, date);
    const openOne = existing.find((s) => s.status === 'open');
    if (openOne) return openOne;
    return attendanceRepository.createSession({ classId, date, createdBy });
  }

  async getSessionWithClass(id: string): Promise<{ session: AttendanceSession; cls: ClassRoom | undefined } | null> {
    const session = await attendanceRepository.getSession(id);
    if (!session) return null;
    const cls = await classRepository.getById(session.classId);
    return { session, cls };
  }

  async listStudentsInSession(sessionId: string): Promise<Array<{ student: Student; record: AttendanceRecord | null }>> {
    const session = await attendanceRepository.getSession(sessionId);
    if (!session) throw new Error('Sesi tidak ditemukan');
    const students = await studentRepository.listByClass(session.classId);
    const records = await attendanceRepository.listRecords(sessionId);
    const recordMap = new Map(records.map((r) => [r.studentId, r]));
    return students
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((student) => ({ student, record: recordMap.get(student.id) ?? null }));
  }

  async runLivenessIfEnabled(video: HTMLVideoElement, config: AttendanceConfig): Promise<{ ok: boolean; reason?: string }> {
    if (!config.livenessEnabled) return { ok: true };
    try {
      const r = await livenessService.runChallenge(video, config.livenessChallenge);
      if (!r.success) return { ok: false, reason: r.reason ?? 'liveness gagal' };
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, reason: err instanceof Error ? err.message : 'liveness error' };
    }
  }

  async recognizeForSession(
    video: HTMLVideoElement,
    session: AttendanceSession,
    config: AttendanceConfig
  ): Promise<{ result: RecognitionResult | null; liveness: { ok: boolean; reason?: string } }> {
    const liveness = await this.runLivenessIfEnabled(video, config);
    if (!liveness.ok) return { result: null, liveness };
    if (!cameraService.isActive()) return { result: null, liveness };
    if (!faceModelLoader.isLoaded()) await faceModelLoader.load();
    const db = await this.getEmbeddings();
    if (db.length === 0) return { result: null, liveness };
    const result = await faceRecognitionService.recognize(video, db, { threshold: config.threshold });
    if (!result?.matched || !result.candidate) return { result, liveness };
    const profile = db.find((d) => d.id === result.candidate!.id);
    if (!profile) return { result, liveness };
    void session;
    return { result, liveness };
  }

  async recordAttendance(
    sessionId: string,
    studentId: string,
    confidence: number
  ): Promise<AttendanceRecord> {
    const config = await attendanceConfigService.load();
    const status = determineAutoStatus(config);
    return attendanceRepository.recordAttendance({
      sessionId,
      studentId,
      status,
      confidence
    });
  }

  async markManual(
    sessionId: string,
    studentId: string,
    status: AttendanceStatus,
    confidence: number = 0
  ): Promise<AttendanceRecord> {
    return attendanceRepository.recordAttendance({ sessionId, studentId, status, confidence });
  }

  async updateStatus(recordId: string, status: AttendanceStatus): Promise<AttendanceRecord> {
    return attendanceRepository.updateRecordStatus(recordId, status);
  }

  async removeRecord(recordId: string): Promise<void> {
    return attendanceRepository.removeRecord(recordId);
  }

  async closeSession(sessionId: string): Promise<AttendanceSession> {
    return attendanceRepository.closeSession(sessionId);
  }

  async listSessionsByClass(classId: string, date?: string): Promise<AttendanceSession[]> {
    return attendanceRepository.listSessionsByClass(classId, date);
  }

  async listSessions(): Promise<AttendanceSession[]> {
    return attendanceRepository.listSessions();
  }

  async getSession(id: string): Promise<AttendanceSession | undefined> {
    return attendanceRepository.getSession(id);
  }

  async getSessionSummary(sessionId: string): Promise<{
    total: number;
    hadir: number;
    terlambat: number;
    izin: number;
    sakit: number;
    alpa: number;
    belum: number;
  }> {
    const list = await this.listStudentsInSession(sessionId);
    const summary = {
      total: list.length,
      hadir: 0,
      terlambat: 0,
      izin: 0,
      sakit: 0,
      alpa: 0,
      belum: 0
    };
    for (const { record } of list) {
      if (!record) {
        summary.belum++;
        continue;
      }
      switch (record.status) {
        case 'HADIR': summary.hadir++; break;
        case 'TERLAMBAT': summary.terlambat++; break;
        case 'IZIN': summary.izin++; break;
        case 'SAKIT': summary.sakit++; break;
        case 'ALPA': summary.alpa++; break;
      }
    }
    return summary;
  }
}

export const attendanceService = new AttendanceService();