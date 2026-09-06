import { generateId } from '@utils/device';
import { faceEmbeddingService, BLUR_THRESHOLD } from './faceEmbeddingService';
import { faceModelLoader } from './modelLoader';
import { FaceError } from './types';
import type { EmbeddingRecord, EnrollmentSample } from './types';

export type EnrollmentPose = 'front' | 'left' | 'right';

export interface EnrollmentProgress {
  pose: EnrollmentPose;
  index: number;
  total: number;
  qualityScore: number;
}

export interface EnrollmentProgressListener {
  (progress: EnrollmentProgress): void;
}

export interface EnrollmentOptions {
  minQualityScore?: number;
  sampleCount?: number;
}

const DEFAULT_SAMPLE_COUNT = 5;
const DEFAULT_POSES: EnrollmentPose[] = ['front', 'left', 'right'];

export class FaceEnrollmentService {
  private listeners: EnrollmentProgressListener[] = [];

  onProgress(listener: EnrollmentProgressListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(progress: EnrollmentProgress) {
    for (const l of this.listeners) l(progress);
  }

  async captureSample(
    video: HTMLVideoElement,
    pose: EnrollmentPose,
    options: EnrollmentOptions = {}
  ): Promise<EnrollmentSample> {
    await faceModelLoader.load();
    const minQualityScore = options.minQualityScore ?? 0.4;

    const result = await faceEmbeddingService.computeFromVideo(video);
    if (!result) {
      throw new FaceError(`Tidak ada wajah terdeteksi untuk pose "${pose}".`);
    }

    const quality = faceEmbeddingService.computeQualityScore(
      result.detection,
      video.videoWidth,
      video.videoHeight,
      result.sharpness,
      result.lighting
    );

    if (quality < minQualityScore) {
      throw new FaceError(
        `Kualitas wajah rendah (score=${quality}). Pastikan pencahayaan cukup dan wajah berada di tengah.`
      );
    }

    if (result.lapVar !== undefined && result.lapVar < BLUR_THRESHOLD) {
      throw new FaceError(
        `Wajah terlalu blurr (lapVar=${Math.round(result.lapVar)}). Pastikan posisi telanjang dan pencahayaan baik.`
      );
    }

    return {
      pose,
      embedding: result.embedding,
      qualityScore: quality,
      sharpness: result.sharpness,
      lighting: result.lighting,
      capturedAt: Date.now()
    };
  }

  async enroll(
    video: HTMLVideoElement,
    label: string,
    poses: EnrollmentPose[] = DEFAULT_POSES,
    options: EnrollmentOptions = {}
  ): Promise<EmbeddingRecord> {
    if (!label || !label.trim()) {
      throw new FaceError('Label siswa wajib diisi.');
    }

    const sampleCount = options.sampleCount ?? DEFAULT_SAMPLE_COUNT;
    const samples: EnrollmentSample[] = [];

    for (let i = 0; i < sampleCount; i++) {
      const pose = poses[i % poses.length];
      this.emit({ pose, index: i, total: sampleCount, qualityScore: 0 });
      const sample = await this.captureSample(video, pose, options);
      samples.push(sample);
      this.emit({ pose, index: i + 1, total: sampleCount, qualityScore: sample.qualityScore });
    }

    const embeddings = samples.map((s) => s.embedding);
    const avgQuality =
      Math.round((samples.reduce((a, b) => a + b.qualityScore, 0) / samples.length) * 100) / 100;

    return {
      id: generateId('FP'),
      label: label.trim(),
      embedding: embeddings,
      qualityScore: avgQuality,
      createdAt: Date.now()
    };
  }
}

export const faceEnrollmentService = new FaceEnrollmentService();