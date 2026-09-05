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

      <section class="card glass">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;">
          <div class="row">
            <button class="btn btn-primary" id="btn-start">Mulai Kamera</button>
            <button class="btn btn-ghost" id="btn-stop" disabled>Stop</button>
            <button class="btn btn-ghost" id="btn-switch" disabled>Switch</button>
            <button class="btn btn-primary" id="btn-load" disabled>Load AI Models</button>
          </div>
          <div class="row">
            <span class="muted" style="font-size:13px;">Filter:</span>
            <select id="filter-class" style="padding:8px;border:1px solid var(--color-border);border-radius:8px;">
              <option value="">Semua kelas</option>
            </select>
            <select id="filter-status" style="padding:8px;border:1px solid var(--color-border);border-radius:8px;">
              <option value="all">Semua</option>
              <option value="without">Belum ada profile</option>
              <option value="with">Sudah ada profile</option>
            </select>
          </div>
        </div>

        <div class="camera-stage" id="stage" style="aspect-ratio: 4/3;margin-top:12px;">
          <div class="camera-placeholder" id="camera-placeholder" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(15,23,42,0.85);color:#cbd5e1;text-align:center;padding:24px;transition:opacity 200ms ease;">
            <div style="font-size:32px;">📸</div>
            <div>Aktifkan kamera untuk mulai enrollment.</div>
          </div>
          <video id="camera-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;display:none;"></video>
          <canvas id="overlay" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;"></canvas>
        </div>
      </section>

      <section class="card glass">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;align-items:center;margin-bottom:12px;">
          <h3 style="margin:0;">Daftar Siswa <span id="student-total" class="muted" style="font-size:14px;font-weight:400;"></span></h3>
          <span id="page-info" class="muted" style="font-size:13px;"></span>
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

      <section class="card glass" id="enroll-card" style="display:none;">
        <h3 style="margin:0 0 12px;">Proses Enrollment</h3>
        <div id="enroll-panel"></div>
      </section>

      <section class="card glass">
        <h3 style="margin:0 0 8px;">Log</h3>
        <pre id="log" style="background:#0f172a;color:#cbd5e1;padding:12px;border-radius:8px;max-height:160px;overflow:auto;margin:0;font-size:12px;"></pre>
      </section>
    </div>
  `;

  const video = root.querySelector<HTMLVideoElement>('#camera-video')!;
  const placeholder = root.querySelector<HTMLDivElement>('#camera-placeholder')!;
  const overlay = root.querySelector<HTMLCanvasElement>('#overlay')!;
  const overlayCtx = overlay.getContext('2d')!;

  const btnStart = root.querySelector<HTMLButtonElement>('#btn-start')!;
  const btnStop = root.querySelector<HTMLButtonElement>('#btn-stop')!;
  const btnSwitch = root.querySelector<HTMLButtonElement>('#btn-switch')!;
  const btnLoad = root.querySelector<HTMLButtonElement>('#btn-load')!;
  const filterClass = root.querySelector<HTMLSelectElement>('#filter-class')!;
  const filterStatus = root.querySelector<HTMLSelectElement>('#filter-status')!;
  const studentTotal = root.querySelector<HTMLSpanElement>('#student-total')!;
  const pageInfo = root.querySelector<HTMLSpanElement>('#page-info')!;
  const tbody = root.querySelector<HTMLTableSectionElement>('#student-tbody')!;
  const enrollCard = root.querySelector<HTMLDivElement>('#enroll-card')!;
  const enrollPanel = root.querySelector<HTMLDivElement>('#enroll-panel')!;
  const logEl = root.querySelector<HTMLPreElement>('#log')!;

  const log = (msg: string) => {
    const ts = formatTime(Date.now());
    logEl.textContent = `[${ts}] ${msg}\n` + logEl.textContent;
  };

  const setCamButtons = (active: boolean) => {
    btnStart.disabled = active;
    btnSwitch.disabled = !active;
    btnStop.disabled = !active;
    btnLoad.disabled = !active;
  };

  const refreshClasses = async () => {
    classes = await classRepository.list();
    filterClass.innerHTML = '<option value="">Semua kelas</option>' +
      classes.map((c) => `<option value="${c.id}">${c.name} (${c.grade})</option>`).join('');
  };

  const refreshStudents = async () => {
    students = await studentRepository.list();
    renderTable();
  };

  const renderTable = async () => {
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
    if (!cameraService.isActive()) {
      log('Aktifkan kamera dulu.');
      return;
    }
    if (!faceModelLoader.isLoaded()) {
      log('Load AI Models dulu.');
      return;
    }
    isEnrolling = true;
    await renderTable();
    enrollCard.style.display = 'block';
    enrollPanel.innerHTML = `
      <div id="enroll-step" style="padding:12px;background:rgba(255,255,255,0.6);border:1px solid var(--color-border);border-radius:var(--radius-md);">
        <p><strong>Siswa:</strong> ${student.name} (${student.nis})</p>
        <p class="muted">Sistem akan memverifikasi liveness, lalu menangkap 3 pose. Ikuti instruksi di layar.</p>
        <div id="enroll-status" class="stack" style="margin-top:12px;"></div>
      </div>
    `;
    const statusEl = enrollPanel.querySelector<HTMLDivElement>('#enroll-status')!;
    const stepEl = enrollPanel.querySelector<HTMLDivElement>('#enroll-step')!;

    const setStep = (title: string, detail: string) => {
      stepEl.innerHTML = `<p><strong>Siswa:</strong> ${student.name} (${student.nis})</p><p class="muted">${title}</p><p><strong>${detail}</strong></p><div id="enroll-status" class="stack" style="margin-top:12px;"></div>`;
      const newStatus = stepEl.querySelector<HTMLDivElement>('#enroll-status')!;
      return newStatus;
    };

    try {
      const result = await enrollmentService.enrollStudentWithFlow(student, video, {
        onStep: (step, msg) => {
          const title = step === 'liveness' ? 'Verifikasi Liveness' : step === 'front' ? 'Pose 1: Hadap Depan' : step === 'right' ? 'Pose 2: Hadap Kanan' : 'Pose 3: Hadap Kiri';
          const el = setStep(title, msg);
          statusEl.replaceWith(el);
          log(msg);
        }
      });
      enrollPanel.insertAdjacentHTML(
        'beforeend',
        `<div style="margin-top:8px;padding:12px;background:rgba(22,163,74,0.12);border:1px solid rgba(22,163,74,0.3);border-radius:var(--radius-md);color:var(--color-success);"><strong>✓ Enrollment selesai.</strong> Avg quality: ${result.avgQuality.toFixed(2)}, ${result.profiles.length} profile tersimpan.</div>`
      );
      log(`✓ Enrollment ${student.name} selesai. Quality=${result.avgQuality.toFixed(2)}`);
      await refreshStudents();
    } catch (err: unknown) {
      const msg = err instanceof FaceError || err instanceof Error ? err.message : 'Unknown error';
      enrollPanel.insertAdjacentHTML(
        'beforeend',
        `<div style="margin-top:8px;padding:12px;background:rgba(220,38,38,0.12);border:1px solid rgba(220,38,38,0.3);border-radius:var(--radius-md);color:var(--color-danger);"><strong>✗ Gagal:</strong> ${msg}</div>`
      );
      log(`ERROR enroll: ${msg}`);
    } finally {
      isEnrolling = false;
      overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
      await renderTable();
    }
  };

  btnStart.addEventListener('click', async () => {
    try {
      await cameraService.start(video);
      log('Kamera aktif.');
      setCamButtons(true);
      placeholder.style.opacity = '0';
      setTimeout(() => { placeholder.style.display = 'none'; }, 200);
      video.style.display = 'block';
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
    await cameraService.stop();
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    log('Kamera dihentikan.');
    setCamButtons(false);
    placeholder.style.display = 'flex';
    placeholder.style.opacity = '1';
    video.style.display = 'none';
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

  filterClass.addEventListener('change', () => void renderTable());
  filterStatus.addEventListener('change', () => void renderTable());

  await refreshClasses();
  await refreshStudents();
  log('Halaman enrollment siap.');

  window.addEventListener('beforeunload', () => {
    void cameraService.stop();
  });
}