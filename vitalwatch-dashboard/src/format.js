export const fmt = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? '--' : Number(v).toFixed(d))

export function ago(ts, now = Date.now()) {
  if (!ts) return 'never'
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return `${s} s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  return `${Math.floor(m / 60)} h ${m % 60} min ago`
}

export const clock = (ts, tz) =>
  new Date(ts).toLocaleTimeString('en-GB', { hour12: false, timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit' })

export const timeShort = (ts) =>
  new Date(ts).toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })

// Military date-time group, e.g. 011645Z NOV 26
export function dtg(ts) {
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  const mon = d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }).toUpperCase()
  return `${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}Z ${mon} ${String(d.getUTCFullYear()).slice(2)}`
}

export function dms(deg, pos, neg) {
  if (deg === null || deg === undefined) return '--'
  const a = Math.abs(deg)
  const d = Math.floor(a)
  const m = Math.floor((a - d) * 60)
  const s = ((a - d - m / 60) * 3600).toFixed(1)
  return `${d}°${String(m).padStart(2, '0')}′${String(s).padStart(4, '0')}″${deg >= 0 ? pos : neg}`
}

export const ACTIVITY = ['Still', 'Walking', 'Running']

export const SEVERITY_LABEL = { critical: 'Critical', warning: 'Caution', info: 'Note' }

export const statusTone = (s) =>
  ({ NOMINAL: 'ok', CAUTION: 'warn', CRITICAL: 'crit', 'NO SIGNAL': 'crit', STANDBY: 'idle' })[s] || 'idle'

export const riskTone = (r) => ({ LOW: 'ok', MODERATE: 'warn', HIGH: 'crit', CRITICAL: 'crit' })[r] || 'idle'
