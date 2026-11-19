// All calls go to /api (Vite forwards them to the backend in dev;
// in production the backend serves this dashboard itself).
const BASE = import.meta.env.VITE_API_URL || ''

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

export const api = {
  streamUrl: `${BASE}/api/stream`,
  csvUrl: `${BASE}/api/export.csv`,
  history: (minutes = 60) => req(`/history?minutes=${minutes}`),
  log: () => req('/receiver/log'),
  alerts: () => req('/alerts'),
  ack: (id) => req(`/alerts/${id}/ack`, { method: 'POST' }),
  ackAll: () => req('/alerts/ack-all', { method: 'POST' }),
  ports: () => req('/receiver/ports'),
  connect: (path) => req('/receiver/connect', { method: 'POST', body: { path } }),
  disconnect: () => req('/receiver/disconnect', { method: 'POST' }),
  simulator: () => req('/simulator'),
  setSimulator: (body) => req('/simulator', { method: 'POST', body }),
  analyze: () => req('/llm/analyze', { method: 'POST' }),
  testAI: () => req('/llm/test', { method: 'POST' }),
  config: () => req('/config'),
  saveSettings: (body) => req('/settings', { method: 'PATCH', body }),
}
