import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { hasGetSongBpmKey, lookupTrack } from '../api/getsongbpm'
import {
  addTracksToPlaylist,
  audioFeaturesAvailability,
  createPlaylist,
  getAudioFeatures,
  getPlaylistMeta,
  getPlaylistTracks,
  playTrack,
  removeTrackFromPlaylist,
} from '../api/spotify'
import { getPlayerState, subscribePlayer } from '../player/spotifyPlayer'
import {
  camelotSortValue,
  compatibilityTiers,
  musicalKeyToCamelot,
  openKeyToCamelot,
  pitchClassToCamelot,
  pitchClassToName,
  type CompatTier,
} from '../lib/camelot'
import {
  clearPlaylistOrder,
  getKeyInfoBatch,
  getPlaylistOrder,
  saveKeyInfo,
  savePlaylistOrder,
  type KeyInfoMap,
} from '../lib/keyStore'
import type { Playlist, Track, TrackKeyInfo } from '../types'
import InKeyPanel from './InKeyPanel'
import TrackRow from './TrackRow'

// GetSongBPM's free tier is rate-limited; space out sequential lookups.
const LOOKUP_DELAY_MS = 400

// drag ids for in-key panel items: `panel:<row uid>`, so a panel drag acts
// exactly like dragging that track's row in the table
const PANEL_DRAG_PREFIX = 'panel:'

// Row drags keep closestCenter (standard sortable feel). Panel drags require
// the pointer to actually be over a row — releasing outside the table means
// "never mind", not "drop on the nearest row".
const collisionDetection: CollisionDetection = (args) =>
  String(args.active.id).startsWith(PANEL_DRAG_PREFIX) ? pointerWithin(args) : closestCenter(args)

type SortCol = 'position' | 'title' | 'artist' | 'bpm' | 'key'

interface DisplayItem {
  track: Track
  /** stable row id; playlists can contain the same track twice */
  uid: string
  /** 1-based position in the (custom-)ordered playlist */
  position: number
}

/** Re-apply a saved custom order; unknown/new tracks keep Spotify order at the end. */
function applyCustomOrder(tracks: Track[], order: string[] | null): Track[] {
  if (!order) return tracks
  const pool = [...tracks]
  const result: Track[] = []
  for (const id of order) {
    const idx = pool.findIndex((t) => t.id === id)
    if (idx !== -1) result.push(...pool.splice(idx, 1))
  }
  return [...result, ...pool]
}

export default function PlaylistDetail() {
  const { id } = useParams<{ id: string }>()
  const [meta, setMeta] = useState<Playlist | null>(null)
  const [tracks, setTracks] = useState<Track[] | null>(null)
  const [customOrder, setCustomOrder] = useState<string[] | null>(null)
  const [keyInfo, setKeyInfoState] = useState<KeyInfoMap>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [sortCol, setSortCol] = useState<SortCol>('position')
  const [sortDir, setSortDir] = useState<1 | -1>(1)
  const [pendingLookups, setPendingLookups] = useState(0)
  const [afStatus, setAfStatus] = useState(audioFeaturesAvailability())
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  /** row uid of the in-key panel item currently being dragged (for the overlay chip) */
  const [panelDragUid, setPanelDragUid] = useState<string | null>(null)
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [duplicateName, setDuplicateName] = useState('')
  const [duplicating, setDuplicating] = useState(false)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)
  const [duplicateSuccess, setDuplicateSuccess] = useState<{
    name: string
    url: string
    count: number
  } | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const playerState = useSyncExternalStore(subscribePlayer, getPlayerState)
  const playerDeviceId = playerState.status === 'ready' ? playerState.deviceId : null

  const handlePlay = (uri: string) => {
    if (!playerDeviceId) return
    void playTrack(playerDeviceId, uri).catch(() => {})
  }

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setMeta(null)
    setTracks(null)
    setCustomOrder(null)
    setSelectedId(null)
    setFilter('')
    setSortCol('position')
    setSortDir(1)
    setError(null)
    ;(async () => {
      try {
        const [m, t, order] = await Promise.all([
          getPlaylistMeta(id),
          getPlaylistTracks(id),
          getPlaylistOrder(id).catch(() => null),
        ])
        if (cancelled) return
        const stored = await getKeyInfoBatch(t.map((x) => x.id)).catch(() => ({}) as KeyInfoMap)
        if (cancelled) return
        setMeta(m)
        setTracks(t)
        setCustomOrder(order)
        setKeyInfoState(stored)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  // Lazily fill in key/BPM data for tracks that aren't stored yet:
  // Spotify audio features first (batched; only grandfathered apps have access),
  // then GetSongBPM one-by-one for whatever's left. Manual entries are never touched.
  useEffect(() => {
    if (!tracks) return
    if (!hasGetSongBpmKey() && audioFeaturesAvailability() === 'unavailable') return
    let cancelled = false
    ;(async () => {
      const stored = await getKeyInfoBatch(tracks.map((t) => t.id)).catch(() => ({}) as KeyInfoMap)
      if (cancelled) return
      const missing = tracks.filter((t) => !stored[t.id])
      if (missing.length === 0) return
      setPendingLookups(missing.length)
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
              resolved[track.id] = {
                bpm: f.tempo > 0 ? f.tempo : null,
                camelotKey: pitchClassToCamelot(f.key, f.mode),
                keyName: pitchClassToName(f.key, f.mode),
                source: 'spotify',
                fetchedAt: Date.now(),
              }
            } else {
              remaining.push(track)
            }
          }
          await saveKeyInfo(resolved)
          if (cancelled) return
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
          await saveKeyInfo({ [track.id]: finalInfo }).catch(() => {})
          if (cancelled) return
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

  const orderedTracks = useMemo(
    () => (tracks ? applyCustomOrder(tracks, customOrder) : []),
    [tracks, customOrder],
  )

  // Stable per-row ids (a playlist can contain the same track twice).
  const orderedItems = useMemo<DisplayItem[]>(() => {
    const seen = new Map<string, number>()
    return orderedTracks.map((track, i) => {
      const occ = seen.get(track.id) ?? 0
      seen.set(track.id, occ + 1)
      return { track, uid: `${track.id}#${occ}`, position: i + 1 }
    })
  }, [orderedTracks])

  const filterText = filter.trim().toLowerCase()
  const displayItems = useMemo(() => {
    let items = orderedItems
    if (filterText) {
      items = items.filter(
        ({ track }) =>
          track.title.toLowerCase().includes(filterText) ||
          track.artists.some((a) => a.toLowerCase().includes(filterText)),
      )
    }
    if (sortCol === 'position') {
      return sortDir === 1 ? items : [...items].reverse()
    }
    const sorted = [...items].sort((a, b) => {
      const ka = keyInfo[a.track.id]
      const kb = keyInfo[b.track.id]
      switch (sortCol) {
        case 'title':
          return a.track.title.localeCompare(b.track.title, undefined, { sensitivity: 'base' }) * sortDir
        case 'artist':
          return (
            (a.track.artists[0] ?? '').localeCompare(b.track.artists[0] ?? '', undefined, {
              sensitivity: 'base',
            }) * sortDir
          )
        case 'bpm': {
          // unknown BPM sorts last in either direction
          const va = ka?.bpm ?? null
          const vb = kb?.bpm ?? null
          if (va === null && vb === null) return 0
          if (va === null) return 1
          if (vb === null) return -1
          return (va - vb) * sortDir
        }
        case 'key': {
          const va = camelotSortValue(ka?.camelotKey)
          const vb = camelotSortValue(kb?.camelotKey)
          if (va === vb) return ((ka?.bpm ?? 0) - (kb?.bpm ?? 0)) * sortDir
          if (va === Number.MAX_SAFE_INTEGER) return 1
          if (vb === Number.MAX_SAFE_INTEGER) return -1
          return (va - vb) * sortDir
        }
      }
    })
    return sorted
  }, [orderedItems, filterText, sortCol, sortDir, keyInfo])

  const dragEnabled = sortCol === 'position' && sortDir === 1 && !filterText

  // During a panel drag, stand the panel item in for its row inside the
  // sortable list: with the active drag id present at that row's index, the
  // other rows displace to preview the drop, exactly like a row drag.
  const sortableIds = useMemo(
    () =>
      displayItems.map((d) => (d.uid === panelDragUid ? PANEL_DRAG_PREFIX + d.uid : d.uid)),
    [displayItems, panelDragUid],
  )

  const selectedTrack = useMemo(
    () => tracks?.find((t) => t.id === selectedId) ?? null,
    [tracks, selectedId],
  )
  const selectedKey = selectedId ? (keyInfo[selectedId]?.camelotKey ?? null) : null

  const tierMap = useMemo(
    () => (selectedKey ? compatibilityTiers(selectedKey) : null),
    [selectedKey],
  )

  const inKeyTracks = useMemo(() => {
    if (!selectedTrack || !tierMap) return []
    const matches: { track: Track; uid: string; tier: CompatTier }[] = []
    for (const { track: t, uid } of orderedItems) {
      if (t.id === selectedTrack.id) continue
      const key = keyInfo[t.id]?.camelotKey
      const tier = key ? tierMap.get(key) : undefined
      if (tier) matches.push({ track: t, uid, tier })
    }
    // best tier first; within a tier, closest tempo to the selected track first
    const selBpm = keyInfo[selectedTrack.id]?.bpm ?? null
    return matches.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier
      const ba = keyInfo[a.track.id]?.bpm ?? null
      const bb = keyInfo[b.track.id]?.bpm ?? null
      if (ba === null && bb === null) return 0
      if (ba === null) return 1
      if (bb === null) return -1
      if (selBpm !== null) return Math.abs(ba - selBpm) - Math.abs(bb - selBpm)
      return ba - bb
    })
  }, [orderedItems, selectedTrack, tierMap, keyInfo])

  const handleSort = (col: SortCol) => {
    if (col === sortCol) {
      setSortDir((d) => (d === 1 ? -1 : 1))
    } else {
      setSortCol(col)
      setSortDir(1)
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    const aid = String(event.active.id)
    setPanelDragUid(aid.startsWith(PANEL_DRAG_PREFIX) ? aid.slice(PANEL_DRAG_PREFIX.length) : null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setPanelDragUid(null)
    const { active, over } = event
    if (!id || !over) return
    // a panel-item drag stands in for dragging that track's table row
    const activeId = String(active.id)
    const activeUid = activeId.startsWith(PANEL_DRAG_PREFIX)
      ? activeId.slice(PANEL_DRAG_PREFIX.length)
      : activeId
    const overId = String(over.id)
    if (overId.startsWith(PANEL_DRAG_PREFIX) || activeUid === overId) return
    const uids = orderedItems.map((d) => d.uid)
    const from = uids.indexOf(activeUid)
    const to = uids.indexOf(overId)
    if (from === -1 || to === -1 || from === to) return
    const ids = arrayMove(orderedTracks, from, to).map((t) => t.id)
    setCustomOrder(ids)
    void savePlaylistOrder(id, ids).catch(() => {})
  }

  const handleResetOrder = () => {
    if (!id) return
    setCustomOrder(null)
    void clearPlaylistOrder(id).catch(() => {})
  }

  const handleRemove = async (track: Track, uid: string) => {
    if (!id || !tracks) return
    setActionError(null)
    // indices of this track in Spotify's playlist order (duplicates possible)
    const spotifyPositions = tracks.reduce<number[]>((acc, t, i) => {
      if (t.id === track.id) acc.push(i)
      return acc
    }, [])
    if (spotifyPositions.length === 0) return
    const occ = Number(uid.split('#')[1] ?? '0')
    const removeIdx = spotifyPositions[Math.min(occ, spotifyPositions.length - 1)]
    try {
      // single copy: remove by URI; duplicates: pin one occurrence by position
      await removeTrackFromPlaylist(
        id,
        track.uri,
        spotifyPositions.length > 1 ? removeIdx : undefined,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setActionError(
        msg.includes('403')
          ? `Spotify wouldn't allow removing "${track.title}" — you can only edit playlists you own.`
          : `Couldn't remove "${track.title}": ${msg}`,
      )
      return
    }
    setTracks((prev) => (prev ? prev.filter((_, i) => i !== removeIdx) : prev))
    if (customOrder) {
      const idx = customOrder.indexOf(track.id)
      if (idx !== -1) {
        const next = customOrder.filter((_, i) => i !== idx)
        setCustomOrder(next)
        void savePlaylistOrder(id, next).catch(() => {})
      }
    }
    if (selectedId === track.id && spotifyPositions.length === 1) setSelectedId(null)
  }

  const openDuplicate = () => {
    setDuplicateName(`${meta?.name ?? 'Playlist'} (sketch)`)
    setDuplicateError(null)
    setDuplicateOpen(true)
  }

  const handleDuplicate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (duplicating) return
    const name = duplicateName.trim()
    if (!name) return
    setDuplicating(true)
    setDuplicateError(null)
    try {
      const created = await createPlaylist(
        name,
        `Sketched with MixSketch from "${meta?.name ?? 'a playlist'}"`,
      )
      try {
        await addTracksToPlaylist(
          created.id,
          orderedTracks.map((t) => t.uri),
        )
      } catch (err) {
        throw new Error(
          `The playlist was created but adding tracks failed: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
      setDuplicateOpen(false)
      setDuplicateSuccess({ name, url: created.url, count: orderedTracks.length })
    } catch (err) {
      setDuplicateError(err instanceof Error ? err.message : String(err))
    } finally {
      setDuplicating(false)
    }
  }

  const handleManualSave = (trackId: string, bpm: number | null, camelotKey: string | null) => {
    const info: TrackKeyInfo = {
      bpm,
      camelotKey,
      keyName: null,
      source: 'manual',
      fetchedAt: Date.now(),
    }
    setKeyInfoState((prev) => ({ ...prev, [trackId]: info }))
    void saveKeyInfo({ [trackId]: info }).catch(() => {})
  }

  const sortIndicator = (col: SortCol) =>
    sortCol === col ? (sortDir === 1 ? ' ▲' : ' ▼') : ''

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

  const panelDragTrack = panelDragUid
    ? (orderedItems.find((d) => d.uid === panelDragUid)?.track ?? null)
    : null

  return (
    <div className="playlist-detail">
      {/* one DndContext spans the table and the in-key panel so matches can
          be dragged straight into the playlist */}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setPanelDragUid(null)}
      >
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
          <div className="toolbar">
            <input
              type="search"
              className="filter-input"
              placeholder="Filter by title or artist…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {customOrder && (
              <button className="toolbar-button" onClick={handleResetOrder}>
                Reset to playlist order
              </button>
            )}
            <span className="toolbar-hint">
              {dragEnabled
                ? 'Drag rows to sketch your mix order'
                : 'Clear filter & sort by # to drag-reorder'}
            </span>
            <button className="toolbar-button duplicate-button" onClick={openDuplicate}>
              Duplicate playlist
            </button>
          </div>
          {actionError && <div className="action-error">{actionError}</div>}
          {duplicateSuccess && (
            <div className="action-success">
              Created "{duplicateSuccess.name}" with {duplicateSuccess.count}{' '}
              {duplicateSuccess.count === 1 ? 'track' : 'tracks'}
              {duplicateSuccess.url && (
                <>
                  {' — '}
                  <a href={duplicateSuccess.url} target="_blank" rel="noreferrer">
                    open in Spotify
                  </a>
                </>
              )}
            </div>
          )}
        </div>

        <table className="track-table">
            {/* fixed layout: long titles ellipsize instead of widening the
                table underneath the in-key panel */}
            <colgroup>
              <col style={{ width: 34 }} />
              <col style={{ width: 32 }} />
              <col />
              <col style={{ width: '22%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: 52 }} />
              <col style={{ width: 52 }} />
              <col style={{ width: 56 }} />
              <col style={{ width: 36 }} />
            </colgroup>
            <thead>
              <tr>
                <th className="col-num sortable" onClick={() => handleSort('position')}>
                  #{sortIndicator('position')}
                </th>
                <th className="col-play" aria-label="Play" />
                <th className="sortable" onClick={() => handleSort('title')}>
                  Title{sortIndicator('title')}
                </th>
                <th className="sortable" onClick={() => handleSort('artist')}>
                  Artist{sortIndicator('artist')}
                </th>
                <th>Album</th>
                <th className="col-duration">Time</th>
                <th className="col-bpm sortable" onClick={() => handleSort('bpm')}>
                  BPM{sortIndicator('bpm')}
                </th>
                <th className="col-key sortable" onClick={() => handleSort('key')}>
                  Key{sortIndicator('key')}
                </th>
                <th className="col-options" aria-label="Options" />
              </tr>
            </thead>
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <tbody>
                {displayItems.map(({ track, uid, position }) => (
                  <TrackRow
                    key={uid}
                    uid={uid}
                    index={position}
                    track={track}
                    info={keyInfo[track.id]}
                    selected={track.id === selectedId}
                    compatTier={
                      (tierMap &&
                        track.id !== selectedId &&
                        tierMap.get(keyInfo[track.id]?.camelotKey ?? '')) ||
                      null
                    }
                    lookupPending={!keyInfo[track.id] && pendingLookups > 0}
                    ghosted={uid === panelDragUid}
                    dragEnabled={dragEnabled}
                    onPlay={playerDeviceId ? () => handlePlay(track.uri) : null}
                    onClick={() => setSelectedId((prev) => (prev === track.id ? null : track.id))}
                    onRemove={() => void handleRemove(track, uid)}
                  />
                ))}
              </tbody>
            </SortableContext>
        </table>
        {displayItems.length === 0 && filterText && (
          <div className="empty-filter">No tracks match "{filter.trim()}".</div>
        )}
      </div>

      {selectedTrack && (
        <InKeyPanel
          track={selectedTrack}
          info={keyInfo[selectedTrack.id]}
          inKeyTracks={inKeyTracks}
          keyInfo={keyInfo}
          selectedBpm={keyInfo[selectedTrack.id]?.bpm ?? null}
          lookupsRunning={pendingLookups > 0}
          dragEnabled={dragEnabled}
          onSelect={setSelectedId}
          onClose={() => setSelectedId(null)}
          onSaveManual={(bpm, key) => handleManualSave(selectedTrack.id, bpm, key)}
          onPlay={playerDeviceId ? () => handlePlay(selectedTrack.uri) : null}
        />
      )}

      {/* ghost chip that follows the cursor while dragging a panel match */}
      <DragOverlay dropAnimation={null}>
        {panelDragTrack && (
          <div className="drag-chip">
            <span className="key-badge">
              {keyInfo[panelDragTrack.id]?.camelotKey ?? '—'}
            </span>
            <span className="drag-chip-title">{panelDragTrack.title}</span>
          </div>
        )}
      </DragOverlay>
      </DndContext>

      {duplicateOpen && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!duplicating) setDuplicateOpen(false)
          }}
        >
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleDuplicate}>
            <h2>Duplicate playlist</h2>
            <p className="modal-hint">
              Creates a new private Spotify playlist with{' '}
              {orderedTracks.length === 1 ? '1 track' : `all ${orderedTracks.length} tracks`} in
              your current sketch order.
            </p>
            <input
              className="modal-input"
              type="text"
              value={duplicateName}
              onChange={(e) => setDuplicateName(e.target.value)}
              placeholder="Playlist name"
              autoFocus
            />
            {duplicateError && <div className="action-error">{duplicateError}</div>}
            <div className="modal-actions">
              <button
                type="button"
                className="toolbar-button"
                onClick={() => setDuplicateOpen(false)}
                disabled={duplicating}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="toolbar-button primary"
                disabled={duplicating || !duplicateName.trim()}
              >
                {duplicating ? 'Creating…' : 'Create playlist'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
