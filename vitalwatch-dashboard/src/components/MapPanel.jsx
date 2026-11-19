import React, { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { useLive } from '../useLive'
import { dms, fmt } from '../format'

// Map tiles need internet. Without it the grid background stays and
// the soldier's position and trail are still drawn correctly.
export default function MapPanel() {
  const { snap, history } = useLive()
  const el = useRef(null)
  const map = useRef(null)
  const marker = useRef(null)
  const trail = useRef(null)
  const base = useRef(null)
  const follow = useRef(true)
  const [tilesOk, setTilesOk] = useState(true)

  const r = snap?.latest
  const sim = r?.simulated?.includes('lat')

  useEffect(() => {
    if (map.current || !el.current) return
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([34.1526, 77.5771], 16)
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' })
    let errors = 0
    tiles.on('tileerror', () => { if (++errors > 4) setTilesOk(false) })
    tiles.on('tileload', () => setTilesOk(true))
    tiles.addTo(m)
    trail.current = L.polyline([], { color: '#e7e2cd', weight: 2, opacity: 0.7, dashArray: '2 6' }).addTo(m)
    m.on('dragstart', () => (follow.current = false))
    map.current = m
    return () => { m.remove(); map.current = null }
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m || !r?.lat) return
    const pos = [r.lat, r.lng]
    const icon = L.divIcon({ className: '', html: `<div class="pos-marker ${sim ? 'sim' : ''}"></div>`, iconSize: [14, 14] })
    if (!marker.current) {
      marker.current = L.marker(pos, { icon, keyboard: false }).addTo(m)
      const first = history.find((h) => h.lat) || r
      base.current = L.marker([first.lat, first.lng], {
        icon: L.divIcon({ className: '', html: '<div class="base-marker" title="Session start"></div>', iconSize: [12, 12] }),
      }).addTo(m)
      m.setView(pos, 16)
    } else {
      marker.current.setLatLng(pos).setIcon(icon)
      if (follow.current) m.panTo(pos, { animate: true })
    }
    trail.current.setLatLngs(history.filter((h) => h.lat).slice(-400).map((h) => [h.lat, h.lng]))
  }, [r?.timestamp])

  // Session ended: clear markers
  useEffect(() => {
    if (!r && marker.current) {
      marker.current.remove(); marker.current = null
      base.current?.remove(); base.current = null
      trail.current?.setLatLngs([])
    }
  }, [r])

  const d = snap?.derived
  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">Position {sim && <span className="sim-tag" title="No GPS fix. Estimated position.">SIM</span>}</h2>
        <div className="row">
          {!tilesOk && <span className="panel-meta">Offline: grid only</span>}
          <button className="btn small" onClick={() => { follow.current = true; r?.lat && map.current?.setView([r.lat, r.lng], 16) }}>Centre on soldier</button>
        </div>
      </div>
      <div className="map-wrap"><div ref={el} className="map" /></div>
      <div className="coords">
        <div><span className="k">Latitude</span>{dms(r?.lat, 'N', 'S')}</div>
        <div><span className="k">Longitude</span>{dms(r?.lng, 'E', 'W')}</div>
        <div><span className="k">Speed</span>{fmt(d?.speedKmh, 1)} km/h</div>
        <div><span className="k">Distance this session</span>{fmt(d?.distanceKm, 2)} km</div>
      </div>
    </section>
  )
}
