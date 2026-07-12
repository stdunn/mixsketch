import type { Track, TrackKeyInfo } from '../types'

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

interface Props {
  index: number
  track: Track
  info: TrackKeyInfo | undefined
  selected: boolean
  /** true when a track is selected and this row's key is harmonically compatible */
  compatible: boolean
  /** true while this track's key data is still being looked up */
  lookupPending: boolean
  onClick: () => void
}

export default function TrackRow({
  index,
  track,
  info,
  selected,
  compatible,
  lookupPending,
  onClick,
}: Props) {
  const bpm = info?.bpm != null ? Math.round(info.bpm) : null
  const pendingMark = lookupPending ? <span className="pending">…</span> : '—'
  const classes = ['track-row']
  if (selected) classes.push('selected')
  if (compatible) classes.push('compatible')

  return (
    <tr className={classes.join(' ')} onClick={onClick}>
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
