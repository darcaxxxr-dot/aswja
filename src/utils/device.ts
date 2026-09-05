import { APP_CONFIG } from '@config/app';

export function generateId(prefix: string = 'ID'): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function generateUuid(): string {
  return crypto.randomUUID();
}

export function getOrCreateDeviceId(): string {
  let deviceId = localStorage.getItem(APP_CONFIG.deviceIdKey);
  if (!deviceId) {
    deviceId = `DEVICE-${crypto.randomUUID()}`;
    localStorage.setItem(APP_CONFIG.deviceIdKey, deviceId);
  }
  return deviceId;
}

export function getOrCreateSchoolId(): string {
  const override = localStorage.getItem(APP_CONFIG.schoolIdOverrideKey);
  if (override) return override;
  let schoolId = localStorage.getItem(APP_CONFIG.schoolIdKey);
  if (!schoolId) {
    schoolId = crypto.randomUUID();
    localStorage.setItem(APP_CONFIG.schoolIdKey, schoolId);
  }
  return schoolId;
}

export function setSchoolIdOverride(uuid: string): void {
  if (!uuid || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
    throw new Error('Invalid UUID format.');
  }
  localStorage.setItem(APP_CONFIG.schoolIdOverrideKey, uuid);
}

export function clearSchoolIdOverride(): void {
  localStorage.removeItem(APP_CONFIG.schoolIdOverrideKey);
}

export function getBaseSchoolId(): string {
  return localStorage.getItem(APP_CONFIG.schoolIdKey) ?? '';
}

export function isValidUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
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