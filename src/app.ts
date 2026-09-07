import './styles/global.css';
import { router } from '@router/index';
import { initDashboardAndShell, pageNotFound, initInstallPrompt, initOfflineIndicator, initSyncIndicator } from '@pages/dashboard/shell';
import { getOrCreateDeviceId, getOrCreateSchoolId } from '@utils/device';
import { databaseService } from '@services/database/index';
import { BRAND } from '@config/brand';

const PROTECTED_PATHS = ['/dashboard', '/students', '/enrollment', '/classes', '/attendance', '/reports', '/settings', '/supabase-test', '/face-test', '/db-test', '/camera-test'];

function isProtectedPath(path: string): boolean {
  if (path === '/login' || path === '/' || path === '' || path === '/__setup__') return false;
  return PROTECTED_PATHS.some((p) => path === p || path.startsWith(p + '/'));
}

export function bootstrap(rootElement: HTMLElement): void {
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

  // Lazy-load auth + sync services after first paint to reduce main bundle blocking time
  void (async () => {
    try {
      const [{ authService }, { syncService }] = await Promise.all([
        import('@services/auth/index'),
        import('@services/sync/index')
      ]);

      authService.init();
      initSyncIndicator();

      // Start auto-sync on app boot
      try {
        await syncService.startAutoSync(30000);
        console.info('[bootstrap] Auto-sync started (30s interval)');
      } catch (err: unknown) {
        console.warn(`[bootstrap] auto-sync start failed: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Initial pull from Supabase on startup if online
      if (navigator.onLine) {
        try {
          await syncService.runFullSync();
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
    } catch (err: unknown) {
      console.error(`[bootstrap] critical services load failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  })();

  // Critical: shell + router must be available immediately for navigation
  initDashboardAndShell(rootElement);
  router.init(rootElement, () => pageNotFound(rootElement));
  initInstallPrompt();
  initOfflineIndicator();

  if (window.location.pathname === '/' || window.location.pathname === '') {
    window.history.replaceState({}, '', '/login');
  }

  // Notify that app is fully booted — used by initial-splash in index.html
  window.dispatchEvent(new Event('app-ready'));
}