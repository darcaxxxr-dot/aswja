# PoC Results — Sprint 2 / Phase 1 (Face Recognition)

Tanggal: 2026-09-04  
Library: `@vladmandic/face-api` v1.7.15  
Models:
- TinyFaceDetector (inputSize 320, scoreThreshold 0.5)
- FaceLandmark68Net
- FaceRecognitionNet (128-d embedding, Euclidean distance)

## Device

| Item | Value |
|---|---|
| Model HP | _(isi manual)_ |
| Chrome version | _(isi manual)_ |
| Resolusi kamera | _(auto dari /camera-test)_ |
| Kondisi cahaya | _(terang/redup)_ |

## Threshold

| Item | Value |
|---|---|
| Threshold awal | 0.80 |
| Threshold terkalibrasi | _(isi setelah PoC)_ |

## Hasil Enrollment (10 siswa untuk P1)

| # | Label | Front Quality | Right Quality | Left Quality | Avg Quality | Catatan |
|---|---|---|---|---|---|---|
| 1 | Ahmad | | | | | |
| 2 | Fatimah | | | | | |
| 3 | Ali | | | | | |
| 4 | Nia | | | | | |
| 5 | Budi | | | | | |
| 6 | Sari | | | | | |
| 7 | Rudi | | | | | |
| 8 | Lina | | | | | |
| 9 | Doni | | | | | |
| 10 | Maya | | | | | |

## Hasil Recognition

| Skenario | Known → Correct | Unknown → UNKNOWN | False Positive | False Negative |
|---|---|---|---|---|
| Cahaya terang | | | | |
| Cahaya redup | | | | |
| Kacamata | | | | |
| Sudut 30° | | | | |
| Jarak ±1m | | | | |

## Performa

| Metrik | Target (PRD) | Aktual |
|---|---|---|
| Face detection | ≤ 500 ms | _(ukur)_ |
| Recognition full | 1–2 detik | _(ukur)_ |
| FPS loop real-time | — | _(ukur)_ |

## Liveness (Active Challenge)

| Challenge | Berhasil | Timeout | Catatan |
|---|---|---|---|
| Blink | | | |
| Turn left | | | |
| Turn right | | | |

## Kesimpulan

- [ ] **P1 PASS** (Known→Correct, Unknown→UNKNOWN, false acceptance ≈ 0)
- [ ] **P1 FAIL** → Fix di Sprint 2 (jangan lanjut ke Sprint 3)

## Catatan Iterasi

_(Threshold adjustment, parameter model, kondisi cahaya, dll)_