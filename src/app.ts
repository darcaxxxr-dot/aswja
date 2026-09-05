import './styles/global.css';
import { router } from '@router/index';
import { initDashboardAndShell, pageNotFound, initInstallPrompt, initOfflineIndicator, initSyncIndicator, initIdleIndicator } from '@pages/dashboard/shell';
import { getOrCreateDeviceId, getOrCreateSchoolId } from '@utils/device';
import { databaseService } from '@services/database/index';
import { syncService } from '@services/sync/index';
import { authService } from '@services/auth/index';
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

  void databaseService.open().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[bootstrap] DB open failed: ${msg}`);
  });

  authService.init();

  initDashboardAndShell(rootElement);
  router.init(rootElement, () => pageNotFound(rootElement));

  initInstallPrompt();
  initOfflineIndicator();
  initIdleIndicator();
  initSyncIndicator();

  let autoSyncStarted = false;
  const startAutoSyncOnce = () => {
    if (autoSyncStarted) return;
    autoSyncStarted = true;
    void syncService.startAutoSync(30000).catch((err: unknown) => {
      console.warn(`[bootstrap] auto-sync start failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  };

  authService.onAuthStateChange((user) => {
    const path = window.location.pathname;
    if (!user && isProtectedPath(path)) {
      window.history.replaceState({}, '', '/login');
      router.navigate('/login');
    } else if (user && (path === '/login' || path === '/')) {
      window.history.replaceState({}, '', '/dashboard');
      router.navigate('/dashboard');
    }
    if (user) {
      startAutoSyncOnce();
    }
  });

  if (window.location.pathname === '/' || window.location.pathname === '') {
    window.history.replaceState({}, '', '/login');
  }
}