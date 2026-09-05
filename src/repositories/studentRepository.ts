import { db } from '@services/database/dexieSchema';
import { generateId, now, getOrCreateSchoolId } from '@utils/device';
import type { Gender, Student, StudentStatus } from '@models/types';

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
    return db.students.orderBy('createdAt').reverse().toArray();
  }

  async listByClass(classId: string): Promise<Student[]> {
    return db.students.where('classId').equals(classId).toArray();
  }

  async getById(id: string): Promise<Student | undefined> {
    return db.students.get(id);
  }

  async getByNis(nis: string): Promise<Student | undefined> {
    return db.students.where('nis').equals(nis).first();
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
    return row;
  }

  async update(
    id: string,
    patch: Partial<Omit<Student, 'id' | 'schoolId' | 'createdAt'>>
  ): Promise<Student> {
    const existing = await db.students.get(id);
    if (!existing) throw new Error(`Student ${id} not found`);
    const updated: Student = { ...existing, ...patch, updatedAt: now() };
    await db.students.put(updated);
    return updated;
  }

  async remove(id: string): Promise<void> {
    await db.transaction('rw', [db.students, db.faceProfiles], async () => {
      await db.faceProfiles.where('studentId').equals(id).delete();
      await db.students.delete(id);
    });
  }
}

export const studentRepository = new StudentRepository();