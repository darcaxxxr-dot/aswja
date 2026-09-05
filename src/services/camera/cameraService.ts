import { CAMERA_CONFIG } from '@config/app';
import {
  CameraError,
  type CameraDeviceInfo,
  type CameraSnapshot,
  type CameraStartOptions,
  type CameraFacingMode
} from './types';

export { CameraError } from './types';

export class CameraService {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private currentFacingMode: CameraFacingMode = CAMERA_CONFIG.defaultFacingMode;
  private currentDeviceId: string | null = null;

  isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
    );
  }

  async listDevices(): Promise<CameraDeviceInfo[]> {
    if (!this.isSupported()) {
      throw new CameraError('MediaDevices API tidak didukung di browser ini.');
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === 'videoinput');
      return cams.map((d, idx) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${idx + 1}`,
        facingMode: this.guessFacingMode(d.label, idx)
      }));
    } catch (err) {
      throw new CameraError('Gagal membaca daftar perangkat kamera.', err);
    }
  }

  private guessFacingMode(label: string, index: number): CameraFacingMode {
    const l = label.toLowerCase();
    if (l.includes('back') || l.includes('rear') || l.includes('environment')) return 'environment';
    if (l.includes('front') || l.includes('user') || l.includes('selfie')) return 'user';
    return index === 0 ? 'user' : 'environment';
  }

  async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) {
      throw new CameraError('MediaDevices API tidak didukung.');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch (err) {
      throw new CameraError('Izin kamera ditolak oleh pengguna atau perangkat.', err);
    }
  }

  async start(video: HTMLVideoElement, options: CameraStartOptions = {}): Promise<MediaStream> {
    if (!this.isSupported()) {
      throw new CameraError('MediaDevices API tidak didukung.');
    }
    if (this.stream) {
      await this.stop();
    }

    const facingMode = options.facingMode ?? this.currentFacingMode;
    const width = options.width ?? CAMERA_CONFIG.defaultWidth;
    const height = options.height ?? CAMERA_CONFIG.defaultHeight;

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: width },
        height: { ideal: height },
        ...(options.deviceId ? { deviceId: { exact: options.deviceId } } : {})
      }
    };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      if (options.deviceId) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: facingMode },
              width: { ideal: width },
              height: { ideal: height }
            }
          });
        } catch (err2) {
          throw new CameraError('Gagal membuka kamera pada perangkat ini.', err2);
        }
      } else {
        throw new CameraError('Gagal membuka kamera. Periksa izin & ketersediaan perangkat.', err);
      }
    }

    this.stream = stream;
    this.videoElement = video;
    this.currentFacingMode = facingMode;

    const track = stream.getVideoTracks()[0];
    if (track) {
      const settings = track.getSettings();
      this.currentDeviceId = settings.deviceId ?? options.deviceId ?? null;
    } else {
      this.currentDeviceId = options.deviceId ?? null;
    }

    video.setAttribute('playsinline', 'true');
    video.setAttribute('autoplay', 'true');
    video.muted = true;
    video.srcObject = stream;

    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('error', onError);
        resolve();
      };
      const onError = () => {
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('error', onError);
        reject(new CameraError('Gagal memuat stream video.'));
      };
      video.addEventListener('loadedmetadata', onLoaded);
      video.addEventListener('error', onError);
      video.play().catch(() => {
        /* play() may reject; ignore if metadata loaded */
      });
    });

    return stream;
  }

  async stop(): Promise<void> {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
  }

  async switchCamera(video: HTMLVideoElement): Promise<MediaStream> {
    const next: CameraFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
    return this.start(video, { facingMode: next });
  }

  getCurrentFacingMode(): CameraFacingMode {
    return this.currentFacingMode;
  }

  getCurrentDeviceId(): string | null {
    return this.currentDeviceId;
  }

  isActive(): boolean {
    return !!this.stream && this.stream.getTracks().some((t) => t.readyState === 'live');
  }

  async captureSnapshot(video?: HTMLVideoElement, mimeType: string = 'image/jpeg', quality: number = 0.92): Promise<CameraSnapshot> {
    const source = video ?? this.videoElement;
    if (!source) {
      throw new CameraError('Tidak ada video element yang aktif untuk capture.');
    }
    if (source.readyState < 2) {
      throw new CameraError('Video belum siap untuk di-capture.');
    }
    const canvas = document.createElement('canvas');
    canvas.width = source.videoWidth || CAMERA_CONFIG.defaultWidth;
    canvas.height = source.videoHeight || CAMERA_CONFIG.defaultHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new CameraError('Gagal membuat canvas context.');
    }
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new CameraError('Gagal membuat blob dari canvas.'));
        },
        mimeType,
        quality
      );
    });

    const dataUrl = canvas.toDataURL(mimeType, quality);
    return {
      blob,
      dataUrl,
      width: canvas.width,
      height: canvas.height,
      timestamp: Date.now()
    };
  }
}

export const cameraService = new CameraService();