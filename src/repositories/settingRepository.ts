import { db } from '@services/database/dexieSchema';
import { now } from '@utils/device';
import type { Setting, User, UserRole } from '@models/types';

export class SettingRepository {
  async get(key: string): Promise<string | undefined> {
    const row = await db.settings.get(key);
    return row?.value;
  }

  async set(key: string, value: string): Promise<Setting> {
    const row: Setting = { key, value, updatedAt: now() };
    await db.settings.put(row);
    return row;
  }

  async all(): Promise<Setting[]> {
    return db.settings.toArray();
  }
}

export const settingRepository = new SettingRepository();

export interface CreateUserInput {
  name: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  schoolId: string;
}

export class UserRepository {
  async list(): Promise<User[]> {
    return db.users.toArray();
  }

  async findByUsername(username: string): Promise<User | undefined> {
    return db.users.where('username').equals(username).first();
  }

  async create(input: CreateUserInput): Promise<User> {
    const ts = now();
    const row: User = {
      id: crypto.randomUUID(),
      schoolId: input.schoolId,
      name: input.name,
      username: input.username,
      passwordHash: input.passwordHash,
      role: input.role,
      createdAt: ts,
      updatedAt: ts
    };
    await db.users.add(row);
    return row;
  }

  async remove(id: string): Promise<void> {
    await db.users.delete(id);
  }
}

export const userRepository = new UserRepository();