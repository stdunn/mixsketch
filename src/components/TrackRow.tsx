import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
  /** true when a track is selected and this row's key is harmonically compatible */
  compatible: boolean
  /** true while this track's key data is still being looked up */
  lookupPending: boolean
  dragEnabled: boolean
  onClick: () => void
}

export default function TrackRow({
  uid,
  index,
  track,
  info,
  selected,
  compatible,
  lookupPending,
  dragEnabled,
  onClick,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: uid,
    disabled: !dragEnabled,
  })

  const bpm = info?.bpm != null ? Math.round(info.bpm) : null
  const pendingMark = lookupPending ? <span className="pending">…</span> : '—'
  const classes = ['track-row']
  if (selected) classes.push('selected')
  if (compatible) classes.push('compatible')
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
      <td className="col-title">{track.title}</td>
      <td className="col-artist">{track.artists.join(', ')}</td>
      <td className="col-album">{track.album}</td>
      <td className="col-duration">{formatDuration(track.durationMs)}</td>
      <td className="col-bpm">{bpm ?? pendingMark}</td>
      <td className="col-key">
        {info?.camelotKey ? <span className="key-badge">{info.camelotKey}</span> : pendingMark}
      </td>
    </tr>
  )
}
