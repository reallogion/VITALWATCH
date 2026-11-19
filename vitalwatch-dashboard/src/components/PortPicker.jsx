import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { useLive } from '../useLive'

// Lists USB serial ports. Auto mode finds the ESP32 by itself;
// pick a port here only if auto-detect chooses the wrong one.
export default function PortPicker() {
  const { snap } = useLive()
  const [ports, setPorts] = useState(null)
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const rx = snap?.receiver

  const refresh = () =>
    api.ports().then((p) => { setPorts(p); setErr(null) }).catch((e) => { setPorts([]); setErr(e.message) })

  useEffect(() => { refresh() }, [rx?.status])

  const run = async (fn) => {
    setBusy(true)
    try { await fn() } catch (e) { setErr(e.message) } finally { setBusy(false); refresh() }
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row">
        <label className="field" style={{ flex: '1 1 240px' }}>
          <span>USB port</span>
          <select className="select" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Auto-detect the receiver</option>
            {(ports || []).map((p) => (
              <option key={p.path} value={p.path}>
                {p.path}{p.chip ? `  (${p.chip})` : p.manufacturer ? `  (${p.manufacturer})` : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="row" style={{ alignSelf: 'flex-end' }}>
          <button className="btn primary" disabled={busy} onClick={() => run(() => api.connect(pick || null))}>
            {rx?.status === 'connected' ? 'Reconnect' : 'Connect'}
          </button>
          {rx?.status === 'connected' && (
            <button className="btn" disabled={busy} onClick={() => run(api.disconnect)}>Disconnect</button>
          )}
          <button className="btn" disabled={busy} onClick={refresh}>Refresh list</button>
        </div>
      </div>
      {ports && ports.length === 0 && !err && <p className="hint">No serial ports found on this computer.</p>}
      {err && <p className="hint" style={{ color: 'var(--crit)' }}>{err}</p>}
    </div>
  )
}
