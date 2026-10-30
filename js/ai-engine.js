/**
 * AI Engine - PantauPangan
 * Modul Kecerdasan Buatan:
 * 1. Deteksi Anomali Statistik (Z-Score & Moving Average)
 * 2. Prediksi Tren Laju Kenaikan Suhu (Predictive Temperature Drift)
 * 3. Estimasi Waktu Menuju Ambang Kritis (Time-to-Critical-Limit)
 * 4. Mesin Inferensi Akar Masalah (Root Cause Diagnosis) & Rekomendasi CAPA
 */

class PantauPanganAIEngine {
  constructor() {
    this.zScoreThreshold = 2.2; // Batas Z-score untuk tanda anomali statistik
  }

  /**
   * Menganalisis seri data terbaru untuk zona tertentu
   * @param {Array} series - Array data time series [{ temperature, humidity, timestamp }]
   * @param {Object} zoneSpec - Objek spesifikasi batas kritis zona (dari CCP_ZONES)
   */
  analyze(series, zoneSpec) {
    if (!series || series.length < 5) {
      return {
        zScore: 0,
        status: 'NORMAL',
        mean: zoneSpec.tempTargetNominal,
        stdDev: 0.1,
        slopePerMinute: 0,
        forecast15m: zoneSpec.tempTargetNominal,
        timeToBreachMinutes: null,
        rootCause: 'Data sampling sedang dikumpulkan...',
        capa: 'Menunggu inisialisasi telemetri penuh.'
      };
    }

    // Ambil 25 data terakhir untuk window perhitungan statistik
    const windowData = series.slice(-25);
    const temps = windowData.map(d => d.temperature);
    const humidities = windowData.map(d => d.humidity);

    const latestTemp = temps[temps.length - 1];
    const latestRh = humidities[humidities.length - 1];

    // 1. Perhitungan Mean (Rata-rata) dan Standar Deviasi (σ)
    const n = temps.length;
    const mean = temps.reduce((acc, v) => acc + v, 0) / n;
    
    const variance = temps.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1 || 1);
    const stdDev = Math.max(Math.sqrt(variance), 0.05); // Hindari division by zero

    // 2. Perhitungan Skor Z (Z-Score)
    const zScore = parseFloat(((latestTemp - mean) / stdDev).toFixed(2));
    const absZ = Math.abs(zScore);

    // 3. Regresi Linier untuk Estimasi Tren (Slope m = ΔT / menit)
    // t dalam satuan menit
    let sumT = 0;
    let sumY = 0;
    let sumTY = 0;
    let sumT2 = 0;
    const lenRecent = Math.min(10, n);
    const recentTemps = temps.slice(-lenRecent);

    for (let i = 0; i < lenRecent; i++) {
      const t = i; // interval berjarak 1 unit
      const y = recentTemps[i];
      sumT += t;
      sumY += y;
      sumTY += t * y;
      sumT2 += t * t;
    }

    const denominator = (lenRecent * sumT2 - sumT * sumT);
    const slope = denominator !== 0 ? (lenRecent * sumTY - sumT * sumY) / denominator : 0;
    const slopePerMinute = parseFloat(slope.toFixed(3));

    // 4. Prediksi Suhu 15 Menit ke Depan (Forecast T+15)
    const forecast15m = parseFloat((latestTemp + (slopePerMinute * 15)).toFixed(2));

    // 5. Estimasi Waktu Menuju Pelanggaran Batas Kritis (Time to Breach)
    let timeToBreachMinutes = null;
    const upperLimit = zoneSpec.tempMax;
    const lowerLimit = zoneSpec.tempMin;

    if (slopePerMinute > 0.01 && latestTemp < upperLimit) {
      const remainingMargin = upperLimit - latestTemp;
      timeToBreachMinutes = Math.max(1, Math.round(remainingMargin / slopePerMinute));
    } else if (slopePerMinute < -0.01 && latestTemp > lowerLimit) {
      const remainingMargin = latestTemp - lowerLimit;
      timeToBreachMinutes = Math.max(1, Math.round(remainingMargin / Math.abs(slopePerMinute)));
    }

    // 6. Penentuan Status Kepatuhan HACCP
    let status = 'NORMAL';
    const isTempBreached = latestTemp > upperLimit || latestTemp < lowerLimit;
    const isRhBreached = (zoneSpec.rhMax && latestRh > zoneSpec.rhMax) || (zoneSpec.rhMin && latestRh < zoneSpec.rhMin);

    if (isTempBreached || isRhBreached) {
      status = 'CRITICAL';
    } else if (absZ > this.zScoreThreshold || (timeToBreachMinutes && timeToBreachMinutes <= 20) || forecast15m > upperLimit) {
      status = 'WARNING';
    }

    // 7. Mesin Inferensi Diagnostik Akar Masalah (Root Cause Engine)
    const diagnosis = this.inferRootCause(latestTemp, latestRh, slopePerMinute, zoneSpec, absZ);

    return {
      zScore: zScore,
      absZ: absZ,
      status: status,
      mean: parseFloat(mean.toFixed(2)),
      stdDev: parseFloat(stdDev.toFixed(2)),
      slopePerMinute: slopePerMinute,
      forecast15m: forecast15m,
      timeToBreachMinutes: timeToBreachMinutes,
      rootCause: diagnosis.cause,
      capa: diagnosis.capa,
      isDoorOpen: diagnosis.isDoorOpen,
      isCompressorFault: diagnosis.isCompressorFault
    };
  }

  /**
   * Inferensi Akar Masalah berdasarkan korelasi parameter Suhu vs Kelembapan
   */
  inferRootCause(temp, rh, slope, zoneSpec, absZ) {
    // Skenario 1: Kenaikan suhu drastis disertai penurunan kelembapan (Pintu terbuka)
    if (slope > 0.15 && rh < (zoneSpec.rhMin || 70)) {
      return {
        cause: 'Infiltrasi Udara Hangat Eksternal (Pintu Cold Storage Terbuka)',
        capa: 'Periksa fisik pintu ruang pendingin, tutup rapat seal magnetik strip, dan batasi akses keluar-masuk logistik barang.',
        isDoorOpen: true,
        isCompressorFault: false
      };
    }

    // Skenario 2: Kenaikan suhu terus-menerus tanpa perubahan kelembapan (Kegagalan Kompresor)
    if (temp > zoneSpec.tempMax || (slope > 0.08 && temp > (zoneSpec.tempMax - 1.0))) {
      return {
        cause: 'Disfungsi Unit Evaporator / Kompresor Pendingin',
        capa: 'Segera lakukan isolasi batch produk (Hold & Quarantine), alihkan ke ruang pendingin cadangan, dan panggil teknisi refrigerasi.',
        isDoorOpen: false,
        isCompressorFault: true
      };
    }

    // Skenario 3: Anomali fluktuasi acak (Skor Z tinggi tapi masih dalam batas)
    if (absZ > 2.0) {
      return {
        cause: 'Fluktuasi Mikroklimat Tidak Biasa (Thermal Drift Terdeteksi)',
        capa: 'Amati pergerakan suhu 5 menit ke depan. Pastikan sirkulasi kipas evaporator tidak terhalang oleh tumpukan boks palet.',
        isDoorOpen: false,
        isCompressorFault: false
      };
    }

    // Kondisi Normal
    return {
      cause: 'Kondisi Termal & Sirkulasi Udara Optimal',
      capa: 'Sistem stabil dalam batas aman HACCP. Lanjutkan pemantauan rutin terjadwal.',
      isDoorOpen: false,
      isCompressorFault: false
    };
  }
}

window.appAI = new PantauPanganAIEngine();
