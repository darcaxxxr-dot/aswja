import { authService, AuthError } from '@services/auth/index';
import { BRAND } from '@config/brand';
import { ROUTES } from '@config/app';

export async function renderLogin(root: HTMLElement): Promise<void> {
  let bgEl = document.querySelector('.aswja-bg') as HTMLElement | null;
  if (!bgEl) {
    bgEl = document.createElement('div');
    bgEl.className = 'aswja-bg';
    bgEl.innerHTML = '<div class="blob blob-1"></div>';
    document.body.insertBefore(bgEl, document.body.firstChild);
  }
  bgEl.style.display = 'block';

  root.innerHTML = `
    <div class="stack" style="max-width:460px;margin:48px auto;padding:0 16px 32px;position:relative;z-index:1;">
      <div style="text-align:center;margin-bottom:20px;">
        <h1 class="aswja-brand-title">${BRAND.name}</h1>
        <p class="aswja-brand-subtitle">${BRAND.fullName.replace(BRAND.name + ' - ', '')}</p>
      </div>

      <div class="glass stack" style="gap:14px;">
        <div class="glass-icon" id="brand-icon">
          <img src="${BRAND.icon}" alt="${BRAND.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
          <div class="glass-icon-fallback" style="display:none;">${BRAND.name.charAt(0)}</div>
        </div>

        <p class="aswja-tagline" style="text-align:center;margin:0 0 4px;">
          Silahkan masuk untuk memulai.
        </p>

        ${authService.isEnabled()
          ? ''
          : `<div class="glass-banner">⚠ Supabase tidak dikonfigurasi. Set <code>.env</code> atau Settings → Supabase untuk mengaktifkan login.</div>`
        }

        <div id="idle-banner" class="glass-banner glass-banner-error" style="display:none;">
          ⏰ Session expired. Silakan login ulang.
        </div>

        <form id="form" class="stack" style="gap:10px;">
          <input id="f-email" type="email" placeholder="Email" required autocomplete="email" class="glass-input" style="padding:12px;border-radius:10px;" />
          <input id="f-password" type="password" placeholder="Password" required minlength="6" autocomplete="current-password" class="glass-input" style="padding:12px;border-radius:10px;" />
          <button type="submit" class="btn-aswja" id="btn-submit" ${authService.isEnabled() ? '' : 'disabled'} style="width:100%;">
            Masuk
          </button>
        </form>

        <div id="msg" class="glass-message"></div>
      </div>

      <p class="aswja-credit">
        Crafted with care by <strong>${BRAND.credit.team}</strong>
      </p>
    </div>
  `;

  const form = root.querySelector<HTMLFormElement>('#form')!;
  const msg = root.querySelector<HTMLDivElement>('#msg')!;
  const submit = root.querySelector<HTMLButtonElement>('#btn-submit')!;
  const idleBanner = root.querySelector<HTMLDivElement>('#idle-banner')!;

  const reason = authService.consumeLogoutReason();
  if (reason === 'idle') {
    idleBanner.style.display = 'block';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = 'Memproses...';
    msg.style.color = 'var(--color-text-muted)';
    submit.disabled = true;
    const email = root.querySelector<HTMLInputElement>('#f-email')!.value.trim();
    const password = root.querySelector<HTMLInputElement>('#f-password')!.value;
    try {
      const user = await authService.signIn(email, password);
      msg.innerHTML = `✓ Masuk sebagai <strong>${user.displayName}</strong>`;
      msg.style.color = 'var(--aswja-primary-dark)';
      setTimeout(() => { window.location.pathname = ROUTES.dashboard; }, 600);
    } catch (err: unknown) {
      const m = err instanceof AuthError ? err.message : (err as Error).message;
      msg.innerHTML = `✗ ${m}`;
      msg.style.color = '#dc2626';
      submit.disabled = false;
    }
  });
}

export function unmountLogin(): void {
  const bg = document.querySelector('.aswja-bg') as HTMLElement | null;
  if (bg) bg.style.display = 'none';
}