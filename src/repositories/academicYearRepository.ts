import { db } from '@services/database/dexieSchema';
import { now, getOrCreateSchoolId } from '@utils/device';
import type { AcademicYear } from '@models/types';

export interface CreateAcademicYearInput {
  name: string;
  startDate: string;
  endDate: string;
  isActive?: boolean;
}

export class AcademicYearRepository {
  async list(): Promise<AcademicYear[]> {
    return db.academicYears.orderBy('name').toArray();
  }

  async getById(id: string): Promise<AcademicYear | undefined> {
    return db.academicYears.get(id);
  }

  async getActive(): Promise<AcademicYear | undefined> {
    return db.academicYears.where('isActive').equals(1).first();
  }

  async create(input: CreateAcademicYearInput): Promise<AcademicYear> {
    const ts = now();
    const row: AcademicYear = {
      id: crypto.randomUUID(),
      schoolId: getOrCreateSchoolId(),
      name: input.name.trim(),
      startDate: input.startDate.trim(),
      endDate: input.endDate.trim(),
      isActive: input.isActive ?? false,
      createdAt: ts,
      updatedAt: ts
    };
    await db.academicYears.add(row);
    return row;
  }

  async update(id: string, patch: Partial<Omit<AcademicYear, 'id' | 'schoolId' | 'createdAt'>>): Promise<AcademicYear> {
    const existing = await db.academicYears.get(id);
    if (!existing) throw new Error(`AcademicYear ${id} not found`);
    const updated: AcademicYear = { ...existing, ...patch, updatedAt: now() };
    await db.academicYears.put(updated);
    return updated;
  }

  async remove(id: string): Promise<void> {
    await db.academicYears.delete(id);
  }
}

export const academicYearRepository = new AcademicYearRepository();
