/**
 * PantauPangan - Firmware Node ESP8266 (ESP-12E NodeMCU V3)
 * Mata Kuliah: Internet of Things & Sistem Terintegrasi
 *
 * Konfigurasi Perangkat Keras:
 * 1. Board & Shield    : NodeMCU ESP-12E V3 + Expansion Baseboard Shield (HW-389)
 * 2. Catu Daya Utama   : Adaptor Eksternal 5V 3A (Jack DC pada Expansion Shield)
 * 3. Display           : LCD 1602 Biru + Adapter Backpack I2C (PCF8574T 0x27)
 * 4. Sensor Suhu/RH    : DHT11
 * 5. Indikator Visual  : Lampu LED 3 Warna (Hijau = Normal, Kuning = Warning, Merah = Kritis)
 * 6. Indikator Audio   : Buzzer Aktif 5V
 * 7. Komunikasi        : Hybrid Dual-Mode (Nirkabel Wi-Fi Hotspot + Backup USB Serial UART 115200)
 *
 * Pemetaan Pin NodeMCU Expansion Shield:
 * - LCD I2C SDA        : Pin D2 (GPIO 4)
 * - LCD I2C SCL        : Pin D1 (GPIO 5)
 * - VCC LCD            : Pin 5V (Vin pada Shield) -> Agar kontras teks jelas
 * - GND LCD            : Pin GND pada Shield
 * - DHT11 Data (Signal): Pin D5 (GPIO 14)
 * - LED Hijau (Normal) : Pin D6 (GPIO 12)
 * - LED Kuning (Warn)  : Pin D7 (GPIO 13)
 * - LED Merah (Kritis) : Pin D8 (GPIO 15)
 * - Buzzer Aktif (+)   : Pin D3 (GPIO 0)
 */

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <DHT.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <WiFiUdp.h>

// ============================================================================
// 1. Konfigurasi Nirkabel Wi-Fi Hotspot
// ============================================================================
const char* WIFI_SSID = "000";
const char* WIFI_PASS = "00000000";

// Alamat IP Gateway Laptop (Akan diperbarui otomatis via UDP Beacon jika terdeteksi)
String laptopServerIP = "192.168.0.104";
const int SERVER_PORT = 3000;
bool isWiFiConnected = false;
bool hasDiscoveredServer = false;
WiFiUDP udpBeacon;
const int UDP_BEACON_PORT = 3001;

// ============================================================================
// 2. Definisi Pin Fisik pada NodeMCU ESP8266 Shield
// ============================================================================
#define PIN_SDA      4    // Pin D2 -> SDA LCD 1602 I2C
#define PIN_SCL      5    // Pin D1 -> SCL LCD 1602 I2C
#define DHTPIN       14   // Pin D5 -> Data Sensor DHT11
#define PIN_LED_GRN  12   // Pin D6 -> LED Hijau (Kondisi Normal)
#define PIN_LED_YEL  13   // Pin D7 -> LED Kuning (Kondisi Warning/Peringatan)
#define PIN_LED_RED  15   // Pin D8 -> LED Merah (Kondisi Kritis/Pelanggaran)
#define BUZZER_PIN   0    // Pin D3 -> Buzzer Aktif 5V

#define DHTTYPE      DHT11

// ============================================================================
// 3. Inisialisasi Objek & Parameter
// ============================================================================
LiquidCrystal_I2C lcd(0x27, 16, 2);
DHT dht(DHTPIN, DHTTYPE);

// Interval sampling sensor & update serial (2.5 detik)
const unsigned long INTERVAL_MS = 2500;
unsigned long lastReadTime = 0;

// Variabel data sensor terakhir
float lastTemp = 0.0;
float lastRh = 0.0;
bool isSensorReady = false;

// Batas Kritis HACCP Default (Standar Pameran: Ruang Kering/Ambient 18.0°C s/d 32.0°C)
// Agar saat pertama kali dinyalakan di suhu ruangan (~28°C-30.5°C), status langsung NORMAL (LED Hijau)
float limitMinTemp = 18.0;
float limitMaxTemp = 32.0;
float warnThreshold = 30.8; // Suhu mendekati batas kritis memicu lampu kuning

// Kendali alarm & status mute buzzer
bool remoteAlarmActive = false;
bool buzzerMuted = false;

// Parameter Animasi & Pergantian Halaman Layar LCD
unsigned long lastPageSwitch = 0;
const unsigned long PAGE_DURATION_MS = 3200; // Tiap halaman tampil 3.2 detik
int currentPage = 0;                          // 0 = Telemetri, 1 = Analisis Deviasi, 2 = Tindakan CAPA
int scrollPos = 0;                            // Posisi teks berjalan (marquee)
unsigned long lastScrollTime = 0;
const unsigned long SCROLL_SPEED_MS = 300;   // Kecepatan geser teks penanganan

// Custom Char I2C LCD (Simbol Derajat Celcius °)
byte degreeChar[8] = {
  0b00110,
  0b01001,
  0b01001,
  0b00110,
  0b00000,
  0b00000,
  0b00000,
  0b00000
};

// ============================================================================
// Helper: Cetak Teks Rata 16 Karakter (Mencegah Karakter Sisa/Ghosting)
// ============================================================================
void lcdPrintLine(int row, String text) {
  lcd.setCursor(0, row);
  while (text.length() < 16) {
    text += " ";
  }
  if (text.length() > 16) {
    text = text.substring(0, 16);
  }
  lcd.print(text);
}

// Prototype Fungsi
void renderLCDPage(float temperature, float humidity);
void handleServerFeedback(String resp);

// ============================================================================
// 4. Setup Hardware
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(300);

  // Inisialisasi Pin Output LED & Buzzer
  pinMode(PIN_LED_GRN, OUTPUT);
  pinMode(PIN_LED_YEL, OUTPUT);
  pinMode(PIN_LED_RED, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  // Kondisi awal: semua mati
  digitalWrite(PIN_LED_GRN, LOW);
  digitalWrite(PIN_LED_YEL, LOW);
  digitalWrite(PIN_LED_RED, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  // Inisialisasi Komunikasi I2C untuk LCD
  #if defined(ESP8266) || defined(ESP32)
    Wire.begin(PIN_SDA, PIN_SCL);
  #else
    Wire.begin();
  #endif
  lcd.init();
  lcd.backlight();
  lcd.createChar(0, degreeChar);

  // Tampilan Sambutan Awal di LCD
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(F(" PantauPangan "));
  lcd.setCursor(0, 1);
  lcd.print(F("SCADA Cold Chain"));

  // Uji singkat indikator LED (Self-Test 600ms)
  digitalWrite(PIN_LED_GRN, HIGH);
  delay(150);
  digitalWrite(PIN_LED_GRN, LOW);
  digitalWrite(PIN_LED_YEL, HIGH);
  delay(150);
  digitalWrite(PIN_LED_YEL, LOW);
  digitalWrite(PIN_LED_RED, HIGH);
  delay(150);
  digitalWrite(PIN_LED_RED, LOW);

  // Inisialisasi Sensor DHT11
  dht.begin();

  // Koneksi Nirkabel Wi-Fi Hotspot HP
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(F("WiFi: Hotspot "));
  lcd.setCursor(0, 1);
  lcd.print(F("Menghubungkan..."));

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - wifiStart < 7000)) {
    delay(300);
    digitalWrite(PIN_LED_YEL, !digitalRead(PIN_LED_YEL)); // Kedip kuning saat mencari sinyal
  }
  digitalWrite(PIN_LED_YEL, LOW);

  if (WiFi.status() == WL_CONNECTED) {
    isWiFiConnected = true;
    udpBeacon.begin(UDP_BEACON_PORT);

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print(F("WiFi Terhubung! "));
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP().toString());
    digitalWrite(PIN_LED_GRN, HIGH);
    delay(1200);
    digitalWrite(PIN_LED_GRN, LOW);
  } else {
    isWiFiConnected = false;
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print(F("WiFi Offline    "));
    lcd.setCursor(0, 1);
    lcd.print(F("Mode Standalone "));
    delay(800);
  }

  Serial.println(F("{\"status\":\"READY\",\"device\":\"ESP-12E-V3\",\"display\":\"LCD_1602_I2C\",\"mode\":\"HYBRID_WIFI_SERIAL\"}"));
}

// ============================================================================
// 5. Loop Utama
// ============================================================================
void loop() {
  // 1. Memeriksa perintah kendali dari Dashboard Laptop via USB Serial (Jika dicolok)
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();

    if (cmd == "ALARM_ON") {
      remoteAlarmActive = true;
    } else if (cmd == "ALARM_OFF") {
      remoteAlarmActive = false;
    } else if (cmd == "MUTE_BUZZER" || cmd == "BUZZER_MUTE") {
      buzzerMuted = true;
      digitalWrite(BUZZER_PIN, LOW); // Langsung senyap
    } else if (cmd == "UNMUTE_BUZZER" || cmd == "BUZZER_UNMUTE") {
      buzzerMuted = false;
    } else if (cmd.startsWith("SET_ZONE:")) {
      int firstComma = cmd.indexOf(',');
      int secondComma = cmd.indexOf(',', firstComma + 1);
      if (firstComma > 0 && secondComma > firstComma) {
        limitMinTemp = cmd.substring(firstComma + 1, secondComma).toFloat();
        limitMaxTemp = cmd.substring(secondComma + 1).toFloat();
        warnThreshold = limitMaxTemp - 1.2;
      }
    }
  }

  // 2. Auto-Discovery IP Laptop via UDP Beacon (Port 3001)
  if (isWiFiConnected) {
    int packetSize = udpBeacon.parsePacket();
    if (packetSize > 0) {
      char packetBuf[64];
      int len = udpBeacon.read(packetBuf, 63);
      if (len > 0) packetBuf[len] = 0;
      String msg = String(packetBuf);
      if (msg.startsWith("PANTAUPANGAN_GATEWAY:")) {
        laptopServerIP = udpBeacon.remoteIP().toString();
        hasDiscoveredServer = true;
      }
    }
  }

  // 3. Pembacaan Sensor & Transmisi Berkala (Tiap 2.5 Detik)
  unsigned long currentMillis = millis();
  if (currentMillis - lastReadTime >= INTERVAL_MS) {
    lastReadTime = currentMillis;

    float humidity = dht.readHumidity();
    float temperature = dht.readTemperature(); // Satuan Celcius

    // Penanganan Galat Pembacaan Sensor
    if (isnan(humidity) || isnan(temperature)) {
      Serial.println(F("{\"error\":\"DHT11_READ_FAILED\",\"msg\":\"Gagal membaca sensor DHT11 di Pin D5\"}"));
      
      lcdPrintLine(0, F("SENSOR DHT ERROR"));
      lcdPrintLine(1, F("Periksa Kabel D5"));

      digitalWrite(PIN_LED_GRN, LOW);
      digitalWrite(PIN_LED_YEL, HIGH);
      digitalWrite(PIN_LED_RED, HIGH);
      return;
    }

    // Simpan data pembacaan terbaru
    lastTemp = temperature;
    lastRh = humidity;
    isSensorReady = true;

    // Evaluasi Kondisi Kepatuhan HACCP
    bool isCritical = (temperature > limitMaxTemp || temperature < limitMinTemp || remoteAlarmActive);
    bool isWarning  = (!isCritical && (temperature >= warnThreshold || humidity > 85.0 || humidity < 35.0));

    if (isCritical) {
      digitalWrite(PIN_LED_GRN, LOW);
      digitalWrite(PIN_LED_YEL, LOW);
      digitalWrite(PIN_LED_RED, HIGH);   // LED Merah ON
      digitalWrite(BUZZER_PIN, buzzerMuted ? LOW : HIGH); // Buzzer aktif jika tidak di-mute
    } else if (isWarning) {
      digitalWrite(PIN_LED_GRN, LOW);
      digitalWrite(PIN_LED_YEL, HIGH);   // LED Kuning ON
      digitalWrite(PIN_LED_RED, LOW);
      digitalWrite(BUZZER_PIN, LOW);     // Buzzer OFF saat warning
    } else {
      digitalWrite(PIN_LED_GRN, HIGH);   // LED Hijau ON (Kondisi NORMAL / AMAN)
      digitalWrite(PIN_LED_YEL, LOW);
      digitalWrite(PIN_LED_RED, LOW);
      digitalWrite(BUZZER_PIN, LOW);     // Buzzer OFF
    }

    // A. Transmisi Serial UART (Selalu Aktif untuk Backup USB)
    Serial.print(F("{\"device_id\":\"ESP-12E-CCP-01\""));
    Serial.print(F(",\"temperature\":"));
    Serial.print(temperature, 1);
    Serial.print(F(",\"humidity\":"));
    Serial.print(humidity, 1);
    Serial.print(F(",\"status\":\""));
    Serial.print(isCritical ? F("CRITICAL") : (isWarning ? F("WARNING") : F("NORMAL")));
    Serial.print(F("\""));
    Serial.print(F(",\"alarm\":"));
    Serial.print(isCritical ? F("true") : F("false"));
    Serial.println(F("}"));

    // B. Transmisi Nirkabel Wi-Fi HTTP POST ke Laptop (Jika Terhubung)
    if (WiFi.status() == WL_CONNECTED) {
      isWiFiConnected = true;
      WiFiClient client;
      HTTPClient http;
      String endpointUrl = "http://" + laptopServerIP + ":" + String(SERVER_PORT) + "/api/telemetry";

      if (http.begin(client, endpointUrl)) {
        http.addHeader(F("Content-Type"), F("application/json"));
        http.setTimeout(1200); // 1.2 detik timeout agar loop display tetap responsif

        String jsonPayload = "{\"device_id\":\"ESP-12E-CCP-01\""
                             ",\"temperature\":" + String(temperature, 1) +
                             ",\"humidity\":" + String(humidity, 1) +
                             ",\"status\":\"" + (isCritical ? "CRITICAL" : (isWarning ? "WARNING" : "NORMAL")) + "\""
                             ",\"alarm\":" + (isCritical ? "true" : "false") +
                             ",\"wifi\":true" +
                             ",\"ip\":\"" + WiFi.localIP().toString() + "\"}";

        int httpCode = http.POST(jsonPayload);
        if (httpCode > 0) {
          String resp = http.getString();
          handleServerFeedback(resp);
        }
        http.end();
      }
    } else {
      isWiFiConnected = false;
    }
  }

  // 4. Animasi Pergantian Halaman Layar LCD 1602 (Non-Blocking Carousel)
  if (isSensorReady) {
    unsigned long now = millis();

    // Pergantian Halaman Otomatis Setiap 3.2 Detik
    if (now - lastPageSwitch >= PAGE_DURATION_MS) {
      lastPageSwitch = now;
      currentPage = (currentPage + 1) % 3; // Berputar: Hal 0 -> Hal 1 -> Hal 2 -> Hal 0
      scrollPos = 0;                       // Reset scroll posisi teks berjalan
    }

    // Timer Geser Teks Berjalan (Marquee) untuk Halaman Penanganan Tindakan
    if (currentPage == 2 && (now - lastScrollTime >= SCROLL_SPEED_MS)) {
      lastScrollTime = now;
      scrollPos++;
    }

    // Render Halaman Terpilih ke Layar LCD
    renderLCDPage(lastTemp, lastRh);
  }
}

// ============================================================================
// 6. Penanganan Respon Kontrol dari Server Laptop (Nirkabel Bi-Directional)
// ============================================================================
void handleServerFeedback(String resp) {
  // Parsing ambang batas suhu baru
  int minIdx = resp.indexOf("\"tempMin\":");
  int maxIdx = resp.indexOf("\"tempMax\":");
  if (minIdx > 0 && maxIdx > minIdx) {
    float newMin = resp.substring(minIdx + 10, resp.indexOf(',', minIdx)).toFloat();
    float newMax = resp.substring(maxIdx + 10, resp.indexOf(',', maxIdx)).toFloat();
    if (newMax > newMin) {
      limitMinTemp = newMin;
      limitMaxTemp = newMax;
      warnThreshold = limitMaxTemp - 1.2;
    }
  }

  // Parsing status mute buzzer
  int mutedIdx = resp.indexOf("\"buzzerMuted\":");
  if (mutedIdx > 0) {
    String mutedVal = resp.substring(mutedIdx + 14, mutedIdx + 19);
    buzzerMuted = (mutedVal.startsWith("true"));
    if (buzzerMuted) digitalWrite(BUZZER_PIN, LOW);
  }

  // Parsing perintah antrean
  int cmdIdx = resp.indexOf("\"pendingCmd\":\"");
  if (cmdIdx > 0) {
    int endQuote = resp.indexOf('\"', cmdIdx + 14);
    if (endQuote > cmdIdx) {
      String cmd = resp.substring(cmdIdx + 14, endQuote);
      if (cmd == "ALARM_ON") remoteAlarmActive = true;
      else if (cmd == "ALARM_OFF") remoteAlarmActive = false;
      else if (cmd == "MUTE_BUZZER") { buzzerMuted = true; digitalWrite(BUZZER_PIN, LOW); }
      else if (cmd == "UNMUTE_BUZZER") buzzerMuted = false;
    }
  }
}

// ============================================================================
// 7. Mesin Render Layar LCD Multi-Halaman & Penanganan Anomali
// ============================================================================
void renderLCDPage(float temperature, float humidity) {
  bool isCritical = (temperature > limitMaxTemp || temperature < limitMinTemp || remoteAlarmActive);
  bool isWarning  = (!isCritical && (temperature >= warnThreshold || humidity > 85.0 || humidity < 35.0));

  // --------------------------------------------------------------------------
  // HALAMAN 0: TELEMETRI REAL-TIME & STATUS KEPATUHAN
  // --------------------------------------------------------------------------
  if (currentPage == 0) {
    // Baris 1: "T: 28.5°C H:58.0%"
    String line1 = "T:" + String(temperature, 1) + (char)0 + "C H:" + String(humidity, 1) + "%";
    
    // Baris 2: "Status: AMAN  W1" (W = WiFi Mode, S = Serial Mode)
    String line2 = "Status: ";
    if (isCritical) {
      line2 += "KRITIS !";
    } else if (isWarning) {
      line2 += "WARNING ";
    } else {
      line2 += "AMAN    ";
    }
    line2 += isWiFiConnected ? " [W1]" : " [S1]";

    lcdPrintLine(0, line1);
    lcdPrintLine(1, line2);
  }
  // --------------------------------------------------------------------------
  // HALAMAN 1: ANALISIS DEVIASI (KELEBIHAN / KEKURANGAN SUHU & RH)
  // --------------------------------------------------------------------------
  else if (currentPage == 1) {
    String line1 = "";
    if (temperature > limitMaxTemp) {
      float over = temperature - limitMaxTemp;
      line1 = "Lebih: +" + String(over, 1) + (char)0 + "C !";
    } else if (temperature < limitMinTemp) {
      float under = limitMinTemp - temperature;
      line1 = "Kurang: -" + String(under, 1) + (char)0 + "C!";
    } else {
      line1 = "Suhu Aman/Ideal ";
    }

    String line2 = "Limit: " + String(limitMinTemp, 0) + "-" + String(limitMaxTemp, 0) + (char)0 + "C [2]";

    lcdPrintLine(0, line1);
    lcdPrintLine(1, line2);
  }
  // --------------------------------------------------------------------------
  // HALAMAN 2: PETUNJUK PENANGANAN ANOMALI (TINDAKAN CEPAT / CAPA)
  // --------------------------------------------------------------------------
  else if (currentPage == 2) {
    String header = "";
    String actionMsg = "";

    if (temperature > limitMaxTemp) {
      header = "!TUTUP PINTU CCP!";
      actionMsg = "TUTUP RAPAT PINTU & CEK KOMPRESOR! ";
    } else if (temperature < limitMinTemp) {
      header = "!SUHU DROP BEKU !";
      actionMsg = "PERIKSA PENGATUR DEFROST & TERMOSTAT! ";
    } else if (humidity > 85.0) {
      header = "!KELEMBAPAN TINGGI";
      actionMsg = "NYALAKAN FAN EVAPORATOR & SIRKULASI! ";
    } else if (humidity < 35.0) {
      header = "!UDARA TERLALU KERING";
      actionMsg = "PERIKSA KONDISI RUANGAN PENYIMPANAN! ";
    } else {
      header = "KONDISI TERJAGA ";
      actionMsg = "PENYIMPANAN AMAN & SESUAI STANDAR HACCP ";
    }

    String scrollText = "";
    int msgLen = actionMsg.length();
    for (int i = 0; i < 16; i++) {
      scrollText += actionMsg[(scrollPos + i) % msgLen];
    }

    lcdPrintLine(0, header);
    lcdPrintLine(1, scrollText);
  }
}
