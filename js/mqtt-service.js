/**
 * MQTT Service - PantauPangan
 * Modul Teknologi Sistem Terintegrasi (TST):
 * - Mengelola arsitektur komunikasi Publish/Subscribe berbasis MQTT
 * - Memformat dan memvalidasi payload data JSON dari node ESP-12E
 * - Menyediakan live stream terminal inspector untuk debugging paket jaringan
 */

class PantauPanganMQTTService {
  constructor(store, onMessageCallback) {
    this.store = store;
    this.onMessageCallback = onMessageCallback;
    this.brokerUrl = 'mqtt://broker.emqx.io:1883';
    this.telemetryTopic = 'pantaupangan/coldchain/v1/telemetry';
    this.alertTopic = 'pantaupangan/coldchain/v1/alerts';
    this.isConnected = true;
    this.packetCount = 0;
    this.terminalLines = [];
    this.maxTerminalLines = 50;
  }

  /**
   * Mengirimkan (Publish) paket data telemetri dari mikrokontroler ESP-12E
   */
  publishTelemetry(zoneId, temperature, humidity, simState) {
    this.packetCount++;
    const now = new Date();
    
    // Format JSON Payload terstandarisasi IoT (Sesuai Proposal Bab 3.1)
    const payload = {
      device_id: 'ESP-12E-CCP-01',
      firmware: this.store.hardware.firmware,
      zone: zoneId,
      timestamp: now.toISOString(),
      sensors: {
        temp_c: temperature,
        humidity_pct: humidity
      },
      diagnostics: {
        wifi_rssi_dbm: this.store.hardware.rssi,
        battery_voltage: this.store.hardware.batteryV,
        battery_pct: this.store.hardware.batteryPct,
        sim_scenario: simState
      },
      qos: 1
    };

    const jsonString = JSON.stringify(payload, null, 2);

    // Tampilkan di terminal inspector TST
    this.logToTerminal(`[MQTT PUB] Topic: ${this.telemetryTopic} | QoS: 1 | Size: ${new Blob([jsonString]).size} bytes\n${jsonString}`);

    // Trigger callback subsriber ingestion
    if (this.onMessageCallback) {
      this.onMessageCallback(payload);
    }

    return payload;
  }

  /**
   * Menambahkan entri ke terminal log
   */
  logToTerminal(text) {
    const timeStr = new Date().toLocaleTimeString('id-ID');
    const entry = `[${timeStr}] ${text}`;
    this.terminalLines.push(entry);

    if (this.terminalLines.length > this.maxTerminalLines) {
      this.terminalLines.shift();
    }

    const terminalEl = document.getElementById('mqtt-log-terminal');
    if (terminalEl) {
      terminalEl.textContent = this.terminalLines.join('\n\n');
      terminalEl.scrollTop = terminalEl.scrollHeight;
    }
  }

  clearTerminal() {
    this.terminalLines = [];
    const terminalEl = document.getElementById('mqtt-log-terminal');
    if (terminalEl) {
      terminalEl.textContent = `[${new Date().toLocaleTimeString('id-ID')}] Terminal dibersihkan. Menunggu aliran paket MQTT berikutnya...`;
    }
  }
}

window.appMQTT = new PantauPanganMQTTService(window.appStore);
