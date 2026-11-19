/*
  VitalWatch RECEIVER (base camp)
  ESP32 DevKit V1 + RA-02 (SX1278, 433 MHz), connected to the laptop by USB.

  It is a simple relay: it does NOT decrypt. Every LoRa packet is
  printed to USB as hex, and the backend decrypts it.

  Prints (115200 baud):
    $HB,<uptimeSec>,<packetsReceived>        every 2 s (tells the dashboard the receiver is alive)
    $VWE,<hex IV+ciphertext>,<rssi>,<snr>    for every encrypted band packet
    $VW,<plain csv>,<rssi>,<snr>             for unencrypted test packets
    # ...                                    debug text (shown in the dashboard serial console)

  Library: "LoRa" by Sandeep Mistry (Arduino Library Manager)

  Wiring RA-02 -> ESP32
    3.3V -> 3V3      GND  -> GND
    SCK  -> GPIO 18  MISO -> GPIO 19   MOSI -> GPIO 23
    NSS  -> GPIO 5   RST  -> GPIO 14   DIO0 -> GPIO 2
  Always fit the antenna before powering the RA-02.
*/
#include <SPI.h>
#include <LoRa.h>

#define PIN_NSS 5
#define PIN_RST 14
#define PIN_DIO0 2

// Must match the band exactly
#define LORA_FREQ 433E6
#define LORA_SF 9
#define LORA_BW 125E3
#define LORA_SYNC 0x12

unsigned long lastHb = 0;
unsigned long packets = 0;

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("# VitalWatch receiver starting");

  LoRa.setPins(PIN_NSS, PIN_RST, PIN_DIO0);
  while (!LoRa.begin(LORA_FREQ)) {
    Serial.println("# ERROR: RA-02 not found. Check wiring (NSS 5, RST 14, DIO0 2) and 3.3V.");
    delay(2000);
  }
  LoRa.setSpreadingFactor(LORA_SF);
  LoRa.setSignalBandwidth(LORA_BW);
  LoRa.setSyncWord(LORA_SYNC);
  LoRa.enableCrc();
  Serial.println("# LoRa ready: 433 MHz, SF9, BW125, sync 0x12");
}

void loop() {
  int size = LoRa.parsePacket();
  if (size > 0) {
    packets++;
    uint8_t buf[256];
    int n = 0;
    while (LoRa.available() && n < (int)sizeof(buf)) buf[n++] = LoRa.read();
    int rssi = LoRa.packetRssi();
    float snr = LoRa.packetSnr();

    if (n > 0 && buf[0] == 'P') {
      // Plain-text test packet: "P" + csv
      Serial.print("$VW,");
      for (int i = 1; i < n; i++) Serial.write(buf[i]);
    } else {
      // Encrypted packet: 16-byte IV + ciphertext, printed as hex
      Serial.print("$VWE,");
      for (int i = 0; i < n; i++) {
        if (buf[i] < 16) Serial.print('0');
        Serial.print(buf[i], HEX);
      }
    }
    Serial.print(',');
    Serial.print(rssi);
    Serial.print(',');
    Serial.println(snr, 1);
  }

  if (millis() - lastHb >= 2000) {
    lastHb = millis();
    Serial.print("$HB,");
    Serial.print(millis() / 1000);
    Serial.print(',');
    Serial.println(packets);
  }
}
