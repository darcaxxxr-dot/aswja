import { ROUTES } from '@config/app';
import { reportService } from '@services/reports';
import { formatTime } from '@utils/device';

export async function renderDashboard(root: HTMLElement): Promise<void> {
  root.innerHTML = `
    <div class="stack">
      <header>
        <h2 style="margin:0 0 4px;">Dashboard</h2>
        <p class="muted" style="margin:0;">Ringkasan absensi & statistik hari ini.</p>
      </header>

      <section class="card stack">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;">
          <strong id="dash-date" style="font-size:18px;">—</strong>
          <div class="row">
            <button class="btn btn-ghost" id="btn-refresh">Refresh</button>
            <a href="${ROUTES.attendance}" data-link class="btn btn-primary">Buka Absensi</a>
          </div>
        </div>
        <div class="stat-grid" id="top-stats">
          <div class="stat"><div class="label">Total Siswa</div><div class="value">—</div></div>
          <div class="stat"><div class="label">Total Kelas</div><div class="value">—</div></div>
          <div class="stat"><div class="label">Hadir</div><div class="value" style="color:var(--color-success);">—</div></div>
          <div class="stat"><div class="label">Terlambat</div><div class="value" style="color:var(--color-warn);">—</div></div>
          <div class="stat"><div class="label">Izin / Sakit</div><div class="value">—</div></div>
          <div class="stat"><div class="label">Alpa</div><div class="value" style="color:var(--color-danger);">—</div></div>
          <div class="stat"><div class="label">Belum Absen</div><div class="value" style="color:var(--color-text-muted);">—</div></div>
        </div>
      </section>

      <section class="card stack">
        <h3 style="margin:0;">Per Kelas (hari ini)</h3>
        <div id="per-class" class="stack" style="max-height:320px;overflow:auto;"></div>
      </section>

      <section class="card stack">
        <h3 style="margin:0;">Recent Attendance</h3>
        <div id="recent" class="stack" style="max-height:380px;overflow:auto;"></div>
      </section>

      <section class="card">
        <p class="muted" style="margin:0;font-size:13px;">
          Tool dev: <a href="${ROUTES.cameraTest}" data-link>Camera Test</a> ·
          <a href="/face-test" data-link>Face AI PoC</a> ·
          <a href="/db-test" data-link>DB Test</a> ·
          <a href="/supabase-test" data-link>Supabase Test</a>
        </p>
      </section>
    </div>
  `;

  const dateEl = root.querySelector<HTMLElement>('#dash-date')!;
  const topStats = root.querySelector<HTMLDivElement>('#top-stats')!;
  const perClass = root.querySelector<HTMLDivElement>('#per-class')!;
  const recent = root.querySelector<HTMLDivElement>('#recent')!;
  const btnRefresh = root.querySelector<HTMLButtonElement>('#btn-refresh')!;

  const refresh = async () => {
    const metrics = await reportService.getDashboardTodayMetrics();
    dateEl.textContent = `Hari ini: ${metrics.todayDate}`;

    const topValues = topStats.querySelectorAll<HTMLDivElement>('.stat .value');
    if (topValues.length >= 7) {
      topValues[0].textContent = String(metrics.totalStudents);
      topValues[1].textContent = String(metrics.totalClasses);
      topValues[2].textContent = String(metrics.today.hadir);
      topValues[3].textContent = String(metrics.today.terlambat);
      topValues[4].textContent = `${metrics.today.izin} / ${metrics.today.sakit}`;
      topValues[5].textContent = String(metrics.today.alpa);
      topValues[6].textContent = String(metrics.today.belum);
    }

    if (metrics.perClass.length === 0) {
      perClass.innerHTML = '<p class="muted" style="margin:0;">Belum ada kelas. <a href="' + ROUTES.classes + '" data-link>Setup kelas</a>.</p>';
    } else {
      perClass.innerHTML = metrics.perClass
        .map(({ classRoom, total, present, late, belum }) => {
          const pct = total > 0 ? Math.round(((present) / total) * 100) : 0;
          return `
          <div class="card" style="padding:10px;">
            <div class="row" style="justify-content:space-between;">
              <div><strong>${classRoom?.name ?? '(kelas tidak ditemukan)'}</strong> <span class="muted" style="font-size:12px;">· ${classRoom?.grade ?? ''}</span></div>
              <div class="muted" style="font-size:12px;">${present}/${total} hadir (${pct}%)</div>
            </div>
            <div style="height:6px;background:var(--color-border);border-radius:3px;margin-top:6px;overflow:hidden;">
              <div style="height:100%;width:${pct}%;background:var(--color-success);"></div>
            </div>
            <div class="muted" style="font-size:12px;margin-top:6px;">
              HADIR+TERLAMBAT: ${present} · TERLAMBAT saja: ${late} · Belum: ${belum}
            </div>
          </div>`;
        })
        .join('');
    }

    const recentRows = await reportService.getRecentAttendance(20);
    if (recentRows.length === 0) {
      recent.innerHTML = '<p class="muted" style="margin:0;">Belum ada absensi tercatat.</p>';
    } else {
      recent.innerHTML = recentRows
        .map(({ record, student, classRoom }) => {
          const statusColor =
            record.status === 'HADIR' ? 'var(--color-success)' :
            record.status === 'TERLAMBAT' ? 'var(--color-warn)' :
            record.status === 'ALPA' ? 'var(--color-danger)' :
            'var(--color-text-muted)';
          return `
          <div class="card" style="padding:10px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <div>
              <div><strong>${student?.name ?? '(siswa tidak ditemukan)'}</strong> <span class="muted" style="font-size:12px;">· ${student?.nis ?? '?'}</span></div>
              <div class="muted" style="font-size:12px;">${classRoom?.name ?? '?'} · ${formatTime(record.timestamp)} · conf=${record.confidence.toFixed(2)}</div>
            </div>
            <div style="font-weight:700;color:${statusColor};">${record.status}</div>
          </div>`;
        })
        .join('');
    }
  };

  btnRefresh.addEventListener('click', () => void refresh());
  await refresh();
}