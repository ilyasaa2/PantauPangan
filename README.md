# 🛡️ PantauPangan - IoT Cold Chain & HACCP Digital Audit Trail Dashboard

[![ESP8266](https://img.shields.io/badge/Hardware-NodeMCU%20ESP--12E%20V3-blue.svg)](https://en.wikipedia.org/wiki/NodeMCU)
[![Expansion Shield](https://img.shields.io/badge/Shield-HW--389%20Baseboard-orange.svg)](https://en.wikipedia.org/wiki/NodeMCU)
[![Sensor](https://img.shields.io/badge/Sensor-DHT11%20Temp%20%26%20RH-brightgreen.svg)](https://learn.adafruit.com/dht)
[![Display](https://img.shields.io/badge/Display-LCD%201602%20I2C-cyan.svg)](https://en.wikipedia.org/wiki/Liquid-crystal_display)
[![Compliance](https://img.shields.io/badge/Standard-BPOM%20RI%20%7C%20HACCP%20CXC%201--1969-success.svg)](https://pom.go.id)
[![Architecture](https://img.shields.io/badge/Persistence-Dual--Persistence%20(Local%20%2B%20Cloud)-blueviolet.svg)](https://supabase.com)

**PantauPangan** adalah sistem SCADA pemantauan suhu dan kelembapan *cold chain* terintegrasi berbasis **NodeMCU ESP-12E (ESP8266)**, **Expansion Baseboard Shield HW-389**, **Sensor DHT11**, **LCD 1602 I2C**, **Web Serial API (UART 115200 Baud)**, dan **Kecerdasan Buatan (AI Predictive Drift)** dengan segel digital **SHA-256 Anti-Tamper** untuk pemenuhan regulasi audit kepatuhan **BPOM RI** dan standar keamanan pangan internasional **Codex Alimentarius HACCP**.

Sistem ini dirancang khusus untuk demonstrasi operasional industri dan siap dipamerkan (*Expo/Exhibition Ready*) dengan arsitektur **Hybrid Dual-Persistence** (100% *Offline-Resilient* didukung sinkronisasi *real-time* ke **Database Cloud Eksternal PostgreSQL / Supabase REST**).

---

## 📸 Arsitektur Perangkat Keras Fisik

Sistem menggunakan 1 unit node terpadu di atas Baseboard Shield dengan catu daya stabil adaptor eksternal 5V 3A:

```
                  +------------------------------------------------------+
                  |           Adaptor Eksternal 5V 3A (Jack DC)          |
                  +------------------------------------------------------+
                                             |
                                             v
                         +---------------------------------------+
                         |  NodeMCU Expansion Shield (HW-389)    |
                         |  - Socket ESP-12E NodeMCU V3          |
                         |  - Jalur Tegangan 5V & 3.3V Stabil    |
                         +---------------------------------------+
                                  |         |         |
          +-----------------------+         |         +-----------------------+
          |                                 |                                 |
          v                                 v                                 v
+-------------------+             +-------------------+             +-------------------+
|  Sensor DHT11     |             |  LCD 1602 I2C     |             |  Aktuator Alarm   |
|  Pin D5 (GPIO 14) |             |  SDA -> Pin D2    |             |  - LED Hijau (D6) |
|  Data Suhu & RH   |             |  SCL -> Pin D1    |             |  - LED Kuning (D7)|
+-------------------+             |  Multi-Page UI    |             |  - LED Merah (D8) |
                                  +-------------------+             |  - Buzzer 5V (D3) |
                                                                    +-------------------+
                                            |
                                 (Kabel USB Serial UART)
                                            |
                                            v
                  +------------------------------------------------------+
                  |        Laptop Host Dashboard (Web Serial API)        |
                  |        - Browser Chrome / Microsoft Edge             |
                  |        - In-Memory SCADA & AI Anomaly Detection      |
                  |        - Digital Audit Trail SHA-256 Tamper-Proof    |
                  |        - Asynchronous Cloud DB REST (Supabase)       |
                  +------------------------------------------------------+
```

---

## 📌 Pemetaan Pin Fisik (Hardware Pinout Table)

Semua sambungan kabel terhubung ke header pin **NodeMCU Expansion Baseboard Shield (HW-389)**:

| Komponen | Pin Modul | Pin NodeMCU Shield | GPIO ESP8266 | Deskripsi Teknis |
| :--- | :--- | :--- | :--- | :--- |
| **LCD 1602 I2C** | SDA | **Pin D2** | GPIO 4 | Jalur Komunikasi Data I2C (Alamat: `0x27`) |
| **LCD 1602 I2C** | SCL | **Pin D1** | GPIO 5 | Jalur Clock Serial I2C |
| **LCD 1602 I2C** | VCC & GND | **5V & GND Shield** | - | Daya 5V (Vin) agar kontras karakter tajam |
| **Sensor DHT11** | DATA / OUT | **Pin D5** | GPIO 14 | Sinyal digital 1-Wire pembacaan suhu & RH |
| **Sensor DHT11** | VCC & GND | **3V3/5V & GND** | - | Daya modul sensor |
| **LED Hijau** | Anoda (+) | **Pin D6** | GPIO 12 | Indikator Kondisi **NORMAL** (Aman) |
| **LED Kuning** | Anoda (+) | **Pin D7** | GPIO 13 | Indikator Kondisi **WARNING** (Mendekati Batas) |
| **LED Merah** | Anoda (+) | **Pin D8** | GPIO 15 | Indikator Kondisi **KRITIS / PELANGGARAN** |
| **Buzzer Aktif 5V** | Positif (+) | **Pin D3** | GPIO 0 | Alarm audio aktif otomatis saat deviasi kritis |
| **Catu Daya** | Jack DC Shield | **Adaptor 5V 3A** | - | Sumber arus utama untuk kestabilan modul |

> **Tips Kontras LCD:** Jika LCD 1602 menyala biru tetapi huruf belum tampak, putar sedikit trimpot potensiometer berwarna biru di adapter backpack belakang LCD menggunakan obeng kecil hingga karakter terbaca jelas.

---

## 📟 Fitur Firmware: Animasi LCD 1602 Non-Blocking Carousel

Firmware [`PantauPangan_ESP.ino`](file:///c:/PantauPangan/firmware/PantauPangan_ESP.ino) dilengkapi sistem animasi multi-halaman tanpa menggunakan `delay()`, berganti otomatis setiap 3.2 detik:

1. **Halaman 1 `[1]` (Telemetri Realtime & Status):**
   ```text
   T: 24.5°C H: 58.0%
   Status: KRITIS
   ```
2. **Halaman 2 `[2]` (Analisis Deviasi HACCP):**
   ```text
   DEVIASI SUHU:
   Lebih: +19.5°C
   ```
   *(Menghitung selisih matematis deviasi suhu saat melebihi atau kurang dari batas aman).*
3. **Halaman 3 `[3]` (Instruksi Darurat / CAPA Marquee Running Text):**
   ```text
   PENANGANAN CCP:
   TINDAKAN: Perik
   ```
   *(Teks berjalan otomatis menampilkan petunjuk tindakan korektif darurat penanganan anomali).*

---

## 🌐 Fitur Dashboard SCADA (Persiapan Expo / Pameran)

Antarmuka web dirancang khusus untuk demonstrasi pengujian langsung di meja stand:

### 1. Selektor Lokasi Pengujian Riil (Topbar)
Menggantikan label pabrik fiktif menjadi pilihan lokasi demo nyata:
- 📍 **Stand Aula Pameran (Utama)**
- 📍 **Lab IoT & Embedded System**
- 📍 **Pengujian Mandiri / Lapangan**

### 2. Navigasi 4 Menu Fungsional (1 Alat Fisik)
- 📊 **Live Telemetry & SCADA**: Grafik waktu-nyata, kartu metrik KPI, deviasi suhu, dan streaming telemetri instan.
- 🛡️ **HACCP Digital Audit Trail**: Buku besar kepatuhan BPOM berbasis *cryptographic hash chain* (SHA-256) yang tidak dapat dimanipulasi (*tamper-proof*).
- ☁️ **Cloud Database Inspector**: Tampilan streaming data yang terunggah ke database eksternal cloud lengkap dengan response code `HTTP 201 Created`, latency, dan tombol interaktif *"Uji Write & Ping Cloud"*.
- 🔌 **Hardware & Gateway Health**: Diagnosa status koneksi serial UART 115200 Baud, pemetaan pinout shield HW-389, dan kondisi aktuator.

### 3. Preset Standar Ambang Batas Suhu HACCP (Interactive Demo)
Pada toolbar monitoring, pengguna dapat mengganti standar penyimpanan secara langsung:
- ❄️ **Cold Storage (0.0°C ~ 5.0°C)**: Saat suhu ruangan terukur ~24°C, sistem langsung mendeteksi **KRITIS** (LED Merah & Buzzer aktif). *Sangat efektif untuk demonstrasi anomali bahaya ke penguji*.
- 📦 **Ruang Ambient / Kering (18.0°C ~ 30.0°C)**: Suhu ruangan 24°C seketika berstatus **NORMAL** (LED Hijau aktif, buzzer mati).
- 🧊 **Deep Freezer (-22.0°C ~ -18.0°C)**: Simulasi penyimpanan beku ekstrem.

> Web secara otomatis mengirimkan perintah `SET_ZONE:<nama>,<min>,<max>` melalui Web Serial ke NodeMCU, sehingga alat fisik langsung merespon seketika tanpa perlu compile ulang!

---

## ☁️ Integrasi Database Eksternal (Cloud REST)

Arsitektur sistem menggunakan **Hybrid Dual-Persistence**:
- **Local In-Memory Cache + Disk Buffer**: Melayani dashboard dalam waktu `<0.01 ms` dan memastikan demo pameran **100% aman dan tidak pernah crash** meskipun koneksi WiFi aula terputus.
- **Cloud REST Sync Worker (`server.js`)**: Setiap data sensor yang masuk secara otomatis diunggah secara asinkron (non-blocking) ke database eksternal PostgreSQL / Supabase REST.
- **REST Endpoints Tersedia:**
  - `GET /api/cloud/status` $\rightarrow$ Status koneksi, total baris tersimpan, dan latency.
  - `GET /api/cloud/logs` $\rightarrow$ 50 log transaksi sinkronisasi cloud terakhir.
  - `POST /api/cloud/test-write` $\rightarrow$ Pemicu pengujian tulis data instan ke cloud.
  - `POST /api/cloud/config` $\rightarrow$ Mengubah endpoint / API Key cloud secara dinamis.

---

## 🚀 Panduan Memulai Cepat (Quick Start)

### 1. Flash Firmware ke NodeMCU ESP-12E
1. Buka sketsa [`firmware/PantauPangan_ESP.ino`](file:///c:/PantauPangan/firmware/PantauPangan_ESP.ino) di **Arduino IDE 2.3.10**.
2. Masukkan URL board manager ESP8266 pada *Preferences*:
   ```text
   http://arduino.esp8266.com/stable/package_esp8266com_index.json
   ```
3. Pasang pustaka melalui *Library Manager*:
   - `LiquidCrystal I2C` (oleh Frank de Brabander)
   - `DHT sensor library` (oleh Adafruit)
4. Pilih Board: **NodeMCU 1.0 (ESP-12E Module)**.
5. Pilih Port COM NodeMCU (pastikan driver FTDI / CH340 aktif di Device Manager).
6. Klik **Upload** hingga mencapai 100%.

### 2. Jalankan Server Dashboard
Buka terminal PowerShell pada direktori proyek:
```powershell
node server.js
```
Server SCADA berkecepatan tinggi aktif di:
👉 **`http://localhost:3000/`**

### 3. Sambungkan Web Serial
1. Buka `http://localhost:3000/` di browser **Google Chrome** atau **Microsoft Edge**.
2. Klik tombol **"Sync"** di sudut kanan atas topbar.
3. Pilih port COM perangkat Anda lalu klik **Connect**.
4. Data telemetri riil dari DHT11 akan langsung mengalir ke grafik, tabel audit, dan database cloud eksternal!

---

## 📁 Struktur Direktori Proyek

```
c:\PantauPangan\
├── index.html                   # Dashboard SCADA pameran (4 functional views)
├── server.js                    # Server HTTP, SSE & Cloud Database Sync Engine
├── README.md                    # Dokumentasi komprehensif proyek
├── ALUR_SISTEM.md               # Arsitektur teknis, diagram Mermaid & formula AI
├── DESIGN.md                    # Pedoman antarmuka visual antislop
├── firmware/
│   └── PantauPangan_ESP.ino    # Firmware ESP8266 + LCD 1602 Multi-Page Carousel
├── css/
│   └── style.css                # Desain tema industrial SCADA (Dark/Light mode)
├── js/
│   ├── app.js                   # Orkestrator navigasi, preset HACCP & Cloud Inspector
│   ├── serial-service.js        # Web Serial API & bi-directional command dispatch
│   ├── data-store.js            # Standar batas HACCP & manajemen state lokal
│   ├── ai-engine.js             # Z-score anomaly detection & linear regression drift
│   ├── audit-trail.js           # Buku besar SHA-256 digital signature BPOM
│   ├── export-service.js        # Generator ekspor dokumen resmi PDF BPOM & Excel
│   └── mqtt-service.js          # Protokol MQTT Pub/Sub QoS 1
└── data/
    ├── telemetry_db.json        # Database lokal data sensor
    ├── audit_db.json            # Database lokal audit trail SHA-256
    └── cloud_config.json        # Konfigurasi endpoint database eksternal cloud
```

---

## 📜 Lisensi & Kepatuhan Regulasi
Proyek dikembangkan untuk kepatuhan regulasi keamanan rantai dingin (*cold chain*) **BPOM RI** dan pemenuhan standar audit digital **HACCP (Hazard Analysis and Critical Control Points)**.
Operasional sistem mematuhi prinsip integritas data integritas ALCOA+ (*Attributable, Legible, Contemporaneous, Original, Accurate*).
