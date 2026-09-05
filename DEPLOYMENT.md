# SmartFace Attendance — Deployment Guide

## Stack
- Frontend: Vite + TypeScript (PWA)
- Database: IndexedDB (Dexie) + Supabase (PostgreSQL)
- Camera + Face AI: MediaDevices + face-api.js (TinyFaceDetector, FaceLandmark68, FaceRecognitionNet)
- Hosting: Vercel

## Deploy ke Vercel

### 1. Push ke GitHub
```bash
git init
git add .
git commit -m "feat: initial SmartFace Attendance MVP"
git branch -M main
git remote add origin https://github.com/<user>/smartface-attendance.git
git push -u origin main
```

### 2. Import ke Vercel
1. Buka https://vercel.com → New Project.
2. Pilih repo GitHub.
3. Framework Preset: **Vite** (auto-detect).
4. **Environment Variables** (wajib):
   - `VITE_SUPABASE_URL` = `https://yrjlmmlnfabbsozhahjn.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = (anon public key)
5. Klik **Deploy**.

### 3. Custom Domain (opsional)
- Settings → Domains → tambahkan domain sekolah.

## Environment Variables
Lihat `.env` lokal — variabel yang sama harus diset di Vercel.

## Catatan Penting
- `.env` di-ignore oleh `.gitignore` — JANGAN push ke GitHub.
- Supabase anon key aman di-expose di frontend (RLS akan guard akses).
- PWA butuh HTTPS — Vercel otomatis sediakan.
- Model weights (~6.8 MB) akan di-cache selamanya (immutable header).

## Test Deployment
Setelah deploy, test checklist:
- [ ] App terbuka di https://<app>.vercel.app
- [ ] Tombol "Install App" muncul di Chrome Android
- [ ] Test koneksi Supabase di /supabase-test
- [ ] Push data → cek di Supabase Table Editor
- [ ] Buka di device kedua → Pull data → data muncul
- [ ] Disable internet → app tetap jalan (offline-first)