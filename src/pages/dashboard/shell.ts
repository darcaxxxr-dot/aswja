import { APP_CONFIG, ROUTES } from '@config/app';
import { router } from '@router/index';
import { installPromptService, getIosInstallInstructions } from '@services/pwa/index';
import { syncService } from '@services/sync/index';
import { authService, ROLE_LABELS, SUBROLE_LABELS, type AppUser } from '@services/auth/index';
import { db } from '@services/database/index';
import { getOrCreateSchoolId } from '@utils/device';

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

export function renderAppShell(activePath: string, user: AppUser | null = null): string {
  const items: Array<{ href: string; label: string }> = [
    { href: ROUTES.dashboard, label: 'Dashboard' },
    { href: ROUTES.students, label: 'Siswa' },
    { href: ROUTES.enrollment, label: 'Enrollment' },
    { href: ROUTES.classes, label: 'Kelas' },
    { href: ROUTES.attendance, label: 'Absensi' },
    { href: ROUTES.reports, label: 'Laporan' },
    { href: ROUTES.settings, label: 'Setting' }
  ];

  const nav = items
    .map(
      (it) =>
        `<a href="${it.href}" data-link class="nav-link${activePath.startsWith(it.href) ? ' active' : ''}">${it.label}</a>`
    )
    .join('');

  const offlineBadge = `<span id="offline-badge" style="display:none;background:#dc2626;color:#fff;padding:2px 8px;border-radius:8px;font-size:11px;margin-right:6px;">OFFLINE</span>`;
  const syncBadge = `<span id="sync-badge" title="Klik untuk detail" style="background:rgba(255,255,255,0.12);color:#fff;padding:4px 10px;border-radius:8px;font-size:11px;margin-right:6px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;"><span id="sync-dot" style="width:8px;height:8px;border-radius:50%;background:#94a3b8;"></span><span id="sync-label">Sync: —</span></span>`;
  const userBadge = user
    ? `<span id="user-badge" title="${user.email ?? ''} · ${ROLE_LABELS[user.role]}${user.subRole ? ' · ' + SUBROLE_LABELS[user.subRole] : ''}" style="background:rgba(255,255,255,0.12);color:#fff;padding:2px 8px;border-radius:8px;font-size:11px;margin-right:6px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px;">${user.displayName} · ${ROLE_LABELS[user.role]}${user.subRole ? '/' + SUBROLE_LABELS[user.subRole] : ''}</span>`
    : `<a id="user-badge" href="/login" data-link style="background:rgba(255,255,255,0.12);color:#fff;padding:2px 8px;border-radius:8px;font-size:11px;margin-right:6px;text-decoration:none;">Login</a>`;
  const installBtn = `<button id="btn-install" class="btn" style="display:none;background:#16a34a;color:#fff;padding:6px 10px;min-height:32px;font-size:13px;">Install App</button>`;

  // Sync panel (hidden by default, shown when sync badge clicked)
  const syncPanel = `
    <div id="sync-panel" style="display:none;position:fixed;top:60px;right:16px;width:340px;max-width:calc(100vw - 32px);background:var(--color-bg-elev,#0f172a);color:#fff;border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,0.35);z-index:9999;padding:16px;font-size:13px;border:1px solid rgba(255,255,255,0.08);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <strong style="font-size:14px;">Sinkronisasi Cloud</strong>
        <button id="sync-panel-close" style="background:transparent;border:none;color:#94a3b8;font-size:18px;cursor:pointer;padding:0;line-height:1;">&times;</button>
      </div>
      <div id="sync-panel-body"></div>
    </div>
  `;

  return `
    <header class="app-header">
      <input type="checkbox" id="nav-toggle" class="nav-toggle" aria-hidden="true" />
      <div class="header-row">
        <label for="nav-toggle" class="hamburger" aria-label="Buka menu">
          <span></span><span></span><span></span>
        </label>
        <h1 class="app-title">SmartFace Attendance</h1>
        <div class="header-right">
          ${offlineBadge}${syncBadge}${userBadge}${installBtn}
        </div>
      </div>
      <nav class="app-nav" id="app-nav">${nav}</nav>
    </header>
    <main class="app-main" id="page-root"></main>
    ${syncPanel}
  `;
}

export function renderShellOnly(activePath: string, user: AppUser | null = null): string {
  return renderAppShell(activePath, user);
}

export function initInstallPrompt(): void {
  installPromptService.init();
  const btn = document.getElementById('btn-install') as HTMLButtonElement | null;
  if (!btn) return;
  if (installPromptService.isInstalled()) {
    btn.style.display = 'none';
    return;
  }

  // Android/Chrome: standard install prompt
  installPromptService.onAvailable(() => {
    if (!installPromptService.isInstalled()) btn.style.display = 'inline-flex';
  });
  btn.addEventListener('click', async () => {
    const result = await installPromptService.promptInstall();
    if (result === 'accepted') {
      btn.style.display = 'none';
    } else if (result === 'unavailable') {
      // iOS: show manual instructions
      const ios = getIosInstallInstructions();
      if (ios.show) {
        alert(ios.message);
      }
    }
  });

  // iOS: button always visible (with iOS instructions on click)
  if (getIosInstallInstructions().show) {
    btn.style.display = 'inline-flex';
    btn.textContent = 'Install App';
  }
}

export function initOfflineIndicator(): void {
  const update = () => {
    const badge = document.getElementById('offline-badge');
    if (!badge) return;
    badge.style.display = navigator.onLine ? 'none' : 'inline-block';
  };
  update();
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
}

export function initIdleIndicator(): void {
  const update = () => {
    const badge = document.getElementById('idle-badge');
    if (!badge) return;
    if (!authService.isAuthenticated()) {
      badge.style.display = 'none';
      return;
    }
    const ms = authService.getIdleRemainingMs();
    if (ms <= 0) {
      badge.textContent = '⏱ 0:00';
      return;
    }
    const min = Math.floor(ms / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    badge.textContent = `⏱ ${min}:${String(sec).padStart(2, '0')}`;
  };
  update();
  setInterval(update, 1000);
  authService.onAuthStateChange(() => update());
  document.addEventListener('click', () => update(), { passive: true });
}

export function initSyncIndicator(): void {
  const badge = document.getElementById('sync-badge');
  const label = document.getElementById('sync-label');
  const dot = document.getElementById('sync-dot');
  const panel = document.getElementById('sync-panel');
  const panelBody = document.getElementById('sync-panel-body');
  const panelClose = document.getElementById('sync-panel-close');
  if (!badge || !label || !dot || !panel || !panelBody) return;

  let isSyncing = false;
  let lastStatus: { online: boolean; pendingPush: number; lastSyncAt: number; lastError?: string } | null = null;

  const formatTime = (ts: number | null | undefined): string => {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatRelative = (ts: number | null | undefined): string => {
    if (!ts) return 'belum pernah';
    const diff = Date.now() - ts;
    if (diff < 60_000) return `${Math.floor(diff / 1000)} detik lalu`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} menit lalu`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} jam lalu`;
    return new Date(ts).toLocaleString('id-ID');
  };

  const renderBadge = (s: { online: boolean; pendingPush: number; lastSyncAt: number; lastError?: string }) => {
    let color = '#94a3b8'; // gray = idle
    let text = 'Sync: —';
    if (isSyncing) {
      color = '#f59e0b';
      text = 'Sync: ...';
    } else if (!s.online) {
      color = '#dc2626';
      text = 'Sync: offline';
    } else if (s.lastError) {
      color = '#dc2626';
      text = 'Sync: error';
    } else if (s.pendingPush > 0) {
      color = '#f59e0b';
      text = `Sync: ${s.pendingPush} pending`;
    } else if (s.lastSyncAt) {
      color = '#10b981';
      text = `Sync: ✓ ${formatTime(s.lastSyncAt)}`;
    }
    if (label) label.textContent = text;
    if (dot) dot.style.background = color;
  };

  const renderPanel = async (s: { online: boolean; pendingPush: number; lastSyncAt: number; lastError?: string }) => {
    const schoolId = getOrCreateSchoolId();
    const counts = await db.counts();
    const total = counts.schools + counts.academicYears + counts.classes + counts.students +
      counts.faceProfiles + counts.attendanceSessions + counts.attendanceRecords;

    const statusColor = !s.online
      ? '#dc2626'
      : s.lastError
        ? '#dc2626'
        : isSyncing
          ? '#f59e0b'
          : s.pendingPush > 0
            ? '#f59e0b'
            : '#10b981';
    const statusLabel = !s.online
      ? 'OFFLINE'
      : s.lastError
        ? 'ERROR'
        : isSyncing
          ? 'SYNCHRONIZING'
          : s.pendingPush > 0
            ? 'PENDING'
            : 'SYNCED';

    if (!panelBody) return;
    panelBody.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <span style="width:10px;height:10px;border-radius:50%;background:${statusColor};box-shadow:0 0 8px ${statusColor};"></span>
        <strong>${statusLabel}</strong>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;margin-bottom:10px;line-height:1.5;">
        <div style="color:#94a3b8;">Last sync</div>
        <div>${formatRelative(s.lastSyncAt)}</div>
        <div style="color:#94a3b8;">Last sync time</div>
        <div>${s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString('id-ID') : '—'}</div>
        <div style="color:#94a3b8;">Pending push</div>
        <div>${s.pendingPush} item</div>
        <div style="color:#94a3b8;">Local rows</div>
        <div>${total} total</div>
      </div>

      <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">School ID (Multi-Device Sync)</div>
          <button id="btn-copy-schoolid" style="background:rgba(96,165,250,0.2);color:#93c5fd;border:1px solid rgba(96,165,250,0.3);padding:2px 8px;border-radius:4px;font-size:10px;cursor:pointer;">📋 Copy</button>
        </div>
        <div id="schoolid-text" style="font-family:monospace;font-size:11px;word-break:break-all;background:rgba(0,0,0,0.3);padding:6px;border-radius:4px;margin-bottom:8px;">${schoolId}</div>
        <details>
          <summary style="cursor:pointer;font-size:11px;color:#93c5fd;padding:2px 0;">Link ke School ID lain (device baru)</summary>
          <div style="margin-top:6px;display:flex;gap:4px;">
            <input id="input-schoolid" type="text" placeholder="Paste School ID di sini" style="flex:1;background:rgba(0,0,0,0.3);color:#fff;border:1px solid rgba(255,255,255,0.15);border-radius:4px;padding:4px 6px;font-size:11px;font-family:monospace;" />
            <button id="btn-link-school" style="background:#0ea572;color:#fff;border:none;padding:4px 10px;border-radius:4px;font-size:11px;cursor:pointer;">Link</button>
          </div>
          <div style="font-size:10px;color:#94a3b8;margin-top:4px;line-height:1.4;">⚠ Paste School ID dari device yg sudah ada datanya. Setelah link, klik "Push &amp; Pull" untuk sinkronkan. Data lokal akan di-overwrite oleh data cloud.</div>
        </details>
      </div>

      ${s.lastError ? `
        <div style="background:rgba(220,38,38,0.15);border:1px solid rgba(220,38,38,0.4);border-radius:6px;padding:8px;margin-bottom:10px;">
          <div style="color:#fca5a5;font-weight:600;margin-bottom:4px;">⚠ Error</div>
          <div style="font-size:11px;line-height:1.4;color:#fecaca;word-break:break-word;">${escapeHtml(s.lastError)}</div>
        </div>
      ` : ''}
      <details style="margin-bottom:10px;">
        <summary style="cursor:pointer;font-size:12px;color:#94a3b8;padding:4px 0;">Detail per tabel (${total} rows)</summary>
        <div style="display:grid;grid-template-columns:1fr 60px;gap:4px;font-size:11px;margin-top:6px;line-height:1.6;">
          <div style="color:#94a3b8;">schools</div><div style="text-align:right;">${counts.schools}</div>
          <div style="color:#94a3b8;">academic_years</div><div style="text-align:right;">${counts.academicYears}</div>
          <div style="color:#94a3b8;">classes</div><div style="text-align:right;">${counts.classes}</div>
          <div style="color:#94a3b8;">students</div><div style="text-align:right;">${counts.students}</div>
          <div style="color:#94a3b8;">face_profiles</div><div style="text-align:right;">${counts.faceProfiles}</div>
          <div style="color:#94a3b8;">attendance_sessions</div><div style="text-align:right;">${counts.attendanceSessions}</div>
          <div style="color:#94a3b8;">attendance_records</div><div style="text-align:right;">${counts.attendanceRecords}</div>
        </div>
      </details>
      <div style="display:flex;gap:6px;">
        <button id="btn-sync-now" class="btn" style="flex:1;background:#0ea572;color:#fff;padding:6px 8px;font-size:12px;min-height:32px;">⬆ Push &amp; Pull</button>
        <button id="btn-pull-only" class="btn" style="flex:1;background:rgba(255,255,255,0.12);color:#fff;padding:6px 8px;font-size:12px;min-height:32px;">⬇ Pull Only</button>
      </div>
      <div style="display:flex;gap:6px;margin-top:6px;">
        <button id="btn-reset-local" class="btn" style="flex:1;background:rgba(220,38,38,0.15);color:#fca5a5;border:1px solid rgba(220,38,38,0.3);padding:6px 8px;font-size:12px;min-height:32px;">🗑 Reset Local Data</button>
      </div>
      <div id="sync-panel-log" style="margin-top:10px;max-height:120px;overflow:auto;font-size:10px;font-family:monospace;color:#94a3b8;background:rgba(0,0,0,0.3);border-radius:6px;padding:6px;display:none;"></div>
    `;

    const btnNow = document.getElementById('btn-sync-now');
    const btnPull = document.getElementById('btn-pull-only');
    const btnCopy = document.getElementById('btn-copy-schoolid');
    const btnLink = document.getElementById('btn-link-school');
    const btnReset = document.getElementById('btn-reset-local');
    const inputSchool = document.getElementById('input-schoolid') as HTMLInputElement | null;
    const logEl = document.getElementById('sync-panel-log');

    const appendLog = (msg: string) => {
      if (!logEl) return;
      logEl.style.display = 'block';
      const ts = formatTime(Date.now());
      logEl.innerHTML = `[${ts}] ${escapeHtml(msg)}\n` + logEl.innerHTML;
    };

    btnCopy?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(schoolId);
        const orig = btnCopy.textContent;
        if (btnCopy) {
          btnCopy.textContent = '✓ Tersalin!';
          btnCopy.style.background = 'rgba(16,185,129,0.3)';
          setTimeout(() => {
            if (btnCopy) {
              btnCopy.textContent = orig ?? '📋 Copy';
              btnCopy.style.background = 'rgba(96,165,250,0.2)';
            }
          }, 1500);
        }
        appendLog(`School ID disalin ke clipboard: ${schoolId}`);
      } catch (e) {
        appendLog(`Gagal copy: ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    btnLink?.addEventListener('click', () => {
      const newId = inputSchool?.value.trim();
      if (!newId) {
        appendLog('⚠ Masukkan School ID terlebih dahulu.');
        return;
      }
      // Validasi format UUID
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(newId)) {
        appendLog('⚠ Format School ID tidak valid (harus UUID).');
        return;
      }
      if (newId === schoolId) {
        appendLog('⚠ School ID sama dengan yang sekarang.');
        return;
      }
      const oldId = schoolId;
      try {
        localStorage.setItem('sf_school_id_override', newId);
        appendLog(`✓ School ID diubah: ${oldId} → ${newId}`);
        appendLog('Refresh halaman untuk menerapkan School ID baru.');
        // Tampilkan instruksi untuk user
        if (btnLink) {
          btnLink.textContent = '✓ Saved';
          btnLink.style.background = '#059669';
          setTimeout(() => { window.location.reload(); }, 1500);
        }
      } catch (e) {
        appendLog(`Gagal link: ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    btnReset?.addEventListener('click', async () => {
      const confirmed = window.confirm(
        '⚠ RESET LOCAL DATA\n\n' +
        'Ini akan MENGHAPUS semua data di browser ini:\n' +
        '• Semua IndexedDB (siswa, kelas, absensi, face profiles)\n' +
        '• localStorage (school_id, device_id, auth)\n\n' +
        'Data di CLOUD (Supabase) TIDAK akan terhapus.\n' +
        'Setelah reset, klik "Push & Pull" untuk tarik data dari cloud.\n\n' +
        'Lanjutkan?'
      );
      if (!confirmed) return;

      // Konfirmasi kedua dengan mengetik RESET
      const typed = window.prompt('Ketik "RESET" (huruf besar) untuk konfirmasi:');
      if (typed !== 'RESET') {
        appendLog('Reset dibatalkan.');
        return;
      }

      const resetBtn = btnReset as HTMLButtonElement | null;
      if (resetBtn) {
        resetBtn.disabled = true;
        resetBtn.textContent = '⏳ Menghapus...';
      }
      appendLog('🗑 Memulai reset local data...');

      try {
        // 1. Stop sync supaya tidak auto-push saat reset
        syncService.stopAutoSync();

        // 2. Stop camera kalau aktif
        try {
          const { cameraService } = await import('@services/camera');
          await cameraService.stop();
        } catch {
          // ignore - camera service might not be available
        }

        // 3. Clear IndexedDB
        await db.resetAll();
        appendLog('✓ IndexedDB cleared');

        // 4. Clear localStorage (hanya keys yang dipakai app)
        const keysToRemove = [
          APP_CONFIG.deviceIdKey,
          APP_CONFIG.schoolIdKey,
          APP_CONFIG.schoolIdOverrideKey,
          'auth.lastActivity',
          'auth.logoutReason'
        ];
        for (const key of keysToRemove) {
          try { localStorage.removeItem(key); } catch { /* ignore */ }
        }
        // Also clear any supabase auth keys (pattern-based)
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && (k.startsWith('sb-') || k.includes('-auth-token'))) {
            localStorage.removeItem(k);
          }
        }
        appendLog('✓ localStorage cleared');

        // 5. Unregister service workers
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const reg of regs) {
            await reg.unregister();
          }
          appendLog(`✓ ${regs.length} service worker unregistered`);
        }

        // 6. Clear caches
        if ('caches' in window) {
          const names = await caches.keys();
          for (const name of names) {
            await caches.delete(name);
          }
          appendLog(`✓ ${names.length} cache cleared`);
        }

        appendLog('✓ Reset selesai! Mengarahkan ke /login...');
        setTimeout(() => { window.location.href = '/login'; }, 1500);
      } catch (e) {
        appendLog(`✗ Reset gagal: ${e instanceof Error ? e.message : String(e)}`);
        if (resetBtn) {
          resetBtn.disabled = false;
          resetBtn.textContent = '🗑 Reset Local Data';
        }
      }
    });

    btnNow?.addEventListener('click', async () => {
      isSyncing = true;
      if (lastStatus) renderBadge(lastStatus);
      appendLog('Starting full sync (push + pull)...');
      try {
        const r = await syncService.runFullSync();
        appendLog(`Done: pushed=${JSON.stringify(r.pushed)} pulled=${JSON.stringify(r.pulled)} ok=${r.ok} ${r.durationMs}ms`);
        if (!r.ok && r.errors.length) appendLog(`Errors: ${r.errors.join('; ')}`);
        if (r.ok) {
          appendLog('↻ Halaman akan direfresh untuk menampilkan data terbaru...');
          setTimeout(() => { window.location.reload(); }, 1200);
        }
      } catch (e) {
        appendLog(`Failed: ${e instanceof Error ? e.message : String(e)}`);
        isSyncing = false;
        const cur = await syncService.getStatus();
        renderBadge(cur);
        renderPanel(cur);
      }
    });

    btnPull?.addEventListener('click', async () => {
      isSyncing = true;
      if (lastStatus) renderBadge(lastStatus);
      appendLog('Starting pull only...');
      try {
        const r = await syncService.pullAll();
        appendLog(`Pulled: ${JSON.stringify(r)}`);
        appendLog('↻ Halaman akan direfresh untuk menampilkan data terbaru...');
        setTimeout(() => { window.location.reload(); }, 1200);
      } catch (e) {
        appendLog(`Pull failed: ${e instanceof Error ? e.message : String(e)}`);
        isSyncing = false;
        const cur = await syncService.getStatus();
        renderBadge(cur);
        renderPanel(cur);
      }
    });
  };

  const showPanel = async () => {
    const cur = await syncService.getStatus();
    lastStatus = cur;
    if (panel) panel.style.display = 'block';
    await renderPanel(cur);
  };

  const hidePanel = () => {
    if (panel) panel.style.display = 'none';
  };

  panelClose?.addEventListener('click', hidePanel);
  document.addEventListener('click', (e) => {
    if (panel && panel.style.display === 'block') {
      const target = e.target as Node;
      if (!panel.contains(target) && !badge.contains(target)) {
        hidePanel();
      }
    }
  });

  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel && panel.style.display === 'block') hidePanel();
    else void showPanel();
  });

  syncService.onStatusChange((s) => {
    lastStatus = s;
    renderBadge(s);
    if (panel && panel.style.display === 'block') void renderPanel(s);
  });

  // Fetch current status immediately so badge doesn't stay at "Sync: —"
  void (async () => {
    const cur = await syncService.getStatus();
    lastStatus = cur;
    renderBadge(cur);
  })();

  // Auto-refresh panel every 5s if open
  setInterval(async () => {
    if (panel && panel.style.display === 'block') {
      const cur = await syncService.getStatus();
      lastStatus = cur;
      renderBadge(cur);
      void renderPanel(cur);
    }
  }, 5000);
}

export function renderPlaceholder(root: HTMLElement, title: string): void {
  const shell = renderAppShell(window.location.pathname);
  root.innerHTML = shell;
  const pageRoot = root.querySelector<HTMLElement>('#page-root')!;
  pageRoot.innerHTML = `
    <div class="card stack">
      <h2 style="margin:0;">${title}</h2>
      <p class="muted" style="margin:0;">Akan diimplementasikan pada sprint berikutnya.</p>
      <div><a href="${ROUTES.dashboard}" data-link class="btn btn-ghost">← Kembali ke Dashboard</a></div>
    </div>
  `;
}

export function pageNotFound(root: HTMLElement): void {
  root.innerHTML = `
    <div class="card stack">
      <h2>Halaman tidak ditemukan</h2>
      <a href="${ROUTES.dashboard}" data-link class="btn btn-primary">Ke Dashboard</a>
    </div>
  `;
}

export function initDashboardAndShell(root: HTMLElement): void {
  const mountShell = async (): Promise<HTMLElement> => {
    const user = await authService.getCurrentUser();
    root.innerHTML = renderAppShell(window.location.pathname, user);
    // Re-init all shell indicators after DOM is replaced
    initSyncIndicator();
    initOfflineIndicator();
    initIdleIndicator();
    initInstallPrompt();
    return root.querySelector<HTMLElement>('#page-root')!;
  };

  router.addRoute(ROUTES.dashboard, async () => {
    const pageRoot = await mountShell();
    const { renderDashboard } = await import('@pages/dashboard/index');
    await renderDashboard(pageRoot);
  }, 'Dashboard');

  router.addRoute(ROUTES.students, async () => {
    const pageRoot = await mountShell();
    const { renderStudents } = await import('@pages/students/index');
    await renderStudents(pageRoot);
  }, 'Manajemen Siswa');

  router.addRoute(ROUTES.classes, async () => {
    const pageRoot = await mountShell();
    const { renderClasses } = await import('@pages/classes/index');
    await renderClasses(pageRoot);
  }, 'Manajemen Kelas');

  router.addRoute(ROUTES.enrollment, async () => {
    const pageRoot = await mountShell();
    const { renderEnrollment } = await import('@pages/enrollment/index');
    await renderEnrollment(pageRoot);
  }, 'Face Enrollment');

  router.addRoute(ROUTES.attendance, async () => {
    const pageRoot = await mountShell();
    const { renderAttendance } = await import('@pages/attendance/index');
    await renderAttendance(pageRoot);
  }, 'Sesi Absensi');

  router.addRoute(ROUTES.reports, async () => {
    const pageRoot = await mountShell();
    const { renderReports } = await import('@pages/reports/index');
    await renderReports(pageRoot);
  }, 'Laporan');

  router.addRoute(ROUTES.settings, async () => {
    const pageRoot = await mountShell();
    const { renderSettings } = await import('@pages/settings/index');
    await renderSettings(pageRoot);
  }, 'Pengaturan');

  router.addRoute('/login', async () => {
    root.innerHTML = '<div id="page-root"></div>';
    const pageRoot = root.querySelector<HTMLElement>('#page-root')!;
    const { renderLogin } = await import('@pages/login/index');
    await renderLogin(pageRoot);
  }, 'Login');

  router.addRoute('/__setup__', async () => {
    root.innerHTML = '<div id="page-root"></div>';
    const pageRoot = root.querySelector<HTMLElement>('#page-root')!;
    const { renderSetup } = await import('@pages/login/index');
    await renderSetup(pageRoot);
  }, 'Setup Superuser (hidden)');

  router.addRoute(ROUTES.cameraTest, async () => {
    const pageRoot = await mountShell();
    const { renderCameraTest } = await import('@pages/camera-test/index');
    await renderCameraTest(pageRoot);
  }, 'Camera Test');

  router.addRoute('/face-test', async () => {
    const pageRoot = await mountShell();
    const { renderFaceTest } = await import('@pages/face-test/index');
    await renderFaceTest(pageRoot);
  }, 'Face AI Test');

  router.addRoute('/db-test', async () => {
    const pageRoot = await mountShell();
    const { renderDbTest } = await import('@pages/db-test/index');
    await renderDbTest(pageRoot);
  }, 'DB Test');

  router.addRoute('/supabase-test', async () => {
    const pageRoot = await mountShell();
    const { renderSupabaseTest } = await import('@pages/supabase-test/index');
    await renderSupabaseTest(pageRoot);
  }, 'Supabase Test');

  const placeholders: Array<[string, string]> = [
    [ROUTES.backup, 'Backup & Restore']
  ];

  for (const [path, title] of placeholders) {
    router.addRoute(path, () => renderPlaceholder(root, title), title);
  }

  router.addRoute(ROUTES.studentImport, () => renderPlaceholder(root, 'Import Siswa'), 'Import Siswa');
  router.addRoute(`${ROUTES.students}/:id`, async (params) => {
    const pageRoot = await mountShell();
    const { renderStudentDetail } = await import('@pages/students/index');
    await renderStudentDetail(pageRoot, params);
  }, 'Detail Siswa');

  router.addRoute(ROUTES.studentImport, async () => {
    const pageRoot = await mountShell();
    const { renderStudentImport } = await import('@pages/students/index');
    await renderStudentImport(pageRoot);
  }, 'Import Siswa');
  router.addRoute(`${ROUTES.attendance}/:id`, () => renderPlaceholder(root, 'Detail Absensi'), 'Detail Absensi');
}