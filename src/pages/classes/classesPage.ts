import { classRepository, studentRepository, academicYearRepository } from '@repositories/index';
import { ROUTES } from '@config/app';
import { formatTime } from '@utils/device';
import type { ClassRoom, AcademicYear } from '@models/types';

const ROWS_PER_PAGE = 10;
type SortKey = 'grade' | 'name' | 'students' | null;
type SortDir = 'asc' | 'desc';

const DEFAULT_GRADES = ['X', 'XI', 'XII'];
const DEFAULT_ACADEMIC_YEARS = [
  { name: '2026/2027', startDate: '2026-07-01', endDate: '2027-06-30' },
  { name: '2027/2028', startDate: '2027-07-01', endDate: '2028-06-30' },
];

export async function renderClasses(root: HTMLElement): Promise<void> {
  let allClasses: ClassRoom[] = [];
  let allAcademicYears: AcademicYear[] = [];
  let filtered: ClassRoom[] = [];
  let currentPage = 1;
  let sortKey: SortKey = null;
  let sortDir: SortDir = 'asc';
  let gradeFilter = '';
  let ayFilter = '';

  root.innerHTML = `
    <div class="stack">
      <header>
        <h2 style="margin:0 0 4px;">Manajemen Kelas</h2>
        <p class="muted" style="margin:0;">Tingkat, nama kelas, dan tahun ajaran.</p>
      </header>

      <section class="card glass">
        <h3 style="margin:0 0 12px;">Tambah Kelas</h3>
        <div class="row" style="flex-wrap:wrap;gap:8px;">
          <select id="f-grade" style="padding:10px;border:1px solid var(--color-border);border-radius:8px;min-width:140px;">
            <option value="">— Tingkat —</option>
          </select>
          <input id="f-code" type="text" placeholder="Kode kelas (mis. A / 1)" style="width:120px;padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
          <select id="f-ay" style="padding:10px;border:1px solid var(--color-border);border-radius:8px;min-width:180px;">
            <option value="">— Tahun Ajaran —</option>
          </select>
          <button class="btn btn-primary" id="btn-add">+ Tambah</button>
        </div>
        <div id="msg" class="muted" style="margin-top:8px;font-size:13px;"></div>
      </section>

      <section class="card glass">
        <h3 style="margin:0 0 12px;">Filter</h3>
        <div class="row" style="flex-wrap:wrap;gap:8px;">
          <select id="filter-grade" style="padding:10px;border:1px solid var(--color-border);border-radius:8px;min-width:140px;">
            <option value="">Semua Tingkat</option>
          </select>
          <select id="filter-ay" style="padding:10px;border:1px solid var(--color-border);border-radius:8px;min-width:180px;">
            <option value="">Semua Tahun Ajaran</option>
          </select>
        </div>
      </section>

      <section class="card glass">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;align-items:center;margin-bottom:12px;">
          <h3 style="margin:0;">Daftar Kelas <span id="class-total" class="muted" style="font-size:14px;font-weight:400;"></span></h3>
          <span id="page-info" class="muted" style="font-size:13px;"></span>
        </div>
        <div style="overflow-x:auto;border-radius:8px;border:1px solid var(--color-border);">
          <table class="data-table" style="width:100%;border-collapse:collapse;font-size:14px;background:rgba(255,255,255,0.5);">
            <thead>
              <tr style="background:linear-gradient(180deg,#0ea572 0%,#10b981 100%);color:#fff;">
                <th data-sort="idx" style="padding:10px 8px;text-align:center;width:60px;font-weight:600;cursor:pointer;user-select:none;">No</th>
                <th data-sort="grade" style="padding:10px 8px;text-align:left;font-weight:600;cursor:pointer;user-select:none;">Tingkat</th>
                <th data-sort="name" style="padding:10px 8px;text-align:left;font-weight:600;cursor:pointer;user-select:none;">Nama Kelas</th>
                <th data-sort="students" style="padding:10px 8px;text-align:center;width:120px;font-weight:600;cursor:pointer;user-select:none;">Jumlah Siswa</th>
                <th style="padding:10px 8px;text-align:center;width:160px;font-weight:600;">Aksi</th>
              </tr>
            </thead>
            <tbody id="class-tbody"></tbody>
          </table>
        </div>
        <div id="pagination" class="row" style="justify-content:center;flex-wrap:wrap;gap:4px;margin-top:16px;"></div>
      </section>

      <section class="card">
        <p class="muted" style="margin:0;font-size:13px;">
          Setelah kelas dibuat, tambahkan siswa di <a href="${ROUTES.students}" data-link>Manajemen Siswa</a>.
        </p>
      </section>
    </div>
  `;

  const msgEl = root.querySelector<HTMLDivElement>('#msg')!;
  const fGrade = root.querySelector<HTMLSelectElement>('#f-grade')!;
  const fCode = root.querySelector<HTMLInputElement>('#f-code')!;
  const fAy = root.querySelector<HTMLSelectElement>('#f-ay')!;
  const btnAdd = root.querySelector<HTMLButtonElement>('#btn-add')!;
  const tbody = root.querySelector<HTMLTableSectionElement>('#class-tbody')!;
  const counter = root.querySelector<HTMLSpanElement>('#class-total')!;
  const pageInfo = root.querySelector<HTMLSpanElement>('#page-info')!;
  const pgEl = root.querySelector<HTMLDivElement>('#pagination')!;
  const filterGrade = root.querySelector<HTMLSelectElement>('#filter-grade')!;
  const filterAy = root.querySelector<HTMLSelectElement>('#filter-ay')!;

  const log = (msg: string) => {
    msgEl.textContent = `[${formatTime(Date.now())}] ${msg}`;
  };

  const populateGradeOptions = (select: HTMLSelectElement, includeAddNew = false) => {
    const existing = Array.from(select.options).map((o) => o.value).filter(Boolean);
    const grades = Array.from(new Set([...DEFAULT_GRADES, ...existing]));
    select.innerHTML = (includeAddNew ? '<option value="">— Pilih / Tambah —</option>' : '<option value="">— Pilih —</option>') +
      grades.map((g) => `<option value="${g}">${g}</option>`).join('') +
      (includeAddNew ? '<option value="__add_new__">+ Tambah Tingkat</option>' : '');
  };

  const populateAcademicYearOptions = async (select: HTMLSelectElement, includeAddNew = false) => {
    allAcademicYears = await academicYearRepository.list();
    
    // Auto-create defaults if none exist
    if (allAcademicYears.length === 0) {
      for (const defaultAy of DEFAULT_ACADEMIC_YEARS) {
        await academicYearRepository.create(defaultAy);
      }
      allAcademicYears = await academicYearRepository.list();
    }

    select.innerHTML = (includeAddNew ? '<option value="">— Pilih / Tambah —</option>' : '<option value="">Semua Tahun Ajaran</option>') +
      allAcademicYears.map((y) => `<option value="${y.id}">${y.name}</option>`).join('') +
      (includeAddNew ? '<option value="__add_new__">+ Tambah Tahun Ajaran</option>' : '');
  };

  const refreshFilters = async () => {
    await populateAcademicYearOptions(filterAy, false);
    populateGradeOptions(filterGrade, false);
  };

  const refresh = async () => {
    allClasses = await classRepository.list();
    allAcademicYears = await academicYearRepository.list();
    await refreshFilters();
    applyFilter();
  };

  const applyFilter = () => {
    const qGrade = gradeFilter.toLowerCase();
    const qAy = ayFilter; // Now an ID, so don't toLowerCase it
    filtered = allClasses.filter((c) => {
      if (qGrade && c.grade.toLowerCase() !== qGrade) return false;
      if (qAy && c.academicYearId !== qAy) return false;
      return true;
    });
    if (sortKey) applySort();
    currentPage = 1;
    renderTable();
  };

  const applySort = () => {
    if (!sortKey) return;
    const dir = sortDir === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      let av: string = '';
      let bv: string = '';
      if (sortKey === 'grade') { av = a.grade; bv = b.grade; }
      else if (sortKey === 'name') { av = a.name; bv = b.name; }
      else if (sortKey === 'students') {
        av = String(studentCounts.get(a.id) ?? 0);
        bv = String(studentCounts.get(b.id) ?? 0);
      }
      return av.localeCompare(bv) * dir;
    });
  };

  const studentCounts = new Map<string, number>();
  const loadStudentCounts = async () => {
    const counts = new Map<string, number>();
    for (const c of filtered) {
      counts.set(c.id, await studentRepository.listByClass(c.id).then((list) => list.length));
    }
    return counts;
  };

  const renderTable = async () => {
    const counts = await loadStudentCounts();
    counts.forEach((v, k) => studentCounts.set(k, v));
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / ROWS_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    const end = Math.min(start + ROWS_PER_PAGE, total);
    const pageRows = filtered.slice(start, end);

    counter.textContent = `(${total} kelas)`;
    pageInfo.textContent = total > 0 ? `Halaman ${currentPage} dari ${totalPages} · Menampilkan ${start + 1}–${end}` : '';

    if (total === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--color-text-muted);">Belum ada kelas${gradeFilter || ayFilter ? ' yang cocok dengan filter' : ''}.</td></tr>`;
    } else {
      tbody.innerHTML = pageRows.map((c, i) => {
        const students = studentCounts.get(c.id) ?? 0;
        return `<tr style="border-top:1px solid var(--color-border);">
          <td style="padding:8px;text-align:center;color:var(--color-text-muted);">${start + i + 1}</td>
          <td style="padding:8px;"><strong>${c.grade}</strong></td>
          <td style="padding:8px;">${c.name} <span class="muted" style="font-size:12px;">(${allAcademicYears.find(ay => ay.id === c.academicYearId)?.name || c.academicYearId})</span></td>
          <td style="padding:8px;text-align:center;">${students}</td>
          <td style="padding:8px;text-align:center;">
            <button class="btn btn-ghost" data-edit="${c.id}" style="padding:4px 8px;min-height:28px;font-size:12px;">Edit</button>
            <button class="btn btn-danger" data-del="${c.id}" style="padding:4px 8px;min-height:28px;font-size:12px;margin-left:4px;">Hapus</button>
          </td>
        </tr>`;
      }).join('');
    }

    if (totalPages <= 1) {
      pgEl.innerHTML = '';
    } else {
      const pageBtn = (p: number, label: string | number, active = false, disabled = false) => {
        const bg = active ? 'linear-gradient(180deg,#0ea572 0%,#10b981 100%);color:#fff;' : 'background:rgba(255,255,255,0.7);color:var(--color-text);';
        const op = disabled ? 'opacity:0.4;cursor:not-allowed;' : 'cursor:pointer;';
        return `<button class="btn" data-page="${p}" style="padding:6px 12px;min-height:32px;${bg}${op}">${label}</button>`;
      };
      let html = pageBtn(currentPage - 1, '‹', false, currentPage === 1);
      const startP = Math.max(1, currentPage - 2);
      const endP = Math.min(totalPages, currentPage + 2);
      if (startP > 1) { html += pageBtn(1, '1'); if (startP > 2) html += '<span class="muted" style="padding:6px;">…</span>'; }
      for (let p = startP; p <= endP; p++) html += pageBtn(p, p, p === currentPage);
      if (endP < totalPages) { if (endP < totalPages - 1) html += '<span class="muted" style="padding:6px;">…</span>'; html += pageBtn(totalPages, totalPages); }
      html += pageBtn(currentPage + 1, '›', false, currentPage === totalPages);
      pgEl.innerHTML = html;

      pgEl.querySelectorAll<HTMLButtonElement>('[data-page]').forEach((b) => {
        b.addEventListener('click', () => {
          const p = parseInt(b.dataset.page!, 10);
          if (!isNaN(p) && p >= 1 && p <= totalPages) {
            currentPage = p;
            renderTable();
          }
        });
      });
    }

    tbody.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) => {
      b.addEventListener('click', async () => {
        const id = b.dataset.del!;
        const c = allClasses.find((x) => x.id === id);
        if (!c) return;
        const students = await studentRepository.listByClass(id);
        if (students.length > 0) {
          showDeleteWarningModal(c, students.length);
          return;
        }
        showDeleteConfirmModal(c);
      });
    });

    tbody.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.edit!;
        const c = allClasses.find((x) => x.id === id);
        if (c) openEdit(c);
      });
    });
  };

  const showDeleteConfirmModal = (c: ClassRoom) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.55);backdrop-filter:blur(4px);padding:16px;';
    overlay.innerHTML = `
      <div class="glass" style="max-width:420px;width:100%;padding:24px;box-shadow:var(--shadow-lg);">
        <h3 style="margin:0 0 4px;color:var(--color-danger);">Konfirmasi Hapus</h3>
        <p class="muted" style="margin:0 0 16px;font-size:13px;">Apakah Anda yakin ingin menghapus kelas <strong>${c.name}</strong> (${c.grade})?</p>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn btn-ghost" id="del-cancel" style="min-height:40px;">Batal</button>
          <button class="btn btn-danger" id="del-confirm" style="min-height:40px;">Hapus</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector<HTMLButtonElement>('#del-cancel')!.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector<HTMLButtonElement>('#del-confirm')!.addEventListener('click', async () => {
      overlay.remove();
      try {
        await classRepository.remove(c.id);
        log(`✓ Kelas dihapus: ${c.name}`);
        await refresh();
      } catch (err: unknown) {
        log(`✗ ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  };

  const showDeleteWarningModal = (c: ClassRoom, studentCount: number) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.55);backdrop-filter:blur(4px);padding:16px;';
    overlay.innerHTML = `
      <div class="glass" style="max-width:420px;width:100%;padding:24px;box-shadow:var(--shadow-lg);">
        <h3 style="margin:0 0 4px;color:var(--color-warn);">⚠ Tidak Dapat Menghapus</h3>
        <p class="muted" style="margin:0 0 16px;font-size:13px;">
          Kelas <strong>${c.name}</strong> (${c.grade}) masih memiliki <strong>${studentCount} siswa</strong> terdaftar.<br>
          Hapus semua siswa di kelas ini terlebih dahulu sebelum menghapus kelas.
        </p>
        <div style="display:flex;justify-content:flex-end;">
          <button class="btn btn-primary" id="warn-ok" style="min-height:40px;">Tutup</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector<HTMLButtonElement>('#warn-ok')!.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  };

  const showDuplicateModal = (existing: ClassRoom) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.55);backdrop-filter:blur(4px);padding:16px;';
    overlay.innerHTML = `
      <div class="glass" style="max-width:420px;width:100%;padding:24px;box-shadow:var(--shadow-lg);">
        <h3 style="margin:0 0 4px;color:var(--color-danger);">⚠ Data Sudah Ada</h3>
        <p class="muted" style="margin:0 0 16px;font-size:13px;">Kelas dengan nama yang sama sudah terdaftar di tingkat tersebut.</p>
        <div style="background:rgba(255,255,255,0.6);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:12px;font-size:14px;">
          <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 12px;">
            <span class="muted" style="font-size:12px;">Tingkat</span><strong>${existing.grade}</strong>
            <span class="muted" style="font-size:12px;">Nama Kelas</span><strong>${existing.name}</strong>
            <span class="muted" style="font-size:12px;">Tahun Ajaran</span><strong>${existing.academicYearId}</strong>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;justify-content:flex-end;">
          <button class="btn btn-primary" id="dup-ok" style="min-height:40px;">Tutup</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector<HTMLButtonElement>('#dup-ok')!.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  };

  const showGradeModal = (resolve: (value: string | null) => void) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.55);backdrop-filter:blur(4px);padding:16px;';
    overlay.innerHTML = `
      <div class="glass" style="max-width:360px;width:100%;padding:24px;box-shadow:var(--shadow-lg);">
        <h3 style="margin:0 0 12px;">Tambah Tingkat</h3>
        <input id="new-grade" type="text" placeholder="Contoh: XIII" style="width:100%;padding:10px;border:1px solid var(--color-border);border-radius:8px;margin-bottom:12px;" />
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn btn-ghost" id="grade-cancel" style="min-height:40px;">Batal</button>
          <button class="btn btn-primary" id="grade-save" style="min-height:40px;">Simpan</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const input = overlay.querySelector<HTMLInputElement>('#new-grade')!;
    input.focus();
    overlay.querySelector<HTMLButtonElement>('#grade-cancel')!.addEventListener('click', () => { overlay.remove(); resolve(null); });
    overlay.querySelector<HTMLButtonElement>('#grade-save')!.addEventListener('click', async () => {
      const val = input.value.trim();
      if (!val) return;
      overlay.remove();
      resolve(val);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = input.value.trim();
        if (!val) return;
        overlay.remove();
        resolve(val);
      }
    });
  };

  const showAcademicYearModal = (resolve: (value: { name: string; startDate: string; endDate: string } | null) => void) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.55);backdrop-filter:blur(4px);padding:16px;';
    overlay.innerHTML = `
      <div class="glass" style="max-width:360px;width:100%;padding:24px;box-shadow:var(--shadow-lg);">
        <h3 style="margin:0 0 12px;">Tambah Tahun Ajaran</h3>
        <input id="ay-name" type="text" placeholder="Contoh: 2028/2029" style="width:100%;padding:10px;border:1px solid var(--color-border);border-radius:8px;margin-bottom:8px;" />
        <div class="row" style="gap:8px;margin-bottom:12px;">
          <input id="ay-start" type="date" style="flex:1;padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
          <input id="ay-end" type="date" style="flex:1;padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn btn-ghost" id="ay-cancel" style="min-height:40px;">Batal</button>
          <button class="btn btn-primary" id="ay-save" style="min-height:40px;">Simpan</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const nameInput = overlay.querySelector<HTMLInputElement>('#ay-name')!;
    const startInput = overlay.querySelector<HTMLInputElement>('#ay-start')!;
    const endInput = overlay.querySelector<HTMLInputElement>('#ay-end')!;
    nameInput.focus();
    overlay.querySelector<HTMLButtonElement>('#ay-cancel')!.addEventListener('click', () => { overlay.remove(); resolve(null); });
    overlay.querySelector<HTMLButtonElement>('#ay-save')!.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      const start = startInput.value.trim();
      const end = endInput.value.trim();
      if (!name || !start || !end) return;
      overlay.remove();
      resolve({ name, startDate: start, endDate: end });
    });
  };

  const openEdit = async (c: ClassRoom) => {
    const newCode = prompt('Kode kelas (mis. A / 1):', c.name.replace(c.grade + '-', ''));
    if (newCode === null) return;
    const newGrade = prompt('Tingkat:', c.grade);
    if (newGrade === null) return;
    const newAy = prompt('Tahun Ajaran:', c.academicYearId);
    if (newAy === null) return;
    void (async () => {
      try {
        const updatedName = `${newGrade.trim()}-${newCode.trim()}`;
        await classRepository.update(c.id, { name: updatedName, grade: newGrade.trim(), academicYearId: newAy.trim() });
        log(`✓ Kelas diupdate: ${c.id}`);
        await refresh();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        if (msg.includes('sudah ada')) {
          const existing = allClasses.find((x) => x.grade === newGrade.trim() && x.name === `${newGrade.trim()}-${newCode.trim()}` && x.id !== c.id);
          if (existing) {
            showDuplicateModal(existing);
          }
        }
        log(`✗ ${msg}`);
      }
    })();
  };

  btnAdd.addEventListener('click', async () => {
    const grade = fGrade.value.trim();
    const code = fCode.value.trim();
    const ay = fAy.value.trim();
    if (!grade || !code || !ay) {
      log('⚠ Tingkat, kode kelas, dan tahun ajaran wajib diisi.');
      return;
    }
    const name = `${grade}-${code}`;
    try {
      const c = await classRepository.create({ name, grade, academicYearId: ay });
      log(`✓ Kelas dibuat: ${c.name}`);
      fCode.value = '';
      await refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg.includes('sudah ada')) {
        const existing = allClasses.find((x) => x.grade === grade && x.name === name);
        if (existing) showDuplicateModal(existing);
      }
      log(`✗ ${msg}`);
    }
  });

  fGrade.addEventListener('change', async () => {
    if (fGrade.value === '__add_new__') {
      const newGrade = await new Promise<string | null>((resolve) => showGradeModal(resolve));
      if (newGrade) {
        populateGradeOptions(fGrade, true);
        fGrade.value = newGrade;
      } else {
        fGrade.value = '';
      }
    }
  });

  fAy.addEventListener('change', async () => {
    if (fAy.value === '__add_new__') {
      const newAy = await new Promise<{ name: string; startDate: string; endDate: string } | null>((resolve) => showAcademicYearModal(resolve));
      if (newAy) {
        const created = await academicYearRepository.create(newAy);
        await populateAcademicYearOptions(fAy, true);
        fAy.value = created.id;
      } else {
        fAy.value = '';
      }
    }
  });

  filterGrade.addEventListener('change', () => {
    gradeFilter = filterGrade.value;
    applyFilter();
  });

  filterAy.addEventListener('change', async () => {
    ayFilter = filterAy.value;
    applyFilter();
  });

  root.querySelectorAll<HTMLTableCellElement>('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (k === 'idx' || k === 'no' || k === 'students') return;
      if (sortKey === k) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortKey = k as SortKey;
        sortDir = 'asc';
      }
      root.querySelectorAll<HTMLTableCellElement>('th[data-sort]').forEach((h) => {
        h.textContent = (h.textContent || '').replace(/ [↑↓]$/, '');
      });
      th.textContent = (th.textContent || '') + (sortDir === 'asc' ? ' ↑' : ' ↓');
      applyFilter();
    });
  });

  await populateGradeOptions(fGrade, true);
  await populateAcademicYearOptions(fAy, true);
  await refresh();
}
