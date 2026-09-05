import { cameraService } from '@services/camera';
import { faceEnrollmentService, faceRecognitionService, faceModelLoader, type EnrollmentPose } from '@services/face';
import { studentRepository, faceProfileRepository } from '@repositories/index';
import { settingRepository } from '@repositories/index';
import type { FaceProfile, Student } from '@models/types';
import { FaceError } from '@services/face';

const MODEL_VERSION = 'face-api-tiny-v1';

export interface EnrollmentContext {
  student: Student;
  video: HTMLVideoElement;
}

export interface EnrollmentResult {
  studentId: string;
  profiles: FaceProfile[];
  samples: Array<{ pose: EnrollmentPose; qualityScore: number }>;
  avgQuality: number;
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

  async reEnroll(
    student: Student,
    video: HTMLVideoElement,
    onProgress?: (msg: string, percent: number) => void
  ): Promise<EnrollmentResult> {
    return this.enrollStudent(student, video, ['front', 'left', 'right'], onProgress);
  }

  async loadAllEmbeddings(): Promise<Array<{ id: string; label: string; embedding: number[]; qualityScore: number }>> {
    const students = await studentRepository.list();
    const out: Array<{ id: string; label: string; embedding: number[]; qualityScore: number }> = [];
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