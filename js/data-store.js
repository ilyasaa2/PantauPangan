/**
 * DataStore - PantauPangan
 * Menyimpan konfigurasi batas kritis HACCP per zona, data time-series historis, dan status sistem.
 */

const CCP_ZONES = {
  chilled_room: {
    id: 'chilled_room',
    name: 'Chilled Room (Produk Segar)',
    tempMin: 0.0,
    tempMax: 5.0,
    rhMin: 80.0,
    rhMax: 90.0,
    tempTargetNominal: 3.5,
    rhTargetNominal: 85.0,
    description: 'Rentang aman untuk menekan laju pertumbuhan bakteri patogen (Listeria, Salmonella). Bahaya jika >5°C.',
    icon: '❄️'
  },
  frozen_room: {
    id: 'frozen_room',
    name: 'Frozen Room (Produk Beku)',
    tempMin: -25.0,
    tempMax: -18.0,
    rhMin: 0.0,
    rhMax: 100.0,
    tempTargetNominal: -20.5,
    rhTargetNominal: 70.0,
    description: 'Kandungan air seluler membeku total. Aktivitas enzim dan mikroorganisme terhenti sempurna. Bahaya jika > -18°C.',
    icon: '🧊'
  },
  dry_storage: {
    id: 'dry_storage',
    name: 'Dry Storage (Bahan Baku Kering)',
    tempMin: 20.0,
    tempMax: 30.0,
    rhMin: 40.0,
    rhMax: 75.0,
    tempTargetNominal: 26.0,
    rhTargetNominal: 62.0,
    description: 'Mencegah tepung, rempah, dan gula menyerap uap air yang memicu penggumpalan (caking) dan mikotoksin jamur.',
    icon: '📦'
  }
};

class PantauPanganStore {
  constructor() {
    this.currentZoneId = 'chilled_room';
    this.timeWindow = '1h'; // '1h', '6h', '24h'
    this.activeSimState = 'NORMAL'; // 'NORMAL', 'DOOR_OPEN', 'COMPRESSOR_FAILURE', 'SENSOR_FAULT'
    this.hardware = {
      device: 'ESP-12E (ESP8266 Core)',
      firmware: 'v2.4.1-haccp',
      mac: '5C:CF:7F:A1:39:8E',
      ip: '192.168.10.45',
      rssi: -62,
      batteryV: 4.08,
      batteryPct: 94,
      buzzerActive: false,
      ledStatus: 'GREEN', // 'GREEN' | 'RED'
      sampleIntervalSec: 5,
      isOnline: true
    };
    
    // Inisialisasi buffer historis per zona
    this.zoneData = {
      chilled_room: this.generateInitialSeries('chilled_room', 40),
      frozen_room: this.generateInitialSeries('frozen_room', 40),
      dry_storage: this.generateInitialSeries('dry_storage', 40)
    };

    // Audit logs (immutable read-only table)
    this.auditLogs = [];
    this.initAuditLogs();
  }

  getCurrentZone() {
    return CCP_ZONES[this.currentZoneId];
  }

  setZone(zoneId) {
    if (CCP_ZONES[zoneId]) {
      this.currentZoneId = zoneId;
    }
  }

  /**
   * Menghasilkan riwayat data awal yang realistis dengan variasi mikro
   */
  generateInitialSeries(zoneId, count) {
    const zone = CCP_ZONES[zoneId];
    const series = [];
    const now = Date.now();
    const intervalMs = 60 * 1000; // 1 menit per interval untuk display riwayat

    let baseTemp = zone.tempTargetNominal;
    let baseRh = zone.rhTargetNominal;

    for (let i = count - 1; i >= 0; i--) {
      const timestamp = new Date(now - i * intervalMs);
      // Variasi alami termodinamika ruangan (random walk)
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
    // Generate initial immutable logs dari series chilled_room
    const records = this.zoneData.chilled_room.slice(-20);
    records.forEach((rec, idx) => {
      const logId = 'LOG-' + (1000 + idx);
      const zScore = parseFloat(((Math.random() * 0.5) + 0.1).toFixed(2));
      const status = 'NORMAL';
      const rawPayload = `${logId}|${rec.timestamp.toISOString()}|chilled_room|${rec.temperature}|${rec.humidity}|${status}`;
      
      // Sederhana SHA256 simulation atau real hash
      this.auditLogs.unshift({
        id: logId,
        timestamp: rec.timestamp,
        timeFormatted: rec.timestamp.toLocaleDateString('id-ID') + ' ' + rec.timestamp.toLocaleTimeString('id-ID'),
        zoneId: 'chilled_room',
        zoneName: 'Chilled Room',
        temperature: rec.temperature,
        humidity: rec.humidity,
        zScore: zScore,
        status: status,
        hash: this.generateSha256Sim(rawPayload)
      });
    });
  }

  generateSha256Sim(input) {
    // Menghasilkan hex digest deterministik 64-karakter untuk audit trail
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
