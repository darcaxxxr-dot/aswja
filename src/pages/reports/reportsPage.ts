import { reportService, type AttendanceWithContext } from '@services/reports';
import { classRepository } from '@repositories/index';
import { formatTime } from '@utils/device';
import type { AttendanceStatus, ClassRoom } from '@models/types';

interface FilterState {
  classId: string;
  dateFrom: string;
  dateTo: string;
  status: AttendanceStatus | '';
}

export async function renderReports(root: HTMLElement): Promise<void> {
  let classes: ClassRoom[] = [];
  const filter: FilterState = {
    classId: '',
    dateFrom: '',
    dateTo: '',
    status: ''
  };

  root.innerHTML = `
    <div class="stack">
      <header>
        <h2 style="margin:0 0 4px;">Laporan Absensi</h2>
        <p class="muted" style="margin:0;">Filter, lihat, dan export data absensi ke CSV.</p>
      </header>

      <section class="card stack">
        <h3 style="margin:0;">Filter</h3>
        <div class="row" style="flex-wrap:wrap;gap:8px;">
          <select id="f-class" style="padding:10px;border:1px solid var(--color-border);border-radius:8px;min-width:160px;">
            <option value="">Semua kelas</option>
          </select>
          <label class="row" style="gap:6px;">Dari: <input id="f-from" type="date" style="padding:10px;border:1px solid var(--color-border);border-radius:8px;" /></label>
          <label class="row" style="gap:6px;">Sampai: <input id="f-to" type="date" style="padding:10px;border:1px solid var(--color-border);border-radius:8px;" /></label>
          <select id="f-status" style="padding:10px;border:1px solid var(--color-border);border-radius:8px;">
            <option value="">Semua status</option>
            <option value="HADIR">HADIR</option>
            <option value="TERLAMBAT">TERLAMBAT</option>
            <option value="IZIN">IZIN</option>
            <option value="SAKIT">SAKIT</option>
            <option value="ALPA">ALPA</option>
          </select>
          <button class="btn btn-primary" id="btn-apply">Terapkan</button>
          <button class="btn btn-ghost" id="btn-reset">Reset</button>
        </div>
      </section>

      <section class="card stack">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;">
          <h3 style="margin:0;">Hasil <span id="counter" class="muted" style="font-size:14px;font-weight:400;"></span></h3>
          <div class="row">
            <button class="btn btn-primary" id="btn-csv">Export CSV</button>
          </div>
        </div>
        <div id="list" class="stack" style="max-height:560px;overflow:auto;"></div>
      </section>
    </div>
  `;

  const fClass = root.querySelector<HTMLSelectElement>('#f-class')!;
  const fFrom = root.querySelector<HTMLInputElement>('#f-from')!;
  const fTo = root.querySelector<HTMLInputElement>('#f-to')!;
  const fStatus = root.querySelector<HTMLSelectElement>('#f-status')!;
  const btnApply = root.querySelector<HTMLButtonElement>('#btn-apply')!;
  const btnReset = root.querySelector<HTMLButtonElement>('#btn-reset')!;
  const btnCsv = root.querySelector<HTMLButtonElement>('#btn-csv')!;
  const counter = root.querySelector<HTMLSpanElement>('#counter')!;
  const listEl = root.querySelector<HTMLDivElement>('#list')!;

  const refreshClasses = async () => {
    classes = await classRepository.list();
    fClass.innerHTML = '<option value="">Semua kelas</option>' +
      classes.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
  };

  const renderRows = (rows: AttendanceWithContext[]) => {
    counter.textContent = `(${rows.length} record)`;
    if (rows.length === 0) {
      listEl.innerHTML = '<p class="muted" style="margin:0;">Tidak ada record sesuai filter.</p>';
      return;
    }
    listEl.innerHTML = `
      <div style="display:grid;grid-template-columns:120px 80px 1fr 120px 110px 120px;gap:8px;font-size:12px;font-weight:600;padding:6px 8px;border-bottom:1px solid var(--color-border);">
        <div>Tanggal</div><div>Jam</div><div>Nama</div><div>NIS</div><div>Kelas</div><div>Status</div>
      </div>
      ${rows
        .map(({ record, student, classRoom }) => {
          const d = new Date(record.timestamp);
          const date = d.toISOString().slice(0, 10);
          const time = formatTime(record.timestamp);
          const statusColor =
            record.status === 'HADIR' ? 'var(--color-success)' :
            record.status === 'TERLAMBAT' ? 'var(--color-warn)' :
            record.status === 'ALPA' ? 'var(--color-danger)' :
            'var(--color-text)';
          return `
          <div style="display:grid;grid-template-columns:120px 80px 1fr 120px 110px 120px;gap:8px;align-items:center;padding:8px;border-bottom:1px solid var(--color-border);font-size:14px;">
            <div class="muted" style="font-size:13px;">${date}</div>
            <div class="muted" style="font-size:13px;">${time}</div>
            <div><strong>${student?.name ?? '(?)'}</strong></div>
            <div class="muted" style="font-size:13px;">${student?.nis ?? '?'}</div>
            <div class="muted" style="font-size:13px;">${classRoom?.name ?? '?'}</div>
            <div style="font-weight:700;color:${statusColor};">${record.status}</div>
          </div>`;
        })
        .join('')}
    `;
  };

  const run = async () => {
    const rows = await reportService.listRecordsWithContext({
      classId: filter.classId || undefined,
      dateFrom: filter.dateFrom || undefined,
      dateTo: filter.dateTo || undefined,
      status: (filter.status || undefined) as AttendanceStatus | undefined
    });
    renderRows(rows);
  };

  const apply = () => {
    filter.classId = fClass.value;
    filter.dateFrom = fFrom.value;
    filter.dateTo = fTo.value;
    filter.status = fStatus.value as AttendanceStatus | '';
    void run();
  };

  btnApply.addEventListener('click', apply);

  btnReset.addEventListener('click', () => {
    fClass.value = '';
    fFrom.value = '';
    fTo.value = '';
    fStatus.value = '';
    filter.classId = '';
    filter.dateFrom = '';
    filter.dateTo = '';
    filter.status = '';
    void run();
  });

  btnCsv.addEventListener('click', async () => {
    const csv = await reportService.exportCsv({
      classId: filter.classId || undefined,
      dateFrom: filter.dateFrom || undefined,
      dateTo: filter.dateTo || undefined,
      status: (filter.status || undefined) as AttendanceStatus | undefined
    });
    reportService.downloadCsv(reportService.buildFilename(), csv);
  });

  await refreshClasses();
  await run();
}