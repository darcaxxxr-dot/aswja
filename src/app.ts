import './styles/global.css';
import { router } from '@router/index';
import { initDashboardAndShell, pageNotFound, initInstallPrompt, initOfflineIndicator, initSyncIndicator } from '@pages/dashboard/shell';
import { getOrCreateDeviceId, getOrCreateSchoolId } from '@utils/device';
import { databaseService } from '@services/database/index';
import { authService } from '@services/auth/index';
import { syncService } from '@services/sync/index';
import { BRAND } from '@config/brand';

const PROTECTED_PATHS = ['/dashboard', '/students', '/enrollment', '/classes', '/attendance', '/reports', '/settings', '/supabase-test', '/face-test', '/db-test', '/camera-test'];

function isProtectedPath(path: string): boolean {
  if (path === '/login' || path === '/' || path === '' || path === '/__setup__') return false;
  return PROTECTED_PATHS.some((p) => path === p || path.startsWith(p + '/'));
}

export function bootstrap(rootElement: HTMLElement): Promise<void> {
  document.title = BRAND.fullName;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute('content', BRAND.themeColor);

  const deviceId = getOrCreateDeviceId();
  const schoolId = getOrCreateSchoolId();
  console.info(`[bootstrap] device=${deviceId} school=${schoolId}`);

  // Critical: open DB immediately (fast, required for app)
  void databaseService.open().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[bootstrap] DB open failed: ${msg}`);
  });

  // Resolve once shell + router are ready (NOT waiting for auth/sync which are lazy)
  return new Promise<void>((resolve) => {
    console.info('[bootstrap] phase 1: init shell + router');
    // Critical: shell + router must be available immediately for navigation
    initDashboardAndShell(rootElement);
    console.info('[bootstrap] shell initialized');
    router.init(rootElement, () => pageNotFound(rootElement));
    console.info('[bootstrap] router initialized');
    initInstallPrompt();
    initOfflineIndicator();

    if (window.location.pathname === '/' || window.location.pathname === '') {
      window.history.replaceState({}, '', '/login');
    }

    // Defer this to next tick to let DOM settle first
    queueMicrotask(() => {
      console.info('[bootstrap] phase 1 complete, dispatching app-ready');
      // Notify that app is fully booted — used by initial-splash in index.html
      window.dispatchEvent(new Event('app-ready'));
      resolve();
    });
  }).then((): void => {
    console.info('[bootstrap] phase 2: init auth + sync');
    authService.init();
    initSyncIndicator();

    // Start auto-sync on app boot
    try {
      syncService.startAutoSync(30000);
      console.info('[bootstrap] Auto-sync started (30s interval)');
    } catch (err: unknown) {
      console.warn(`[bootstrap] auto-sync start failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Initial pull from Supabase on startup if online
    if (navigator.onLine) {
      try {
        syncService.runFullSync();
        console.info('[bootstrap] Initial sync completed');
      } catch (err: unknown) {
        console.warn(`[bootstrap] initial sync failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    authService.onAuthStateChange(async (user) => {
      if (!authService.isInitialSessionResolved()) return;
      const path = window.location.pathname;
      if (!user && isProtectedPath(path)) {
        window.history.replaceState({}, '', '/login');
        router.navigate('/login');
      } else if (user && (path === '/login' || path === '/')) {
        window.history.replaceState({}, '', '/dashboard');
        router.navigate('/dashboard');
      }
    });
  });
}