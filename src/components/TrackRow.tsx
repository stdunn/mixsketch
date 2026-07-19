import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
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
  // the menu renders in a portal with fixed positioning so the table's
  // scroll container can't clip it; null = closed
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const menuOpen = menuPos !== null

  // close on any outside click, scroll, or resize (fixed pos would go stale)
  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuPos(null)
    document.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [menuOpen])

  const toggleMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (menuOpen) {
      setMenuPos(null)
      return
    }
    const MENU_W = 190
    const MENU_H = 44
    const rect = e.currentTarget.getBoundingClientRect()
    const openUp = rect.bottom + MENU_H + 8 > window.innerHeight
    setMenuPos({
      top: openUp ? rect.top - MENU_H - 4 : rect.bottom + 4,
      left: Math.max(8, Math.min(rect.right - MENU_W, window.innerWidth - MENU_W - 8)),
    })
  }

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
        <button
          className={`options-button${menuOpen ? ' open' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            toggleMenu(e)
          }}
          title="Options"
          aria-label={`Options for ${track.title}`}
          aria-expanded={menuOpen}
        >
          ⋯
        </button>
        {menuPos &&
          createPortal(
            // portal events still bubble through the React tree, so stop them
            // from reaching the row's click (select) and drag handlers
            <div
              className="options-menu"
              style={menuPos}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                className="options-item danger"
                onClick={() => {
                  setMenuPos(null)
                  onRemove()
                }}
              >
                Remove from playlist
              </button>
            </div>,
            document.body,
          )}
      </td>
    </tr>
  )
}
