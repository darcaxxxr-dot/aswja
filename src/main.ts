import { bootstrap } from './app';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Root element #app tidak ditemukan di index.html.');
}

// Hide initial splash — runs immediately after module loads
function hideSplash() {
  const splash = document.getElementById('initial-splash');
  if (splash) splash.classList.add('hidden');
}

// Hide splash as soon as app boot completes
void bootstrap(root).then(() => {
  hideSplash();
});

// Safety: hide splash after 4s even if bootstrap hangs (e.g. if auth/sync services fail to load)
setTimeout(hideSplash, 4000);