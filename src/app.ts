import './styles/global.css';
import { router } from '@router/index';
import { initDashboardAndShell, pageNotFound, initInstallPrompt, initOfflineIndicator, initSyncIndicator } from '@pages/dashboard/shell';
import { hasCompletedOnboarding, isSchoolProvisioningPending, markOnboardingCompleted, promoteLegacySchoolOverride, readActiveSchoolId, clearSchoolProvisioningPending } from '@utils/device';
import { databaseService } from '@services/database/index';
import { authService, type AppUser } from '@services/auth/index';
import { syncService } from '@services/sync/index';
import { provisionCurrentSchool } from '@services/sync/provisioningService';
import { BRAND } from '@config/brand';
import { ROUTES } from '@config/app';

/**
 * Determines the correct initial route based on:
 * 1. If Supabase is NOT configured → /login (no auth possible)
 * 2. If user is NOT authenticated → /login
 * 3. If user IS authenticated AND device has school ID AND onboarding complete → /dashboard
 * 4. Otherwise → /onboarding
 */
function resolveInitialRoute(
  user: AppUser | null,
  supabaseConfigured: boolean
): string {
  if (!supabaseConfigured) {
    return '/login';
  }
  if (!user) {
    return '/login';
  }
  // Device must have a school ID AND onboarding must be marked complete
  const deviceSchoolId = readActiveSchoolId();
  if (!deviceSchoolId || !hasCompletedOnboarding()) {
    return ROUTES.onboarding;
  }
  return ROUTES.dashboard;
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
      window.location.reload();
    }
  })();

  const schoolId = readActiveSchoolId();
  // Check if Supabase is configured (auth may be disabled)
  const supabaseConfigured = authService.isEnabled();
  console.info(`[bootstrap] school=${schoolId ?? 'none'} supabase=${supabaseConfigured}`);

  // Critical: open DB immediately (fast, required for app)
  void databaseService.open().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[bootstrap] DB open failed: ${msg}`);
  });

  // Resolve once auth, shell + router are ready.
  return new Promise<void>((resolve) => {
    console.info('[bootstrap] phase 1: init auth, shell + router');
    authService.init();
    void authService.waitForInitialSession().then(async () => {
      const handleAuthStateChange = (user: AppUser | null) => {
        if (!authService.isInitialSessionResolved()) return;
        const path = window.location.pathname;

        // Sync user's schoolId from auth metadata to localStorage for consistency
        if (user?.schoolId) {
          const currentSchoolId = readActiveSchoolId();
          if (!currentSchoolId) {
            localStorage.setItem('sf_school_id', user.schoolId);
          } else if (currentSchoolId !== user.schoolId) {
            // User's metadata schoolId differs from device's — update device
            localStorage.setItem('sf_school_id', user.schoolId);
          }
          if (!hasCompletedOnboarding()) {
            markOnboardingCompleted();
          }
        }

        // Determine the correct route based on auth + device school ID
        const targetRoute = resolveInitialRoute(user, supabaseConfigured);

        // Only navigate if the target is different from current path
        if (targetRoute !== path) {
          window.history.replaceState({}, '', targetRoute);
          router.navigate(targetRoute);
        }
      };

      authService.onAuthStateChange(handleAuthStateChange);
      initDashboardAndShell(rootElement);
      router.init(rootElement, () => pageNotFound(rootElement));
      console.info('[bootstrap] shell initialized');
      initInstallPrompt();
      initOfflineIndicator();

      // Initial route enforcement on first load
      const initialPath = window.location.pathname;
      const currentUserPromise = authService.getCurrentUser();
      const currentUser = await currentUserPromise;
      const initialRoute = resolveInitialRoute(currentUser, supabaseConfigured);
      if (initialRoute !== initialPath) {
        window.history.replaceState({}, '', initialRoute);
      }

      // Defer this to next tick to let DOM settle first
      queueMicrotask(() => {
        console.info('[bootstrap] phase 1 complete, dispatching app-ready');
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
