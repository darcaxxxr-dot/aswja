export const APP_CONFIG = {
  appName: 'SmartFace Attendance',
  version: '0.1.0',
  deviceIdKey: 'sf_device_id',
  schoolIdKey: 'sf_school_id',
  schoolIdOverrideKey: 'sf_school_id_override'
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