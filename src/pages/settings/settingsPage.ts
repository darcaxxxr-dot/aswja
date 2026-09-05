import { ROUTES } from '@config/app';
import { settingsService, type AppSettings } from '@services/settings/index';
import { syncService, setSupabaseRuntimeConfig, clearSupabaseRuntimeConfig } from '@services/sync/index';
import { authService, type AppUser } from '@services/auth/index';
import { databaseService } from '@services/database/index';
import { formatTime, setSchoolIdOverride, clearSchoolIdOverride, isValidUuid } from '@utils/device';

const SECTIONS: Array<{ key: keyof AppSettings; label: string; desc: string }> = [
  { key: 'schoolName', label: 'Nama Sekolah', desc: 'Ditampilkan di header & laporan.' },
  { key: 'attendance', label: 'Aturan Absensi', desc: 'Window HADIR / TERLAMBAT + liveness.' },
  { key: 'face', label: 'Pengenalan Wajah', desc: 'Threshold & model version.' },
  { key: 'sync', label: 'Sinkronisasi', desc: 'Auto-sync ke Supabase.' },
  { key: 'supabase', label: 'Supabase Connection', desc: 'Status koneksi (read-only).' }
];

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}

export async function renderSettings(root: HTMLElement): Promise<void> {
  let currentUser: AppUser | null = null;

  const render = (s: AppSettings) => {
    const isAdmin = currentUser?.role === 'SUPERUSER' || !authService.isEnabled();
    if (!isAdmin) {
      pageRoot.innerHTML = `
        <div class="card stack">
          <h2 style="margin:0;">Akses Ditolak</h2>
          <p class="muted">Hanya role <strong>SUPERUSER</strong> yang dapat mengubah pengaturan. Login Anda saat ini: <strong>${currentUser?.role ?? '—'}</strong>.</p>
          <a href="${ROUTES.dashboard}" data-link class="btn btn-primary">Kembali ke Dashboard</a>
        </div>`;
      return;
    }
    pageRoot.innerHTML = `
      <div class="stack">
        <header>
          <h2 style="margin:0 0 4px;">Pengaturan</h2>
          <p class="muted" style="margin:0;">Konfigurasi sekolah, absensi, face AI, sync, dan Supabase.</p>
        </header>

        <nav class="row" style="flex-wrap:wrap;gap:6px;">
          ${SECTIONS.map((s) => `<a href="#${s.key}" data-link class="btn btn-ghost" style="padding:6px 10px;min-height:32px;font-size:13px;">${s.label}</a>`).join('')}
        </nav>

        <section class="card stack" id="section-schoolName">
          <h3 style="margin:0;">Nama Sekolah</h3>
          <p class="muted" style="margin:0;font-size:13px;">${SECTIONS[0].desc}</p>
          <div class="row" style="flex-wrap:wrap;gap:8px;">
            <input id="school-name" type="text" value="${escapeHtml(s.schoolName)}" style="flex:1;min-width:240px;padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
            <button class="btn btn-primary" id="btn-save-school">Simpan</button>
          </div>
          <div class="muted" style="font-size:12px;">School ID: <code id="school-id">${escapeHtml(s.schoolId)}</code> <button class="btn btn-ghost" id="btn-copy-school" style="padding:2px 8px;min-height:24px;font-size:11px;margin-left:4px;">Copy</button></div>
          <div class="row" style="flex-wrap:wrap;gap:8px;">
            <input id="override-school" type="text" placeholder="Override School ID (UUID, untuk sync ke sekolah lain)" value="${escapeHtml(s.schoolId)}" style="flex:1;min-width:280px;padding:8px;border:1px solid var(--color-border);border-radius:8px;font-family:monospace;font-size:12px;" />
            <button class="btn btn-ghost" id="btn-override-school">Set Override</button>
            <button class="btn btn-ghost" id="btn-clear-override">Reset ke auto</button>
          </div>
          <div class="muted" style="font-size:11px;">Device ID: <code>${escapeHtml(s.deviceId)}</code></div>
        </section>

        <section class="card stack" id="section-attendance">
          <h3 style="margin:0;">Aturan Absensi</h3>
          <p class="muted" style="margin:0;font-size:13px;">${SECTIONS[1].desc}</p>
          <div class="row" style="flex-wrap:wrap;gap:8px;">
            <label class="row" style="gap:6px;">On-time until: <input id="cfg-ontime" type="time" value="${s.attendance.onTimeUntil}" style="padding:8px;border:1px solid var(--color-border);border-radius:8px;" /></label>
            <label class="row" style="gap:6px;">Late after: <input id="cfg-late" type="time" value="${s.attendance.lateAfter}" style="padding:8px;border:1px solid var(--color-border);border-radius:8px;" /></label>
            <label class="row" style="gap:6px;">Close at: <input id="cfg-close" type="time" value="${s.attendance.closeAt}" style="padding:8px;border:1px solid var(--color-border);border-radius:8px;" /></label>
          </div>
          <div class="row" style="flex-wrap:wrap;gap:8px;">
            <label class="row" style="gap:6px;">
              <input id="cfg-liveness" type="checkbox" ${s.attendance.livenessEnabled ? 'checked' : ''} />
              Aktifkan liveness check (active challenge)
            </label>
            <select id="cfg-challenge" style="padding:8px;border:1px solid var(--color-border);border-radius:8px;">
              <option value="blink" ${s.attendance.livenessChallenge === 'blink' ? 'selected' : ''}>Kedip</option>
              <option value="turn_left" ${s.attendance.livenessChallenge === 'turn_left' ? 'selected' : ''}>Hadap Kiri</option>
              <option value="turn_right" ${s.attendance.livenessChallenge === 'turn_right' ? 'selected' : ''}>Hadap Kanan</option>
            </select>
            <button class="btn btn-primary" id="btn-save-attendance">Simpan</button>
          </div>
        </section>

        <section class="card stack" id="section-face">
          <h3 style="margin:0;">Face Recognition</h3>
          <p class="muted" style="margin:0;font-size:13px;">${SECTIONS[2].desc}</p>
          <div class="row" style="flex-wrap:wrap;gap:8px;">
            <label class="row" style="gap:6px;">Threshold:
              <input id="cfg-threshold" type="range" min="0.5" max="1.0" step="0.01" value="${s.face.threshold}" style="width:160px;" />
              <span id="cfg-threshold-val" style="min-width:42px;">${s.face.threshold.toFixed(2)}</span>
            </label>
            <label class="row" style="gap:6px;">Min quality:
              <input id="cfg-quality" type="number" step="0.05" min="0" max="1" value="${s.face.minQualityScore}" style="width:90px;padding:8px;border:1px solid var(--color-border);border-radius:8px;" />
            </label>
            <label class="row" style="gap:6px;">Model:
              <input id="cfg-model" type="text" value="${escapeHtml(s.face.modelVersion)}" style="width:160px;padding:8px;border:1px solid var(--color-border);border-radius:8px;" />
            </label>
            <button class="btn btn-primary" id="btn-save-face">Simpan</button>
          </div>
        </section>

        <section class="card stack" id="section-sync">
          <h3 style="margin:0;">Sinkronisasi</h3>
          <p class="muted" style="margin:0;font-size:13px;">${SECTIONS[3].desc}</p>
          <div class="row" style="flex-wrap:wrap;gap:8px;">
            <label class="row" style="gap:6px;">
              <input id="cfg-auto" type="checkbox" ${s.sync.autoEnabled ? 'checked' : ''} />
              Auto-sync
            </label>
            <label class="row" style="gap:6px;">Interval (detik):
              <input id="cfg-interval" type="number" min="10" max="600" value="${Math.round(s.sync.intervalMs / 1000)}" style="width:90px;padding:8px;border:1px solid var(--color-border);border-radius:8px;" />
            </label>
            <button class="btn btn-primary" id="btn-save-sync">Simpan</button>
            <button class="btn btn-ghost" id="btn-sync-now">Sync Sekarang</button>
          </div>
          <div class="muted" style="font-size:12px;">
            Last sync: ${s.sync.lastSyncAt ? new Date(s.sync.lastSyncAt).toLocaleString('id-ID') : 'never'}
            ${s.sync.lastError ? `<br><span style="color:var(--color-danger);">Error: ${escapeHtml(s.sync.lastError)}</span>` : ''}
          </div>
        </section>

        <section class="card stack" id="section-supabase">
          <h3 style="margin:0;">Supabase Connection</h3>
          <p class="muted" style="margin:0;font-size:13px;">${SECTIONS[4].desc}</p>
          ${s.supabase.isConfigured
            ? `<div class="muted" style="font-size:13px;">Status: <strong style="color:var(--color-success);">✓ Connected</strong> (${s.supabase.source}) · URL: <code>${escapeHtml(s.supabase.url)}</code> · Key: <code>****${escapeHtml(s.supabase.keyLast4)}</code></div>`
            : `<div class="muted" style="font-size:13px;">Status: <strong style="color:var(--color-warn);">⚠ Not configured</strong>. Set <code>VITE_SUPABASE_URL</code> & <code>VITE_SUPABASE_ANON_KEY</code> di <code>.env</code> atau environment Vercel.</div>`
          }
          <div class="row" style="flex-wrap:wrap;gap:8px;">
            <input id="rt-url" type="text" placeholder="https://xxxxx.supabase.co" value="${escapeHtml(s.supabase.url)}" style="flex:1;min-width:280px;padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
            <input id="rt-key" type="password" placeholder="Anon public key" style="flex:1;min-width:280px;padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
            <button class="btn btn-primary" id="btn-rt-save">Simpan Runtime</button>
            <button class="btn btn-ghost" id="btn-rt-clear">Reset ke .env</button>
          </div>
          <div class="muted" style="font-size:12px;">Runtime config disimpan di localStorage. Untuk production, lebih aman set di env Vercel.</div>
        </section>

        <section class="card stack">
          <h3 style="margin:0;">Akun</h3>
          <div class="muted" style="font-size:13px;">
            Login sebagai: <strong>${currentUser?.email ?? '(belum login)'}</strong><br>
            Role: <strong>${currentUser?.role ?? '—'}</strong>${currentUser?.subRole ? ` (${currentUser.subRole})` : ''}<br>
            Display: ${currentUser?.displayName ?? '—'}
          </div>
          ${authService.isEnabled() ? `<button class="btn btn-danger" id="btn-logout" style="max-width:160px;">Logout</button>` : ''}
        </section>

        <section class="card stack">
          <h3 style="margin:0;color:var(--color-danger);">Danger Zone</h3>
          <button class="btn btn-danger" id="btn-reset" style="max-width:200px;">Reset Database (hapus semua)</button>
        </section>

        <section class="card stack">
          <h3 style="margin:0;">Log</h3>
          <pre id="log" style="background:#0f172a;color:#cbd5e1;padding:12px;border-radius:8px;max-height:200px;overflow:auto;margin:0;font-size:12px;"></pre>
        </section>
      </div>
    `;

    bindEvents();
  };

  const bindEvents = () => {
    const log = (msg: string) => {
      const ts = formatTime(Date.now());
      const logEl = root.querySelector<HTMLPreElement>('#log')!;
      logEl.textContent = `[${ts}] ${msg}\n` + logEl.textContent;
    };

    root.querySelector<HTMLButtonElement>('#btn-save-school')?.addEventListener('click', async () => {
      const v = root.querySelector<HTMLInputElement>('#school-name')!.value.trim();
      if (!v) return;
      await settingsService.save({ schoolName: v });
      log('Nama sekolah disimpan.');
      await refresh();
    });

    root.querySelector<HTMLButtonElement>('#btn-copy-school')?.addEventListener('click', async () => {
      const id = root.querySelector<HTMLElement>('#school-id')!.textContent ?? '';
      try {
        await navigator.clipboard.writeText(id);
        log(`School ID disalin: ${id}`);
      } catch (err: unknown) {
        log(`Copy gagal: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    root.querySelector<HTMLButtonElement>('#btn-override-school')?.addEventListener('click', async () => {
      const v = root.querySelector<HTMLInputElement>('#override-school')!.value.trim();
      if (!v) {
        log('UUID kosong.');
        return;
      }
      if (!isValidUuid(v)) {
        log('Format UUID tidak valid. Contoh: 00000000-0000-0000-0000-000000000001');
        return;
      }
      try {
        setSchoolIdOverride(v);
        log(`School ID override diset: ${v}. Refresh halaman untuk efek penuh.`);
        await refresh();
      } catch (err: unknown) {
        log(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    root.querySelector<HTMLButtonElement>('#btn-clear-override')?.addEventListener('click', async () => {
      clearSchoolIdOverride();
      log('Override dihapus. Pakai school ID auto-generated.');
      await refresh();
    });

    root.querySelector<HTMLButtonElement>('#btn-save-attendance')?.addEventListener('click', async () => {
      await settingsService.save({
        attendance: {
          onTimeUntil: root.querySelector<HTMLInputElement>('#cfg-ontime')!.value,
          lateAfter: root.querySelector<HTMLInputElement>('#cfg-late')!.value,
          closeAt: root.querySelector<HTMLInputElement>('#cfg-close')!.value,
          livenessEnabled: root.querySelector<HTMLInputElement>('#cfg-liveness')!.checked,
          livenessChallenge: root.querySelector<HTMLSelectElement>('#cfg-challenge')!.value as 'blink' | 'turn_left' | 'turn_right'
        }
      });
      log('Aturan absensi disimpan.');
      await refresh();
    });

    const thresholdInput = root.querySelector<HTMLInputElement>('#cfg-threshold');
    if (thresholdInput) {
      thresholdInput.addEventListener('input', () => {
        root.querySelector<HTMLSpanElement>('#cfg-threshold-val')!.textContent = parseFloat(thresholdInput.value).toFixed(2);
      });
    }
    root.querySelector<HTMLButtonElement>('#btn-save-face')?.addEventListener('click', async () => {
      const threshold = parseFloat(root.querySelector<HTMLInputElement>('#cfg-threshold')!.value);
      const quality = parseFloat(root.querySelector<HTMLInputElement>('#cfg-quality')!.value);
      const model = root.querySelector<HTMLInputElement>('#cfg-model')!.value.trim();
      await settingsService.save({
        face: { threshold, minQualityScore: quality, modelVersion: model }
      });
      log('Face settings disimpan.');
      await refresh();
    });

    root.querySelector<HTMLButtonElement>('#btn-save-sync')?.addEventListener('click', async () => {
      const enabled = root.querySelector<HTMLInputElement>('#cfg-auto')!.checked;
      const intervalSec = parseInt(root.querySelector<HTMLInputElement>('#cfg-interval')!.value, 10) * 1000;
      await settingsService.save({ sync: { autoEnabled: enabled, intervalMs: intervalSec } });
      if (enabled) await syncService.startAutoSync(intervalSec);
      else syncService.stopAutoSync();
      log(`Sync settings: auto=${enabled}, interval=${intervalSec}ms.`);
      await refresh();
    });

    root.querySelector<HTMLButtonElement>('#btn-sync-now')?.addEventListener('click', async () => {
      log('Manual sync...');
      try {
        const r = await syncService.runFullSync();
        log(`Sync ${r.ok ? 'OK' : 'FAIL'} pushed=${JSON.stringify(r.pushed)} pulled=${JSON.stringify(r.pulled)}`);
      } catch (err: unknown) {
        log(`Sync error: ${err instanceof Error ? err.message : String(err)}`);
      }
      await refresh();
    });

    root.querySelector<HTMLButtonElement>('#btn-rt-save')?.addEventListener('click', async () => {
      const url = root.querySelector<HTMLInputElement>('#rt-url')!.value.trim();
      const key = root.querySelector<HTMLInputElement>('#rt-key')!.value.trim();
      if (!url || !key) {
        log('URL dan key wajib diisi.');
        return;
      }
      if (!url.startsWith('https://') || !url.includes('.supabase.co')) {
        log('URL harus https://<project>.supabase.co');
        return;
      }
      setSupabaseRuntimeConfig(url, key);
      log('Runtime config disimpan. Reload untuk efek penuh.');
      await refresh();
    });

    root.querySelector<HTMLButtonElement>('#btn-rt-clear')?.addEventListener('click', async () => {
      clearSupabaseRuntimeConfig();
      log('Runtime config dihapus. Pakai env (.env).');
      await refresh();
    });

    root.querySelector<HTMLButtonElement>('#btn-logout')?.addEventListener('click', async () => {
      await authService.signOut();
      window.location.hash = '';
      window.location.pathname = '/login';
    });

    root.querySelector<HTMLButtonElement>('#btn-reset')?.addEventListener('click', async () => {
      if (!confirm('Reset semua data IndexedDB? TIDAK BISA DIBATALKAN.')) return;
      if (!confirm('Yakin? Data siswa, kelas, absensi, face profile akan hilang.')) return;
      await databaseService.resetAll();
      log('Database di-reset.');
      await refresh();
    });

    root.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const id = a.getAttribute('href')?.slice(1);
        if (id) root.querySelector(`#section-${id}`)?.scrollIntoView({ behavior: 'smooth' });
      });
    });
  };

  const refresh = async () => {
    const s = await settingsService.load();
    render(s);
  };

  root.innerHTML = `<div id="page-root"></div>`;
  const pageRoot = root.querySelector<HTMLDivElement>('#page-root')!;

  currentUser = await authService.getCurrentUser();
  await refresh();
}