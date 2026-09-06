import { db } from '@services/database/dexieSchema';
import { generateId, now, getOrCreateSchoolId } from '@utils/device';
import { syncService } from '@services/sync/syncService';
import type { ClassRoom } from '@models/types';

/** Fire-and-forget push to Supabase after local write */
function pushAsync(): void {
  void syncService.pushAll().catch(() => undefined);
}

export interface CreateClassInput {
  name: string;
  grade: string;
  academicYearId: string;
}

export class ClassRepository {
  async list(): Promise<ClassRoom[]> {
    return db.classes.orderBy('createdAt').reverse().toArray();
  }

  async listByAcademicYear(academicYearId: string): Promise<ClassRoom[]> {
    return db.classes.where('academicYearId').equals(academicYearId).toArray();
  }

  async getById(id: string): Promise<ClassRoom | undefined> {
    return db.classes.get(id);
  }

  async findByGradeAndName(grade: string, name: string): Promise<ClassRoom | undefined> {
    return db.classes.where('grade').equals(grade).and((c) => c.name === name).first();
  }

  async create(input: CreateClassInput): Promise<ClassRoom> {
    const existing = await this.findByGradeAndName(input.grade.trim(), input.name.trim());
    if (existing) {
      throw new Error(`Kelas "${input.name}" sudah ada di tingkat ${input.grade}`);
    }
    const ts = now();
    const row: ClassRoom = {
      id: generateId('CLS'),
      schoolId: getOrCreateSchoolId(),
      name: input.name.trim(),
      grade: input.grade.trim(),
      academicYearId: input.academicYearId,
      createdAt: ts,
      updatedAt: ts
    };
    await db.classes.add(row);
    pushAsync();
    return row;
  }

  async update(id: string, patch: Partial<Omit<ClassRoom, 'id' | 'schoolId' | 'createdAt'>>): Promise<ClassRoom> {
    const existing = await db.classes.get(id);
    if (!existing) throw new Error(`Class ${id} not found`);
    const grade = patch.grade ?? existing.grade;
    const name = patch.name ?? existing.name;
    const duplicate = await db.classes.where('grade').equals(grade).and((c) => c.name === name && c.id !== id).first();
    if (duplicate) {
      throw new Error(`Kelas "${name}" sudah ada di tingkat ${grade}`);
    }
    const updated: ClassRoom = { ...existing, ...patch, updatedAt: now() };
    await db.classes.put(updated);
    pushAsync();
    return updated;
  }

  async remove(id: string): Promise<void> {
    const hasStudents = await db.students.where('classId').equals(id).count();
    if (hasStudents > 0) {
      throw new Error('Kelas masih memiliki siswa. Hapus siswa terlebih dahulu.');
    }
    await db.classes.delete(id);
    pushAsync();
  }
}

export const classRepository = new ClassRepository();