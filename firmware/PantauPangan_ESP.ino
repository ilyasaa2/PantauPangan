/**
 * PantauPangan - Firmware Node ESP-12E / ESP32 & Sensor DHT11
 * Mata Kuliah: Internet of Things & Sistem Terintegrasi
 *
 * Konfigurasi Pin Fisik:
 * - ESP8266 (NodeMCU ESP-12E):
 *     DHT11 DATA : GPIO 4 (Pin D2)
 *     Buzzer 5V  : GPIO 5 (Pin D1)
 *     LED Indikator: GPIO 2 (Pin D4 / LED Built-in)
 *     ADC Baterai: Pin A0
 *
 * - ESP32 (DevKit v1):
 *     DHT11 DATA : GPIO 4
 *     Buzzer 5V  : GPIO 5
 *     LED Indikator: GPIO 2 (Built-in Blue LED)
 *     ADC Baterai: GPIO 34 (ADC1_CH6)
 *
 * Komunikasi: USB Serial UART 115200 Baud (Terhubung ke Dashboard Web Serial)
 */

#include <DHT.h>

#if defined(ESP8266)
  #define DHTPIN 4          // GPIO 4 (D2 pada NodeMCU ESP8266)
  #define BUZZER_PIN 5      // GPIO 5 (D1)
  #define LED_PIN 2         // GPIO 2 (D4 - Active LOW pada ESP8266)
  #define BATTERY_PIN A0
  #define LED_ACTIVE LOW
  #define LED_INACTIVE HIGH
#elif defined(ESP32)
  #define DHTPIN 4          // GPIO 4 pada ESP32
  #define BUZZER_PIN 5      // GPIO 5
  #define LED_PIN 2         // GPIO 2 (Built-in LED Active HIGH pada ESP32)
  #define BATTERY_PIN 34
  #define LED_ACTIVE HIGH
  #define LED_INACTIVE LOW
#else
  #define DHTPIN 4
  #define BUZZER_PIN 5
  #define LED_PIN 2
  #define BATTERY_PIN A0
  #define LED_ACTIVE HIGH
  #define LED_INACTIVE LOW
#endif

#define DHTTYPE DHT11     // Tipe Sensor DHT11

DHT dht(DHTPIN, DHTTYPE);

// Sampling interval (2.5 detik optimal untuk karakter fisik sensor DHT11)
const unsigned long INTERVAL_MS = 2500;
unsigned long lastReadTime = 0;

// Batas Kritis HACCP Default (Chilled Room 0.0°C s/d 5.0°C)
float limitMaxTemp = 5.0;
float limitMinTemp = 0.0;

// Status alarm kendali jarak jauh dari AI Dashboard
bool remoteAlarmActive = false;

void setup() {
  // Inisialisasi Serial Port ke Laptop (Baudrate 115200 bps)
  Serial.begin(115200);
  delay(1000);

  // Inisialisasi Pin Aktuator
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);

  digitalWrite(BUZZER_PIN, LOW);          // Buzzer awal mati
  digitalWrite(LED_PIN, LED_INACTIVE);    // LED awal standby

  // Inisialisasi Sensor DHT11
  dht.begin();

  Serial.println(F("{\"status\":\"READY\",\"device\":\"ESP-ColdChain\",\"sensor\":\"DHT11\",\"msg\":\"PantauPangan Firmware Online\"}"));
}

void loop() {
  // 1. Memeriksa perintah kendali dari Dashboard Laptop via Serial
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();

    if (cmd == "ALARM_ON") {
      remoteAlarmActive = true;
      digitalWrite(BUZZER_PIN, HIGH);
      digitalWrite(LED_PIN, LED_ACTIVE);
    } else if (cmd == "ALARM_OFF") {
      remoteAlarmActive = false;
      digitalWrite(BUZZER_PIN, LOW);
      digitalWrite(LED_PIN, LED_INACTIVE);
    } else if (cmd.startsWith("SET_ZONE:")) {
      // Format kendali: SET_ZONE:nama_ruang,min_temp,max_temp
      int firstComma = cmd.indexOf(',');
      int secondComma = cmd.indexOf(',', firstComma + 1);
      if (firstComma > 0 && secondComma > firstComma) {
        limitMinTemp = cmd.substring(firstComma + 1, secondComma).toFloat();
        limitMaxTemp = cmd.substring(secondComma + 1).toFloat();
      }
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

    // Pembacaan tegangan baterai 18650 melalui pin analog
    float batteryV = 4.05;
    #if defined(ESP8266) || defined(ESP32)
      int adcVal = analogRead(BATTERY_PIN);
      batteryV = (adcVal / 1024.0) * 4.2;
      if (batteryV < 3.0 || batteryV > 4.35) batteryV = 4.08; // Fallback toleransi
    #endif

    // Cek ambang batas kritis lokal atau alarm dari AI Dashboard
    bool isLocalCritical = (temperature > limitMaxTemp || temperature < limitMinTemp);
    bool shouldTriggerAlarm = isLocalCritical || remoteAlarmActive;

    if (shouldTriggerAlarm) {
      digitalWrite(BUZZER_PIN, HIGH);      // Buzzer berbunyi
      digitalWrite(LED_PIN, LED_ACTIVE);   // LED merah/indikator menyala
    } else {
      digitalWrite(BUZZER_PIN, LOW);
      digitalWrite(LED_PIN, LED_INACTIVE);
    }

    // 3. Kirimkan JSON Telemetri terstandarisasi ke Laptop via USB Serial
    Serial.print(F("{\"device_id\":\"ESP-12E-CCP-01\""));
    Serial.print(F(",\"temperature\":"));
    Serial.print(temperature, 1);
    Serial.print(F(",\"humidity\":"));
    Serial.print(humidity, 1);
    Serial.print(F(",\"battery_v\":"));
    Serial.print(batteryV, 2);
    Serial.print(F(",\"alarm\":"));
    Serial.print(shouldTriggerAlarm ? F("true") : F("false"));
    Serial.println(F("}"));
  }
}
