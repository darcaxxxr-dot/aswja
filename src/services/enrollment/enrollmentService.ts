import { cameraService } from '@services/camera';
import { faceEnrollmentService, faceRecognitionService, faceModelLoader, livenessService, type EnrollmentPose } from '@services/face';
import { studentRepository, faceProfileRepository, settingRepository } from '@repositories/index';
import type { FaceProfile, Student } from '@models/types';
import { FaceError } from '@services/face';

const MODEL_VERSION = 'face-api-tiny-v1';
const POSE_LABELS: Record<string, string> = {
  front: 'Hadap Depan',
  left: 'Serong Kiri',
  right: 'Serong Kanan'
};
type PoseKey = 'front' | 'left' | 'right';

export interface EnrollmentContext {
  student: Student;
  video: HTMLVideoElement;
}

export interface EnrollmentResult {
  studentId: string;
  profiles: FaceProfile[];
  samples: Array<{ pose: EnrollmentPose; qualityScore: number }>;
  avgQuality: number;
  livenessBypassed?: boolean;
}

interface StepOptions {
  onStep?: (step: string, msg: string) => void;
  skipLiveness?: boolean;
}

export class EnrollmentService {
  async ensureCameraAndModel(video: HTMLVideoElement): Promise<void> {
    if (!cameraService.isActive()) {
      throw new FaceError('Aktifkan kamera terlebih dahulu.');
    }
    if (!faceModelLoader.isLoaded()) {
      await faceModelLoader.load();
    }
    void video;
  }

  async listStudentsWithoutProfile(): Promise<Student[]> {
    const all = await studentRepository.list();
    const result: Student[] = [];
    for (const s of all) {
      const profiles = await faceProfileRepository.listForStudent(s.id);
      if (profiles.length === 0) result.push(s);
    }
    return result;
  }

  async listStudentsWithProfile(): Promise<Array<Student & { profileCount: number }>> {
    const all = await studentRepository.list();
    const result: Array<Student & { profileCount: number }> = [];
    for (const s of all) {
      const profiles = await faceProfileRepository.listForStudent(s.id);
      if (profiles.length > 0) result.push({ ...s, profileCount: profiles.length });
    }
    return result;
  }

  async enrollStudent(
    student: Student,
    video: HTMLVideoElement,
    poses: EnrollmentPose[] = ['front', 'left', 'right'],
    onProgress?: (msg: string, percent: number) => void
  ): Promise<EnrollmentResult> {
    await this.ensureCameraAndModel(video);
    onProgress?.(`Mulai enrollment untuk ${student.name}...`, 0);

    const unsub = faceEnrollmentService.onProgress((p) => {
      onProgress?.(`Pose ${p.index}/${p.total}: ${p.pose} (quality=${p.qualityScore.toFixed(2)})`, (p.index / p.total) * 100);
    });

    let record;
    try {
      record = await faceEnrollmentService.enroll(video, student.name, poses, {
        minQualityScore: parseFloat((await settingRepository.get('face.minQualityScore')) ?? '0.4')
      });
    } finally {
      unsub();
    }

    onProgress?.('Menyimpan face profile ke database...', 95);
    const profiles = await faceProfileRepository.replaceForStudent(student.id, [
      { embedding: record.embedding, modelVersion: MODEL_VERSION, qualityScore: record.qualityScore }
    ]);

    onProgress?.('Selesai.', 100);

    return {
      studentId: student.id,
      profiles,
      samples: poses.map((pose) => ({ pose, qualityScore: record.qualityScore })),
      avgQuality: record.qualityScore
    };
  }

  async enrollStudentWithFlow(student: Student, video: HTMLVideoElement, options: StepOptions = {}): Promise<EnrollmentResult> {
    await this.ensureCameraAndModel(video);
    const { onStep, skipLiveness = false } = options;

    let livenessOk = false;
    let livenessBypassed = false;
    let livenessError = '';

    if (!skipLiveness) {
      onStep?.('liveness', 'Memulai verifikasi liveness...');
      const livenessChallenge = (await settingRepository.get('face.livenessChallenge')) ?? 'blink';
      
      const earThreshold = parseFloat(await settingRepository.get('liveness.earThreshold') ?? '0.22');
      const movementThreshold = parseFloat(await settingRepository.get('liveness.movementThreshold') ?? '0.015');
      const timeoutMs = parseInt(await settingRepository.get('liveness.timeoutMs') ?? '10000', 10);
      const blinkFrames = parseInt(await settingRepository.get('liveness.blinkConsecutiveFrames') ?? '2', 10);
      const minOpenFrames = parseInt(await settingRepository.get('liveness.minOpenFrames') ?? '3', 10);
      const calibFrames = parseInt(await settingRepository.get('liveness.calibrationFrames') ?? '5', 10);

      for (let attempt = 1; attempt <= 3; attempt++) {
        onStep?.('liveness', `Verifikasi liveness (percobaan ${attempt}/3)...`);
        try {
          const livenessResult = await livenessService.runChallenge(
            video,
            livenessChallenge as 'blink' | 'turn_left' | 'turn_right',
            (msg) => {
              onStep?.('liveness', msg);
            },
            {
              blinkEARThreshold: earThreshold,
              movementThreshold: movementThreshold,
              maxDurationMs: timeoutMs,
              blinkConsecutiveFrames: blinkFrames,
              minOpenFrames: minOpenFrames,
              calibrationFrames: calibFrames,
            }
          );
          if (livenessResult.success) {
            livenessOk = true;
            break;
          } else {
            livenessError = livenessResult.reason ?? 'Liveness gagal';
          }
        } catch (err: unknown) {
          livenessError = err instanceof Error ? err.message : 'Unknown error';
        }
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      if (!livenessOk) {
        // ===== INI KUNCI: Tambahkan bypassable =====
        const error = new FaceError(`Liveness gagal setelah 3 percobaan. ${livenessError}`);
        (error as any).bypassable = true;
        console.log('[DEBUG] Throwing bypassable error:', error);
        throw error;
      }
    } else {
      livenessBypassed = true;
      onStep?.('liveness', 'Liveness dilewati (bypass operator).');
    }

    // Capture poses
    const poses: PoseKey[] = ['front', 'right', 'left'];
    const samples: Array<{ pose: PoseKey; embedding: number[]; qualityScore: number }> = [];
    let totalQuality = 0;

    for (let p = 0; p < poses.length; p++) {
      const pose = poses[p];
      let poseOk = false;
      let bestQuality = 0;
      for (let attempt = 1; attempt <= 3; attempt++) {
        onStep?.(pose, `Pose ${p + 1}/3: ${POSE_LABELS[pose]} (percobaan ${attempt}/3)...`);
        try {
          const sample = await faceEnrollmentService.captureSample(video, pose, {
            minQualityScore: parseFloat((await settingRepository.get('face.minQualityScore')) ?? '0.4')
          });
          samples.push({ pose: sample.pose as PoseKey, embedding: sample.embedding, qualityScore: sample.qualityScore });
          totalQuality += sample.qualityScore;
          bestQuality = Math.max(bestQuality, sample.qualityScore);
          poseOk = true;
          break;
        } catch {
          if (attempt < 3) {
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
      }
      if (!poseOk) {
        throw new FaceError(`Gagal capture pose "${POSE_LABELS[pose]}" setelah 3 percobaan. Coba lagi.`);
      }
    }

    const avgQuality = Math.round((totalQuality / samples.length) * 100) / 100;

    const profiles = await faceProfileRepository.replaceForStudent(student.id, [
      { embedding: samples.map((s) => s.embedding), modelVersion: MODEL_VERSION, qualityScore: avgQuality }
    ]);

    return {
      studentId: student.id,
      profiles,
      samples: samples.map((s) => ({ pose: s.pose, qualityScore: s.qualityScore })),
      avgQuality,
      livenessBypassed: livenessBypassed || false
    };
  }

  async reEnroll(
    student: Student,
    video: HTMLVideoElement,
    onProgress?: (msg: string, percent: number) => void
  ): Promise<EnrollmentResult> {
    return this.enrollStudent(student, video, ['front', 'left', 'right'], onProgress);
  }

  async loadAllEmbeddings(): Promise<Array<{ id: string; label: string; embedding: number[][]; qualityScore: number }>> {
    const students = await studentRepository.list();
    const out: Array<{ id: string; label: string; embedding: number[][]; qualityScore: number }> = [];
    for (const s of students) {
      const profiles = await faceProfileRepository.listForStudent(s.id);
      for (const p of profiles) {
        out.push({ id: p.id, label: s.name, embedding: p.embedding, qualityScore: p.qualityScore });
      }
    }
    return out;
  }

  async removeProfile(studentId: string): Promise<void> {
    await faceProfileRepository.removeAllForStudent(studentId);
  }

  async recognize(
    video: HTMLVideoElement,
    threshold: number = 0.8
  ): Promise<Awaited<ReturnType<typeof faceRecognitionService.recognize>>> {
    await this.ensureCameraAndModel(video);
    const db = await this.loadAllEmbeddings();
    return faceRecognitionService.recognize(
      video,
      db.map((d) => ({ id: d.id, label: d.label, embedding: d.embedding, qualityScore: d.qualityScore, createdAt: 0 })),
      { threshold }
    );
  }
}

export const enrollmentService = new EnrollmentService();