import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { useLive } from '../useLive'
import { SEVERITY_LABEL, dtg } from '../format'

const TONE = { critical: 'crit', warning: 'warn', info: 'idle' }
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'critical', label: 'Critical' },
  { id: 'warning', label: 'Caution' },
  { id: 'ai', label: 'From AI' },
  { id: 'device', label: 'Device and link' },
]

export default function AlertsPage() {
  const { snap } = useLive()
  const [log, setLog] = useState([])
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    api.alerts().then(setLog).catch(() => {})
  }, [snap?.alerts.length, snap?.alerts.filter((a) => a.active).length])

  // live list wins for alerts the server still holds
  const live = new Map((snap?.alerts || []).map((a) => [a.id, a]))
  const rows = log.map((a) => live.get(a.id) || a).filter((a) =>
    filter === 'all' ? true : filter === 'ai' ? a.category === 'ai' : filter === 'device' ? ['device', 'link'].includes(a.category) : a.severity === filter
  )
  const unacked = (snap?.alerts || []).filter((a) => a.active && !a.acknowledged && a.severity !== 'info').length

  return (
    <section className="panel">
      <div className="panel-head">
        <div className="row" role="group" aria-label="Filter">
          {FILTERS.map((f) => (
            <button key={f.id} className={`btn small ${filter === f.id ? 'primary' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
        <button className="btn small" disabled={!unacked} onClick={() => api.ackAll()}>Acknowledge all ({unacked})</button>
      </div>
      {rows.length === 0 ? (
        <p className="empty">No alerts recorded{filter !== 'all' ? ' for this filter' : ''}.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr><th>Raised</th><th>Severity</th><th>Alert</th><th>Detail</th><th>State</th></tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td style={{ whiteSpace: 'nowrap', fontFamily: 'var(--f-cond)' }}>{dtg(a.createdAt)}</td>
                  <td><span className={`sev tone-${TONE[a.severity]}`}>{SEVERITY_LABEL[a.severity]}</span></td>
                  <td style={{ fontWeight: 600 }}>{a.title}</td>
                  <td className="hint">{a.message}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {a.active ? (a.acknowledged ? 'Acknowledged' : 'Active') : `Cleared ${a.clearedAt ? dtg(a.clearedAt) : ''}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
