# Rencana Peningkatan UI/UX & AI Enrollment

Fitur ini akan merombak pengalaman pendaftaran (enrollment) wajah agar jauh lebih intuitif dan akurat, menyelesaikan masalah gagal deteksi ("Wajah tidak ditemukan") sekaligus memberikan *feedback* visual waktu-nyata kepada pengguna.

## Tujuan Perubahan
1. **Meningkatkan Akurasi AI:** Memperbesar area pencarian `inputSize` FaceAPI hingga 512 piksel dan menurunkan `scoreThreshold` ke 0.4.
2. **Visual Bounding Box (Ala YOLO):** Saat kamera aktif dan *enrollment* berjalan, sistem akan mendeteksi wajah secara terus-menerus dan menggambar kotak hijau beserta skor kualitas (Quality Score) di sekitar wajah.
3. **Instruksi Mengambang (Overlay Text):** Memindahkan teks instruksi (seperti "Berkedip", "Serong Kanan", dll.) dari bawah kamera ke posisi tengah bawah video (sebagai teks tebal mengambang), sehingga pengguna dapat fokus menatap kamera sambil membaca instruksi.
4. **Relaksasi Retry:** Menambah jeda percobaan deteksi agar pengguna punya waktu menyesuaikan posisi.

## Proposed Changes

### 1. `src/services/face/faceEmbeddingService.ts`
- **[MODIFY]**: Mengubah nilai bawaan parameter opsional deteksi. Jika `inputSize` tidak dilempar, gunakan `512` sebagai *default* alih-alih `320`.
- **[MODIFY]**: Menurunkan nilai standar `scoreThreshold` dari `0.5` menjadi `0.4`.

### 2. `src/services/enrollment/enrollmentService.ts`
- **[MODIFY]**: Memperbarui jeda _retry_ (`setTimeout`) pada saat *liveness* dan *pose capture* dari `800ms` menjadi `1500ms` atau `2000ms`, agar pengguna memiliki waktu bereaksi.
- **[MODIFY]**: Menyesuaikan label pose dari "Hadap Kanan / Kiri" menjadi "Serong Kanan / Kiri".

### 3. `src/pages/enrollment/enrollmentPage.ts`
- **[MODIFY]**: Menambahkan elemen `div` instruksi *overlay* absolut di atas elemen `video`.
- **[MODIFY]**: Membuat fungsi _looping_ (misal: `startVisualizer()`) menggunakan `requestAnimationFrame` yang secara asinkron memanggil `faceEmbeddingService.computeFromVideo()` secara berkala.
- **[MODIFY]**: Menggambar kotak hijau (Canvas API `strokeRect`) dan teks kualitas di elemen `canvas#overlay` mengikuti titik koordinat wajah `box.x` dan `box.y`.
- **[MODIFY]**: Memodifikasi _callback_ `onStep` dari `enrollStudentWithFlow` agar memperbarui isi dari div instruksi *overlay* tersebut dengan gaya yang mencolok.

## Verification Plan

### Manual Verification
1. Masuk ke halaman **Enrollment**.
2. Klik tombol **Mulai Kamera**.
3. Saat kamera aktif dan proses enrollment dimulai untuk salah satu siswa, sistem harus memunculkan **kotak hijau** di sekitar wajah pengguna yang terus mengikuti pergerakan wajah (YOLO-style).
4. Persentase **Quality Score** (0-100%) harus terlihat di atas/di dalam kotak wajah tersebut.
5. Instruksi liveness/pose (seperti "Verifikasi Liveness: ...") harus muncul melayang di atas video.
6. Coba pose Serong Kanan dan Kiri, pastikan bisa lulus dengan toleransi waktu yang lebih baik.

## Open Questions

> [!IMPORTANT]
> Mengubah `inputSize` ke 512 memerlukan sedikit lebih banyak daya komputasi dari perangkat lunak/klien. Pada sebagian besar laptop modern atau smartphone, hal ini masih akan berjalan dengan mulus secara _real-time_. Jika target utama sistem ini adalah perangkat keras sekolah yang sangat tua/lemah, kita mungkin perlu mencari titik tengah di `416`. Apakah `inputSize` 512 sudah sesuai untuk spesifikasi umum perangkat yang akan digunakan?
