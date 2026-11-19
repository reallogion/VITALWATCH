import React from 'react'
import Sparkline from './Sparkline'

export default function VitalTile({ label, source, value, unit, note, tone = 'ok', sim, spark, span }) {
  const empty = value === '--' || value === null || value === undefined
  return (
    <div className={`tile tone-${tone} ${sim ? 'is-sim' : ''} ${empty ? 'is-empty' : ''}`}>
      <div className="tile-head">
        <span className="tile-label">
          {label}
          {sim && <span className="sim-tag" title="Sensor failed. This is an estimate, not a measurement.">SIM</span>}
        </span>
        <span className="tile-src">{source}</span>
      </div>
      <div className="tile-value">
        <span className="tile-num">{empty ? '--' : value}</span>
        {unit && <span className="tile-unit">{unit}</span>}
      </div>
      <div className="tile-note">{note}</div>
      <div className="tile-spark">{spark && <Sparkline points={spark} minSpan={span} tone={tone === 'ok' ? 'var(--sage)' : `var(--${tone})`} />}</div>
    </div>
  )
}
