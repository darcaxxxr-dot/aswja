import { authService, AuthError, type AppRole } from '@services/auth/index';
import { ROUTES } from '@config/app';

type Mode = 'login' | 'signup';

export async function renderLogin(root: HTMLElement): Promise<void> {
  let mode: Mode = 'login';

  const render = () => {
    const isSignup = mode === 'signup';
    root.innerHTML = `
      <div class="stack" style="max-width:420px;margin:60px auto;padding:0 16px;">
        <div class="card stack">
          <h2 style="margin:0;">${isSignup ? 'Daftar Akun' : 'Login'}</h2>
          <p class="muted" style="margin:0;font-size:13px;">
            ${isSignup
              ? 'Buat akun baru. Admin biasanya didaftarkan via Supabase dashboard, signup untuk testing.'
              : 'Login untuk mengakses sistem.'}
          </p>
          ${authService.isEnabled()
            ? ''
            : `<div style="background:#fef3c7;padding:10px;border-radius:8px;font-size:13px;color:#92400e;">⚠ Supabase tidak dikonfigurasi. Auth dinonaktifkan. Set <code>.env</code> untuk mengaktifkan.</div>`
          }
          <form id="form" class="stack" style="gap:10px;">
            ${isSignup ? `
              <input id="f-name" type="text" placeholder="Nama tampilan" required style="padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
              <select id="f-role" style="padding:10px;border:1px solid var(--color-border);border-radius:8px;">
                <option value="TEACHER">TEACHER (Guru)</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            ` : ''}
            <input id="f-email" type="email" placeholder="Email" required style="padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
            <input id="f-password" type="password" placeholder="Password (min 6 karakter)" required minlength="6" style="padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
            <button type="submit" class="btn btn-primary" id="btn-submit" ${authService.isEnabled() ? '' : 'disabled'}>
              ${isSignup ? 'Daftar' : 'Login'}
            </button>
          </form>
          <div class="row" style="justify-content:space-between;font-size:13px;">
            <a href="#" id="toggle-mode" style="font-size:13px;">${isSignup ? '← Sudah punya akun? Login' : 'Belum punya akun? Daftar'}</a>
            <a href="${ROUTES.dashboard}" data-link>Lewati (tanpa login)</a>
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

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.textContent = mode === 'login' ? 'Login...' : 'Mendaftar...';
      submit.disabled = true;
      const email = root.querySelector<HTMLInputElement>('#f-email')!.value.trim();
      const password = root.querySelector<HTMLInputElement>('#f-password')!.value;
      try {
        if (mode === 'login') {
          await authService.signIn(email, password);
          msg.innerHTML = '<span style="color:var(--color-success);">✓ Login OK. Mengarahkan...</span>';
          setTimeout(() => { window.location.pathname = ROUTES.dashboard; }, 500);
        } else {
          const name = root.querySelector<HTMLInputElement>('#f-name')!.value.trim();
          const role = root.querySelector<HTMLSelectElement>('#f-role')!.value as AppRole;
          await authService.signUp(email, password, role, name);
          msg.innerHTML = '<span style="color:var(--color-success);">✓ Akun dibuat. Cek email untuk konfirmasi. Mengarahkan...</span>';
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
      mode = mode === 'login' ? 'signup' : 'login';
      render();
    });
  };

  render();
}