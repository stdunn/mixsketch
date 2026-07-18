import { useEffect, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CompatTier } from '../lib/camelot'
import type { Track, TrackKeyInfo } from '../types'

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

interface Props {
  /** stable row id for drag-and-drop (playlists can repeat a track) */
  uid: string
  /** 1-based position in the (custom-)ordered playlist */
  index: number
  track: Track
  info: TrackKeyInfo | undefined
  selected: boolean
  /** match quality vs. the selected track: 1 same key, 2 close, 3 workable, null no match */
  compatTier: CompatTier | null
  /** true while this track's key data is still being looked up */
  lookupPending: boolean
  dragEnabled: boolean
  /** null while the in-app player isn't ready */
  onPlay: (() => void) | null
  onClick: () => void
  onRemove: () => void
}

export default function TrackRow({
  uid,
  index,
  track,
  info,
  selected,
  compatTier,
  lookupPending,
  dragEnabled,
  onPlay,
  onClick,
  onRemove,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: uid,
    disabled: !dragEnabled,
  })
  const [menuOpen, setMenuOpen] = useState(false)

  // any click outside the menu closes it
  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuOpen])

  const bpm = info?.bpm != null ? Math.round(info.bpm) : null
  const pendingMark = lookupPending ? <span className="pending">…</span> : '—'
  const classes = ['track-row']
  if (selected) classes.push('selected')
  if (compatTier) classes.push(`compat-${compatTier}`)
  if (isDragging) classes.push('dragging')
  if (dragEnabled) classes.push('draggable')

  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={classes.join(' ')}
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
      <td className="col-num">{index}</td>
      <td className="col-play">
        <button
          className="play-button"
          disabled={!onPlay}
          onClick={(e) => {
            e.stopPropagation()
            onPlay?.()
          }}
          title={onPlay ? 'Play' : 'Player starting…'}
          aria-label={`Play ${track.title}`}
        >
          ▶
        </button>
      </td>
      <td className="col-title">{track.title}</td>
      <td className="col-artist">{track.artists.join(', ')}</td>
      <td className="col-album">{track.album}</td>
      <td className="col-duration">{formatDuration(track.durationMs)}</td>
      <td className="col-bpm">{bpm ?? pendingMark}</td>
      <td className="col-key">
        {info?.camelotKey ? <span className="key-badge">{info.camelotKey}</span> : pendingMark}
      </td>
      <td className="col-options">
        <div className="options-wrap">
          <button
            className={`options-button${menuOpen ? ' open' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((o) => !o)
            }}
            title="Options"
            aria-label={`Options for ${track.title}`}
            aria-expanded={menuOpen}
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="options-menu" onClick={(e) => e.stopPropagation()}>
              <button
                className="options-item danger"
                onClick={() => {
                  setMenuOpen(false)
                  onRemove()
                }}
              >
                Remove from playlist
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}
