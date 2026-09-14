import { ROUTES } from '@config/app';
import { authService } from '@services/auth/index';
import { generateAndStoreNewSchoolId, isValidUuid, readActiveSchoolId } from '@utils/device';

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

function renderProvisioning(root: HTMLElement, schoolId: string): void {
  root.innerHTML = `
    <main class="app-main" style="max-width:720px;margin:0 auto;padding:32px 16px;">
      <section class="card stack">
        <h1 style="margin:0;">School ID dibuat</h1>
        <p class="muted" style="margin:0;">Workspace lokal siap, tetapi sinkronisasi cloud masih menunggu provisioning akun.</p>
        <div class="muted" style="font-size:12px;">School ID: <code>${escapeHtml(schoolId)}</code></div>
        <div class="row" style="gap:8px;flex-wrap:wrap;">
          <a href="/login" data-link class="btn btn-primary">Login / cek akun</a>
        </div>
        <p class="muted" style="font-size:12px;margin-top:12px;">Setelah login, data akan tersinkronisasi otomatis.</p>
      </section>
    </main>
  `;
}

export async function renderOnboarding(root: HTMLElement): Promise<void> {
  const existing = readActiveSchoolId();
  if (existing) {
    renderProvisioning(root, existing);
    return;
  }

  root.innerHTML = `
    <main class="app-main" style="max-width:760px;margin:0 auto;padding:32px 16px;">
      <div class="stack">
        <header class="stack" style="gap:6px;">
          <h1 style="margin:0;">Setup School ID</h1>
          <p class="muted" style="margin:0;">Pilih identitas sekolah untuk device ini sebelum data absensi digunakan.</p>
        </header>

        <section class="card stack">
          <h2 style="margin:0;font-size:20px;">Generate School ID baru</h2>
          <p class="muted" style="margin:0;">Gunakan ini untuk sekolah/workspace baru. Data kelas, siswa, dan absensi dimulai kosong.</p>
          <button id="btn-generate-school" class="btn btn-primary" type="button">Generate School ID baru</button>
        </section>

        <section class="card stack">
          <h2 style="margin:0;font-size:20px;">Link ke School ID existing</h2>
          <p class="muted" style="margin:0;">Gunakan jika device ini harus menarik data dari sekolah yang sudah terdaftar.</p>
          <label for="school-id-input" style="font-weight:600;">School ID</label>
          <div class="row" style="gap:8px;flex-wrap:wrap;">
            <input id="school-id-input" type="text" autocomplete="off" placeholder="00000000-0000-0000-0000-000000000000" style="flex:1;min-width:260px;padding:10px;border:1px solid var(--color-border);border-radius:8px;font-family:monospace;" />
            <button id="btn-link-school" class="btn btn-primary" type="button">Link Manual</button>
          </div>
          <button id="btn-scan-qr-onboarding" class="btn btn-ghost" type="button">Scan QR</button>
          <p id="onboarding-error" role="alert" style="display:none;margin:0;color:var(--color-danger);font-size:13px;"></p>
        </section>
      </div>
    </main>
  `;

  const errorEl = root.querySelector<HTMLElement>('#onboarding-error');
  const showError = (message: string) => {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  };

  root.querySelector<HTMLInputElement>('#school-id-input')?.focus();

  root.querySelector<HTMLButtonElement>('#btn-generate-school')?.addEventListener('click', () => {
    try {
      const schoolId = generateAndStoreNewSchoolId();
      renderProvisioning(root, schoolId);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : String(err));
    }
  });

  root.querySelector<HTMLButtonElement>('#btn-link-school')?.addEventListener('click', async () => {
    const input = root.querySelector<HTMLInputElement>('#school-id-input');
    const schoolId = input?.value.trim() ?? '';
    if (!isValidUuid(schoolId)) {
      showError('Format School ID harus UUID valid.');
      return;
    }
    if (authService.isEnabled() && !authService.isAuthenticated()) {
      showError('Login terlebih dahulu sebelum link ke School ID existing.');
      return;
    }
    if (!confirm(`Link device ini ke School ID ${schoolId}? Data lokal kosong/lama akan dihapus sebelum pull.`)) return;
    const { linkToSchool } = await import('@services/sync/qrLinkingService');
    const { getSupabaseProjectRef } = await import('@services/sync/supabaseClient');
    const result = await linkToSchool({
      v: 2,
      purpose: 'school-link',
      projectRef: getSupabaseProjectRef() ?? '',
      schoolId,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
      nonce: crypto.randomUUID()
    });
    if (!result.ok) {
      showError(result.message);
      return;
    }
    window.location.href = ROUTES.dashboard;
  });

  root.querySelector<HTMLButtonElement>('#btn-scan-qr-onboarding')?.addEventListener('click', () => {
    void showScanModal();
  });
}

async function showScanModal(): Promise<void> {
  const { startScanning, decodePayload, linkToSchool } = await import('@services/sync/qrLinkingService');
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.92);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px);';
  overlay.innerHTML = `
    <div style="background:#fff;color:#0f172a;border-radius:16px;padding:20px;max-width:90vw;max-width:500px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.4);position:relative;">
      <button id="qr-close" style="position:absolute;top:8px;right:8px;background:transparent;border:none;font-size:24px;cursor:pointer;color:#64748b;line-height:1;padding:4px 8px;">&times;</button>
      <div style="font-size:14px;color:#64748b;margin-bottom:6px;">📷 PINDAI QR</div>
      <h3 style="margin:0 0 12px 0;font-size:16px;color:#0f172a;">Arahkan kamera ke QR device lain</h3>
      <div id="qr-scanner-wrap" style="position:relative;background:#000;border-radius:12px;overflow:hidden;width:280px;height:280px;margin:0 auto;">
        <div id="qr-scanner-el" style="width:100%;height:100%;"></div>
      </div>
      <div id="qr-scan-error" style="margin-top:6px;font-size:12px;color:#dc2626;line-height:1.4;text-align:center;display:none;"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => {
    void scanHandle?.stop();
    overlay.remove();
  };

  const scanEl = document.getElementById('qr-scanner-el');
  if (!scanEl) return;
  const containerId = 'qr-scanner-el';

  let scanHandle: { stop: () => Promise<void> } | null = null;
  let handled = false;

  try {
    scanHandle = await startScanning(containerId, {
      onResult: (text: string) => {
        if (handled) return;
        const payload = decodePayload(text);
        if (!payload) {
          const errEl = document.getElementById('qr-scan-error');
          if (errEl) {
            errEl.textContent = 'QR tidak valid atau bukan format school linking.';
            errEl.style.display = 'block';
          }
          return;
        }
        handled = true;
        void (async () => {
          const result = await linkToSchool(payload);
          const errEl = document.getElementById('qr-scan-error');
          if (result.ok) {
            if (errEl) {
              errEl.style.color = '#16a34a';
              errEl.textContent = `Berhasil: ${result.message}`;
            }
            void scanHandle?.stop();
            setTimeout(() => {
              close();
              window.location.href = ROUTES.dashboard;
            }, 1500);
          } else {
            if (errEl) {
              errEl.textContent = result.message;
              errEl.style.display = 'block';
            }
            handled = false;
          }
        })();
      },
      onError: (err: Error) => {
        const errEl = document.getElementById('qr-scan-error');
        if (errEl) {
          errEl.textContent = `Error kamera: ${err.message}. Pastikan browser diizinkan akses kamera.`;
          errEl.style.display = 'block';
        }
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const errEl = document.getElementById('qr-scan-error');
    if (errEl) {
      errEl.textContent = `Gagal memulai scanner: ${msg}`;
      errEl.style.display = 'block';
    }
  }

  document.getElementById('qr-close')?.addEventListener('click', close);
}
