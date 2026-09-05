export {
  faceModelLoader,
  FaceModelLoader,
  type FaceModelName,
  type ModelLoadProgress
} from './modelLoader';

export {
  faceDetectionService,
  FaceDetectionService,
  type DetectOptions
} from './faceDetectionService';

export {
  faceEmbeddingService,
  FaceEmbeddingService,
  type ComputeEmbeddingOptions
} from './faceEmbeddingService';

export {
  faceMatchingService,
  FaceMatchingService
} from './faceMatchingService';

export {
  faceEnrollmentService,
  FaceEnrollmentService,
  type EnrollmentPose,
  type EnrollmentProgress,
  type EnrollmentOptions
} from './faceEnrollmentService';

export {
  livenessService,
  LivenessService,
  type LivenessOptions
} from './livenessService';

export {
  faceRecognitionService,
  FaceRecognitionService,
  type RecognizeOptions
} from './faceRecognitionService';

export { FaceError } from './types';
export type {
  BoundingBox,
  FaceLandmarks,
  FaceBox,
  EmbeddingRecord,
  FaceMatchCandidate,
  RecognitionResult,
  EnrollmentSample,
  LivenessChallenge,
  LivenessResult
} from './types';