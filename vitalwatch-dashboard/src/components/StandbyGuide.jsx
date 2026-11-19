import React from 'react'
import { useLive, useNow } from '../useLive'
import { linkStatus } from '../link'
import { ago } from '../format'
import { api } from '../api'
import PortPicker from './PortPicker'

const STOPS = [
  { name: 'Server', what: 'Node backend on this laptop' },
  { name: 'Receiver', what: 'ESP32 + RA-02 on a USB cable' },
  { name: 'Band', what: 'Bicep band sending over LoRa' },
]

function Todo({ step, snap }) {
  const rx = snap?.receiver
  if (step === 0)
    return (
      <div className="todo">
        <h3 className="todo-title">Start the backend server</h3>
        <ol>
          <li>Open a terminal in the <code>vitalwatch-backend</code> folder.</li>
          <li>Run <code>npm start</code> and wait for “VITALWATCH backend”.</li>
          <li>This page connects by itself within a few seconds.</li>
        </ol>
      </div>
    )

  if (step === 1)
    return (
      <div className="todo">
        <h3 className="todo-title">Connect the receiver by USB</h3>
        <ol>
          <li>Plug the receiver ESP32 into this laptop with a data USB cable (some cables only charge).</li>
          <li>Close the Arduino IDE Serial Monitor if it is open. Only one program can use the port.</li>
          <li>The server finds the ESP32 by itself. If it picks the wrong port, choose it below.</li>
        </ol>
        {rx?.hint && <p className="callout">{rx.hint}</p>}
        <div style={{ marginTop: 16, maxWidth: 640 }}><PortPicker /></div>
      </div>
    )

  if (step === 2)
    return (
      <div className="todo">
        <h3 className="todo-title">{rx?.status === 'silent' ? 'Receiver is not talking' : 'Switch on the band'}</h3>
        {rx?.status === 'silent' ? (
          <ol>
            <li>Flash <code>firmware/receiver/receiver.ino</code> to the receiver ESP32.</li>
            <li>Check it prints at {rx.baud} baud. Open the Serial Monitor to check, then close it again.</li>
            <li>Press the EN (reset) button on the receiver.</li>
          </ol>
        ) : (
          <ol>
            <li>Turn on the band with its slide switch. It sends a packet every 5 seconds.</li>
            <li>Both RA-02 modules need their antennas fitted. Never power LoRa without an antenna.</li>
            <li>Band and receiver must use the same frequency, sync word and AES key.</li>
          </ol>
        )}
        <p className="hint" style={{ marginTop: 12 }}>
          Receiver {rx?.lastHeartbeatAt ? `last heartbeat ${ago(rx.lastHeartbeatAt)}` : 'has sent no heartbeat yet'}
          {rx?.receiverUptime != null ? `, running for ${Math.round(rx.receiverUptime / 60)} min` : ''}.
        </p>
      </div>
    )
  return null
}

export default function StandbyGuide() {
  const { server, snap } = useLive()
  useNow()
  const { srv, rx, band, step } = linkStatus(server, snap)
  const states = [srv, rx, band]

  return (
    <div className="guide">
      <section className="panel path">
        <h1 className="path-lead">{step === 0 ? 'The server is not running' : step === 1 ? 'Waiting for the receiver' : 'Waiting for the band'}</h1>
        <p className="path-sub">
          Data travels band to receiver to this laptop. The first link that is not working is marked amber. No vitals are shown
          until real packets arrive.
        </p>
        <div className="path-track">
          {STOPS.map((s, i) => (
            <div key={s.name} className={`stop tone-${states[i].tone} ${i < step ? 'done' : i === step ? 'current' : ''}`}>
              <span className="stop-dot" aria-hidden="true" />
              <div className="stop-name">{s.name}</div>
              <div className="stop-what">{s.what}</div>
              <div className="stop-state">{states[i].text}</div>
            </div>
          ))}
        </div>
        <Todo step={step} snap={snap} />
      </section>

      <aside className="stack">
        <section className="panel">
          <div className="panel-head"><h2 className="panel-title">No hardware yet?</h2></div>
          <div className="panel-body stack" style={{ gap: 10 }}>
            <p className="hint">
              Test mode simulates a band so you can check the whole system: alerts, AI analysis and map. It is clearly marked
              on every screen and stops when a real band connects.
            </p>
            {snap?.simulator.allowed ? (
              <div><button className="btn" disabled={server !== 'online'} onClick={() => api.setSimulator({ enabled: true, scenario: 'normal' })}>Start test mode</button></div>
            ) : (
              <p className="muted">Turned off in the server settings (ALLOW_SIMULATOR=false).</p>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2 className="panel-title">Startup order</h2></div>
          <div className="panel-body">
            <p className="hint">Any order works. Start the server, plug in the receiver, switch on the band. The receiver can be unplugged and plugged back at any time; the server reconnects by itself.</p>
          </div>
        </section>
      </aside>
    </div>
  )
}
