import { APP_CONFIG } from '@config/app';
import { authService } from '@services/auth/index';
import { db } from '@services/database/dexieSchema';
import { isValidUuid, readActiveSchoolId, storeLinkedSchoolId, clearPendingSchoolLink, readPendingSchoolLink } from '@utils/device';
import { cloudSelect, getSupabaseClient, getSupabaseProjectRef } from './supabaseClient';

export interface SchoolLinkPayload {
  v: 2;
  purpose: 'school-link';
  projectRef: string;
  schoolId: string;
  schoolName?: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

export interface LinkResult {
  ok: boolean;
  message: string;
}

const MAX_QR_AGE_MS = 5 * 60 * 1000;

function safeProjectRef(projectRef: string): boolean {
  return /^[a-z0-9-]{3,64}$/i.test(projectRef);
}

export function buildPayload(options: { schoolName?: string } = {}): SchoolLinkPayload | null {
  const projectRef = getSupabaseProjectRef();
  const schoolId = readActiveSchoolId();
  if (!projectRef || !schoolId) return null;
  const issuedAt = Date.now();
  return {
    v: 2,
    purpose: 'school-link',
    projectRef,
    schoolId,
    schoolName: options.schoolName,
    issuedAt,
    expiresAt: issuedAt + MAX_QR_AGE_MS,
    nonce: crypto.randomUUID()
  };
}

export function encodePayload(payload: SchoolLinkPayload): string {
  return JSON.stringify(payload);
}

export function validateLinkPayload(payload: Partial<SchoolLinkPayload>): LinkResult {
  const currentProjectRef = getSupabaseProjectRef();
  if (payload.v !== 2 || payload.purpose !== 'school-link') {
    return { ok: false, message: 'QR bukan format school linking v2.' };
  }
  if (typeof payload.projectRef !== 'string' || !safeProjectRef(payload.projectRef)) {
    return { ok: false, message: 'Project QR tidak valid.' };
  }
  if (!currentProjectRef || payload.projectRef !== currentProjectRef) {
    return { ok: false, message: 'QR berasal dari project Supabase yang berbeda.' };
  }
  if (typeof payload.schoolId !== 'string' || !isValidUuid(payload.schoolId)) {
    return { ok: false, message: 'School ID pada QR tidak valid.' };
  }
  if (typeof payload.issuedAt !== 'number' || typeof payload.expiresAt !== 'number') {
    return { ok: false, message: 'Timestamp QR tidak valid.' };
  }
  if (payload.expiresAt <= Date.now() || payload.expiresAt - payload.issuedAt > MAX_QR_AGE_MS) {
    return { ok: false, message: 'QR sudah kadaluarsa. Minta QR baru dari device asal.' };
  }
  if (typeof payload.nonce !== 'string' || !isValidUuid(payload.nonce)) {
    return { ok: false, message: 'Nonce QR tidak valid.' };
  }
  return { ok: true, message: 'OK' };
}

export function decodePayload(raw: string): SchoolLinkPayload | null {
  try {
    const obj = JSON.parse(raw) as Partial<SchoolLinkPayload>;
    return validateLinkPayload(obj).ok ? (obj as SchoolLinkPayload) : null;
  } catch {
    return null;
  }
}

export async function verifyTargetSchoolAccess(schoolId: string): Promise<LinkResult> {
  if (!getSupabaseClient()) return { ok: false, message: 'Supabase belum dikonfigurasi.' };
  if (authService.isEnabled() && !authService.isAuthenticated()) {
    return { ok: false, message: 'Login terlebih dahulu sebelum link School ID.' };
  }
  const { data, error } = await cloudSelect('schools', schoolId);
  if (error) return { ok: false, message: `Akses School ID ditolak: ${error}` };
  if (!data.length) return { ok: false, message: 'School ID tidak ditemukan atau user tidak punya akses.' };
  return { ok: true, message: 'Akses School ID terverifikasi.' };
}

export function prepareLocalReplacement(oldSchoolId: string | null, newSchoolId: string): void {
  localStorage.setItem(APP_CONFIG.schoolLinkPendingKey, JSON.stringify({
    oldSchoolId,
    newSchoolId,
    startedAt: Date.now(),
    stage: 'prepared'
  }));
}

export async function commitSchoolReplacement(newSchoolId: string): Promise<void> {
  const pending = localStorage.getItem(APP_CONFIG.schoolLinkPendingKey);
  const parsedPending = pending ? JSON.parse(pending) : {};
  localStorage.setItem(APP_CONFIG.schoolLinkPendingKey, JSON.stringify({
    ...parsedPending,
    newSchoolId,
    stage: 'resetting'
  }));
  await db.resetAll();
  storeLinkedSchoolId(newSchoolId);
  localStorage.removeItem(APP_CONFIG.schoolLinkPendingKey);
}

export async function recoverPendingSchoolReplacement(): Promise<boolean> {
  const pending = readPendingSchoolLink();
  if (!pending) return false;
  const { newSchoolId, stage } = pending;
  if (stage === 'resetting' || stage === 'prepared') {
    try {
      await db.resetAll();
      if (newSchoolId && isValidUuid(newSchoolId)) {
        storeLinkedSchoolId(newSchoolId);
      }
      clearPendingSchoolLink();
      return true;
    } catch {
      clearPendingSchoolLink();
      return false;
    }
  }
  return false;
}

export async function linkToSchool(payload: SchoolLinkPayload): Promise<LinkResult> {
  const valid = validateLinkPayload(payload);
  if (!valid.ok) return valid;
  const current = readActiveSchoolId();
  if (current === payload.schoolId) return { ok: false, message: 'School ID sama dengan yang sedang aktif.' };
  const access = await verifyTargetSchoolAccess(payload.schoolId);
  if (!access.ok) return access;
  try {
    prepareLocalReplacement(current, payload.schoolId);
    await commitSchoolReplacement(payload.schoolId);
    // Bind the authenticated profile to the newly linked school so RLS accepts
    // pushes from this device (non-fatal if it fails — boot self-heal retries).
    const { provisionCurrentSchool } = await import('./provisioningService');
    const prov = await provisionCurrentSchool(payload.schoolId);
    const baseMessage = `Berhasil link ke ${payload.schoolName ?? payload.schoolId}.`;
    if (!prov.ok) {
      return { ok: true, message: `${baseMessage} Namun provisioning cloud gagal: ${prov.message}` };
    }
    return { ok: true, message: baseMessage };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function generateQrSvg(payload: SchoolLinkPayload): Promise<string> {
  const QR = (await import('qrcode')).default;
  return QR.toString(encodePayload(payload), {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    color: { dark: '#0f172a', light: '#ffffff' }
  });
}

export interface ScanHandle {
  stop: () => Promise<void>;
}

export interface ScanCallbacks {
  onResult: (text: string) => void;
  onError: (err: Error) => void;
}

export async function startScanning(containerId: string, callbacks: ScanCallbacks): Promise<ScanHandle> {
  const { Html5Qrcode } = await import('html5-qrcode');
  const scanner = new Html5Qrcode(containerId, false);
  let stopped = false;
  try {
    await scanner.start(
      { facingMode: 'environment' },
      {
        fps: 10,
        qrbox: (vw: number, vh: number) => {
          const minEdge = Math.min(vw, vh);
          const size = Math.max(180, Math.floor(minEdge * 0.7));
          return { width: size, height: size };
        },
        aspectRatio: 1.333
      },
      (decodedText: string) => {
        if (!stopped) {
          callbacks.onResult(decodedText);
        }
      },
      () => undefined
    );
  } catch (err: unknown) {
    callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    return { stop: async () => undefined };
  }
  return {
    stop: async () => {
      if (stopped) return;
      stopped = true;
      try {
        await scanner.stop();
        await scanner.clear();
      } catch {
        // ignore scanner cleanup failures
      }
    }
  };
}
