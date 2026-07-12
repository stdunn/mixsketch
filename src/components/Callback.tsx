import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { completeLogin } from '../auth/spotifyAuth'

export default function Callback({ onLoggedIn }: { onLoggedIn: () => void }) {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  // Authorization codes are single-use; the ref stops StrictMode's double
  // effect invocation from exchanging the same code twice.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const params = new URLSearchParams(window.location.search)
    const authError = params.get('error')
    const code = params.get('code')
    if (authError) {
      setError(`Spotify authorization failed: ${authError}`)
      return
    }
    if (!code) {
      setError('No authorization code found in the callback URL.')
      return
    }
    completeLogin(code)
      .then(() => {
        onLoggedIn()
        navigate('/', { replace: true })
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [navigate, onLoggedIn])

  if (error) {
    return (
      <div className="notice error">
        <h2>Login failed</h2>
        <p>{error}</p>
        <Link to="/">Back to start</Link>
      </div>
    )
  }
  return <div className="notice">Connecting to Spotify…</div>
}
