import './styles/global.css';
import { router } from '@router/index';
import { initDashboardAndShell, pageNotFound, initInstallPrompt, initOfflineIndicator, initSyncIndicator } from '@pages/dashboard/shell';
import { getOrCreateDeviceId, getOrCreateSchoolId } from '@utils/device';
import { databaseService } from '@services/database/index';
import { syncService } from '@services/sync/index';

export function bootstrap(rootElement: HTMLElement): void {
  const deviceId = getOrCreateDeviceId();
  const schoolId = getOrCreateSchoolId();
  console.info(`[bootstrap] device=${deviceId} school=${schoolId}`);

  void databaseService.open().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[bootstrap] DB open failed: ${msg}`);
  });

  initDashboardAndShell(rootElement);
  router.init(rootElement, () => pageNotFound(rootElement));
  initInstallPrompt();
  initOfflineIndicator();
  initSyncIndicator();

  void syncService.startAutoSync(30000).catch((err: unknown) => {
    console.warn(`[bootstrap] auto-sync start failed: ${err instanceof Error ? err.message : String(err)}`);
  });
}