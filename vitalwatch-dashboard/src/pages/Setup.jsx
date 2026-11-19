import React, { useEffect, useRef, useState } from 'react'
import { useLive, useNow } from '../useLive'
import { api } from '../api'
import { ago, timeShort } from '../format'
import PortPicker from '../components/PortPicker'

function ReceiverPanel() {
  const { snap, log } = useLive()
  const now = useNow()
  const rx = snap?.receiver
  const box = useRef(null)

  useEffect(() => {
    const el = box.current
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 60) el.scrollTop = el.scrollHeight
  }, [log.length])

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">Receiver (USB)</h2>
        <span className="panel-meta">{rx?.mode === 'auto' ? 'Auto-detect' : 'Manual port'}</span>
      </div>
      <div className="panel-body stack" style={{ gap: 14 }}>
        <dl className="kv">
          <dt>State</dt><dd>{rx?.status ?? '--'}{rx?.port ? `, ${rx.port}` : ''}</dd>
          <dt>USB chip</dt><dd>{rx?.chip || '--'}</dd>
          <dt>Baud rate</dt><dd>{rx?.baud ?? '--'}</dd>
          <dt>Last heartbeat</dt><dd>{ago(rx?.lastHeartbeatAt, now)}</dd>
          <dt>Packets read / bad</dt><dd>{rx?.linesOk ?? 0} / {rx?.linesBad ?? 0}</dd>
        </dl>
        {rx?.hint && <p className="callout">{rx.hint}</p>}
        <PortPicker />
      </div>
      <div className="panel-head" style={{ borderTop: '1px solid var(--line-soft)' }}>
        <h3 className="panel-title">Serial console</h3>
        <span className="panel-meta">What the receiver sends, line by line</span>
      </div>
      <div className="console" ref={box} role="log" aria-live="off">
        {log.length === 0 && <div className="muted">Nothing received yet.</div>}
        {log.map((l, i) => (
          <div key={i} className={`l-${l.dir}`}><span className="t">{timeShort(l.t)}</span>{l.text}</div>
        ))}
      </div>
    </section>
  )
}

function TestModePanel() {
  const { snap } = useLive()
  const [scen, setScen] = useState({})
  useEffect(() => { api.simulator().then((s) => setScen(s.scenarios || {})).catch(() => {}) }, [])
  const sim = snap?.simulator
  if (!sim?.allowed) return null
  const realBand = snap?.band.status === 'live' && snap?.band.source === 'lora'

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">Test mode</h2>
        <span className="panel-meta">{sim.enabled ? 'Running' : 'Off'}</span>
      </div>
      <div className="panel-body stack" style={{ gap: 12 }}>
        <p className="hint">Simulates a band through the same encrypted packet path as the real receiver. Pick a situation to check how alerts and the AI react.</p>
        <div className="row">
          {Object.entries(scen).map(([id, label]) => (
            <button key={id} className={`btn small ${sim.enabled && sim.scenario === id ? 'primary' : ''}`} disabled={realBand}
              onClick={() => api.setSimulator({ enabled: true, scenario: id })} title={label}>
              {label}
            </button>
          ))}
        </div>
        {sim.enabled && <div><button className="btn danger" onClick={() => api.setSimulator({ enabled: false })}>Stop test mode</button></div>}
        {realBand && <p className="muted">A real band is connected, so test mode is unavailable.</p>}
      </div>
    </section>
  )
}

function AIPanel() {
  const { snap } = useLive()
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const llm = snap?.llm
  const providers = res?.providers || llm?.providers || []

  const test = async () => {
    setBusy(true)
    try { setRes(await api.testAI()) } catch (e) { setRes({ ok: false, error: e.message }) } finally { setBusy(false) }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">AI analysis</h2>
        <button className="btn small" onClick={test} disabled={busy}>{busy ? 'Testing' : 'Test AI providers'}</button>
      </div>
      <div className="panel-body stack" style={{ gap: 12 }}>
        <p className="hint">Providers are tried in this order. If all fail (no internet, expired key), the offline rule engine still gives an assessment.</p>
        <table className="table">
          <thead><tr><th>Provider</th><th>Model</th><th>Key</th><th>Status</th></tr></thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.label}</td>
                <td><code>{p.model}</code></td>
                <td>{p.configured ? 'Set' : <span className="muted">Missing</span>}</td>
                <td className={`tone-${p.ok === true ? 'ok' : p.ok === false ? 'crit' : 'idle'}`} style={{ color: 'var(--tone)' }}>
                  {p.ok === true ? 'Working' : p.ok === false ? p.lastError : 'Not tried'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {res && (
          <p className={`callout`} style={{ borderColor: res.ok ? 'var(--ok)' : 'var(--crit)' }}>
            {res.ok ? `${res.provider} answered in ${res.ms} ms.` : res.error}
          </p>
        )}
        <dl className="kv">
          <dt>AI calls today</dt><dd>{llm?.callsToday ?? 0}</dd>
          <dt>Tokens today</dt><dd>{(llm?.tokensToday ?? 0).toLocaleString('en-IN')}</dd>
        </dl>
        <p className="hint">API keys go in <code>vitalwatch-backend/.env</code>. Free keys: Groq console.groq.com/keys, Gemini aistudio.google.com/apikey.</p>
      </div>
    </section>
  )
}

function SettingsPanel() {
  const { snap } = useLive()
  const [form, setForm] = useState(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => { if (snap && !form) setForm({ ...snap.soldier }) }, [snap])
  if (!snap || !form) return null
  const s = snap.settings

  const save = async (e) => {
    e.preventDefault()
    await api.saveSettings({ soldier: form })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }
  const F = (k, label, type = 'text') => (
    <label className="field">
      <span>{label}</span>
      <input className="input" type={type} value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
    </label>
  )

  return (
    <section className="panel">
      <div className="panel-head"><h2 className="panel-title">Soldier and settings</h2></div>
      <form className="panel-body stack" onSubmit={save}>
        <div className="two">
          {F('rank', 'Rank')}{F('name', 'Name')}
          {F('unit', 'Unit')}{F('serviceNo', 'Service number')}
          {F('age', 'Age', 'number')}{F('bloodGroup', 'Blood group')}
          {F('restingHR', 'Resting heart rate (bpm)', 'number')}
        </div>
        <div><button className="btn primary" type="submit">{saved ? 'Saved' : 'Save soldier details'}</button></div>

        <label className="switch">
          <input type="checkbox" checked={s.fillFailedSensors} onChange={(e) => api.saveSettings({ fillFailedSensors: e.target.checked })} />
          <span>
            <b>Fill failed sensors with estimates</b>
            <span className="hint" style={{ display: 'block' }}>
              While real packets arrive, a broken or missing sensor shows a realistic estimate marked SIM. Alerts and the AI ignore
              estimates. Turn this off for real field use, so a dead sensor shows as missing.
            </span>
          </span>
        </label>
        <label className="switch">
          <input type="checkbox" checked={s.llmEnabled} onChange={(e) => api.saveSettings({ llmEnabled: e.target.checked })} />
          <span>
            <b>Use online AI</b>
            <span className="hint" style={{ display: 'block' }}>When off, only the offline rule engine is used.</span>
          </span>
        </label>
        <p className="muted">Records saved to {snap.firebase ? 'Firebase' : 'memory only (no Firebase keys in .env)'}.</p>
      </form>
    </section>
  )
}

export default function Setup() {
  return (
    <div className="two" style={{ alignItems: 'start' }}>
      <div className="stack"><ReceiverPanel /><TestModePanel /></div>
      <div className="stack"><AIPanel /><SettingsPanel /></div>
    </div>
  )
}
