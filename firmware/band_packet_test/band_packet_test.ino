/*
  VitalWatch BAND - packet test (no sensors needed)

  Flash this to the band ESP32 + RA-02 to test the full radio path
  before the sensor circuit is ready. It sends a fixed encrypted
  packet every 5 s with sensor mask 0, so the backend treats every
  sensor as "not detected" and (with FILL_FAILED_SENSORS=true) shows
  estimates tagged SIM. When a sensor is wired, put its real value in
  and set its bit in the mask. That is the only part that changes.

  Payload CSV (14 fields), see PROTOCOL.md:
  id,seq,hr,spo2,bodyTemp,ambTemp,pressure,activity,fall,lat,lng,sats,battery,sensorMask
  Empty field = no reading.

  Library: "LoRa" by Sandeep Mistry. AES comes with the ESP32 core (mbedtls).
  Same RA-02 wiring as the receiver.
*/
#include <SPI.h>
#include <LoRa.h>
#include "mbedtls/aes.h"
#include "esp_random.h"

#define PIN_NSS 5
#define PIN_RST 14
#define PIN_DIO0 2
#define LORA_FREQ 433E6
#define LORA_SF 9
#define LORA_BW 125E3
#define LORA_SYNC 0x12

// Must equal AES_KEY in vitalwatch-backend/.env (exactly 16 characters)
const char AES_KEY[17] = "VitalWatch12345!";

// Sensor mask bits
#define BIT_MAX30102 (1 << 0)
#define BIT_BODYTEMP (1 << 1)
#define BIT_BMP280   (1 << 2)
#define BIT_MPU6050  (1 << 3)
#define BIT_GPS      (1 << 4)

uint32_t seq = 0;

// AES-128-CBC, PKCS7 padding, random IV. out = IV(16) + ciphertext. Returns length.
int encryptPacket(const char *text, uint8_t *out) {
  size_t len = strlen(text);
  size_t padded = (len / 16 + 1) * 16;
  uint8_t in[240];
  if (padded > sizeof(in)) return 0;
  memcpy(in, text, len);
  uint8_t pad = padded - len;
  for (size_t i = len; i < padded; i++) in[i] = pad;

  uint8_t iv[16];
  for (int i = 0; i < 16; i += 4) {
    uint32_t r = esp_random();
    memcpy(iv + i, &r, 4);
  }
  memcpy(out, iv, 16);  // receiver needs the IV in front

  mbedtls_aes_context ctx;
  mbedtls_aes_init(&ctx);
  mbedtls_aes_setkey_enc(&ctx, (const uint8_t *)AES_KEY, 128);
  mbedtls_aes_crypt_cbc(&ctx, MBEDTLS_AES_ENCRYPT, padded, iv, in, out + 16);  // iv is modified, copy kept above
  mbedtls_aes_free(&ctx);
  return 16 + padded;
}

void setup() {
  Serial.begin(115200);
  LoRa.setPins(PIN_NSS, PIN_RST, PIN_DIO0);
  while (!LoRa.begin(LORA_FREQ)) {
    Serial.println("RA-02 not found");
    delay(2000);
  }
  LoRa.setSpreadingFactor(LORA_SF);
  LoRa.setSignalBandwidth(LORA_BW);
  LoRa.setSyncWord(LORA_SYNC);
  LoRa.enableCrc();
  LoRa.setTxPower(17);
  Serial.println("Band packet test ready");
}

void loop() {
  // ── Replace these with real sensor reads later ──
  int mask = 0;               // no sensors yet
  String hr = "", spo2 = "", bodyTemp = "", ambTemp = "", pressure = "";
  int activity = 1, fall = 0, sats = 0;
  String lat = "", lng = "";
  int battery = 90;
  // ────────────────────────────────────────────────

  char csv[200];
  snprintf(csv, sizeof(csv), "S001,%lu,%s,%s,%s,%s,%s,%d,%d,%s,%s,%d,%d,%d",
           (unsigned long)seq++, hr.c_str(), spo2.c_str(), bodyTemp.c_str(), ambTemp.c_str(), pressure.c_str(),
           activity, fall, lat.c_str(), lng.c_str(), sats, battery, mask);

  uint8_t pkt[256];
  int n = encryptPacket(csv, pkt);
  LoRa.beginPacket();
  LoRa.write(pkt, n);
  LoRa.endPacket();

  Serial.print("Sent: ");
  Serial.println(csv);
  delay(5000);
}
