import './styles/global.css';
import { router } from '@router/index';
import { initDashboardAndShell, pageNotFound, initInstallPrompt, initOfflineIndicator, initSyncIndicator } from '@pages/dashboard/shell';
import { hasCompletedOnboarding, isSchoolProvisioningPending, promoteLegacySchoolOverride, readActiveSchoolId, clearSchoolProvisioningPending } from '@utils/device';
import { databaseService } from '@services/database/index';
import { authService, type AppUser } from '@services/auth/index';
import { syncService } from '@services/sync/index';
import { provisionCurrentSchool } from '@services/sync/provisioningService';
import { BRAND } from '@config/brand';
import { ROUTES } from '@config/app';

const PROTECTED_PATHS = ['/dashboard', '/students', '/enrollment', '/classes', '/attendance', '/reports', '/settings', '/supabase-test', '/face-test', '/db-test', '/camera-test'];

function isProtectedPath(path: string): boolean {
  if (path === '/login' || path === '/' || path === '' || path === '/__setup__') return false;
  return PROTECTED_PATHS.some((p) => path === p || path.startsWith(p + '/'));
}

export function bootstrap(rootElement: HTMLElement): Promise<void> {
  document.title = BRAND.fullName;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute('content', BRAND.themeColor);

  promoteLegacySchoolOverride();
  // Recover from pending school link replacement if any
  void (async () => {
    const { recoverPendingSchoolReplacement } = await import('@services/sync/qrLinkingService');
    const recoverySuccess = await recoverPendingSchoolReplacement();
    if (recoverySuccess) {
      // If recovery was successful, reload to get fresh state
      window.location.reload();
    }
  })();

  const schoolId = readActiveSchoolId();
  const onboardingComplete = hasCompletedOnboarding() && !!schoolId;
  console.info(`[bootstrap] school=${schoolId ?? 'none'} onboarding=${onboardingComplete ? 'complete' : 'required'}`);

  // Critical: open DB immediately (fast, required for app)
  void databaseService.open().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[bootstrap] DB open failed: ${msg}`);
  });

  // Resolve once auth, shell + router are ready.
  return new Promise<void>((resolve) => {
    console.info('[bootstrap] phase 1: init auth, shell + router');
    // Restore the Supabase session before rendering protected pages. This keeps
    // the header's profile/logout state stable across full page reloads.
    authService.init();
    void authService.waitForInitialSession().then(() => {
      const handleAuthStateChange = (user: AppUser | null) => {
        if (!authService.isInitialSessionResolved()) return;
        const path = window.location.pathname;
        if (!onboardingComplete && path !== ROUTES.onboarding) {
          window.history.replaceState({}, '', ROUTES.onboarding);
          router.navigate(ROUTES.onboarding);
        } else if (!user && isProtectedPath(path)) {
          window.history.replaceState({}, '', '/login');
          router.navigate('/login');
        } else if (user && (path === '/login' || path === '/')) {
          window.history.replaceState({}, '', '/dashboard');
          router.navigate('/dashboard');
        }
      };

      authService.onAuthStateChange(handleAuthStateChange);
      initDashboardAndShell(rootElement);
      router.init(rootElement, () => pageNotFound(rootElement));
      console.info('[bootstrap] shell initialized');
      initInstallPrompt();
      initOfflineIndicator();

      if (!onboardingComplete && window.location.pathname !== ROUTES.onboarding) {
        window.history.replaceState({}, '', ROUTES.onboarding);
      } else if ((window.location.pathname === '/' || window.location.pathname === '') && !authService.isAuthenticated()) {
        window.history.replaceState({}, '', '/login');
      }

      // Defer this to next tick to let DOM settle first
      queueMicrotask(() => {
        console.info('[bootstrap] phase 1 complete, dispatching app-ready');
        // Notify that app is fully booted — used by initial-splash in index.html
        window.dispatchEvent(new Event('app-ready'));
        resolve();
      });
    });
  }).then(async (): Promise<void> => {
      console.info('[bootstrap] phase 2: init sync');
      initSyncIndicator();

      const bootSchoolId = readActiveSchoolId();
      if (!hasCompletedOnboarding() || !bootSchoolId) {
        console.info('[bootstrap] Auto-sync skipped until onboarding is complete');
        return;
      }

      // Self-heal: bind the authenticated profile to this device's School ID
      // (also creates the school row in the cloud). Without this, authenticated
      // RLS policies reject all pushes with 42501 when profiles.school_id is
      // NULL or points to a different school.
      if (authService.isEnabled() && authService.isAuthenticated()) {
        const prov = await provisionCurrentSchool(bootSchoolId);
        if (prov.ok) {
          clearSchoolProvisioningPending();
          console.info(`[bootstrap] school provisioning ok (${prov.status})`);
        } else {
          console.warn(`[bootstrap] school provisioning unresolved: ${prov.status}: ${prov.message}`);
        }
      }

      if (isSchoolProvisioningPending()) {
        console.info('[bootstrap] Auto-sync skipped until school provisioning is complete');
        return;
      }

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
          await syncService.runFullSync();
          console.info('[bootstrap] Initial sync completed');
        } catch (err: unknown) {
          console.warn(`[bootstrap] initial sync failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    });
}
