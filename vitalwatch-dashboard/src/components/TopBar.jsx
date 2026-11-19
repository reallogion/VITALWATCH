import React from 'react'
import { useLive, useNow } from '../useLive'
import { linkStatus } from '../link'
import { clock } from '../format'

function Node({ name, s }) {
  return (
    <div className={`node tone-${s.tone}`} title={`${name}: ${s.text}`}>
      <span className="node-dot" aria-hidden="true" />
      <span className="node-name">{name}</span>
      <span className="node-state">{s.text}</span>
    </div>
  )
}

export default function TopBar() {
  const { server, snap } = useLive()
  const now = useNow()
  const { srv, rx, band, step } = linkStatus(server, snap)
  const s = snap?.soldier

  return (
    <header className="topbar">
      <div className="mark">
        <span className="mark-word">VITALWATCH</span>
        {s && <span className="mark-sub">{s.rank} {s.name}, {s.unit}</span>}
      </div>

      <div className="chain" aria-label="Signal path">
        <Node name="Server" s={srv} />
        <span className={`link ${step >= 1 ? 'on' : ''}`} aria-hidden="true" />
        <Node name="Receiver" s={rx} />
        <span className={`link ${step >= 2 && rx.tone === 'ok' ? 'on' : ''}`} aria-hidden="true" />
        <Node name="Band" s={band} />
      </div>

      <div className="clocks">
        <span>IST<b>{clock(now, 'Asia/Kolkata')}</b></span>
        <span>Zulu<b>{clock(now, 'UTC')}</b></span>
      </div>
    </header>
  )
}
