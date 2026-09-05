export type CameraFacingMode = 'user' | 'environment';

export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
  facingMode: CameraFacingMode;
}

export interface CameraStartOptions {
  facingMode?: CameraFacingMode;
  deviceId?: string;
  width?: number;
  height?: number;
}

export interface CameraSnapshot {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  timestamp: number;
}

export class CameraError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'CameraError';
  }
}