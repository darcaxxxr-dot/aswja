import { cameraService, CameraError } from '@services/camera';
import { faceModelLoader, FaceError } from '@services/face';
import { enrollmentService } from '@services/enrollment';
import { studentRepository, classRepository, faceProfileRepository } from '@repositories/index';
import { formatTime } from '@utils/device';
import type { Student, ClassRoom } from '@models/types';

export async function renderEnrollment(root: HTMLElement): Promise<void> {
  let students: Student[] = [];
  let classes: ClassRoom[] = [];
  let isEnrolling = false;

  root.innerHTML = `
    <div class="stack">
      <header>
        <h2 style="margin:0 0 4px;">Face Enrollment</h2>
        <p class="muted" style="margin:0;">
          Daftarkan wajah siswa ke sistem. Pilih siswa yang belum memiliki profile untuk memulai enrollment.
        </p>
      </header>

      <section class="card glass" id="enroll-workflow" style="display:none;">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;align-items:center;margin-bottom:12px;">
          <div class="row">
            <button class="btn btn-primary" id="btn-start">Mulai Kamera</button>
            <button class="btn btn-ghost" id="btn-stop" disabled>Stop</button>
            <button class="btn btn-ghost" id="btn-switch" disabled>Switch</button>
            <button class="btn btn-primary" id="btn-load" disabled>Load AI Models</button>
          </div>
          <span id="enroll-student-name" class="muted" style="font-size:13px;"></span>
        </div>

        <div class="camera-stage" id="stage" style="aspect-ratio: 4/3;margin-top:12px;">
          <div class="camera-placeholder" id="camera-placeholder" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(15,23,42,0.85);color:#cbd5e1;text-align:center;padding:24px;transition:opacity 200ms ease;">
            <div style="font-size:32px;">📸</div>
            <div>Klik <strong>Mulai Kamera</strong> untuk memulai enrollment.</div>
          </div>
          <video id="camera-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;display:none;"></video>
          <canvas id="overlay" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;"></canvas>
        </div>

        <div id="enroll-step" style="margin-top:12px;padding:12px;background:rgba(255,255,255,0.6);border:1px solid var(--color-border);border-radius:var(--radius-md);display:none;"></div>
      </section>

      <section class="card glass">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;align-items:center;margin-bottom:12px;">
          <h3 style="margin:0;">Daftar Siswa <span id="student-total" class="muted" style="font-size:14px;font-weight:400;"></span></h3>
          <span id="page-info" class="muted" style="font-size:13px;"></span>
        </div>
        <div class="row" style="flex-wrap:wrap;gap:8px;margin-bottom:12px;">
          <select id="filter-class" style="flex:1;min-width:160px;padding:6px 10px;border-radius:var(--radius-sm);border:1px solid var(--color-border);background:rgba(255,255,255,0.8);font-size:13px;">
            <option value="">Semua kelas</option>
          </select>
          <select id="filter-status" style="flex:1;min-width:140px;padding:6px 10px;border-radius:var(--radius-sm);border:1px solid var(--color-border);background:rgba(255,255,255,0.8);font-size:13px;">
            <option value="">Semua status</option>
            <option value="without">Belum Enroll</option>
            <option value="with">Sudah Enroll</option>
          </select>
        </div>
        <div style="overflow-x:auto;border-radius:8px;border:1px solid var(--color-border);">
          <table class="data-table" style="width:100%;border-collapse:collapse;font-size:14px;background:rgba(255,255,255,0.5);">
            <thead>
              <tr style="background:linear-gradient(180deg,#0ea572 0%,#10b981 100%);color:#fff;">
                <th style="padding:10px 8px;text-align:center;width:60px;font-weight:600;">No</th>
                <th style="padding:10px 8px;text-align:left;font-weight:600;">NIS</th>
                <th style="padding:10px 8px;text-align:left;font-weight:600;">Nama Siswa</th>
                <th style="padding:10px 8px;text-align:left;font-weight:600;">Grade</th>
                <th style="padding:10px 8px;text-align:left;font-weight:600;">Kelas</th>
                <th style="padding:10px 8px;text-align:center;width:120px;font-weight:600;">Kualitas</th>
                <th style="padding:10px 8px;text-align:center;width:180px;font-weight:600;">Aksi</th>
              </tr>
            </thead>
            <tbody id="student-tbody"></tbody>
          </table>
        </div>
      </section>

      <section class="card glass">
        <h3 style="margin:0 0 8px;">Log</h3>
        <pre id="log" style="background:#0f172a;color:#cbd5e1;padding:12px;border-radius:8px;max-height:160px;overflow:auto;margin:0;font-size:12px;"></pre>
      </section>
    </div>
  `;

  const video = root.querySelector<HTMLVideoElement>('#camera-video');
  const placeholder = root.querySelector<HTMLDivElement>('#camera-placeholder');
  const overlay = root.querySelector<HTMLCanvasElement>('#overlay');
  const overlayCtx = overlay?.getContext('2d');

  const enrollWorkflow = root.querySelector<HTMLDivElement>('#enroll-workflow');
  const enrollStudentName = root.querySelector<HTMLSpanElement>('#enroll-student-name');
  const enrollStep = root.querySelector<HTMLDivElement>('#enroll-step');
  const btnStart = root.querySelector<HTMLButtonElement>('#btn-start');
  const btnStop = root.querySelector<HTMLButtonElement>('#btn-stop');
  const btnSwitch = root.querySelector<HTMLButtonElement>('#btn-switch');
  const btnLoad = root.querySelector<HTMLButtonElement>('#btn-load');
  const filterClass = root.querySelector<HTMLSelectElement>('#filter-class');
  const filterStatus = root.querySelector<HTMLSelectElement>('#filter-status');
  const studentTotal = root.querySelector<HTMLSpanElement>('#student-total');
  const pageInfo = root.querySelector<HTMLSpanElement>('#page-info');
  const tbody = root.querySelector<HTMLTableSectionElement>('#student-tbody');
  const logEl = root.querySelector<HTMLPreElement>('#log');

  const log = (msg: string) => {
    if (!logEl) return;
    const ts = formatTime(Date.now());
    logEl.textContent = `[${ts}] ${msg}\n` + logEl.textContent;
  };

  const setCamButtons = (active: boolean) => {
    if (btnStart) btnStart.disabled = active;
    if (btnSwitch) btnSwitch.disabled = !active;
    if (btnStop) btnStop.disabled = !active;
    if (btnLoad) btnLoad.disabled = !active;
  };

  const refreshClasses = async () => {
    classes = await classRepository.list();
    if (filterClass) {
      filterClass.innerHTML = '<option value="">Semua kelas</option>' +
        classes.map((c) => `<option value="${c.id}">${c.name} (${c.grade})</option>`).join('');
    }
  };

  const refreshStudents = async () => {
    students = await studentRepository.list();
    await renderTable();
  };

  const renderTable = async () => {
    if (!tbody || !filterClass || !filterStatus || !studentTotal || !pageInfo) return;
    const filterClsId = filterClass.value;
    const filterStat = filterStatus.value;
    let filtered = students;
    if (filterClsId) filtered = filtered.filter((s) => s.classId === filterClsId);

    const enriched = await Promise.all(
      filtered.map(async (s) => {
        const profiles = await faceProfileRepository.listForStudent(s.id);
        const best = profiles.length > 0 ? profiles.reduce((a, b) => a.qualityScore > b.qualityScore ? a : b, profiles[0]) : null;
        return {
          student: s,
          hasProfile: profiles.length > 0,
          quality: best ? best.qualityScore : null
        };
      })
    );
    const visible = enriched.filter((e) => {
      if (filterStat === 'without') return !e.hasProfile;
      if (filterStat === 'with') return e.hasProfile;
      return true;
    });

    studentTotal.textContent = `(${visible.length} siswa)`;
    if (visible.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--color-text-muted);">Tidak ada siswa dengan filter ini.</td></tr>`;
      pageInfo.textContent = '';
      return;
    }

    tbody.innerHTML = visible.map((e, i) => {
      const cls = classes.find((c) => c.id === e.student.classId);
      const qualityText = e.quality !== null ? `<span style="color:${e.quality >= 0.7 ? 'var(--color-success)' : 'var(--color-warn)'};">${(e.quality * 100).toFixed(0)}%</span>` : '<span class="muted">—</span>';
      return `<tr style="border-top:1px solid var(--color-border);">
        <td style="padding:8px;text-align:center;color:var(--color-text-muted);">${i + 1}</td>
        <td style="padding:8px;">${e.student.nis}</td>
        <td style="padding:8px;"><strong>${e.student.name}</strong></td>
        <td style="padding:8px;">${cls?.grade ?? '—'}</td>
        <td style="padding:8px;">${cls?.name ?? '—'}</td>
        <td style="padding:8px;text-align:center;">${qualityText}</td>
        <td style="padding:8px;text-align:center;">
          <button class="btn btn-primary" data-enroll="${e.student.id}" ${(e.hasProfile || isEnrolling) ? 'disabled' : ''} style="padding:4px 8px;min-height:28px;font-size:12px;">${e.hasProfile ? 'Sudah Enroll' : 'Enroll'}</button>
          ${e.hasProfile ? `<button class="btn btn-danger" data-remove="${e.student.id}" ${isEnrolling ? 'disabled' : ''} style="padding:4px 8px;min-height:28px;font-size:12px;margin-left:4px;">Unenroll</button>` : ''}
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll<HTMLButtonElement>('[data-enroll]').forEach((b) => {
      b.addEventListener('click', () => {
        const s = students.find((x) => x.id === b.dataset.enroll);
        if (s) void startEnrollment(s);
      });
    });
    tbody.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach((b) => {
      b.addEventListener('click', async () => {
        const id = b.dataset.remove!;
        if (!confirm('Hapus face profile siswa ini?')) return;
        try {
          await enrollmentService.removeProfile(id);
          log(`Face profile dihapus: ${id}`);
          await refreshStudents();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          log(`ERROR hapus profile: ${msg}`);
        }
      });
    });
  };

  const startEnrollment = async (student: Student) => {
    isEnrolling = true;
    await renderTable();
    if (enrollWorkflow) enrollWorkflow.style.display = 'block';
    if (enrollStudentName) enrollStudentName.textContent = `Siswa: ${student.name} (${student.nis})`;
    if (enrollStep) enrollStep.style.display = 'none';
    if (overlayCtx && overlay) overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    if (placeholder) {
      placeholder.style.display = 'flex';
      placeholder.style.opacity = '1';
    }
    if (video) video.style.display = 'none';
    setCamButtons(false);
    if (btnLoad) btnLoad.disabled = !(await faceModelLoader.isLoaded());

    log(`Memulai enrollment untuk ${student.name}...`);
    try {
      await ensureCameraAndModel();
      await runEnrollmentFlow(student);
    } catch {
      // error already logged in ensureCameraAndModel
      isEnrolling = false;
      await renderTable();
    }
  };

  const ensureCameraAndModel = async () => {
    if (!faceModelLoader.isLoaded()) {
      log('Memuat model...');
      if (btnLoad) btnLoad.disabled = true;
      await faceModelLoader.load();
      log('Model siap.');
      if (btnLoad) btnLoad.disabled = false;
    }
    if (!cameraService.isActive()) {
      log('Memulai kamera...');
      setCamButtons(true);
      if (btnStart) btnStart.disabled = true;
      try {
        if (video) await cameraService.start(video);
        log('Kamera aktif.');
        if (placeholder) {
          placeholder.style.opacity = '0';
          setTimeout(() => { if (placeholder) placeholder.style.display = 'none'; }, 200);
        }
        if (video) video.style.display = 'block';
      } catch (err: unknown) {
        const msg = err instanceof CameraError ? err.message : (err as Error).message;
        log(`ERROR kamera: ${msg}`);
        throw err;
      }
    }
  };

  const runEnrollmentFlow = async (student: Student) => {
    if (!enrollStep || !video) return;
    enrollStep.style.display = 'block';
    enrollStep.innerHTML = `
      <p class="muted">Sistem akan memverifikasi liveness, lalu menangkap 3 pose. Ikuti instruksi di layar.</p>
      <div id="enroll-status" class="stack" style="margin-top:12px;"></div>
    `;
    const statusEl = enrollStep.querySelector<HTMLDivElement>('#enroll-status');
    if (!statusEl) return;

    const setStatus = (title: string, detail: string) => {
      statusEl.innerHTML = `<p><strong>${title}</strong></p><p>${detail}</p>`;
    };

    try {
      const result = await enrollmentService.enrollStudentWithFlow(student, video, {
        onStep: (step, msg) => {
          const title = step === 'liveness' ? 'Verifikasi Liveness' : step === 'front' ? 'Pose 1: Hadap Depan' : step === 'right' ? 'Pose 2: Hadap Kanan' : 'Pose 3: Hadap Kiri';
          setStatus(title, msg);
          log(msg);
        }
      });
      statusEl.insertAdjacentHTML('beforeend', `<div style="margin-top:8px;color:var(--color-success);"><strong>✓ Enrollment selesai.</strong> Avg quality: ${result.avgQuality.toFixed(2)}, ${result.profiles.length} profile tersimpan.</div>`);
      log(`✓ Enrollment ${student.name} selesai. Quality=${result.avgQuality.toFixed(2)}`);
      await refreshStudents();
    } catch (err: unknown) {
      const msg = err instanceof FaceError || err instanceof Error ? err.message : 'Unknown error';
      statusEl.insertAdjacentHTML('beforeend', `<div style="margin-top:8px;color:var(--color-danger);"><strong>✗ Gagal:</strong> ${msg}</div>`);
      log(`ERROR enroll: ${msg}`);
    } finally {
      isEnrolling = false;
      if (overlayCtx && overlay) overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
      await renderTable();
    }
  };

  if (btnStart) btnStart.addEventListener('click', async () => {
    try {
      await ensureCameraAndModel();
    } catch {
      // error already logged
    }
  });

  if (btnSwitch) btnSwitch.addEventListener('click', async () => {
    if (!video) return;
    try {
      await cameraService.switchCamera(video);
      log('Kamera di-switch.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      log(`ERROR switch: ${msg}`);
    }
  });

  if (btnStop) btnStop.addEventListener('click', async () => {
    await cameraService.stop();
    if (overlayCtx && overlay) overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    log('Kamera dihentikan.');
    setCamButtons(false);
    if (placeholder) {
      placeholder.style.display = 'flex';
      placeholder.style.opacity = '1';
    }
    if (video) video.style.display = 'none';
    if (enrollStep) enrollStep.style.display = 'none';
  });

  if (btnLoad) btnLoad.addEventListener('click', async () => {
    try {
      if (btnLoad) btnLoad.disabled = true;
      log('Memuat model...');
      await faceModelLoader.load();
      log('Model siap.');
      if (btnLoad) btnLoad.disabled = false;
    } catch (err: unknown) {
      const msg = err instanceof FaceError ? err.message : (err as Error).message;
      log(`ERROR load model: ${msg}`);
      if (btnLoad) btnLoad.disabled = false;
    }
  });

  if (filterClass) filterClass.addEventListener('change', () => void renderTable());
  if (filterStatus) filterStatus.addEventListener('change', () => void renderTable());

  await refreshClasses();
  await refreshStudents();
  log('Halaman enrollment siap.');
}
