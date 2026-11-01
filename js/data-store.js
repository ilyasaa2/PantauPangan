/**
 * DataStore - PantauPangan
 * Menyimpan konfigurasi batas kritis HACCP per zona, data time-series historis,
 * log telemetri streaming SCADA real-time, dan status perangkat keras.
 */

const CCP_ZONES = {
  chilled_room: {
    id: 'chilled_room',
    name: 'Chilled Room 1',
    fullName: 'Chilled Room 1 (Produk Segar)',
    tempMin: 0.0,
    tempMax: 5.0,
    rhMin: 80.0,
    rhMax: 90.0,
    tempTargetNominal: 3.5,
    rhTargetNominal: 85.0,
    sensorDefault: 'ESP-CR01-A',
    limitLabel: '0.0°C ~ 5.0°C',
    dotClass: 'dot-cyan',
    description: 'Rentang aman untuk menekan laju pertumbuhan bakteri patogen (Listeria, Salmonella). Bahaya jika >5°C.',
    icon: '❄️'
  },
  frozen_room: {
    id: 'frozen_room',
    name: 'Deep Freezer Room',
    fullName: 'Deep Freezer Room (Produk Beku)',
    tempMin: -22.0,
    tempMax: -18.0,
    rhMin: 55.0,
    rhMax: 75.0,
    tempTargetNominal: -19.5,
    rhTargetNominal: 62.0,
    sensorDefault: 'ESP-FZ02-B',
    limitLabel: '-18.0°C ~ -22.0°C',
    dotClass: 'dot-blue',
    description: 'Kandungan air seluler membeku total. Aktivitas enzim dan mikroorganisme terhenti sempurna. Bahaya jika > -18°C.',
    icon: '🧊'
  },
  dry_storage: {
    id: 'dry_storage',
    name: 'Dry Storage Room',
    fullName: 'Dry Storage Room (Bahan Baku Kering)',
    tempMin: 18.0,
    tempMax: 30.0,
    rhMin: 40.0,
    rhMax: 70.0,
    tempTargetNominal: 24.2,
    rhTargetNominal: 56.0,
    sensorDefault: 'ESP-DS01-A',
    limitLabel: '< 30.0°C',
    dotClass: 'dot-amber',
    description: 'Mencegah tepung, rempah, dan gula menyerap uap air yang memicu penggumpalan (caking) dan mikotoksin jamur.',
    icon: '📦'
  }
};

if (typeof window !== 'undefined') {
  window.CCP_ZONES = CCP_ZONES;
}

class PantauPanganStore {
  constructor() {
    this.currentZoneId = 'chilled_room';
    this.timeWindow = '1h'; // '1h', '6h', '24h'
    this.activeSimState = 'NORMAL'; // 'NORMAL', 'DOOR_OPEN', 'COMPRESSOR_FAILURE', 'SENSOR_FAULT'
    this.hardware = {
      device: 'ESP32 Mesh / ESP-12E',
      firmware: 'v4.2.1-industrial',
      mac: '5C:CF:7F:A1:39:8E',
      ip: '192.168.10.45',
      rssi: -62,
      batteryV: 4.08,
      batteryPct: 94,
      buzzerActive: false,
      ledStatus: 'GREEN', // 'GREEN' | 'RED'
      sampleIntervalSec: 2.5,
      isOnline: true
    };
    
    // Inisialisasi buffer grafik historis per zona (Mulai bersih)
    this.zoneData = {
      chilled_room: [],
      frozen_room: [],
      dry_storage: []
    };

    // Buffer log telemetri streaming SCADA (Mulai murni kosong dari nol)
    this.telemetryLogs = [];

    // Audit logs (immutable read-only ledger SHA-256 - Mulai murni kosong dari nol)
    this.auditLogs = [];

    // Bersihkan sisa data lama dari LocalStorage agar database benar-benar bersih
    this.clearAllData();
  }

  /**
   * Mengosongkan seluruh database lokal dan server
   */
  clearAllData() {
    this.telemetryLogs = [];
    this.auditLogs = [];
    this.zoneData = {
      chilled_room: [],
      frozen_room: [],
      dry_storage: []
    };

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem('pantaupangan_telemetry');
        localStorage.removeItem('pantaupangan_audit');
      }
    } catch (e) {}

    // Bersihkan database server secara asinkron
    try {
      fetch('/api/reset', { method: 'POST' }).catch(() => {});
    } catch (e) {}
  }

  saveToStorage() {
    // Debounce: Simpan ke LocalStorage maksimal sekali tiap 8 detik agar main thread tidak freeze
    if (this._storageTimeout) return;
    this._storageTimeout = setTimeout(() => {
      this._storageTimeout = null;
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem('pantaupangan_telemetry', JSON.stringify(this.telemetryLogs.slice(0, 40)));
          localStorage.setItem('pantaupangan_audit', JSON.stringify(this.auditLogs.slice(0, 40)));
        }
      } catch (e) {}
    }, 8000);
  }

  loadFromStorage() {
    // Kosong untuk fresh start
  }

  getCurrentZone() {
    return CCP_ZONES[this.currentZoneId] || CCP_ZONES.chilled_room;
  }

  setZone(zoneId) {
    if (CCP_ZONES[zoneId]) {
      this.currentZoneId = zoneId;
    }
  }

  /**
   * Menginisialisasi entri telemetri (Bersih murni untuk data riil IoT)
   */
  initTelemetryLogs() {
    this.telemetryLogs = [];
  }

  /**
   * Menambahkan entri baru pada telemetri streaming saat ada data masuk dari USB atau Simulator
   */
  addTelemetryLog(zoneId, temp, humidity, status = 'NORMAL', notes = null, fromSource = 'INTERNAL') {
    const zone = CCP_ZONES[zoneId] || this.getCurrentZone();
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });

    let defaultNote = 'Monitoring telemetri transmisi periodik terjaga optimal';
    if (status === 'WARNING') {
      defaultNote = 'Fluktuasi suhu terdeteksi melampaui ambang batas toleransi HACCP';
    } else if (status === 'CRITICAL') {
      defaultNote = 'KRITIS: Pelanggaran batas kritis CCP! Aktuator Buzzer diaktifkan';
    }

    const newLog = {
      id: 'TEL-' + String(this.telemetryLogs.length + 1).padStart(4, '0'),
      time: timeStr,
      date: dateStr,
      timeFormatted: `${timeStr} ${dateStr}`,
      roomKey: zoneId,
      roomName: zone.name,
      dotClass: zone.dotClass,
      sensorId: zone.sensorDefault,
      temperature: temp,
      humidity: humidity,
      limitLabel: zone.limitLabel,
      status: status === 'NORMAL' ? 'NORMAL' : 'WARNING',
      notes: notes || defaultNote
    };

    this.telemetryLogs.unshift(newLog);

    // Batasi maksimum 150 baris di memori
    if (this.telemetryLogs.length > 150) {
      this.telemetryLogs.pop();
    }

    // Simpan ke database lokal browser (Debounced)
    this.saveToStorage();

    // Jika data berasal dari USB Serial langsung, sinkronkan ke server database non-blocking
    if (fromSource === 'USB_SERIAL') {
      this.syncTelemetryToServer(newLog);
    }

    return newLog;
  }

  syncTelemetryToServer(logEntry) {
    if (this._telemetrySyncTimeout) return;
    this._telemetrySyncTimeout = setTimeout(() => {
      this._telemetrySyncTimeout = null;
      try {
        fetch('/api/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(logEntry)
        }).catch(() => {});
      } catch (e) {}
    }, 4000);
  }

  /**
   * Menghasilkan riwayat data awal yang realistis dengan variasi mikro
   */
  generateInitialSeries(zoneId, count) {
    const zone = CCP_ZONES[zoneId];
    const series = [];
    const now = Date.now();
    const intervalMs = 60 * 1000;

    let baseTemp = zone.tempTargetNominal;
    let baseRh = zone.rhTargetNominal;

    for (let i = count - 1; i >= 0; i--) {
      const timestamp = new Date(now - i * intervalMs);
      const noiseT = (Math.random() - 0.49) * 0.35;
      const noiseRh = (Math.random() - 0.5) * 0.8;
      
      const temp = parseFloat((baseTemp + noiseT).toFixed(2));
      const rh = parseFloat((baseRh + noiseRh).toFixed(1));

      series.push({
        timestamp: timestamp,
        timeLabel: timestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        temperature: temp,
        humidity: rh,
        zoneId: zoneId
      });
    }
    return series;
  }

  initAuditLogs() {
    this.auditLogs = [];
  }

  generateSha256Sim(input) {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    const seed = Math.abs(hash).toString(16).padStart(8, '0');
    return '0x' + (seed + 'b8f72a4e91cd34ea576890fbc231847e1290dcfe482a93b5').slice(0, 48);
  }
}

window.appStore = new PantauPanganStore();
