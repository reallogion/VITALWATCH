import React, { useEffect, useRef, useState } from 'react'

// ─────────────────────────────────────────────────────────────
//  Live soldier figure (side view, real proportions).
//  - Walks or runs with the MPU-6050 activity level
//  - Heart pulses at the measured heart rate
//  - Band on the upper arm flashes when a LoRa packet arrives
//  - Lies on the ground on a fall / man-down
//  Built from a simple skeleton: every limb is a joint angle,
//  so the gait is computed, not a canned animation.
// ─────────────────────────────────────────────────────────────

const L = { torso: 78, neck: 14, head: 15, upper: 46, fore: 42, thigh: 64, shin: 62, foot: 21 }
const W = { torso: 36, pelvis: 30, upper: 14, fore: 12, thigh: 21, shin: 15, foot: 9, neck: 11 }
const GROUND = 286

const rad = (d) => (d * Math.PI) / 180
// angle 0 = straight down, positive = forward (to the right)
const down = (p, a, len) => ({ x: p.x + Math.sin(rad(a)) * len, y: p.y + Math.cos(rad(a)) * len })
const up = (p, a, len) => ({ x: p.x + Math.sin(rad(a)) * len, y: p.y - Math.cos(rad(a)) * len })

function pose(phase, mode, breath) {
  const g = {
    still: { hip: 0, kneeBase: 3, kneeAmp: 0, arm: 0, elbow: 10, lean: 1, bob: 0 },
    walk: { hip: 24, kneeBase: 6, kneeAmp: 38, arm: 20, elbow: 22, lean: 4, bob: 3 },
    run: { hip: 32, kneeBase: 22, kneeAmp: 70, arm: 42, elbow: 85, lean: 11, bob: 6 },
  }[mode]

  const leg = (ph) => {
    const hip = g.hip * Math.sin(ph)
    const knee = g.kneeBase + g.kneeAmp * Math.max(0, Math.cos(ph)) ** 1.5
    return { hip, knee }
  }
  const arm = (ph) => ({ sh: -g.arm * Math.sin(ph), el: g.elbow + (mode === 'walk' ? 10 * Math.max(0, -Math.sin(ph)) : 0) })

  let hip = { x: 100, y: 150 - g.bob * Math.abs(Math.cos(phase)) }
  const build = (h) => {
    const nearLeg = leg(phase), farLeg = leg(phase + Math.PI)
    const nearArm = arm(phase), farArm = arm(phase + Math.PI)
    const neck = up(h, g.lean, L.torso + breath)
    const shoulder = down(neck, g.lean, 9)
    const head = up(neck, g.lean + 4, L.neck + L.head)
    const limbLeg = (lg) => {
      const knee = down(h, lg.hip, L.thigh)
      const shinA = lg.hip - lg.knee
      const ankle = down(knee, shinA, L.shin)
      const toe = down(ankle, shinA + 90, L.foot)
      const heel = down(ankle, shinA - 90, 5)
      return { hip: h, knee, ankle, toe, heel }
    }
    const limbArm = (am) => {
      const elbow = down(shoulder, am.sh, L.upper)
      const hand = down(elbow, am.sh + am.el, L.fore)
      return { shoulder, elbow, hand, angle: am.sh }
    }
    return { hip: h, neck, head, shoulder, near: { leg: limbLeg(nearLeg), arm: limbArm(nearArm) }, far: { leg: limbLeg(farLeg), arm: limbArm(farArm) } }
  }
  let p = build(hip)
  // keep the lowest foot point on the ground (no floating, no sinking)
  const low = Math.max(p.near.leg.toe.y, p.near.leg.heel.y, p.far.leg.toe.y, p.far.leg.heel.y, p.near.leg.ankle.y + 4, p.far.leg.ankle.y + 4)
  hip = { x: hip.x, y: hip.y + (GROUND - 4 - low) }
  return build(hip)
}

const seg = (a, b, w, cls) => <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={w} className={cls} strokeLinecap="round" />

function Limbs({ s, side, layer }) {
  const cls = `fig-${layer} fig-${side}`
  const pad = layer === 'edge' ? 2.4 : 0
  return (
    <g>
      {seg(s.leg.hip, s.leg.knee, W.thigh + pad, cls)}
      {seg(s.leg.knee, s.leg.ankle, W.shin + pad, cls)}
      {seg(s.leg.heel, s.leg.toe, W.foot + pad, cls)}
      {seg(s.arm.shoulder, s.arm.elbow, W.upper + pad, cls)}
      {seg(s.arm.elbow, s.arm.hand, W.fore + pad, cls)}
    </g>
  )
}

function Body({ p, layer }) {
  const cls = `fig-${layer} fig-body`
  const pad = layer === 'edge' ? 2.4 : 0
  return (
    <g>
      {seg(p.hip, up(p.hip, 0, 4), W.pelvis + pad, cls)}
      {seg(up(p.hip, 0, 10), down(p.neck, 0, 14), W.torso + pad, cls)}
      {seg(p.neck, p.head, W.neck + pad, cls)}
      <circle cx={p.head.x} cy={p.head.y} r={L.head + pad / 2} className={cls} />
    </g>
  )
}

export default function BodyFigure({ activity, fallen, hr, hrTone = 'ok', statusTone = 'ok', packetAt, sim }) {
  const [t, setT] = useState(0)
  const raf = useRef(0)
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (reduce) return
    let start = performance.now()
    const tick = (now) => {
      setT((now - start) / 1000)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [reduce])

  const mode = fallen ? 'still' : activity === 2 ? 'run' : activity === 1 ? 'walk' : 'still'
  const cycle = mode === 'run' ? 0.72 : 1.15 // seconds per stride
  const phase = mode === 'still' ? 0 : (t / cycle) * Math.PI * 2
  const breath = 1.2 * Math.sin(t * (mode === 'run' ? 5 : 1.6))
  const p = pose(phase, mode, breath)

  // heart position: on the chest, slightly forward
  const chest = up(p.hip, 4, L.torso * 0.66)
  const heart = { x: chest.x + 7, y: chest.y }
  const beat = hr ? 60 / Math.max(30, Math.min(220, hr)) : 0
  const beatK = beat ? (t % beat) / beat : 1
  const pulse = beatK < 0.12 ? 1 + beatK * 3 : beatK < 0.3 ? 1.36 - (beatK - 0.12) * 2 : 1

  // band on the near upper arm (outer side), 25-48 % down from the shoulder
  const a = p.near.arm
  const b1 = { x: a.shoulder.x + (a.elbow.x - a.shoulder.x) * 0.25, y: a.shoulder.y + (a.elbow.y - a.shoulder.y) * 0.25 }
  const b2 = { x: a.shoulder.x + (a.elbow.x - a.shoulder.x) * 0.5, y: a.shoulder.y + (a.elbow.y - a.shoulder.y) * 0.5 }
  const sincePacket = packetAt ? (Date.now() - packetAt) / 1000 : 99
  const ring = sincePacket < 1.4 ? sincePacket / 1.4 : null

  // helmet: a cap over the top of the head
  const h = p.head
  const helmet = `M ${h.x - 17} ${h.y + 1} A 17.5 16 0 0 1 ${h.x + 17} ${h.y - 1} L ${h.x + 20} ${h.y + 1} L ${h.x - 17} ${h.y + 3} Z`

  // ground marks slide backwards while moving
  const speed = mode === 'run' ? 150 : mode === 'walk' ? 55 : 0
  const shift = (t * speed) % 40

  const figure = (
    <g className={`fig tone-${statusTone}`}>
      <Limbs s={p.far} side="far" layer="edge" />
      <Limbs s={p.far} side="far" layer="fill" />
      <Body p={p} layer="edge" />
      <Body p={p} layer="fill" />
      <path d={helmet} className="fig-helmet" />
      <g className={`fig-heart tone-${hrTone}`}>
        <circle cx={heart.x} cy={heart.y} r={5.5 * pulse} />
      </g>
      <Limbs s={p.near} side="near" layer="edge" />
      <Limbs s={p.near} side="near" layer="fill" />
      <line x1={b1.x} y1={b1.y} x2={b2.x} y2={b2.y} strokeWidth={W.upper + 5} strokeLinecap="butt" className={`fig-band ${sim ? 'is-sim' : ''}`} />
      {ring !== null && (
        <circle cx={(b1.x + b2.x) / 2} cy={(b1.y + b2.y) / 2} r={10 + ring * 34} className="fig-ring" style={{ opacity: 1 - ring }} />
      )}
    </g>
  )

  return (
    <svg viewBox="0 0 200 300" className="figure-svg" role="img"
      aria-label={fallen ? 'Soldier down' : mode === 'run' ? 'Soldier running' : mode === 'walk' ? 'Soldier walking' : 'Soldier still'}>
      <g className="fig-ground">
        <line x1="8" y1={GROUND} x2="192" y2={GROUND} />
        {Array.from({ length: 6 }, (_, i) => {
          const x = 8 + ((i * 40 - shift + 400) % 240)
          return x < 192 ? <line key={i} x1={x} y1={GROUND + 5} x2={Math.min(192, x + 12)} y2={GROUND + 5} /> : null
        })}
      </g>
      <ellipse cx={fallen ? 100 : p.hip.x} cy={GROUND + 1} rx={fallen ? 80 : 30} ry="3" className="fig-shadow" />
      {fallen ? <g transform={`translate(100 ${GROUND - 15}) scale(0.72) rotate(-90) translate(-100 -158)`}>{figure}</g> : figure}
    </svg>
  )
}
