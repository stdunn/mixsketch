import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { hasGetSongBpmKey, lookupTrack } from '../api/getsongbpm'
import {
  audioFeaturesAvailability,
  getAudioFeatures,
  getPlaylistMeta,
  getPlaylistTracks,
} from '../api/spotify'
import {
  compatibleKeys,
  musicalKeyToCamelot,
  openKeyToCamelot,
  pitchClassToCamelot,
  pitchClassToName,
} from '../lib/camelot'
import { getAllKeyInfo, setKeyInfo, type KeyInfoMap } from '../lib/keyStore'
import type { Playlist, Track, TrackKeyInfo } from '../types'
import InKeyPanel from './InKeyPanel'
import TrackRow from './TrackRow'

// GetSongBPM's free tier is rate-limited; space out sequential lookups.
const LOOKUP_DELAY_MS = 400

export default function PlaylistDetail() {
  const { id } = useParams<{ id: string }>()
  const [meta, setMeta] = useState<Playlist | null>(null)
  const [tracks, setTracks] = useState<Track[] | null>(null)
  const [keyInfo, setKeyInfoState] = useState<KeyInfoMap>(() => getAllKeyInfo())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingLookups, setPendingLookups] = useState(0)
  const [afStatus, setAfStatus] = useState(audioFeaturesAvailability())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setMeta(null)
    setTracks(null)
    setSelectedId(null)
    setError(null)
    Promise.all([getPlaylistMeta(id), getPlaylistTracks(id)])
      .then(([m, t]) => {
        if (cancelled) return
        setMeta(m)
        setTracks(t)
        setKeyInfoState(getAllKeyInfo())
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [id])

  // Lazily fill in key/BPM data for tracks that aren't cached yet:
  // Spotify audio features first (batched; only grandfathered apps have access),
  // then GetSongBPM one-by-one for whatever's left.
  useEffect(() => {
    if (!tracks) return
    if (!hasGetSongBpmKey() && audioFeaturesAvailability() === 'unavailable') return
    const stored = getAllKeyInfo()
    const missing = tracks.filter((t) => !stored[t.id])
    if (missing.length === 0) return
    let cancelled = false
    setPendingLookups(missing.length)
    ;(async () => {
      let remaining = missing
      try {
        const features = await getAudioFeatures(missing.map((t) => t.id))
        if (cancelled) return
        if (features) {
          const resolved: KeyInfoMap = {}
          remaining = []
          for (const track of missing) {
            const f = features.get(track.id)
            if (f && (f.tempo > 0 || f.key >= 0)) {
              const info: TrackKeyInfo = {
                bpm: f.tempo > 0 ? f.tempo : null,
                camelotKey: pitchClassToCamelot(f.key, f.mode),
                keyName: pitchClassToName(f.key, f.mode),
                source: 'spotify',
                fetchedAt: Date.now(),
              }
              resolved[track.id] = info
              setKeyInfo(track.id, info)
            } else {
              remaining.push(track)
            }
          }
          setKeyInfoState((prev) => ({ ...prev, ...resolved }))
          setPendingLookups(remaining.length)
        }
      } catch {
        // Transient Spotify error — let GetSongBPM handle everything this visit.
      }
      if (cancelled) return
      setAfStatus(audioFeaturesAvailability())
      if (!hasGetSongBpmKey()) {
        setPendingLookups(0)
        return
      }
      for (const track of remaining) {
        if (cancelled) return
        let info: TrackKeyInfo | null = null
        try {
          const result = await lookupTrack(track.title, track.artists[0] ?? '')
          info = result
            ? {
                bpm: result.bpm,
                camelotKey:
                  (result.openKey && openKeyToCamelot(result.openKey)) ||
                  (result.keyName && musicalKeyToCamelot(result.keyName)) ||
                  null,
                keyName: result.keyName,
                source: 'getsongbpm',
                fetchedAt: Date.now(),
              }
            : { bpm: null, camelotKey: null, keyName: null, source: 'none', fetchedAt: Date.now() }
        } catch {
          // Network/API error: don't cache, so it's retried on the next visit.
          info = null
        }
        if (cancelled) return
        if (info) {
          const finalInfo = info
          setKeyInfo(track.id, finalInfo)
          setKeyInfoState((prev) => ({ ...prev, [track.id]: finalInfo }))
        }
        setPendingLookups((n) => Math.max(0, n - 1))
        await new Promise((r) => setTimeout(r, LOOKUP_DELAY_MS))
      }
    })()
    return () => {
      cancelled = true
      setPendingLookups(0)
    }
  }, [tracks])

  const selectedTrack = useMemo(
    () => tracks?.find((t) => t.id === selectedId) ?? null,
    [tracks, selectedId],
  )
  const selectedKey = selectedId ? (keyInfo[selectedId]?.camelotKey ?? null) : null

  const compatSet = useMemo(
    () => (selectedKey ? new Set(compatibleKeys(selectedKey)) : null),
    [selectedKey],
  )

  const inKeyTracks = useMemo(() => {
    if (!tracks || !selectedTrack || !compatSet) return []
    return tracks.filter((t) => {
      if (t.id === selectedTrack.id) return false
      const key = keyInfo[t.id]?.camelotKey
      return Boolean(key && compatSet.has(key))
    })
  }, [tracks, selectedTrack, compatSet, keyInfo])

  if (error) {
    return (
      <div className="notice error">
        <h2>Couldn't load playlist</h2>
        <p>{error}</p>
        <Link to="/">Back to playlists</Link>
      </div>
    )
  }
  if (!tracks) return <div className="notice">Loading tracks…</div>

  return (
    <div className={`playlist-detail${selectedTrack ? ' with-panel' : ''}`}>
      <div className="track-section">
        <div className="detail-header">
          <Link to="/" className="back-link">
            ← Playlists
          </Link>
          <h1 className="page-title">{meta?.name ?? 'Playlist'}</h1>
          <div className="detail-meta">
            {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
            {pendingLookups > 0 && (
              <span className="lookup-status"> · looking up keys… {pendingLookups} left</span>
            )}
            {afStatus === 'available' && (
              <span className="lookup-status"> · key/BPM data from Spotify</span>
            )}
            {!hasGetSongBpmKey() && afStatus === 'unavailable' && (
              <span className="lookup-status">
                {' '}
                · this Spotify app can't access audio features — add{' '}
                <code>VITE_GETSONGBPM_API_KEY</code> to .env.local for BPM &amp; key data
              </span>
            )}
          </div>
        </div>
        <table className="track-table">
          <thead>
            <tr>
              <th className="col-num">#</th>
              <th>Title</th>
              <th>Artist</th>
              <th>Album</th>
              <th className="col-duration">Time</th>
              <th className="col-bpm">BPM</th>
              <th className="col-key">Key</th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((t, i) => (
              <TrackRow
                key={`${t.id}-${i}`}
                index={i + 1}
                track={t}
                info={keyInfo[t.id]}
                selected={t.id === selectedId}
                compatible={Boolean(
                  compatSet &&
                    t.id !== selectedId &&
                    keyInfo[t.id]?.camelotKey &&
                    compatSet.has(keyInfo[t.id].camelotKey!),
                )}
                lookupPending={!keyInfo[t.id] && pendingLookups > 0}
                onClick={() => setSelectedId((prev) => (prev === t.id ? null : t.id))}
              />
            ))}
          </tbody>
        </table>
      </div>

      {selectedTrack && (
        <InKeyPanel
          track={selectedTrack}
          info={keyInfo[selectedTrack.id]}
          inKeyTracks={inKeyTracks}
          keyInfo={keyInfo}
          lookupsRunning={pendingLookups > 0}
          onSelect={setSelectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}
