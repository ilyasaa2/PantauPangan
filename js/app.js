/**
 * App - PantauPangan
 * Clean & Minimalist Dashboard Orchestrator
 * Integrasi Perangkat Keras Fisik (USB Serial / Web Serial API & SSE Gateway)
 */

document.addEventListener('DOMContentLoaded', () => {
  let isPhysicalConnected = false;
  let serialService = null;

  // 1. Inisialisasi Chart.js
  const ctx = document.getElementById('sensorTelemetryChart').getContext('2d');
  let telemetryChart = null;

  function initChart() {
    const currentZone = window.appStore.getCurrentZone();
    const dataPoints = window.appStore.zoneData[window.appStore.currentZoneId] || [];

    const labels = dataPoints.map(d => d.timeLabel);
    const temps = dataPoints.map(d => d.temperature);

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const gridColor = isDark ? '#21262d' : '#e2e8f0';
    const textColor = isDark ? '#8b949e' : '#64748b';

    telemetryChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Suhu Terukur (°C)',
            data: temps,
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.06)',
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointRadius: 2,
            pointHoverRadius: 5
          },
          {
            label: 'Batas Kritis Atas (°C)',
            data: Array(labels.length).fill(currentZone.tempMax),
            borderColor: '#ef4444',
            borderWidth: 1.5,
            borderDash: [4, 4],
            pointRadius: 0,
            fill: false
          },
          {
            label: 'Batas Kritis Bawah (°C)',
            data: Array(labels.length).fill(currentZone.tempMin),
            borderColor: '#0284c7',
            borderWidth: 1.2,
            borderDash: [2, 2],
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 250 },
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: {
            display: true,
            labels: {
              boxWidth: 12,
              color: textColor,
              font: { family: 'Plus Jakarta Sans', size: 11 }
            }
          },
          tooltip: {
            backgroundColor: isDark ? '#161b22' : '#ffffff',
            titleColor: isDark ? '#f0f6fc' : '#0f172a',
            bodyColor: isDark ? '#8b949e' : '#475569',
            borderColor: isDark ? '#30363d' : '#cbd5e1',
            borderWidth: 1,
            padding: 8
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { family: 'JetBrains Mono', size: 10 } }
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { family: 'JetBrains Mono', size: 10 },
              callback: value => value + '°C'
            }
          }
        }
      }
    });
  }

  initChart();

  // 2. Pembaruan UI Metrik & Diagnostik
  function updateDashboardUI(analysisResult, latestPoint) {
    const currentZone = window.appStore.getCurrentZone();

    // Metrik Suhu & Kelembapan
    document.getElementById('val-current-temp').textContent = latestPoint.temperature.toFixed(1);
    document.getElementById('val-current-rh').textContent = latestPoint.humidity.toFixed(1);
    document.getElementById('val-target-temp').textContent = `${currentZone.tempMin.toFixed(1)}°C – ${currentZone.tempMax.toFixed(1)}°C`;
    document.getElementById('val-target-rh').textContent = `${currentZone.rhMin.toFixed(1)}% – ${currentZone.rhMax.toFixed(1)}%`;

    // Badges Status Suhu & RH
    const tempBadge = document.getElementById('temp-compliance-badge');
    const rhBadge = document.getElementById('rh-compliance-badge');

    if (analysisResult.status === 'CRITICAL') {
      tempBadge.textContent = 'Pelanggaran!';
      tempBadge.className = 'status-badge critical';
    } else if (analysisResult.status === 'WARNING') {
      tempBadge.textContent = 'Peringatan';
      tempBadge.className = 'status-badge warning';
    } else {
      tempBadge.textContent = 'Normal';
      tempBadge.className = 'status-badge normal';
    }

    rhBadge.textContent = (latestPoint.humidity >= currentZone.rhMin && latestPoint.humidity <= (currentZone.rhMax || 100)) ? 'Normal' : 'Deviasi';
    rhBadge.className = rhBadge.textContent === 'Normal' ? 'status-badge normal' : 'status-badge warning';

    // AI Z-Score & Prediksi
    document.getElementById('val-ai-score').textContent = analysisResult.absZ.toFixed(2);
    const aiBadge = document.getElementById('ai-status-badge');
    aiBadge.textContent = analysisResult.status === 'NORMAL' ? 'Z-Score Normal' : `Z-Score Deviasi (${analysisResult.absZ.toFixed(1)})`;
    aiBadge.className = analysisResult.status === 'NORMAL' ? 'status-badge normal' : (analysisResult.status === 'WARNING' ? 'status-badge warning' : 'status-badge critical');

    document.getElementById('val-ai-prediction').textContent = `${analysisResult.forecast15m}°C (${analysisResult.forecast15m > currentZone.tempMax ? 'Bahaya' : 'Aman'})`;

    // Diagnostik AI & Countdown
    const aiTitle = document.getElementById('ai-diagnosis-title');
    const aiDesc = document.getElementById('ai-diagnosis-desc');
    const aiBoxBadge = document.getElementById('ai-box-badge');
    const aiCountdown = document.getElementById('ai-time-countdown');

    aiTitle.textContent = analysisResult.rootCause;
    aiBoxBadge.textContent = analysisResult.status === 'NORMAL' ? 'Stabil' : (analysisResult.status === 'WARNING' ? 'Perhatian' : 'Kritis');
    aiBoxBadge.className = `status-pill-small ${analysisResult.status.toLowerCase()}`;

    if (analysisResult.status === 'CRITICAL') {
      aiCountdown.textContent = `PELANGGARAN AKTIF: Batas Kritis Terlampaui (${latestPoint.temperature.toFixed(1)}°C / Max ${currentZone.tempMax}°C)`;
      aiCountdown.style.color = 'var(--status-critical)';
      aiDesc.textContent = `Suhu saat ini telah keluar dari rentang aman HACCP (${currentZone.tempMin.toFixed(1)}°C – ${currentZone.tempMax.toFixed(1)}°C). Produk pangan berisiko mengalami kontaminasi/pembusukan jika tidak segera ditangani!`;
    } else if (analysisResult.status === 'WARNING') {
      if (analysisResult.timeToBreachMinutes) {
        aiCountdown.textContent = `Peringatan Dini: ±${analysisResult.timeToBreachMinutes} menit menuju batas kritis (${currentZone.tempMax}°C)`;
        aiDesc.textContent = `Laju kenaikan suhu terdeteksi +${analysisResult.slopePerMinute}°C/menit (Skor Z: ${analysisResult.absZ.toFixed(2)}). Segera lakukan tindakan pencegahan sebelum batas terlampaui.`;
      } else {
        aiCountdown.textContent = `Peringatan Anomali: Deviasi Termal Terdeteksi (Skor Z: ${analysisResult.absZ.toFixed(2)})`;
        aiDesc.textContent = `Fluktuasi suhu atau kelembapan tidak wajar di luar pola baseline normal.`;
      }
      aiCountdown.style.color = 'var(--status-warning)';
    } else {
      aiCountdown.textContent = 'Kondisi Termal Terkendali';
      aiCountdown.style.color = 'var(--status-normal)';
      aiDesc.textContent = 'Siklus pendinginan dan sirkulasi udara stabil dalam rentang HACCP. Tidak ada indikasi pembusukan bahan pangan.';
    }

    document.getElementById('capa-action-text').textContent = analysisResult.capa;

    // Hardware Aktuator (Buzzer & LED)
    const isAlarm = analysisResult.status !== 'NORMAL';
    window.appStore.hardware.buzzerActive = isAlarm;
    window.appStore.hardware.ledStatus = isAlarm ? 'RED' : 'GREEN';

    const actuatorEl = document.getElementById('actuator-status');
    if (isAlarm) {
      actuatorEl.innerHTML = `<span class="text-danger font-bold">BUZZER ON &bull; LED Merah</span>`;
      // Kirim sinyal alarm ke perangkat fisik ESP-12E jika tersambung USB
      if (serialService && serialService.isConnected) {
        serialService.sendCommand('ALARM_ON');
      }
    } else {
      actuatorEl.innerHTML = `<span>Buzzer OFF &bull; LED Hijau</span>`;
      if (serialService && serialService.isConnected) {
        serialService.sendCommand('ALARM_OFF');
      }
    }

    // Statistik Ringkasan Chart
    document.getElementById('avg-temp').textContent = `${analysisResult.mean.toFixed(2)}°C`;
    document.getElementById('std-dev-temp').textContent = `±${analysisResult.stdDev.toFixed(2)}°C`;

    const series = window.appStore.zoneData[window.appStore.currentZoneId];
    const compliantCount = series.filter(p => p.temperature <= currentZone.tempMax && p.temperature >= currentZone.tempMin).length;
    const rate = ((compliantCount / series.length) * 100).toFixed(1);
    const compRateEl = document.getElementById('compliance-rate');
    compRateEl.textContent = `${rate}%`;
    compRateEl.className = rate < 95 ? 'font-mono text-warning' : 'font-mono text-success';
  }

  // 3. Render Tabel Audit Trail
  function renderAuditTable() {
    const data = window.appAudit.getFilteredLogs();
    const tbody = document.getElementById('audit-table-body');
    tbody.innerHTML = '';

    if (data.items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 1.5rem; color: var(--text-dim);">Tidak ada catatan log yang sesuai kriteria.</td></tr>`;
      return;
    }

    data.items.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="font-mono font-bold">${row.id}</td>
        <td>${row.timeFormatted}</td>
        <td><strong>${row.zoneName}</strong></td>
        <td class="font-mono" style="text-align: right;">${row.temperature.toFixed(2)}°C</td>
        <td class="font-mono" style="text-align: right;">${row.humidity.toFixed(1)}%</td>
        <td class="font-mono" style="text-align: right;">${row.zScore.toFixed(2)}</td>
        <td><span class="badge-row-status ${row.status}">${row.status}</span></td>
        <td>
          <span class="hash-token" title="${row.hash}">
            ${row.hash.slice(0, 22)}...
          </span>
        </td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById('audit-count-info').textContent = `Menampilkan ${data.items.length} dari ${data.total} data log`;
    document.getElementById('page-num').textContent = `Hal ${data.page} / ${data.totalPages}`;
    document.getElementById('btn-prev-page').disabled = data.page <= 1;
    document.getElementById('btn-next-page').disabled = data.page >= data.totalPages;
  }

  renderAuditTable();

  // 4. Integrasi Penanganan Data Masuk (Dari Perangkat Fisik USB / SSE / Simulator)
  function processIncomingTelemetry(temp, humidity, sourceLabel) {
    const currentZone = window.appStore.getCurrentZone();
    const now = new Date();
    const timeLabel = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    const newPoint = {
      timestamp: now,
      timeLabel: timeLabel,
      temperature: temp,
      humidity: humidity,
      zoneId: window.appStore.currentZoneId
    };

    const series = window.appStore.zoneData[window.appStore.currentZoneId];
    series.push(newPoint);
    if (series.length > 40) series.shift();

    // 1. Publikasikan ke MQTT (TST)
    window.appMQTT.publishTelemetry(window.appStore.currentZoneId, temp, humidity, sourceLabel);

    // 2. Evaluasi Kecerdasan Buatan (AI Engine)
    const analysis = window.appAI.analyze(series, currentZone);

    // 3. Catat ke Buku Besar Kriptografis SHA-256 (Audit Trail)
    window.appAudit.appendLog(
      window.appStore.currentZoneId,
      temp,
      humidity,
      analysis.zScore,
      analysis.status
    );

    // 4. Perbarui Chart
    if (telemetryChart) {
      telemetryChart.data.labels = series.map(d => d.timeLabel);
      telemetryChart.data.datasets[0].data = series.map(d => d.temperature);
      telemetryChart.data.datasets[1].data = Array(series.length).fill(currentZone.tempMax);
      telemetryChart.data.datasets[2].data = Array(series.length).fill(currentZone.tempMin);
      telemetryChart.update('none');
    }

    updateDashboardUI(analysis, newPoint);
    renderAuditTable();
  }

  // 5. Inisialisasi Layanan USB Serial Fisik
  serialService = new window.PantauPanganSerialService((payload, source) => {
    // Dipanggil saat data fisik masuk dari USB cable ESP-12E
    if (!isPhysicalConnected) {
      isPhysicalConnected = true;
      document.getElementById('data-source-badge').textContent = 'USB Fisik';
      document.getElementById('data-source-badge').style.borderColor = 'var(--status-normal)';
      document.getElementById('data-source-badge').style.color = 'var(--status-normal)';
      document.getElementById('port-status-label').textContent = 'USB Serial Live (COM)';
      document.getElementById('node-status-badge').textContent = 'ESP-12E Terhubung';
      document.getElementById('node-status-badge').className = 'status-badge normal';
    }

    const t = typeof payload.temperature === 'number' ? payload.temperature : parseFloat(payload.temperature);
    const rh = typeof payload.humidity === 'number' ? payload.humidity : parseFloat(payload.humidity);

    if (!isNaN(t) && !isNaN(rh)) {
      processIncomingTelemetry(t, rh, source);
    }
  });

  // Tombol Sambungkan USB di Header
  const btnToggleUsb = document.getElementById('btn-toggle-usb');
  const usbBtnText = document.getElementById('usb-btn-text');

  btnToggleUsb.addEventListener('click', async () => {
    if (serialService.isConnected) {
      // Putus koneksi USB
      await serialService.disconnectUSB();
      isPhysicalConnected = false;
      btnToggleUsb.classList.remove('connected');
      usbBtnText.textContent = 'Sambungkan USB Perangkat';
      document.getElementById('data-source-badge').textContent = 'Simulasi';
      document.getElementById('data-source-badge').style.borderColor = '';
      document.getElementById('data-source-badge').style.color = '';
      document.getElementById('port-status-label').textContent = 'Simulasi Otomatis';
      document.getElementById('node-status-badge').textContent = 'Simulator Aktif';
      showToast('Koneksi USB Perangkat diputus. Kembali ke mode simulasi.');
    } else {
      // Buka dialog koneksi USB Serial (Web Serial API)
      try {
        await serialService.connectUSB();
        isPhysicalConnected = true;
        btnToggleUsb.classList.add('connected');
        usbBtnText.textContent = 'USB Terhubung (Putus)';
        showToast('Berhasil terhubung ke ESP-12E via USB! Menangkap data real-time...', 'success');
      } catch (err) {
        if (err.name !== 'NotFoundError') {
          showToast(`Gagal menghubungkan USB: ${err.message}`, 'danger');
        }
      }
    }
  });

  // 6. Siklus Otomatis Simulator (Hanya berjalan jika perangkat fisik BELUM dicolokkan)
  let simTempOffset = 0;
  let simRhOffset = 0;

  function runSimulatorLoop() {
    if (isPhysicalConnected) {
      return; // Jangan jalankan simulator jika perangkat fisik sudah dicolokkan dan aktif
    }

    const currentZone = window.appStore.getCurrentZone();
    let targetNominalTemp = currentZone.tempTargetNominal;
    let targetNominalRh = currentZone.rhTargetNominal;

    if (window.appStore.activeSimState === 'DOOR_OPEN') {
      simTempOffset += 0.3;
      simRhOffset -= 1.5;
    } else if (window.appStore.activeSimState === 'COMPRESSOR_FAILURE') {
      simTempOffset += 0.45;
    } else if (window.appStore.activeSimState === 'SENSOR_FAULT') {
      simTempOffset = 80;
    } else {
      if (simTempOffset > 0.1) simTempOffset -= 0.15;
      else if (simTempOffset < -0.1) simTempOffset += 0.15;
      else simTempOffset = 0;

      if (simRhOffset > 0.5) simRhOffset -= 0.5;
      else if (simRhOffset < -0.5) simRhOffset += 0.5;
      else simRhOffset = 0;
    }

    const randomNoiseT = (Math.random() - 0.5) * 0.2;
    const randomNoiseRh = (Math.random() - 0.5) * 0.4;

    let computedTemp = parseFloat((targetNominalTemp + simTempOffset + randomNoiseT).toFixed(2));
    let computedRh = parseFloat(Math.min(99.0, Math.max(10.0, targetNominalRh + simRhOffset + randomNoiseRh)).toFixed(1));

    if (window.appStore.activeSimState === 'SENSOR_FAULT') {
      computedTemp = 85.0;
      computedRh = 0.0;
    }

    processIncomingTelemetry(computedTemp, computedRh, 'SIMULATOR');
  }

  setInterval(runSimulatorLoop, 4500);

  // 7. Event Listener: Zona Switcher di Header
  const zoneTabs = document.querySelectorAll('.zone-tab');
  zoneTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      zoneTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const zoneId = tab.getAttribute('data-zone');
      window.appStore.setZone(zoneId);
      simTempOffset = 0;
      simRhOffset = 0;

      showToast(`Zona aktif: ${CCP_ZONES[zoneId].name}`);

      const currentZone = window.appStore.getCurrentZone();
      const series = window.appStore.zoneData[zoneId];
      if (telemetryChart && series) {
        telemetryChart.data.labels = series.map(d => d.timeLabel);
        telemetryChart.data.datasets[0].data = series.map(d => d.temperature);
        telemetryChart.data.datasets[1].data = Array(series.length).fill(currentZone.tempMax);
        telemetryChart.data.datasets[2].data = Array(series.length).fill(currentZone.tempMin);
        telemetryChart.update();

        const analysis = window.appAI.analyze(series, currentZone);
        updateDashboardUI(analysis, series[series.length - 1]);
      }
    });
  });

  // 8. Event Listener: Dropdown Skenario Uji Fisik
  const selectSim = document.getElementById('select-sim-scenario');
  if (selectSim) {
    selectSim.addEventListener('change', (e) => {
      const mode = e.target.value;
      window.appStore.activeSimState = mode;
      if (mode === 'NORMAL') {
        simTempOffset = 0;
        simRhOffset = 0;
        showToast('Skenario diatur ke Normal Stabil');
      } else if (mode === 'DOOR_OPEN') {
        showToast('Skenario: Pintu Terbuka diaktifkan');
      } else if (mode === 'COMPRESSOR_FAILURE') {
        showToast('Skenario: Kerusakan Kompresor diaktifkan');
      } else if (mode === 'SENSOR_FAULT') {
        showToast('Skenario: Gangguan Sensor DHT11');
      }
    });
  }

  // 9. Event Listener: Verifikasi Integritas SHA-256
  document.getElementById('btn-verify-integrity').addEventListener('click', async () => {
    const result = await window.appAudit.verifyLedgerIntegrity();
    if (result.isValid) {
      showToast(`Verifikasi Berhasil: 100% (${result.totalChecked} catatan log valid dan tidak dimanipulasi)`);
    } else {
      showToast(`Peringatan: Ditemukan ${result.corruptedCount} anomali data integritas!`);
    }
  });

  // 10. Event Listener: Filter & Pagination Audit Trail
  document.getElementById('filter-audit-search').addEventListener('input', (e) => {
    window.appAudit.searchQuery = e.target.value;
    window.appAudit.currentPage = 1;
    renderAuditTable();
  });

  document.getElementById('filter-audit-status').addEventListener('change', (e) => {
    window.appAudit.statusFilter = e.target.value;
    window.appAudit.currentPage = 1;
    renderAuditTable();
  });

  document.getElementById('btn-prev-page').addEventListener('click', () => {
    if (window.appAudit.currentPage > 1) {
      window.appAudit.currentPage--;
      renderAuditTable();
    }
  });

  document.getElementById('btn-next-page').addEventListener('click', () => {
    window.appAudit.currentPage++;
    renderAuditTable();
  });

  // 11. Event Listener: Tema Tampilan
  document.getElementById('btn-theme-toggle').addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    showToast(`Beralih ke mode ${newTheme === 'dark' ? 'Gelap' : 'Terang'}`);

    if (telemetryChart) {
      const isDark = newTheme === 'dark';
      const gridColor = isDark ? '#21262d' : '#e2e8f0';
      const textColor = isDark ? '#8b949e' : '#64748b';
      telemetryChart.options.scales.x.grid.color = gridColor;
      telemetryChart.options.scales.y.grid.color = gridColor;
      telemetryChart.options.scales.x.ticks.color = textColor;
      telemetryChart.options.scales.y.ticks.color = textColor;
      telemetryChart.options.plugins.legend.labels.color = textColor;
      telemetryChart.update();
    }
  });

  // 12. Event Listener: Modal Ekspor Laporan BPOM
  const exportModal = document.getElementById('export-modal');
  const btnOpenExport = document.getElementById('btn-open-export');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  const btnExecuteExport = document.getElementById('btn-execute-export');

  function openExportModal() {
    exportModal.removeAttribute('hidden');
    const total = window.appStore.auditLogs.length;
    const normals = window.appStore.auditLogs.filter(l => l.status === 'NORMAL').length;
    const rate = total > 0 ? ((normals / total) * 100).toFixed(1) : '100.0';
    document.getElementById('preview-log-count').textContent = `${total} Data Log`;
    document.getElementById('preview-compliance-pct').textContent = `${rate}% Sesuai`;
  }

  function closeExportModal() {
    exportModal.setAttribute('hidden', '');
  }

  btnOpenExport.addEventListener('click', openExportModal);
  btnCloseModal.addEventListener('click', closeExportModal);
  btnCancelModal.addEventListener('click', closeExportModal);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !exportModal.hasAttribute('hidden')) {
      closeExportModal();
    }
  });

  btnExecuteExport.addEventListener('click', () => {
    const zone = document.getElementById('export-zone-select').value;
    const auditor = document.getElementById('export-auditor-name').value;
    const period = document.getElementById('export-date-range').options[document.getElementById('export-date-range').selectedIndex].text;
    const format = document.getElementById('export-format').value;

    closeExportModal();

    if (format === 'pdf') {
      showToast('Mengunduh Laporan Resmi PDF BPOM...');
      window.appExport.exportToPDF(zone, auditor, period);
    } else if (format === 'xlsx') {
      showToast('Mengunduh Berkas Excel (.xlsx)...');
      window.appExport.exportToExcel(zone);
    } else {
      showToast('Mengunduh Data Mentah CSV...');
      window.appExport.exportToCSV(zone);
    }
  });

  // 13. Helper Notifikasi Toast
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 2800);
  }
});
