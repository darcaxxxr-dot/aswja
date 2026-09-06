import * as faceapi from '@vladmandic/face-api';
import { FACE_CONFIG } from '@config/app';
import { faceModelLoader } from './modelLoader';
import type { FaceBox } from './types';

type FaceApiDetection = faceapi.WithFaceDetection<{}>;
type FaceApiWithLandmarks = faceapi.WithFaceLandmarks<FaceApiDetection, faceapi.FaceLandmarks68>;

export interface ComputeEmbeddingOptions {
  inputSize?: number;
  scoreThreshold?: number;
  withDescriptor?: boolean;
}

export interface ComputeEmbeddingResult {
  detection: FaceBox;
  embedding: number[];
  sharpness: number;
  lighting: number;
  lapVar?: number;
}

function toFaceBox(raw: FaceApiWithLandmarks): FaceBox {
  const det = raw.detection;
  const box = det.box;
  return {
    box: { x: box.x, y: box.y, width: box.width, height: box.height },
    score: det.score,
    landmarks: {
      positions: raw.landmarks.positions.map((p) => ({ x: p.x, y: p.y }))
    }
  };
}

interface RoiStats {
  sharpness: number;
  lighting: number;
  lapVar: number;
}

function clampRoi(box: { x: number; y: number; width: number; height: number }, frameWidth: number, frameHeight: number): { x: number; y: number; width: number; height: number } {
  const x = Math.max(0, Math.min(box.x, frameWidth - 1));
  const y = Math.max(0, Math.min(box.y, frameHeight - 1));
  const width = Math.max(10, Math.min(box.width, frameWidth - x));
  const height = Math.max(10, Math.min(box.height, frameHeight - y));
  return { x, y, width, height };
}

function computeRoiStats(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement, box: { x: number; y: number; width: number; height: number }, sourceWidth: number, sourceHeight: number): RoiStats {
  const defaultStats: RoiStats = { sharpness: 0.5, lighting: 0.5, lapVar: 0 };
  if (!sourceWidth || !sourceHeight) return defaultStats;
  const roi = clampRoi(box, sourceWidth, sourceHeight);
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return defaultStats;
  ctx.drawImage(source as CanvasImageSource, roi.x, roi.y, roi.width, roi.height, 0, 0, 64, 64);
  const data = ctx.getImageData(0, 0, 64, 64).data;
  const gray = new Float32Array(64 * 64);
  for (let i = 0; i < 64 * 64; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  // Laplacian variance for sharpness
  let lapSum = 0;
  let lapSqSum = 0;
  let count = 0;
  for (let y = 1; y < 63; y++) {
    for (let x = 1; x < 63; x++) {
      const i = y * 64 + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - 64] - gray[i + 64];
      lapSum += lap;
      lapSqSum += lap * lap;
      count++;
    }
  }
  const lapMean = lapSum / count;
  const lapVar = lapSqSum / count - lapMean * lapMean;
  const sharpness = Math.max(0, Math.min(1, lapVar / 150));
  // Lighting: mean luminance (target ~128) + contrast (std dev)
  let lumSum = 0;
  for (let i = 0; i < gray.length; i++) lumSum += gray[i];
  const mean = lumSum / gray.length;
  let sqSum = 0;
  for (let i = 0; i < gray.length; i++) {
    const d = gray[i] - mean;
    sqSum += d * d;
  }
  const std = Math.sqrt(sqSum / gray.length);
  const luminanceScore = Math.max(0, 1 - Math.abs(mean - 128) / 100);
  const contrastScore = Math.min(1, std / 55);
  const lighting = Math.max(0, Math.min(1, luminanceScore * 0.7 + contrastScore * 0.3));
  return { sharpness, lighting, lapVar };
}

export const BLUR_THRESHOLD = 100;

export class FaceEmbeddingService {
  async computeFromVideo(
    video: HTMLVideoElement,
    options: ComputeEmbeddingOptions = {}
  ): Promise<ComputeEmbeddingResult | null> {
    if (video.readyState < 2) return null;

    await faceModelLoader.load();

    const inputSize = options.inputSize ?? FACE_CONFIG.inputSize;
    const scoreThreshold = options.scoreThreshold ?? FACE_CONFIG.scoreThreshold;
    const withDescriptor = options.withDescriptor ?? true;

    if (!withDescriptor) {
      const detectionOnly = await faceapi
        .detectSingleFace(
          video,
          new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold })
        )
        .withFaceLandmarks();

      if (!detectionOnly) return null;
      const faceBox = toFaceBox(detectionOnly);
      const stats = computeRoiStats(video, faceBox.box, video.videoWidth, video.videoHeight);
      return {
        detection: faceBox,
        embedding: [],
        sharpness: stats.sharpness,
        lighting: stats.lighting,
        lapVar: stats.lapVar
      };
    }

    const detection = await faceapi
      .detectSingleFace(
        video,
        new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold })
      )
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) return null;

    const faceBox = toFaceBox(detection as unknown as FaceApiWithLandmarks);
    const stats = computeRoiStats(video, faceBox.box, video.videoWidth, video.videoHeight);

    return {
      detection: faceBox,
      embedding: Array.from(detection.descriptor),
      sharpness: stats.sharpness,
      lighting: stats.lighting,
      lapVar: stats.lapVar
    };
  }

  async computeFromImage(
    image: HTMLImageElement | HTMLCanvasElement,
    options: ComputeEmbeddingOptions = {}
  ): Promise<ComputeEmbeddingResult | null> {
    await faceModelLoader.load();
    const inputSize = options.inputSize ?? FACE_CONFIG.inputSize;
    const scoreThreshold = options.scoreThreshold ?? FACE_CONFIG.scoreThreshold;
    const srcWidth = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
    const srcHeight = image instanceof HTMLImageElement ? image.naturalHeight : image.height;

    const detection = await faceapi
      .detectSingleFace(
        image,
        new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold })
      )
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) return null;

    const faceBox = toFaceBox(detection as unknown as FaceApiWithLandmarks);
    const stats = computeRoiStats(image, faceBox.box, srcWidth, srcHeight);

    return {
      detection: faceBox,
      embedding: Array.from(detection.descriptor),
      sharpness: stats.sharpness,
      lighting: stats.lighting,
      lapVar: stats.lapVar
    };
  }

  computeQualityScore(detection: FaceBox, frameWidth: number, frameHeight: number, sharpness = 0, lighting = 0): number {
    if (!frameWidth || !frameHeight) return 0;
    const area = detection.box.width * detection.box.height;
    const frameArea = frameWidth * frameHeight;
    const sizeRatio = Math.min(1, area / (frameArea * 0.25));
    const centeredX = Math.abs(detection.box.x + detection.box.width / 2 - frameWidth / 2) / frameWidth;
    const centeredY = Math.abs(detection.box.y + detection.box.height / 2 - frameHeight / 2) / frameHeight;
    const centering = Math.max(0, 1 - (centeredX + centeredY));
    const detectionScore = Math.max(0, Math.min(1, detection.score));
    const sharpnessScore = Math.max(0, Math.min(1, sharpness));
    const lightingScore = Math.max(0, Math.min(1, lighting));
    return Math.round((0.3 * detectionScore + 0.25 * sizeRatio + 0.15 * centering + 0.15 * sharpnessScore + 0.15 * lightingScore) * 100) / 100;
  }
}

export const faceEmbeddingService = new FaceEmbeddingService();