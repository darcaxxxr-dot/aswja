import { getSupabaseClient, testConnection, syncService, type ConnectionTestResult, type SyncReport } from '@services/sync/index';
import { databaseService } from '@services/database/index';
import { getOrCreateSchoolId } from '@utils/device';
import { formatTime } from '@utils/device';

export async function renderSupabaseTest(root: HTMLElement): Promise<void> {
  root.innerHTML = `
    <div class="stack">
      <header>
        <h2 style="margin:0 0 4px;">Supabase Connection & Sync Test</h2>
        <p class="muted" style="margin:0;">
          Verifikasi koneksi, push data lokal ke cloud, pull dari cloud ke lokal.
        </p>
      </header>

      <section class="card stack">
        <h3 style="margin:0;">A. Koneksi</h3>
        <div class="row">
          <button class="btn btn-primary" id="btn-test">Test Koneksi</button>
        </div>
        <div id="conn-result" class="muted">Belum dites.</div>
      </section>

      <section class="card stack">
        <h3 style="margin:0;">B. Sync (IndexedDB ↔ Supabase)</h3>
        <div class="row" style="flex-wrap:wrap;gap:8px;">
          <button class="btn btn-primary" id="btn-push">Push Lokal → Cloud</button>
          <button class="btn btn-primary" id="btn-pull">Pull Cloud → Lokal</button>
          <button class="btn btn-primary" id="btn-fullsync">Full Sync (push+pull)</button>
          <button class="btn btn-ghost" id="btn-autostart">Start Auto-Sync (30s)</button>
          <button class="btn btn-ghost" id="btn-autostop">Stop Auto-Sync</button>
        </div>
        <div id="sync-status" class="muted">Belum ada sync.</div>
        <pre id="sync-out" style="background:#0f172a;color:#a7f3d0;padding:12px;border-radius:8px;margin:0;font-size:12px;max-height:300px;overflow:auto;"></pre>
      </section>

      <section class="card stack">
        <h3 style="margin:0;">C. Counts (Lokal & Cloud)</h3>
        <div class="row">
          <button class="btn btn-primary" id="btn-counts">Refresh Counts</button>
        </div>
        <pre id="counts-out" style="background:#0f172a;color:#cbd5e1;padding:12px;border-radius:8px;margin:0;font-size:12px;max-height:300px;overflow:auto;"></pre>
      </section>

      <section class="card stack">
        <h3 style="margin:0;">D. Schools (CRUD)</h3>
        <div class="row" style="flex-wrap:wrap;gap:8px;">
          <button class="btn btn-primary" id="btn-list-schools">List Schools (Cloud)</button>
          <button class="btn btn-primary" id="btn-insert-school">Upsert Default School</button>
        </div>
        <pre id="schools-out" style="background:#0f172a;color:#a7f3d0;padding:12px;border-radius:8px;margin:0;font-size:12px;max-height:200px;overflow:auto;"></pre>
      </section>

      <section class="card stack">
        <h3 style="margin:0;">Log</h3>
        <pre id="log" style="background:#0f172a;color:#cbd5e1;padding:12px;border-radius:8px;max-height:200px;overflow:auto;margin:0;font-size:12px;"></pre>
      </section>
    </div>
  `;

  const connResult = root.querySelector<HTMLDivElement>('#conn-result')!;
  const syncStatus = root.querySelector<HTMLDivElement>('#sync-status')!;
  const syncOut = root.querySelector<HTMLPreElement>('#sync-out')!;
  const countsOut = root.querySelector<HTMLPreElement>('#counts-out')!;
  const schoolsOut = root.querySelector<HTMLPreElement>('#schools-out')!;
  const logEl = root.querySelector<HTMLPreElement>('#log')!;

  const log = (msg: string) => {
    const ts = formatTime(Date.now());
    logEl.textContent = `[${ts}] ${msg}\n` + logEl.textContent;
  };

  const renderResult = (r: ConnectionTestResult) => {
    const color = r.ok ? 'var(--color-success)' : 'var(--color-danger)';
    connResult.innerHTML = `<span style="color:${color};font-weight:700;">${r.ok ? '✓ OK' : '✗ FAIL'}</span> · URL: <code>${r.url}</code> · Latency: <strong>${r.latencyMs}ms</strong><br>${r.message}`;
  };

  const renderReport = (r: SyncReport) => {
    const color = r.ok ? 'var(--color-success)' : 'var(--color-danger)';
    syncStatus.innerHTML = `<span style="color:${color};font-weight:700;">${r.ok ? '✓ OK' : '✗ FAIL'}</span> · ${r.durationMs}ms · ${new Date(r.lastSyncAt).toLocaleString('id-ID')}`;
    syncOut.textContent = JSON.stringify({ pushed: r.pushed, pulled: r.pulled, errors: r.errors }, null, 2);
  };

  const refreshStatus = async () => {
    const s = await syncService.getStatus();
    syncStatus.innerHTML = `online=<strong>${s.online ? 'yes' : 'no'}</strong> · lastSync=${s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString('id-ID') : 'never'} · pendingPush=<strong>${s.pendingPush}</strong>${s.lastError ? ' · error: ' + s.lastError : ''}`;
  };

  root.querySelector<HTMLButtonElement>('#btn-test')!.addEventListener('click', async () => {
    connResult.textContent = 'Testing...';
    const r = await testConnection();
    renderResult(r);
    log(`Connection: ${r.ok ? 'OK' : 'FAIL'} (${r.latencyMs}ms) — ${r.message}`);
  });

  root.querySelector<HTMLButtonElement>('#btn-push')!.addEventListener('click', async () => {
    try {
      log('Push dimulai...');
      const pushed = await syncService.pushAll();
      syncOut.textContent = `PUSHED:\n${JSON.stringify(pushed, null, 2)}`;
      log(`Push OK: ${JSON.stringify(pushed)}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`Push FAIL: ${msg}`);
      syncOut.textContent = `ERROR: ${msg}`;
    }
  });

  root.querySelector<HTMLButtonElement>('#btn-pull')!.addEventListener('click', async () => {
    try {
      log('Pull dimulai...');
      const pulled = await syncService.pullAll();
      syncOut.textContent = `PULLED:\n${JSON.stringify(pulled, null, 2)}`;
      log(`Pull OK: ${JSON.stringify(pulled)}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`Pull FAIL: ${msg}`);
      syncOut.textContent = `ERROR: ${msg}`;
    }
  });

  root.querySelector<HTMLButtonElement>('#btn-fullsync')!.addEventListener('click', async () => {
    log('Full sync dimulai...');
    const r = await syncService.runFullSync();
    renderReport(r);
    log(`Full sync: ${r.ok ? 'OK' : 'FAIL'} pushed=${JSON.stringify(r.pushed)} pulled=${JSON.stringify(r.pulled)}`);
  });

  root.querySelector<HTMLButtonElement>('#btn-autostart')!.addEventListener('click', async () => {
    await syncService.startAutoSync(30000);
    log('Auto-sync started (30s interval).');
    await refreshStatus();
  });

  root.querySelector<HTMLButtonElement>('#btn-autostop')!.addEventListener('click', async () => {
    syncService.stopAutoSync();
    log('Auto-sync stopped.');
    await refreshStatus();
  });

  root.querySelector<HTMLButtonElement>('#btn-list-schools')!.addEventListener('click', async () => {
    const client = getSupabaseClient();
    if (!client) return;
    const { data, error } = await client.from('schools').select('*').limit(20);
    if (error) {
      schoolsOut.textContent = `ERROR: ${error.message}`;
      return;
    }
    schoolsOut.textContent = JSON.stringify(data, null, 2);
    log(`List schools: ${data?.length ?? 0} rows`);
  });

  root.querySelector<HTMLButtonElement>('#btn-insert-school')!.addEventListener('click', async () => {
    const client = getSupabaseClient();
    if (!client) return;
    const schoolId = getOrCreateSchoolId();
    const { data, error } = await client
      .from('schools')
      .upsert({ id: schoolId, name: 'SMA Default (sync test)' }, { onConflict: 'id' })
      .select();
    if (error) {
      log(`Upsert school error: ${error.message}`);
      schoolsOut.textContent = `ERROR: ${error.message}`;
      return;
    }
    schoolsOut.textContent = JSON.stringify(data, null, 2);
    log(`Upsert school OK: id=${schoolId}`);
  });

  root.querySelector<HTMLButtonElement>('#btn-counts')!.addEventListener('click', async () => {
    const client = getSupabaseClient();
    const localCounts = await databaseService.counts();
    const cloudCounts: Record<string, number | string> = {};
    const TABLES = ['schools', 'academic_years', 'classes', 'students', 'face_profiles', 'attendance_sessions', 'attendance_records'] as const;
    for (const t of TABLES) {
      if (!client) {
        cloudCounts[t] = 'no-client';
        continue;
      }
      const { count, error } = await client.from(t).select('*', { count: 'exact', head: true });
      cloudCounts[t] = error ? `ERR: ${error.message}` : (count ?? 0);
    }
    const out: string[] = ['TABLE                  LOCAL   CLOUD'];
    const map: Record<string, string> = {
      schools: 'schools',
      academicYears: 'academic_years',
      classes: 'classes',
      students: 'students',
      faceProfiles: 'face_profiles',
      attendanceSessions: 'attendance_sessions',
      attendanceRecords: 'attendance_records'
    };
    for (const [localKey, cloudKey] of Object.entries(map)) {
      out.push(`${localKey.padEnd(22)} ${String(localCounts[localKey] ?? 0).padStart(5)}   ${String(cloudCounts[cloudKey] ?? '?')}`);
    }
    countsOut.textContent = out.join('\n');
    log('Counts refreshed.');
  });

  syncService.onStatusChange(() => void refreshStatus());
  await refreshStatus();
  log('Halaman Supabase test siap.');
  log(`Local schoolId: ${getOrCreateSchoolId()}`);
  log(`Supabase URL env: ${import.meta.env.VITE_SUPABASE_URL ?? '(tidak diset)'}`);
}