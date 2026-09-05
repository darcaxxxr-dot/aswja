import { cameraService, CameraError } from '@services/camera';
import { faceModelLoader, FaceError } from '@services/face';
import { attendanceService, attendanceConfigService, determineAutoStatus } from '@services/attendance';
import { classRepository, studentRepository, faceProfileRepository } from '@repositories/index';
import { formatTime } from '@utils/device';
import type { AttendanceRecord, AttendanceSession, AttendanceStatus, ClassRoom, Student } from '@models/types';

interface StudentRow {
  student: Student;
  record: AttendanceRecord | null;
}

const STATUS_OPTIONS: AttendanceStatus[] = ['HADIR', 'TERLAMBAT', 'IZIN', 'SAKIT', 'ALPA'];

export async function renderAttendance(root: HTMLElement): Promise<void> {
  let classes: ClassRoom[] = [];
  let currentSession: AttendanceSession | null = null;
  let currentClass: ClassRoom | null = null;
  let rows: StudentRow[] = [];
  let isRunning = false;
  let runRaf: number | null = null;

  root.innerHTML = `
    <div class="stack">
      <header>
        <h2 style="margin:0 0 4px;">Sesi Absensi</h2>
        <p class="muted" style="margin:0;">Buka sesi → scan wajah siswa → otomatis HADIR / TERLAMBAT. Duplicate dicegah otomatis.</p>
      </header>

      <section class="card stack">
        <h3 style="margin:0;">1. Pilih Kelas & Buka Sesi</h3>
        <div class="row" style="flex-wrap:wrap;gap:8px;">
          <select id="sel-class" style="padding:10px;border:1px solid var(--color-border);border-radius:8px;min-width:200px;">
            <option value="">— Pilih kelas —</option>
          </select>
          <button class="btn btn-primary" id="btn-open">Buka Sesi</button>
          <button class="btn btn-danger" id="btn-close" disabled>Close Sesi</button>
        </div>
        <div id="session-info" class="muted" style="font-size:13px;">Belum ada sesi aktif.</div>
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
          <div class="camera-placeholder">
            <div style="font-size:32px;">🎥</div>
            <div>Buka sesi & aktifkan kamera untuk mulai absensi.</div>
          </div>
          <canvas id="overlay" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;"></canvas>
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
        <div class="row" style="flex-wrap:wrap;gap:8px;">
          <label class="row" style="gap:6px;">On-time until: <input id="cfg-ontime" type="time" style="padding:8px;border:1px solid var(--color-border);border-radius:8px;" /></label>
          <label class="row" style="gap:6px;">Late after: <input id="cfg-late" type="time" style="padding:8px;border:1px solid var(--color-border);border-radius:8px;" /></label>
          <label class="row" style="gap:6px;">Close at: <input id="cfg-close" type="time" style="padding:8px;border:1px solid var(--color-border);border-radius:8px;" /></label>
          <button class="btn btn-primary" id="btn-cfg-save">Simpan</button>
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
  const logEl = root.querySelector<HTMLPreElement>('#log')!;

  const video = document.createElement('video');
  stage.insertBefore(video, overlay);

  const log = (msg: string) => {
    const ts = formatTime(Date.now());
    logEl.textContent = `[${ts}] ${msg}\n` + logEl.textContent;
  };

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
    sessionInfo.innerHTML = `Sesi aktif: <strong>${currentSession.id}</strong> · kelas <strong>${c}</strong> · tanggal <strong>${currentSession.date}</strong> · status <strong>${currentSession.status}</strong>`;
    btnClose.disabled = currentSession.status !== 'open';
  };

  const refreshTable = async () => {
    if (!currentSession) {
      tableEl.innerHTML = '<p class="muted" style="margin:0;">Buka sesi dulu.</p>';
      summaryEl.textContent = '';
      return;
    }
    rows = await attendanceService.listStudentsInSession(currentSession.id);
    const summary = await attendanceService.getSessionSummary(currentSession.id);
    summaryEl.innerHTML = `Total <strong>${summary.total}</strong> · HADIR <strong style="color:var(--color-success)">${summary.hadir}</strong> · TERLAMBAT <strong style="color:var(--color-warn)">${summary.terlambat}</strong> · IZIN ${summary.izin} · SAKIT ${summary.sakit} · ALPA ${summary.alpa} · <span style="color:var(--color-warn)">Belum: ${summary.belum}</span>`;

    if (rows.length === 0) {
      tableEl.innerHTML = '<p class="muted" style="margin:0;">Tidak ada siswa di kelas ini. Tambahkan siswa dulu.</p>';
      return;
    }
    tableEl.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 100px 140px 180px;gap:8px;font-size:13px;font-weight:600;padding:6px 8px;border-bottom:1px solid var(--color-border);">
        <div>Nama</div><div>NIS</div><div>Status</div><div>Aksi</div>
      </div>
      ${rows
        .map(
          ({ student, record }) => `
        <div style="display:grid;grid-template-columns:1fr 100px 140px 180px;gap:8px;align-items:center;padding:8px;border-bottom:1px solid var(--color-border);font-size:14px;">
          <div>
            <strong>${student.name}</strong>
            ${record ? `<div class="muted" style="font-size:11px;">${formatTime(record.timestamp)} · conf=${record.confidence.toFixed(2)}</div>` : '<div class="muted" style="font-size:11px;">—</div>'}
          </div>
          <div class="muted" style="font-size:13px;">${student.nis}</div>
          <div>
            <select data-status="${student.id}" ${record ? '' : ''} style="padding:6px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;width:100%;">
              ${record ? `<option value="${record.status}">${record.status}</option>` : '<option value="">— belum —</option>'}
              ${STATUS_OPTIONS.filter((s) => s !== (record?.status ?? '')).map((s) => `<option value="${s}">${s}</option>`).join('')}
            </select>
          </div>
          <div class="row" style="gap:4px;">
            ${record
              ? `<button class="btn btn-danger" data-del-record="${record.id}" style="padding:4px 8px;min-height:32px;font-size:12px;">Batal</button>`
              : `<button class="btn btn-ghost" data-manual="${student.id}" style="padding:4px 8px;min-height:32px;font-size:12px;">Manual</button>`
            }
          </div>
        </div>`
        )
        .join('')}
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
          const msg = err instanceof Error ? err.message : 'Unknown error';
          log(`ERROR update: ${msg}`);
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
          const msg = err instanceof Error ? err.message : 'Unknown error';
          log(`ERROR: ${msg}`);
        }
      });
    });
    tableEl.querySelectorAll<HTMLButtonElement>('[data-manual]').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!currentSession) return;
        const id = b.dataset.manual!;
        const status = (prompt('Status (HADIR / TERLAMBAT / IZIN / SAKIT / ALPA):', 'HADIR') ?? '').toUpperCase() as AttendanceStatus;
        if (!STATUS_OPTIONS.includes(status)) {
          log('Status tidak valid.');
          return;
        }
        try {
          await attendanceService.markManual(currentSession.id, id, status, 0);
          log(`Manual: ${status} dicatat.`);
          await refreshTable();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          log(`ERROR manual: ${msg}`);
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
  };

  const startLoop = async () => {
    if (!currentSession) {
      log('Buka sesi dulu.');
      return;
    }
    if (!cameraService.isActive()) {
      log('Aktifkan kamera dulu.');
      return;
    }
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
        }
        if (result) {
          drawBox(result.detection.box, result.matched ? '#16a34a' : '#f59e0b', result.candidate ? `${result.candidate.label} ${result.candidate.score.toFixed(2)}` : 'UNKNOWN');
          recogInfo.innerHTML = result.matched && result.candidate
            ? `Match: <strong>${result.candidate.label}</strong> (${result.candidate.score.toFixed(3)}) · ${result.durationMs.toFixed(0)}ms`
            : `No match · ${result.durationMs.toFixed(0)}ms`;

          if (result.matched && result.candidate) {
            const student = rows.find((r) => r.student.name === result.candidate!.label)?.student;
            if (student) {
              if (student.classId !== currentSession!.classId) {
                log(`⚠ ${student.name} bukan anggota kelas ini.`);
              } else {
                try {
                  const rec = await attendanceService.recordAttendance(currentSession.id, student.id, result.candidate.score);
                  log(`✓ ${student.name} → ${rec.status} @ ${formatTime(rec.timestamp)}`);
                  await refreshTable();
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : 'Unknown error';
                  if (msg.toLowerCase().includes('sudah')) {
                    log(`⚠ ${student.name} sudah diabsen.`);
                  } else {
                    log(`ERROR record: ${msg}`);
                  }
                }
              }
            }
          }
        } else {
          clearOverlay();
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        log(`ERROR loop: ${msg}`);
      }
      runRaf = window.setTimeout(loop, 600);
    };
    loop();
  };

  const stopLoop = () => {
    isRunning = false;
    if (runRaf !== null) {
      clearTimeout(runRaf);
      runRaf = null;
    }
    btnRun.disabled = !cameraService.isActive() || !currentSession;
    btnPause.disabled = true;
    recogInfo.textContent = 'Recognition dihentikan.';
  };

  btnOpen.addEventListener('click', async () => {
    const classId = selClass.value;
    if (!classId) {
      log('Pilih kelas dulu.');
      return;
    }
    try {
      const session = await attendanceService.openSession(classId, 'admin');
      currentSession = session;
      currentClass = classes.find((c) => c.id === classId) ?? null;
      log(`Sesi dibuka: ${session.id} (class=${classId}, date=${session.date})`);
      await Promise.all([refreshSessionInfo(), refreshTable()]);
      btnRun.disabled = !cameraService.isActive();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      log(`ERROR buka sesi: ${msg}`);
    }
  });

  btnClose.addEventListener('click', async () => {
    if (!currentSession) return;
    if (!confirm('Close sesi ini? Record yang sudah ada tetap tersimpan.')) return;
    try {
      stopLoop();
      const closed = await attendanceService.closeSession(currentSession.id);
      currentSession = closed;
      log(`Sesi ditutup.`);
      await refreshSessionInfo();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      log(`ERROR close: ${msg}`);
    }
  });

  btnCam.addEventListener('click', async () => {
    try {
      await cameraService.start(video);
      log('Kamera aktif.');
      setCamButtons(true);
    } catch (err: unknown) {
      const msg = err instanceof CameraError ? err.message : (err as Error).message;
      log(`ERROR kamera: ${msg}`);
    }
  });

  btnSwitch.addEventListener('click', async () => {
    try {
      await cameraService.switchCamera(video);
      log('Kamera di-switch.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      log(`ERROR switch: ${msg}`);
    }
  });

  btnStop.addEventListener('click', async () => {
    stopLoop();
    await cameraService.stop();
    clearOverlay();
    log('Kamera dihentikan.');
    setCamButtons(false);
  });

  btnLoad.addEventListener('click', async () => {
    try {
      btnLoad.disabled = true;
      log('Memuat model...');
      await faceModelLoader.load();
      log('Model siap.');
    } catch (err: unknown) {
      const msg = err instanceof FaceError ? err.message : (err as Error).message;
      log(`ERROR load model: ${msg}`);
      btnLoad.disabled = false;
    }
  });

  btnRun.addEventListener('click', () => void startLoop());
  btnPause.addEventListener('click', stopLoop);

  thresholdInput.addEventListener('input', () => {
    thresholdVal.textContent = thresholdInput.value;
  });

  btnCfgSave.addEventListener('click', async () => {
    try {
      await attendanceConfigService.save({
        onTimeUntil: cfgOntime.value,
        lateAfter: cfgLate.value,
        closeAt: cfgClose.value,
        threshold: parseFloat(thresholdInput.value)
      });
      const cfg = await attendanceConfigService.load();
      log(`Config disimpan. Auto status saat ini: ${determineAutoStatus(cfg)}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      log(`ERROR save config: ${msg}`);
    }
  });

  await Promise.all([refreshClasses(), loadConfig()]);
  await refreshTable();
  log('Halaman absensi siap. Auto status: ' + determineAutoStatus(await attendanceConfigService.load()));

  // Hitung face profile count untuk info
  const allStudents = await studentRepository.list();
  let withProfile = 0;
  for (const s of allStudents) {
    if ((await faceProfileRepository.listForStudent(s.id)).length > 0) withProfile++;
  }
  log(`Info: ${allStudents.length} siswa, ${withProfile} sudah punya face profile.`);

  window.addEventListener('beforeunload', () => {
    void cameraService.stop();
    stopLoop();
  });
}