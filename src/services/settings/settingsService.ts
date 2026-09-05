import { settingRepository } from '@repositories/index';
import { getOrCreateDeviceId, getOrCreateSchoolId } from '@utils/device';
import { getSupabaseConfig, getSupabaseClient } from '@services/sync/supabaseClient';
import { syncService } from '@services/sync/syncService';

export interface AppSettings {
  schoolName: string;
  schoolId: string;
  deviceId: string;
  attendance: {
    onTimeUntil: string;
    lateAfter: string;
    closeAt: string;
    livenessEnabled: boolean;
    livenessChallenge: 'blink' | 'turn_left' | 'turn_right';
  };
  face: {
    threshold: number;
    modelVersion: string;
    minQualityScore: number;
  };
  sync: {
    autoEnabled: boolean;
    intervalMs: number;
    lastSyncAt: number;
    lastError: string;
  };
  supabase: {
    url: string;
    keyLast4: string;
    isConfigured: boolean;
    source: 'env' | 'runtime' | 'none';
  };
}

const KEYS = {
  schoolName: 'school.name',
  attendanceOntime: 'attendance.onTimeUntil',
  attendanceLate: 'attendance.lateAfter',
  attendanceClose: 'attendance.closeAt',
  attendanceLivenessEnabled: 'attendance.livenessEnabled',
  attendanceLivenessChallenge: 'attendance.livenessChallenge',
  faceThreshold: 'face.threshold',
  faceModelVersion: 'face.modelVersion',
  faceMinQualityScore: 'face.minQualityScore',
  syncAutoEnabled: 'sync.autoEnabled',
  syncIntervalMs: 'sync.intervalMs'
} as const;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  schoolName: 'SMA Default',
  schoolId: '',
  deviceId: '',
  attendance: {
    onTimeUntil: '07:15',
    lateAfter: '07:15',
    closeAt: '08:00',
    livenessEnabled: false,
    livenessChallenge: 'blink'
  },
  face: {
    threshold: 0.8,
    modelVersion: 'face-api-tiny-v1',
    minQualityScore: 0.4
  },
  sync: {
    autoEnabled: true,
    intervalMs: 30000,
    lastSyncAt: 0,
    lastError: ''
  },
  supabase: {
    url: '',
    keyLast4: '',
    isConfigured: false,
    source: 'none'
  }
};

export class SettingsService {
  async load(): Promise<AppSettings> {
    const cfg = getSupabaseConfig();
    const status = await syncService.getStatus();
    const stored = await Promise.all([
      settingRepository.get(KEYS.schoolName),
      settingRepository.get(KEYS.attendanceOntime),
      settingRepository.get(KEYS.attendanceLate),
      settingRepository.get(KEYS.attendanceClose),
      settingRepository.get(KEYS.attendanceLivenessEnabled),
      settingRepository.get(KEYS.attendanceLivenessChallenge),
      settingRepository.get(KEYS.faceThreshold),
      settingRepository.get(KEYS.faceModelVersion),
      settingRepository.get(KEYS.faceMinQualityScore),
      settingRepository.get(KEYS.syncAutoEnabled),
      settingRepository.get(KEYS.syncIntervalMs)
    ]);

    return {
      ...DEFAULT_APP_SETTINGS,
      schoolName: stored[0] ?? DEFAULT_APP_SETTINGS.schoolName,
      schoolId: getOrCreateSchoolId(),
      deviceId: getOrCreateDeviceId(),
      attendance: {
        onTimeUntil: stored[1] ?? DEFAULT_APP_SETTINGS.attendance.onTimeUntil,
        lateAfter: stored[2] ?? DEFAULT_APP_SETTINGS.attendance.lateAfter,
        closeAt: stored[3] ?? DEFAULT_APP_SETTINGS.attendance.closeAt,
        livenessEnabled: stored[4] === 'true',
        livenessChallenge: (stored[5] as 'blink' | 'turn_left' | 'turn_right') ?? 'blink'
      },
      face: {
        threshold: stored[6] ? parseFloat(stored[6]!) : 0.8,
        modelVersion: stored[7] ?? 'face-api-tiny-v1',
        minQualityScore: stored[8] ? parseFloat(stored[8]!) : 0.4
      },
      sync: {
        autoEnabled: stored[9] === 'true',
        intervalMs: stored[10] ? parseInt(stored[10]!, 10) : 30000,
        lastSyncAt: status.lastSyncAt,
        lastError: status.lastError ?? ''
      },
      supabase: {
        url: cfg?.url ?? '',
        keyLast4: cfg?.anonKey ? cfg.anonKey.slice(-4) : '',
        isConfigured: !!cfg,
        source: cfg?.source ?? 'none'
      }
    };
  }

  async save(updates: {
    schoolName?: string;
    attendance?: Partial<AppSettings['attendance']>;
    face?: Partial<AppSettings['face']>;
    sync?: Partial<AppSettings['sync']>;
  }): Promise<void> {
    if (updates.schoolName !== undefined) {
      await settingRepository.set(KEYS.schoolName, updates.schoolName);
    }
    if (updates.attendance) {
      const a = updates.attendance;
      if (a.onTimeUntil !== undefined) await settingRepository.set(KEYS.attendanceOntime, a.onTimeUntil);
      if (a.lateAfter !== undefined) await settingRepository.set(KEYS.attendanceLate, a.lateAfter);
      if (a.closeAt !== undefined) await settingRepository.set(KEYS.attendanceClose, a.closeAt);
      if (a.livenessEnabled !== undefined) await settingRepository.set(KEYS.attendanceLivenessEnabled, String(a.livenessEnabled));
      if (a.livenessChallenge !== undefined) await settingRepository.set(KEYS.attendanceLivenessChallenge, a.livenessChallenge);
    }
    if (updates.face) {
      const f = updates.face;
      if (f.threshold !== undefined) await settingRepository.set(KEYS.faceThreshold, String(f.threshold));
      if (f.modelVersion !== undefined) await settingRepository.set(KEYS.faceModelVersion, f.modelVersion);
      if (f.minQualityScore !== undefined) await settingRepository.set(KEYS.faceMinQualityScore, String(f.minQualityScore));
    }
    if (updates.sync) {
      const s = updates.sync;
      if (s.autoEnabled !== undefined) await settingRepository.set(KEYS.syncAutoEnabled, String(s.autoEnabled));
      if (s.intervalMs !== undefined) await settingRepository.set(KEYS.syncIntervalMs, String(s.intervalMs));
    }
  }

  async exportConfig(): Promise<string> {
    const s = await this.load();
    return JSON.stringify(s, null, 2);
  }

  isSupabaseReady(): boolean {
    return getSupabaseClient() !== null;
  }
}

export const settingsService = new SettingsService();