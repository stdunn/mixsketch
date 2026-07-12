import { useState } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { isLoggedIn, logout } from './auth/spotifyAuth'
import Callback from './components/Callback'
import Login from './components/Login'
import PlaylistDetail from './components/PlaylistDetail'
import PlaylistList from './components/PlaylistList'

function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn())

  return (
    <div className="app">
      <header className="app-header">
        <Link to="/" className="brand">
          Mix<span>Sketch</span>
        </Link>
        {loggedIn && (
          <button
            className="link-button"
            onClick={() => {
              logout()
              setLoggedIn(false)
            }}
          >
            Log out
          </button>
        )}
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/callback" element={<Callback onLoggedIn={() => setLoggedIn(true)} />} />
          {loggedIn ? (
            <>
              <Route path="/" element={<PlaylistList />} />
              <Route path="/playlist/:id" element={<PlaylistDetail />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          ) : (
            <Route path="*" element={<Login />} />
          )}
        </Routes>
      </main>
      <footer className="app-footer">
        Key &amp; BPM data provided by{' '}
        <a href="https://getsongbpm.com" target="_blank" rel="noreferrer">
          GetSongBPM
        </a>
      </footer>
    </div>
  )
}

export default App
