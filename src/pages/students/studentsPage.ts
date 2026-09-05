export async function renderStudents(root: HTMLElement): Promise<void> {
  root.innerHTML = `
    <div class="stack">
      <header>
        <h2 style="margin:0 0 8px;">Manajemen Siswa</h2>
        <p class="muted" style="margin:0;">Daftar siswa, tambah, edit, hapus. Data tersimpan di IndexedDB.</p>
      </header>

      <section class="card glass">
        <h3 style="margin:0 0 8px;">Tambah Siswa</h3>
        <div class="row" style="flex-wrap:wrap;gap:8px;">
          <input id="f-nis" type="text" placeholder="NIS" style="width:120px;padding:8px;border:1px solid var(--color-border);border-radius:8px;" />
          <input id="f-nisn" type="text" placeholder="NISN (opsional)" style="width:120px;padding:10px;border:1px solid var(--color-border);border-radius:8px;" />
          <input id="f-name" type="text" placeholder="Nama lengkap" style="flex:1;min-width:200px;padding:8px;border:1px solid var(--color-border);border-radius:8px;" />
          <select id="f-gender" style="padding:8px;border:1px solid var(--color-border);border-radius:8px;">
            <option value="L">Laki-laki</option>
            <option value="P">Perempuan</option>
          </select>
          <select id="f-class" style="padding:8px;border:1px solid var(--color-border);border-radius:8px;min-width:200px;">
            <option value="">— Pilih kelas —</option>
          </select>
          <button class="btn btn-primary" id="btn-add">Tambah</button>
        </div>
        <div id="msg" class="muted"></div>
      </section>

      <section class="card">
        <p class="muted" style="margin:0;font-size:13px;">
          Lanjut ke <a href="/enrollment" data-link>Face Enrollment</a> untuk mendaftarkan wajah siswa.
        </p>
      </section>

      <section class="card">
        <p class="muted" style="margin:0;font-size:13px;">
          <a href="/db-test" data-link>DB Test</a>
        </p>
      </section>
    </div>
  `;
}