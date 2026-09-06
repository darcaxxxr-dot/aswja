import * as faceapi from '@vladmandic/face-api';
import { FACE_CONFIG } from '@config/app';
import { faceModelLoader } from './modelLoader';
import type { BoundingBox, FaceBox, FaceLandmarks } from './types';

type FaceApiWithLandmarks = faceapi.WithFaceLandmarks<faceapi.WithFaceDetection<{}>, faceapi.FaceLandmarks68>;

export type FaceInput =
  | HTMLVideoElement
  | HTMLImageElement
  | HTMLCanvasElement
  | ImageBitmap
  | ImageData;

export interface DetectOptions {
  withLandmarks?: boolean;
  inputSize?: number;
  scoreThreshold?: number;
}

function makeDetectorOptions(inputSize?: number, scoreThreshold?: number): faceapi.TinyFaceDetectorOptions {
  return new faceapi.TinyFaceDetectorOptions({
    inputSize: inputSize ?? FACE_CONFIG.inputSize,
    scoreThreshold: scoreThreshold ?? FACE_CONFIG.scoreThreshold
  });
}

function toFaceBox(raw: faceapi.FaceDetection | FaceApiWithLandmarks): FaceBox {
  const det: faceapi.FaceDetection = 'detection' in raw ? raw.detection : raw;
  const box: BoundingBox = {
    x: det.box.x,
    y: det.box.y,
    width: det.box.width,
    height: det.box.height
  };
  const out: FaceBox = { box, score: det.score };
  if ('landmarks' in raw) {
    const lm: FaceLandmarks = {
      positions: raw.landmarks.positions.map((p) => ({ x: p.x, y: p.y }))
    };
    out.landmarks = lm;
  }
  return out;
}

export class FaceDetectionService {
  async detectSingle(input: FaceInput, options: DetectOptions = {}): Promise<FaceBox | null> {
    await faceModelLoader.load();
    const withLandmarks = options.withLandmarks ?? false;
    const opts = makeDetectorOptions(options.inputSize, options.scoreThreshold);

    if (withLandmarks) {
      const result = await faceapi.detectSingleFace(input as faceapi.TNetInput, opts).withFaceLandmarks();
      if (!result) return null;
      return toFaceBox(result);
    }

    const result = await faceapi.detectSingleFace(input as faceapi.TNetInput, opts);
    if (!result) return null;
    return toFaceBox(result);
  }

  async detectAll(input: FaceInput, options: DetectOptions = {}): Promise<FaceBox[]> {
    await faceModelLoader.load();
    const withLandmarks = options.withLandmarks ?? false;
    const opts = makeDetectorOptions(options.inputSize, options.scoreThreshold);

    if (withLandmarks) {
      const results = await faceapi.detectAllFaces(input as faceapi.TNetInput, opts).withFaceLandmarks();
      return results.map((r) => toFaceBox(r));
    }

    const results = await faceapi.detectAllFaces(input as faceapi.TNetInput, opts);
    return results.map((r) => toFaceBox(r));
  }
}

export const faceDetectionService = new FaceDetectionService();