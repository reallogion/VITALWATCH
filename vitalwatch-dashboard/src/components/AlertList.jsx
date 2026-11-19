import React from 'react'
import { api } from '../api'
import { ago, SEVERITY_LABEL } from '../format'
import { useNow } from '../useLive'

const TONE = { critical: 'crit', warning: 'warn', info: 'idle' }

export default function AlertList({ alerts, showAck = true, empty = 'No active alerts.' }) {
  const now = useNow(5000)
  if (!alerts.length) return <p className="empty">{empty}</p>
  return (
    <ul className="alert-list">
      {alerts.map((a) => (
        <li key={a.id} className={`alert tone-${TONE[a.severity]} ${a.acknowledged ? 'acked' : ''} ${a.active ? '' : 'cleared'}`}>
          <span className="alert-bar" aria-hidden="true" />
          <div>
            <div className="alert-title">{a.title}</div>
            <div className="alert-msg">{a.message}</div>
          </div>
          <div className="alert-time">
            <div>{SEVERITY_LABEL[a.severity]}</div>
            <div>{ago(a.createdAt, now)}</div>
            {showAck && a.active && !a.acknowledged && a.severity !== 'info' && (
              <button className="btn small" style={{ marginTop: 6 }} onClick={() => api.ack(a.id)}>Acknowledge</button>
            )}
            {a.acknowledged && a.active && <div className="muted">Acknowledged</div>}
          </div>
        </li>
      ))}
    </ul>
  )
}
