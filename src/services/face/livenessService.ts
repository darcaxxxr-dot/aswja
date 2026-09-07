import * as faceapi from '@vladmandic/face-api';
import { faceModelLoader } from './modelLoader';
import { FaceError } from './types';
import { settingRepository } from '@repositories/index';
import type { LivenessChallenge, LivenessResult } from './types';

export interface LivenessOptions {
  maxDurationMs?: number;
  movementThreshold?: number;
  blinkEARThreshold?: number;
  blinkConsecutiveFrames?: number;
  minOpenFrames?: number;
  calibrationFrames?: number;
  /**
   * Optional AbortSignal. When triggered, the liveness check returns
   * immediately with `success: false` and `reason: 'aborted'`. Useful for
   * letting the operator skip a slow liveness check.
   */
  signal?: AbortSignal;
}

interface LandmarkSnapshot {
  leftEyeAspect: number;
  rightEyeAspect: number;
  noseX: number;
  noseY: number;
  timestamp: number;
}

const LEFT_EYE = [36, 37, 38, 39, 40, 41];
const RIGHT_EYE = [42, 43, 44, 45, 46, 47];
const NOSE_TIP = 30;

function eyeAspectRatio(eye: { x: number; y: number }[]): number {
  if (eye.length < 6) return 1;
  const p1 = eye[0], p2 = eye[1], p3 = eye[2], p4 = eye[3], p5 = eye[4], p6 = eye[5];
  const vertical1 = Math.hypot(p2.x - p6.x, p2.y - p6.y);
  const vertical2 = Math.hypot(p3.x - p5.x, p3.y - p5.y);
  const horizontal = Math.hypot(p1.x - p4.x, p1.y - p4.y);
  if (horizontal === 0) return 1;
  return (vertical1 + vertical2) / (2 * horizontal);
}

function extractSnapshot(detection: { detection: faceapi.FaceDetection; landmarks: faceapi.FaceLandmarks68 }): LandmarkSnapshot {
  const positions = detection.landmarks.positions;
  const leftEye = LEFT_EYE.map((i) => positions[i]);
  const rightEye = RIGHT_EYE.map((i) => positions[i]);
  const nose = positions[NOSE_TIP];
  return {
    leftEyeAspect: eyeAspectRatio(leftEye),
    rightEyeAspect: eyeAspectRatio(rightEye),
    noseX: nose.x,
    noseY: nose.y,
    timestamp: Date.now()
  };
}

export class LivenessService {
  // Default values, will be overridden by settings
  private defaults = {
    blinkEARThreshold: 0.22,
    blinkConsecutiveFrames: 2,
    minOpenFrames: 3,
    movementThreshold: 0.015,
    maxDurationMs: 10000,
    calibrationFrames: 5,
  };

  private async getSettings(): Promise<Required<Omit<LivenessOptions, 'signal'>>> {
    const [ear, movement, duration, blinkFrames, openFrames, calibFrames] = await Promise.all([
      settingRepository.get('liveness.earThreshold'),
      settingRepository.get('liveness.movementThreshold'),
      settingRepository.get('liveness.timeoutMs'),
      settingRepository.get('liveness.blinkConsecutiveFrames'),
      settingRepository.get('liveness.minOpenFrames'),
      settingRepository.get('liveness.calibrationFrames'),
    ]);
    return {
      blinkEARThreshold: parseFloat(ear ?? String(this.defaults.blinkEARThreshold)),
      movementThreshold: parseFloat(movement ?? String(this.defaults.movementThreshold)),
      maxDurationMs: parseInt(duration ?? String(this.defaults.maxDurationMs), 10),
      blinkConsecutiveFrames: parseInt(blinkFrames ?? String(this.defaults.blinkConsecutiveFrames), 10),
      minOpenFrames: parseInt(openFrames ?? String(this.defaults.minOpenFrames), 10),
      calibrationFrames: parseInt(calibFrames ?? String(this.defaults.calibrationFrames), 10),
    };
  }

  async runChallenge(
    video: HTMLVideoElement,
    challenge: LivenessChallenge,
    onPrompt?: (msg: string) => void,
    options: LivenessOptions = {}
  ): Promise<LivenessResult> {
    await faceModelLoader.load();
    if (video.readyState < 2) {
      throw new FaceError('Video belum siap untuk liveness check.');
    }

    const settings = await this.getSettings();
    const maxDurationMs = options.maxDurationMs ?? settings.maxDurationMs;
    const movementThreshold = options.movementThreshold ?? settings.movementThreshold;
    const blinkEARThreshold = options.blinkEARThreshold ?? settings.blinkEARThreshold;
    const blinkConsecutiveFrames = options.blinkConsecutiveFrames ?? settings.blinkConsecutiveFrames;
    const minOpenFrames = options.minOpenFrames ?? settings.minOpenFrames;
    const calibrationFrames = options.calibrationFrames ?? settings.calibrationFrames;
    const signal = options.signal;

    const startTime = Date.now();
    const detector = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 });
    const snapshots: LandmarkSnapshot[] = [];
    let lastPromptUpdate = 0;
    let stopped = false;

    const checkAborted = (): boolean => {
      if (signal?.aborted) {
        stopped = true;
        return true;
      }
      return false;
    };
    // Register abort listener so external code can cancel mid-detection.
    signal?.addEventListener('abort', () => { stopped = true; }, { once: true });

    const promptMsg = (msg: string) => {
      const now = Date.now();
      if (onPrompt && now - lastPromptUpdate > 250) {
        onPrompt(msg);
        lastPromptUpdate = now;
      }
    };

    const promptFor = (challenge: LivenessChallenge): string => {
      switch (challenge) {
        case 'blink': return 'Silakan kedipkan mata Anda.';
        case 'turn_left': return 'Hadapkan wajah ke kiri.';
        case 'turn_right': return 'Hadapkan wajah ke kanan.';
      }
    };

    promptMsg(promptFor(challenge));

    // State for blink detection
    let eyesOpenCounter = 0;
    let blinkStarted = false;
    let blinkFramesCount = 0;

    // State for turn detection
    let calibrationSnapshots: LandmarkSnapshot[] = [];
    let calibrated = false;
    let refNoseX = 0;
    let refNoseY = 0;

    while (!stopped && Date.now() - startTime < maxDurationMs) {
      if (checkAborted()) break;
      const detection = await faceapi.detectSingleFace(video, detector).withFaceLandmarks();
      if (checkAborted()) break;
      if (!detection) {
        promptMsg('Wajah tidak terdeteksi, posisikan wajah di tengah kamera.');
        await this.sleep(150);
        continue;
      }

      const snap = extractSnapshot(detection);
      snapshots.push(snap);

      if (challenge === 'blink') {
        // Compute average EAR
        const ear = (snap.leftEyeAspect + snap.rightEyeAspect) / 2;
        if (!blinkStarted) {
          // Require eyes open for a number of frames
          if (ear > blinkEARThreshold) {
            eyesOpenCounter++;
            if (eyesOpenCounter >= minOpenFrames) {
              blinkStarted = true;
              promptMsg('Sekarang kedipkan mata Anda.');
            }
          } else {
            // If eyes closed before we start, reset counter
            eyesOpenCounter = 0;
          }
        } else {
          // Blink started: detect consecutive low EAR frames
          if (ear < blinkEARThreshold) {
            blinkFramesCount++;
            if (blinkFramesCount >= blinkConsecutiveFrames) {
              stopped = true;
              break;
            }
          } else {
            // If eyes open again, reset counter (but keep blinkStarted true)
            blinkFramesCount = 0;
          }
        }
        // Update prompt only if not yet started
        if (!blinkStarted) {
          promptMsg('Pastikan mata terbuka, lalu kedipkan mata.');
        } else {
          // We don't spam prompt here; already told to blink
        }
      } else {
        // Turn challenge
        if (!calibrated) {
          calibrationSnapshots.push(snap);
          if (calibrationSnapshots.length >= calibrationFrames) {
            // Calculate average nose position
            const sum = calibrationSnapshots.reduce((acc, s) => { acc.x += s.noseX; acc.y += s.noseY; return acc; }, { x: 0, y: 0 });
            refNoseX = sum.x / calibrationSnapshots.length;
            refNoseY = sum.y / calibrationSnapshots.length;
            calibrated = true;
            promptMsg(promptFor(challenge));
          } else {
            promptMsg('Posisikan wajah di tengah untuk kalibrasi...');
          }
          await this.sleep(150);
          continue;
        }

        // Now compare with reference
        const dx = (snap.noseX - refNoseX) / video.videoWidth;
        const dy = (snap.noseY - refNoseY) / video.videoHeight;
        const turnedLeft = dx < -movementThreshold;
        const turnedRight = dx > movementThreshold;
        const upDown = Math.abs(dy) > movementThreshold * 1.5;

        if (challenge === 'turn_left' && turnedLeft && !upDown) {
          stopped = true;
          break;
        }
        if (challenge === 'turn_right' && turnedRight && !upDown) {
          stopped = true;
          break;
        }
        // Prompt user based on current position
        if (challenge === 'turn_left') {
          if (dx < -movementThreshold * 0.5) {
            promptMsg('Bagus, sedikit lagi ke kiri...');
          } else if (dx > -movementThreshold * 0.5) {
            promptMsg('Hadapkan wajah ke kiri.');
          }
        } else {
          if (dx > movementThreshold * 0.5) {
            promptMsg('Bagus, sedikit lagi ke kanan...');
          } else if (dx < movementThreshold * 0.5) {
            promptMsg('Hadapkan wajah ke kanan.');
          }
        }
      }

      await this.sleep(150);
    }

    const durationMs = Date.now() - startTime;
    if (signal?.aborted) {
      return { success: false, challenge, durationMs, reason: 'aborted' };
    }
    if (!stopped) {
      return {
        success: false,
        challenge,
        durationMs,
        reason: `Timeout: tantangan tidak selesai dalam ${maxDurationMs/1000} detik.`
      };
    }
    return { success: true, challenge, durationMs };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const livenessService = new LivenessService();