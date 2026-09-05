import { cameraService, CameraError } from '@services/camera';

export async function renderCameraTest(root: HTMLElement): Promise<void> {
  root.innerHTML = `
    <div class="stack">
      <header>
        <h2 style="margin:0 0 4px;">Camera Test (Checkpoint P0)</h2>
        <p class="muted" style="margin:0;">
          Verifikasi kamera & izin berjalan stabil di smartphone Android.
        </p>
      </header>

      <section class="card stack">
        <div class="camera-stage" id="camera-stage">
          <div class="camera-placeholder">
            <div style="font-size:32px;">📷</div>
            <div>Tekan <strong>Mulai Kamera</strong> untuk mengaktifkan kamera depan.</div>
          </div>
        </div>

        <div class="row" style="justify-content: space-between;">
          <div class="row">
            <button class="btn btn-primary" id="btn-start">Mulai Kamera</button>
            <button class="btn btn-ghost" id="btn-switch" disabled>Switch Kamera</button>
            <button class="btn btn-ghost" id="btn-stop" disabled>Stop</button>
            <button class="btn btn-primary" id="btn-capture" disabled>Capture</button>
          </div>
        </div>

        <div class="stat-grid">
          <div class="stat"><div class="label">Facing</div><div class="value" id="stat-facing">—</div></div>
          <div class="stat"><div class="label">Resolution</div><div class="value" id="stat-res">—</div></div>
          <div class="stat"><div class="label">Supported</div><div class="value" id="stat-supported">—</div></div>
          <div class="stat"><div class="label">Device ID</div><div class="value" id="stat-device" style="font-size:12px;word-break:break-all;">—</div></div>
        </div>

        <div class="stack">
          <strong>Log</strong>
          <pre id="log" style="background:#0f172a;color:#cbd5e1;padding:12px;border-radius:8px;max-height:180px;overflow:auto;margin:0;font-size:12px;"></pre>
        </div>

        <div class="stack" id="snapshot-container" style="display:none;">
          <strong>Snapshot terakhir</strong>
          <img id="snapshot" alt="snapshot" style="width:100%;max-width:320px;border-radius:8px;border:1px solid var(--color-border);" />
        </div>
      </section>
    </div>
  `;

  const stage = root.querySelector<HTMLDivElement>('#camera-stage')!;
  const video = document.createElement('video');
  stage.appendChild(video);

  const btnStart = root.querySelector<HTMLButtonElement>('#btn-start')!;
  const btnSwitch = root.querySelector<HTMLButtonElement>('#btn-switch')!;
  const btnStop = root.querySelector<HTMLButtonElement>('#btn-stop')!;
  const btnCapture = root.querySelector<HTMLButtonElement>('#btn-capture')!;
  const logEl = root.querySelector<HTMLPreElement>('#log')!;
  const statFacing = root.querySelector<HTMLDivElement>('#stat-facing')!;
  const statRes = root.querySelector<HTMLDivElement>('#stat-res')!;
  const statSupported = root.querySelector<HTMLDivElement>('#stat-supported')!;
  const statDevice = root.querySelector<HTMLDivElement>('#stat-device')!;
  const snapshotContainer = root.querySelector<HTMLDivElement>('#snapshot-container')!;
  const snapshotImg = root.querySelector<HTMLImageElement>('#snapshot')!;

  const log = (msg: string) => {
    const ts = new Date().toLocaleTimeString('id-ID');
    logEl.textContent = `[${ts}] ${msg}\n` + logEl.textContent;
  };

  statSupported.textContent = cameraService.isSupported() ? 'YA' : 'TIDAK';

  function setButtons(active: boolean) {
    btnStart.disabled = active;
    btnSwitch.disabled = !active;
    btnStop.disabled = !active;
    btnCapture.disabled = !active;
  }

  function clearError() {
    const err = stage.querySelector('.camera-error');
    if (err) err.remove();
  }

  function showError(msg: string) {
    clearError();
    const div = document.createElement('div');
    div.className = 'camera-error';
    div.textContent = msg;
    stage.appendChild(div);
  }

  btnStart.addEventListener('click', async () => {
    clearError();
    try {
      log('Memulai kamera...');
      await cameraService.start(video);
      log(`Kamera aktif. facing=${cameraService.getCurrentFacingMode()} device=${cameraService.getCurrentDeviceId() ?? 'default'}`);
      statFacing.textContent = cameraService.getCurrentFacingMode();
      statRes.textContent = `${video.videoWidth}×${video.videoHeight}`;
      statDevice.textContent = cameraService.getCurrentDeviceId() ?? 'default';
      setButtons(true);
    } catch (err: unknown) {
      const msg = err instanceof CameraError ? err.message : (err as Error).message;
      log(`ERROR: ${msg}`);
      showError(msg);
    }
  });

  btnSwitch.addEventListener('click', async () => {
    try {
      log('Switch kamera...');
      await cameraService.switchCamera(video);
      statFacing.textContent = cameraService.getCurrentFacingMode();
      statRes.textContent = `${video.videoWidth}×${video.videoHeight}`;
      statDevice.textContent = cameraService.getCurrentDeviceId() ?? 'default';
    } catch (err: unknown) {
      const msg = err instanceof CameraError ? err.message : (err as Error).message;
      log(`ERROR: ${msg}`);
      showError(msg);
    }
  });

  btnStop.addEventListener('click', async () => {
    try {
      await cameraService.stop();
      log('Kamera dihentikan.');
      statFacing.textContent = '—';
      statRes.textContent = '—';
      statDevice.textContent = '—';
      setButtons(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      log(`ERROR stop: ${msg}`);
    }
  });

  btnCapture.addEventListener('click', async () => {
    try {
      const snap = await cameraService.captureSnapshot(video);
      snapshotImg.src = snap.dataUrl;
      snapshotContainer.style.display = 'flex';
      log(`Snapshot OK: ${snap.width}×${snap.height}, ${(snap.blob.size / 1024).toFixed(1)} KB`);
    } catch (err) {
      const msg = err instanceof CameraError ? err.message : (err as Error).message;
      log(`ERROR capture: ${msg}`);
    }
  });

  window.addEventListener('beforeunload', () => {
    void cameraService.stop();
  });
}