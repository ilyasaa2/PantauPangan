/**
 * App - PantauPangan SCADA Industrial Dashboard
 * Orchestrator: Sidebar Nav, SCADA Streaming Table, Chart.js, AI Engine,
 * USB Serial Gateway, dan Ekspor Regulasi BPOM / HACCP.
 */

document.addEventListener('DOMContentLoaded', () => {
  let isPhysicalConnected = false;
  let serialService = null;
  let currentActiveFilter = 'all'; // 'all' | 'NORMAL' | 'WARNING'
  let currentSearchQuery = '';
  let currentDateFilter = 'all'; // 'all' (Live & Historis) | 'today' | '24/10/2024' | 'custom'
  let currentShiftFilter = 'all'; // 'all' | 'pagi_sore' | 'shift1' | 'shift2' | 'shift3'
  let currentCustomDate = '';
  let telemetryPage = 1;
  const telemetryPageSize = 10;

  // ==========================================================================
  // 1. Inisialisasi Chart.js (Batas Kritis HACCP & Real-time Drift)
  // ==========================================================================
  const chartCanvas = document.getElementById('sensorTelemetryChart');
  let telemetryChart = null;

  function initChart() {
    if (!chartCanvas || typeof Chart === 'undefined') return;
    const ctx = chartCanvas.getContext('2d');
    const currentZone = window.appStore.getCurrentZone();
    const dataPoints = window.appStore.zoneData[window.appStore.currentZoneId] || [];

    const labels = dataPoints.map(d => d.timeLabel);
    const temps = dataPoints.map(d => d.temperature);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? '#243042' : '#dce7ee';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    telemetryChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Suhu Terukur (°C)',
            data: temps,
            borderColor: '#0284c7',
            backgroundColor: 'rgba(2, 132, 199, 0.08)',
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
            backgroundColor: isDark ? '#131923' : '#ffffff',
            titleColor: isDark ? '#f1f5f9' : '#0f172a',
            bodyColor: isDark ? '#94a3b8' : '#475569',
            borderColor: isDark ? '#243042' : '#cbd5e1',
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

  // ==========================================================================
  // 2. Render Tabel Telemetri SCADA Streaming (Persis Desain Gambar)
  // ==========================================================================
  function renderTelemetryTable() {
    const tbody = document.getElementById('telemetry-table-body');
    if (!tbody) return;

    let items = window.appStore.telemetryLogs;

    // Filter berdasarkan status pill (Semua, Normal, Peringatan)
    if (currentActiveFilter !== 'all') {
      items = items.filter(l => l.status === currentActiveFilter);
    }

    // Filter berdasarkan Ruang
    const roomSelect = document.getElementById('select-active-room-filter');
    if (roomSelect && roomSelect.value !== 'all') {
      items = items.filter(l => l.roomKey === roomSelect.value);
    }

    // Filter berdasarkan Tanggal / Periode
    if (currentDateFilter === '24/10/2024') {
      items = items.filter(l => l.date === '24/10/2024');
    } else if (currentDateFilter === 'today') {
      const todayStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
      items = items.filter(l => l.date === todayStr);
    } else if (currentDateFilter === 'custom' && currentCustomDate) {
      const parts = currentCustomDate.split('-');
      if (parts.length === 3) {
        const formattedPicker = `${parts[2]}/${parts[1]}/${parts[0]}`;
        items = items.filter(l => l.date === formattedPicker);
      }
    }

    // Filter berdasarkan Shift Operasional HACCP
    if (currentShiftFilter !== 'all') {
      items = items.filter(l => {
        const hour = parseInt(l.time.split(':')[0], 10);
        if (isNaN(hour)) return true;
        if (currentShiftFilter === 'shift1') return hour >= 7 && hour < 15;
        if (currentShiftFilter === 'shift2') return hour >= 15 && hour < 23;
        if (currentShiftFilter === 'shift3') return hour >= 23 || hour < 7;
        if (currentShiftFilter === 'pagi_sore') return hour >= 7 && hour < 23;
        return true;
      });
    }

    // Filter berdasarkan teks pencarian
    if (currentSearchQuery.trim()) {
      const q = currentSearchQuery.toLowerCase();
      items = items.filter(l => 
        l.sensorId.toLowerCase().includes(q) ||
        l.roomName.toLowerCase().includes(q) ||
        l.notes.toLowerCase().includes(q) ||
        l.timeFormatted.toLowerCase().includes(q)
      );
    }

    // Hitung count untuk filter pill
    const totalLogs = window.appStore.telemetryLogs.length;
    const normalCount = window.appStore.telemetryLogs.filter(l => l.status === 'NORMAL').length;
    const warningCount = totalLogs - normalCount;

    const btnNormal = document.getElementById('btn-filter-normal');
    const btnWarning = document.getElementById('btn-filter-warning');
    if (btnNormal) btnNormal.textContent = `Normal (${normalCount})`;
    if (btnWarning) btnWarning.textContent = `Peringatan (${warningCount})`;

    // Update KPI Card Total Data & Deviasi
    const totalRowsEl = document.getElementById('total-telemetry-count');
    const devLabelEl = document.getElementById('deviation-count-label');
    if (totalRowsEl) totalRowsEl.textContent = totalLogs.toLocaleString('id-ID');
    if (devLabelEl) devLabelEl.textContent = `${warningCount} Kejadian`;

    // Render baris tabel
    tbody.innerHTML = '';

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2.5rem; color: var(--text-dim);">
        <div style="font-size: 1.05rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.25rem;">Belum ada data telemetri tercatat</div>
        <div style="font-size: 0.8rem;">Database telah bersih. Data baru akan otomatis masuk dan tampil di sini saat perangkat IoT (ESP-12E / ESP32) tersambung.</div>
      </td></tr>`;
      return;
    }

    // Hitung paginasi dinamis
    const totalItems = items.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / telemetryPageSize));
    if (telemetryPage > totalPages) {
      telemetryPage = totalPages;
    }
    if (telemetryPage < 1) {
      telemetryPage = 1;
    }

    const startIdx = (telemetryPage - 1) * telemetryPageSize;
    const endIdx = Math.min(startIdx + telemetryPageSize, totalItems);
    const pagedItems = items.slice(startIdx, endIdx);

    const fragment = document.createDocumentFragment();

    pagedItems.forEach(row => {
      const tr = document.createElement('tr');
      if (row.status === 'WARNING') {
        tr.className = 'row-warning';
      }

      const statusBadge = row.status === 'NORMAL' 
        ? `<span class="badge-status-pill normal">Normal</span>`
        : `<span class="badge-status-pill warning">Peringatan</span>`;

      tr.innerHTML = `
        <td class="font-mono">
          <div>${row.time}</div>
          <div style="font-size: 0.68rem; color: var(--text-dim);">${row.date}</div>
        </td>
        <td>
          <span class="table-room-dot">
            <span class="chip-dot ${row.dotClass}"></span>
            ${row.roomName}
          </span>
        </td>
        <td class="font-mono">
          <span class="sensor-id-pill">${row.sensorId}</span>
        </td>
        <td class="font-mono font-bold" style="text-align: right;">${row.temperature.toFixed(1)} °C</td>
        <td class="font-mono" style="text-align: right;">${row.humidity.toFixed(1)} % RH</td>
        <td class="font-mono" style="text-align: center; color: var(--text-dim);">${row.limitLabel}</td>
        <td style="text-align: center;">${statusBadge}</td>
        <td>
          <div class="notes-cell" title="${row.notes}">
            ${row.notes}
          </div>
        </td>
      `;
      fragment.appendChild(tr);
    });

    tbody.replaceChildren(fragment);

    const infoEl = document.getElementById('telemetry-pagination-info');
    if (infoEl) {
      const displayTotal = totalLogs.toLocaleString('id-ID');
      const startDisplay = totalItems > 0 ? (startIdx + 1) : 0;
      infoEl.textContent = `Menampilkan ${startDisplay} – ${endIdx} dari ${displayTotal} data telemetri`;
    }

    // Perbarui Tombol Kontrol Paginasi secara efisien jika ada perubahan
    updateTelemetryPaginationControls(totalPages);
  }

  let _lastRenderedPage = -1;
  let _lastTotalPages = -1;

  function updateTelemetryPaginationControls(totalPages) {
    if (_lastRenderedPage === telemetryPage && _lastTotalPages === totalPages) return;
    _lastRenderedPage = telemetryPage;
    _lastTotalPages = totalPages;

    const pageContainer = document.getElementById('telemetry-pagination-buttons');
    if (!pageContainer) return;

    let html = `<button class="btn-scada-page" id="btn-telem-prev" ${telemetryPage <= 1 ? 'disabled' : ''}>Sebelumnya</button>`;

    let startP = Math.max(1, telemetryPage - 2);
    let endP = Math.min(totalPages, startP + 4);
    if (endP - startP < 4) {
      startP = Math.max(1, endP - 4);
    }

    for (let p = startP; p <= endP; p++) {
      html += `<button class="btn-scada-page page-num ${p === telemetryPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
    }

    html += `<button class="btn-scada-page" id="btn-telem-next" ${telemetryPage >= totalPages ? 'disabled' : ''}>Selanjutnya</button>`;
    pageContainer.innerHTML = html;
  }

  // Event Delegation Paginasi Telemetri (1 listener untuk seluruh siklus hidup app - hemat CPU & memory)
  const telemPageContainer = document.getElementById('telemetry-pagination-buttons');
  if (telemPageContainer) {
    telemPageContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-scada-page');
      if (!btn || btn.disabled) return;

      if (btn.id === 'btn-telem-prev') {
        if (telemetryPage > 1) {
          telemetryPage--;
          renderTelemetryTable();
        }
      } else if (btn.id === 'btn-telem-next') {
        const totalItems = window.appStore.telemetryLogs.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / telemetryPageSize));
        if (telemetryPage < totalPages) {
          telemetryPage++;
          renderTelemetryTable();
        }
      } else if (btn.classList.contains('page-num')) {
        const p = parseInt(btn.getAttribute('data-page'), 10);
        if (!isNaN(p) && p !== telemetryPage) {
          telemetryPage = p;
          renderTelemetryTable();
        }
      }
    });
  }

  renderTelemetryTable();

  // ==========================================================================
  // 3. Pembaruan Kartu KPI SCADA & Diagnostik AI
  // ==========================================================================
  function updateDashboardUI(analysisResult, latestPoint) {
    const currentZone = window.appStore.getCurrentZone();

    // 1. Suhu Terkini
    const valTemp = document.getElementById('val-current-temp');
    if (valTemp) valTemp.textContent = latestPoint.temperature.toFixed(1);

    const targetTemp = document.getElementById('val-target-temp');
    if (targetTemp) targetTemp.textContent = currentZone.limitLabel;

    const tempBadge = document.getElementById('temp-compliance-badge');
    if (tempBadge) {
      if (analysisResult.status === 'CRITICAL') {
        tempBadge.textContent = '● Pelanggaran!';
        tempBadge.className = 'badge-status-pill critical';
      } else if (analysisResult.status === 'WARNING') {
        tempBadge.textContent = '● Peringatan';
        tempBadge.className = 'badge-status-pill warning';
      } else {
        tempBadge.textContent = '● Normal';
        tempBadge.className = 'badge-status-pill normal';
      }
    }

    // 2. Kelembapan Rerata
    const valRh = document.getElementById('val-current-rh');
    if (valRh) valRh.textContent = latestPoint.humidity.toFixed(1);

    const targetRh = document.getElementById('val-target-rh');
    if (targetRh) targetRh.textContent = `${currentZone.rhMin.toFixed(0)}% ~ ${currentZone.rhMax.toFixed(0)}% RH`;

    const rhBadge = document.getElementById('rh-compliance-badge');
    if (rhBadge) {
      const isRhNormal = latestPoint.humidity >= currentZone.rhMin && latestPoint.humidity <= (currentZone.rhMax || 100);
      rhBadge.textContent = isRhNormal ? '● Ideal' : '● Deviasi';
      rhBadge.className = isRhNormal ? 'badge-status-pill normal' : 'badge-status-pill warning';
    }

    // 3. AI Z-Score & Panel Diagnostik
    const aiScore = document.getElementById('val-ai-score');
    if (aiScore) aiScore.textContent = `${analysisResult.absZ.toFixed(2)} |Z|`;

    const aiBadge = document.getElementById('ai-status-badge');
    if (aiBadge) {
      aiBadge.textContent = analysisResult.status === 'NORMAL' ? 'Z-Score Normal' : `Z-Score Deviasi (${analysisResult.absZ.toFixed(1)})`;
      aiBadge.className = `badge-status-pill ${analysisResult.status.toLowerCase()}`;
    }

    const aiPred = document.getElementById('val-ai-prediction');
    if (aiPred) {
      const isSafe = analysisResult.forecast15m <= currentZone.tempMax && analysisResult.forecast15m >= currentZone.tempMin;
      aiPred.textContent = `${analysisResult.forecast15m}°C (${isSafe ? 'Aman' : 'Bahaya'})`;
      aiPred.style.color = isSafe ? 'var(--status-normal)' : 'var(--status-critical)';
    }

    const aiTitle = document.getElementById('ai-diagnosis-title');
    const aiDesc = document.getElementById('ai-diagnosis-desc');
    const aiBoxBadge = document.getElementById('ai-box-badge');
    const aiCountdown = document.getElementById('ai-time-countdown');

    if (aiTitle) aiTitle.textContent = analysisResult.rootCause;
    if (aiBoxBadge) {
      aiBoxBadge.textContent = analysisResult.status === 'NORMAL' ? 'Stabil' : (analysisResult.status === 'WARNING' ? 'Perhatian' : 'Kritis');
      aiBoxBadge.className = `status-pill-small ${analysisResult.status.toLowerCase()}`;
    }

    if (aiCountdown && aiDesc) {
      if (analysisResult.status === 'CRITICAL') {
        aiCountdown.textContent = `PELANGGARAN AKTIF: Batas Kritis Terlampaui (${latestPoint.temperature.toFixed(1)}°C / Max ${currentZone.tempMax}°C)`;
        aiCountdown.style.color = 'var(--status-critical)';
        aiDesc.textContent = `Suhu saat ini telah keluar dari rentang aman HACCP (${currentZone.tempMin.toFixed(1)}°C – ${currentZone.tempMax.toFixed(1)}°C). Produk pangan berisiko mengalami kontaminasi jika tidak segera ditangani!`;
      } else if (analysisResult.status === 'WARNING') {
        if (analysisResult.timeToBreachMinutes) {
          aiCountdown.textContent = `Peringatan Dini: ±${analysisResult.timeToBreachMinutes} menit menuju batas kritis (${currentZone.tempMax}°C)`;
          aiDesc.textContent = `Laju kenaikan suhu terdeteksi +${analysisResult.slopePerMinute}°C/menit (Skor Z: ${analysisResult.absZ.toFixed(2)}). Segera lakukan tindakan pencegahan.`;
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
    }

    const capaText = document.getElementById('capa-action-text');
    if (capaText) capaText.textContent = analysisResult.capa;

    // Hardware Aktuator (Buzzer & LED)
    const isAlarm = analysisResult.status !== 'NORMAL';
    window.appStore.hardware.buzzerActive = isAlarm;
    window.appStore.hardware.ledStatus = isAlarm ? 'RED' : 'GREEN';

    const actuatorEl = document.getElementById('actuator-status');
    if (actuatorEl) {
      if (isAlarm) {
        actuatorEl.innerHTML = `<span class="text-danger font-bold">BUZZER ON &bull; LED Merah</span>`;
        if (serialService && serialService.isConnected) {
          serialService.sendCommand('ALARM_ON');
        }
      } else {
        actuatorEl.innerHTML = `<span>Buzzer OFF &bull; LED Hijau</span>`;
        if (serialService && serialService.isConnected) {
          serialService.sendCommand('ALARM_OFF');
        }
      }
    }

    // Statistik Ringkasan Chart
    const avgEl = document.getElementById('avg-temp');
    const stdEl = document.getElementById('std-dev-temp');
    if (avgEl) avgEl.textContent = `${analysisResult.mean.toFixed(2)}°C`;
    if (stdEl) stdEl.textContent = `±${analysisResult.stdDev.toFixed(2)}°C`;

    const series = window.appStore.zoneData[window.appStore.currentZoneId];
    if (series) {
      const compliantCount = series.filter(p => p.temperature <= currentZone.tempMax && p.temperature >= currentZone.tempMin).length;
      const rate = ((compliantCount / series.length) * 100).toFixed(1);
      const compRateEl = document.getElementById('compliance-rate');
      if (compRateEl) {
        compRateEl.textContent = `${rate}%`;
        compRateEl.className = rate < 95 ? 'font-mono text-warning' : 'font-mono text-success';
      }
    }
  }

  // ==========================================================================
  // 4. Render Tabel Buku Besar Audit Trail SHA-256
  // ==========================================================================
  function renderAuditTable() {
    const data = window.appAudit.getFilteredLogs();
    const tbody = document.getElementById('audit-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (data.items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2.5rem; color: var(--text-dim);">
        <div style="font-size: 1.05rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.25rem;">Buku besar audit trail kosong</div>
        <div style="font-size: 0.8rem;">Belum ada catatan log audit. Transmisi IoT baru akan langsung diverifikasi dan dirangkai dengan kriptografi SHA-256.</div>
      </td></tr>`;
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
        <td><span class="badge-status-pill ${row.status.toLowerCase()}">${row.status}</span></td>
        <td>
          <span class="font-mono" style="color: var(--accent-blue);" title="${row.hash}">
            ${row.hash.slice(0, 24)}...
          </span>
        </td>
      `;
      tbody.appendChild(tr);
    });

    const info = document.getElementById('audit-count-info');
    if (info) info.textContent = `Menampilkan ${data.items.length} dari ${data.total} data log audit`;
    const pageLbl = document.getElementById('page-num');
    if (pageLbl) pageLbl.textContent = `Hal ${data.page} / ${data.totalPages}`;
    const btnPrev = document.getElementById('btn-prev-page');
    if (btnPrev) btnPrev.disabled = data.page <= 1;
    const btnNext = document.getElementById('btn-next-page');
    if (btnNext) btnNext.disabled = data.page >= data.totalPages;
  }

  renderAuditTable();

  // ==========================================================================
  // 5. Pemrosesan Data Telemetri Masuk (High-Performance Engine)
  // ==========================================================================
  let latestIncomingAnalysis = null;
  let latestIncomingPoint = null;
  let isVisualRefreshScheduled = false;
  let lastVisualRefreshTime = 0;
  let lastRealTelemetryTime = 0;
  const VISUAL_THROTTLE_MS = 450; // Throttle render UI (maks 2x per detik agar 60fps lancar)

  function scheduleVisualRefresh(immediate = false) {
    if (immediate) {
      executeVisualRefresh();
      return;
    }
    if (isVisualRefreshScheduled) return;

    const now = performance.now();
    const elapsed = now - lastVisualRefreshTime;

    if (elapsed >= VISUAL_THROTTLE_MS) {
      isVisualRefreshScheduled = true;
      requestAnimationFrame(() => {
        isVisualRefreshScheduled = false;
        lastVisualRefreshTime = performance.now();
        executeVisualRefresh();
      });
    } else {
      isVisualRefreshScheduled = true;
      setTimeout(() => {
        requestAnimationFrame(() => {
          isVisualRefreshScheduled = false;
          lastVisualRefreshTime = performance.now();
          executeVisualRefresh();
        });
      }, VISUAL_THROTTLE_MS - elapsed);
    }
  }

  function executeVisualRefresh() {
    if (latestIncomingAnalysis && latestIncomingPoint) {
      updateDashboardUI(latestIncomingAnalysis, latestIncomingPoint);
    }

    // Perbarui Chart hanya jika panel grafik sedang terlihat (Hemat GPU/CPU)
    const chartAiContainer = document.getElementById('chart-ai-container');
    const isChartVisible = !chartAiContainer || chartAiContainer.style.display !== 'none';
    if (telemetryChart && isChartVisible) {
      const currentZone = window.appStore.getCurrentZone();
      const series = window.appStore.zoneData[window.appStore.currentZoneId] || [];
      telemetryChart.data.labels = series.map(d => d.timeLabel);
      telemetryChart.data.datasets[0].data = series.map(d => d.temperature);
      telemetryChart.data.datasets[1].data = Array(series.length).fill(currentZone.tempMax);
      telemetryChart.data.datasets[2].data = Array(series.length).fill(currentZone.tempMin);
      telemetryChart.update('none');
    }

    // Render tabel hanya untuk tampilan yang sedang aktif agar hemat siklus render DOM
    const monitorView = document.getElementById('view-monitoring');
    if (!monitorView || monitorView.style.display !== 'none') {
      renderTelemetryTable();
    }

    const auditView = document.getElementById('view-audit');
    if (auditView && auditView.style.display !== 'none') {
      renderAuditTable();
    }
  }

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

    // 1. Publikasikan ke MQTT Broker
    window.appMQTT.publishTelemetry(window.appStore.currentZoneId, temp, humidity, sourceLabel);

    // 2. Evaluasi AI Anomaly & Z-Score
    const analysis = window.appAI.analyze(series, currentZone);

    // 3. Tambahkan ke Streaming Telemetri SCADA
    window.appStore.addTelemetryLog(
      window.appStore.currentZoneId,
      temp,
      humidity,
      analysis.status,
      sourceLabel === 'USB_SERIAL' ? `Data langsung USB Serial DHT11 (${currentZone.name})` : null,
      sourceLabel
    );

    // 4. Catat ke Buku Besar Kriptografis SHA-256
    window.appAudit.appendLog(
      window.appStore.currentZoneId,
      temp,
      humidity,
      analysis.zScore,
      analysis.status
    );

    // 5. Simpan snapshot terbaru & jadwalkan rendering UI secara halus
    latestIncomingAnalysis = analysis;
    latestIncomingPoint = newPoint;
    scheduleVisualRefresh();
  }

  // ==========================================================================
  // 6. Inisialisasi Layanan USB Serial Fisik (Web Serial API)
  // ==========================================================================
  serialService = new window.PantauPanganSerialService((payload, source) => {
    lastRealTelemetryTime = Date.now();

    if (!isPhysicalConnected && source === 'USB_SERIAL') {
      isPhysicalConnected = true;
      const topGatewayText = document.getElementById('top-gateway-text');
      if (topGatewayText) topGatewayText.innerHTML = `ESP-12E: <strong class="font-mono text-success">USB Live (COM)</strong>`;
      const portStatus = document.getElementById('port-status-label');
      if (portStatus) portStatus.textContent = 'USB Serial Live (COM)';
      const nodeBadge = document.getElementById('node-status-badge');
      if (nodeBadge) {
        nodeBadge.textContent = '● ESP-12E Live';
        nodeBadge.className = 'badge-status-pill normal';
      }
    }

    const t = typeof payload.temperature === 'number' ? payload.temperature : parseFloat(payload.temperature);
    const rh = typeof payload.humidity === 'number' ? payload.humidity : parseFloat(payload.humidity);

    if (!isNaN(t) && !isNaN(rh) && isFinite(t) && isFinite(rh) && t >= -50.0 && t <= 80.0 && rh >= 0.0 && rh <= 100.0) {
      processIncomingTelemetry(t, rh, source || 'USB_SERIAL');
    }
  });

  const btnToggleUsb = document.getElementById('btn-toggle-usb');
  const usbBtnText = document.getElementById('usb-btn-text');

  if (btnToggleUsb) {
    btnToggleUsb.addEventListener('click', async () => {
      if (serialService.isConnected) {
        await serialService.disconnectUSB();
        isPhysicalConnected = false;
        btnToggleUsb.classList.remove('connected');
        if (usbBtnText) usbBtnText.textContent = 'Sync';
        const topGatewayText = document.getElementById('top-gateway-text');
        if (topGatewayText) topGatewayText.innerHTML = `ESP32 / ESP-12E: <strong class="font-mono">Online / 1.2s ping</strong>`;
        showToast('Koneksi USB diputus.');
      } else {
        try {
          await serialService.connectUSB();
          isPhysicalConnected = true;
          btnToggleUsb.classList.add('connected');
          if (usbBtnText) usbBtnText.textContent = 'Putus USB';
          const topGatewayText = document.getElementById('top-gateway-text');
          if (topGatewayText) topGatewayText.innerHTML = `ESP-12E: <strong class="font-mono text-success">USB Live (COM)</strong>`;
          showToast('Berhasil terhubung ke perangkat via USB Serial (115200 Baud)!', 'success');
        } catch (err) {
          if (err.name !== 'NotFoundError') {
            showToast(`Gagal koneksi USB: ${err.message}`, 'danger');
          }
        }
      }
    });
  }

  // ==========================================================================
  // 7. Penanganan Mode Operasional Nyata (Standby Menunggu Aliran Data IoT)
  // ==========================================================================
  // Mode uji coba simulasi telah dinonaktifkan secara permanen.
  // Data telemetri hanya mengalir dari perangkat keras riil (Web Serial USB atau API SSE Gateway).

  // ==========================================================================
  // 8. Navigasi Sidebar & Pemilihan Ruangan / View
  // ==========================================================================
  function switchView(viewId) {
    const views = document.querySelectorAll('.content-view');
    views.forEach(v => {
      v.style.display = 'none';
      v.classList.remove('active');
    });

    const target = document.getElementById(`view-${viewId}`);
    if (target) {
      target.style.display = '';
      target.classList.add('active');
    }
  }

  function setActiveZone(zoneId) {
    window.appStore.setZone(zoneId);
    simTempOffset = 0;
    simRhOffset = 0;

    const currentZone = window.appStore.getCurrentZone();

    // Update judul halaman
    const titleEl = document.getElementById('page-room-title');
    if (titleEl) titleEl.textContent = `Monitoring Suhu & Kelembapan Ruang - ${currentZone.name}`;

    const tempLabel = document.getElementById('card-temp-label');
    if (tempLabel) tempLabel.textContent = `SUHU TERKINI (${currentZone.name.toUpperCase()})`;

    // Update Dropdown Filter Ruang
    const roomSelect = document.getElementById('select-active-room-filter');
    if (roomSelect) roomSelect.value = zoneId;

    // Update Active Nav Items
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    navItems.forEach(item => {
      if (item.getAttribute('data-zone') === zoneId) {
        item.classList.add('active');
      } else if (item.getAttribute('data-zone')) {
        item.classList.remove('active');
      }
    });

    // Perbarui chart
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

    renderTelemetryTable();
    showToast(`Zona aktif: ${currentZone.name}`);
  }

  // Event listener tombol navigasi sidebar
  const sidebarButtons = document.querySelectorAll('.sidebar-nav .nav-item');
  sidebarButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      sidebarButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const view = btn.getAttribute('data-view');
      const zone = btn.getAttribute('data-zone');

      if (view === 'monitoring' && zone) {
        switchView('monitoring');
        setActiveZone(zone);
      } else if (view === 'audit') {
        switchView('audit');
        renderAuditTable();
      } else if (view === 'gateway') {
        switchView('gateway');
        if (window.appMQTT && window.appMQTT.refreshTerminalUI) {
          window.appMQTT.refreshTerminalUI();
        }
      }
    });
  });

  // ==========================================================================
  // 9. Filter & Search Toolbar Tabel Streaming
  // ==========================================================================
  let _searchDebounce = null;
  const searchInput = document.getElementById('filter-telemetry-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(_searchDebounce);
      _searchDebounce = setTimeout(() => {
        currentSearchQuery = e.target.value;
        renderTelemetryTable();
      }, 180);
    });
  }

  const filterPills = document.querySelectorAll('.toolbar-filter-pills .filter-pill');
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentActiveFilter = pill.getAttribute('data-filter');
      renderTelemetryTable();
    });
  });

  const selectRoomFilter = document.getElementById('select-active-room-filter');
  if (selectRoomFilter) {
    selectRoomFilter.addEventListener('change', (e) => {
      const selected = e.target.value;
      if (selected !== 'all') {
        setActiveZone(selected);
      } else {
        renderTelemetryTable();
      }
    });
  }

  const btnRefresh = document.getElementById('btn-refresh-telemetry');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      renderTelemetryTable();
      showToast('Data telemetri diperbarui!');
    });
  }

  // Tombol Toggle Grafik & AI
  const btnToggleChart = document.getElementById('btn-toggle-chart-view');
  const chartAiContainer = document.getElementById('chart-ai-container');
  if (btnToggleChart && chartAiContainer) {
    btnToggleChart.addEventListener('click', () => {
      const isHidden = chartAiContainer.style.display === 'none';
      chartAiContainer.style.display = isHidden ? '' : 'none';
      btnToggleChart.classList.toggle('active', isHidden);
      showToast(isHidden ? 'Panel Grafik & AI dibuka' : 'Panel Grafik & AI disembunyikan');
    });
  }

  // ==========================================================================
  // Popover Filter Tanggal & Shift Operasional HACCP
  // ==========================================================================
  const btnToggleDateFilter = document.getElementById('btn-toggle-date-filter');
  const datePopover = document.getElementById('date-filter-popover');
  const btnCloseDatePopover = document.getElementById('btn-close-date-popover');
  const btnApplyDateFilter = document.getElementById('btn-apply-date-filter');
  const btnResetDateFilter = document.getElementById('btn-reset-date-filter');
  const selectFilterDate = document.getElementById('filter-date-select');
  const customDateInput = document.getElementById('filter-custom-date-input');
  const selectFilterShift = document.getElementById('filter-shift-select');
  const shiftLabelEl = document.getElementById('current-shift-label');

  function openDatePopover() {
    if (datePopover) datePopover.removeAttribute('hidden');
  }

  function closeDatePopover() {
    if (datePopover) datePopover.setAttribute('hidden', '');
  }

  if (btnToggleDateFilter) {
    btnToggleDateFilter.addEventListener('click', (e) => {
      e.stopPropagation();
      if (datePopover.hasAttribute('hidden')) {
        openDatePopover();
      } else {
        closeDatePopover();
      }
    });
  }

  // Mencegah interaksi di dalam popover (klik dropdown, input tanggal, dll) memicu auto-close
  if (datePopover) {
    datePopover.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  if (btnCloseDatePopover) {
    btnCloseDatePopover.addEventListener('click', (e) => {
      e.stopPropagation();
      closeDatePopover();
    });
  }

  // Tampilkan input date manual jika opsi "custom" dipilih
  if (selectFilterDate) {
    selectFilterDate.addEventListener('change', (e) => {
      e.stopPropagation();
      if (customDateInput) {
        customDateInput.style.display = e.target.value === 'custom' ? 'block' : 'none';
        if (e.target.value === 'custom') {
          customDateInput.focus();
        }
      }
    });
  }

  // Terapkan Filter
  if (btnApplyDateFilter) {
    btnApplyDateFilter.addEventListener('click', (e) => {
      e.stopPropagation();
      currentDateFilter = selectFilterDate ? selectFilterDate.value : '24/10/2024';
      currentShiftFilter = selectFilterShift ? selectFilterShift.value : 'pagi_sore';

      if (currentDateFilter === 'custom' && customDateInput) {
        currentCustomDate = customDateInput.value;
      }

      // Update Text Label Toolbar
      let dateLabel = '24 Okt 2024';
      if (currentDateFilter === 'today') dateLabel = 'Hari Ini';
      else if (currentDateFilter === 'all') dateLabel = 'Semua Tanggal';
      else if (currentDateFilter === 'custom' && currentCustomDate) dateLabel = currentCustomDate;

      let shiftLabel = 'Shift Pagi - Sore';
      if (currentShiftFilter === 'all') shiftLabel = 'Semua Shift';
      else if (currentShiftFilter === 'shift1') shiftLabel = 'Shift 1: Pagi';
      else if (currentShiftFilter === 'shift2') shiftLabel = 'Shift 2: Siang/Sore';
      else if (currentShiftFilter === 'shift3') shiftLabel = 'Shift 3: Malam';

      if (shiftLabelEl) {
        shiftLabelEl.textContent = `${dateLabel} | ${shiftLabel}`;
      }

      closeDatePopover();
      renderTelemetryTable();
      showToast(`Filter diterapkan: ${dateLabel} (${shiftLabel})`, 'success');
    });
  }

  // Reset Filter ke Default
  if (btnResetDateFilter) {
    btnResetDateFilter.addEventListener('click', (e) => {
      e.stopPropagation();
      currentDateFilter = 'all';
      currentShiftFilter = 'all';
      currentCustomDate = '';

      if (selectFilterDate) selectFilterDate.value = 'all';
      if (selectFilterShift) selectFilterShift.value = 'all';
      if (customDateInput) {
        customDateInput.value = '';
        customDateInput.style.display = 'none';
      }

      if (shiftLabelEl) {
        shiftLabelEl.textContent = 'Live Telemetri | Semua Shift';
      }

      closeDatePopover();
      renderTelemetryTable();
      showToast('Filter tanggal & shift direset ke default (Live & Semua Data)');
    });
  }

  // Menutup popover hanya saat benar-benar mengklik di luar area container tanggal
  const dateShiftContainer = document.querySelector('.date-shift-container');
  document.addEventListener('click', (e) => {
    if (datePopover && !datePopover.hasAttribute('hidden')) {
      if (dateShiftContainer && !dateShiftContainer.contains(e.target)) {
        closeDatePopover();
      }
    }
  });

  // ==========================================================================
  // 10. Audit Trail Filters & Verifikasi Hash
  // ==========================================================================
  const auditSearch = document.getElementById('filter-audit-search');
  if (auditSearch) {
    auditSearch.addEventListener('input', (e) => {
      window.appAudit.searchQuery = e.target.value;
      window.appAudit.currentPage = 1;
      renderAuditTable();
    });
  }

  const auditStatus = document.getElementById('filter-audit-status');
  if (auditStatus) {
    auditStatus.addEventListener('change', (e) => {
      window.appAudit.statusFilter = e.target.value;
      window.appAudit.currentPage = 1;
      renderAuditTable();
    });
  }

  const btnVerify = document.getElementById('btn-verify-integrity');
  if (btnVerify) {
    btnVerify.addEventListener('click', async () => {
      const result = await window.appAudit.verifyLedgerIntegrity();
      if (result.isValid) {
        showToast(`Verifikasi Berhasil: 100% (${result.totalChecked} catatan log valid dan tidak dimanipulasi)`, 'success');
      } else {
        showToast(`Peringatan: Ditemukan ${result.corruptedCount} anomali integritas hash!`, 'danger');
      }
    });
  }

  const btnPrevPage = document.getElementById('btn-prev-page');
  const btnNextPage = document.getElementById('btn-next-page');
  if (btnPrevPage) {
    btnPrevPage.addEventListener('click', () => {
      if (window.appAudit.currentPage > 1) {
        window.appAudit.currentPage--;
        renderAuditTable();
      }
    });
  }
  if (btnNextPage) {
    btnNextPage.addEventListener('click', () => {
      window.appAudit.currentPage++;
      renderAuditTable();
    });
  }

  // ==========================================================================
  // 11. Tema Tampilan (Terang / Gelap)
  // ==========================================================================
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      showToast(`Beralih ke mode ${newTheme === 'dark' ? 'Gelap' : 'Terang'}`);

      if (telemetryChart) {
        const isDark = newTheme === 'dark';
        const gridColor = isDark ? '#243042' : '#dce7ee';
        const textColor = isDark ? '#94a3b8' : '#64748b';
        telemetryChart.options.scales.x.grid.color = gridColor;
        telemetryChart.options.scales.y.grid.color = gridColor;
        telemetryChart.options.scales.x.ticks.color = textColor;
        telemetryChart.options.scales.y.ticks.color = textColor;
        telemetryChart.options.plugins.legend.labels.color = textColor;
        telemetryChart.update();
      }
    });
  }

  // ==========================================================================
  // 12. Modal Ekspor Laporan Resmi BPOM / Excel
  // ==========================================================================
  const exportModal = document.getElementById('export-modal');
  const btnOpenExportPdf = document.getElementById('btn-open-export-pdf');
  const btnExportCsvExcel = document.getElementById('btn-export-csv-excel');
  const btnExportAuditPdf = document.getElementById('btn-export-audit-pdf');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  const btnExecuteExport = document.getElementById('btn-execute-export');
  const exportFormatSelect = document.getElementById('export-format');

  function openExportModal(defaultFormat = 'pdf') {
    if (!exportModal) return;
    if (exportFormatSelect) exportFormatSelect.value = defaultFormat;
    exportModal.removeAttribute('hidden');

    const total = window.appStore.telemetryLogs.length;
    const normals = window.appStore.telemetryLogs.filter(l => l.status === 'NORMAL').length;
    const rate = total > 0 ? ((normals / total) * 100).toFixed(1) : '100.0';

    const logCountEl = document.getElementById('preview-log-count');
    const compPctEl = document.getElementById('preview-compliance-pct');
    if (logCountEl) logCountEl.textContent = `${total.toLocaleString('id-ID')} Data`;
    if (compPctEl) compPctEl.textContent = `${rate}% Sesuai`;
  }

  function closeExportModal() {
    if (exportModal) exportModal.setAttribute('hidden', '');
  }

  if (btnOpenExportPdf) btnOpenExportPdf.addEventListener('click', () => openExportModal('pdf'));
  if (btnExportAuditPdf) btnExportAuditPdf.addEventListener('click', () => openExportModal('pdf'));
  if (btnExportCsvExcel) btnExportCsvExcel.addEventListener('click', () => openExportModal('xlsx'));
  if (btnCloseModal) btnCloseModal.addEventListener('click', closeExportModal);
  if (btnCancelModal) btnCancelModal.addEventListener('click', closeExportModal);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && exportModal && !exportModal.hasAttribute('hidden')) {
      closeExportModal();
    }
  });

  if (btnExecuteExport) {
    btnExecuteExport.addEventListener('click', () => {
      const zone = document.getElementById('export-zone-select').value;
      const auditor = document.getElementById('export-auditor-name').value;
      const periodSelect = document.getElementById('export-date-range');
      const periodKey = periodSelect ? periodSelect.value : 'current_shift';
      const period = periodSelect ? periodSelect.options[periodSelect.selectedIndex].text : 'Shift Berjalan';
      const format = document.getElementById('export-format').value;

      btnExecuteExport.disabled = true;
      btnExecuteExport.textContent = 'Menyusun Dokumen...';

      // Eksekusi asinkron agar UI tidak freeze / macet
      setTimeout(() => {
        try {
          if (format === 'pdf') {
            showToast('Menyusun Dokumen Resmi PDF BPOM...');
            window.appExport.exportToPDF(zone, auditor, period, periodKey);
          } else if (format === 'xlsx') {
            showToast('Mengunduh Lembar Kerja Excel (.xlsx)...');
            window.appExport.exportToExcel(zone);
          } else {
            showToast('Mengunduh Data Mentah CSV...');
            window.appExport.exportToCSV(zone);
          }
        } finally {
          btnExecuteExport.disabled = false;
          btnExecuteExport.textContent = 'Unduh Laporan';
          closeExportModal();
        }
      }, 60);
    });
  }

  // ==========================================================================
  // 13. Toast Notification Helper
  // ==========================================================================
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
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
