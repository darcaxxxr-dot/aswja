import { cameraService, CameraError } from '@services/camera';
import { faceModelLoader, FaceError } from '@services/face';
import { attendanceService, attendanceConfigService, prayerConfigService, determineAutoStatus } from '@services/attendance';
import { classRepository, studentRepository, faceProfileRepository } from '@repositories/index';
import { formatTime } from '@utils/device';
import { soundService } from '@services/sound';
import type { AttendanceRecord, AttendanceSession, AttendanceStatus, ClassRoom, Student, PrayerName } from '@models/types';

interface StudentRow {
  student: Student;
  record: AttendanceRecord | null;
}

const STATUS_OPTIONS: AttendanceStatus[] = ['HADIR', 'TERLAMBAT', 'IZIN', 'SAKIT', 'ALPA'];
const PRAYER_NAMES: PrayerName[] = ['SUBUH', 'DHUHUR', 'ASHAR', 'MAGHRIB', 'ISYA'];

export async function renderAttendance(root: HTMLElement): Promise<void> {
  let classes: ClassRoom[] = [];
  let currentSession: AttendanceSession | null = null;
  let currentClass: ClassRoom | null = null;
  let rows: StudentRow[] = [];
  let isRunning = false;
  let runRaf: number | null = null;
  let attendanceMode: 'CLASS' | 'PRAYER' = 'CLASS';

  root.innerHTML = `
    <div class="stack">
      <header>
        <h2 style="margin:0 0 4px;">Sesi Absensi</h2>
        <p class="muted" style="margin:0;">Buka sesi → scan wajah siswa → otomatis HADIR / TERLAMBAT. Duplicate dicegah otomatis.</p>
      </header>

      <section class="card stack">
        <h3 style="margin:0;">1. Pilih Tipe Absensi</h3>
        <div class="row" style="flex-wrap:wrap;gap:12px;align-items:center;">
          <label class="row" style="gap:6px;font-size:14px;">
            <input type="radio" name="attendance-mode" value="CLASS" checked /> Absensi Kelas (kelas spesifik)
          </label>
          <label class="row" style="gap:6px;font-size:14px;">
            <input type="radio" name="attendance-mode" value="PRAYER" /> Absensi Shalat (school-wide)
          </label>
        </div>

        <div class="row" style="flex-wrap:wrap;gap:8px;" id="class-section">
          <select id="sel-class" style="padding:10px;border:1px solid var(--color-border);border-radius:8px;min-width:200px;">
            <option value="">— Pilih kelas —</option>
          </select>
        </div>

        <div class="row" style="flex-wrap:wrap;gap:8px;display:none;" id="prayer-section">
          <select id="sel-prayer" style="padding:10px;border:1px solid var(--color-border);border-radius:8px;min-width:180px;">
            <option value="">— Pilih shalat —</option>
            ${PRAYER_NAMES.map(p => `<option value="${p}">${p}</option>`).join('')}
          </select>
          <div id="prayer-times-info" class="muted" style="font-size:12px;margin-left:12px;">
            (Waktu shalat akan ditampilkan saat memilih)
          </div>
        </div>

        <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px;">
          <button class="btn btn-primary" id="btn-open">Buka Sesi</button>
          <button class="btn btn-danger" id="btn-close" disabled>Close Sesi</button>
        </div>
        <div id="session-info" class="muted" style="font-size:13px;margin-top:8px;">Belum ada sesi aktif.</div>
      </section>

      <section class="card stack">
        <h3 style="margin:0;">2. Camera & Recognition</h3>
        <div class="row" style="flex-wrap:wrap;gap:8px;">
          <button class="btn btn-primary" id="btn-cam">Mulai Kamera</button>
          <button class="btn btn-ghost" id="btn-switch" disabled>Switch</button>
          <button class="btn btn-ghost" id="btn-stop" disabled>Stop</button>
          <button class="btn btn-primary" id="btn-load" disabled>Load AI</button>
          <button class="btn btn-primary" id="btn-run" disabled>Mulai Recognition Loop</button>
          <button class="btn btn-ghost" id="btn-pause" disabled>Stop Loop</button>
          <label class="row" style="gap:6px;font-size:13px;margin-left:auto;">
            Threshold:
            <input id="threshold" type="range" min="0.5" max="1.0" step="0.01" value="0.80" style="width:140px;" />
            <span id="threshold-val" style="min-width:42px;">0.80</span>
          </label>
        </div>
        <div class="camera-stage" id="stage" style="aspect-ratio:4/3;">
          <div id="camera-placeholder" class="camera-placeholder" style="display:flex;flex-direction:column;align-items:center;justify-content:center;position:absolute;inset:0;text-align:center;padding:24px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);color:#cbd5e1;z-index:1;">
            <div style="font-size:48px;margin-bottom:12px;opacity:0.8;">🎥</div>
            <div style="font-size:15px;line-height:1.5;max-width:320px;">Buka sesi &amp; aktifkan kamera untuk mulai absensi.</div>
          </div>
          <canvas id="overlay" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;"></canvas>
          <div id="scan-feedback" style="position:absolute;left:50%;bottom:24px;transform:translateX(-50%);display:none;background:rgba(15,23,42,0.85);color:#fff;padding:14px 20px;border-radius:14px;text-align:center;backdrop-filter:blur(6px);box-shadow:0 8px 24px rgba(0,0,0,0.35);min-width:260px;max-width:90%;z-index:3;"></div>
        </div>
        <div id="recog-info" class="muted" style="font-size:13px;">Recognition nonaktif.</div>
      </section>

      <section class="card stack">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;">
          <h3 style="margin:0;">3. Daftar Siswa</h3>
          <div id="summary" class="muted" style="font-size:13px;"></div>
        </div>
        <div id="student-table" class="stack" style="max-height:520px;overflow:auto;"></div>
      </section>

      <section class="card stack">
        <h3 style="margin:0;">Pengaturan Waktu Absensi</h3>
        <div class="row" style="flex-wrap:wrap;gap:8px;" id="config-section">
          <label class="row" style="gap:6px;">On-time until: <input id="cfg-ontime" type="time" style="padding:8px;border:1px solid var(--color-border);border-radius:8px;" /></label>
          <label class="row" style="gap:6px;">Late after: <input id="cfg-late" type="time" style="padding:8px;border:1px solid var(--color-border);border-radius:8px;" /></label>
          <label class="row" style="gap:6px;">Close at: <input id="cfg-close" type="time" style="padding:8px;border:1px solid var(--color-border);border-radius:8px;" /></label>
          <button class="btn btn-primary" id="btn-cfg-save">Simpan</button>
        </div>
        <div id="prayer-config-section" class="stack" style="display:none;margin-top:8px;padding-top:8px;border-top:1px solid var(--color-border);">
          <h4 style="margin:0 0 8px;">Konfigurasi Waktu per Shalat</h4>
          ${PRAYER_NAMES.map(prayer => `
            <div class="row" style="flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:6px;">
              <label style="min-width:100px;font-size:13px;">${prayer}:</label>
              <input type="time" class="prayer-ontime" data-prayer="${prayer}" placeholder="On-time" style="padding:6px;border:1px solid var(--color-border);border-radius:6px;width:110px;" />
              <input type="time" class="prayer-late" data-prayer="${prayer}" placeholder="Late after" style="padding:6px;border:1px solid var(--color-border);border-radius:6px;width:110px;" />
              <input type="time" class="prayer-close" data-prayer="${prayer}" placeholder="Close at" style="padding:6px;border:1px solid var(--color-border);border-radius:6px;width:110px;" />
            </div>
          `).join('')}
          <button class="btn btn-primary" id="btn-prayer-config-save" style="margin-top:8px;">Simpan Pengaturan Shalat</button>
        </div>
        <p class="muted" style="margin:0;font-size:12px;">Status otomatis: scan sebelum on-time = HADIR, setelah = TERLAMBAT.</p>
      </section>

      <section class="card stack">
        <h3 style="margin:0;">Log</h3>
        <pre id="log" style="background:#0f172a;color:#cbd5e1;padding:12px;border-radius:8px;max-height:160px;overflow:auto;margin:0;font-size:12px;"></pre>
      </section>
    </div>
  `;

  const selClass = root.querySelector<HTMLSelectElement>('#sel-class')!;
  const selPrayer = root.querySelector<HTMLSelectElement>('#sel-prayer')!;
  const btnOpen = root.querySelector<HTMLButtonElement>('#btn-open')!;
  const btnClose = root.querySelector<HTMLButtonElement>('#btn-close')!;
  const sessionInfo = root.querySelector<HTMLDivElement>('#session-info')!;
  const btnCam = root.querySelector<HTMLButtonElement>('#btn-cam')!;
  const btnSwitch = root.querySelector<HTMLButtonElement>('#btn-switch')!;
  const btnStop = root.querySelector<HTMLButtonElement>('#btn-stop')!;
  const btnLoad = root.querySelector<HTMLButtonElement>('#btn-load')!;
  const btnRun = root.querySelector<HTMLButtonElement>('#btn-run')!;
  const btnPause = root.querySelector<HTMLButtonElement>('#btn-pause')!;
  const thresholdInput = root.querySelector<HTMLInputElement>('#threshold')!;
  const thresholdVal = root.querySelector<HTMLSpanElement>('#threshold-val')!;
  const stage = root.querySelector<HTMLDivElement>('#stage')!;
  const overlay = root.querySelector<HTMLCanvasElement>('#overlay')!;
  const overlayCtx = overlay.getContext('2d')!;
  const recogInfo = root.querySelector<HTMLDivElement>('#recog-info')!;
  const summaryEl = root.querySelector<HTMLDivElement>('#summary')!;
  const tableEl = root.querySelector<HTMLDivElement>('#student-table')!;
  const cfgOntime = root.querySelector<HTMLInputElement>('#cfg-ontime')!;
  const cfgLate = root.querySelector<HTMLInputElement>('#cfg-late')!;
  const cfgClose = root.querySelector<HTMLInputElement>('#cfg-close')!;
  const btnCfgSave = root.querySelector<HTMLButtonElement>('#btn-cfg-save')!;
  const prayerSection = root.querySelector<HTMLDivElement>('#prayer-section')!;
  const classSection = root.querySelector<HTMLDivElement>('#class-section')!;
  const configSection = root.querySelector<HTMLDivElement>('#config-section')!;
  const prayerConfigSection = root.querySelector<HTMLDivElement>('#prayer-config-section')!;
  const prayerTimesInfo = root.querySelector<HTMLDivElement>('#prayer-times-info')!;
  const logEl = root.querySelector<HTMLPreElement>('#log')!;

  const video = document.createElement('video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.style.position = 'absolute';
  video.style.inset = '0';
  video.style.width = '100%';
  video.style.height = '100%';
  video.style.objectFit = 'cover';
  video.style.zIndex = '0';
  video.style.background = '#000';
  stage.insertBefore(video, overlay);

  const placeholder = root.querySelector<HTMLDivElement>('#camera-placeholder')!;
  const hidePlaceholder = () => { placeholder.style.display = 'none'; };
  const showPlaceholder = () => { placeholder.style.display = 'flex'; };

  const log = (msg: string) => {
    const ts = formatTime(Date.now());
    logEl.textContent = `[${ts}] ${msg}\n` + logEl.textContent;
  };

  const scanFeedbackEl = root.querySelector<HTMLDivElement>('#scan-feedback')!;
  let scanFeedbackTimer: number | null = null;
  const showScanFeedback = (
    status: 'success' | 'duplicate' | 'liveness' | 'error',
    title: string,
    subtitle: string,
    durationMs: number = 3000
  ): void => {
    if (scanFeedbackTimer) {
      clearTimeout(scanFeedbackTimer);
      scanFeedbackTimer = null;
    }
    const colorMap: Record<typeof status, { bg: string; border: string; icon: string }> = {
      success:   { bg: 'rgba(16,185,129,0.18)',  border: '#10b981', icon: '✅' },
      duplicate:  { bg: 'rgba(245,158,11,0.20)',  border: '#f59e0b', icon: '🔁' },
      liveness:   { bg: 'rgba(239,68,68,0.20)',   border: '#ef4444', icon: '⚠️' },
      error:      { bg: 'rgba(239,68,68,0.20)',   border: '#ef4444', icon: '✗' }
    };
    const c = colorMap[status];
    scanFeedbackEl.style.display = 'block';
    scanFeedbackEl.style.background = c.bg;
    scanFeedbackEl.style.border = `2px solid ${c.border}`;
    scanFeedbackEl.innerHTML =
      `<div style="font-size:11px;color:#cbd5e1;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">${c.icon} ${escapeFeedback(title)}</div>` +
      `<div style="font-size:17px;font-weight:700;line-height:1.3;">${escapeFeedback(subtitle)}</div>`;
    scanFeedbackTimer = window.setTimeout(() => {
      scanFeedbackEl.style.display = 'none';
      scanFeedbackTimer = null;
    }, durationMs);
  };
  const hideScanFeedback = (): void => {
    if (scanFeedbackTimer) {
      clearTimeout(scanFeedbackTimer);
      scanFeedbackTimer = null;
    }
    scanFeedbackEl.style.display = 'none';
  };
  const escapeFeedback = (s: string): string =>
    s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));

  const setCamButtons = (active: boolean) => {
    btnCam.disabled = active;
    btnSwitch.disabled = !active;
    btnStop.disabled = !active;
    btnLoad.disabled = !active;
    btnRun.disabled = !active || !currentSession;
  };

  const drawBox = (box: { x: number; y: number; width: number; height: number }, color: string, label: string) => {
    const rect = video.getBoundingClientRect();
    overlay.width = rect.width;
    overlay.height = rect.height;
    const scaleX = overlay.width / rect.width;
    const scaleY = overlay.height / rect.height;
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    overlayCtx.strokeStyle = color;
    overlayCtx.lineWidth = 3;
    overlayCtx.strokeRect(box.x * scaleX, box.y * scaleY, box.width * scaleX, box.height * scaleY);
    overlayCtx.fillStyle = color;
    overlayCtx.font = 'bold 14px sans-serif';
    overlayCtx.fillText(label, box.x * scaleX + 4, box.y * scaleY + 18);
  };

  const clearOverlay = () => overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

  const refreshClasses = async () => {
    classes = await classRepository.list();
    selClass.innerHTML = '<option value="">— Pilih kelas —</option>' +
      classes.map((c) => `<option value="${c.id}">${c.name} (${c.grade})</option>`).join('');
  };

  const refreshSessionInfo = async () => {
    if (!currentSession) {
      sessionInfo.textContent = 'Belum ada sesi aktif.';
      btnClose.disabled = true;
      return;
    }
    const c = currentClass?.name ?? '?';
    const sessionTypeText = currentSession.sessionType === 'PRAYER' ? `Shalat: ${currentSession.prayerName}` : `Kelas: ${c}`;
    sessionInfo.innerHTML = `Sesi aktif: <strong>${currentSession.id}</strong> · ${sessionTypeText} · tanggal <strong>${currentSession.date}</strong> · status <strong>${currentSession.status}</strong>`;
    btnClose.disabled = currentSession.status !== 'open';
  };

  const refreshTable = async () => {
    if (!currentSession) {
      tableEl.innerHTML = '<p class="muted" style="margin:0;">Buka sesi dulu.</p>';
      summaryEl.textContent = '';
      return;
    }
    let studentsWithRecords: Array<{ student: Student; record: AttendanceRecord | null }>;
    if (currentSession.sessionType === 'PRAYER') {
      studentsWithRecords = await attendanceService.listPrayerStudentsInSession(currentSession.id);
    } else {
      studentsWithRecords = await attendanceService.listStudentsInSession(currentSession.id);
    }
    rows = studentsWithRecords;
    const summary = await attendanceService.getSessionSummary(currentSession.id);
    summaryEl.innerHTML = `Total <strong>${summary.total}</strong> · HADIR <strong style="color:var(--color-success)">${summary.hadir}</strong> · TERLAMBAT <strong style="color:var(--color-warn)">${summary.terlambat}</strong> · IZIN ${summary.izin} · SAKIT ${summary.sakit} · ALPA ${summary.alpa} · <span style="color:var(--color-warn)">Belum: ${summary.belum}</span>`;

    if (rows.length === 0) {
      tableEl.innerHTML = `<p class="muted" style="margin:0;">Tidak ada siswa di ${currentSession.sessionType === 'PRAYER' ? 'sekolah ini' : 'kelas ini'}. Tambahkan siswa dulu.</p>`;
      return;
    }
    tableEl.innerHTML = `
      <div class="student-table-header">
        <div>Nama</div><div>NIS</div><div>Status</div><div>Aksi</div>
      </div>
      ${rows.map(({ student, record }) => `
        <div class="student-table-row">
          <div><strong>${student.name}</strong>${record ? `<div class="muted student-table-meta">${formatTime(record.timestamp)} · conf=${record.confidence.toFixed(2)}</div>` : '<div class="muted student-table-meta">—</div>'}</div>
          <div class="muted student-table-nis">${student.nis}</div>
          <div>
            <select data-status="${student.id}" ${record ? '' : ''} class="student-table-select">
              ${record ? `<option value="${record.status}">${record.status}</option>` : '<option value="">— belum —</option>'}
              ${STATUS_OPTIONS.filter((s) => s !== (record?.status ?? '')).map((s) => `<option value="${s}">${s}</option>`).join('')}
            </select>
          </div>
          <div class="row student-table-actions">
            ${record ? `<button class="btn btn-danger" data-del-record="${record.id}">Batal</button>` : `<button class="btn btn-ghost" data-manual="${student.id}">Manual</button>`}
          </div>
        </div>
      `).join('')}
    `;

    tableEl.querySelectorAll<HTMLSelectElement>('[data-status]').forEach((s) => {
      s.addEventListener('change', async () => {
        const id = s.dataset.status!;
        const newStatus = s.value as AttendanceStatus;
        const row = rows.find((r) => r.student.id === id);
        if (!row?.record) return;
        try {
          await attendanceService.updateStatus(row.record.id, newStatus);
          log(`Update status ${row.student.name} → ${newStatus}`);
          await refreshTable();
        } catch (err: unknown) {
          log(`ERROR update: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      });
    });
    tableEl.querySelectorAll<HTMLButtonElement>('[data-del-record]').forEach((b) => {
      b.addEventListener('click', async () => {
        const id = b.dataset.delRecord!;
        if (!confirm('Batalkan absensi siswa ini?')) return;
        try {
          await attendanceService.removeRecord(id);
          log(`Record dihapus: ${id}`);
          await refreshTable();
        } catch (err: unknown) {
          log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      });
    });
    tableEl.querySelectorAll<HTMLButtonElement>('[data-manual]').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!currentSession) return;
        const id = b.dataset.manual!;
        const status = (prompt('Status (HADIR / TERLAMBAT / IZIN / SAKIT / ALPA):', 'HADIR') ?? '').toUpperCase() as AttendanceStatus;
        if (!STATUS_OPTIONS.includes(status)) { log('Status tidak valid.'); return; }
        try {
          await attendanceService.markManual(currentSession.id, id, status, 0);
          log(`Manual: ${status} dicatat.`);
          await refreshTable();
        } catch (err: unknown) {
          log(`ERROR manual: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      });
    });
  };

  const loadConfig = async () => {
    const cfg = await attendanceConfigService.load();
    cfgOntime.value = cfg.onTimeUntil;
    cfgLate.value = cfg.lateAfter;
    cfgClose.value = cfg.closeAt;
    thresholdInput.value = String(cfg.threshold);
    thresholdVal.textContent = cfg.threshold.toFixed(2);

    if (attendanceMode === 'PRAYER') {
      configSection.style.display = 'none';
      prayerConfigSection.style.display = 'block';
      const prayerCfg = await prayerConfigService.load();
      document.querySelectorAll<HTMLInputElement>('.prayer-ontime').forEach(el => {
        const prayer = el.dataset.prayer as PrayerName;
        el.value = prayerCfg.onTime[prayer] || '';
      });
      document.querySelectorAll<HTMLInputElement>('.prayer-late').forEach(el => {
        const prayer = el.dataset.prayer as PrayerName;
        el.value = prayerCfg.lateAfter[prayer] || '';
      });
      document.querySelectorAll<HTMLInputElement>('.prayer-close').forEach(el => {
        const prayer = el.dataset.prayer as PrayerName;
        el.value = prayerCfg.closeAt[prayer] || '';
      });
    } else {
      configSection.style.display = 'flex';
      prayerConfigSection.style.display = 'none';
    }
  };

  const startLoop = async () => {
    if (!currentSession) { log('Buka sesi dulu.'); return; }
    if (!cameraService.isActive()) { log('Aktifkan kamera dulu.'); return; }
    if (!faceModelLoader.isLoaded()) await faceModelLoader.load();
    isRunning = true;
    btnRun.disabled = true;
    btnPause.disabled = false;
    recogInfo.textContent = 'Recognition loop berjalan...';

    const loop = async () => {
      if (!isRunning || !currentSession) return;
      try {
        const config = await attendanceConfigService.load();
        const { result, liveness } = await attendanceService.recognizeForSession(video, currentSession, config);
        if (!liveness.ok) {
          recogInfo.textContent = `Liveness gagal: ${liveness.reason}`;
          showScanFeedback('liveness', 'Liveness Gagal', liveness.reason ?? 'coba lagi', 2000);
          await soundService.play('attendance-retry');
        }
        if (result) {
          drawBox(result.detection.box, result.matched ? '#16a34a' : '#f59e0b',
            result.candidate ? `${result.candidate.label} ${result.candidate.score.toFixed(2)}` : 'UNKNOWN');
          recogInfo.innerHTML = result.matched && result.candidate
            ? `Match: <strong>${result.candidate.label}</strong> (${result.candidate.score.toFixed(3)}) · ${result.durationMs.toFixed(0)}ms`
            : `No match · ${result.durationMs.toFixed(0)}ms`;

          if (result.matched && result.candidate) {
            const student = rows.find((r) => r.student.name === result.candidate!.label)?.student;
            if (student) {
              if (currentSession.sessionType === 'CLASS' && student.classId !== currentSession.classId) {
                log(`⚠ ${student.name} bukan anggota kelas ini.`);
                showScanFeedback('error', 'Kelas Tidak Cocok', `${student.name} bukan anggota kelas ini`, 2500);
              } else {
                const existing = rows.find((r) => r.student.id === student.id)?.record;
                if (existing) {
                  showScanFeedback('duplicate', 'Sudah Absen', `${student.name}, sudah melakukan absen (${existing.status})`, 3000);
                  log(`⚠ ${student.name} sudah absen (${existing.status}).`);
                  await soundService.play('attendance-already');
                } else {
                  try {
                    let rec;
                    if (currentSession.sessionType === 'PRAYER') {
                      const prayerCfg = await prayerConfigService.load();
                      rec = await attendanceService.recordPrayerAttendance(
                        currentSession.id, student.id, result.candidate.score,
                        prayerCfg, currentSession.prayerName!
                      );
                    } else {
                      rec = await attendanceService.recordAttendance(currentSession.id, student.id, result.candidate.score);
                    }
                    showScanFeedback('success', 'Status Absen · Absen Berhasil', `${student.name} → ${rec.status}`, 3000);
                    log(`✓ ${student.name} → ${rec.status} @ ${formatTime(rec.timestamp)}`);
                    await soundService.play('attendance-ok');
                  } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : 'Unknown error';
                    if (msg.toLowerCase().includes('sudah')) {
                      showScanFeedback('duplicate', 'Sudah Absen', `${student.name}, sudah melakukan absen`, 3000);
                      log(`⚠ ${student.name} sudah diabsen.`);
                      await soundService.play('attendance-already');
                    } else {
                      showScanFeedback('error', 'Gagal', msg, 3000);
                      log(`ERROR record: ${msg}`);
                      await soundService.play('attendance-retry');
                    }
                  }
                  await refreshTable();
                  isRunning = false;
                  recogInfo.textContent = '⏸ Cooldown 3 detik...';
                  runRaf = window.setTimeout(() => {
                    isRunning = true;
                    recogInfo.textContent = 'Recognition loop berjalan...';
                    runRaf = window.setTimeout(loop, 400);
                  }, 3000);
                  return;
                }
              }
            }
          } else {
            clearOverlay();
          }
        }
      } catch (err: unknown) {
        log(`ERROR loop: ${err instanceof Error ? err.message : 'Unknown error'}`);
        await soundService.play('attendance-retry');
      }
      runRaf = window.setTimeout(loop, 600);
    };
    loop();
  };

  const stopLoop = () => {
    isRunning = false;
    if (runRaf !== null) { clearTimeout(runRaf); runRaf = null; }
    hideScanFeedback();
    btnRun.disabled = !cameraService.isActive() || !currentSession;
    btnPause.disabled = true;
    recogInfo.textContent = 'Recognition dihentikan.';
  };

  btnOpen.addEventListener('click', async () => {
    if (attendanceMode === 'CLASS') {
      const classId = selClass.value;
      if (!classId) { log('Pilih kelas dulu.'); return; }
      try {
        btnOpen.classList.add('is-loading'); btnOpen.disabled = true;
        const session = await attendanceService.openSession(classId, 'admin');
        currentSession = session; currentClass = classes.find((c) => c.id === classId) ?? null;
        log(`Sesi dibuka: ${session.id} (class=${classId}, date=${session.date})`);
        await Promise.all([refreshSessionInfo(), refreshTable()]);
        btnRun.disabled = !cameraService.isActive();
      } catch (err: unknown) {
        log(`ERROR buka sesi: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        btnOpen.classList.remove('is-loading'); btnOpen.disabled = false;
      }
    } else {
      const prayerName = selPrayer.value;
      if (!prayerName) { log('Pilih shalat dulu.'); return; }
      try {
        btnOpen.classList.add('is-loading'); btnOpen.disabled = true;
        const session = await attendanceService.openPrayerSession(
          new Date().toISOString().slice(0, 10), prayerName as PrayerName, 'admin'
        );
        currentSession = session; currentClass = null;
        log(`Sesi shalat dibuka: ${session.id} (sholat=${prayerName}, date=${session.date})`);
        await Promise.all([refreshSessionInfo(), refreshTable()]);
        btnRun.disabled = !cameraService.isActive();
      } catch (err: unknown) {
        log(`ERROR buka sesi shalat: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        btnOpen.classList.remove('is-loading'); btnOpen.disabled = false;
      }
    }
  });

  btnClose.addEventListener('click', async () => {
    if (!currentSession) return;
    if (!confirm('Close sesi ini? Record yang sudah ada tetap tersimpan.')) return;
    try { stopLoop(); const closed = await attendanceService.closeSession(currentSession.id); currentSession = closed; log(`Sesi ditutup.`); await refreshSessionInfo(); }
    catch (err: unknown) { log(`ERROR close: ${err instanceof Error ? err.message : 'Unknown error'}`); }
  });

  btnCam.addEventListener('click', async () => {
    try { btnCam.disabled = true; log('Meminta izin kamera...'); await cameraService.start(video); hidePlaceholder(); log('Kamera aktif.'); setCamButtons(true); }
    catch (err: unknown) { log(`ERROR kamera: ${err instanceof CameraError ? err.message : (err as Error).message}`); showPlaceholder(); btnCam.disabled = false; }
  });

  btnSwitch.addEventListener('click', async () => {
    try { await cameraService.switchCamera(video); log('Kamera di-switch.'); }
    catch (err: unknown) { log(`ERROR switch: ${err instanceof Error ? err.message : 'Unknown error'}`); }
  });

  btnStop.addEventListener('click', async () => {
    stopLoop(); await cameraService.stop(); clearOverlay(); showPlaceholder();
    btnCam.disabled = false; btnSwitch.disabled = true; btnStop.disabled = true; btnRun.disabled = true; btnPause.disabled = true; log('Kamera dimatikan.');
  });

  btnLoad.addEventListener('click', async () => {
    try { btnLoad.classList.add('is-loading'); btnLoad.disabled = true; log('Memuat model...'); await faceModelLoader.load(); log('Model siap.'); }
    catch (err: unknown) { log(`ERROR load model: ${err instanceof FaceError ? err.message : (err as Error).message}`); }
    finally { btnLoad.classList.remove('is-loading'); btnLoad.disabled = false; }
  });

  btnRun.addEventListener('click', () => void startLoop());
  btnPause.addEventListener('click', stopLoop);

  thresholdInput.addEventListener('input', () => { thresholdVal.textContent = thresholdInput.value; });

  btnCfgSave.addEventListener('click', async () => {
    try { btnCfgSave.classList.add('is-loading'); btnCfgSave.disabled = true;
      await attendanceConfigService.save({ onTimeUntil: cfgOntime.value, lateAfter: cfgLate.value, closeAt: cfgClose.value, threshold: parseFloat(thresholdInput.value) });
      log(`Config disimpan. Auto status saat ini: ${determineAutoStatus(await attendanceConfigService.load())}.`);
      await loadConfig();
    } catch (err: unknown) { log(`ERROR save config: ${err instanceof Error ? err.message : 'Unknown error'}`); }
    finally { btnCfgSave.classList.remove('is-loading'); btnCfgSave.disabled = false; }
  });

  const btnPrayerConfigSave = root.querySelector<HTMLButtonElement>('#btn-prayer-config-save')!;
  if (btnPrayerConfigSave) {
    btnPrayerConfigSave.addEventListener('click', async () => {
      try { btnPrayerConfigSave.classList.add('is-loading'); btnPrayerConfigSave.disabled = true;
        const prayerCfg = { onTime: {} as Record<PrayerName, string>, lateAfter: {} as Record<PrayerName, string>, closeAt: {} as Record<PrayerName, string> };
        document.querySelectorAll<HTMLInputElement>('.prayer-ontime').forEach(el => { const prayer = el.dataset.prayer as PrayerName; if (el.value) { prayerCfg.onTime[prayer] = el.value; } });
        document.querySelectorAll<HTMLInputElement>('.prayer-late').forEach(el => { const prayer = el.dataset.prayer as PrayerName; if (el.value) { prayerCfg.lateAfter[prayer] = el.value; } });
        document.querySelectorAll<HTMLInputElement>('.prayer-close').forEach(el => { const prayer = el.dataset.prayer as PrayerName; if (el.value) { prayerCfg.closeAt[prayer] = el.value; } });
        await prayerConfigService.save(prayerCfg as Partial<{ onTime: Record<PrayerName, string>; lateAfter: Record<PrayerName, string>; closeAt: Record<PrayerName, string>; }>); log('Pengaturan waktu shalat disimpan.'); await loadConfig();
      } catch (err: unknown) { log(`ERROR save prayer config: ${err instanceof Error ? err.message : 'Unknown error'}`); }
      finally { btnPrayerConfigSave.classList.remove('is-loading'); btnPrayerConfigSave.disabled = false; }
    });
  }

  const modeRadios = root.querySelectorAll<HTMLInputElement>('input[name="attendance-mode"]');
  modeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      attendanceMode = target.value as 'CLASS' | 'PRAYER';
      log(`Mode absensi diubah ke: ${attendanceMode}`);
      if (attendanceMode === 'CLASS') {
        classSection.style.display = 'flex'; prayerSection.style.display = 'none';
        configSection.style.display = 'flex'; prayerConfigSection.style.display = 'none';
        selPrayer.value = ''; currentSession = null; currentClass = null;
        refreshSessionInfo(); refreshTable();
      } else {
        classSection.style.display = 'none'; prayerSection.style.display = 'flex';
        configSection.style.display = 'none'; prayerConfigSection.style.display = 'block';
        selClass.value = ''; currentSession = null; currentClass = null;
        refreshSessionInfo(); refreshTable(); loadConfig();
      }
    });
  });

  selPrayer.addEventListener('change', () => {
    const prayerName = selPrayer.value;
    if (prayerName) { prayerTimesInfo.textContent = `Waktu shalat ${prayerName} akan ditampilkan di bawah.`; currentSession = null; refreshSessionInfo(); refreshTable(); }
    else { prayerTimesInfo.textContent = 'Pilih shalat dari daftar di atas'; }
  });

  await Promise.all([refreshClasses(), loadConfig()]);
  await refreshTable();
  log('Halaman absensi siap. Mode: ' + attendanceMode + '. Auto status: ' + determineAutoStatus(await attendanceConfigService.load()));

  const allStudents = await studentRepository.list();
  let withProfile = 0;
  for (const s of allStudents) { if ((await faceProfileRepository.listForStudent(s.id)).length > 0) withProfile++; }
  log(`Info: ${allStudents.length} siswa, ${withProfile} sudah punya face profile.`);

  window.addEventListener('beforeunload', () => { void cameraService.stop(); stopLoop(); });
}
