export type Gender = 'L' | 'P';

export type StudentStatus = 'active' | 'inactive' | 'graduated';

export interface Student {
  id: string;
  schoolId: string;
  nis: string;
  nisn?: string;
  name: string;
  gender: Gender;
  classId: string;
  status: StudentStatus;
  createdAt: number;
  updatedAt: number;
  /** Soft-delete tombstone. When set, the row is hidden from UI but still in DB & synced. */
  deletedAt?: number;
}

export interface ClassRoom {
  id: string;
  schoolId: string;
  name: string;
  grade: string;
  academicYearId: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface FaceProfile {
  id: string;
  studentId: string;
  embedding: number[][];
  modelVersion: string;
  qualityScore: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export type AttendanceStatus = 'HADIR' | 'TERLAMBAT' | 'IZIN' | 'SAKIT' | 'ALPA';

export type SessionStatus = 'open' | 'closed';

export type SessionType = 'CLASS' | 'PRAYER';

export type PrayerName = 'SUBUH' | 'DHUHUR' | 'ASHAR' | 'MAGHRIB' | 'ISYA';

export interface AttendanceSession {
  id: string;
  schoolId: string;
  classId: string;
  date: string;
  startTime: number;
  endTime?: number;
  status: SessionStatus;
  sessionType: SessionType;
  prayerName?: PrayerName;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface AttendanceRecord {
  id: string;
  schoolId: string;
  sessionId: string;
  studentId: string;
  timestamp: number;
  status: AttendanceStatus;
  confidence: number;
  deviceId: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export type UserRole = 'ADMIN' | 'TEACHER';

export interface User {
  id: string;
  schoolId: string;
  name: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Setting {
  key: string;
  value: string;
  updatedAt: number;
}

export type SyncEntity = 'student' | 'class' | 'face_profile' | 'session' | 'attendance' | 'user' | 'setting';
export type SyncOperation = 'create' | 'update' | 'delete';
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface SyncQueueItem {
  id: string;
  entity: SyncEntity;
  operation: SyncOperation;
  recordId: string;
  status: SyncStatus;
  retryCount: number;
  lastError?: string;
  createdAt: number;
  syncedAt?: number;
}

export interface School {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface AcademicYear {
  id: string;
  schoolId: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}