import { db } from '@services/database/dexieSchema';
import { generateId, now, getOrCreateSchoolId } from '@utils/device';
import { syncService } from '@services/sync/syncService';
import type { Gender, Student, StudentStatus } from '@models/types';

/** Fire-and-forget push to Supabase after local write */
function pushAsync(): void {
  void syncService.pushAll().catch(() => undefined);
}

export interface CreateStudentInput {
  nis: string;
  nisn?: string;
  name: string;
  gender: Gender;
  classId: string;
  status?: StudentStatus;
}

export class StudentRepository {
  async list(): Promise<Student[]> {
    return db.students
      .filter((s) => !s.deletedAt)
      .toArray()
      .then((arr) => arr.sort((a, b) => b.createdAt - a.createdAt));
  }

  async listByClass(classId: string): Promise<Student[]> {
    return db.students
      .where('classId').equals(classId)
      .filter((s) => !s.deletedAt)
      .toArray();
  }

  async getById(id: string): Promise<Student | undefined> {
    const s = await db.students.get(id);
    return s && !s.deletedAt ? s : undefined;
  }

  async getByNis(nis: string): Promise<Student | undefined> {
    const s = await db.students.where('nis').equals(nis).first();
    return s && !s.deletedAt ? s : undefined;
  }

  async create(input: CreateStudentInput): Promise<Student> {
    const ts = now();
    const row: Student = {
      id: generateId('STU'),
      schoolId: getOrCreateSchoolId(),
      nis: input.nis.trim(),
      nisn: input.nisn?.trim(),
      name: input.name.trim(),
      gender: input.gender,
      classId: input.classId,
      status: input.status ?? 'active',
      createdAt: ts,
      updatedAt: ts
    };
    await db.students.add(row);
    pushAsync();
    return row;
  }

  async update(
    id: string,
    patch: Partial<Omit<Student, 'id' | 'schoolId' | 'createdAt'>>
  ): Promise<Student> {
    const existing = await db.students.get(id);
    if (!existing || existing.deletedAt) throw new Error(`Student ${id} not found`);
    const updated: Student = { ...existing, ...patch, updatedAt: now() };
    await db.students.put(updated);
    pushAsync();
    return updated;
  }

  /**
   * Soft-delete: set deletedAt = now() instead of removing the row.
   * The row stays in IndexedDB and will be synced to other devices.
   * Other devices will then apply the soft-delete (their `list()` will skip it).
   */
  async remove(id: string): Promise<void> {
    await db.transaction('rw', [db.students, db.faceProfiles], async () => {
      const ts = now();
      // Soft-delete the student
      await db.students.update(id, { deletedAt: ts, updatedAt: ts });
      // Also soft-delete their face profiles (cascade)
      const profiles = await db.faceProfiles.where('studentId').equals(id).toArray();
      for (const p of profiles) {
        await db.faceProfiles.update(p.id, { deletedAt: ts });
      }
    });
    pushAsync();
  }
}

export const studentRepository = new StudentRepository();