import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { getSupabaseClient } from '@services/sync/supabaseClient';

export type AppRole = 'ADMIN' | 'TEACHER';

export interface AppUser {
  id: string;
  email: string | null;
  role: AppRole;
  schoolId: string | null;
  displayName: string;
  createdAt: number;
}

const SESSION_CACHE_KEY = 'auth.session';
void SESSION_CACHE_KEY;

export class AuthError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AuthError';
  }
}

class AuthService {
  private currentSession: Session | null = null;
  private listeners: Array<(user: AppUser | null) => void> = [];
  private booted = false;

  init(): void {
    if (this.booted) return;
    this.booted = true;
    const client = getSupabaseClient();
    if (!client) {
      console.warn('[auth] Supabase client not configured, auth disabled.');
      return;
    }
    client.auth.getSession().then(({ data }) => {
      this.currentSession = data.session;
      void this.emit();
    }).catch(() => undefined);
    client.auth.onAuthStateChange((_event, session) => {
      this.currentSession = session;
      void this.emit();
    });
  }

  isEnabled(): boolean {
    return getSupabaseClient() !== null;
  }

  isAuthenticated(): boolean {
    return this.currentSession !== null;
  }

  getSession(): Session | null {
    return this.currentSession;
  }

  async getCurrentUser(): Promise<AppUser | null> {
    if (!this.currentSession) return null;
    const u = this.currentSession.user;
    return mapToAppUser(u, this.currentSession);
  }

  async signIn(email: string, password: string): Promise<AppUser> {
    const client = getSupabaseClient();
    if (!client) throw new AuthError('Supabase tidak dikonfigurasi. Cek Settings.');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new AuthError(error.message, error);
    if (!data.session) throw new AuthError('Login berhasil tetapi session kosong.');
    this.currentSession = data.session;
    const appUser = await this.getCurrentUser();
    if (!appUser) throw new AuthError('User tidak ditemukan setelah login.');
    await this.emit();
    return appUser;
  }

  async signOut(): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;
    await client.auth.signOut();
    this.currentSession = null;
    await this.emit();
  }

  async signUp(email: string, password: string, role: AppRole, displayName: string): Promise<AppUser> {
    const client = getSupabaseClient();
    if (!client) throw new AuthError('Supabase tidak dikonfigurasi.');
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw new AuthError(error.message, error);
    if (!data.user) throw new AuthError('Sign up gagal.');
    this.currentSession = data.session;
    await this.emit();
    return {
      id: data.user.id,
      email,
      role,
      schoolId: null,
      displayName,
      createdAt: Date.now()
    };
  }

  onAuthStateChange(listener: (user: AppUser | null) => void): () => void {
    this.listeners.push(listener);
    void this.getCurrentUser().then((u) => listener(u));
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private async emit(): Promise<void> {
    const u = await this.getCurrentUser();
    for (const l of this.listeners) l(u);
  }
}

function mapToAppUser(u: SupabaseUser, _session: Session): AppUser {
  const meta = u.user_metadata ?? {};
  const role = (meta.role as AppRole) ?? 'TEACHER';
  const schoolId = (meta.school_id as string | undefined) ?? null;
  const displayName = (meta.display_name as string | undefined) ?? (u.email ?? 'User');
  return {
    id: u.id,
    email: u.email ?? null,
    role,
    schoolId,
    displayName,
    createdAt: Date.now()
  };
}

export const authService = new AuthService();

export function canAccess(action: 'manage-students' | 'face-enrollment' | 'attendance' | 'delete-db' | 'backup' | 'settings', role: AppRole | null): boolean {
  if (!role) return false;
  switch (action) {
    case 'manage-students':
      return role === 'ADMIN' || role === 'TEACHER';
    case 'face-enrollment':
      return role === 'ADMIN' || role === 'TEACHER';
    case 'attendance':
      return role === 'ADMIN' || role === 'TEACHER';
    case 'delete-db':
      return role === 'ADMIN';
    case 'backup':
      return role === 'ADMIN' || role === 'TEACHER';
    case 'settings':
      return role === 'ADMIN';
    default:
      return false;
  }
}