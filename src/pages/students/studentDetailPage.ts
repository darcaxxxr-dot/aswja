import { studentRepository, classRepository, faceProfileRepository, attendanceRepository } from '@repositories/index';
import { ROUTES } from '@config/app';
import { formatTime, formatDate } from '@utils/device';
import type { AttendanceRecord, AttendanceStatus, ClassRoom, FaceProfile, Student } from '@models/types';

interface PageData {
  student: Student;
  classRoom: ClassRoom | undefined;
  profiles: FaceProfile[];
  recentRecords: Array<{ record: AttendanceRecord; sessionDate: string | undefined }>;
  stats: { total: number; hadir: number; terlambat: number; izin: number; sakit: number; alpa: number };
}

const STATUS_OPTIONS: AttendanceStatus[] = ['HADIR', 'TERLAMBAT', 'IZIN', 'SAKIT', 'ALPA'];

export async function renderStudentDetail(root: HTMLElement, params: Record<string, string>): Promise<void> {
  const studentId = params.id;
  root.innerHTML = `<div id="page-root"></div>`;
  const pageRoot = root.querySelector<HTMLElement>('#page-root')!;
  pageRoot.innerHTML = '<p class="muted">Memuat...</p>';

  if (!studentId) {
    pageRoot.innerHTML = `<div class="card"><h2>ID siswa tidak valid.</h2><a href="${ROUTES.students}" data-link class="btn btn-primary">Kembali</a></div>`;
    return;
  }

  const data = await loadData(studentId);
  if (!data) {
    pageRoot.innerHTML = `<div class="card stack"><h2>Siswa tidak ditemukan</h2><p class="muted">ID: <code>${studentId}</code></p><a href="${ROUTES.students}" data-link class="btn btn-primary">Kembali ke Daftar Siswa</a></div>`;
    return;
  }

  renderDetail(pageRoot, data);
}

async function loadData(studentId: string): Promise<PageData | null> {
  const student = await studentRepository.getById(studentId);
  if (!student) return null;
  const [classRoom, profiles, allSessions] = await Promise.all([
    classRepository.getById(student.classId),
    faceProfileRepository.listForStudent(studentId),
    attendanceRepository.listSessions()
  ]);

  const allRecords: AttendanceRecord[] = [];
  for (const s of allSessions) {
    const recs = await attendanceRepository.listRecords(s.id);
    for (const r of recs) if (r.studentId === studentId) allRecords.push(r);
  }
  allRecords.sort((a, b) => b.timestamp - a.timestamp);

  const sessionMap = new Map(allSessions.map((s) => [s.id, s]));
  const recentRecords = allRecords.slice(0, 20).map((record) => ({
    record,
    sessionDate: sessionMap.get(record.sessionId)?.date
  }));

  const stats = { total: allRecords.length, hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0 };
  for (const r of allRecords) {
    if (r.status === 'HADIR') stats.hadir++;
    else if (r.status === 'TERLAMBAT') stats.terlambat++;
    else if (r.status === 'IZIN') stats.izin++;
    else if (r.status === 'SAKIT') stats.sakit++;
    else if (r.status === 'ALPA') stats.alpa++;
  }

  return { student, classRoom, profiles, recentRecords, stats };
}

function renderDetail(root: HTMLElement, data: PageData): void {
  const { student, classRoom, profiles, recentRecords, stats } = data;
  const attendancePct = stats.total > 0 ? Math.round(((stats.hadir + stats.terlambat) / stats.total) * 100) : 0;

  root.innerHTML = `
    <div class="stack">
      <header>
        <div class="row" style="align-items:center;gap:8px;">
          <a href="${ROUTES.students}" data-link class="btn btn-ghost" style="padding:6px 10px;min-height:32px;font-size:13px;">← Kembali</a>
          <h2 style="margin:0;">${escapeHtml(student.name)}</h2>
        </div>
        <p class="muted" style="margin:4px 0 0;">NIS: <code>${escapeHtml(student.nis)}</code>${student.nisn ? ` · NISN: <code>${escapeHtml(student.nisn)}</code>` : ''} · Status: <strong>${student.status}</strong></p>
      </header>

      <section class="card stack">
        <h3 style="margin:0;">Informasi Siswa</h3>
        <div class="row" style="flex-wrap:wrap;gap:16px;">
          <div><span class="muted" style="font-size:13px;">Kelas</span><div><strong>${escapeHtml(classRoom?.name ?? '(?)')}</strong> ${classRoom ? `<span class="muted" style="font-size:12px;">(${escapeHtml(classRoom.grade)})</span>` : ''}</div></div>
          <div><span class="muted" style="font-size:13px;">Gender</span><div><strong>${student.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</strong></div></div>
          <div><span class="muted" style="font-size:13px;">Dibuat</span><div>${formatDate(student.createdAt)}</div></div>
          <div><span class="muted" style="font-size:13px;">Diupdate</span><div>${formatDate(student.updatedAt)}</div></div>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap;">
          <a href="${ROUTES.enrollment}" data-link class="btn btn-primary">${profiles.length > 0 ? 'Re-Enrollment' : 'Enroll'}</a>
          <button class="btn btn-ghost" id="btn-edit">Edit Data</button>
          <button class="btn btn-danger" id="btn-delete">Hapus Siswa</button>
        </div>
      </section>

      <section class="card stack">
        <h3 style="margin:0;">Face Profile</h3>
        ${profiles.length === 0
          ? '<p class="muted" style="margin:0;">⚠ Belum ada face profile. Lakukan enrollment di <a href="' + ROUTES.enrollment + '" data-link>Face Enrollment</a>.</p>'
          : profiles.map((p) => `
            <div class="card" style="padding:10px;">
              <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px;">
                <div>
                  <div><strong>ID:</strong> <code>${escapeHtml(p.id)}</code></div>
                  <div class="muted" style="font-size:12px;">Model: ${escapeHtml(p.modelVersion)} · Quality: ${p.qualityScore.toFixed(2)}</div>
                  <div class="muted" style="font-size:12px;">Embedding: ${p.embedding.length} vectors × ${p.embedding[0]?.length ?? 0} dimensi · Dibuat: ${formatDate(p.createdAt)}</div>
                </div>
                <button class="btn btn-danger" data-del-profile="${p.id}">Hapus Profile</button>
              </div>
            </div>
          `).join('')
        }
      </section>

      <section class="card stack">
        <h3 style="margin:0;">Statistik Kehadiran (sepanjang waktu)</h3>
        <div class="stat-grid">
          <div class="stat"><div class="label">Total Records</div><div class="value">${stats.total}</div></div>
          <div class="stat"><div class="label">Hadir</div><div class="value" style="color:var(--color-success);">${stats.hadir}</div></div>
          <div class="stat"><div class="label">Terlambat</div><div class="value" style="color:var(--color-warn);">${stats.terlambat}</div></div>
          <div class="stat"><div class="label">Izin</div><div class="value">${stats.izin}</div></div>
          <div class="stat"><div class="label">Sakit</div><div class="value">${stats.sakit}</div></div>
          <div class="stat"><div class="label">Alpa</div><div class="value" style="color:var(--color-danger);">${stats.alpa}</div></div>
          <div class="stat"><div class="label">% Hadir+Terlambat</div><div class="value">${attendancePct}%</div></div>
        </div>
      </section>

      <section class="card stack">
        <h3 style="margin:0;">Riwayat Absensi (20 terakhir)</h3>
        ${recentRecords.length === 0
          ? '<p class="muted" style="margin:0;">Belum ada riwayat absensi.</p>'
          : `<div style="overflow:auto;"><table style="width:100%;border-collapse:collapse;font-size:14px;">
              <thead>
                <tr style="background:var(--color-bg-elev);color:var(--color-text-inverse);">
                  <th style="padding:8px;text-align:left;">Tanggal</th>
                  <th style="padding:8px;text-align:left;">Jam</th>
                  <th style="padding:8px;text-align:left;">Status</th>
                  <th style="padding:8px;text-align:left;">Confidence</th>
                  <th style="padding:8px;text-align:left;">Device</th>
                  <th style="padding:8px;text-align:left;">Aksi</th>
                </tr>
              </thead>
              <tbody>
                ${recentRecords.map(({ record, sessionDate }) => {
                  const color = STATUS_COLOR[record.status];
                  return `
                    <tr style="border-bottom:1px solid var(--color-border);">
                      <td style="padding:8px;">${escapeHtml(sessionDate ?? '?')}</td>
                      <td style="padding:8px;">${formatTime(record.timestamp)}</td>
                      <td style="padding:8px;font-weight:700;color:${color};">${record.status}</td>
                      <td style="padding:8px;">${record.confidence.toFixed(3)}</td>
                      <td style="padding:8px;font-size:12px;" class="muted">${escapeHtml(record.deviceId)}</td>
                      <td style="padding:8px;">
                        <select data-status="${record.id}" style="padding:4px;border:1px solid var(--color-border);border-radius:6px;font-size:12px;">
                          ${STATUS_OPTIONS.map((s) => `<option value="${s}" ${s === record.status ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                        <button class="btn btn-danger" data-del-record="${record.id}" style="padding:2px 6px;min-height:24px;font-size:11px;margin-left:4px;">×</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table></div>`
        }
      </section>
    </div>
  `;

  bindEvents(root, student);
}

const STATUS_COLOR: Record<AttendanceStatus, string> = {
  HADIR: 'var(--color-success)',
  TERLAMBAT: 'var(--color-warn)',
  IZIN: 'var(--color-text-muted)',
  SAKIT: 'var(--color-text-muted)',
  ALPA: 'var(--color-danger)'
};

function bindEvents(root: HTMLElement, student: Student): void {
  root.querySelector<HTMLButtonElement>('#btn-edit')?.addEventListener('click', async () => {
    const newName = prompt('Nama lengkap:', student.name);
    if (newName === null) return;
    const newNisn = prompt('NISN (kosongkan untuk hapus):', student.nisn ?? '');
    try {
      await studentRepository.update(student.id, { name: newName.trim(), nisn: newNisn?.trim() || undefined });
      window.location.reload();
    } catch (err: unknown) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  root.querySelector<HTMLButtonElement>('#btn-delete')?.addEventListener('click', async () => {
    if (!confirm(`Hapus siswa ${student.name}? Face profile juga akan terhapus.`)) return;
    if (!confirm('Yakin? Data attendance yang sudah ada akan kehilangan referensi siswa.')) return;
    try {
      await studentRepository.remove(student.id);
      window.location.href = ROUTES.students;
    } catch (err: unknown) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  root.querySelectorAll<HTMLButtonElement>('[data-del-profile]').forEach((b) => {
    b.addEventListener('click', async () => {
      const id = b.dataset.delProfile!;
      if (!confirm('Hapus face profile ini?')) return;
      try {
        await faceProfileRepository.remove(id);
        window.location.reload();
      } catch (err: unknown) {
        alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  });

  root.querySelectorAll<HTMLSelectElement>('[data-status]').forEach((s) => {
    s.addEventListener('change', async () => {
      const id = s.dataset.status!;
      const newStatus = s.value as AttendanceStatus;
      try {
        await attendanceRepository.updateRecordStatus(id, newStatus);
        window.location.reload();
      } catch (err: unknown) {
        alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-del-record]').forEach((b) => {
    b.addEventListener('click', async () => {
      const id = b.dataset.delRecord!;
      if (!confirm('Hapus record absensi ini?')) return;
      try {
        await attendanceRepository.removeRecord(id);
        window.location.reload();
      } catch (err: unknown) {
        alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}