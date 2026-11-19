import React, { useState } from 'react'
import { useLive, useNow } from '../useLive'
import { api } from '../api'
import { ago, riskTone } from '../format'

export default function Assessment() {
  const { snap } = useLive()
  const now = useNow(5000)
  const [busy, setBusy] = useState(false)
  const a = snap?.analysis
  const llm = snap?.llm

  const run = async () => {
    setBusy(true)
    try { await api.analyze() } catch {} finally { setBusy(false) }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">Medic assessment</h2>
        <button className="btn small" onClick={run} disabled={busy || llm?.busy || !snap?.latest}>
          {busy || llm?.busy ? 'Analysing' : 'Analyse now'}
        </button>
      </div>
      <div className={`panel-body tone-${a ? riskTone(a.risk) : 'idle'}`}>
        {!a ? (
          <p className="hint">{llm?.busy ? 'First assessment in progress.' : 'The first assessment runs when band data arrives.'}</p>
        ) : (
          <>
            <div className="risk-row">
              <span className="risk">{a.risk === 'LOW' ? 'Low risk' : a.risk === 'MODERATE' ? 'Moderate risk' : a.risk === 'HIGH' ? 'High risk' : 'Critical'}</span>
              <span className="muted" title={`Confidence ${Math.round(a.confidence * 100)}%`}>{Math.round(a.confidence * 100)}% confident</span>
            </div>
            <h3 className="headline">{a.headline}</h3>
            <p className="assess-text">{a.assessment}</p>

            {a.actions?.length > 0 && (
              <>
                <h4 className="sub-h">Do now</h4>
                <ol className="actions">{a.actions.map((x, i) => <li key={i}>{x}</li>)}</ol>
              </>
            )}
            {a.concerns?.length > 0 && (
              <>
                <h4 className="sub-h">Concerns</h4>
                <ul className="concerns">{a.concerns.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </>
            )}
            {a.watch && (
              <>
                <h4 className="sub-h">Watch</h4>
                <p className="hint">{a.watch}</p>
              </>
            )}
            <div className="assess-foot">
              <span>{a.source === 'ai' ? `${a.provider}, ${a.model}` : 'Offline rules (no AI reachable)'}</span>
              <span>{ago(a.createdAt, now)}</span>
            </div>
            {a.source !== 'ai' && llm?.lastError && (
              <p className="hint" style={{ marginTop: 8, fontSize: 13 }} title={llm.lastError}>
                AI unavailable: {llm.lastError.length > 110 ? llm.lastError.slice(0, 110) + '…' : llm.lastError}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  )
}
