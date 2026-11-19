import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { api } from './api'

// Live connection to the backend over Server-Sent Events.
// No polling, no mock data: if the server is down, the UI says so.
export const LiveContext = createContext(null)
export const useLive = () => useContext(LiveContext)

const KEEP_MS = 2 * 60 * 60 * 1000

export function useLiveConnection() {
  const [server, setServer] = useState('connecting') // connecting | online | offline
  const [snap, setSnap] = useState(null)
  const [history, setHistory] = useState([])
  const [log, setLog] = useState([])
  const esRef = useRef(null)

  useEffect(() => {
    let closed = false
    let retry = null

    const open = () => {
      const es = new EventSource(api.streamUrl)
      esRef.current = es
      es.addEventListener('state', (e) => {
        setServer('online')
        setSnap(JSON.parse(e.data))
      })
      es.addEventListener('reading', (e) => {
        const r = JSON.parse(e.data)
        setHistory((h) => {
          const cut = Date.now() - KEEP_MS
          const next = h.length && h[h.length - 1].timestamp >= r.timestamp ? h : [...h, r]
          return next[0]?.timestamp < cut ? next.filter((x) => x.timestamp >= cut) : next
        })
      })
      es.addEventListener('log', (e) => setLog((l) => [...l.slice(-199), JSON.parse(e.data)]))
      es.onopen = () => {
        setServer('online')
        api.history(120).then(setHistory).catch(() => {})
        api.log().then(setLog).catch(() => {})
      }
      es.onerror = () => {
        setServer('offline')
        es.close()
        if (!closed) retry = setTimeout(open, 3000)
      }
    }
    open()
    return () => {
      closed = true
      clearTimeout(retry)
      esRef.current?.close()
    }
  }, [])

  // Session reset (test mode stopped or scenario changed): drop old chart data
  const session = snap?.band.session
  const lastSession = useRef(null)
  useEffect(() => {
    if (session == null) return
    if (lastSession.current !== null && lastSession.current !== session) setHistory([])
    lastSession.current = session
  }, [session])

  return { server, snap, history, log }
}

// Re-render every second (for "last packet 4 s ago" style text)
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}
