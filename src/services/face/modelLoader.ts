import * as faceapi from '@vladmandic/face-api';
import { FaceError } from './types';

export type FaceModelName = 'tinyFaceDetector' | 'faceLandmark68Net' | 'faceRecognitionNet';

export interface ModelLoadProgress {
  model: FaceModelName;
  loaded: number;
  total: number;
}

export class FaceModelLoader {
  private loaded = false;
  private loadingPromise: Promise<void> | null = null;
  private modelUrl = '/models';
  private listeners: Array<(p: ModelLoadProgress) => void> = [];

  onProgress(listener: (p: ModelLoadProgress) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(progress: ModelLoadProgress) {
    for (const l of this.listeners) l(progress);
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      try {
        const tf = (faceapi as unknown as { tf: { setBackend: (b: string) => Promise<void> } }).tf;
        if (tf) {
          await tf.setBackend('webgl');
        }

        const tasks: Array<{ name: FaceModelName; run: () => Promise<unknown> }> = [
          {
            name: 'tinyFaceDetector',
            run: () => faceapi.nets.tinyFaceDetector.loadFromUri(this.modelUrl)
          },
          {
            name: 'faceLandmark68Net',
            run: () => faceapi.nets.faceLandmark68Net.loadFromUri(this.modelUrl)
          },
          {
            name: 'faceRecognitionNet',
            run: () => faceapi.nets.faceRecognitionNet.loadFromUri(this.modelUrl)
          }
        ];

        for (let i = 0; i < tasks.length; i++) {
          const t = tasks[i];
          this.emit({ model: t.name, loaded: i, total: tasks.length });
          await t.run();
          this.emit({ model: t.name, loaded: i + 1, total: tasks.length });
        }

        this.loaded = true;
      } catch (err) {
        this.loadingPromise = null;
        throw new FaceError(
          'Gagal memuat model Face AI. Pastikan file model tersedia di /public/models/ dan dapat diakses.',
          err
        );
      }
    })();

    return this.loadingPromise;
  }
}

export const faceModelLoader = new FaceModelLoader();