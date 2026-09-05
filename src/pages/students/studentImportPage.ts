import { studentRepository, classRepository } from '@repositories/index';
import { ROUTES } from '@config/app';
import { formatTime } from '@utils/device';
import type { ClassRoom, Gender } from '@models/types';

interface ParsedRow {
  nis: string;
  nisn: string;
  name: string;
  gender: Gender;
  className: string;
  valid: boolean;
  errors: string[];
  raw: string;
}

const SAMPLE_CSV = `NIS,NISN,Nama,L/P,Kelas
24001,1234567890,Ahmad Fauzan,L,XII IPA 1
24002,1234567891,Fatimah Azzahra,P,XII IPA 1
24003,1234567892,Ali Rahman,L,XII IPA 2
24004,1234567893,Nia Kurniasih,P,XII IPA 2
`;

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    result.push(cur);
    return result.map((s) => s.trim());
  };

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

function normalizeGender(v: string): Gender | null {
  const s = v.trim().toUpperCase();
  if (s === 'L' || s === 'LAKI' || s === 'LAKI-LAKI' || s === 'M') return 'L';
  if (s === 'P' || s === 'PEREMPUAN' || s === 'F') return 'P';
  return null;
}

function findHeader(headers: string[], aliases: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim().toLowerCase();
    if (aliases.includes(h)) return i;
  }
  return -1;
}

export async function renderStudentImport(root: HTMLElement): Promise<void> {
  let classes: ClassRoom[] = [];
  let parsed: ParsedRow[] = [];
  let csvText = '';
  let autoCreateClass = true;

  root.innerHTML = `
    <div class="stack">
      <header>
        <div class="row" style="align-items:center;gap:8px;">
          <a href="${ROUTES.students}" data-link class="btn btn-ghost" style="padding:6px 10px;min-height:32px;font-size:13px;">← Kembali</a>
          <h2 style="margin:0;">Import Siswa dari CSV</h2>
        </div>
        <p class="muted" style="margin:4px 0 0;">Upload CSV dengan kolom: <code>NIS, NISN, Nama, L/P, Kelas</code>. Header row wajib ada.</p>
      </header>

      <section class="card stack">
        <h3 style="margin:0;">1. Pilih File CSV</h3>
        <div class="row" style="flex-wrap:wrap;gap:8px;">
          <label class="btn btn-primary" for="csv-file" style="cursor:pointer;">Pilih File CSV</label>
          <input id="csv-file" type="file" accept=".csv,text/csv" style="display:none;" />
          <button class="btn btn-ghost" id="btn-paste">Paste dari Clipboard</button>
          <button class="btn btn-ghost" id="btn-sample">Isi Sample</button>
        </div>
        <textarea id="csv-text" placeholder="Paste CSV di sini, atau klik 'Isi Sample' untuk contoh..." style="width:100%;min-height:140px;padding:10px;border:1px solid var(--color-border);border-radius:8px;font-family:monospace;font-size:13px;"></textarea>
        <div class="row" style="gap:8px;">
          <label class="row" style="gap:6px;font-size:13px;">
            <input id="auto-create-class" type="checkbox" ${autoCreateClass ? 'checked' : ''} />
            Auto-create kelas jika belum ada
          </label>
          <button class="btn btn-primary" id="btn-parse">Parse & Preview</button>
        </div>
      </section>

      <section class="card stack" id="preview-section" style="display:none;">
        <h3 style="margin:0;">2. Preview</h3>
        <div id="preview-summary" class="muted"></div>
        <div id="preview-table" style="max-height:340px;overflow:auto;"></div>
        <div class="row" style="gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary" id="btn-import">Import <span id="btn-import-count">0</span> siswa valid</button>
          <button class="btn btn-ghost" id="btn-skip-invalid">Lewati yang invalid</button>
        </div>
      </section>

      <section class="card stack">
        <h3 style="margin:0;">Log</h3>
        <pre id="log" style="background:#0f172a;color:#cbd5e1;padding:12px;border-radius:8px;max-height:200px;overflow:auto;margin:0;font-size:12px;"></pre>
      </section>
    </div>
  `;

  const csvFile = root.querySelector<HTMLInputElement>('#csv-file')!;
  const csvTextArea = root.querySelector<HTMLTextAreaElement>('#csv-text')!;
  const autoCreate = root.querySelector<HTMLInputElement>('#auto-create-class')!;
  const btnParse = root.querySelector<HTMLButtonElement>('#btn-parse')!;
  const btnPaste = root.querySelector<HTMLButtonElement>('#btn-paste')!;
  const btnSample = root.querySelector<HTMLButtonElement>('#btn-sample')!;
  const previewSection = root.querySelector<HTMLElement>('#preview-section')!;
  const previewSummary = root.querySelector<HTMLDivElement>('#preview-summary')!;
  const previewTable = root.querySelector<HTMLDivElement>('#preview-table')!;
  const btnImport = root.querySelector<HTMLButtonElement>('#btn-import')!;
  const btnImportCount = root.querySelector<HTMLSpanElement>('#btn-import-count')!;
  const btnSkipInvalid = root.querySelector<HTMLButtonElement>('#btn-skip-invalid')!;
  const logEl = root.querySelector<HTMLPreElement>('#log')!;

  const log = (msg: string) => {
    const ts = formatTime(Date.now());
    logEl.textContent = `[${ts}] ${msg}\n` + logEl.textContent;
  };

  classes = await classRepository.list();

  csvFile.addEventListener('change', async () => {
    const f = csvFile.files?.[0];
    if (!f) return;
    try {
      csvText = await f.text();
      csvTextArea.value = csvText;
      log(`File loaded: ${f.name} (${csvText.length} chars).`);
    } catch (err: unknown) {
      log(`ERROR baca file: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  btnPaste.addEventListener('click', async () => {
    try {
      csvText = await navigator.clipboard.readText();
      csvTextArea.value = csvText;
      log('Pasted dari clipboard.');
    } catch (err: unknown) {
      log(`ERROR paste: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  btnSample.addEventListener('click', () => {
    csvText = SAMPLE_CSV;
    csvTextArea.value = csvText;
    log('Sample CSV diisi.');
  });

  autoCreate.addEventListener('change', () => {
    autoCreateClass = autoCreate.checked;
  });

  btnParse.addEventListener('click', async () => {
    const text = csvTextArea.value.trim();
    if (!text) {
      log('CSV kosong.');
      return;
    }
    classes = await classRepository.list();
    parsed = parseAndValidate(text, classes);
    const validCount = parsed.filter((r) => r.valid).length;
    const invalidCount = parsed.length - validCount;
    previewSection.style.display = 'block';
    previewSummary.innerHTML = `Total: <strong>${parsed.length}</strong> baris · Valid: <strong style="color:var(--color-success);">${validCount}</strong> · Invalid: <strong style="color:var(--color-danger);">${invalidCount}</strong>`;
    btnImportCount.textContent = String(validCount);
    btnImport.disabled = validCount === 0;
    previewTable.innerHTML = renderPreviewTable(parsed, classes);
    log(`Parsed: ${validCount} valid, ${invalidCount} invalid.`);
  });

  btnImport.addEventListener('click', async () => {
    const validRows = parsed.filter((r) => r.valid);
    if (validRows.length === 0) return;
    btnImport.disabled = true;
    log(`Importing ${validRows.length} siswa...`);
    let ok = 0;
    let fail = 0;
    const classCache = new Map(classes.map((c) => [c.name, c]));

    for (const r of validRows) {
      try {
        let cls = classCache.get(r.className);
        if (!cls && autoCreateClass) {
          const academicYearId = 'IMPORT-' + new Date().getFullYear();
          cls = await classRepository.create({
            name: r.className,
            grade: extractGrade(r.className),
            academicYearId
          });
          classCache.set(r.className, cls);
        }
        if (!cls) {
          fail++;
          log(`SKIP ${r.nis}: kelas "${r.className}" tidak ada.`);
          continue;
        }
        await studentRepository.create({
          nis: r.nis,
          nisn: r.nisn || undefined,
          name: r.name,
          gender: r.gender,
          classId: cls.id
        });
        ok++;
      } catch (err: unknown) {
        fail++;
        const msg = err instanceof Error ? err.message : String(err);
        log(`FAIL ${r.nis}: ${msg}`);
      }
    }
    log(`Selesai. Berhasil: ${ok}, Gagal: ${fail}.`);
    btnImport.disabled = false;
    btnImport.textContent = 'Lihat Daftar Siswa →';
    btnImport.onclick = () => { window.location.href = ROUTES.students; };
  });

  btnSkipInvalid.addEventListener('click', () => {
    parsed = parsed.filter((r) => r.valid);
    previewTable.innerHTML = renderPreviewTable(parsed, classes);
    const validCount = parsed.length;
    btnImportCount.textContent = String(validCount);
    previewSummary.innerHTML = `Total: <strong>${parsed.length}</strong> baris valid (invalid sudah difilter).`;
    if (validCount === 0) btnImport.disabled = true;
  });
}

function extractGrade(name: string): string {
  const m = name.match(/^([XVI]+|\d+)/i);
  return m ? m[1].toUpperCase() : '';
}

function parseAndValidate(text: string, classes: ClassRoom[]): ParsedRow[] {
  const { headers, rows } = parseCsv(text);
  if (headers.length === 0) return [];
  const idxNis = findHeader(headers, ['nis']);
  const idxNisn = findHeader(headers, ['nisn']);
  const idxName = findHeader(headers, ['nama', 'name']);
  const idxGender = findHeader(headers, ['l/p', 'gender', 'jenis_kelamin', 'jk']);
  const idxClass = findHeader(headers, ['kelas', 'class']);

  if (idxNis < 0 || idxName < 0 || idxGender < 0 || idxClass < 0) {
    return [{
      nis: '',
      nisn: '',
      name: '',
      gender: 'L',
      className: '',
      valid: false,
      errors: [`Header wajib: NIS, Nama, L/P, Kelas. Ditemukan: ${headers.join(', ')}`],
      raw: text.split('\n')[0] ?? ''
    }];
  }

  const classNames = new Set(classes.map((c) => c.name.toLowerCase()));

  return rows.map((cols) => {
    const errors: string[] = [];
    const nis = idxNis >= 0 ? (cols[idxNis] ?? '').trim() : '';
    const nisn = idxNisn >= 0 ? (cols[idxNisn] ?? '').trim() : '';
    const name = idxName >= 0 ? (cols[idxName] ?? '').trim() : '';
    const genderRaw = idxGender >= 0 ? (cols[idxGender] ?? '').trim() : '';
    const className = idxClass >= 0 ? (cols[idxClass] ?? '').trim() : '';

    const gender = normalizeGender(genderRaw);
    if (!nis) errors.push('NIS kosong');
    if (!name) errors.push('Nama kosong');
    if (!gender) errors.push(`L/P invalid: "${genderRaw}"`);
    if (!className) errors.push('Kelas kosong');
    if (className && !classNames.has(className.toLowerCase())) errors.push(`Kelas "${className}" belum ada di database`);

    return {
      nis,
      nisn,
      name,
      gender: gender ?? 'L',
      className,
      valid: errors.length === 0,
      errors,
      raw: cols.join(',')
    };
  });
}

function renderPreviewTable(rows: ParsedRow[], _classes: ClassRoom[]): string {
  if (rows.length === 0) return '<p class="muted">Tidak ada baris.</p>';
  return `<table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:var(--color-bg-elev);color:var(--color-text-inverse);">
        <th style="padding:6px;text-align:left;">#</th>
        <th style="padding:6px;text-align:left;">Status</th>
        <th style="padding:6px;text-align:left;">NIS</th>
        <th style="padding:6px;text-align:left;">NISN</th>
        <th style="padding:6px;text-align:left;">Nama</th>
        <th style="padding:6px;text-align:left;">L/P</th>
        <th style="padding:6px;text-align:left;">Kelas</th>
        <th style="padding:6px;text-align:left;">Error</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((r, i) => `
        <tr style="border-bottom:1px solid var(--color-border);${r.valid ? '' : 'background:#fef2f2;'}">
          <td style="padding:6px;">${i + 1}</td>
          <td style="padding:6px;color:${r.valid ? 'var(--color-success)' : 'var(--color-danger)'};">${r.valid ? '✓' : '✗'}</td>
          <td style="padding:6px;">${escapeHtml(r.nis)}</td>
          <td style="padding:6px;">${escapeHtml(r.nisn)}</td>
          <td style="padding:6px;">${escapeHtml(r.name)}</td>
          <td style="padding:6px;">${escapeHtml(r.gender)}</td>
          <td style="padding:6px;">${escapeHtml(r.className)}</td>
          <td style="padding:6px;color:var(--color-danger);font-size:12px;">${r.errors.join('; ')}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}