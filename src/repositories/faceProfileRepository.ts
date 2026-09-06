import { db } from '@services/database/dexieSchema';
import { generateId, now } from '@utils/device';
import { syncService } from '@services/sync/syncService';
import type { FaceProfile } from '@models/types';

/** Fire-and-forget push to Supabase after local write */
function pushAsync(): void {
  void syncService.pushAll().catch(() => undefined);
}

export interface CreateFaceProfileInput {
  studentId: string;
  embedding: number[][];
  modelVersion: string;
  qualityScore: number;
}

export class FaceProfileRepository {
  async listForStudent(studentId: string): Promise<FaceProfile[]> {
    return db.faceProfiles.where('studentId').equals(studentId).toArray();
  }

  async getById(id: string): Promise<FaceProfile | undefined> {
    return db.faceProfiles.get(id);
  }

  async getPrimaryForStudent(studentId: string): Promise<FaceProfile | undefined> {
    return db.faceProfiles
      .where('studentId')
      .equals(studentId)
      .reverse()
      .sortBy('createdAt')
      .then((arr) => arr[0]);
  }

  async create(input: CreateFaceProfileInput): Promise<FaceProfile> {
    const ts = now();
    const row: FaceProfile = {
      id: generateId('FP'),
      studentId: input.studentId,
      embedding: input.embedding,
      modelVersion: input.modelVersion,
      qualityScore: input.qualityScore,
      createdAt: ts,
      updatedAt: ts
    };
    await db.faceProfiles.add(row);
    pushAsync();
    return row;
  }

  async replaceForStudent(
    studentId: string,
    profiles: Array<Omit<CreateFaceProfileInput, 'studentId'>>
  ): Promise<FaceProfile[]> {
    const ts = now();
    const rows: FaceProfile[] = profiles.map((p) => ({
      id: generateId('FP'),
      studentId,
      embedding: p.embedding,
      modelVersion: p.modelVersion,
      qualityScore: p.qualityScore,
      createdAt: ts,
      updatedAt: ts
    }));
    await db.transaction('rw', db.faceProfiles, async () => {
      await db.faceProfiles.where('studentId').equals(studentId).delete();
      await db.faceProfiles.bulkAdd(rows);
    });
    pushAsync();
    return rows;
  }

  async remove(id: string): Promise<void> {
    await db.faceProfiles.delete(id);
    pushAsync();
  }

  async removeAllForStudent(studentId: string): Promise<void> {
    await db.faceProfiles.where('studentId').equals(studentId).delete();
    pushAsync();
  }

  async countAll(): Promise<number> {
    return db.faceProfiles.count();
  }
}

export const faceProfileRepository = new FaceProfileRepository();