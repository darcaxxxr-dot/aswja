import { studentRepository, classRepository, faceProfileRepository } from '@repositories/index';
import { ROUTES } from '@config/app';
import { formatTime } from '@utils/device';
import type { ClassRoom, Gender, Student } from '@models/types';

let allStudents: Student[] = [];
let allClasses: ClassRoom[] = [];

export async function renderStudents(root: HTMLElement): Promise<void> {
  root.innerHTML = `
    <div class="stack">
      <header>
        <h2 style="margin:0 0 4px;">Manajemen Siswa</h2>
        <p class="muted" style="margin:0;">Daftar siswa, tambah, edit, hapus. Data tersimpan di IndexedDB.</p>
      </header>

      <section class="card stack">
        <h3 style="margin:0;">Tambah Siswa</h3>
        <div class="row" style="flex-wrap:wrap;gap:8px;">
          <input id="f-nis" type="text" placeholder="NIS" style="width:120px;padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
          <input id="f-nisn" type="text" placeholder="NISN (opsional)" style="width:140px;padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
          <input id="f-name" type="text" placeholder="Nama lengkap" style="flex:1;min-width:180px;padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
          <select id="f-gender" style="padding:10px;border:1px solid var(--color-border);border-radius:8px;">
            <option value="L">Laki-laki</option>
            <option value="P">Perempuan</option>
          </select>
          <select id="f-class" style="padding:10px;border:1px solid var(--color-border);border-radius:8px;min-width:160px;">
            <option value="">— Pilih kelas —</option>
          </select>
          <button class="btn btn-primary" id="btn-add">Tambah</button>
        </div>
        <div id="msg" class="muted" style="font-size:13px;"></div>
      </section>

      <section class="card stack">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;">
          <div class="row">
            <input id="search" type="search" placeholder="Cari nama / NIS..." style="padding:10px;border:1px solid var(--color-border);border-radius:8px;min-width:220px;" />
            <select id="filter-class" style="padding:10px;border:1px solid var(--color-border);border-radius:8px;">
              <option value="">Semua kelas</option>
            </select>
          </div>
          <span id="counter" class="muted"></span>
        </div>
        <div id="list" class="stack" style="max-height:520px;overflow:auto;"></div>
      </section>

      <section class="card">
        <p class="muted" style="margin:0;font-size:13px;">
          Lanjut ke <a href="${ROUTES.enrollment}" data-link>Face Enrollment</a> untuk mendaftarkan wajah siswa.
        </p>
      </section>
    </div>
  `;

  const msgEl = root.querySelector<HTMLDivElement>('#msg')!;
  const fNis = root.querySelector<HTMLInputElement>('#f-nis')!;
  const fNisn = root.querySelector<HTMLInputElement>('#f-nisn')!;
  const fName = root.querySelector<HTMLInputElement>('#f-name')!;
  const fGender = root.querySelector<HTMLSelectElement>('#f-gender')!;
  const fClass = root.querySelector<HTMLSelectElement>('#f-class')!;
  const btnAdd = root.querySelector<HTMLButtonElement>('#btn-add')!;
  const search = root.querySelector<HTMLInputElement>('#search')!;
  const filterClass = root.querySelector<HTMLSelectElement>('#filter-class')!;
  const listEl = root.querySelector<HTMLDivElement>('#list')!;
  const counter = root.querySelector<HTMLSpanElement>('#counter')!;

  const log = (msg: string) => {
    msgEl.textContent = `[${formatTime(Date.now())}] ${msg}`;
  };

  const refreshClasses = async () => {
    allClasses = await classRepository.list();
    const opts = '<option value="">— Pilih kelas —</option>' +
      allClasses.map((c) => `<option value="${c.id}">${c.name} (${c.grade})</option>`).join('');
    fClass.innerHTML = opts;
    filterClass.innerHTML = '<option value="">Semua kelas</option>' +
      allClasses.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
  };

  const refreshStudents = async () => {
    allStudents = await studentRepository.list();
    renderList();
  };

  const renderList = async () => {
    const q = search.value.trim().toLowerCase();
    const filterCls = filterClass.value;
    const visible = allStudents.filter((s) => {
      if (filterCls && s.classId !== filterCls) return false;
      if (q && !s.name.toLowerCase().includes(q) && !s.nis.toLowerCase().includes(q)) return false;
      return true;
    });

    counter.textContent = `${visible.length} siswa (dari ${allStudents.length} total)`;
    if (visible.length === 0) {
      listEl.innerHTML = '<p class="muted" style="margin:0;">Belum ada siswa. Tambahkan siswa baru di form atas.</p>';
      return;
    }

    const enriched = await Promise.all(
      visible.map(async (s) => ({
        student: s,
        className: allClasses.find((c) => c.id === s.classId)?.name ?? '(kelas tidak ditemukan)',
        hasProfile: (await faceProfileRepository.listForStudent(s.id)).length > 0
      }))
    );

    listEl.innerHTML = enriched
      .map(
        ({ student, className, hasProfile }) => `
        <div class="card" style="padding:12px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div>
            <div><strong>${student.name}</strong> <span class="muted" style="font-size:12px;">· ${student.nis}${student.nisn ? ' / ' + student.nisn : ''}</span></div>
            <div class="muted" style="font-size:12px;">${className} · ${student.gender} · status=${student.status}</div>
            <div style="font-size:12px;margin-top:4px;">${hasProfile ? '<span style="color:var(--color-success);">✓ Face profile ada</span>' : '<span style="color:var(--color-warn);">⚠ Belum ada face profile</span>'}</div>
          </div>
          <div class="row">
            <button class="btn btn-ghost" data-edit="${student.id}">Edit</button>
            <button class="btn btn-danger" data-del="${student.id}">Hapus</button>
          </div>
        </div>`
      )
      .join('');

    listEl.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) => {
      b.addEventListener('click', async () => {
        const id = b.dataset.del!;
        if (!confirm('Hapus siswa ini? Face profile juga akan terhapus.')) return;
        try {
          await studentRepository.remove(id);
          log(`Siswa dihapus: ${id}`);
          await refreshStudents();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          log(`ERROR: ${msg}`);
        }
      });
    });
    listEl.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach((b) => {
      b.addEventListener('click', () => {
        const s = allStudents.find((x) => x.id === b.dataset.edit);
        if (s) openEdit(s);
      });
    });
  };

  const openEdit = (s: Student) => {
    const newName = prompt('Nama lengkap:', s.name);
    if (newName === null) return;
    const newNisn = prompt('NISN (kosongkan untuk hapus):', s.nisn ?? '');
    void (async () => {
      try {
        await studentRepository.update(s.id, { name: newName.trim(), nisn: newNisn?.trim() || undefined });
        log(`Siswa diupdate: ${s.id}`);
        await refreshStudents();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        log(`ERROR: ${msg}`);
      }
    })();
  };

  btnAdd.addEventListener('click', async () => {
    const nis = fNis.value.trim();
    const nisn = fNisn.value.trim() || undefined;
    const name = fName.value.trim();
    const gender = fGender.value as Gender;
    const classId = fClass.value;
    if (!nis || !name || !classId) {
      log('NIS, nama, dan kelas wajib diisi.');
      return;
    }
    try {
      const s = await studentRepository.create({ nis, nisn, name, gender, classId });
      log(`Siswa dibuat: ${s.id} — ${s.name}`);
      fNis.value = '';
      fNisn.value = '';
      fName.value = '';
      await refreshStudents();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      log(`ERROR: ${msg}`);
    }
  });

  search.addEventListener('input', () => void renderList());
  filterClass.addEventListener('change', () => void renderList());

  await refreshClasses();
  await refreshStudents();
}