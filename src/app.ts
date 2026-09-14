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

/**
 * Determines the correct initial route based on:
 * 1. If Supabase is NOT configured → /login (no auth possible)
 * 2. If user is NOT authenticated AND onboarding is NOT complete → /onboarding
 * 3. If user is NOT authenticated AND onboarding IS complete → /login
 * 4. If user IS authenticated AND onboarding is NOT complete → /onboarding
 * 5. If user IS authenticated AND onboarding IS complete → /dashboard
 */
function resolveInitialRoute(
  onboardingComplete: boolean,
  user: AppUser | null,
  supabaseConfigured: boolean
): string {
  // If Supabase is not configured, force login page (no auth possible)
  if (!supabaseConfigured) {
    return '/login';
  }
  // If user is not authenticated
  if (!user) {
    // If onboarding is NOT complete, send to onboarding first
    if (!onboardingComplete) {
      return ROUTES.onboarding;
    }
    // Onboarding complete but no user → need to login
    return '/login';
  }
  // User IS authenticated
  if (!onboardingComplete) {
    return ROUTES.onboarding;
  }
  // Fully authenticated + onboarding complete
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
  const onboardingComplete = hasCompletedOnboarding() && !!schoolId;
  // Check if Supabase is configured (auth may be disabled)
  const supabaseConfigured = authService.isEnabled();
  console.info(`[bootstrap] school=${schoolId ?? 'none'} onboarding=${onboardingComplete ? 'complete' : 'required'} supabase=${supabaseConfigured}`);

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

        // Determine the correct route based on auth + onboarding state
        const targetRoute = resolveInitialRoute(onboardingComplete, user, supabaseConfigured);

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
      const initialRoute = resolveInitialRoute(onboardingComplete, currentUser, supabaseConfigured);
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
