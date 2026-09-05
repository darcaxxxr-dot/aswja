// Test RLS policies. Akan print info sebelum/sesudah RLS aktif.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Missing .env vars');
  process.exit(1);
}

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function main(): Promise<void> {
  console.log('=== RLS Verification Test ===\n');

  // Test 1: anon (unauthenticated) access
  console.log('[test 1] anon SELECT schools:');
  const { data: anonData, error: anonErr } = await client.from('schools').select('*').limit(5);
  if (anonErr) {
    console.log(`  Result: blocked (good!) → ${anonErr.message}`);
  } else {
    console.log(`  Result: PASSED (got ${anonData?.length ?? 0} rows). If non-zero, RLS belum aktif!`);
  }

  // Test 2: anon INSERT
  console.log('\n[test 2] anon INSERT student:');
  const { error: insErr } = await client.from('students').insert({
    school_id: '00000000-0000-0000-0000-000000000001',
    nis: 'TEST-ANON',
    name: 'Test',
    gender: 'L',
    class_id: '00000000-0000-0000-0000-000000000000'
  });
  if (insErr) {
    console.log(`  Result: blocked (good!) → ${insErr.message}`);
  } else {
    console.log(`  Result: PASSED! (RLS not enforced)`);
  }

  console.log('\n=== End ===');
}

void main();
