import { cameraService, CameraError } from '@services/camera';
import { faceModelLoader, FaceError } from '@services/face';
import { enrollmentService } from '@services/enrollment';
import { studentRepository, classRepository, faceProfileRepository } from '@repositories/index';
import { formatTime } from '@utils/device';
import type { Student, ClassRoom } from '@models/types';

const POSE_LABELS: Record<string, string> = {
  front: 'Hadap Depan',
  left: 'Hadap Kiri',
  right: 'Hadap Kanan'
};

export async function renderEnrollment(root: HTMLElement): Promise<void> {
  let students: Student[] = [];
  let classes: ClassRoom[] = [];
  let isEnrolling = false;

  root.innerHTML = `
    <div class="stack">
      <header>
        <h2 style="margin:0 0 4px;">Face Enrollment</h2>
        <p class="muted" style="margin:0;">
          Daftarkan wajah siswa ke sistem. Capture 3 pose (depan, kiri, kanan) lalu simpan ke IndexedDB.
        </p>
      </header>

      <section class="card stack">
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

        <div class="camera-stage" id="stage" style="aspect-ratio: 4/3;">
          <div class="camera-placeholder">
            <div style="font-size:32px;">📸</div>
            <div>Aktifkan kamera untuk mulai enrollment.</div>
          </div>
          <canvas id="overlay" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;"></canvas>
        </div>
      </section>

      <section class="card stack">
        <h3 style="margin:0;">Daftar Siswa</h3>
        <div class="row">
          <span id="student-count" class="muted" style="font-size:13px;">Memuat...</span>
        </div>
        <div id="student-list" class="stack" style="max-height:420px;overflow:auto;"></div>
      </section>

      <section class="card stack">
        <h3 style="margin:0;">Proses Enrollment</h3>
        <div id="enroll-panel">
          <p class="muted">Pilih siswa dari daftar untuk memulai enrollment.</p>
        </div>
      </section>

      <section class="card stack">
        <h3 style="margin:0;">Log</h3>
        <pre id="log" style="background:#0f172a;color:#cbd5e1;padding:12px;border-radius:8px;max-height:160px;overflow:auto;margin:0;font-size:12px;"></pre>
      </section>
    </div>
  `;

  const stage = root.querySelector<HTMLDivElement>('#stage')!;
  const video = document.createElement('video');
  const overlay = root.querySelector<HTMLCanvasElement>('#overlay')!;
  const overlayCtx = overlay.getContext('2d')!;
  stage.insertBefore(video, overlay);

  const btnStart = root.querySelector<HTMLButtonElement>('#btn-start')!;
  const btnStop = root.querySelector<HTMLButtonElement>('#btn-stop')!;
  const btnSwitch = root.querySelector<HTMLButtonElement>('#btn-switch')!;
  const btnLoad = root.querySelector<HTMLButtonElement>('#btn-load')!;
  const filterClass = root.querySelector<HTMLSelectElement>('#filter-class')!;
  const filterStatus = root.querySelector<HTMLSelectElement>('#filter-status')!;
  const studentCount = root.querySelector<HTMLSpanElement>('#student-count')!;
  const studentList = root.querySelector<HTMLDivElement>('#student-list')!;
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
    await renderStudentList();
  };

  const renderStudentList = async () => {
    const filterClsId = filterClass.value;
    const filterStat = filterStatus.value;
    let filtered = students;
    if (filterClsId) filtered = filtered.filter((s) => s.classId === filterClsId);

    const enriched = await Promise.all(
      filtered.map(async (s) => ({
        student: s,
        hasProfile: (await faceProfileRepository.listForStudent(s.id)).length > 0
      }))
    );
    const visible = enriched.filter((e) => {
      if (filterStat === 'without') return !e.hasProfile;
      if (filterStat === 'with') return e.hasProfile;
      return true;
    });

    studentCount.textContent = `${visible.length} siswa (dari ${students.length} total)`;
    if (visible.length === 0) {
      studentList.innerHTML = '<p class="muted" style="margin:0;">Tidak ada siswa dengan filter ini. Tambah siswa dulu di menu <strong>Siswa</strong>.</p>';
      return;
    }
    studentList.innerHTML = visible
      .map(
        ({ student, hasProfile }) => `
        <div class="card" style="padding:12px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div>
            <div><strong>${student.name}</strong> <span class="muted" style="font-size:12px;">· ${student.nis}</span></div>
            <div class="muted" style="font-size:12px;">${classes.find((c) => c.id === student.classId)?.name ?? '(kelas tidak ditemukan)'} · ${student.gender}</div>
            <div style="font-size:12px;margin-top:4px;">${hasProfile ? '<span style="color:var(--color-success);">✓ Sudah ada face profile</span>' : '<span style="color:var(--color-warn);">⚠ Belum ada face profile</span>'}</div>
          </div>
          <div class="row">
            <button class="btn btn-primary" data-enroll="${student.id}" ${isEnrolling ? 'disabled' : ''}>
              ${hasProfile ? 'Re-Enroll' : 'Enroll'}
            </button>
            ${hasProfile ? `<button class="btn btn-danger" data-remove="${student.id}" ${isEnrolling ? 'disabled' : ''}>Hapus</button>` : ''}
          </div>
        </div>`
      )
      .join('');

    studentList.querySelectorAll<HTMLButtonElement>('[data-enroll]').forEach((b) => {
      b.addEventListener('click', () => {
        const s = students.find((x) => x.id === b.dataset.enroll);
        if (s) void startEnrollment(s);
      });
    });
    studentList.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach((b) => {
      b.addEventListener('click', async () => {
        const id = b.dataset.remove!;
        if (!confirm('Hapus face profile siswa ini?')) return;
        try {
          await enrollmentService.removeProfile(id);
          log(`Face profile dihapus: ${id}`);
          await renderStudentList();
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
    enrollPanel.innerHTML = `
      <p><strong>Siswa:</strong> ${student.name} (${student.nis})</p>
      <p class="muted">Sistem akan menangkap 3 pose otomatis. Ikuti instruksi di bawah.</p>
      <div id="enroll-status" class="stack"></div>
    `;
    const statusEl = enrollPanel.querySelector<HTMLDivElement>('#enroll-status')!;
    const poseSteps: Array<{ pose: 'front' | 'left' | 'right'; label: string }> = [
      { pose: 'front', label: POSE_LABELS.front },
      { pose: 'left', label: POSE_LABELS.left },
      { pose: 'right', label: POSE_LABELS.right }
    ];
    statusEl.innerHTML =
      '<ol style="padding-left:18px;margin:0;">' +
      poseSteps.map((p) => `<li id="pose-${p.pose}" class="muted">${p.label}: menunggu...</li>`).join('') +
      '</ol>';

    let detectionRaf: number | null = null;
    const drawDetection = () => {
      if (!isEnrolling) return;
      // ambil snapshot dari video untuk deteksi visual saja
      void faceModelLoader;
      detectionRaf = window.setTimeout(drawDetection, 100);
    };
    drawDetection();

    try {
      const result = await enrollmentService.enrollStudent(
        student,
        video,
        ['front', 'left', 'right'],
        (msg, _pct) => {
          log(msg);
          for (const ps of poseSteps) {
            const el = statusEl.querySelector<HTMLLIElement>(`#pose-${ps.pose}`);
            if (el && msg.toLowerCase().includes(ps.pose)) {
              el.textContent = `${ps.label}: ✓ ${msg.includes('Menyimpan') ? 'selesai' : ''}`;
            }
          }
        }
      );
      statusEl.insertAdjacentHTML(
        'beforeend',
        `<div style="margin-top:8px;color:var(--color-success);"><strong>✓ Enrollment selesai.</strong> Avg quality: ${result.avgQuality.toFixed(2)}, ${result.profiles.length} profile tersimpan.</div>`
      );
      log(`✓ Enrollment ${student.name} selesai. Quality=${result.avgQuality.toFixed(2)}`);
      await renderStudentList();
    } catch (err: unknown) {
      const msg = err instanceof FaceError || err instanceof Error ? err.message : 'Unknown error';
      statusEl.insertAdjacentHTML(
        'beforeend',
        `<div style="margin-top:8px;color:var(--color-danger);"><strong>✗ Gagal:</strong> ${msg}</div>`
      );
      log(`ERROR enroll: ${msg}`);
    } finally {
      if (detectionRaf !== null) clearTimeout(detectionRaf);
      isEnrolling = false;
      overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    }
  };

  btnStart.addEventListener('click', async () => {
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
    await cameraService.stop();
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
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

  filterClass.addEventListener('change', () => void renderStudentList());
  filterStatus.addEventListener('change', () => void renderStudentList());

  await refreshClasses();
  await refreshStudents();
  log('Halaman enrollment siap.');

  window.addEventListener('beforeunload', () => {
    void cameraService.stop();
  });
}