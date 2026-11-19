// Turns backend state into the three links of the signal path:
// Server -> Receiver (USB) -> Band (LoRa)

export function linkStatus(server, snap) {
  const srv =
    server === 'online'
      ? { tone: 'ok', text: 'Running' }
      : server === 'connecting'
        ? { tone: 'idle', text: 'Connecting' }
        : { tone: 'crit', text: 'Not running' }

  let rx = { tone: 'idle', text: 'Unknown' }
  let band = { tone: 'idle', text: 'Unknown' }
  if (server === 'online' && snap) {
    const r = snap.receiver
    rx = {
      connected: { tone: 'ok', text: r.port || 'Connected' },
      silent: { tone: 'warn', text: 'No data on port' },
      searching: { tone: 'idle', text: 'Searching' },
      disconnected: { tone: 'idle', text: 'Disconnected' },
      error: { tone: 'crit', text: 'Error' },
    }[r.status] || { tone: 'idle', text: r.status }

    const b = snap.band
    if (b.status === 'live' && b.source === 'simulator') band = { tone: 'sim', text: 'Test mode' }
    else band = { live: { tone: 'ok', text: 'Live' }, lost: { tone: 'crit', text: 'Signal lost' }, waiting: { tone: 'idle', text: 'Waiting' } }[b.status]
  }

  // Which link is the first one that is not working (0, 1, 2) or 3 = all good
  let step = 3
  if (server !== 'online') step = 0
  else if (snap?.band.status === 'live') step = 3
  else if (snap?.receiver.status !== 'connected') step = 1
  else step = 2

  return { srv, rx, band, step }
}
