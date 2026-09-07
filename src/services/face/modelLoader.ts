import * as faceapi from '@vladmandic/face-api';
import { FaceError } from './types';

export type FaceModelName = 'tinyFaceDetector' | 'faceLandmark68Net' | 'faceRecognitionNet';

export interface ModelLoadProgress {
  model: FaceModelName;
  loaded: number;
  total: number;
}

async function fetchAndVerify(url: string, label: string, retries = 2): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const cacheBuster = attempt > 0 ? `?retry=${attempt}&_=${Date.now()}` : '';
      const res = await fetch(url + cacheBuster, { cache: 'no-cache' });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} ${res.statusText}`);
        console.warn(`[modelLoader] ${label} HTTP ${res.status} (attempt ${attempt + 1}/${retries + 1})`);
        continue;
      }
      // Verify content-encoding — service worker atau CDN mungkin double-encode
      const enc = res.headers.get('content-encoding');
      const ct = res.headers.get('content-type') ?? '';
      if (enc && !/gzip|br|deflate|identity/i.test(enc)) {
        lastErr = new Error(`Unexpected Content-Encoding: ${enc}`);
        console.warn(`[modelLoader] ${label} bad encoding: ${enc} (attempt ${attempt + 1}/${retries + 1})`);
        continue;
      }
      if (label.endsWith('.json') && !ct.includes('json')) {
        // JSON file tapi content-type bukan json
        const text = await res.clone().text();
        if (!text.startsWith('{') && !text.startsWith('[')) {
          lastErr = new Error(`Not valid JSON, starts with: ${text.substring(0, 50)}`);
          console.warn(`[modelLoader] ${label} invalid json (attempt ${attempt + 1}/${retries + 1})`);
          continue;
        }
      }
      return res;
    } catch (err: unknown) {
      lastErr = err;
      console.warn(`[modelLoader] ${label} fetch error (attempt ${attempt + 1}/${retries + 1}):`, err);
    }
  }
  throw lastErr ?? new Error('fetch failed');
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
        // Probe model manifest first to ensure /models/ is reachable
        const manifestUrl = `${this.modelUrl}/tiny_face_detector_model-weights_manifest.json`;
        try {
          const probe = await fetchAndVerify(manifestUrl, 'tiny_face_detector_model-weights_manifest.json');
          console.info(`[modelLoader] manifest OK, content-type=${probe.headers.get('content-type')}, size=${probe.headers.get('content-length')}`);
        } catch (probeErr: unknown) {
          throw new FaceError(
            `Tidak dapat mencapai ${manifestUrl}. Pastikan file model tersedia di /public/models/ dan dapat diakses. ` +
            `Error: ${probeErr instanceof Error ? probeErr.message : String(probeErr)}`,
            probeErr
          );
        }

        // Try WebGL backend, fallback to CPU if not available
        const tf = (faceapi as unknown as { tf: { setBackend: (b: string) => Promise<void> } }).tf;
        if (tf) {
          try {
            await tf.setBackend('webgl');
            console.info('[modelLoader] TF backend: webgl');
          } catch {
            try {
              await tf.setBackend('cpu');
              console.warn('[modelLoader] TF backend fallback: cpu');
            } catch (e) {
              console.warn('[modelLoader] TF backend setup failed:', e);
            }
          }
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
          try {
            await t.run();
          } catch (e: unknown) {
            // If face-api fetch fails, try to give a better error message
            const msg = e instanceof Error ? e.message : String(e);
            if (/JSON|parse|empty|fetch|404|network/i.test(msg)) {
              throw new FaceError(
                `Gagal load ${t.name}: file model tidak bisa di-fetch/parse. ` +
                `Cek console untuk detail. ${msg}`,
                e
              );
            }
            throw e;
          }
          this.emit({ model: t.name, loaded: i + 1, total: tasks.length });
        }

        this.loaded = true;
      } catch (err) {
        this.loadingPromise = null;
        if (err instanceof FaceError) throw err;
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