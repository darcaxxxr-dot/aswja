import { bootstrap } from './app';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Root element #app tidak ditemukan di index.html.');
}

// Hide initial splash function — called as soon as possible
function hideSplash() {
  const splash = document.getElementById('initial-splash');
  if (splash) {
    splash.classList.add('hidden');
    // Remove from DOM after transition (200ms)
    setTimeout(() => splash.remove(), 300);
  }
}

// Wrap global errors during boot to ensure splash never gets stuck
window.addEventListener('error', (e) => {
  console.error('[window error]', e.error ?? e.message);
  hideSplash();
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandled rejection]', e.reason);
  hideSplash();
});

// Start bootstrap (don't await — let the splash hide via timeout if needed)
try {
  const result = bootstrap(root);
  // bootstrap returns Promise<void>; handle both sync & async completion
  if (result && typeof (result as Promise<unknown>).then === 'function') {
    void (result as Promise<void>)
      .then(() => {
        hideSplash();
      })
      .catch((err: unknown) => {
        console.error('[bootstrap] failed:', err);
        hideSplash();
      });
  } else {
    // bootstrap returned synchronously (shouldn't happen now, but safety)
    hideSplash();
  }
} catch (err: unknown) {
  console.error('[bootstrap] sync throw:', err);
  hideSplash();
}

// ABSOLUTE SAFETY: hide splash after 3s no matter what
setTimeout(hideSplash, 3000);