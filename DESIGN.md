# DESIGN.md - PantauPangan Dashboard

## Identitas & Visi Produk
- **Nama Sistem**: PantauPangan
- **Fungsi Utama**: Platform Audit Trail Digital HACCP berbasis IoT dengan integrasi Kecerdasan Buatan (Deteksi Anomali & Prediksi Tren Suhu) untuk pemantauan rantai dingin (Cold Chain) industri pangan sesuai regulasi BPOM RI dan Codex Alimentarius.
- **Karakter Visual**: Industrial Clean, Presisi Tinggi, Terpercaya, dan Tegas (Laboratorium / Cold-Chain Monitoring).

## Dial Antislop
- **ENERGY**: 2 (Fokus kerja profesional industri & audit pangan, tanpa ornamen berlebihan)
- **RHYTHM**: 2 (Tata letak terstruktur berbasis fungsi: Header Metrik -> Kontrol Zona & Visualisasi Real-Time -> Intelijen AI -> Aliran Paket MQTT -> Ledger Audit Trail)
- **MOTION**: 2 (Mikro-interaksi fungsional: pembaruan titik data grafik, status live pulse, transisi modal laporan)

## Palet Warna (Color Palette)
- **Mode Gelap (Default Industri)**:
  - Background Utama: `#0b0f19` (Deep Cold Navy)
  - Card & Container Surface: `#111827` / `#162033` (Slate Steel)
  - Border & Pembatas: `#1e293b`
  - Teks Primer: `#f8fafc`
  - Teks Sekunder: `#94a3b8`
  - Aksen Dingin (Brand & Suhu): `#0284c7` (Sky Blue) & `#06b6d4` (Cyan)
  - Status Normal / Kepatuhan: `#10b981` (Emerald)
  - Status Peringatan (Warning Drift): `#f59e0b` (Amber)
  - Status Kritis / Pelanggaran HACCP: `#ef4444` (Rose Red)
- **Mode Terang**:
  - Background Utama: `#f8fafc`
  - Card & Container Surface: `#ffffff`
  - Border & Pembatas: `#e2e8f0`
  - Teks Primer: `#0f172a`
  - Teks Sekunder: `#475569`

## Tipografi
- **Family**: 'Plus Jakarta Sans', system-ui, sans-serif
- **Mono (Telemetri & Hash Audit)**: 'JetBrains Mono', 'Fira Code', monospace
- **Alasan**: Keterbacaan angka metrik suhu, timestamp, dan kode hash SHA-256 yang sangat tinggi bagi auditor BPOM dan operator QC pabrik.

## Kolaborasi Mata Kuliah Terintegrasi
1. **Internet of Things (IoT)**: Status node ESP-12E / DHT11, level baterai 18650, status aktuator Buzzer/LED, simulator interaktif kondisi fisik cold storage.
2. **Teknologi Sistem Terintegrasi (TST)**: Broker MQTT live subscriber, viewer payload JSON mentah, QoS level & keep-alive monitor.
3. **Kecerdasan Buatan (AI)**: Z-Score Statistical Anomaly Detector, Moving Average 10-point, Predictive Temperature Drift (Time-to-Critical forecast), Root Cause Engine.
4. **Sistem Basis Data & Keamanan Informasi**: Read-only Tamper-Proof Audit Trail Ledger dengan hash SHA-256 per record untuk kepatuhan regulasi BPOM.
5. **Pemrograman Web & Pelaporan**: Dashboard responsif multi-zona, grafik interaktif Chart.js, ekspor resmi PDF & Excel.
