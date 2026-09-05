import { authService, AuthError, ROLE_LABELS, SUBROLE_LABELS, type UserSubRole } from '@services/auth/index';
import { ROUTES } from '@config/app';

type Mode = 'login' | 'signup-superuser';

export async function renderLogin(root: HTMLElement): Promise<void> {
  let mode: Mode = 'login';

  const render = () => {
    const isSignup = mode === 'signup-superuser';
    root.innerHTML = `
      <div class="stack" style="max-width:460px;margin:60px auto;padding:0 16px;">
        <div class="card stack">
          <div style="text-align:center;">
            <div style="font-size:36px;margin-bottom:4px;">🔐</div>
            <h2 style="margin:0;">${isSignup ? 'Daftar Superuser' : 'Login'}</h2>
            <p class="muted" style="margin:4px 0 0;font-size:13px;">
              ${isSignup
                ? 'Hanya untuk setup awal. Akun lain dibuat via Settings → Users setelah login sebagai superuser.'
                : 'SmartFace Attendance — Madrasah Aliyah Aswaja'}
            </p>
          </div>

          ${authService.isEnabled()
            ? ''
            : `<div style="background:#fef3c7;padding:10px;border-radius:8px;font-size:13px;color:#92400e;">⚠ Supabase tidak dikonfigurasi. Set <code>.env</code> atau Settings → Supabase untuk mengaktifkan login.</div>`
          }

          <div id="idle-banner" style="display:none;background:#fee2e2;padding:10px;border-radius:8px;font-size:13px;color:#991b1b;">
            ⏰ Session expired. Silakan login ulang.
          </div>

          <form id="form" class="stack" style="gap:10px;">
            ${isSignup ? `
              <input id="f-name" type="text" placeholder="Nama tampilan" required style="padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
              <select id="f-subrole" style="padding:10px;border:1px solid var(--color-border);border-radius:8px;">
                <option value="KEPALA_MADRASAH">${SUBROLE_LABELS.KEPALA_MADRASAH}</option>
                <option value="WAKAMAD_KEASRAMAAN">${SUBROLE_LABELS.WAKAMAD_KEASRAMAAN}</option>
                <option value="GURU_BINA_ASRAMA">${SUBROLE_LABELS.GURU_BINA_ASRAMA}</option>
              </select>
            ` : ''}
            <input id="f-email" type="email" placeholder="Email" required autocomplete="email" style="padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
            <input id="f-password" type="password" placeholder="Password" required minlength="6" autocomplete="current-password" style="padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
            <button type="submit" class="btn btn-primary" id="btn-submit" ${authService.isEnabled() ? '' : 'disabled'}>
              ${isSignup ? 'Daftar Superuser' : 'Login'}
            </button>
          </form>

          <div class="row" style="justify-content:space-between;font-size:13px;">
            ${isSignup
              ? `<a href="#" id="toggle-mode" style="font-size:13px;">← Sudah punya akun? Login</a>`
              : `<a href="#" id="toggle-mode" style="font-size:13px;">Setup superuser →</a>`
            }
          </div>

          <div id="msg" class="muted" style="font-size:13px;min-height:18px;"></div>
        </div>

        <p class="muted" style="text-align:center;font-size:12px;margin:0;">
          SmartFace Attendance · v0.1.0
        </p>
      </div>
    `;
    bind();
  };

  const bind = () => {
    const form = root.querySelector<HTMLFormElement>('#form')!;
    const msg = root.querySelector<HTMLDivElement>('#msg')!;
    const submit = root.querySelector<HTMLButtonElement>('#btn-submit')!;

    const reason = authService.consumeLogoutReason();
    if (reason === 'idle') {
      const banner = root.querySelector<HTMLDivElement>('#idle-banner')!;
      banner.style.display = 'block';
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.textContent = mode === 'login' ? 'Login...' : 'Mendaftar...';
      submit.disabled = true;
      const email = root.querySelector<HTMLInputElement>('#f-email')!.value.trim();
      const password = root.querySelector<HTMLInputElement>('#f-password')!.value;
      try {
        if (mode === 'login') {
          const user = await authService.signIn(email, password);
          msg.innerHTML = `<span style="color:var(--color-success);">✓ Login OK sebagai <strong>${user.displayName}</strong> (${ROLE_LABELS[user.role]}). Mengarahkan...</span>`;
          setTimeout(() => { window.location.pathname = ROUTES.dashboard; }, 500);
        } else {
          const name = root.querySelector<HTMLInputElement>('#f-name')!.value.trim();
          const subRole = root.querySelector<HTMLSelectElement>('#f-subrole')!.value as UserSubRole;
          const user = await authService.createSuperuser(email, password, name, subRole);
          msg.innerHTML = `<span style="color:var(--color-success);">✓ Akun <strong>${user.displayName}</strong> (${ROLE_LABELS[user.role]}) dibuat. Mengarahkan...</span>`;
          setTimeout(() => { window.location.pathname = ROUTES.dashboard; }, 1500);
        }
      } catch (err: unknown) {
        const m = err instanceof AuthError ? err.message : (err as Error).message;
        msg.innerHTML = `<span style="color:var(--color-danger);">✗ ${m}</span>`;
        submit.disabled = false;
      }
    });

    root.querySelector<HTMLAnchorElement>('#toggle-mode')?.addEventListener('click', (e) => {
      e.preventDefault();
      mode = mode === 'login' ? 'signup-superuser' : 'login';
      render();
    });
  };

  render();
}