import * as faceapi from '@vladmandic/face-api';
import { faceModelLoader } from './modelLoader';
import type { FaceBox } from './types';

type FaceApiDetection = faceapi.WithFaceDetection<{}>;
type FaceApiWithLandmarks = faceapi.WithFaceLandmarks<FaceApiDetection, faceapi.FaceLandmarks68>;

export interface ComputeEmbeddingOptions {
  inputSize?: number;
  scoreThreshold?: number;
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

export class FaceEmbeddingService {
  async computeFromVideo(
    video: HTMLVideoElement,
    options: ComputeEmbeddingOptions = {}
  ): Promise<{ detection: FaceBox; embedding: number[] } | null> {
    if (video.readyState < 2) return null;

    await faceModelLoader.load();

    const inputSize = options.inputSize ?? 320;
    const scoreThreshold = options.scoreThreshold ?? 0.5;

    const detection = await faceapi
      .detectSingleFace(
        video,
        new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold })
      )
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) return null;

    return {
      detection: toFaceBox(detection as unknown as FaceApiWithLandmarks),
      embedding: Array.from(detection.descriptor)
    };
  }

  async computeFromImage(
    image: HTMLImageElement | HTMLCanvasElement,
    options: ComputeEmbeddingOptions = {}
  ): Promise<{ detection: FaceBox; embedding: number[] } | null> {
    await faceModelLoader.load();
    const inputSize = options.inputSize ?? 320;
    const scoreThreshold = options.scoreThreshold ?? 0.5;

    const detection = await faceapi
      .detectSingleFace(
        image,
        new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold })
      )
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) return null;

    return {
      detection: toFaceBox(detection as unknown as FaceApiWithLandmarks),
      embedding: Array.from(detection.descriptor)
    };
  }

  computeQualityScore(detection: FaceBox, frameWidth: number, frameHeight: number): number {
    if (!frameWidth || !frameHeight) return 0;
    const area = detection.box.width * detection.box.height;
    const frameArea = frameWidth * frameHeight;
    const sizeRatio = Math.min(1, area / (frameArea * 0.25));
    const centeredX = Math.abs(detection.box.x + detection.box.width / 2 - frameWidth / 2) / frameWidth;
    const centeredY = Math.abs(detection.box.y + detection.box.height / 2 - frameHeight / 2) / frameHeight;
    const centering = Math.max(0, 1 - (centeredX + centeredY));
    const detectionScore = Math.max(0, Math.min(1, detection.score));
    return Math.round((0.4 * detectionScore + 0.4 * sizeRatio + 0.2 * centering) * 100) / 100;
  }
}

export const faceEmbeddingService = new FaceEmbeddingService();