import React, { useMemo, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'
import { useLive } from '../useLive'
import { timeShort } from '../format'
import { api } from '../api'

const ALT = (p) => (p ? Math.round(44330 * (1 - Math.pow(p / 1013.25, 1 / 5.255))) : null)
const RANGES = [15, 30, 60, 120]

const CHARTS = [
  { key: 'heartRate', title: 'Heart rate', unit: 'bpm', refs: [{ y: 150, c: 'var(--warn)' }, { y: 180, c: 'var(--crit)' }] },
  { key: 'spo2', title: 'Blood oxygen', unit: '%', refs: [], domain: [75, 100] }, // limit depends on altitude, so no fixed line
  { key: 'bodyTemp', title: 'Body temperature', unit: '°C', refs: [{ y: 38.5, c: 'var(--warn)' }, { y: 39.5, c: 'var(--crit)' }], domain: [35, 40.5] },
  { key: 'altitude', title: 'Altitude', unit: 'm', refs: [] },
]

function TipBox({ active, payload, unit }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="panel" style={{ padding: '6px 10px', fontSize: 13 }}>
      <div className="muted">{timeShort(p.t)}</div>
      <div style={{ fontFamily: 'var(--f-cond)', fontSize: 17, fontWeight: 600 }}>
        {payload[0].value} {unit} {p.sim && <span className="sim-tag">SIM</span>}
      </div>
    </div>
  )
}

export default function Trends() {
  const { history } = useLive()
  const [mins, setMins] = useState(30)

  const data = useMemo(() => {
    const cut = Date.now() - mins * 60000
    return history.filter((r) => r.timestamp >= cut)
  }, [history, mins])

  const rows = (key) =>
    data.map((r) => {
      const v = key === 'altitude' ? ALT(r.pressure) : r[key]
      const f = key === 'altitude' ? 'pressure' : key
      const sim = r.simulated?.includes(f)
      return { t: r.timestamp, real: sim ? null : v, est: sim ? v : null, sim, value: v }
    })

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row" role="group" aria-label="Time range">
          {RANGES.map((m) => (
            <button key={m} className={`btn small ${m === mins ? 'primary' : ''}`} onClick={() => setMins(m)}>
              {m < 60 ? `${m} min` : `${m / 60} h`}
            </button>
          ))}
        </div>
        <a className="btn small" href={api.csvUrl} download>Download CSV</a>
      </div>

      {data.length < 2 ? (
        <section className="panel"><p className="empty">No readings in this time range yet. Charts fill in as the band sends data.</p></section>
      ) : (
        <div className="charts">
          {CHARTS.map((c) => {
            const d = rows(c.key)
            return (
              <section className="panel" key={c.key}>
                <div className="panel-head">
                  <h2 className="panel-title">{c.title}</h2>
                  <span className="panel-meta">{c.unit}{d.some((x) => x.sim) ? ', dashed = estimated' : ''}</span>
                </div>
                <div className="chart-box">
                  <ResponsiveContainer>
                    <LineChart data={d} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#3a402d" vertical={false} />
                      <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t) => timeShort(t).slice(0, 5)} stroke="#7b8166" tick={{ fontSize: 12 }} />
                      <YAxis domain={c.domain || ['auto', 'auto']} stroke="#7b8166" tick={{ fontSize: 12 }} width={44} />
                      <Tooltip content={<TipBox unit={c.unit} />} />
                      {c.refs.map((r) => <ReferenceLine key={r.y} y={r.y} stroke={r.c} strokeDasharray="3 4" />)}
                      <Line dataKey="real" stroke="#e7e2cd" strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls={false} />
                      <Line dataKey="est" stroke="#8fb3cc" strokeWidth={1.6} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
