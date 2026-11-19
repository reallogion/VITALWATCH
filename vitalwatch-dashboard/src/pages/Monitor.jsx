import React, { useMemo } from 'react'
import { useLive, useNow } from '../useLive'
import { ago, fmt, statusTone, ACTIVITY } from '../format'
import StandbyGuide from '../components/StandbyGuide'
import VitalTile from '../components/VitalTile'
import Assessment from '../components/Assessment'
import AlertList from '../components/AlertList'
import MapPanel from '../components/MapPanel'
import DevicePanel from '../components/DevicePanel'
import BodyFigure from '../components/BodyFigure'

const ALT = (p) => (p ? Math.round(44330 * (1 - Math.pow(p / 1013.25, 1 / 5.255))) : null)
const SEV = { critical: 'crit', warning: 'warn' }

// Tone of a tile = worst active alert that belongs to it
function toneFor(alerts, keys) {
  let t = 'ok'
  for (const a of alerts) {
    if (!a.active || !keys.includes(a.key)) continue
    if (a.severity === 'critical') return 'crit'
    if (a.severity === 'warning') t = 'warn'
  }
  return t
}

function series(history, field, map = (v) => v) {
  return history.slice(-72).filter((r) => r[field] != null).map((r) => ({ t: r.timestamp, v: map(r[field]), sim: r.simulated?.includes(field) }))
}

const STATUS_TEXT = {
  NOMINAL: 'All vitals within limits',
  CAUTION: 'Needs attention',
  CRITICAL: 'Immediate response needed',
  'NO SIGNAL': 'Band has stopped sending. Last known data shown.',
  STANDBY: 'Waiting for data',
}

export default function Monitor() {
  const { snap, history } = useLive()
  const now = useNow()
  const r = snap?.latest
  const d = snap?.derived

  const sparks = useMemo(
    () => ({
      hr: series(history, 'heartRate'),
      spo2: series(history, 'spo2'),
      temp: series(history, 'bodyTemp'),
      act: series(history, 'activity'),
      amb: series(history, 'ambientTemp'),
      alt: series(history, 'pressure', ALT),
    }),
    [history]
  )

  if (!r) return <StandbyGuide />

  const alerts = snap.alerts
  const active = alerts.filter((a) => a.active)
  const status = d?.status || 'STANDBY'
  const reason = active.find((a) => a.severity === 'critical' && a.category !== 'device') || active.find((a) => a.severity === 'warning' && a.category !== 'device')
  const sim = (f) => r.simulated.includes(f)
  const trend = (t) => (t ? `${t.change > 0 ? '+' : ''}${t.change} in 2 min` : 'Collecting trend')
  const sp = d?.trends?.spo2?.m2

  const order = { critical: 0, warning: 1, info: 2 }
  const sorted = [...active].sort((a, b) => order[a.severity] - order[b.severity] || b.createdAt - a.createdAt)

  return (
    <div className="grid-monitor">
      <section className={`panel status area-status tone-${statusTone(status)}`} aria-live="polite">
        <div className="status-word">{status === 'NOMINAL' ? 'Nominal' : status === 'CAUTION' ? 'Caution' : status === 'CRITICAL' ? 'Critical' : status === 'NO SIGNAL' ? 'No signal' : 'Standby'}</div>
        <div>
          <div className="status-who">{snap.soldier.rank} {snap.soldier.name}</div>
          <div className="status-reason">{reason ? `${reason.title}: ${reason.message}` : STATUS_TEXT[status]}</div>
        </div>
        <div className="status-facts">
          <div className="fact"><div className="fact-k">Strain index</div><div className="fact-v">{fmt(d?.psi, 1)} <span className="muted">/ 10</span></div></div>
          <div className="fact"><div className="fact-k">Altitude</div><div className="fact-v">{fmt(d?.altitude)} m</div></div>
          <div className="fact"><div className="fact-k">Last packet</div><div className="fact-v">{ago(snap.band.lastPacketAt, now)}</div></div>
        </div>
      </section>

      <div className="area-vitals vitals-row">
        <section className="panel figure-panel" aria-label="Live soldier figure">
          <BodyFigure
            activity={r.activity}
            fallen={active.some((a) => a.key === 'man_down' || a.key === 'fall')}
            hr={r.heartRate}
            hrTone={toneFor(alerts, ['hr_high', 'hr_low', 'hr_rising'])}
            statusTone={statusTone(status)}
            packetAt={snap.band.lastPacketAt}
            sim={snap.band.source === 'simulator'}
          />
          <div className="figure-caption">
            {active.some((a) => a.key === 'man_down' || a.key === 'fall') ? 'Down' : ACTIVITY[r.activity] ?? 'Unknown'}
            <span className="muted">{r.heartRate ? `, heart ${fmt(r.heartRate)} bpm` : ''}</span>
          </div>
        </section>
        <div className="vitals">
        <VitalTile label="Heart rate" source="MAX30102" value={fmt(r.heartRate)} unit="bpm" sim={sim('heartRate')}
          tone={toneFor(alerts, ['hr_high', 'hr_low', 'hr_rising'])}
          note={`Resting ${fmt(d?.hrBaseline)} bpm, ${fmt(d?.hrMaxPct)}% of max`} spark={sparks.hr} span={20} />
        <VitalTile label="Blood oxygen" source="MAX30102" value={fmt(r.spo2)} unit="% SpO2" sim={sim('spo2')}
          tone={toneFor(alerts, ['spo2_low', 'spo2_falling'])}
          note={sp ? trend(sp) : d?.altitude > 1500 ? `Limit adjusted for ${d.altitude} m` : 'Collecting trend'} spark={sparks.spo2} span={6} />
        <VitalTile label="Body temperature" source="Arm probe" value={fmt(r.bodyTemp, 1)} unit="°C" sim={sim('bodyTemp')}
          tone={toneFor(alerts, ['temp_high', 'temp_low'])}
          note={`Session start ${fmt(d?.tempBaseline, 1)} °C`} spark={sparks.temp} span={1} />
        <VitalTile label="Movement" source="MPU-6050" value={r.fall ? 'Fall' : ACTIVITY[r.activity] ?? '--'} sim={sim('activity')}
          tone={toneFor(alerts, ['man_down', 'fall', 'stationary'])}
          note={r.activity === 0 ? `Still for ${fmt(d?.stationaryMin, 1)} min` : d?.speedKmh != null ? `${fmt(d.speedKmh, 1)} km/h` : ''} spark={sparks.act} span={2} />
        <VitalTile label="Air temperature" source="BMP280" value={fmt(r.ambientTemp, 1)} unit="°C" sim={sim('ambientTemp')}
          tone={toneFor(alerts, ['env_hot', 'env_cold']) === 'ok' ? 'ok' : 'warn'}
          note="Around the soldier" spark={sparks.amb} span={4} />
        <VitalTile label="Altitude" source="BMP280" value={fmt(d?.altitude)} unit="m" sim={sim('pressure')}
          tone={toneFor(alerts, ['alt_rapid'])}
          note={`${fmt(r.pressure, 1)} hPa${d?.altitudeChange1m ? `, ${d.altitudeChange1m > 0 ? '+' : ''}${d.altitudeChange1m} m/min` : ''}`} spark={sparks.alt} span={40} />
        </div>
      </div>

      <div className="area-side">
        <Assessment />
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Active alerts</h2>
            <span className="panel-meta">{sorted.length}</span>
          </div>
          <AlertList alerts={sorted} />
        </section>
      </div>

      <div className="area-map">
        <MapPanel />
        <DevicePanel />
      </div>
    </div>
  )
}
