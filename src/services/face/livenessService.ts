import * as faceapi from '@vladmandic/face-api';
import { faceModelLoader } from './modelLoader';
import { FaceError } from './types';
import type { LivenessChallenge, LivenessResult } from './types';

export interface LivenessOptions {
  maxDurationMs?: number;
  movementThreshold?: number;
  blinkEARThreshold?: number;
  blinkConsecutiveFrames?: number;
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
  const p1 = eye[0];
  const p2 = eye[1];
  const p3 = eye[2];
  const p4 = eye[3];
  const p5 = eye[4];
  const p6 = eye[5];
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

    const maxDurationMs = options.maxDurationMs ?? 6000;
    const movementThreshold = options.movementThreshold ?? 0.012;
    const startTime = Date.now();

    const detector = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.45 });
    const snapshots: LandmarkSnapshot[] = [];
    let lastPromptUpdate = 0;
    let stopped = false;

    const promptMsg = (msg: string) => {
      const now = Date.now();
      if (onPrompt && now - lastPromptUpdate > 250) {
        onPrompt(msg);
        lastPromptUpdate = now;
      }
    };

    const promptFor = (challenge: LivenessChallenge): string => {
      switch (challenge) {
        case 'blink':
          return 'Silakan kedipkan mata Anda.';
        case 'turn_left':
          return 'Hadapkan wajah ke kiri.';
        case 'turn_right':
          return 'Hadapkan wajah ke kanan.';
      }
    };

    promptFor(challenge);

    while (!stopped && Date.now() - startTime < maxDurationMs) {
      const detection = await faceapi
        .detectSingleFace(video, detector)
        .withFaceLandmarks();

      if (!detection) {
        promptMsg('Wajah tidak terdeteksi, posisikan wajah di tengah kamera.');
        await new Promise((r) => setTimeout(r, 150));
        continue;
      }

      const snap = extractSnapshot(detection);
      snapshots.push(snap);

      if (challenge === 'blink') {
        if (snap.leftEyeAspect < 0.18 && snap.rightEyeAspect < 0.18) {
          stopped = true;
          break;
        }
        promptMsg('Silakan kedipkan mata Anda.');
      } else {
        if (snapshots.length >= 2) {
          const first = snapshots[0];
          const dx = (snap.noseX - first.noseX) / video.videoWidth;
          const dy = (snap.noseY - first.noseY) / video.videoHeight;
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
          promptFor(challenge);
        } else {
          promptMsg('Posisikan wajah di posisi awal, lalu hadap sesuai instruksi.');
        }
      }

      await new Promise((r) => setTimeout(r, 150));
    }

    const durationMs = Date.now() - startTime;
    if (!stopped) {
      return {
        success: false,
        challenge,
        durationMs,
        reason: 'Timeout: tantangan tidak selesai dalam waktu yang ditentukan.'
      };
    }
    return { success: true, challenge, durationMs };
  }
}

export const livenessService = new LivenessService();