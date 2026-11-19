import React, { useState } from 'react'
import { LiveContext, useLiveConnection } from './useLive'
import TopBar from './components/TopBar'
import Banners from './components/Banners'
import Monitor from './pages/Monitor'
import Trends from './pages/Trends'
import AlertsPage from './pages/AlertsPage'
import Setup from './pages/Setup'

const TABS = [
  { id: 'monitor', label: 'Monitor' },
  { id: 'trends', label: 'Trends' },
  { id: 'alerts', label: 'Alert log' },
  { id: 'setup', label: 'Link and settings' },
]

export default function App() {
  const live = useLiveConnection()
  const [tab, setTab] = useState('monitor')
  const open = live.snap?.alerts.filter((a) => a.active && !a.acknowledged && a.severity !== 'info').length || 0

  return (
    <LiveContext.Provider value={live}>
      <div className="app">
        <TopBar />
        <Banners onOpenSetup={() => setTab('setup')} />
        <nav className="tabs" role="tablist" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} role="tab" className="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === 'alerts' && open > 0 && <span className="count">{open}</span>}
            </button>
          ))}
        </nav>
        <main>
          {tab === 'monitor' && <Monitor onOpenSetup={() => setTab('setup')} />}
          {tab === 'trends' && <Trends />}
          {tab === 'alerts' && <AlertsPage />}
          {tab === 'setup' && <Setup />}
        </main>
      </div>
    </LiveContext.Provider>
  )
}
