import { faceDetectionService } from './faceDetectionService';
import { faceEmbeddingService } from './faceEmbeddingService';
import { faceMatchingService } from './faceMatchingService';
import { faceModelLoader } from './modelLoader';
import type {
  EmbeddingRecord,
  FaceBox,
  RecognitionResult
} from './types';
import { FACE_CONFIG } from '@config/app';

export interface RecognizeOptions {
  threshold?: number;
  useCosine?: boolean;
  minQuality?: number;
  withLandmarks?: boolean;
  inputSize?: number;
  scoreThreshold?: number;
}

export class FaceRecognitionService {
  async ensureReady(): Promise<void> {
    await faceModelLoader.load();
  }

  async detectOnly(
    video: HTMLVideoElement,
    options: RecognizeOptions = {}
  ): Promise<FaceBox | null> {
    await this.ensureReady();
    return faceDetectionService.detectSingle(video, {
      withLandmarks: options.withLandmarks ?? false,
      inputSize: options.inputSize ?? FACE_CONFIG.inputSize,
      scoreThreshold: options.scoreThreshold ?? FACE_CONFIG.scoreThreshold
    });
  }

  async recognize(
    video: HTMLVideoElement,
    database: EmbeddingRecord[],
    options: RecognizeOptions = {}
  ): Promise<RecognitionResult | null> {
    if (video.readyState < 2) return null;
    const threshold = options.threshold ?? 0.75;
    const useCosine = options.useCosine ?? true;
    const minQuality = options.minQuality ?? 0;
    const inputSize = options.inputSize ?? FACE_CONFIG.inputSize;
    const scoreThreshold = options.scoreThreshold ?? FACE_CONFIG.scoreThreshold;

    await this.ensureReady();
    const startedAt = performance.now();

    const result = await faceEmbeddingService.computeFromVideo(video, {
      inputSize,
      scoreThreshold
    });
    if (!result) return null;

    const match = faceMatchingService.findBestMatch(result.embedding, database, {
      threshold,
      useCosine,
      minQuality
    });

    return {
      matched: match.matched,
      candidate: match.candidate,
      topCandidates: match.topCandidates,
      embedding: result.embedding,
      detection: result.detection,
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10
    };
  }

  async recognizeFromEmbedding(
    embedding: number[],
    database: EmbeddingRecord[],
    options: { threshold?: number; useCosine?: boolean; minQuality?: number } = {}
  ): Promise<RecognitionResult> {
    const threshold = options.threshold ?? 0.75;
    const useCosine = options.useCosine ?? true;
    const minQuality = options.minQuality ?? 0;

    const match = faceMatchingService.findBestMatch(embedding, database, {
      threshold,
      useCosine,
      minQuality
    });
    return {
      matched: match.matched,
      candidate: match.candidate,
      topCandidates: match.topCandidates,
      embedding,
      detection: {
        box: { x: 0, y: 0, width: 0, height: 0 },
        score: 0
      },
      durationMs: 0
    };
  }
}

export const faceRecognitionService = new FaceRecognitionService();