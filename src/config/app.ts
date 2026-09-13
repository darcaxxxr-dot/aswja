export const APP_CONFIG = {
  appName: 'ASWJA',
  version: '0.1.0',
  deviceIdKey: 'sf_device_id', // Legacy key - to be cleared after migration
  schoolIdKey: 'sf_school_id',
  schoolIdOverrideKey: 'sf_school_id_override',
  onboardingCompletedKey: 'sf_onboarding_completed',
  schoolProvisioningPendingKey: 'sf_school_provisioning_pending',
  schoolLinkPendingKey: 'sf_school_link_pending'
} as const;

export const CAMERA_CONFIG = {
  defaultFacingMode: 'user' as const,
  defaultWidth: 640,
  defaultHeight: 480,
  facingModes: ['user', 'environment'] as Array<'user' | 'environment'>
};

export const FACE_CONFIG = {
  inputSize: 224,
  scoreThreshold: 0.45
} as const;

export const ATTENDANCE_CONFIG = {
  defaultOnTimeUntil: '07:15',
  defaultLateAfter: '07:15',
  defaultCloseAt: '08:00',
  statusOrder: ['HADIR', 'TERLAMBAT', 'IZIN', 'SAKIT', 'ALPA'] as const
};

export const RECOGNITION_CONFIG = {
  targetThreshold: 0.75,
  minDetectionMs: 500,
  targetRecognitionMs: 2000,
  detectionIntervalMs: 200
} as const;

export const ROUTES = {
  dashboard: '/dashboard',
  onboarding: '/onboarding',
  students: '/students',
  studentImport: '/students/import',
  studentDetail: (id: string) => `/students/${id}`,
  enrollment: '/enrollment',
  classes: '/classes',
  attendance: '/attendance',
  attendanceDetail: (id: string) => `/attendance/${id}`,
  reports: '/reports',
  settings: '/settings',
  backup: '/backup',
  cameraTest: '/camera-test'
} as const;
