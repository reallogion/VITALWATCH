import React from 'react'

// Small trend line under each vital. Estimated (SIM) points are dashed.
export default function Sparkline({ points, height = 40, tone = 'var(--sage)', minSpan = 1 }) {
  if (!points || points.length < 2) return <svg height={height} width="100%" aria-hidden="true" />
  const w = 300
  const vs = points.map((p) => p.v)
  let min = Math.min(...vs), max = Math.max(...vs)
  if (max - min < minSpan) { const c = (max + min) / 2; min = c - minSpan / 2; max = c + minSpan / 2 }
  const t0 = points[0].t, t1 = points[points.length - 1].t || t0 + 1
  const x = (t) => ((t - t0) / (t1 - t0 || 1)) * w
  const y = (v) => height - 3 - ((v - min) / (max - min)) * (height - 6)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('')
  const last = points[points.length - 1]
  const sim = last.sim
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" width="100%" height={height} aria-hidden="true">
      <path d={d} fill="none" stroke={sim ? 'var(--sim)' : tone} strokeWidth="1.6" strokeDasharray={sim ? '4 3' : undefined} vectorEffect="non-scaling-stroke" />
      <circle cx={x(last.t)} cy={y(last.v)} r="2.6" fill={sim ? 'var(--sim)' : 'var(--bone)'} />
    </svg>
  )
}
