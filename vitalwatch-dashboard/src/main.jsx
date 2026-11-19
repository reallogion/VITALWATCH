import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/barlow/400'
import '@fontsource/barlow/500'
import '@fontsource/barlow/600'
import '@fontsource/barlow-condensed/500'
import '@fontsource/barlow-condensed/600'
import '@fontsource/barlow-condensed/700'
import '@fontsource/big-shoulders-stencil-display/700'
import 'leaflet/dist/leaflet.css'
import './styles.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
