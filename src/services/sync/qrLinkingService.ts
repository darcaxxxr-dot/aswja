/**
 * QR Code-based device linking service.
 *
 * Flow:
 * 1. Existing device -> "Show QR" -> renders QR with Supabase config + schoolId
 * 2. New device -> "Scan QR" -> uses camera to scan -> extracts config -> sets local
 * 3. After scan success, both devices have same schoolId & Supabase config
 * 4. App automatically does pull/push to sync
 */

import { getOrCreateSchoolId, getBaseSchoolId } from '@utils/device';
import { getSupabaseConfig, setSupabaseRuntimeConfig } from './supabaseClient';
import { db } from '@services/database/dexieSchema';
import { APP_CONFIG } from '@config/app';

export interface DeviceLinkPayload {
  /** Schema version */
  v: 1;
  /** Supabase project URL */
  url: string;
  /** Supabase anon public key (safe to share in QR) */
  key: string;
  /** School ID to link to */
  schoolId: string;
  /** Human-readable school name (optional) */
  schoolName?: string;
  /** Device ID of the sender (informational) */
  from?: string;
  /** Timestamp (ms) when QR was generated */
  ts: number;
  /** Optional: if sender is currently logged in, share username so receiver can know */
  user?: string;
}

/** Build the payload to encode in the QR. */
export function buildPayload(options: { schoolName?: string; user?: string } = {}): DeviceLinkPayload | null {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;
  const schoolId = getOrCreateSchoolId();
  return {
    v: 1,
    url: cfg.url,
    key: cfg.anonKey,
    schoolId,
    schoolName: options.schoolName,
    user: options.user,
    ts: Date.now()
  };
}

/** Encode payload to a compact JSON string for QR. */
export function encodePayload(payload: DeviceLinkPayload): string {
  return JSON.stringify(payload);
}

/** Decode and validate a scanned payload. */
export function decodePayload(raw: string): DeviceLinkPayload | null {
  try {
    const obj = JSON.parse(raw) as Partial<DeviceLinkPayload>;
    if (!obj || obj.v !== 1) return null;
    if (typeof obj.url !== 'string' || !obj.url.startsWith('https://')) return null;
    if (typeof obj.key !== 'string' || obj.key.length < 20) return null;
    if (typeof obj.schoolId !== 'string' || obj.schoolId.length < 8) return null;
    if (typeof obj.ts !== 'number') return null;
    return obj as DeviceLinkPayload;
  } catch {
    return null;
  }
}

/**
 * Apply a scanned payload to local config.
 * - Sets Supabase runtime config (url + key)
 * - Sets schoolId override so local data goes to same school as sender
 * - Returns descriptive result
 */
export function applyPayload(payload: DeviceLinkPayload): {
  ok: boolean;
  message: string;
} {
  if (payload.v !== 1) {
    return { ok: false, message: 'Versi QR tidak dikenali.' };
  }
  if (payload.ts && Date.now() - payload.ts > 5 * 60 * 1000) {
    return { ok: false, message: 'QR sudah kadaluarsa (>5 menit). Minta QR baru dari device asal.' };
  }
  try {
    // Set Supabase runtime config (URL + anon key)
    setSupabaseRuntimeConfig(payload.url, payload.key);
    // Set school ID override - same key used by manual School ID linking in sync panel
    localStorage.setItem(APP_CONFIG.schoolIdOverrideKey, payload.schoolId);
    return {
      ok: true,
      message: `Terhubung ke ${payload.schoolName ?? 'school ' + payload.schoolId.substring(0, 8)}. Refresh halaman untuk menerapkan.`
    };
  } catch (e: unknown) {
    return { ok: false, message: 'Gagal menyimpan konfigurasi: ' + (e instanceof Error ? e.message : String(e)) };
  }
}

/**
 * Async version of applyPayload that clears local IndexedDB data before setting the override.
 * This prevents duplicate school IDs from coexisting in IndexedDB.
 * - Clears all local data (db.resetAll)
 * - Clears base school ID from localStorage
 * - Sets Supabase runtime config (url + key)
 * - Sets schoolId override
 * - Returns descriptive result
 */
export async function applyPayloadWithReset(payload: DeviceLinkPayload): Promise<{
  ok: boolean;
  message: string;
}> {
  if (payload.v !== 1) {
    return { ok: false, message: 'Versi QR tidak dikenali.' };
  }
  if (payload.ts && Date.now() - payload.ts > 5 * 60 * 1000) {
    return { ok: false, message: 'QR sudah kadaluarsa (>5 menit). Minta QR baru dari device asal.' };
  }
  try {
    const oldSchoolId = getBaseSchoolId();
    const isFirstLink = !oldSchoolId;

    // Clear localStorage keys (keep device_id, auth)
    localStorage.removeItem(APP_CONFIG.schoolIdKey);

    // Set Supabase runtime config (URL + anon key)
    setSupabaseRuntimeConfig(payload.url, payload.key);

    // Set school ID override - same key used by manual School ID linking in sync panel
    localStorage.setItem(APP_CONFIG.schoolIdOverrideKey, payload.schoolId);

    // Clear all local IndexedDB data to prevent duplicate school IDs
    await db.resetAll();

    const msg = isFirstLink
      ? `Berhasil link ke ${payload.schoolName ?? 'school ' + payload.schoolId.substring(0, 8)}. Data akan di-fetch otomatis.`
      : `Berhasil link ke ${payload.schoolName ?? 'school ' + payload.schoolId.substring(0, 8)}. Data lama dihapus, akan di-fetch otomatis.`;

    return { ok: true, message: msg };
  } catch (e: unknown) {
    return { ok: false, message: 'Gagal menyimpan konfigurasi: ' + (e instanceof Error ? e.message : String(e)) };
  }
}

/**
 * Generate QR code as data URL using 'qrcode' library (lazy import).
 * Returns SVG string (cleaner, smaller, sharper on retina).
 */
export async function generateQrSvg(payload: DeviceLinkPayload): Promise<string> {
  const QR = (await import('qrcode')).default;
  const text = encodePayload(payload);
  return QR.toString(text, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    color: { dark: '#0f172a', light: '#ffffff' }
  });
}

/** Generate QR as PNG data URL (alternative to SVG). */
export async function generateQrPng(payload: DeviceLinkPayload): Promise<string> {
  const QR = (await import('qrcode')).default;
  const text = encodePayload(payload);
  return QR.toDataURL(text, { errorCorrectionLevel: 'M', margin: 2, width: 360 });
}

/**
 * Start scanning via camera. Returns a handle to stop scanning.
 * Calls onResult with decoded text; onError with failure.
 */
export interface ScanHandle {
  stop: () => Promise<void>;
}

export interface ScanCallbacks {
  onResult: (text: string) => void;
  onError: (err: Error) => void;
}

export async function startScanning(
  containerId: string,
  callbacks: ScanCallbacks
): Promise<ScanHandle> {
  const { Html5Qrcode } = await import('html5-qrcode');

  const scanner = new Html5Qrcode(containerId, /* verbose */ false);

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
        callbacks.onResult(decodedText);
      },
      (_errorMessage: string) => {
        // ignore per-frame decode errors
      }
    );
  } catch (err: unknown) {
    callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    return { stop: async () => { /* noop */ } };
  }

  return {
    stop: async () => {
      try {
        await scanner.stop();
        await scanner.clear();
      } catch {
        // ignore
      }
    }
  };
}
