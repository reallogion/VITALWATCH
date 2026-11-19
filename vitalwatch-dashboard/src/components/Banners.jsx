import React, { useEffect, useRef } from 'react'
import { useLive } from '../useLive'
import { api } from '../api'

// Short two-tone beep for new unacknowledged critical alerts
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    ;[0, 0.28].forEach((t, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = i ? 660 : 880
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.24)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + t)
      o.stop(ctx.currentTime + t + 0.25)
    })
  } catch {}
}

export default function Banners({ onOpenSetup }) {
  const { snap } = useLive()
  const seen = useRef(new Set())
  const crit = snap?.alerts.filter((a) => a.active && !a.acknowledged && a.severity === 'critical') || []

  useEffect(() => {
    let fresh = false
    for (const a of crit) if (!seen.current.has(a.id + a.severity)) { seen.current.add(a.id + a.severity); fresh = true }
    if (fresh) beep()
  }, [crit.map((a) => a.id).join()])

  const testMode = snap?.simulator.enabled

  return (
    <>
      {crit.length > 0 && (
        <div className="critical-banner" role="alert">
          <b>{crit[0].title}</b>
          <span>{crit[0].message}{crit.length > 1 ? `, and ${crit.length - 1} more critical` : ''}</span>
          <button className="btn small" onClick={() => crit.forEach((a) => api.ack(a.id))}>Acknowledge</button>
        </div>
      )}
      {testMode && (
        <div className="test-banner">
          <span>Test mode: the band is simulated. No real soldier data is shown.</span>
          <span className="row" style={{ marginLeft: 'auto' }}>
            <button className="btn small" onClick={onOpenSetup}>Change scenario</button>
            <button className="btn small" onClick={() => api.setSimulator({ enabled: false })}>Stop test mode</button>
          </span>
        </div>
      )}
    </>
  )
}
