import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getMyPlaylists } from '../api/spotify'
import type { Playlist } from '../types'

export default function PlaylistList() {
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getMyPlaylists()
      .then((p) => {
        if (!cancelled) setPlaylists(p)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div className="notice error">
        <h2>Couldn't load playlists</h2>
        <p>{error}</p>
      </div>
    )
  }
  if (!playlists) return <div className="notice">Loading playlists…</div>

  return (
    <div>
      <h1 className="page-title">Your playlists</h1>
      <div className="playlist-grid">
        {playlists.map((p) => (
          <Link key={p.id} to={`/playlist/${p.id}`} className="playlist-card">
            {p.imageUrl ? (
              <img src={p.imageUrl} alt="" loading="lazy" />
            ) : (
              <div className="cover-placeholder">♪</div>
            )}
            <div className="playlist-card-name">{p.name}</div>
            <div className="playlist-card-meta">
              {p.trackCount} {p.trackCount === 1 ? 'track' : 'tracks'}
              {p.owner ? ` · ${p.owner}` : ''}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
