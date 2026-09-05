import {
  classRepository,
  studentRepository,
  faceProfileRepository,
  attendanceRepository,
  settingRepository
} from '@repositories/index';
import { databaseService } from '@services/database/index';
import type { Gender } from '@models/types';
import { formatTime } from '@utils/device';

export async function renderDbTest(root: HTMLElement): Promise<void> {
  root.innerHTML = `
    <div class="stack">
      <header>
        <h2 style="margin:0 0 4px;">DB Test (Checkpoint Sprint 3)</h2>
        <p class="muted" style="margin:0;">
          Verifikasi IndexedDB + Dexie — close app, buka lagi, data masih ada.
        </p>
      </header>

      <section class="card stack">
        <strong>Counts (live)</strong>
        <pre id="counts" style="background:#0f172a;color:#a7f3d0;padding:12px;border-radius:8px;margin:0;font-size:13px;max-height:160px;overflow:auto;"></pre>
        <div class="row">
          <button class="btn btn-ghost" id="btn-refresh">Refresh</button>
          <button class="btn btn-ghost" id="btn-export">Export JSON</button>
          <label class="btn btn-ghost" for="import-file" style="cursor:pointer;">Import JSON</label>
          <input id="import-file" type="file" accept="application/json" style="display:none;" />
          <button class="btn btn-danger" id="btn-reset">Reset All</button>
        </div>
      </section>

      <section class="card stack">
        <h3 style="margin:0;">A. Class CRUD</h3>
        <div class="row">
          <input id="cls-grade" type="text" placeholder="Tingkat (mis. XII)" style="flex:1;min-width:120px;padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
          <input id="cls-name" type="text" placeholder="Nama kelas (mis. XII IPA 1)" style="flex:1;min-width:160px;padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
          <input id="cls-ay" type="text" placeholder="Academic year ID" style="flex:1;min-width:120px;padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
          <button class="btn btn-primary" id="btn-cls-add">Tambah Kelas</button>
        </div>
        <ul id="cls-list" class="muted" style="margin:0;padding-left:18px;"></ul>
      </section>

      <section class="card stack">
        <h3 style="margin:0;">B. Student CRUD</h3>
        <div class="row">
          <input id="stu-class" type="text" placeholder="Class ID" style="flex:1;min-width:120px;padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
          <input id="stu-nis" type="text" placeholder="NIS" style="width:100px;padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
          <input id="stu-name" type="text" placeholder="Nama" style="flex:1;min-width:160px;padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
          <select id="stu-gender" style="padding:10px;border:1px solid var(--color-border);border-radius:8px;">
            <option value="L">L</option>
            <option value="P">P</option>
          </select>
          <button class="btn btn-primary" id="btn-stu-add">Tambah Siswa</button>
        </div>
        <ul id="stu-list" class="muted" style="margin:0;padding-left:18px;max-height:200px;overflow:auto;"></ul>
      </section>

      <section class="card stack">
        <h3 style="margin:0;">C. Attendance Session (basic)</h3>
        <div class="row">
          <input id="ses-class" type="text" placeholder="Class ID" style="flex:1;min-width:120px;padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
          <input id="ses-user" type="text" placeholder="Created by (user ID)" style="flex:1;min-width:120px;padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
          <input id="ses-date" type="date" style="padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
          <button class="btn btn-primary" id="btn-ses-add">Buka Sesi</button>
        </div>
        <ul id="ses-list" class="muted" style="margin:0;padding-left:18px;"></ul>
      </section>

      <section class="card stack">
        <h3 style="margin:0;">D. Settings KV</h3>
        <div class="row">
          <input id="set-key" type="text" placeholder="key" style="width:160px;padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
          <input id="set-val" type="text" placeholder="value" style="flex:1;min-width:160px;padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
          <button class="btn btn-primary" id="btn-set-save">Save</button>
        </div>
        <ul id="set-list" class="muted" style="margin:0;padding-left:18px;"></ul>
      </section>

      <section class="card stack">
        <h3 style="margin:0;">Log</h3>
        <pre id="log" style="background:#0f172a;color:#cbd5e1;padding:12px;border-radius:8px;max-height:200px;overflow:auto;margin:0;font-size:12px;"></pre>
      </section>
    </div>
  `;

  const countsEl = root.querySelector<HTMLPreElement>('#counts')!;
  const logEl = root.querySelector<HTMLPreElement>('#log')!;
  const clsList = root.querySelector<HTMLUListElement>('#cls-list')!;
  const stuList = root.querySelector<HTMLUListElement>('#stu-list')!;
  const sesList = root.querySelector<HTMLUListElement>('#ses-list')!;
  const setList = root.querySelector<HTMLUListElement>('#set-list')!;

  const log = (msg: string) => {
    const ts = formatTime(Date.now());
    logEl.textContent = `[${ts}] ${msg}\n` + logEl.textContent;
  };

  const renderCounts = async () => {
    const c = await databaseService.counts();
    countsEl.textContent = Object.entries(c)
      .map(([k, v]) => `${k.padEnd(22)} : ${v}`)
      .join('\n');
  };

  const renderClasses = async () => {
    const list = await classRepository.list();
    if (list.length === 0) {
      clsList.innerHTML = '<li class="muted">Belum ada kelas.</li>';
      return;
    }
    clsList.innerHTML = list
      .map(
        (c) =>
          `<li><code>${c.id}</code> — <strong>${c.name}</strong> (grade=${c.grade}, ay=${c.academicYearId})
            <button class="btn btn-ghost" data-del-class="${c.id}" style="padding:2px 8px;min-height:28px;font-size:12px;margin-left:6px;">hapus</button>
          </li>`
      )
      .join('');
    clsList.querySelectorAll<HTMLButtonElement>('[data-del-class]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.delClass!;
        try {
          await classRepository.remove(id);
          log(`Kelas dihapus: ${id}`);
          await Promise.all([renderCounts(), renderClasses()]);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          log(`ERROR hapus kelas: ${msg}`);
        }
      });
    });
  };

  const renderStudents = async () => {
    const list = await studentRepository.list();
    if (list.length === 0) {
      stuList.innerHTML = '<li class="muted">Belum ada siswa.</li>';
      return;
    }
    stuList.innerHTML = list
      .map(
        (s) =>
          `<li><code>${s.id}</code> — <strong>${s.name}</strong> · NIS=${s.nis} · L/P=${s.gender} · class=${s.classId}
            <button class="btn btn-ghost" data-del-stu="${s.id}" style="padding:2px 8px;min-height:28px;font-size:12px;margin-left:6px;">hapus</button>
          </li>`
      )
      .join('');
    stuList.querySelectorAll<HTMLButtonElement>('[data-del-stu]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.delStu!;
        try {
          await studentRepository.remove(id);
          log(`Siswa dihapus: ${id}`);
          await Promise.all([renderCounts(), renderStudents()]);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          log(`ERROR hapus siswa: ${msg}`);
        }
      });
    });
  };

  const renderSessions = async () => {
    const list = await attendanceRepository.listSessions();
    if (list.length === 0) {
      sesList.innerHTML = '<li class="muted">Belum ada sesi.</li>';
      return;
    }
    sesList.innerHTML = list
      .map(
        (s) =>
          `<li><code>${s.id}</code> — class=${s.classId} · date=${s.date} · status=${s.status}
            ${s.status === 'open' ? `<button class="btn btn-ghost" data-close-ses="${s.id}" style="padding:2px 8px;min-height:28px;font-size:12px;margin-left:6px;">close</button>` : ''}
          </li>`
      )
      .join('');
    sesList.querySelectorAll<HTMLButtonElement>('[data-close-ses]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await attendanceRepository.closeSession(btn.dataset.closeSes!);
          log(`Sesi ditutup.`);
          await Promise.all([renderCounts(), renderSessions()]);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          log(`ERROR close sesi: ${msg}`);
        }
      });
    });
  };

  const renderSettings = async () => {
    const list = await settingRepository.all();
    if (list.length === 0) {
      setList.innerHTML = '<li class="muted">Belum ada setting.</li>';
      return;
    }
    setList.innerHTML = list
      .map((s) => `<li><code>${s.key}</code> = <strong>${s.value}</strong></li>`)
      .join('');
  };

  try {
    await databaseService.open();
    log('Database terbuka.');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    log(`ERROR open db: ${msg}`);
  }
  await Promise.all([renderCounts(), renderClasses(), renderStudents(), renderSessions(), renderSettings()]);

  root.querySelector<HTMLButtonElement>('#btn-refresh')!.addEventListener('click', async () => {
    await Promise.all([renderCounts(), renderClasses(), renderStudents(), renderSessions(), renderSettings()]);
    log('Refreshed.');
  });

  root.querySelector<HTMLButtonElement>('#btn-export')!.addEventListener('click', async () => {
    try {
      const json = await databaseService.exportJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `smartface-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      log('Export JSON OK.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      log(`ERROR export: ${msg}`);
    }
  });

  root.querySelector<HTMLInputElement>('#import-file')!.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const counts = await databaseService.importJson(text);
      log(`Import OK: ${JSON.stringify(counts)}`);
      await Promise.all([renderCounts(), renderClasses(), renderStudents(), renderSessions(), renderSettings()]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      log(`ERROR import: ${msg}`);
    }
  });

  root.querySelector<HTMLButtonElement>('#btn-reset')!.addEventListener('click', async () => {
    if (!confirm('Reset semua data di IndexedDB? Tidak bisa dibatalkan.')) return;
    try {
      await databaseService.resetAll();
      log('Reset all OK.');
      await Promise.all([renderCounts(), renderClasses(), renderStudents(), renderSessions(), renderSettings()]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      log(`ERROR reset: ${msg}`);
    }
  });

  root.querySelector<HTMLButtonElement>('#btn-cls-add')!.addEventListener('click', async () => {
    const grade = (root.querySelector<HTMLInputElement>('#cls-grade')!).value.trim();
    const name = (root.querySelector<HTMLInputElement>('#cls-name')!).value.trim();
    const ay = (root.querySelector<HTMLInputElement>('#cls-ay')!).value.trim();
    if (!grade || !name || !ay) {
      log('Grade, nama, dan academic year wajib diisi.');
      return;
    }
    try {
      const cls = await classRepository.create({ grade, name, academicYearId: ay });
      log(`Kelas dibuat: ${cls.id} — ${cls.name}`);
      await Promise.all([renderCounts(), renderClasses()]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      log(`ERROR buat kelas: ${msg}`);
    }
  });

  root.querySelector<HTMLButtonElement>('#btn-stu-add')!.addEventListener('click', async () => {
    const classId = (root.querySelector<HTMLInputElement>('#stu-class')!).value.trim();
    const nis = (root.querySelector<HTMLInputElement>('#stu-nis')!).value.trim();
    const name = (root.querySelector<HTMLInputElement>('#stu-name')!).value.trim();
    const gender = (root.querySelector<HTMLSelectElement>('#stu-gender')!).value as Gender;
    if (!classId || !nis || !name) {
      log('Class ID, NIS, dan nama wajib diisi.');
      return;
    }
    try {
      const s = await studentRepository.create({ classId, nis, name, gender });
      log(`Siswa dibuat: ${s.id} — ${s.name}`);
      await Promise.all([renderCounts(), renderStudents()]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      log(`ERROR buat siswa: ${msg}`);
    }
  });

  root.querySelector<HTMLButtonElement>('#btn-ses-add')!.addEventListener('click', async () => {
    const classId = (root.querySelector<HTMLInputElement>('#ses-class')!).value.trim();
    const createdBy = (root.querySelector<HTMLInputElement>('#ses-user')!).value.trim() || 'admin';
    const dateVal = (root.querySelector<HTMLInputElement>('#ses-date')!).value;
    const date = dateVal || new Date().toISOString().slice(0, 10);
    if (!classId) {
      log('Class ID wajib diisi.');
      return;
    }
    try {
      const ses = await attendanceRepository.createSession({ classId, date, createdBy });
      log(`Sesi dibuka: ${ses.id} (date=${ses.date})`);
      await Promise.all([renderCounts(), renderSessions()]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      log(`ERROR buka sesi: ${msg}`);
    }
  });

  root.querySelector<HTMLButtonElement>('#btn-set-save')!.addEventListener('click', async () => {
    const key = (root.querySelector<HTMLInputElement>('#set-key')!).value.trim();
    const value = (root.querySelector<HTMLInputElement>('#set-val')!).value;
    if (!key) {
      log('Key wajib diisi.');
      return;
    }
    try {
      await settingRepository.set(key, value);
      log(`Setting disimpan: ${key}=${value}`);
      await Promise.all([renderCounts(), renderSettings()]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      log(`ERROR save setting: ${msg}`);
    }
  });

  log(`Face profile count: ${await faceProfileRepository.countAll()} (kosong di DB test)`);
}