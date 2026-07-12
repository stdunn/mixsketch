import { beginLogin, isConfigured } from '../auth/spotifyAuth'

export default function Login() {
  if (!isConfigured()) {
    return (
      <div className="notice">
        <h2>Setup needed</h2>
        <p>MixSketch needs your Spotify app's Client ID before it can connect.</p>
        <ol className="setup-steps">
          <li>
            Open your app in the{' '}
            <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
              Spotify Developer Dashboard
            </a>{' '}
            and add <code>http://127.0.0.1:5173/callback</code> as a Redirect URI.
          </li>
          <li>
            Copy the Client ID into <code>.env.local</code> as{' '}
            <code>VITE_SPOTIFY_CLIENT_ID=…</code>
          </li>
          <li>Restart the dev server.</li>
        </ol>
      </div>
    )
  }

  return (
    <div className="login">
      <h1>
        Mix<span>Sketch</span>
      </h1>
      <p>Sketch out DJ mixes from your Spotify playlists.</p>
      <button className="primary" onClick={() => void beginLogin()}>
        Connect Spotify
      </button>
    </div>
  )
}
