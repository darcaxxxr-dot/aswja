import { APP_CONFIG } from '@config/app';

export function generateId(prefix: string = 'ID'): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  const ts = Date.now().toString(36).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

export function getOrCreateDeviceId(): string {
  let deviceId = localStorage.getItem(APP_CONFIG.deviceIdKey);
  if (!deviceId) {
    deviceId = `DEVICE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    localStorage.setItem(APP_CONFIG.deviceIdKey, deviceId);
  }
  return deviceId;
}

export function getOrCreateSchoolId(): string {
  let schoolId = localStorage.getItem(APP_CONFIG.schoolIdKey);
  if (!schoolId) {
    schoolId = generateId('SCH');
    localStorage.setItem(APP_CONFIG.schoolIdKey, schoolId);
  }
  return schoolId;
}

export function now(): number {
  return Date.now();
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: '2-digit' });
}