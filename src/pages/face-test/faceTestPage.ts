import { cameraService, CameraError } from '@services/camera';
import {
  faceModelLoader,
  faceRecognitionService,
  faceEnrollmentService,
  livenessService,
  FaceError,
  type EmbeddingRecord,
  type EnrollmentPose,
  type RecognitionResult,
  type LivenessChallenge
} from '@services/face';
import { RECOGNITION_CONFIG } from '@config/app';
import { formatTime } from '@utils/device';

const POSE_LABELS: Record<EnrollmentPose, string> = {
  front: 'Hadap Depan',
  left: 'Hadap Kiri',
  right: 'Hadap Kanan'
};

const POSES: EnrollmentPose[] = ['front', 'left', 'right'];

export async function renderFaceTest(root: HTMLElement): Promise<void> {
  root.innerHTML = `
    <div class="stack">
      <header>
        <h2 style="margin:0 0 4px;">Face AI Test (Checkpoint P1)</h2>
        <p class="muted" style="margin:0;">
          Validasi face detection, embedding, recognition, dan active liveness.
        </p>
      </header>

      <section class="card stack">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;">
          <div class="row">
            <button class="btn btn-primary" id="btn-start">Mulai Kamera</button>
            <button class="btn btn-ghost" id="btn-switch" disabled>Switch</button>
            <button class="btn btn-ghost" id="btn-stop" disabled>Stop</button>
            <button class="btn btn-primary" id="btn-load-models" disabled>Load AI Models</button>
          </div>
          <div class="row">
            <label class="row" style="gap:6px;font-size:14px;">
              Threshold:
              <input id="threshold" type="range" min="0.5" max="1.0" step="0.01" value="${RECOGNITION_CONFIG.targetThreshold}" style="width:140px;" />
              <span id="threshold-val" style="min-width:42px;">${RECOGNITION_CONFIG.targetThreshold}</span>
            </label>
          </div>
        </div>

        <div class="camera-stage" id="stage">
          <div class="camera-placeholder">
            <div style="font-size:32px;">🤖</div>
            <div>Tekan <strong>Mulai Kamera</strong> lalu <strong>Load AI Models</strong>.</div>
          </div>
          <canvas id="overlay" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;"></canvas>
        </div>

        <div class="stat-grid">
          <div class="stat"><div class="label">Camera</div><div class="value" id="stat-cam">off</div></div>
          <div class="stat"><div class="label">Models</div><div class="value" id="stat-models">not loaded</div></div>
          <div class="stat"><div class="label">DB Size</div><div class="value" id="stat-db">0</div></div>
          <div class="stat"><div class="label">Last Score</div><div class="value" id="stat-score">—</div></div>
        </div>

        <div class="stack">
          <strong>Log</strong>
          <pre id="log" style="background:#0f172a;color:#cbd5e1;padding:12px;border-radius:8px;max-height:160px;overflow:auto;margin:0;font-size:12px;"></pre>
        </div>
      </section>

      <section class="card stack">
        <h3 style="margin:0;">A. Enrollment (3 pose)</h3>
        <div class="row">
          <input id="enroll-name" type="text" placeholder="Nama siswa (mis. Ahmad)" style="flex:1;min-width:160px;padding:10px;border:1px solid var(--color-border);border-radius:8px;font-size:15px;" />
          <button class="btn btn-primary" id="btn-enroll">Enroll</button>
        </div>
        <div id="enroll-progress" class="muted">Siap untuk enrollment.</div>
      </section>

      <section class="card stack">
        <h3 style="margin:0;">B. Recognition (real-time loop)</h3>
        <div class="row">
          <button class="btn btn-primary" id="btn-recog-start">Mulai Recognition</button>
          <button class="btn btn-ghost" id="btn-recog-stop" disabled>Stop</button>
        </div>
        <div id="recog-result" class="muted">Recognition nonaktif.</div>
      </section>

      <section class="card stack">
        <h3 style="margin:0;">C. Liveness (active challenge)</h3>
        <div class="row">
          <select id="liveness-challenge" style="padding:10px;border:1px solid var(--color-border);border-radius:8px;font-size:15px;">
            <option value="blink">Kedipkan mata</option>
            <option value="turn_left">Hadap kiri</option>
            <option value="turn_right">Hadap kanan</option>
          </select>
          <button class="btn btn-primary" id="btn-liveness">Mulai Liveness</button>
        </div>
        <div id="liveness-result" class="muted">Belum ada tes.</div>
      </section>

      <section class="card stack">
        <h3 style="margin:0;">Database (in-memory untuk PoC)</h3>
        <div id="db-list" class="muted">Kosong.</div>
        <div class="row">
          <button class="btn btn-ghost" id="btn-db-clear">Hapus Semua</button>
          <button class="btn btn-ghost" id="btn-db-export">Export JSON</button>
        </div>
      </section>
    </div>
  `;

  const stage = root.querySelector<HTMLDivElement>('#stage')!;
  const video = document.createElement('video');
  const overlay = root.querySelector<HTMLCanvasElement>('#overlay')!;
  const overlayCtx = overlay.getContext('2d')!;
  stage.insertBefore(video, overlay);

  const btnStart = root.querySelector<HTMLButtonElement>('#btn-start')!;
  const btnSwitch = root.querySelector<HTMLButtonElement>('#btn-switch')!;
  const btnStop = root.querySelector<HTMLButtonElement>('#btn-stop')!;
  const btnLoadModels = root.querySelector<HTMLButtonElement>('#btn-load-models')!;
  const logEl = root.querySelector<HTMLPreElement>('#log')!;
  const statCam = root.querySelector<HTMLDivElement>('#stat-cam')!;
  const statModels = root.querySelector<HTMLDivElement>('#stat-models')!;
  const statDb = root.querySelector<HTMLDivElement>('#stat-db')!;
  const statScore = root.querySelector<HTMLDivElement>('#stat-score')!;
  const thresholdInput = root.querySelector<HTMLInputElement>('#threshold')!;
  const thresholdVal = root.querySelector<HTMLSpanElement>('#threshold-val')!;

  const enrollName = root.querySelector<HTMLInputElement>('#enroll-name')!;
  const btnEnroll = root.querySelector<HTMLButtonElement>('#btn-enroll')!;
  const enrollProgress = root.querySelector<HTMLDivElement>('#enroll-progress')!;

  const btnRecogStart = root.querySelector<HTMLButtonElement>('#btn-recog-start')!;
  const btnRecogStop = root.querySelector<HTMLButtonElement>('#btn-recog-stop')!;
  const recogResult = root.querySelector<HTMLDivElement>('#recog-result')!;

  const livenessChallenge = root.querySelector<HTMLSelectElement>('#liveness-challenge')!;
  const btnLiveness = root.querySelector<HTMLButtonElement>('#btn-liveness')!;
  const livenessResult = root.querySelector<HTMLDivElement>('#liveness-result')!;

  const dbList = root.querySelector<HTMLDivElement>('#db-list')!;
  const btnDbClear = root.querySelector<HTMLButtonElement>('#btn-db-clear')!;
  const btnDbExport = root.querySelector<HTMLButtonElement>('#btn-db-export')!;

  const database: EmbeddingRecord[] = [];

  const log = (msg: string) => {
    const ts = formatTime(Date.now());
    logEl.textContent = `[${ts}] ${msg}\n` + logEl.textContent;
  };

  let recogRunning = false;
  let recogRaf: number | null = null;

  const refreshDb = () => {
    statDb.textContent = String(database.length);
    if (database.length === 0) {
      dbList.textContent = 'Kosong.';
    } else {
      dbList.innerHTML =
        '<ul style="margin:0;padding-left:18px;">' +
        database
          .map(
            (d) =>
              `<li><code>${d.id}</code> — <strong>${d.label}</strong> · quality=${d.qualityScore}</li>`
          )
          .join('') +
        '</ul>';
    }
  };
  refreshDb();

  thresholdInput.addEventListener('input', () => {
    thresholdVal.textContent = thresholdInput.value;
  });

  function setCamButtons(active: boolean) {
    btnStart.disabled = active;
    btnSwitch.disabled = !active;
    btnStop.disabled = !active;
    btnLoadModels.disabled = !active;
  }

  function clearOverlay() {
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  }

  function drawBoxes(boxes: Array<{ x: number; y: number; width: number; height: number; color: string; label: string }>) {
    const rect = video.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const scaleX = overlay.width / rect.width;
    const scaleY = overlay.height / rect.height;
    overlay.width = stageRect.width;
    overlay.height = stageRect.height;
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    for (const b of boxes) {
      overlayCtx.strokeStyle = b.color;
      overlayCtx.lineWidth = 3;
      overlayCtx.strokeRect(b.x * scaleX, b.y * scaleY, b.width * scaleX, b.height * scaleY);
      overlayCtx.fillStyle = b.color;
      overlayCtx.font = 'bold 14px sans-serif';
      overlayCtx.fillText(b.label, b.x * scaleX + 4, b.y * scaleY + 18);
    }
  }

  btnStart.addEventListener('click', async () => {
    try {
      await cameraService.start(video);
      log('Kamera aktif.');
      statCam.textContent = 'on';
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
    recogRunning = false;
    btnRecogStart.disabled = false;
    btnRecogStop.disabled = true;
    clearOverlay();
    statCam.textContent = 'off';
    log('Kamera dihentikan.');
    setCamButtons(false);
  });

  btnLoadModels.addEventListener('click', async () => {
    try {
      btnLoadModels.disabled = true;
      log('Memuat model Face AI...');
      await faceModelLoader.load();
      statModels.textContent = 'ready';
      log('Model Face AI siap.');
    } catch (err: unknown) {
      const msg = err instanceof FaceError ? err.message : (err as Error).message;
      statModels.textContent = 'error';
      log(`ERROR load model: ${msg}`);
      btnLoadModels.disabled = false;
    }
  });

  btnEnroll.addEventListener('click', async () => {
    if (!faceModelLoader.isLoaded()) {
      log('Load model dulu.');
      return;
    }
    const name = enrollName.value.trim();
    if (!name) {
      log('Nama siswa wajib diisi.');
      return;
    }
    btnEnroll.disabled = true;
    try {
      const unsub = faceEnrollmentService.onProgress((p) => {
        enrollProgress.textContent = `Pose ${p.index}/${p.total}: ${POSE_LABELS[p.pose]} (quality=${p.qualityScore.toFixed(2)})`;
        if (p.qualityScore > 0 && p.index === p.total) {
          enrollProgress.textContent += ' — selesai.';
        }
      });
      const rec = await faceEnrollmentService.enroll(video, name, POSES);
      database.push(rec);
      log(`Enrolled ${rec.label} (id=${rec.id}, quality=${rec.qualityScore})`);
      refreshDb();
      unsub();
    } catch (err: unknown) {
      const msg = err instanceof FaceError ? err.message : (err as Error).message;
      log(`ERROR enroll: ${msg}`);
      enrollProgress.textContent = `Error: ${msg}`;
    } finally {
      btnEnroll.disabled = false;
    }
  });

  const runRecognition = async () => {
    if (!faceModelLoader.isLoaded()) {
      log('Load model dulu.');
      recogRunning = false;
      btnRecogStart.disabled = false;
      btnRecogStop.disabled = true;
      return;
    }
    if (recogRunning) return;
    recogRunning = true;
    btnRecogStart.disabled = true;
    btnRecogStop.disabled = false;

    const threshold = parseFloat(thresholdInput.value);
    log(`Recognition loop start (threshold=${threshold}).`);

    const loop = async () => {
      if (!recogRunning) return;
      try {
        const result: RecognitionResult | null = await faceRecognitionService.recognize(video, database, {
          threshold,
          inputSize: 320,
          scoreThreshold: 0.5
        });
        if (result) {
          statScore.textContent = result.candidate ? result.candidate.score.toFixed(3) : 'no match';
          const label = result.candidate ? `${result.candidate.label} (${result.candidate.score.toFixed(3)})` : 'UNKNOWN';
          recogResult.innerHTML = `
            <div><strong>${result.matched ? '✓ MATCH' : '✗ UNKNOWN'}</strong>: ${label}</div>
            <div class="muted" style="font-size:13px;">detection=${result.detection.score.toFixed(3)} · duration=${result.durationMs.toFixed(0)}ms</div>
            ${result.topCandidates.length > 1 ? `<div class="muted" style="font-size:12px;">Top: ${result.topCandidates.slice(0, 3).map((c) => `${c.label}=${c.score.toFixed(2)}`).join(' · ')}</div>` : ''}
          `;
          drawBoxes([
            {
              x: result.detection.box.x,
              y: result.detection.box.y,
              width: result.detection.box.width,
              height: result.detection.box.height,
              color: result.matched ? '#16a34a' : '#f59e0b',
              label: label
            }
          ]);
        } else {
          recogResult.textContent = 'Tidak ada wajah terdeteksi.';
          clearOverlay();
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        log(`ERROR recog loop: ${msg}`);
      }
      recogRaf = window.setTimeout(loop, 250);
    };
    loop();
  };

  const stopRecognition = () => {
    recogRunning = false;
    if (recogRaf !== null) {
      clearTimeout(recogRaf);
      recogRaf = null;
    }
    btnRecogStart.disabled = false;
    btnRecogStop.disabled = true;
    clearOverlay();
    log('Recognition dihentikan.');
  };

  btnRecogStart.addEventListener('click', runRecognition);
  btnRecogStop.addEventListener('click', stopRecognition);

  btnLiveness.addEventListener('click', async () => {
    if (!faceModelLoader.isLoaded()) {
      log('Load model dulu.');
      return;
    }
    btnLiveness.disabled = true;
    const challenge = livenessChallenge.value as LivenessChallenge;
    livenessResult.textContent = `Menunggu: ${challenge}...`;
    try {
      const result = await livenessService.runChallenge(video, challenge, (msg) => {
        livenessResult.textContent = msg;
      });
      if (result.success) {
        livenessResult.innerHTML = `<strong style="color:var(--color-success);">✓ Liveness OK</strong> (${result.challenge}, ${result.durationMs}ms)`;
        log(`Liveness PASS: ${result.challenge} dalam ${result.durationMs}ms.`);
      } else {
        livenessResult.innerHTML = `<strong style="color:var(--color-danger);">✗ Gagal</strong>: ${result.reason ?? 'tidak diketahui'}`;
        log(`Liveness FAIL: ${result.challenge} — ${result.reason ?? ''}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      livenessResult.textContent = `Error: ${msg}`;
      log(`ERROR liveness: ${msg}`);
    } finally {
      btnLiveness.disabled = false;
    }
  });

  btnDbClear.addEventListener('click', () => {
    database.length = 0;
    refreshDb();
    log('Database dikosongkan.');
  });

  btnDbExport.addEventListener('click', () => {
    const data = JSON.stringify(
      database.map((d) => ({ id: d.id, label: d.label, qualityScore: d.qualityScore, createdAt: d.createdAt })),
      null,
      2
    );
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sf-poc-db-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    log('Database di-export.');
  });

  window.addEventListener('beforeunload', () => {
    void cameraService.stop();
    stopRecognition();
  });
}