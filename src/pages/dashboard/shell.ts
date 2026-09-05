import { ROUTES } from '@config/app';
import { router } from '@router/index';
import { installPromptService } from '@services/pwa/index';
import { syncService } from '@services/sync/index';
import { authService, type AppUser } from '@services/auth/index';

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
  const syncBadge = `<span id="sync-badge" title="Sync status" style="background:rgba(255,255,255,0.12);color:#fff;padding:2px 8px;border-radius:8px;font-size:11px;margin-right:6px;cursor:pointer;">Sync: —</span>`;
  const userBadge = user
    ? `<span id="user-badge" title="${user.email ?? ''} · ${user.role}" style="background:rgba(255,255,255,0.12);color:#fff;padding:2px 8px;border-radius:8px;font-size:11px;margin-right:6px;">${user.displayName} · ${user.role}</span>`
    : `<a id="user-badge" href="/login" data-link style="background:rgba(255,255,255,0.12);color:#fff;padding:2px 8px;border-radius:8px;font-size:11px;margin-right:6px;text-decoration:none;">Login</a>`;
  const installBtn = `<button id="btn-install" class="btn" style="display:none;background:#16a34a;color:#fff;padding:6px 10px;min-height:32px;font-size:13px;">Install App</button>`;

  return `
    <header class="app-header">
      <h1>SmartFace Attendance</h1>
      <nav class="app-nav">${nav}</nav>
      <div class="row" style="margin-left:auto;">${offlineBadge}${syncBadge}${userBadge}${installBtn}</div>
    </header>
    <main class="app-main" id="page-root"></main>
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

export function initSyncIndicator(): void {
  const badge = document.getElementById('sync-badge');
  if (!badge) return;
  const update = (s: { online: boolean; pendingPush: number; lastSyncAt: number; lastError?: string }) => {
    if (!badge) return;
    let label = '';
    if (!s.online) label = 'Sync: offline';
    else if (s.lastError) label = `Sync: error`;
    else if (s.pendingPush > 0) label = `Sync: ${s.pendingPush} pending`;
    else if (s.lastSyncAt) label = `Sync: ✓ ${new Date(s.lastSyncAt).toLocaleTimeString('id-ID')}`;
    else label = 'Sync: idle';
    badge.textContent = label;
    badge.title = s.lastError
      ? `Error: ${s.lastError}\nLast sync: ${s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString('id-ID') : 'never'}\nPending: ${s.pendingPush}`
      : `Last sync: ${s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString('id-ID') : 'never'}\nPending: ${s.pendingPush}`;
    badge.style.background = s.lastError ? '#dc2626' : 'rgba(255,255,255,0.12)';
  };
  syncService.onStatusChange(update);
  badge.addEventListener('click', async () => {
    badge.textContent = 'Sync: ...';
    try {
      const r = await syncService.runFullSync();
      badge.textContent = r.ok ? `Sync: ✓ (${r.durationMs}ms)` : 'Sync: error';
    } catch {
      badge.textContent = 'Sync: error';
    }
  });
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
  router.addRoute(`${ROUTES.students}/:id`, () => renderPlaceholder(root, 'Detail Siswa'), 'Detail Siswa');
  router.addRoute(`${ROUTES.attendance}/:id`, () => renderPlaceholder(root, 'Detail Absensi'), 'Detail Absensi');
}