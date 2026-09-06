import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const RUNTIME_KEY = 'sf_supabase_runtime';

interface RuntimeConfig {
  url: string;
  anonKey: string;
}

function readRuntime(): RuntimeConfig | null {
  try {
    const raw = localStorage.getItem(RUNTIME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RuntimeConfig;
    if (parsed.url && parsed.anonKey) return parsed;
    return null;
  } catch {
    return null;
  }
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  source: 'env' | 'runtime';
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const runtime = readRuntime();
  if (runtime) {
    return { url: runtime.url, anonKey: runtime.anonKey, source: 'runtime' };
  }
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  if (!url.startsWith('https://') || !url.includes('.supabase.co')) return null;
  return { url, anonKey, source: 'env' };
}

export function setSupabaseRuntimeConfig(url: string, anonKey: string): void {
  localStorage.setItem(RUNTIME_KEY, JSON.stringify({ url, anonKey }));
  cachedClient = null;
}

export function clearSupabaseRuntimeConfig(): void {
  localStorage.removeItem(RUNTIME_KEY);
  cachedClient = null;
}

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;
  const cfg = getSupabaseConfig();
  if (!cfg) return null;
  cachedClient = createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: cfg.source === 'runtime', autoRefreshToken: cfg.source === 'runtime' },
    db: { schema: 'public' }
  });
  return cachedClient;
}

export class SupabaseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'SupabaseError';
  }
}

export interface ConnectionTestResult {
  ok: boolean;
  url: string;
  latencyMs: number;
  message: string;
  counts?: Record<string, number>;
}

export async function testConnection(): Promise<ConnectionTestResult> {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    return {
      ok: false,
      url: '(not configured)',
      latencyMs: 0,
      message: 'VITE_SUPABASE_URL atau VITE_SUPABASE_ANON_KEY belum diset di .env'
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, url: cfg.url, latencyMs: 0, message: 'Client gagal diinisialisasi' };
  }

  const start = performance.now();
  try {
    const { data, error } = await client
      .from('schools')
      .select('id, name', { count: 'exact', head: false })
      .limit(5);

    const latencyMs = Math.round(performance.now() - start);
    if (error) {
      return {
        ok: false,
        url: cfg.url,
        latencyMs,
        message: `Query error: ${error.message} (code=${error.code})`
      };
    }

    return {
      ok: true,
      url: cfg.url,
      latencyMs,
      message: `Berhasil terhubung. ${data?.length ?? 0} school ditemukan.`,
      counts: { schools: data?.length ?? 0 }
    };
  } catch (err: unknown) {
    const latencyMs = Math.round(performance.now() - start);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return {
      ok: false,
      url: cfg.url,
      latencyMs,
      message: `Exception: ${msg}`
    };
  }
}

export interface CloudRow {
  id: string;
  school_id: string;
  [key: string]: unknown;
}

export async function cloudUpsert<T extends CloudRow>(
  table: string,
  rows: T[]
): Promise<{ inserted: number; errors: string[] }> {
  const client = getSupabaseClient();
  if (!client) return { inserted: 0, errors: ['Supabase client not configured'] };
  if (rows.length === 0) return { inserted: 0, errors: [] };

  const BATCH = 100;
  let inserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { data, error } = await client.from(table).upsert(batch, { onConflict: 'id' }).select('id');
    if (error) {
      errors.push(`Batch ${i}-${i + batch.length}: ${error.message}`);
    } else {
      inserted += data?.length ?? 0;
    }
  }
  return { inserted, errors };
}

export async function cloudSelect<T = CloudRow>(
  table: string,
  schoolId: string,
  sinceIso?: string
): Promise<{ data: T[]; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { data: [], error: 'Supabase client not configured' };

  // Tables that don't have a direct school_id column:
  // - 'schools' is the root entity itself
  // - 'face_profiles' links via student_id -> students.school_id
  let q;
  if (table === 'schools') {
    q = client.from(table).select('*').eq('id', schoolId);
  } else {
    q = client.from(table).select('*').eq('school_id', schoolId);
  }

  if (sinceIso) q = q.gt('updated_at', sinceIso);
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };
  return { data: (data as T[]) ?? [] };
}