# PantauPangan - IoT Cold Chain & HACCP Digital Audit Trail Dashboard

Dashboard pemantauan otomatis suhu dan kelembapan cold chain berbasis **ESP-12E**, **Sensor DHT11**, **Protokol MQTT**, dan **Kecerdasan Buatan (AI Anomaly Detection)** untuk kepatuhan **HACCP & BPOM RI**.

📘 **Dokumentasi Lengkap:** Silakan baca [ALUR_SISTEM.md](ALUR_SISTEM.md) untuk detail arsitektur teknis, diagram alir data (*flowchart*), skema wiring pinout hardware, dan formula matematis modul AI.

---

## 🔌 Alur Integrasi Perangkat Fisik (Colok USB ke Laptop)

Ketika mikrokontroler (ESP-12E / ESP32-S3) dicolokkan ke laptop via kabel USB data:

```
[ Sensor DHT11 ] ──(GPIO 4)──> [ ESP-12E ]
                                    │
                         (Kabel Data USB Serial)
                                    │
                                    ▼
                          [ Laptop Pengguna ]
                         (Browser Chrome / Edge)
                                    │
                  (Web Serial API: navigator.serial 115200 Baud)
                                    │
                                    ▼
                         [ Dashboard PantauPangan ]
                        - Visualisasi Suhu Real-Time
                        - AI Z-Score & Deteksi Anomali
                        - Segel Digital SHA-256 (Audit Trail)
                        - Perintah Balik: ALARM_ON / ALARM_OFF ke Buzzer
```

---

### Langkah 1: Flash Firmware ke Perangkat ESP-12E
1. Buka berkas [PantauPangan_ESP.ino](file:///c:/PantauPangan/firmware/PantauPangan_ESP.ino) di **Arduino IDE**.
2. Pastikan pustaka `DHT sensor library` dari Adafruit telah terpasang.
3. Sambungkan pin fisik ESP-12E:
   * **DHT11 DATA** $\rightarrow$ **GPIO 4 (Pin D2)**
   * **Buzzer (+) / IN** $\rightarrow$ **GPIO 5 (Pin D1)**
   * **LED Anoda (+)** $\rightarrow$ **GPIO 2 (Pin D4)**
   * **VCC & GND** $\rightarrow$ **3.3V / 5V & GND**
4. Pilih Board: **NodeMCU 1.0 (ESP-12E Module)** dan Upload sketsa.

---

### Langkah 2: Hubungkan ke Dashboard
1. Colokkan kabel USB ESP-12E ke port USB laptop Anda.
2. Buka dashboard di browser (Google Chrome atau Microsoft Edge):
   👉 **[http://localhost:3000/](http://localhost:3000/)**
3. Klik tombol **"Sambungkan USB Perangkat"** di baris header atas.
4. Jendela pemilihan port browser akan muncul. Pilih port COM perangkat Anda (misal: `Silicon Labs CP210x` atau `USB-SERIAL CH340 / COM3 / COM4`), lalu klik **Connect**.
5. **Selesai!** 
   * Badge berubah dari **"Simulasi"** menjadi **"USB Fisik"**.
   * Dashboard otomatis menghentikan simulator dan **100% menangkap data suhu & kelembapan asli** dari sensor DHT11 Anda setiap 2.5 detik.
   * Jika AI mendeteksi lonjakan anomali, dashboard akan otomatis mengirimkan sinyal `ALARM_ON` ke serial USB untuk membunyikan Buzzer fisik pada GPIO 5.

---

### Alternatif Jalur HTTP / WiFi (Jalur Kedua)
Jika ESP-12E menggunakan koneksi WiFi lokal pabrik, mikrokontroler dapat mengirimkan data via HTTP POST ke endpoint lokal laptop:
```http
POST http://localhost:3000/api/telemetry
Content-Type: application/json

{
  "device_id": "ESP-12E-CCP-01",
  "temperature": 3.85,
  "humidity": 84.2
}
```
Server secara otomatis akan menyiarkan (*broadcast*) data tersebut ke dashboard via Server-Sent Events (SSE).

---

## 📂 Struktur Berkas Proyek

```
c:\PantauPangan\
├── index.html                   # Dashboard UI bersih & responsif
├── DESIGN.md                    # Panduan visual antislop
├── README.md                    # Dokumentasi lengkap & panduan wiring
├── server.js                    # Server HTTP & Gateway API (Port 3000)
├── firmware/
│   └── PantauPangan_ESP.ino    # Firmware Arduino siap flash ke ESP-12E
├── css/
│   └── style.css                # Desain industrial minimalis (Light/Dark)
└── js/
    ├── serial-service.js        # Web Serial API & SSE Client (Jalur USB)
    ├── data-store.js            # Ambang batas HACCP & state
    ├── ai-engine.js             # Z-Score Anomaly & Predictive Drift
    ├── audit-trail.js           # Ledger Read-Only & SHA-256 Hash Chain
    ├── mqtt-service.js          # Layanan MQTT Pub/Sub
    ├── export-service.js        # Ekspor PDF resmi BPOM & Excel
    └── app.js                   # Orkestrator alur aplikasi
```
