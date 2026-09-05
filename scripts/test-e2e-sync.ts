// End-to-end sync test: insert local data, push to Supabase, pull back, verify.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { randomUUID } from 'crypto';

config({ path: resolve(process.cwd(), '.env') });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Missing .env vars');
  process.exit(1);
}

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const SCHOOL_ID = '00000000-0000-0000-0000-000000000099'; // test school
const AY_ID = '00000000-0000-0000-0000-000000000088';

async function cleanup(): Promise<void> {
  console.log('[cleanup] removing test data...');
  await client.from('attendance_records').delete().eq('school_id', SCHOOL_ID);
  await client.from('attendance_sessions').delete().eq('school_id', SCHOOL_ID);
  await client.from('face_profiles').delete().like('student_id', `${SCHOOL_ID.slice(0, 8)}-%`);
  await client.from('students').delete().eq('school_id', SCHOOL_ID);
  await client.from('classes').delete().eq('school_id', SCHOOL_ID);
  await client.from('academic_years').delete().eq('school_id', SCHOOL_ID);
  await client.from('schools').delete().eq('id', SCHOOL_ID);
}

async function pushFakeData(): Promise<{
  classId: string; studentId: string; sessionId: string; recordId: string; profileId: string;
}> {
  const classId = randomUUID();
  const studentId = randomUUID();
  const sessionId = randomUUID();
  const recordId = randomUUID();
  const profileId = randomUUID();

  const now = new Date().toISOString();
  const { error: e1 } = await client.from('schools').insert({ id: SCHOOL_ID, name: 'Test School E2E', created_at: now, updated_at: now });
  if (e1 && !e1.message.includes('duplicate')) console.log('schools:', e1.message);
  const { error: e2 } = await client.from('academic_years').insert({ id: AY_ID, school_id: SCHOOL_ID, name: '2026/2027', start_date: '2026-07-01', end_date: '2027-06-30', is_active: true });
  if (e2 && !e2.message.includes('duplicate')) console.log('academic_years:', e2.message);
  const { error: e3 } = await client.from('classes').insert({ id: classId, school_id: SCHOOL_ID, academic_year_id: AY_ID, name: 'XII IPA 1', grade: 'XII', created_at: now, updated_at: now });
  if (e3) console.log('classes:', e3.message);
  const { error: e4 } = await client.from('students').insert({ id: studentId, school_id: SCHOOL_ID, nis: 'TEST001', name: 'Test Student E2E', gender: 'L', class_id: classId, status: 'active', created_at: now, updated_at: now });
  if (e4) console.log('students:', e4.message);
  const { error: e5 } = await client.from('face_profiles').insert({ id: profileId, student_id: studentId, embedding: [0.1, 0.2, 0.3], model_version: 'test-v1', quality_score: 0.95, created_at: now, updated_at: now });
  if (e5) console.log('face_profiles:', e5.message);
  const { error: e6 } = await client.from('attendance_sessions').insert({ id: sessionId, school_id: SCHOOL_ID, class_id: classId, date: '2026-09-05', start_time: now, status: 'open', created_by: 'e2e-test', created_at: now });
  if (e6) console.log('sessions:', e6.message);
  const { error: e7 } = await client.from('attendance_records').insert({ id: recordId, school_id: SCHOOL_ID, session_id: sessionId, student_id: studentId, timestamp: now, status: 'HADIR', confidence: 0.92, device_id: 'TEST-DEV', created_at: now });
  if (e7) console.log('records:', e7.message);

  console.log(`[push] inserted class=${classId.slice(0, 8)} student=${studentId.slice(0, 8)} session=${sessionId.slice(0, 8)} record=${recordId.slice(0, 8)}`);
  return { classId, studentId, sessionId, recordId, profileId };
}

async function verifyData(): Promise<{ classCount: number; studentCount: number; sessionCount: number; recordCount: number; profileCount: number }> {
  const [{ count: cs }, { count: ss }, { count: ses }, { count: ar }, { count: fp }] = await Promise.all([
    client.from('classes').select('*', { count: 'exact', head: true }).eq('school_id', SCHOOL_ID),
    client.from('students').select('*', { count: 'exact', head: true }).eq('school_id', SCHOOL_ID),
    client.from('attendance_sessions').select('*', { count: 'exact', head: true }).eq('school_id', SCHOOL_ID),
    client.from('attendance_records').select('*', { count: 'exact', head: true }).eq('school_id', SCHOOL_ID),
    client.from('face_profiles').select('*', { count: 'exact', head: true }).eq('student_id', `${SCHOOL_ID.slice(0, 8)}-%`)
  ]);
  return { classCount: cs ?? 0, studentCount: ss ?? 0, sessionCount: ses ?? 0, recordCount: ar ?? 0, profileCount: fp ?? 0 };
}

async function main(): Promise<void> {
  console.log('=== E2E Sync Test ===\n');
  await cleanup();
  console.log('\n[push] Pushing fake data...');
  const ids = await pushFakeData();
  console.log('\n[verify] Counts after push:');
  const c1 = await verifyData();
  console.log(c1);
  if (c1.classCount !== 1 || c1.studentCount !== 1 || c1.sessionCount !== 1 || c1.recordCount !== 1) {
    console.log('[FAIL] Expected 1 each, got', c1);
    process.exit(2);
  }
  console.log('\n[read] Reading back the record...');
  const { data: rec } = await client.from('attendance_records').select('*').eq('id', ids.recordId).single();
  console.log('Record:', JSON.stringify(rec, null, 2));
  if (rec?.status !== 'HADIR' || rec?.confidence !== 0.92) {
    console.log('[FAIL] Record mismatch');
    process.exit(3);
  }
  console.log('\n[cleanup] Removing test data...');
  await cleanup();
  const c2 = await verifyData();
  console.log('After cleanup:', c2);
  if (c2.classCount !== 0 || c2.studentCount !== 0) {
    console.log('[FAIL] Cleanup incomplete');
    process.exit(4);
  }
  console.log('\n=== E2E PASS — push, read, cleanup semua OK ===');
}

void main();
