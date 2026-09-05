export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceLandmarks {
  positions: Array<{ x: number; y: number }>;
}

export interface FaceBox {
  box: BoundingBox;
  score: number;
  landmarks?: FaceLandmarks;
  embedding?: number[];
}

export interface EmbeddingRecord {
  id: string;
  label: string;
  embedding: number[];
  qualityScore: number;
  createdAt: number;
}

export interface FaceMatchCandidate {
  id: string;
  label: string;
  score: number;
  distance: number;
}

export interface RecognitionResult {
  matched: boolean;
  candidate: FaceMatchCandidate | null;
  topCandidates: FaceMatchCandidate[];
  embedding: number[];
  detection: FaceBox;
  durationMs: number;
}

export interface EnrollmentSample {
  pose: 'front' | 'left' | 'right' | 'up' | 'down';
  embedding: number[];
  qualityScore: number;
  sharpness: number;
  lighting: number;
  capturedAt: number;
}

export type LivenessChallenge = 'blink' | 'turn_left' | 'turn_right';

export interface LivenessResult {
  success: boolean;
  challenge: LivenessChallenge;
  durationMs: number;
  reason?: string;
}

export class FaceError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'FaceError';
  }
}