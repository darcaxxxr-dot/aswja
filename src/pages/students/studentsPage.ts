import { studentRepository, classRepository } from '@repositories/index';
import { formatTime } from '@utils/device';
import type { Student, ClassRoom, Gender } from '@models/types';

const ROWS_PER_PAGE = 10;
type SortKey = 'name' | 'nis' | 'gender' | 'class' | null;
type SortDir = 'asc' | 'desc';

export async function renderStudents(root: HTMLElement): Promise<void> {
  let allStudents: Student[] = [];
  let allClasses: ClassRoom[] = [];
  let filtered: Student[] = [];
  let currentPage = 1;
  let sortKey: SortKey = null;
  let sortDir: SortDir = 'asc';
  let searchQuery = '';
  let classFilter = '';
  let statusFilter = '';

  root.innerHTML = `
    <div class="stack">
      <header>
        <h2 style="margin:0 0 8px;">Manajemen Siswa</h2>
        <p class="muted" style="margin:0;">Kelola data siswa: tambah, edit, hapus, dan import bulk via Excel.</p>
      </header>

      <section class="card glass">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;align-items:center;">
          <h3 style="margin:0;">1. Bulk Add via Excel</h3>
          <div class="row" style="gap:8px;">
            <button class="btn btn-ghost" id="btn-template">📥 Download Template</button>
            <label class="btn btn-primary" for="import-file" style="cursor:pointer;margin:0;">📤 Import Excel/CSV</label>
            <input id="import-file" type="file" accept=".csv,.xlsx,.xls" style="display:none;" />
          </div>
        </div>
        <p class="muted" style="margin:8px 0 0;font-size:12px;">Format: NIS, NISN, Nama, L/P, Kelas. NIS duplikat dan kelas tidak valid akan ditolak.</p>
        <div id="import-result" class="muted" style="margin-top:8px;font-size:13px;"></div>
      </section>

      <section class="card glass">
        <h3 style="margin:0 0 12px;">2. Filter & Pencarian</h3>
        <div class="row" style="flex-wrap:wrap;gap:8px;">
          <input id="search" type="search" placeholder="🔍 Cari nama / NIS / NISN..." style="flex:1;min-width:220px;padding:10px;border:1px solid var(--color-border);border-radius:8px;font-size:14px;" />
          <select id="filter-class" style="padding:10px;border:1px solid var(--color-border);border-radius:8px;min-width:180px;">
            <option value="">Semua Kelas</option>
          </select>
          <select id="filter-status" style="padding:10px;border:1px solid var(--color-border);border-radius:8px;min-width:140px;">
            <option value="">Semua Status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Tidak Aktif</option>
            <option value="graduated">Lulus</option>
          </select>
        </div>
      </section>

      <section class="card glass">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;align-items:center;margin-bottom:12px;">
          <h3 style="margin:0;">3. Daftar Siswa <span id="student-total" class="muted" style="font-size:14px;font-weight:400;"></span></h3>
          <div class="row" style="gap:8px;">
            <span id="page-info" class="muted" style="font-size:13px;"></span>
          </div>
        </div>

        <div style="overflow-x:auto;border-radius:8px;border:1px solid var(--color-border);">
          <table class="data-table" style="width:100%;border-collapse:collapse;font-size:14px;background:rgba(255,255,255,0.5);">
            <thead>
              <tr style="background:linear-gradient(180deg,#0ea572 0%,#10b981 100%);color:#fff;">
                <th data-sort="idx" style="padding:10px 8px;text-align:center;width:60px;font-weight:600;cursor:pointer;user-select:none;">No</th>
                <th data-sort="nis" style="padding:10px 8px;text-align:left;font-weight:600;cursor:pointer;user-select:none;">NIS</th>
                <th data-sort="name" style="padding:10px 8px;text-align:left;font-weight:600;cursor:pointer;user-select:none;">Nama</th>
                <th data-sort="gender" style="padding:10px 8px;text-align:center;width:80px;font-weight:600;cursor:pointer;user-select:none;">L/P</th>
                <th data-sort="class" style="padding:10px 8px;text-align:left;font-weight:600;cursor:pointer;user-select:none;">Kelas</th>
                <th style="padding:10px 8px;text-align:center;width:140px;font-weight:600;">Aksi</th>
              </tr>
            </thead>
            <tbody id="student-tbody"></tbody>
          </table>
        </div>

        <div id="pagination" class="row" style="justify-content:center;flex-wrap:wrap;gap:4px;margin-top:16px;"></div>
      </section>

      <section class="card glass">
        <h3 style="margin:0 0 8px;">4. Tambah Siswa Manual</h3>
        <div class="row" style="flex-wrap:wrap;gap:8px;">
          <input id="f-nis" type="text" placeholder="NIS" style="width:120px;padding:8px;border:1px solid var(--color-border);border-radius:8px;" />
          <input id="f-nisn" type="text" placeholder="NISN (opsional)" style="width:140px;padding:8px;border:1px solid var(--color-border);border-radius:8px;" />
          <input id="f-name" type="text" placeholder="Nama lengkap" style="flex:1;min-width:180px;padding:8px;border:1px solid var(--color-border);border-radius:8px;" />
          <select id="f-gender" style="padding:8px;border:1px solid var(--color-border);border-radius:8px;">
            <option value="L">Laki-laki</option>
            <option value="P">Perempuan</option>
          </select>
          <select id="f-class" style="padding:8px;border:1px solid var(--color-border);border-radius:8px;min-width:160px;">
            <option value="">— Pilih kelas —</option>
          </select>
          <button class="btn btn-primary" id="btn-add">+ Tambah</button>
        </div>
        <div id="msg" class="muted" style="margin-top:8px;font-size:13px;"></div>
      </section>
    </div>
  `;

  const log = (msg: string) => {
    const el = root.querySelector<HTMLDivElement>('#msg')!;
    el.textContent = `[${formatTime(Date.now())}] ${msg}`;
  };

  const showImportResult = (msg: string, ok: boolean) => {
    const el = root.querySelector<HTMLDivElement>('#import-result')!;
    el.style.color = ok ? 'var(--color-success)' : 'var(--color-danger)';
    el.textContent = msg;
  };

  const refreshClasses = async () => {
    allClasses = await classRepository.list();
    const clsOpts = '<option value="">Semua Kelas</option>' +
      allClasses.map((c) => `<option value="${c.id}">${c.name} (${c.grade})</option>`).join('');
    root.querySelector<HTMLSelectElement>('#filter-class')!.innerHTML = clsOpts;
    const fClsOpts = '<option value="">— Pilih kelas —</option>' +
      allClasses.map((c) => `<option value="${c.id}">${c.name} (${c.grade})</option>`).join('');
    root.querySelector<HTMLSelectElement>('#f-class')!.innerHTML = fClsOpts;
  };

  const refreshStudents = async () => {
    allStudents = await studentRepository.list();
    applyFilter();
  };

  const applyFilter = () => {
    const q = searchQuery.toLowerCase();
    filtered = allStudents.filter((s) => {
      if (classFilter && s.classId !== classFilter) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      if (q) {
        const hay = `${s.name} ${s.nis} ${s.nisn ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
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
      if (sortKey === 'name') { av = a.name; bv = b.name; }
      else if (sortKey === 'nis') { av = a.nis; bv = b.nis; }
      else if (sortKey === 'gender') { av = a.gender; bv = b.gender; }
      else if (sortKey === 'class') {
        av = allClasses.find((c) => c.id === a.classId)?.name ?? '';
        bv = allClasses.find((c) => c.id === b.classId)?.name ?? '';
      }
      return av.localeCompare(bv) * dir;
    });
  };

  const renderTable = () => {
    const tbody = root.querySelector<HTMLTableSectionElement>('#student-tbody')!;
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / ROWS_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    const end = Math.min(start + ROWS_PER_PAGE, total);
    const pageRows = filtered.slice(start, end);

    root.querySelector<HTMLSpanElement>('#student-total')!.textContent = `(${total} siswa)`;
    root.querySelector<HTMLSpanElement>('#page-info')!.textContent =
      total > 0 ? `Halaman ${currentPage} dari ${totalPages} · Menampilkan ${start + 1}–${end}` : '';

    if (total === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--color-text-muted);">Belum ada siswa${searchQuery || classFilter || statusFilter ? ' yang cocok dengan filter' : ''}.</td></tr>`;
    } else {
      tbody.innerHTML = pageRows.map((s, i) => {
        const cls = allClasses.find((c) => c.id === s.classId);
        const clsName = cls ? `${cls.name}` : '—';
        return `<tr style="border-top:1px solid var(--color-border);">
          <td style="padding:8px;text-align:center;color:var(--color-text-muted);">${start + i + 1}</td>
          <td style="padding:8px;">${s.nis}</td>
          <td style="padding:8px;"><strong>${s.name}</strong>${s.nisn ? `<br><span class="muted" style="font-size:11px;">NISN: ${s.nisn}</span>` : ''}</td>
          <td style="padding:8px;text-align:center;">${s.gender === 'L' ? '♂' : '♀'}</td>
          <td style="padding:8px;">${clsName}</td>
          <td style="padding:8px;text-align:center;">
            <button class="btn btn-ghost" data-edit="${s.id}" style="padding:4px 8px;min-height:28px;font-size:12px;">Edit</button>
            <button class="btn btn-danger" data-del="${s.id}" style="padding:4px 8px;min-height:28px;font-size:12px;margin-left:4px;">Hapus</button>
          </td>
        </tr>`;
      }).join('');
    }

    // Pagination
    const pgEl = root.querySelector<HTMLDivElement>('#pagination')!;
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

      pgEl.querySelectorAll<HTMLButtonElement>('[data-page]').forEach((b: HTMLButtonElement) => {
        b.addEventListener('click', () => {
          const p = parseInt(b.dataset.page!, 10);
          if (!isNaN(p) && p >= 1 && p <= totalPages) {
            currentPage = p;
            renderTable();
          }
        });
      });
    }

    // Bind row actions
    tbody.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b: HTMLButtonElement) => {
      b.addEventListener('click', async () => {
        const id = b.dataset.del!;
        const s = allStudents.find((x) => x.id === id);
        if (!s) return;
        if (!confirm(`Hapus siswa "${s.name}" (${s.nis})? Face profile juga akan terhapus.`)) return;
        try {
          await studentRepository.remove(id);
          log(`✓ Siswa dihapus: ${s.name}`);
          await refreshStudents();
        } catch (err: unknown) {
          log(`✗ Error: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
    });
    tbody.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach((b: HTMLButtonElement) => {
      b.addEventListener('click', () => {
        const id = b.dataset.edit!;
        const s = allStudents.find((x) => x.id === id);
        if (!s) return;
        openEdit(s);
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
        log(`✓ Siswa diupdate: ${s.nis}`);
        await refreshStudents();
      } catch (err: unknown) {
        log(`✗ Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
  };

  // === Event bindings ===
  root.querySelector<HTMLInputElement>('#search')!.addEventListener('input', (e) => {
    searchQuery = (e.target as HTMLInputElement).value;
    applyFilter();
  });
  root.querySelector<HTMLSelectElement>('#filter-class')!.addEventListener('change', (e) => {
    classFilter = (e.target as HTMLSelectElement).value;
    applyFilter();
  });
  root.querySelector<HTMLSelectElement>('#filter-status')!.addEventListener('change', (e) => {
    statusFilter = (e.target as HTMLSelectElement).value;
    applyFilter();
  });

  // Sort by column header click
  root.querySelectorAll<HTMLTableCellElement>('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (k === 'idx' || k === 'no') return;
      if (sortKey === k) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortKey = k as SortKey;
        sortDir = 'asc';
      }
      // Update header indicator
      root.querySelectorAll<HTMLTableCellElement>('th[data-sort]').forEach((h) => {
        h.textContent = (h.textContent || '').replace(/ [↑↓]$/, '');
      });
      th.textContent = (th.textContent || '') + (sortDir === 'asc' ? ' ↑' : ' ↓');
      applyFilter();
    });
  });

  // Manual add
  const showDuplicateModal = (existing: Student) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.55);backdrop-filter:blur(4px);padding:16px;';
    const cls = allClasses.find((c) => c.id === existing.classId);
    overlay.innerHTML = `
      <div class="glass" style="max-width:420px;width:100%;padding:24px;box-shadow:var(--shadow-lg);">
        <h3 style="margin:0 0 4px;color:var(--color-danger);">⚠ Data Sudah Ada</h3>
        <p class="muted" style="margin:0 0 16px;font-size:13px;">Siswa dengan NIS atau NISN yang sama sudah terdaftar.</p>
        <div style="background:rgba(255,255,255,0.6);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:12px;font-size:14px;">
          <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 12px;">
            <span class="muted" style="font-size:12px;">NIS</span><strong>${existing.nis}</strong>
            <span class="muted" style="font-size:12px;">NISN</span><strong>${existing.nisn ?? '—'}</strong>
            <span class="muted" style="font-size:12px;">Nama</span><strong>${existing.name}</strong>
            <span class="muted" style="font-size:12px;">L/P</span><strong>${existing.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</strong>
            <span class="muted" style="font-size:12px;">Kelas</span><strong>${cls ? `${cls.name} (${cls.grade})` : '—'}</strong>
            <span class="muted" style="font-size:12px;">Status</span><strong>${existing.status ?? 'aktif'}</strong>
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

  root.querySelector<HTMLButtonElement>('#btn-add')!.addEventListener('click', async () => {
    const nis = root.querySelector<HTMLInputElement>('#f-nis')!.value.trim();
    const nisn = root.querySelector<HTMLInputElement>('#f-nisn')!.value.trim() || undefined;
    const name = root.querySelector<HTMLInputElement>('#f-name')!.value.trim();
    const gender = root.querySelector<HTMLSelectElement>('#f-gender')!.value as Gender;
    const classId = root.querySelector<HTMLSelectElement>('#f-class')!.value;
    if (!nis || !name || !classId) {
      log('⚠ NIS, nama, dan kelas wajib diisi.');
      return;
    }
    const existing = allStudents.find((s) => s.nis === nis || (nisn && s.nisn && s.nisn === nisn));
    if (existing) {
      showDuplicateModal(existing);
      return;
    }
    try {
      const s = await studentRepository.create({ nis, nisn, name, gender, classId });
      log(`✓ Siswa dibuat: ${s.name} (${s.nis})`);
      root.querySelector<HTMLInputElement>('#f-nis')!.value = '';
      root.querySelector<HTMLInputElement>('#f-nisn')!.value = '';
      root.querySelector<HTMLInputElement>('#f-name')!.value = '';
      await refreshStudents();
    } catch (err: unknown) {
      log(`✗ ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // Download template (auto-populated with class data)
  root.querySelector<HTMLButtonElement>('#btn-template')!.addEventListener('click', () => {
    if (allClasses.length === 0) {
      showImportResult('⚠ Belum ada kelas. Buat kelas dulu di menu Kelas.', false);
      return;
    }
    const lines = ['NIS,NISN,Nama,L/P,Kelas'];
    for (const c of allClasses) {
      for (let i = 1; i <= 3; i++) {
        const sampleNis = `${c.grade.replace(/\D/g, '')}${String(i).padStart(2, '0')}000${i}`;
        const sampleName = `[Siswa ${i} - ${c.name}]`;
        lines.push(`${sampleNis},,${sampleName},L,${c.name}`);
      }
    }
    const csv = lines.join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template-siswa-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showImportResult(`✓ Template didownload dengan ${allClasses.length} kelas (${lines.length - 1} baris contoh)`, true);
  });

  // Import CSV/Excel
  root.querySelector<HTMLInputElement>('#import-file')!.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await processImport(text);
    } catch (err: unknown) {
      showImportResult(`✗ Error baca file: ${err instanceof Error ? err.message : String(err)}`, false);
    }
  });

  const processImport = async (text: string) => {
    const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      showImportResult('⚠ File kosong atau hanya header.', false);
      return;
    }
    const parseRow = (line: string): string[] => {
      const out: string[] = [];
      let cur = '';
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
          else inQ = !inQ;
        } else if (c === ',' && !inQ) {
          out.push(cur); cur = '';
        } else cur += c;
      }
      out.push(cur);
      return out.map((s) => s.trim());
    };
    const header = parseRow(lines[0]).map((h) => h.toLowerCase());
    const idxNis = header.indexOf('nis');
    const idxNisn = header.indexOf('nisn');
    const idxName = header.findIndex((h) => h === 'nama' || h === 'name');
    const idxGender = header.findIndex((h) => h === 'l/p' || h === 'gender' || h === 'jenis_kelamin');
    const idxClass = header.findIndex((h) => h === 'kelas' || h === 'class');
    if (idxNis < 0 || idxName < 0 || idxGender < 0 || idxClass < 0) {
      showImportResult('✗ Header tidak valid. Wajib ada: NIS, Nama, L/P, Kelas.', false);
      return;
    }
    const normalizeGender = (v: string): Gender | null => {
      const s = v.toUpperCase().trim();
      if (s === 'L' || s === 'LAKI' || s === 'M') return 'L';
      if (s === 'P' || s === 'PEREMPUAN' || s === 'F') return 'P';
      return null;
    };
    const existingNis = new Set(allStudents.map((s) => s.nis));
    const existingNisn = new Set(allStudents.map((s) => s.nisn).filter(Boolean));
    const classByName = new Map(allClasses.map((c) => [c.name.toLowerCase(), c]));

    let success = 0;
    const errors: string[] = [];
    const skipped: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const row = parseRow(lines[i]);
      const nis = row[idxNis] ?? '';
      const nisn = (idxNisn >= 0 ? row[idxNisn] : '') ?? '';
      const name = row[idxName] ?? '';
      const genderRaw = row[idxGender] ?? '';
      const className = row[idxClass] ?? '';
      const gender = normalizeGender(genderRaw);
      const cls = classByName.get(className.toLowerCase());

      if (!nis || !name || !gender) {
        errors.push(`Baris ${i + 1}: data tidak lengkap / gender invalid`);
        continue;
      }
      if (existingNis.has(nis)) {
        skipped.push(`Baris ${i + 1}: NIS "${nis}" sudah ada`);
        continue;
      }
      if (nisn && existingNisn.has(nisn)) {
        skipped.push(`Baris ${i + 1}: NISN "${nisn}" sudah ada`);
        continue;
      }
      if (!cls) {
        errors.push(`Baris ${i + 1}: kelas "${className}" tidak terdaftar`);
        continue;
      }
      try {
        await studentRepository.create({ nis, nisn: nisn || undefined, name, gender, classId: cls.id });
        existingNis.add(nis);
        if (nisn) existingNisn.add(nisn);
        success++;
      } catch (err: unknown) {
        errors.push(`Baris ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const parts: string[] = [];
    parts.push(`✓ ${success} siswa diimport`);
    if (skipped.length > 0) parts.push(`⚠ ${skipped.length} dilewati (duplikat)`);
    if (errors.length > 0) parts.push(`✗ ${errors.length} gagal`);
    showImportResult(parts.join(' · '), success > 0);

    if (errors.length > 0) console.warn('Import errors:', errors);
    if (skipped.length > 0) console.warn('Import skipped:', skipped);

    await refreshStudents();
  };

  await refreshClasses();
  await refreshStudents();
}