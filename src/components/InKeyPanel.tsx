import type { KeyInfoMap } from '../lib/keyStore'
import type { Track, TrackKeyInfo } from '../types'

interface Props {
  track: Track
  info: TrackKeyInfo | undefined
  inKeyTracks: Track[]
  keyInfo: KeyInfoMap
  lookupsRunning: boolean
  onSelect: (trackId: string) => void
  onClose: () => void
}

export default function InKeyPanel({
  track,
  info,
  inKeyTracks,
  keyInfo,
  lookupsRunning,
  onSelect,
  onClose,
}: Props) {
  return (
    <aside className="inkey-panel">
      <div className="inkey-header">
        <h2>Selected track</h2>
        <button className="close-button" onClick={onClose} aria-label="Close panel">
          ×
        </button>
      </div>

      <div className="inkey-selected">
        <div className="inkey-title">{track.title}</div>
        <div className="inkey-artist">{track.artists.join(', ')}</div>
        <div className="inkey-stats">
          <span className="key-badge large">{info?.camelotKey ?? '—'}</span>
          <span className="inkey-bpm">
            {info?.bpm != null ? `${Math.round(info.bpm)} BPM` : 'BPM unknown'}
          </span>
        </div>
      </div>

      <h3 className="inkey-list-heading">In key · {inKeyTracks.length}</h3>

      {!info?.camelotKey ? (
        <p className="inkey-empty">
          {lookupsRunning
            ? 'Still looking up key data for this playlist…'
            : 'No key data was found for this track, so compatible tracks can’t be determined.'}
        </p>
      ) : inKeyTracks.length === 0 ? (
        <p className="inkey-empty">
          No other tracks in this playlist are harmonically compatible
          {lookupsRunning ? ' (yet — lookups still running)' : ''}.
        </p>
      ) : (
        <ul className="inkey-list">
          {inKeyTracks.map((t) => {
            const tInfo = keyInfo[t.id]
            return (
              <li key={t.id}>
                <button className="inkey-item" onClick={() => onSelect(t.id)}>
                  <span className="key-badge">{tInfo?.camelotKey}</span>
                  <span className="inkey-item-text">
                    <span className="inkey-item-title">{t.title}</span>
                    <span className="inkey-item-artist">
                      {t.artists.join(', ')}
                      {tInfo?.bpm != null ? ` · ${Math.round(tInfo.bpm)} BPM` : ''}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
