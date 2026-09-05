import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { getSupabaseClient } from '@services/sync/supabaseClient';

export type AppRole = 'SUPERUSER' | 'USER' | 'OPERATOR';

export type UserSubRole = 'KEPALA_MADRASAH' | 'WAKAMAD_KEASRAMAAN' | 'GURU_BINA_ASRAMA' | null;

export const ROLE_LABELS: Record<AppRole, string> = {
  SUPERUSER: 'Superuser',
  USER: 'User',
  OPERATOR: 'Operator'
};

export const SUBROLE_LABELS: Record<Exclude<UserSubRole, null>, string> = {
  KEPALA_MADRASAH: 'Kepala Madrasah',
  WAKAMAD_KEASRAMAAN: 'Wakamad Keasramaan',
  GURU_BINA_ASRAMA: 'Guru Bina Asrama'
};

export const ROLE_RANK: Record<AppRole, number> = {
  SUPERUSER: 3,
  USER: 2,
  OPERATOR: 1
};

export interface AppUser {
  id: string;
  email: string | null;
  role: AppRole;
  subRole: UserSubRole;
  schoolId: string | null;
  displayName: string;
  createdAt: number;
}

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 30 * 1000;
const IDLE_KEY = 'auth.lastActivity';
const LOGOUT_REASON_KEY = 'auth.logoutReason';

export class AuthError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AuthError';
  }
}

class AuthService {
  private currentSession: Session | null = null;
  private currentUser: AppUser | null = null;
  private listeners: Array<(user: AppUser | null) => void> = [];
  private idleTimer: number | null = null;
  private booted = false;

  init(): void {
    if (this.booted) return;
    this.booted = true;

    if (typeof window === 'undefined') return;

    const client = getSupabaseClient();
    if (!client) {
      console.warn('[auth] Supabase client not configured, auth disabled.');
      return;
    }

    this.touchActivity();
    this.startIdleCheck();

    void client.auth.getSession().then(async ({ data }) => {
      this.currentSession = data.session;
      this.currentUser = data.session ? mapToAppUser(data.session.user) : null;
      await this.emit();
    }).catch(() => undefined);

    client.auth.onAuthStateChange((_event, session) => {
      this.currentSession = session;
      this.currentUser = session ? mapToAppUser(session.user) : null;
      if (session) this.touchActivity();
      void this.emit();
    });

    ['click', 'keydown', 'touchstart', 'mousemove'].forEach((ev) => {
      window.addEventListener(ev, () => this.touchActivity(), { passive: true });
    });
  }

  private touchActivity(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(IDLE_KEY, String(Date.now()));
  }

  private startIdleCheck(): void {
    if (this.idleTimer !== null) return;
    this.idleTimer = window.setInterval(() => this.checkIdle(), IDLE_CHECK_INTERVAL_MS);
  }

  private async checkIdle(): Promise<void> {
    if (!this.currentSession) return;
    const last = parseInt(localStorage.getItem(IDLE_KEY) ?? '0', 10);
    if (!last) return;
    const idle = Date.now() - last;
    if (idle >= IDLE_TIMEOUT_MS) {
      console.info(`[auth] session idle for ${Math.round(idle / 1000)}s, logging out.`);
      localStorage.setItem(LOGOUT_REASON_KEY, 'idle');
      await this.signOut();
    }
  }

  getIdleTimeoutMs(): number {
    return IDLE_TIMEOUT_MS;
  }

  getLastActivity(): number {
    return parseInt(localStorage.getItem(IDLE_KEY) ?? '0', 10);
  }

  getIdleRemainingMs(): number {
    if (!this.currentSession) return 0;
    const last = this.getLastActivity();
    if (!last) return 0;
    return Math.max(0, IDLE_TIMEOUT_MS - (Date.now() - last));
  }

  consumeLogoutReason(): string | null {
    const r = localStorage.getItem(LOGOUT_REASON_KEY);
    if (r) localStorage.removeItem(LOGOUT_REASON_KEY);
    return r;
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
    return this.currentUser;
  }

  async signIn(email: string, password: string): Promise<AppUser> {
    const client = getSupabaseClient();
    if (!client) throw new AuthError('Supabase tidak dikonfigurasi. Cek Settings.');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new AuthError(error.message, error);
    if (!data.session) throw new AuthError('Login berhasil tetapi session kosong.');
    this.currentSession = data.session;
    this.currentUser = mapToAppUser(data.session.user);
    this.touchActivity();
    await this.emit();
    return this.currentUser;
  }

  async signOut(): Promise<void> {
    const client = getSupabaseClient();
    if (client) {
      await client.auth.signOut().catch(() => undefined);
    }
    this.currentSession = null;
    this.currentUser = null;
    await this.emit();
  }

  async createSuperuser(email: string, password: string, displayName: string, subRole: UserSubRole): Promise<AppUser> {
    const client = getSupabaseClient();
    if (!client) throw new AuthError('Supabase tidak dikonfigurasi.');
    if (password.length < 6) throw new AuthError('Password minimal 6 karakter.');
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          role: 'SUPERUSER',
          sub_role: subRole ?? 'KEPALA_MADRASAH'
        }
      }
    });
    if (error) throw new AuthError(error.message, error);
    if (!data.user) throw new AuthError('Sign up gagal.');
    this.currentSession = data.session;
    this.currentUser = data.session ? mapToAppUser(data.session.user) : null;
    await this.emit();
    return this.currentUser ?? {
      id: data.user.id,
      email,
      role: 'SUPERUSER',
      subRole: subRole ?? 'KEPALA_MADRASAH',
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
    const u = this.currentUser;
    for (const l of this.listeners) l(u);
  }
}

function mapToAppUser(u: SupabaseUser): AppUser {
  const meta = u.user_metadata ?? {};
  const role = (meta.role as AppRole) ?? 'OPERATOR';
  const subRole = (meta.sub_role as UserSubRole) ?? null;
  const schoolId = (meta.school_id as string | undefined) ?? null;
  const displayName = (meta.display_name as string | undefined) ?? (u.email ?? 'User');
  return {
    id: u.id,
    email: u.email ?? null,
    role,
    subRole,
    schoolId,
    displayName,
    createdAt: Date.now()
  };
}

export const authService = new AuthService();

export function hasRoleAtLeast(user: AppUser | null, required: AppRole): boolean {
  if (!user) return false;
  return ROLE_RANK[user.role] >= ROLE_RANK[required];
}

export function canAccess(action: AuthAction, user: AppUser | null): boolean {
  if (!user) return false;
  if (user.role === 'SUPERUSER') return true;
  switch (action) {
    case 'manage-students':
    case 'face-enrollment':
    case 'attendance':
    case 'backup':
      return hasRoleAtLeast(user, 'USER');
    case 'view-reports':
    case 'view-dashboard':
      return hasRoleAtLeast(user, 'OPERATOR');
    case 'delete-db':
    case 'settings':
    case 'manage-users':
      return (user.role as string) === 'SUPERUSER';
    default:
      return false;
  }
}

export type AuthAction =
  | 'manage-students'
  | 'face-enrollment'
  | 'attendance'
  | 'delete-db'
  | 'backup'
  | 'settings'
  | 'manage-users'
  | 'view-reports'
  | 'view-dashboard';