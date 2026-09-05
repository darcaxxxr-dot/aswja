import { attendanceRepository, studentRepository, classRepository } from '@repositories/index';
import { getOrCreateDeviceId } from '@utils/device';
import type { AttendanceRecord, AttendanceSession, AttendanceStatus, ClassRoom, Student } from '@models/types';

export interface AttendanceWithContext {
  record: AttendanceRecord;
  student: Student | undefined;
  classRoom: ClassRoom | undefined;
  session: AttendanceSession | undefined;
}

export interface AttendanceSummaryByClass {
  classRoom: ClassRoom | undefined;
  total: number;
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  alpa: number;
  belum: number;
}

export interface AttendanceSummaryByDate {
  date: string;
  records: AttendanceRecord[];
}

function inDateRange(ts: number, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  const d = new Date(ts);
  const ymd = d.toISOString().slice(0, 10);
  if (from && ymd < from) return false;
  if (to && ymd > to) return false;
  return true;
}

function toLocalDateString(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function csvEscape(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export class ReportService {
  async listRecordsWithContext(filter: {
    classId?: string;
    dateFrom?: string;
    dateTo?: string;
    status?: AttendanceStatus;
    limit?: number;
  } = {}): Promise<AttendanceWithContext[]> {
    const students = await studentRepository.list();
    const classes = await classRepository.list();
    const allSessions = await attendanceRepository.listSessions();
    const studentMap = new Map(students.map((s) => [s.id, s]));
    const classMap = new Map(classes.map((c) => [c.id, c]));

    const candidateSessions = allSessions.filter((s) => {
      if (filter.classId && s.classId !== filter.classId) return false;
      return true;
    });

    const results: AttendanceWithContext[] = [];
    for (const ses of candidateSessions) {
      const records = await attendanceRepository.listRecords(ses.id);
      for (const rec of records) {
        if (!inDateRange(rec.timestamp, filter.dateFrom, filter.dateTo)) continue;
        if (filter.status && rec.status !== filter.status) continue;
        const student = studentMap.get(rec.studentId);
        const classRoom = classMap.get(ses.classId);
        results.push({ record: rec, student, classRoom, session: ses });
      }
    }

    results.sort((a, b) => b.record.timestamp - a.record.timestamp);
    if (filter.limit && filter.limit > 0) {
      return results.slice(0, filter.limit);
    }
    return results;
  }

  async getRecentAttendance(limit: number = 20): Promise<AttendanceWithContext[]> {
    return this.listRecordsWithContext({ limit });
  }

  async getDashboardTodayMetrics(): Promise<{
    totalStudents: number;
    totalClasses: number;
    todayDate: string;
    today: {
      hadir: number;
      terlambat: number;
      izin: number;
      sakit: number;
      alpa: number;
      belum: number;
    };
    perClass: Array<{
      classRoom: ClassRoom | undefined;
      total: number;
      present: number;
      late: number;
      belum: number;
    }>;
  }> {
    const today = toLocalDateString(Date.now());
    const [students, classes, allSessions] = await Promise.all([
      studentRepository.list(),
      classRepository.list(),
      attendanceRepository.listSessions()
    ]);

    const todaySessions = allSessions.filter((s) => s.date === today);

    const studentByClass = new Map<string, Student[]>();
    for (const c of classes) studentByClass.set(c.id, []);
    for (const s of students) {
      const arr = studentByClass.get(s.classId);
      if (arr) arr.push(s);
    }

    const todayMetrics = {
      hadir: 0,
      terlambat: 0,
      izin: 0,
      sakit: 0,
      alpa: 0,
      belum: 0
    };

    const classMetrics: Array<{
      classRoom: ClassRoom | undefined;
      total: number;
      present: number;
      late: number;
      belum: number;
    }> = [];

    for (const cls of classes) {
      const classStudents = studentByClass.get(cls.id) ?? [];
      const classTodaySessions = todaySessions.filter((s) => s.classId === cls.id);

      let present = 0;
      let late = 0;
      const recordedStudentIds = new Set<string>();

      for (const ses of classTodaySessions) {
        const records = await attendanceRepository.listRecords(ses.id);
        for (const r of records) {
          recordedStudentIds.add(r.studentId);
          if (r.status === 'HADIR') {
            present++;
            todayMetrics.hadir++;
          } else if (r.status === 'TERLAMBAT') {
            late++;
            todayMetrics.terlambat++;
          } else if (r.status === 'IZIN') todayMetrics.izin++;
          else if (r.status === 'SAKIT') todayMetrics.sakit++;
          else if (r.status === 'ALPA') todayMetrics.alpa++;
        }
      }

      const belum = Math.max(0, classStudents.length - recordedStudentIds.size);
      todayMetrics.belum += belum;
      classMetrics.push({
        classRoom: cls,
        total: classStudents.length,
        present: present + late,
        late,
        belum
      });
    }

    return {
      totalStudents: students.length,
      totalClasses: classes.length,
      todayDate: today,
      today: todayMetrics,
      perClass: classMetrics
    };
  }

  async exportCsv(filter: { classId?: string; dateFrom?: string; dateTo?: string; status?: AttendanceStatus } = {}): Promise<string> {
    const rows = await this.listRecordsWithContext(filter);
    const header = [
      'date',
      'time',
      'class',
      'nis',
      'nisn',
      'student_name',
      'status',
      'confidence',
      'device_id',
      'session_id',
      'record_id'
    ];
    const lines: string[] = [header.join(',')];

    for (const { record, student, classRoom } of rows) {
      const d = new Date(record.timestamp);
      const date = toLocalDateString(d.getTime());
      const time = d.toTimeString().slice(0, 8);
      lines.push(
        [
          date,
          time,
          csvEscape(classRoom?.name),
          csvEscape(student?.nis),
          csvEscape(student?.nisn),
          csvEscape(student?.name),
          csvEscape(record.status),
          record.confidence.toFixed(3),
          csvEscape(record.deviceId),
          csvEscape(record.sessionId),
          csvEscape(record.id)
        ].join(',')
      );
    }
    return lines.join('\n');
  }

  downloadCsv(filename: string, csv: string): void {
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  buildFilename(prefix: string = 'smartface-attendance'): string {
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    return `${prefix}-${ts}.csv`;
  }

  getDeviceId(): string {
    return getOrCreateDeviceId();
  }
}

export const reportService = new ReportService();