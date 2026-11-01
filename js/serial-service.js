/**
 * Serial Service - PantauPangan
 * Modul Integrasi Perangkat Keras Fisik (USB Serial & SSE Gateway)
 *
 * Mendukung 2 jalur integrasi perangkat fisik:
 * 1. Web Serial API (Direct USB Cable dari ESP-12E ke Laptop via Chrome/Edge)
 * 2. Gateway Server-Sent Events (SSE) dari endpoint POST /api/telemetry
 */

class PantauPanganSerialService {
  constructor(onDataReceived) {
    this.onDataReceived = onDataReceived;
    this.port = null;
    this.reader = null;
    this.keepReading = false;
    this.isConnected = false;
    this.baudRate = 115200;

    // Inisialisasi SSE Listener sebagai gateway cadangan
    this.initSSEListener();
  }

  /**
   * Cek apakah browser mendukung Web Serial API (Chrome, Edge, Opera)
   */
  isSupported() {
    return 'serial' in navigator;
  }

  /**
   * Menghubungkan perangkat fisik yang dicolokkan ke port USB laptop
   */
  async connectUSB() {
    if (!this.isSupported()) {
      throw new Error('Browser Anda tidak mendukung Web Serial API. Gunakan Google Chrome atau Microsoft Edge terbaru.');
    }

    try {
      // Membuka dialog pemilih port COM perangkat (CH340 / CP2102 / ESP)
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: this.baudRate });

      this.isConnected = true;
      this.keepReading = true;

      // Mulai loop pembacaan data serial
      this.readSerialLoop();

      return {
        status: 'CONNECTED',
        baudRate: this.baudRate
      };
    } catch (err) {
      this.isConnected = false;
      throw err;
    }
  }

  /**
   * Loop membaca data string baris demi baris dari USB Serial
   */
  async readSerialLoop() {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    this.reader = reader;

    let buffer = '';

    try {
      while (this.keepReading) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          buffer += value;
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Sisa potongan teks yang belum lengkap

          for (const line of lines) {
            const cleanLine = line.trim();
            if (cleanLine.length > 0) {
              this.handleRawSerialLine(cleanLine);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[SERIAL ERROR]', err);
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Memproses baris teks serial mentah dan mengekstrak data JSON
   */
  handleRawSerialLine(rawLine) {
    const trimmed = rawLine.trim();
    if (!trimmed) return;

    // Coba parse format JSON yang dikirimkan oleh firmware ESP-12E / ESP32
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const payload = JSON.parse(trimmed);
        const temp = typeof payload.temperature === 'number' ? payload.temperature : parseFloat(payload.temperature);
        const rh = typeof payload.humidity === 'number' ? payload.humidity : parseFloat(payload.humidity);

        // Sanity bound check (-50°C s/d +80°C, RH 0 s/d 100%)
        if (!isNaN(temp) && !isNaN(rh) && isFinite(temp) && isFinite(rh) && temp >= -50.0 && temp <= 80.0 && rh >= 0.0 && rh <= 100.0) {
          if (this.onDataReceived) {
            this.onDataReceived({ ...payload, temperature: temp, humidity: rh }, 'USB_SERIAL');
          }
          return;
        }
      } catch (e) {
        // Format JSON tidak valid atau terpotong
      }
    }

    // Dukungan format CSV alternatif: "3.8,84.5"
    if (trimmed.includes(',')) {
      const parts = trimmed.split(',');
      if (parts.length >= 2) {
        const temp = parseFloat(parts[0].trim());
        const rh = parseFloat(parts[1].trim());
        if (!isNaN(temp) && !isNaN(rh) && isFinite(temp) && isFinite(rh) && temp >= -50.0 && temp <= 80.0 && rh >= 0.0 && rh <= 100.0) {
          if (this.onDataReceived) {
            this.onDataReceived({
              temperature: temp,
              humidity: rh,
              device_id: 'ESP-12E-USB'
            }, 'USB_SERIAL');
          }
        }
      }
    }
  }

  /**
   * Mengirimkan perintah ke perangkat keras melalui USB Serial
   * Contoh: "ALARM_ON", "ALARM_OFF"
   */
  async sendCommand(cmdText) {
    if (!this.isConnected || !this.port || !this.port.writable) {
      return false;
    }
    try {
      const textEncoder = new TextEncoder();
      const writer = this.port.writable.getWriter();
      await writer.write(textEncoder.encode(cmdText + '\n'));
      writer.releaseLock();
      return true;
    } catch (err) {
      console.error('[SERIAL SEND ERROR]', err);
      return false;
    }
  }

  /**
   * Memutus koneksi serial secara aman
   */
  async disconnectUSB() {
    this.keepReading = false;
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (e) {}
    }
    if (this.port) {
      try {
        await this.port.close();
      } catch (e) {}
    }
    this.isConnected = false;
    this.port = null;
    this.reader = null;
  }

  /**
   * Menghubungkan ke Server-Sent Events backend laptop (/api/events)
   */
  initSSEListener() {
    try {
      const eventSource = new EventSource('/api/events');
      eventSource.onmessage = (event) => {
        try {
          // Jika USB fisik sedang terhubung langsung ke browser ini, abaikan echo SSE agar data tidak terduplikasi
          if (this.isConnected) return;
          const payload = JSON.parse(event.data);
          if (this.onDataReceived) {
            this.onDataReceived(payload, 'SSE_GATEWAY');
          }
        } catch (e) {}
      };
      eventSource.onerror = () => {
        // SSE reconnect otomatis ditangani browser
      };
    } catch (e) {
      // Abaikan jika offline
    }
  }
}

window.PantauPanganSerialService = PantauPanganSerialService;
