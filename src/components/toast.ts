export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastOptions {
  durationMs?: number;
}

const TOAST_STYLES = {
  success: { border: '#10b981', icon: '✓' },
  error: { border: '#dc2626', icon: '✗' },
  warning: { border: '#f59e0b', icon: '⚠' },
  info: { border: '#60a5fa', icon: 'ℹ' }
} as const;

const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 3500,
  info: 3500,
  warning: 5000,
  error: 6000
};

const MAX_VISIBLE = 4;
const DEDUPE_WINDOW_MS = 2500;

let container: HTMLElement | null = null;
let stylesInjected = false;
let lastToast = { message: '', at: 0 };

function ensureStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'toast-styles';
  style.textContent = `
    .toast-container {
      position: fixed;
      top: calc(env(safe-area-inset-top, 0px) + 12px);
      right: 12px;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: min(360px, calc(100vw - 24px));
      pointer-events: none;
    }
    .toast-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      background: rgba(15, 23, 42, 0.92);
      color: #f8fafc;
      border-radius: 12px;
      padding: 10px 12px;
      font-size: 13px;
      line-height: 1.45;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(8px);
      border-left: 4px solid #60a5fa;
      pointer-events: auto;
      animation: toast-slide-in 0.25s ease-out;
      word-break: break-word;
    }
    .toast-item.toast-leaving {
      animation: toast-fade-out 0.25s ease-in forwards;
    }
    .toast-icon { flex: none; font-weight: 700; }
    .toast-message { flex: 1; }
    .toast-close {
      flex: none;
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
      padding: 0 2px;
    }
    @keyframes toast-slide-in {
      from { opacity: 0; transform: translateX(24px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes toast-fade-out {
      from { opacity: 1; transform: translateX(0); }
      to { opacity: 0; transform: translateX(24px); }
    }
  `;
  document.head.appendChild(style);
}

function ensureContainer(): HTMLElement {
  if (!container || !container.isConnected) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

function dismiss(el: HTMLElement): void {
  if (el.classList.contains('toast-leaving')) return;
  el.classList.add('toast-leaving');
  window.setTimeout(() => el.remove(), 260);
}

/**
 * Shows a transient notification. Identical messages within a short window
 * are ignored so a manual action and a status-listener event firing for the
 * same sync result do not produce duplicate toasts.
 */
export function showToast(message: string, type: ToastType = 'info', options: ToastOptions = {}): void {
  if (typeof document === 'undefined') return;

  const now = Date.now();
  if (message === lastToast.message && now - lastToast.at < DEDUPE_WINDOW_MS) return;
  lastToast = { message, at: now };

  ensureStyles();
  const host = ensureContainer();

  while (host.children.length >= MAX_VISIBLE) {
    host.firstElementChild?.remove();
  }

  const { border, icon } = TOAST_STYLES[type];
  const el = document.createElement('div');
  el.className = 'toast-item';
  el.style.borderLeftColor = border;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const iconEl = document.createElement('span');
  iconEl.className = 'toast-icon';
  iconEl.style.color = border;
  iconEl.textContent = icon;

  const msgEl = document.createElement('span');
  msgEl.className = 'toast-message';
  msgEl.textContent = message;

  const closeEl = document.createElement('button');
  closeEl.className = 'toast-close';
  closeEl.textContent = '×';
  closeEl.addEventListener('click', () => dismiss(el));

  el.append(iconEl, msgEl, closeEl);
  host.appendChild(el);

  const duration = options.durationMs ?? DEFAULT_DURATION[type];
  window.setTimeout(() => dismiss(el), duration);
}
