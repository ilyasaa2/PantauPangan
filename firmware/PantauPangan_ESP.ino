/**
 * PantauPangan - Firmware Node ESP8266 (ESP-12E NodeMCU V3)
 * Mata Kuliah: Internet of Things & Sistem Terintegrasi
 *
 * Konfigurasi Perangkat Keras Terbaru:
 * 1. Board & Shield    : NodeMCU ESP-12E V3 + Expansion Baseboard Shield (HW-389)
 * 2. Catu Daya Utama   : Adaptor Eksternal 5V 3A (Jack DC pada Expansion Shield)
 * 3. Display           : LCD 1602 Biru + Adapter Backpack I2C (PCF8574)
 * 4. Sensor Suhu/RH    : DHT11
 * 5. Indikator Visual  : Lampu LED 3 Warna (Hijau = Normal, Kuning = Warning, Merah = Kritis)
 * 6. Indikator Audio   : Buzzer Aktif 5V
 * 7. Komunikasi        : USB Serial UART 115200 Baud ke Web Dashboard PantauPangan
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

// ============================================================================
// 1. Definisi Pin Fisik pada NodeMCU ESP8266 Shield
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
// 2. Inisialisasi Objek & Parameter
// ============================================================================
// Alamat I2C umum: 0x27 (standar PCF8574T) atau 0x3F (PCF8574AT)
LiquidCrystal_I2C lcd(0x27, 16, 2);
DHT dht(DHTPIN, DHTTYPE);

// Interval sampling sensor (2.5 detik optimal untuk respon fisik DHT11)
const unsigned long INTERVAL_MS = 2500;
unsigned long lastReadTime = 0;

// Batas Kritis HACCP Default (Chilled Room: 0.0°C s/d 5.0°C)
float limitMaxTemp = 5.0;
float limitMinTemp = 0.0;
float warnThreshold = 4.2; // Suhu mendekati batas kritis memicu lampu kuning

// Kendali alarm jarak jauh dari AI Dashboard
bool remoteAlarmActive = false;

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
// 3. Setup Hardware
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(500);

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
  Wire.begin(PIN_SDA, PIN_SCL);
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
  delay(200);
  digitalWrite(PIN_LED_GRN, LOW);
  digitalWrite(PIN_LED_YEL, HIGH);
  delay(200);
  digitalWrite(PIN_LED_YEL, LOW);
  digitalWrite(PIN_LED_RED, HIGH);
  delay(200);
  digitalWrite(PIN_LED_RED, LOW);

  // Inisialisasi Sensor DHT11
  dht.begin();
  delay(500);

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(F("Sistem Siap..."));
  lcd.setCursor(0, 1);
  lcd.print(F("Menunggu Sensor "));

  Serial.println(F("{\"status\":\"READY\",\"device\":\"ESP-12E-V3\",\"display\":\"LCD_1602_I2C\",\"msg\":\"Node PantauPangan Online\"}"));
}

// ============================================================================
// 4. Loop Utama
// ============================================================================
void loop() {
  // 1. Memeriksa perintah kendali dari Dashboard Laptop via Web Serial
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();

    if (cmd == "ALARM_ON") {
      remoteAlarmActive = true;
    } else if (cmd == "ALARM_OFF") {
      remoteAlarmActive = false;
    } else if (cmd.startsWith("SET_ZONE:")) {
      // Contoh: SET_ZONE:chilled_room,0.0,5.0
      int firstComma = cmd.indexOf(',');
      int secondComma = cmd.indexOf(',', firstComma + 1);
      if (firstComma > 0 && secondComma > firstComma) {
        limitMinTemp = cmd.substring(firstComma + 1, secondComma).toFloat();
        limitMaxTemp = cmd.substring(secondComma + 1).toFloat();
        warnThreshold = limitMaxTemp - 0.8;
      }
    }
  }

  // 2. Pembacaan Sensor & Pembaruan Display Berkala
  unsigned long currentMillis = millis();
  if (currentMillis - lastReadTime >= INTERVAL_MS) {
    lastReadTime = currentMillis;

    float humidity = dht.readHumidity();
    float temperature = dht.readTemperature(); // Satuan Celcius

    // Penanganan Galat Pembacaan Sensor
    if (isnan(humidity) || isnan(temperature)) {
      Serial.println(F("{\"error\":\"DHT11_READ_FAILED\",\"msg\":\"Gagal membaca sensor DHT11 di Pin D5\"}"));
      
      // Indikator LCD Sensor Error
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print(F("SENSOR DHT ERROR"));
      lcd.setCursor(0, 1);
      lcd.print(F("Periksa Kabel D5"));

      // Nyalakan LED Kuning & Merah berkedip sebagai peringatan hardware
      digitalWrite(PIN_LED_GRN, LOW);
      digitalWrite(PIN_LED_YEL, HIGH);
      digitalWrite(PIN_LED_RED, HIGH);
      return;
    }

    // ========================================================================
    // 3. Evaluasi Kondisi & Kendali Indikator 3 Warna + Buzzer
    // ========================================================================
    // Logika Status Kepatuhan HACCP:
    // a. MERAH (Kritis)  : Suhu melampaui batas (> 5.0°C atau < 0.0°C) atau remote ALARM_ON
    // b. KUNING (Warning): Suhu mendekati ambang batas kritis (>= 4.2°C) atau kelembapan ekstrem
    // c. HIJAU (Normal)  : Suhu & kelembapan dalam rentang ideal dan aman
    
    bool isCritical = (temperature > limitMaxTemp || temperature < limitMinTemp || remoteAlarmActive);
    bool isWarning  = (!isCritical && (temperature >= warnThreshold || humidity > 90.0 || humidity < 75.0));

    String statusText = "NORMAL ";

    if (isCritical) {
      statusText = "KRITIS ";
      digitalWrite(PIN_LED_GRN, LOW);
      digitalWrite(PIN_LED_YEL, LOW);
      digitalWrite(PIN_LED_RED, HIGH);   // LED Merah ON
      digitalWrite(BUZZER_PIN, HIGH);    // Buzzer Aktif berbunyi
    } else if (isWarning) {
      statusText = "WARNING";
      digitalWrite(PIN_LED_GRN, LOW);
      digitalWrite(PIN_LED_YEL, HIGH);   // LED Kuning ON
      digitalWrite(PIN_LED_RED, LOW);
      digitalWrite(BUZZER_PIN, LOW);     // Buzzer OFF saat warning
    } else {
      statusText = "AMAN   ";
      digitalWrite(PIN_LED_GRN, HIGH);   // LED Hijau ON
      digitalWrite(PIN_LED_YEL, LOW);
      digitalWrite(PIN_LED_RED, LOW);
      digitalWrite(BUZZER_PIN, LOW);     // Buzzer OFF
    }

    // ========================================================================
    // 4. Pembaruan Tampilan Layar LCD 1602 I2C
    // ========================================================================
    // Baris 1: "T: 3.5°C  H:84.8%"
    lcd.setCursor(0, 0);
    lcd.print(F("T:"));
    if (temperature >= 0 && temperature < 10.0) lcd.print(F(" "));
    lcd.print(temperature, 1);
    lcd.write(byte(0)); // Simbol derajat Celcius °
    lcd.print(F("C "));
    
    lcd.print(F("H:"));
    lcd.print(humidity, 1);
    lcd.print(F("%"));

    // Baris 2: "Status: NORMAL  " / "Status: WARNING " / "Status: KRITIS  "
    lcd.setCursor(0, 1);
    lcd.print(F("Status: "));
    lcd.print(statusText);

    // ========================================================================
    // 5. Transmisi Data JSON ke Laptop via USB Serial (Web Serial API)
    // ========================================================================
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
  }
}
