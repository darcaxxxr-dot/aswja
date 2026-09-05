import { faceDetectionService } from './faceDetectionService';
import { faceEmbeddingService } from './faceEmbeddingService';
import { faceMatchingService } from './faceMatchingService';
import { faceModelLoader } from './modelLoader';
import { FaceError } from './types';
import type {
  EmbeddingRecord,
  FaceBox,
  RecognitionResult
} from './types';

export interface RecognizeOptions {
  threshold?: number;
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
      withLandmarks: options.withLandmarks ?? true,
      inputSize: options.inputSize ?? 320,
      scoreThreshold: options.scoreThreshold ?? 0.5
    });
  }

  async recognize(
    video: HTMLVideoElement,
    database: EmbeddingRecord[],
    options: RecognizeOptions = {}
  ): Promise<RecognitionResult | null> {
    if (video.readyState < 2) return null;
    const threshold = options.threshold ?? 0.8;

    await this.ensureReady();
    const startedAt = performance.now();

    const result = await faceEmbeddingService.computeFromVideo(video, {
      inputSize: options.inputSize ?? 320,
      scoreThreshold: options.scoreThreshold ?? 0.5
    });
    if (!result) return null;

    const match = faceMatchingService.findBestMatch(result.embedding, database, threshold);

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
    threshold: number = 0.8
  ): Promise<RecognitionResult> {
    if (embedding.length === 0) {
      throw new FaceError('Embedding kosong, tidak dapat melakukan recognition.');
    }
    const match = faceMatchingService.findBestMatch(embedding, database, threshold);
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