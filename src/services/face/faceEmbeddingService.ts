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
  ): Promise<{ detection: FaceBox; embedding: number[]; sharpness: number; lighting: number } | null> {
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

    const faceBox = toFaceBox(detection as unknown as FaceApiWithLandmarks);
    const sharpness = this.computeSharpnessFromDetection(detection, video.videoWidth, video.videoHeight);
    const lighting = this.computeLightingFromDetection(detection, video.videoWidth, video.videoHeight);

    return {
      detection: faceBox,
      embedding: Array.from(detection.descriptor),
      sharpness,
      lighting
    };
  }

  async computeFromImage(
    image: HTMLImageElement | HTMLCanvasElement,
    options: ComputeEmbeddingOptions = {}
  ): Promise<{ detection: FaceBox; embedding: number[]; sharpness: number; lighting: number } | null> {
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

    const faceBox = toFaceBox(detection as unknown as FaceApiWithLandmarks);
    const sharpness = this.computeSharpnessFromDetection(detection, image instanceof HTMLImageElement ? image.naturalWidth : image.width, image instanceof HTMLImageElement ? image.naturalHeight : image.height);
    const lighting = this.computeLightingFromDetection(detection, image instanceof HTMLImageElement ? image.naturalWidth : image.width, image instanceof HTMLImageElement ? image.naturalHeight : image.height);

    return {
      detection: faceBox,
      embedding: Array.from(detection.descriptor),
      sharpness,
      lighting
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

  private computeSharpnessFromDetection(detection: { detection: faceapi.FaceDetection; landmarks: faceapi.FaceLandmarks68 }, frameWidth: number, frameHeight: number): number {
    const box = detection.detection.box;
    const width = Math.max(1, Math.min(box.width, frameWidth - box.x));
    const height = Math.max(1, Math.min(box.height, frameHeight - box.y));
    if (width < 10 || height < 10) return 0.2;
    return 0.6;
  }

  private computeLightingFromDetection(detection: { detection: faceapi.FaceDetection; landmarks: faceapi.FaceLandmarks68 }, frameWidth: number, frameHeight: number): number {
    const box = detection.detection.box;
    const width = Math.max(1, Math.min(box.width, frameWidth - box.x));
    const height = Math.max(1, Math.min(box.height, frameHeight - box.y));
    if (width < 10 || height < 10) return 0.2;
    return 0.75;
  }
}

export const faceEmbeddingService = new FaceEmbeddingService();