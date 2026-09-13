import { APP_CONFIG } from '@config/app';

export function generateId(prefix: string = 'ID'): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function generateUuid(): string {
  return crypto.randomUUID();
}

export function readActiveSchoolId(): string | null {
  const schoolId = localStorage.getItem(APP_CONFIG.schoolIdKey);
  return schoolId && isValidUuid(schoolId) ? schoolId : null;
}

export function requireActiveSchoolId(): string {
  const schoolId = readActiveSchoolId();
  if (!schoolId) {
    throw new Error('School ID belum tersedia. Selesaikan onboarding terlebih dahulu.');
  }
  return schoolId;
}

export function hasCompletedOnboarding(): boolean {
  return localStorage.getItem(APP_CONFIG.onboardingCompletedKey) === 'true';
}

export function isSchoolProvisioningPending(): boolean {
  return localStorage.getItem(APP_CONFIG.schoolProvisioningPendingKey) === 'true';
}

export function markOnboardingCompleted(): void {
  localStorage.setItem(APP_CONFIG.onboardingCompletedKey, 'true');
}

export function clearSchoolProvisioningPending(): void {
  localStorage.removeItem(APP_CONFIG.schoolProvisioningPendingKey);
}

export function generateAndStoreNewSchoolId(): string {
  if (readActiveSchoolId()) {
    throw new Error('School ID sudah tersedia pada device ini.');
  }
  const schoolId = crypto.randomUUID();
  localStorage.setItem(APP_CONFIG.schoolIdKey, schoolId);
  markOnboardingCompleted();
  localStorage.setItem(APP_CONFIG.schoolProvisioningPendingKey, 'true');
  clearLegacyIdentityKeys();
  return schoolId;
}

export function storeLinkedSchoolId(schoolId: string): void {
  if (!isValidUuid(schoolId)) {
    throw new Error('Invalid UUID format.');
  }
  localStorage.setItem(APP_CONFIG.schoolIdKey, schoolId);
  markOnboardingCompleted();
  clearSchoolProvisioningPending();
  clearLegacyIdentityKeys();
}

export function promoteLegacySchoolOverride(): string | null {
  const override = localStorage.getItem(APP_CONFIG.schoolIdOverrideKey);
  if (!override || !isValidUuid(override)) return null;
  localStorage.setItem(APP_CONFIG.schoolIdKey, override);
  localStorage.removeItem(APP_CONFIG.schoolIdOverrideKey);
  markOnboardingCompleted();
  localStorage.setItem(APP_CONFIG.schoolProvisioningPendingKey, 'true');
  clearPendingSchoolLink();
  return override;
}

export function clearLegacyIdentityKeys(): void {
  localStorage.removeItem(APP_CONFIG.deviceIdKey);
  localStorage.removeItem(APP_CONFIG.schoolIdOverrideKey);
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

export function resetLocalDataPreservingSchoolIdentity(): void {
  const schoolId = localStorage.getItem(APP_CONFIG.schoolIdKey);
  const onboardingCompleted = localStorage.getItem(APP_CONFIG.onboardingCompletedKey);
  const schoolProvisioningPending = localStorage.getItem(APP_CONFIG.schoolProvisioningPendingKey);
  const schoolLinkPending = localStorage.getItem(APP_CONFIG.schoolLinkPendingKey);
  const supabaseRuntime = localStorage.getItem('sf_supabase_runtime');
  // Preserve auth session key (supabase auth stores session in localStorage under 'supabase.auth.token' or similar)
  // The exact key name is not guaranteed but we can check for common patterns
  const supabaseSessionKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('supabase.auth.') || key === 'sb:token')) {
      supabaseSessionKeys.push(key);
    }
  }
  const sessionStore: Record<string, string> = {};
  for (const key of supabaseSessionKeys) {
    sessionStore[key] = localStorage.getItem(key) ?? '';
  }

  localStorage.clear();
  
  if (schoolId) localStorage.setItem(APP_CONFIG.schoolIdKey, schoolId);
  if (onboardingCompleted) localStorage.setItem(APP_CONFIG.onboardingCompletedKey, onboardingCompleted);
  if (schoolProvisioningPending) localStorage.setItem(APP_CONFIG.schoolProvisioningPendingKey, schoolProvisioningPending);
  if (schoolLinkPending) localStorage.setItem(APP_CONFIG.schoolLinkPendingKey, schoolLinkPending);
  if (supabaseRuntime) localStorage.setItem('sf_supabase_runtime', supabaseRuntime);
  for (const [key, value] of Object.entries(sessionStore)) {
    if (value) localStorage.setItem(key, value);
  }
}

export function readPendingSchoolLink(): { oldSchoolId: string | null; newSchoolId: string | null; startedAt: number; stage: string } | null {
  const pending = localStorage.getItem(APP_CONFIG.schoolLinkPendingKey);
  if (!pending) return null;
  try {
    return JSON.parse(pending);
  } catch {
    return null;
  }
}

export function savePendingSchoolLink(oldSchoolId: string | null, newSchoolId: string, stage: string = 'prepared'): void {
  localStorage.setItem(APP_CONFIG.schoolLinkPendingKey, JSON.stringify({
    oldSchoolId,
    newSchoolId,
    startedAt: Date.now(),
    stage
  }));
}

export function clearPendingSchoolLink(): void {
  localStorage.removeItem(APP_CONFIG.schoolLinkPendingKey);
}
