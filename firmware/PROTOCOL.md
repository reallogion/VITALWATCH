# VitalWatch packet protocol (v2)

```
Band ESP32 ──LoRa 433 MHz──▶ Receiver ESP32 ──USB 115200──▶ Backend ──▶ Dashboard
  encrypts                     relays as hex                 decrypts
```

## 1. Band payload (inside the encryption)

One CSV line, 14 fields, sent every 5 s:

```
id,seq,hr,spo2,bodyTemp,ambTemp,pressure,activity,fall,lat,lng,sats,battery,sensorMask
S001,42,84,96,36.7,18.4,654.2,1,0,34.152600,77.577100,8,81,31
```

| # | Field | Sensor | Unit / values |
|---|---|---|---|
| 1 | id | | band ID, e.g. `S001` |
| 2 | seq | | counter +1 per packet (used to measure packet loss) |
| 3 | hr | MAX30102 | bpm |
| 4 | spo2 | MAX30102 | % |
| 5 | bodyTemp | body temp probe | °C (arm skin) |
| 6 | ambTemp | BMP280 | °C |
| 7 | pressure | BMP280 | hPa (backend calculates altitude) |
| 8 | activity | MPU-6050 | 0 still, 1 walking, 2 running |
| 9 | fall | MPU-6050 | 1 on the packet right after an impact, else 0 |
| 10 | lat | GPS | decimal degrees, empty if no fix |
| 11 | lng | GPS | decimal degrees, empty if no fix |
| 12 | sats | GPS | satellites in use |
| 13 | battery | ADC pin | % |
| 14 | sensorMask | | bit set = sensor detected on start-up |

The BMP280 has **no humidity**. There is no humidity field.

**No reading:** leave the field empty (`,,`). `-1` and `nan` also count as empty.

**sensorMask bits:** bit0 MAX30102 (1), bit1 body temp (2), bit2 BMP280 (4), bit3 MPU-6050 (8), bit4 GPS module (16). All sensors present = 31.

## 2. Encryption (band side)

AES-128-CBC, PKCS7 padding, **new random 16-byte IV for every packet**.
LoRa packet bytes = `IV (16) + ciphertext`. The key must equal `AES_KEY` in the backend `.env`.
Working code: `band_packet_test/band_packet_test.ino`, function `encryptPacket()`.

## 3. Receiver → USB lines

| Line | Meaning |
|---|---|
| `$HB,<uptimeSec>,<rxCount>` | heartbeat every 2 s |
| `$VWE,<hex>,<rssi>,<snr>` | encrypted band packet |
| `$VW,<csv>,<rssi>,<snr>` | plain packet (testing only; band sends `P` + csv) |
| anything else | debug text, shown in the dashboard serial console |

## 4. Radio settings (band and receiver must match)

433 MHz, SF9, BW 125 kHz, sync word `0x12`, CRC on.

## 5. When a sensor fails

The band still sends the packet, with that field empty and its mask bit cleared.
The backend shows an estimate tagged **SIM** while `FILL_FAILED_SENSORS=true`.
After you fit the new part, its real value is used automatically. No code change is needed.
