import { useState } from 'react'
import type { CompatTier } from '../lib/camelot'
import type { KeyInfoMap } from '../lib/keyStore'
import type { Track, TrackKeyInfo } from '../types'

const TIER_LABELS: Record<CompatTier, string> = {
  1: 'Same key',
  2: 'Close · ±1 / relative',
  3: 'Workable · ±2 / energy switch',
  4: 'Semitone · +5 / +7',
}

const CAMELOT_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1).flatMap((n) => [
  `${n}A`,
  `${n}B`,
])

interface Props {
  track: Track
  info: TrackKeyInfo | undefined
  inKeyTracks: { track: Track; tier: CompatTier }[]
  keyInfo: KeyInfoMap
  lookupsRunning: boolean
  onSelect: (trackId: string) => void
  onClose: () => void
  onSaveManual: (bpm: number | null, camelotKey: string | null) => void
  /** null while the in-app player isn't ready */
  onPlay: (() => void) | null
}

function ManualEditForm({
  info,
  onSave,
}: {
  info: TrackKeyInfo | undefined
  onSave: (bpm: number | null, camelotKey: string | null) => void
}) {
  const [bpm, setBpm] = useState(info?.bpm != null ? String(Math.round(info.bpm * 10) / 10) : '')
  const [key, setKey] = useState(info?.camelotKey ?? '')
  const [saved, setSaved] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const parsedBpm = bpm.trim() === '' ? null : Number(bpm)
    onSave(parsedBpm !== null && Number.isFinite(parsedBpm) && parsedBpm > 0 ? parsedBpm : null, key || null)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <form className="manual-edit" onSubmit={handleSubmit}>
      <label>
        BPM
        <input
          type="number"
          step="0.1"
          min="0"
          max="300"
          value={bpm}
          onChange={(e) => setBpm(e.target.value)}
          placeholder="—"
        />
      </label>
      <label>
        Key
        <select value={key} onChange={(e) => setKey(e.target.value)}>
          <option value="">—</option>
          {CAMELOT_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="toolbar-button">
        {saved ? 'Saved ✓' : 'Save'}
      </button>
    </form>
  )
}

export default function InKeyPanel({
  track,
  info,
  inKeyTracks,
  keyInfo,
  lookupsRunning,
  onSelect,
  onClose,
  onSaveManual,
  onPlay,
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
          {info?.source === 'manual' && <span className="source-tag">manual</span>}
          <button
            className="play-button large"
            disabled={!onPlay}
            onClick={onPlay ?? undefined}
            title={onPlay ? 'Play' : 'Player starting…'}
            aria-label={`Play ${track.title}`}
          >
            ▶
          </button>
        </div>
      </div>

      <details className="manual-edit-details">
        <summary>Edit BPM / key</summary>
        {/* key prop resets the form when the selection moves to another track */}
        <ManualEditForm key={track.id} info={info} onSave={onSaveManual} />
      </details>

      <h3 className="inkey-list-heading">In key · {inKeyTracks.length}</h3>

      {!info?.camelotKey ? (
        <p className="inkey-empty">
          {lookupsRunning
            ? 'Still looking up key data for this playlist…'
            : 'No key data for this track — set it manually above to find compatible tracks.'}
        </p>
      ) : inKeyTracks.length === 0 ? (
        <p className="inkey-empty">
          No other tracks in this playlist are harmonically compatible
          {lookupsRunning ? ' (yet — lookups still running)' : ''}.
        </p>
      ) : (
        <ul className="inkey-list">
          {inKeyTracks.map(({ track: t, tier }, i) => {
            const tInfo = keyInfo[t.id]
            const firstOfTier = i === 0 || inKeyTracks[i - 1].tier !== tier
            return (
              <li key={t.id}>
                {firstOfTier && <div className={`tier-heading tier-${tier}`}>{TIER_LABELS[tier]}</div>}
                <button className="inkey-item" onClick={() => onSelect(t.id)}>
                  <span className={`key-badge compat-${tier}`}>{tInfo?.camelotKey}</span>
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
