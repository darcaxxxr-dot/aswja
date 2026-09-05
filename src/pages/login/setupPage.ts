import { authService, AuthError, SUBROLE_LABELS, type UserSubRole } from '@services/auth/index';
import { BRAND } from '@config/brand';
import { ROUTES } from '@config/app';

const BACKDOOR_PATH = '/__setup__';

export async function renderSetup(root: HTMLElement): Promise<void> {
  let bgEl = document.querySelector('.aswja-bg') as HTMLElement | null;
  if (!bgEl) {
    bgEl = document.createElement('div');
    bgEl.className = 'aswja-bg';
    bgEl.innerHTML = '<div class="blob blob-1"></div>';
    document.body.insertBefore(bgEl, document.body.firstChild);
  }
  bgEl.style.display = 'block';

  root.innerHTML = `
    <div class="stack" style="max-width:520px;margin:48px auto;padding:0 16px 32px;position:relative;z-index:1;">
      <div style="text-align:center;margin-bottom:20px;">
        <h1 class="aswja-brand-title" style="font-size:42px;">${BRAND.name}</h1>
        <p class="aswja-brand-subtitle">Setup Superuser (Backdoor)</p>
      </div>

      <div class="glass stack" style="gap:14px;">
        <div class="glass-banner">
          ⚙️ Halaman setup tersembunyi. Jangan bagikan URL ini. Hapus setelah akun superuser dibuat.
        </div>

        <p style="margin:0;font-size:14px;color:var(--color-text-muted);text-align:center;">
          Buat akun SUPERUSER pertama untuk mengaktifkan sistem login.
        </p>

        <form id="form" class="stack" style="gap:10px;">
          <input id="f-name" type="text" placeholder="Nama tampilan (mis. Admin Madrasah)" required class="glass-input" style="padding:12px;border-radius:10px;" />
          <input id="f-email" type="email" placeholder="Email" required class="glass-input" style="padding:12px;border-radius:10px;" />
          <input id="f-password" type="password" placeholder="Password (min 6 karakter)" required minlength="6" class="glass-input" style="padding:12px;border-radius:10px;" />
          <select id="f-subrole" class="glass-input" style="padding:12px;border-radius:10px;">
            <option value="KEPALA_MADRASAH">${SUBROLE_LABELS.KEPALA_MADRASAH}</option>
            <option value="WAKAMAD_KEASRAMAAN">${SUBROLE_LABELS.WAKAMAD_KEASRAMAAN}</option>
            <option value="GURU_BINA_ASRAMA">${SUBROLE_LABELS.GURU_BINA_ASRAMA}</option>
          </select>
          <button type="submit" class="btn-aswja" id="btn-submit" ${authService.isEnabled() ? '' : 'disabled'} style="width:100%;">
            Buat Superuser
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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = 'Membuat akun...';
    msg.style.color = 'var(--color-text-muted)';
    submit.disabled = true;

    const name = root.querySelector<HTMLInputElement>('#f-name')!.value.trim();
    const email = root.querySelector<HTMLInputElement>('#f-email')!.value.trim();
    const password = root.querySelector<HTMLInputElement>('#f-password')!.value;
    const subRole = root.querySelector<HTMLSelectElement>('#f-subrole')!.value as UserSubRole;

    if (!name || !email || password.length < 6) {
      msg.innerHTML = '✗ Isi semua field dengan benar (password min 6 karakter).';
      msg.style.color = '#dc2626';
      submit.disabled = false;
      return;
    }

    try {
      const user = await authService.createSuperuser(email, password, name, subRole);
      msg.innerHTML = `✓ Akun <strong>${user.displayName}</strong> (${user.role}) berhasil dibuat.`;
      msg.style.color = 'var(--aswja-primary-dark)';
      setTimeout(() => { window.location.pathname = ROUTES.dashboard; }, 1500);
    } catch (err: unknown) {
      const m = err instanceof AuthError ? err.message : (err as Error).message;
      msg.innerHTML = `✗ ${m}`;
      msg.style.color = '#dc2626';
      submit.disabled = false;
    }
  });
}

export function unmountSetup(): void {
  const bg = document.querySelector('.aswja-bg') as HTMLElement | null;
  if (bg) bg.style.display = 'none';
}

export { BACKDOOR_PATH };