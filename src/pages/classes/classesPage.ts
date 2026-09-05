import { classRepository, studentRepository } from '@repositories/index';
import { ROUTES } from '@config/app';
import { formatTime } from '@utils/device';
import type { ClassRoom } from '@models/types';

let allClasses: ClassRoom[] = [];

export async function renderClasses(root: HTMLElement): Promise<void> {
  root.innerHTML = `
    <div class="stack">
      <header>
        <h2 style="margin:0 0 4px;">Manajemen Kelas</h2>
        <p class="muted" style="margin:0;">Daftar kelas, tambah, edit, hapus.</p>
      </header>

      <section class="card stack">
        <h3 style="margin:0;">Tambah Kelas</h3>
        <div class="row" style="flex-wrap:wrap;gap:8px;">
          <input id="f-grade" type="text" placeholder="Tingkat (mis. XII)" style="width:140px;padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
          <input id="f-name" type="text" placeholder="Nama kelas (mis. XII IPA 1)" style="flex:1;min-width:200px;padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
          <input id="f-ay" type="text" placeholder="Academic Year ID (mis. 2026/2027)" style="width:200px;padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
          <button class="btn btn-primary" id="btn-add">Tambah</button>
        </div>
        <div id="msg" class="muted" style="font-size:13px;"></div>
      </section>

      <section class="card stack">
        <div class="row" style="justify-content:space-between;">
          <span id="counter" class="muted"></span>
        </div>
        <div id="list" class="stack" style="max-height:520px;overflow:auto;"></div>
      </section>

      <section class="card">
        <p class="muted" style="margin:0;font-size:13px;">
          Setelah kelas dibuat, tambahkan siswa di <a href="${ROUTES.students}" data-link>Manajemen Siswa</a>.
        </p>
      </section>
    </div>
  `;

  const msgEl = root.querySelector<HTMLDivElement>('#msg')!;
  const fGrade = root.querySelector<HTMLInputElement>('#f-grade')!;
  const fName = root.querySelector<HTMLInputElement>('#f-name')!;
  const fAy = root.querySelector<HTMLInputElement>('#f-ay')!;
  const btnAdd = root.querySelector<HTMLButtonElement>('#btn-add')!;
  const listEl = root.querySelector<HTMLDivElement>('#list')!;
  const counter = root.querySelector<HTMLSpanElement>('#counter')!;

  const log = (msg: string) => {
    msgEl.textContent = `[${formatTime(Date.now())}] ${msg}`;
  };

  const refresh = async () => {
    allClasses = await classRepository.list();
    renderList();
  };

  const renderList = async () => {
    counter.textContent = `${allClasses.length} kelas`;
    if (allClasses.length === 0) {
      listEl.innerHTML = '<p class="muted" style="margin:0;">Belum ada kelas. Tambahkan di form atas.</p>';
      return;
    }
    const counts = await Promise.all(
      allClasses.map(async (c) => ({
        cls: c,
        students: (await studentRepository.listByClass(c.id)).length
      }))
    );
    listEl.innerHTML = counts
      .map(
        ({ cls, students }) => `
        <div class="card" style="padding:12px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div>
            <div><strong>${cls.name}</strong> <span class="muted" style="font-size:12px;">· grade=${cls.grade} · ay=${cls.academicYearId}</span></div>
            <div class="muted" style="font-size:12px;">${students} siswa · id=${cls.id}</div>
          </div>
          <div class="row">
            <button class="btn btn-ghost" data-edit="${cls.id}">Edit</button>
            <button class="btn btn-danger" data-del="${cls.id}">Hapus</button>
          </div>
        </div>`
      )
      .join('');

    listEl.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) => {
      b.addEventListener('click', async () => {
        const id = b.dataset.del!;
        if (!confirm('Hapus kelas ini? Hanya bisa jika tidak ada siswa.')) return;
        try {
          await classRepository.remove(id);
          log(`Kelas dihapus: ${id}`);
          await refresh();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          log(`ERROR: ${msg}`);
        }
      });
    });
    listEl.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach((b) => {
      b.addEventListener('click', () => {
        const c = allClasses.find((x) => x.id === b.dataset.edit);
        if (c) openEdit(c);
      });
    });
  };

  const openEdit = (c: ClassRoom) => {
    const newName = prompt('Nama kelas:', c.name);
    if (newName === null) return;
    const newGrade = prompt('Tingkat:', c.grade);
    if (newGrade === null) return;
    void (async () => {
      try {
        await classRepository.update(c.id, { name: newName.trim(), grade: newGrade.trim() });
        log(`Kelas diupdate: ${c.id}`);
        await refresh();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        log(`ERROR: ${msg}`);
      }
    })();
  };

  btnAdd.addEventListener('click', async () => {
    const grade = fGrade.value.trim();
    const name = fName.value.trim();
    const ay = fAy.value.trim();
    if (!grade || !name || !ay) {
      log('Tingkat, nama, dan academic year wajib diisi.');
      return;
    }
    try {
      const c = await classRepository.create({ grade, name, academicYearId: ay });
      log(`Kelas dibuat: ${c.id} — ${c.name}`);
      fName.value = '';
      fGrade.value = '';
      await refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      log(`ERROR: ${msg}`);
    }
  });

  await refresh();
}