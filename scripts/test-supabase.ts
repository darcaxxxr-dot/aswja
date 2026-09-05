// One-off connection test to verify Supabase is reachable and the schema exists.
// Uses VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env via dotenv.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('ERROR: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY belum diset di .env');
  process.exit(1);
}

console.log(`[test] URL: ${url}`);
console.log(`[test] Key prefix: ${key.slice(0, 30)}...`);

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const TABLES = [
  'schools',
  'academic_years',
  'classes',
  'students',
  'face_profiles',
  'attendance_sessions',
  'attendance_records',
  'settings',
  'sync_logs'
] as const;

async function main(): Promise<void> {
  const start = performance.now();
  const summary: Record<string, { count: number; error?: string }> = {};

  for (const t of TABLES) {
    const { count, error } = await client.from(t).select('*', { count: 'exact', head: true });
    if (error) {
      summary[t] = { count: -1, error: `${error.code ?? '?'}: ${error.message}` };
      console.log(`[${t}] ERROR: ${error.message}`);
    } else {
      summary[t] = { count: count ?? 0 };
      console.log(`[${t}] OK: ${count ?? 0} rows`);
    }
  }

  const { data: sampleSchool, error: schoolErr } = await client
    .from('schools')
    .select('*')
    .limit(1);

  const elapsed = Math.round(performance.now() - start);
  console.log(`\n[test] Latency total: ${elapsed}ms`);
  console.log(`[test] Sample school row: ${sampleSchool ? JSON.stringify(sampleSchool) : '(none)'}`);
  if (schoolErr) console.log(`[test] School query error: ${schoolErr.message}`);

  const hasErrors = Object.values(summary).some((s) => s.error);
  if (hasErrors) {
    console.log('\n[result] SOME TABLES HAVE ERRORS — likely missing schema. Run the SQL in Supabase SQL Editor.');
    process.exit(2);
  }
  console.log('\n[result] PASS — semua tabel dapat diakses.');
}

void main();
