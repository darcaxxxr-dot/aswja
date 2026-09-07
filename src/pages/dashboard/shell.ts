import { ROUTES } from '@config/app';
import { router } from '@router/index';
import { installPromptService } from '@services/pwa/index';
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
        `<a href="${it.href}" data-link style="${activePath.startsWith(it.href) ? 'background:rgba(255,255,255,0.12);opacity:1;' : ''}">${it.label}</a>`
    )
    .join('');

  const offlineBadge = `<span id="offline-badge" style="display:none;background:#dc2626;color:#fff;padding:2px 8px;border-radius:8px;font-size:11px;margin-right:6px;">OFFLINE</span>`;
  const syncBadge = `<span id="sync-badge" title="Klik untuk detail" style="background:rgba(255,255,255,0.12);color:#fff;padding:4px 10px;border-radius:8px;font-size:11px;margin-right:6px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;"><span id="sync-dot" style="width:8px;height:8px;border-radius:50%;background:#94a3b8;"></span><span id="sync-label">Sync: —</span></span>`;
  const idleBadge = `<span id="idle-badge" title="Sesi idle, auto-logout dalam 30 menit" style="background:rgba(255,255,255,0.06);color:#94a3b8;padding:2px 8px;border-radius:8px;font-size:11px;margin-right:6px;">⏱ —</span>`;
  const userBadge = user
    ? `<span id="user-badge" title="${user.email ?? ''} · ${ROLE_LABELS[user.role]}${user.subRole ? ' · ' + SUBROLE_LABELS[user.subRole] : ''}" style="background:rgba(255,255,255,0.12);color:#fff;padding:2px 8px;border-radius:8px;font-size:11px;margin-right:6px;cursor:pointer;">${user.displayName} · ${ROLE_LABELS[user.role]}${user.subRole ? '/' + SUBROLE_LABELS[user.subRole] : ''}</span>`
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
      <h1>SmartFace Attendance</h1>
      <nav class="app-nav">${nav}</nav>
      <div class="row" style="margin-left:auto;">${offlineBadge}${syncBadge}${idleBadge}${userBadge}${installBtn}</div>
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
  installPromptService.onAvailable(() => {
    if (!installPromptService.isInstalled()) btn.style.display = 'inline-flex';
  });
  btn.addEventListener('click', async () => {
    const result = await installPromptService.promptInstall();
    if (result === 'accepted') btn.style.display = 'none';
  });
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
        <div style="color:#94a3b8;">School ID</div>
        <div style="font-family:monospace;font-size:11px;word-break:break-all;">${schoolId}</div>
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
      <div id="sync-panel-log" style="margin-top:10px;max-height:120px;overflow:auto;font-size:10px;font-family:monospace;color:#94a3b8;background:rgba(0,0,0,0.3);border-radius:6px;padding:6px;display:none;"></div>
    `;

    const btnNow = document.getElementById('btn-sync-now');
    const btnPull = document.getElementById('btn-pull-only');
    const logEl = document.getElementById('sync-panel-log');

    const appendLog = (msg: string) => {
      if (!logEl) return;
      logEl.style.display = 'block';
      const ts = formatTime(Date.now());
      logEl.innerHTML = `[${ts}] ${escapeHtml(msg)}\n` + logEl.innerHTML;
    };

    btnNow?.addEventListener('click', async () => {
      isSyncing = true;
      if (lastStatus) renderBadge(lastStatus);
      appendLog('Starting full sync (push + pull)...');
      try {
        const r = await syncService.runFullSync();
        appendLog(`Done: pushed=${JSON.stringify(r.pushed)} pulled=${JSON.stringify(r.pulled)} ok=${r.ok} ${r.durationMs}ms`);
        if (!r.ok && r.errors.length) appendLog(`Errors: ${r.errors.join('; ')}`);
      } catch (e) {
        appendLog(`Failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
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
      } catch (e) {
        appendLog(`Pull failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
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
  const shellWithUser = async () => {
    const user = await authService.getCurrentUser();
    return renderAppShell(window.location.pathname, user);
  };

  router.addRoute(ROUTES.dashboard, async () => {
    root.innerHTML = await shellWithUser();
    const pageRoot = root.querySelector<HTMLElement>('#page-root')!;
    const { renderDashboard } = await import('@pages/dashboard/index');
    await renderDashboard(pageRoot);
  }, 'Dashboard');

  router.addRoute(ROUTES.students, async () => {
    root.innerHTML = await shellWithUser();
    const pageRoot = root.querySelector<HTMLElement>('#page-root')!;
    const { renderStudents } = await import('@pages/students/index');
    await renderStudents(pageRoot);
  }, 'Manajemen Siswa');

  router.addRoute(ROUTES.classes, async () => {
    root.innerHTML = await shellWithUser();
    const pageRoot = root.querySelector<HTMLElement>('#page-root')!;
    const { renderClasses } = await import('@pages/classes/index');
    await renderClasses(pageRoot);
  }, 'Manajemen Kelas');

  router.addRoute(ROUTES.enrollment, async () => {
    root.innerHTML = await shellWithUser();
    const pageRoot = root.querySelector<HTMLElement>('#page-root')!;
    const { renderEnrollment } = await import('@pages/enrollment/index');
    await renderEnrollment(pageRoot);
  }, 'Face Enrollment');

  router.addRoute(ROUTES.attendance, async () => {
    root.innerHTML = await shellWithUser();
    const pageRoot = root.querySelector<HTMLElement>('#page-root')!;
    const { renderAttendance } = await import('@pages/attendance/index');
    await renderAttendance(pageRoot);
  }, 'Sesi Absensi');

  router.addRoute(ROUTES.reports, async () => {
    root.innerHTML = await shellWithUser();
    const pageRoot = root.querySelector<HTMLElement>('#page-root')!;
    const { renderReports } = await import('@pages/reports/index');
    await renderReports(pageRoot);
  }, 'Laporan');

  router.addRoute(ROUTES.settings, async () => {
    root.innerHTML = await shellWithUser();
    const pageRoot = root.querySelector<HTMLElement>('#page-root')!;
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
    root.innerHTML = await shellWithUser();
    const pageRoot = root.querySelector<HTMLElement>('#page-root')!;
    const { renderCameraTest } = await import('@pages/camera-test/index');
    await renderCameraTest(pageRoot);
  }, 'Camera Test');

  router.addRoute('/face-test', async () => {
    root.innerHTML = await shellWithUser();
    const pageRoot = root.querySelector<HTMLElement>('#page-root')!;
    const { renderFaceTest } = await import('@pages/face-test/index');
    await renderFaceTest(pageRoot);
  }, 'Face AI Test');

  router.addRoute('/db-test', async () => {
    root.innerHTML = await shellWithUser();
    const pageRoot = root.querySelector<HTMLElement>('#page-root')!;
    const { renderDbTest } = await import('@pages/db-test/index');
    await renderDbTest(pageRoot);
  }, 'DB Test');

  router.addRoute('/supabase-test', async () => {
    root.innerHTML = await shellWithUser();
    const pageRoot = root.querySelector<HTMLElement>('#page-root')!;
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
    root.innerHTML = await shellWithUser();
    const pageRoot = root.querySelector<HTMLElement>('#page-root')!;
    const { renderStudentDetail } = await import('@pages/students/index');
    await renderStudentDetail(pageRoot, params);
  }, 'Detail Siswa');

  router.addRoute(ROUTES.studentImport, async () => {
    root.innerHTML = await shellWithUser();
    const pageRoot = root.querySelector<HTMLElement>('#page-root')!;
    const { renderStudentImport } = await import('@pages/students/index');
    await renderStudentImport(pageRoot);
  }, 'Import Siswa');
  router.addRoute(`${ROUTES.attendance}/:id`, () => renderPlaceholder(root, 'Detail Absensi'), 'Detail Absensi');
}