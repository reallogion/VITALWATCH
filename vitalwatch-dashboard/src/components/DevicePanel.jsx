import React from 'react'
import { useLive, useNow } from '../useLive'
import { ago, fmt } from '../format'

const SENSOR_ROWS = [
  { id: 'max30102', name: 'MAX30102', role: 'Heart rate, SpO2' },
  { id: 'bodytemp', name: 'Body temp probe', role: 'Skin temperature' },
  { id: 'bmp280', name: 'BMP280', role: 'Ambient temp, pressure' },
  { id: 'mpu6050', name: 'MPU-6050', role: 'Motion, fall' },
  { id: 'gps', name: 'GPS', role: 'Position' },
]
const ST = {
  ok: { tone: 'ok', text: 'Working' },
  fault: { tone: 'crit', text: 'Not detected' },
  'no-data': { tone: 'warn', text: 'No reading' },
  'no-fix': { tone: 'warn', text: 'No fix' },
}

function signal(rssi) {
  if (rssi == null) return '--'
  if (rssi > -90) return 'Strong'
  if (rssi > -105) return 'Good'
  if (rssi > -115) return 'Fair'
  return 'Weak'
}

export default function DevicePanel() {
  const { snap } = useLive()
  const now = useNow()
  const b = snap?.band
  const r = snap?.latest
  const fill = snap?.settings.fillFailedSensors
  const lossPct = b?.packets ? Math.round((b.missed / (b.packets + b.missed)) * 100) : 0

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">Band and link</h2>
        <span className="panel-meta">{r?.encrypted ? 'AES-128 encrypted' : r ? 'Not encrypted' : ''}</span>
      </div>
      <div className="panel-body stack" style={{ gap: 14 }}>
        <dl className="kv">
          <dt>Last packet</dt><dd>{ago(b?.lastPacketAt, now)}</dd>
          <dt>Battery</dt><dd>{fmt(b?.battery)} %</dd>
          <dt>LoRa signal</dt><dd>{signal(b?.rssi)}, {fmt(b?.rssi)} dBm, SNR {fmt(b?.snr, 1)}</dd>
          <dt>Packets received</dt><dd>{b?.packets ?? 0}{b?.missed ? `, ${b.missed} lost (${lossPct}%)` : ''}</dd>
        </dl>
        <ul className="sensors" aria-label="Sensor health">
          {SENSOR_ROWS.map((s) => {
            const st = ST[r?.sensors?.[s.id]] || { tone: 'idle', text: '--' }
            const estimated = r && st.tone !== 'ok' && fill
            return (
              <li key={s.id} className={`tone-${st.tone}`}>
                <span className="node-dot" aria-hidden="true" />
                <span>{s.name}<span className="role">{s.role}</span></span>
                <span className="st">{st.text}{estimated && <span className="sim-tag">SIM</span>}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
