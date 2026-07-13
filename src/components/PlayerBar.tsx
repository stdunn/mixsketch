import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  getPlayerState,
  initPlayer,
  seekTo,
  setPlayerVolume,
  subscribePlayer,
  togglePlay,
} from '../player/spotifyPlayer'

function fmt(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function PlayerBar() {
  const state = useSyncExternalStore(subscribePlayer, getPlayerState)
  const [dragPos, setDragPos] = useState<number | null>(null)
  const [, tick] = useState(0)

  useEffect(() => {
    void initPlayer()
  }, [])

  // re-render every 500ms while playing so the position keeps moving
  useEffect(() => {
    if (state.paused || !state.track) return
    const iv = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(iv)
  }, [state.paused, state.track])

  if (state.status === 'idle' || state.status === 'connecting') {
    return <div className="player-bar dim">Starting Spotify player…</div>
  }
  if (state.status === 'premium_required') {
    return <div className="player-bar dim">In-app playback needs Spotify Premium.</div>
  }
  if (state.status === 'error') {
    return <div className="player-bar dim">Player error: {state.error}</div>
  }

  const livePos = state.paused
    ? state.position
    : Math.min(state.duration, state.position + (Date.now() - state.positionTimestamp))
  const pos = dragPos ?? livePos

  const commitSeek = () => {
    if (dragPos != null) {
      void seekTo(dragPos)
      setDragPos(null)
    }
  }

  return (
    <div className="player-bar">
      <div className="player-track">
        {state.track ? (
          <>
            <span className="player-title">{state.track.name}</span>
            <span className="player-artist">{state.track.artists}</span>
          </>
        ) : (
          <span className="player-artist">Hit ▶ on a track to preview it here</span>
        )}
      </div>
      <button
        className="player-toggle"
        onClick={() => void togglePlay()}
        disabled={!state.track}
        aria-label={state.paused ? 'Play' : 'Pause'}
      >
        {state.paused ? '▶' : '⏸'}
      </button>
      <span className="player-time">{fmt(pos)}</span>
      <input
        type="range"
        className="player-seek"
        min={0}
        max={state.duration || 1}
        value={Math.min(pos, state.duration || 1)}
        onChange={(e) => setDragPos(Number(e.target.value))}
        onPointerUp={commitSeek}
        onKeyUp={commitSeek}
        disabled={!state.track}
        aria-label="Seek"
      />
      <span className="player-time">{fmt(state.duration)}</span>
      <input
        type="range"
        className="player-volume"
        min={0}
        max={1}
        step={0.01}
        value={state.volume}
        onChange={(e) => void setPlayerVolume(Number(e.target.value))}
        aria-label="Volume"
      />
    </div>
  )
}
