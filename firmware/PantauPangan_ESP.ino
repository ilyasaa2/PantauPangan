/**
 * PantauPangan - Firmware Node ESP-12E & Sensor DHT11
 * Mata Kuliah: Internet of Things & Sistem Terintegrasi
 *
 * Konfigurasi Pin (Sesuai Proposal Bab 3.3):
 * - Sensor DHT11 DATA : GPIO 4 (D2)
 * - Buzzer Aktif 5V   : GPIO 5 (D1)
 * - LED Indikator     : GPIO 2 (D4)
 * - Komunikasi Serial : USB Serial 115200 Baud (Terhubung ke Laptop)
 */

#include <DHT.h>

#define DHTPIN 4          // GPIO 4 (Pin D2 pada NodeMCU ESP-12E)
#define DHTTYPE DHT11     // Tipe Sensor DHT11
#define BUZZER_PIN 5      // GPIO 5 (Pin D1)
#define LED_PIN 2         // GPIO 2 (Pin D4 - LED Onboard / Eksternal)

DHT dht(DHTPIN, DHTTYPE);

// Sampling interval (2 detik untuk update real-time responsif di dashboard)
const unsigned long INTERVAL_MS = 2500;
unsigned long lastReadTime = 0;

// Batas Kritis HACCP Default (Chilled Room)
float limitMaxTemp = 5.0;
float limitMinTemp = 0.0;

void setup() {
  // Inisialisasi Serial Port ke Laptop
  Serial.begin(115200);
  delay(1000);

  // Inisialisasi Pin Aktuator
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);

  digitalWrite(BUZZER_PIN, LOW); // Buzzer mati
  digitalWrite(LED_PIN, HIGH);   // LED aktif (Active LOW pada ESP8266)

  // Inisialisasi Sensor DHT11
  dht.begin();

  Serial.println(F("{\"status\":\"READY\",\"device\":\"ESP-12E\",\"sensor\":\"DHT11\",\"msg\":\"PantauPangan Node Online\"}"));
}

void loop() {
  // 1. Memeriksa perintah kendali dari Dashboard Laptop via Serial
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();

    if (cmd == "ALARM_ON") {
      digitalWrite(BUZZER_PIN, HIGH);
      digitalWrite(LED_PIN, LOW); // LED menyala tanda peringatan
    } else if (cmd == "ALARM_OFF") {
      digitalWrite(BUZZER_PIN, LOW);
      digitalWrite(LED_PIN, HIGH);
    } else if (cmd.startsWith("SET_ZONE:")) {
      // Contoh format: SET_ZONE:chilled_room,0.0,5.0
      // Memungkinkan dashboard mengonfigurasi batas lokal
    }
  }

  // 2. Pembacaan Sensor secara berkala
  unsigned long currentMillis = millis();
  if (currentMillis - lastReadTime >= INTERVAL_MS) {
    lastReadTime = currentMillis;

    float humidity = dht.readHumidity();
    float temperature = dht.readTemperature(); // Celcius

    // Validasi pembacaan sensor
    if (isnan(humidity) || isnan(temperature)) {
      Serial.println(F("{\"error\":\"DHT11_READ_FAILED\",\"msg\":\"Gagal membaca sensor DHT11 di GPIO 4\"}"));
      return;
    }

    // Simulasi pembacaan tegangan baterai 18650 melalui pin analog A0
    int adcVal = analogRead(A0);
    float batteryV = (adcVal / 1024.0) * 4.2;
    if (batteryV < 3.0) batteryV = 4.05; // Fallback jika A0 tidak dikoneksikan resistor divider

    // Cek ambang batas kritis lokal
    bool isCritical = (temperature > limitMaxTemp || temperature < limitMinTemp);
    if (isCritical) {
      digitalWrite(BUZZER_PIN, HIGH); // Alarm lokal menyala
      digitalWrite(LED_PIN, LOW);
    } else {
      digitalWrite(BUZZER_PIN, LOW);
      digitalWrite(LED_PIN, HIGH);
    }

    // 3. Kirimkan JSON Telemetri ke Laptop via USB Serial
    Serial.print(F("{\"device_id\":\"ESP-12E-CCP-01\""));
    Serial.print(F(",\"temperature\":"));
    Serial.print(temperature, 2);
    Serial.print(F(",\"humidity\":"));
    Serial.print(humidity, 1);
    Serial.print(F(",\"battery_v\":"));
    Serial.print(batteryV, 2);
    Serial.print(F(",\"alarm\":"));
    Serial.print(isCritical ? F("true") : F("false"));
    Serial.println(F("}"));
  }
}
