import { cameraService, CameraError } from '@services/camera';
import { faceModelLoader, FaceError } from '@services/face';
import { faceEmbeddingService } from '@services/face/faceEmbeddingService';
import { enrollmentService } from '@services/enrollment';
import { studentRepository } from '@repositories/studentRepository';
import { classRepository } from '@repositories/classRepository';
import { faceProfileRepository } from '@repositories/faceProfileRepository';
import { formatTime } from '@utils/device';
import { FACE_CONFIG } from '@config/app';
import type { Student, ClassRoom } from '@models/types';

export async function renderEnrollment(root: HTMLElement): Promise<void> {
  let students: Student[] = [];
  let classes: ClassRoom[] = [];
  let isEnrolling = false;
  let modelLoaded = false;
  let cameraActive = false;

  root.innerHTML = `
    <div class="stack">
      <header>
        <h2 style="margin:0 0 4px;">Face Enrollment</h2>
        <p class="muted" style="margin:0;">
          Daftarkan wajah siswa ke sistem. Pastikan model AI dan kamera siap sebelum memulai.
        </p>
        <div id="status-indicator" style="margin-top:8px;font-size:14px;display:flex;gap:16px;flex-wrap:wrap;">
          <span id="status-model" class="muted">🔴 Model: <strong>belum dimuat</strong></span>
          <span id="status-camera" class="muted">🔴 Kamera: <strong>belum aktif</strong></span>
        </div>
      </header>

      <section class="card glass">
        <div class="row" style="flex-wrap:wrap;gap:8px;align-items:center;">
          <button class="btn btn-primary" id="btn-load">Load AI Models</button>
          <button class="btn btn-primary" id="btn-start">Mulai Kamera</button>
          <button class="btn btn-ghost" id="btn-stop" disabled>Stop</button>
          <button class="btn btn-ghost" id="btn-switch" disabled>Switch</button>
          <span id="enroll-student-name" class="muted" style="font-size:13px;margin-left:auto;"></span>
        </div>
        <div id="loading-status" style="margin-top:8px;font-size:14px;color:#94a3b8;min-height:20px;"></div>
      </section>

      <section class="card glass" id="enroll-workflow" style="display:none;">
        <div class="camera-stage" id="stage" style="aspect-ratio:4/3;margin-top:8px;position:relative;background:#000;">
          <div class="camera-placeholder" id="camera-placeholder" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(15,23,42,0.85);color:#cbd5e1;text-align:center;padding:24px;z-index:2;transition:opacity 300ms ease;">
            <div style="font-size:32px;">📸</div>
            <div>Klik <strong>Mulai Kamera</strong> untuk memulai enrollment.</div>
          </div>
          <video id="camera-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;display:none;transform:scaleX(-1);"></video>
          <canvas id="overlay" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:block;"></canvas>
          <div id="instruction-overlay" style="position:absolute;top:16px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:#fff;padding:8px 20px;border-radius:30px;font-size:16px;font-weight:bold;text-align:center;display:none;z-index:10;border:2px solid var(--color-primary);white-space:nowrap;max-width:90%;overflow:hidden;text-overflow:ellipsis;"></div>
        </div>
        <div id="enroll-step" style="margin-top:12px;padding:12px;background:rgba(255,255,255,0.6);border:1px solid var(--color-border);border-radius:var(--radius-md);display:none;"></div>
        <div style="margin-top:12px;">
          <button class="btn btn-danger" id="btn-cancel-enroll" style="display:none;">Batal</button>
        </div>
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

  // DOM refs
  const video = root.querySelector<HTMLVideoElement>('#camera-video');
  const placeholder = root.querySelector<HTMLDivElement>('#camera-placeholder');
  const overlay = root.querySelector<HTMLCanvasElement>('#overlay');
  const overlayCtx = overlay?.getContext('2d');
  const instructionOverlay = root.querySelector<HTMLDivElement>('#instruction-overlay');
  const loadingStatus = root.querySelector<HTMLDivElement>('#loading-status');
  const statusModel = root.querySelector<HTMLSpanElement>('#status-model');
  const statusCamera = root.querySelector<HTMLSpanElement>('#status-camera');

  const enrollWorkflow = root.querySelector<HTMLDivElement>('#enroll-workflow');
  const enrollStudentName = root.querySelector<HTMLSpanElement>('#enroll-student-name');
  const enrollStep = root.querySelector<HTMLDivElement>('#enroll-step');
  const btnLoad = root.querySelector<HTMLButtonElement>('#btn-load');
  const btnStart = root.querySelector<HTMLButtonElement>('#btn-start');
  const btnStop = root.querySelector<HTMLButtonElement>('#btn-stop');
  const btnSwitch = root.querySelector<HTMLButtonElement>('#btn-switch');
  const btnCancelEnroll = root.querySelector<HTMLButtonElement>('#btn-cancel-enroll');
  const filterClass = root.querySelector<HTMLSelectElement>('#filter-class');
  const filterStatus = root.querySelector<HTMLSelectElement>('#filter-status');
  const studentTotal = root.querySelector<HTMLSpanElement>('#student-total');
  const pageInfo = root.querySelector<HTMLSpanElement>('#page-info');
  const tbody = root.querySelector<HTMLTableSectionElement>('#student-tbody');
  const logEl = root.querySelector<HTMLPreElement>('#log');

  let isVisualizing = false;
  let cancelEnrollment = false;
  let visualizerFrame: number | null = null;
  let bypassLiveness = false;

  // --- Helpers ---
  const log = (msg: string) => {
    if (!logEl) return;
    const ts = formatTime(Date.now());
    logEl.textContent = `[${ts}] ${msg}\n` + logEl.textContent;
  };

  const updateStatusIndicators = () => {
    if (statusModel) {
      statusModel.innerHTML = modelLoaded
        ? '🟢 Model: <strong>siap</strong>'
        : '🔴 Model: <strong>belum dimuat</strong>';
    }
    if (statusCamera) {
      statusCamera.innerHTML = cameraActive
        ? '🟢 Kamera: <strong>aktif</strong>'
        : '🔴 Kamera: <strong>belum aktif</strong>';
    }
  };

  const setCamButtons = (active: boolean) => {
    if (btnStart) btnStart.disabled = active;
    if (btnSwitch) btnSwitch.disabled = !active;
    if (btnStop) btnStop.disabled = !active;
    updateEnrollButtons();
  };

  const updateEnrollButtons = () => {
    const canEnroll = modelLoaded && cameraActive && !isEnrolling;
    document.querySelectorAll('[data-enroll]').forEach((btn) => {
      const hasProfile = btn.getAttribute('data-has-profile') === 'true';
      (btn as HTMLButtonElement).disabled = !canEnroll || hasProfile || isEnrolling;
    });
    if (btnCancelEnroll) {
      btnCancelEnroll.style.display = isEnrolling ? 'inline-block' : 'none';
    }
  };

  const showLoading = (msg: string) => { if (loadingStatus) loadingStatus.textContent = msg; };
  const hideLoading = () => { if (loadingStatus) loadingStatus.textContent = ''; };

  // --- Data fetching & rendering ---
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
      updateEnrollButtons();
      return;
    }

    const canEnroll = modelLoaded && cameraActive && !isEnrolling;

    tbody.innerHTML = visible.map((e, i) => {
      const cls = classes.find((c) => c.id === e.student.classId);
      const qualityText = e.quality !== null ? `<span style="color:${e.quality >= 0.7 ? 'var(--color-success)' : 'var(--color-warn)'};">${(e.quality * 100).toFixed(0)}%</span>` : '<span class="muted">—</span>';
      const disabled = !canEnroll || e.hasProfile || isEnrolling;
      return `<tr style="border-top:1px solid var(--color-border);">
        <td style="padding:8px;text-align:center;color:var(--color-text-muted);">${i + 1}</td>
        <td style="padding:8px;">${e.student.nis}</td>
        <td style="padding:8px;"><strong>${e.student.name}</strong></td>
        <td style="padding:8px;">${cls?.grade ?? '—'}</td>
        <td style="padding:8px;">${cls?.name ?? '—'}</td>
        <td style="padding:8px;text-align:center;">${qualityText}</td>
        <td style="padding:8px;text-align:center;">
          <button class="btn btn-primary" data-enroll="${e.student.id}" data-has-profile="${e.hasProfile}" ${disabled ? 'disabled' : ''} style="padding:4px 8px;min-height:28px;font-size:12px;">${e.hasProfile ? 'Sudah Enroll' : 'Enroll'}</button>
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

    updateEnrollButtons();
  };

  // --- Visualizer (dengan koordinat relatif dan scaling yang benar) ---
  const startVisualizer = () => {
    if (isVisualizing || !video || !overlay || !overlayCtx) return;
    if (isEnrolling) return;
    isVisualizing = true;
    instructionOverlay!.style.display = 'block';

    const loop = () => {
      if (!isVisualizing || isEnrolling) {
        if (isEnrolling) {
          isVisualizing = false;
          if (instructionOverlay) instructionOverlay.style.display = 'none';
        }
        return;
      }

      const canvasRect = overlay.getBoundingClientRect();
      overlay.width = canvasRect.width;
      overlay.height = canvasRect.height;
      overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

      if (video.videoWidth === 0 || video.videoHeight === 0) {
        visualizerFrame = requestAnimationFrame(loop);
        return;
      }

      faceEmbeddingService.computeFromVideo(video, { inputSize: FACE_CONFIG.inputSize, scoreThreshold: FACE_CONFIG.scoreThreshold })
        .then((res) => {
          if (!isVisualizing || isEnrolling || !res) return;
          const { box } = res.detection;
          const relX = box.x / video.videoWidth;
          const relY = box.y / video.videoHeight;
          const relW = box.width / video.videoWidth;
          const relH = box.height / video.videoHeight;
          const flippedRelX = 1 - relX - relW;
          const canvasX = flippedRelX * overlay.width;
          const canvasY = relY * overlay.height;
          const canvasW = relW * overlay.width;
          const canvasH = relH * overlay.height;

          overlayCtx.strokeStyle = '#10b981';
          overlayCtx.lineWidth = 4;
          overlayCtx.strokeRect(canvasX, canvasY, canvasW, canvasH);

          const quality = faceEmbeddingService.computeQualityScore(
            res.detection,
            video.videoWidth,
            video.videoHeight,
            res.sharpness,
            res.lighting
          );
          const qualityPct = Math.round(quality * 100);
          const text = `Quality: ${qualityPct}%`;
          overlayCtx.font = 'bold 20px sans-serif';
          const metrics = overlayCtx.measureText(text);
          const textWidth = metrics.width;
          const bgX = canvasX;
          const bgY = canvasY - 30;
          overlayCtx.fillStyle = '#10b981';
          overlayCtx.fillRect(bgX, bgY, textWidth + 16, 30);
          overlayCtx.fillStyle = '#ffffff';
          overlayCtx.fillText(text, bgX + 8, bgY + 22);
        })
        .catch(() => {});

      if (isVisualizing && !isEnrolling) {
        visualizerFrame = requestAnimationFrame(loop);
      } else {
        isVisualizing = false;
        if (instructionOverlay) instructionOverlay.style.display = 'none';
      }
    };
    loop();
  };

  const stopVisualizer = () => {
    isVisualizing = false;
    if (visualizerFrame) {
      cancelAnimationFrame(visualizerFrame);
      visualizerFrame = null;
    }
    if (overlayCtx && overlay) overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    if (instructionOverlay) instructionOverlay.style.display = 'none';
  };

  // --- Enrollment flow dengan bypass ---
  const startEnrollment = async (student: Student) => {
    if (isEnrolling) return;
    if (!modelLoaded || !cameraActive) {
      log('Pastikan model AI dan kamera sudah siap.');
      return;
    }
    isEnrolling = true;
    cancelEnrollment = false;
    bypassLiveness = false;
    if (btnCancelEnroll) btnCancelEnroll.style.display = 'inline-block';
    if (enrollWorkflow) enrollWorkflow.style.display = 'block';
    if (enrollStudentName) enrollStudentName.textContent = `Siswa: ${student.name} (${student.nis})`;
    if (enrollStep) enrollStep.style.display = 'none';
    if (overlayCtx && overlay) overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    if (placeholder) placeholder.style.display = 'none';
    if (video) video.style.display = 'block';

    const cancelHandler = () => {
      cancelEnrollment = true;
      log('Membatalkan enrollment...');
    };
    btnCancelEnroll?.addEventListener('click', cancelHandler);

    log(`Memulai enrollment untuk ${student.name}...`);
    try {
      stopVisualizer();
      await runEnrollmentFlow(student);
    } catch (err: unknown) {
      // Error sudah ditangani di runEnrollmentFlow
    } finally {
      isEnrolling = false;
      if (btnCancelEnroll) {
        btnCancelEnroll.style.display = 'none';
        btnCancelEnroll.removeEventListener('click', cancelHandler);
      }
      updateEnrollButtons();
      startVisualizer();
      await renderTable();
    }
  };

  const runEnrollmentFlow = async (student: Student) => {
    if (!enrollStep || !video) return;
    enrollStep.style.display = 'block';
    enrollStep.innerHTML = `
      <p class="muted">Sistem akan memverifikasi liveness, lalu menangkap 3 pose. Ikuti instruksi di layar.</p>
      <div id="enroll-status" class="stack" style="margin-top:12px;"></div>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
        <button id="btn-skip-liveness" class="btn" style="background:rgba(245,158,11,0.15);color:#92400e;border:1px solid #f59e0b;padding:6px 12px;font-size:12px;min-height:32px;">⏭ Lewati Liveness (Bypass)</button>
        <button id="btn-cancel-flow" class="btn btn-ghost" style="padding:6px 12px;font-size:12px;min-height:32px;">✗ Batalkan</button>
      </div>
    `;
    const statusEl = enrollStep.querySelector<HTMLDivElement>('#enroll-status');
    if (!statusEl) return;

    // Tombol bypass liveness - operator bisa skip tanpa menunggu timeout
    const btnSkipLiveness = enrollStep.querySelector<HTMLButtonElement>('#btn-skip-liveness');
    btnSkipLiveness?.addEventListener('click', () => {
      bypassLiveness = true;
      log('Operator memilih bypass liveness. Lanjut enrollment tanpa verifikasi...');
      btnSkipLiveness.disabled = true;
      btnSkipLiveness.textContent = '✓ Liveness dilewati';
      // Re-run flow dengan skipLiveness=true
      void runEnrollmentFlow(student);
    });

    // Tombol cancel - hentikan enrollment
    const btnCancelFlow = enrollStep.querySelector<HTMLButtonElement>('#btn-cancel-flow');
    btnCancelFlow?.addEventListener('click', () => {
      cancelEnrollment = true;
      log('Membatalkan enrollment dari flow...');
    });

    const setStatus = (title: string, detail: string) => {
      if (cancelEnrollment) return;
      statusEl.innerHTML = `<p><strong>${title}</strong></p><p>${detail}</p>`;
    };

    try {
      startVisualizer();
      const result = await enrollmentService.enrollStudentWithFlow(student, video, {
        onStep: (step, msg) => {
          if (cancelEnrollment) throw new Error('Dibatalkan pengguna.');
          const title = step === 'liveness' ? 'Verifikasi Liveness' : step === 'front' ? 'Pose 1: Hadap Depan' : step === 'right' ? 'Pose 2: Serong Kanan' : 'Pose 3: Serong Kiri';
          setStatus(title, msg);
          if (instructionOverlay) {
            instructionOverlay.innerHTML = `<span style="font-size:14px;color:#94a3b8;margin-right:8px;">${title}</span> ${msg}`;
            instructionOverlay.style.display = 'block';
          }
          log(msg);
        },
        skipLiveness: bypassLiveness
      });

      const bypassMsg = result.livenessBypassed ? ' (liveness dilewati oleh operator)' : '';
      statusEl.insertAdjacentHTML('beforeend', `<div style="margin-top:8px;color:var(--color-success);"><strong>✓ Enrollment selesai.</strong> Avg quality: ${result.avgQuality.toFixed(2)}, ${result.profiles.length} profile tersimpan.${bypassMsg}</div>`);
      log(`✓ Enrollment ${student.name} selesai. Quality=${result.avgQuality.toFixed(2)}${bypassMsg}`);
      await refreshStudents();
    } catch (err: unknown) {
      // DEBUG: log error ke console
      console.error('Enrollment error:', err);

      // Cek apakah error adalah FaceError dengan properti bypassable
      const isBypassable = err instanceof FaceError && err.bypassable === true;

      if (isBypassable && !bypassLiveness) {
        // --- TAMPILAN BYPASS YANG DIPERINDAH ---
        statusEl.insertAdjacentHTML('beforeend', `
          <div id="bypass-container" style="margin-top:16px; padding:20px; background: linear-gradient(145deg, #fffbeb, #fef3c7); border: 2px solid #f59e0b; border-radius: 16px; box-shadow: 0 8px 30px rgba(245, 158, 11, 0.25); text-align: center; animation: fadeInUp 0.5s ease;">
            <div style="display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:6px;">
              <span style="font-size:32px;">⚠️</span>
              <span style="font-weight:800; font-size:20px; color:#78350f;">Liveness Gagal Terdeteksi</span>
            </div>
            <p style="margin:0 0 4px 0; color:#92400e; font-size:15px; font-weight:500;">Sistem gagal membaca kedipan atau gerakan wajah secara otomatis.</p>
            <p style="margin:0 0 16px 0; color:#b45309; font-size:14px;">Jika wajah sudah berada di tengah dan terlihat jelas, klik tombol di bawah untuk <strong>melewati</strong> verifikasi.</p>
            <button id="btn-bypass-liveness" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: #ffffff; border: none; padding: 14px 40px; border-radius: 50px; font-weight: 700; font-size: 16px; cursor: pointer; box-shadow: 0 4px 16px rgba(245, 158, 11, 0.5); transition: transform 0.2s ease, box-shadow 0.2s ease; letter-spacing: 0.5px;">✅ Konfirmasi & Lanjutkan</button>
            <p style="margin:8px 0 0 0; font-size:12px; color:#92400e;">* Tindakan ini akan dicatat sebagai "Bypass Operator" di log sistem.</p>
          </div>
        `);

        // Tambahkan animasi fade-in (jika belum ada)
        if (!document.getElementById('bypass-anim-style')) {
          const style = document.createElement('style');
          style.id = 'bypass-anim-style';
          style.textContent = `
            @keyframes fadeInUp {
              from { opacity: 0; transform: translateY(20px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `;
          document.head.appendChild(style);
        }

        // Event listener untuk tombol bypass
        const bypassBtn = statusEl.querySelector<HTMLButtonElement>('#btn-bypass-liveness');
        bypassBtn?.addEventListener('click', () => {
          bypassLiveness = true;
          log('Operator mengkonfirmasi liveness (bypass). Melanjutkan enrollment...');
          const bypassContainer = bypassBtn.closest('#bypass-container');
          if (bypassContainer) bypassContainer.remove();
          void runEnrollmentFlow(student);
        });
        return;
      } else {
        // Jika error tidak bypassable atau bypass sudah dipakai, tampilkan error biasa
        const msg = err instanceof FaceError || err instanceof Error ? err.message : 'Unknown error';
        statusEl.insertAdjacentHTML('beforeend', `<div style="margin-top:8px;color:var(--color-danger);"><strong>✗ Gagal:</strong> ${msg}</div>`);
        log(`ERROR enroll: ${msg}`);
        throw err;
      }
    } finally {
      if (instructionOverlay) instructionOverlay.style.display = 'none';
    }
  };

  // --- Event Listeners ---
  btnLoad?.addEventListener('click', async () => {
    if (faceModelLoader.isLoaded()) {
      log('Model sudah dimuat.');
      return;
    }
    try {
      btnLoad.disabled = true;
      showLoading('Memuat model AI...');
      log('Memuat model...');
      await faceModelLoader.load();
      modelLoaded = true;
      log('Model siap.');
      updateStatusIndicators();
      updateEnrollButtons();
    } catch (err: unknown) {
      const msg = err instanceof FaceError ? err.message : (err as Error).message;
      log(`ERROR load model: ${msg}`);
    } finally {
      btnLoad.disabled = false;
      hideLoading();
    }
  });

  btnStart?.addEventListener('click', async () => {
    if (cameraService.isActive()) {
      log('Kamera sudah aktif.');
      return;
    }
    try {
      btnStart.disabled = true;
      showLoading('Menyalakan kamera...');
      log('Memulai kamera...');
      if (video) await cameraService.start(video);
      cameraActive = true;
      log('Kamera aktif.');
      if (placeholder) placeholder.style.display = 'none';
      if (video) video.style.display = 'block';
      setCamButtons(true);
      updateStatusIndicators();
      updateEnrollButtons();
      startVisualizer();
    } catch (err: unknown) {
      const msg = err instanceof CameraError ? err.message : (err as Error).message;
      log(`ERROR kamera: ${msg}`);
    } finally {
      btnStart.disabled = false;
      hideLoading();
    }
  });

  btnStop?.addEventListener('click', async () => {
    stopVisualizer();
    await cameraService.stop();
    cameraActive = false;
    if (overlayCtx && overlay) overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    log('Kamera dihentikan.');
    setCamButtons(false);
    if (placeholder) {
      placeholder.style.display = 'flex';
      placeholder.style.opacity = '1';
    }
    if (video) video.style.display = 'none';
    if (enrollStep) enrollStep.style.display = 'none';
    if (enrollWorkflow) enrollWorkflow.style.display = 'none';
    if (instructionOverlay) instructionOverlay.style.display = 'none';
    updateStatusIndicators();
    updateEnrollButtons();
  });

  btnSwitch?.addEventListener('click', async () => {
    if (!cameraService.isActive()) {
      log('Kamera belum aktif.');
      return;
    }
    try {
      await cameraService.switchCamera(video!);
      log('Kamera di-switch.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      log(`ERROR switch: ${msg}`);
    }
  });

  filterClass?.addEventListener('change', () => void renderTable());
  filterStatus?.addEventListener('change', () => void renderTable());

  // --- Initialization ---
  await refreshClasses();
  await refreshStudents();

  if (faceModelLoader.isLoaded()) {
    modelLoaded = true;
    log('Model sudah dimuat sebelumnya.');
  }
  if (cameraService.isActive()) {
    cameraActive = true;
    log('Kamera sudah aktif.');
    if (placeholder) placeholder.style.display = 'none';
    if (video) video.style.display = 'block';
  }
  updateStatusIndicators();
  updateEnrollButtons();
  log('Halaman enrollment siap. Muat model dan nyalakan kamera untuk mulai.');
}