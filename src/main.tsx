import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './styles.css'

// Spotify only accepts the loopback IP in redirect URIs, and localStorage/sessionStorage
// are per-origin — so force everything onto 127.0.0.1 up front.
if (window.location.hostname === 'localhost') {
  window.location.replace(window.location.href.replace('//localhost', '//127.0.0.1'))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
