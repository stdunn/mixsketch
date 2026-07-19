import { getAccessToken, forceRefresh } from '../auth/spotifyAuth'
import type { Playlist, Track } from '../types'

const BASE = 'https://api.spotify.com/v1'

interface RawPlaylist {
  id: string
  name: string
  description: string | null
  images: { url: string }[] | null
  tracks: { total: number } | null
  owner: { display_name: string | null } | null
}

interface RawPlaylistTrackItem {
  track: {
    id: string | null
    uri: string
    name: string
    duration_ms: number
    type: string
    artists: { name: string }[] | null
    album: { name: string } | null
  } | null
}

interface Paged<T> {
  items: T[]
  next: string | null
}

async function spotifyFetch<T>(url: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(url.startsWith('http') ? url : `${BASE}${url}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  })
  if (res.status === 401 && !retried) {
    await forceRefresh()
    return spotifyFetch<T>(url, init, true)
  }
  if (res.status === 429) {
    const wait = Number(res.headers.get('Retry-After') ?? '1')
    await new Promise((r) => setTimeout(r, (wait + 1) * 1000))
    return spotifyFetch<T>(url, init, retried)
  }
  if (!res.ok) {
    throw new Error(`Spotify API error ${res.status}: ${await res.text()}`)
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

async function fetchAllPages<T>(firstUrl: string): Promise<T[]> {
  const items: T[] = []
  let url: string | null = firstUrl
  while (url) {
    const page: Paged<T> = await spotifyFetch<Paged<T>>(url)
    items.push(...(page.items ?? []))
    url = page.next
  }
  return items
}

export type AudioFeaturesAvailability = 'unknown' | 'available' | 'unavailable'

const AF_FLAG_KEY = 'mixsketch:audio-features'

/**
 * Spotify deprecated /audio-features for apps registered after Nov 27, 2024,
 * but grandfathered apps still get data. Whether this app has access is probed
 * once at runtime and remembered.
 */
export function audioFeaturesAvailability(): AudioFeaturesAvailability {
  const v = localStorage.getItem(AF_FLAG_KEY)
  return v === 'available' || v === 'unavailable' ? v : 'unknown'
}

export interface AudioFeatures {
  id: string
  /** BPM */
  tempo: number
  /** pitch class 0–11, -1 when unknown */
  key: number
  /** 1 = major, 0 = minor */
  mode: number
}

/**
 * Batched audio-features lookup (100 ids per request).
 * Returns null when this Spotify app has no access to the endpoint.
 */
export async function getAudioFeatures(
  trackIds: string[],
): Promise<Map<string, AudioFeatures> | null> {
  if (audioFeaturesAvailability() === 'unavailable') return null
  const map = new Map<string, AudioFeatures>()
  for (let i = 0; i < trackIds.length; i += 100) {
    const chunk = trackIds.slice(i, i + 100)
    let data: { audio_features: (AudioFeatures | null)[] }
    try {
      data = await spotifyFetch(`/audio-features?ids=${chunk.join(',')}`)
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Spotify API error 403')) {
        localStorage.setItem(AF_FLAG_KEY, 'unavailable')
        return null
      }
      throw err
    }
    for (const f of data.audio_features ?? []) {
      if (f) map.set(f.id, f)
    }
  }
  localStorage.setItem(AF_FLAG_KEY, 'available')
  return map
}

function mapPlaylist(p: RawPlaylist): Playlist {
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? '',
    imageUrl: p.images?.[0]?.url ?? null,
    trackCount: p.tracks?.total ?? 0,
    owner: p.owner?.display_name ?? '',
  }
}

export async function getMyPlaylists(): Promise<Playlist[]> {
  const raw = await fetchAllPages<RawPlaylist>('/me/playlists?limit=50')
  return raw.filter(Boolean).map(mapPlaylist)
}

export async function getPlaylistMeta(id: string): Promise<Playlist> {
  const fields = 'id,name,description,images,tracks.total,owner.display_name'
  const raw = await spotifyFetch<RawPlaylist>(`/playlists/${id}?fields=${encodeURIComponent(fields)}`)
  return mapPlaylist(raw)
}

/** Create a new (private) playlist on the current user's account. */
export async function createPlaylist(
  name: string,
  description: string,
): Promise<{ id: string; url: string }> {
  const me = await spotifyFetch<{ id: string }>('/me')
  const p = await spotifyFetch<{ id: string; external_urls?: { spotify?: string } }>(
    `/users/${encodeURIComponent(me.id)}/playlists`,
    { method: 'POST', body: JSON.stringify({ name, description, public: false }) },
  )
  return { id: p.id, url: p.external_urls?.spotify ?? '' }
}

/** Append tracks to a playlist in order (batched 100 per request). */
export async function addTracksToPlaylist(playlistId: string, uris: string[]): Promise<void> {
  for (let i = 0; i < uris.length; i += 100) {
    await spotifyFetch<void>(`/playlists/${playlistId}/tracks`, {
      method: 'POST',
      body: JSON.stringify({ uris: uris.slice(i, i + 100) }),
    })
  }
}

/**
 * Remove a track from a playlist. Removing by URI alone deletes every copy of
 * the track, so when the playlist contains duplicates pass `position` (index
 * in Spotify's playlist order) to pin a single occurrence — that variant needs
 * the playlist's current snapshot id, fetched here.
 */
export async function removeTrackFromPlaylist(
  playlistId: string,
  uri: string,
  position?: number,
): Promise<void> {
  const body: { tracks: { uri: string; positions?: number[] }[]; snapshot_id?: string } = {
    tracks: [{ uri }],
  }
  if (position !== undefined) {
    const { snapshot_id } = await spotifyFetch<{ snapshot_id: string }>(
      `/playlists/${playlistId}?fields=snapshot_id`,
    )
    body.tracks[0].positions = [position]
    body.snapshot_id = snapshot_id
  }
  await spotifyFetch<void>(`/playlists/${playlistId}/tracks`, {
    method: 'DELETE',
    body: JSON.stringify(body),
  })
}

/** Start playback of a track on the in-app Web Playback SDK device. */
export async function playTrack(deviceId: string, uri: string): Promise<void> {
  await spotifyFetch<void>(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    body: JSON.stringify({ uris: [uri] }),
  })
}

export async function getPlaylistTracks(id: string): Promise<Track[]> {
  const fields =
    'items(track(id,uri,name,duration_ms,type,artists(name),album(name))),next'
  const raw = await fetchAllPages<RawPlaylistTrackItem>(
    `/playlists/${id}/tracks?limit=100&fields=${encodeURIComponent(fields)}`,
  )
  return raw
    .map((item) => item?.track)
    .filter((t): t is NonNullable<RawPlaylistTrackItem['track']> =>
      Boolean(t && t.type === 'track' && t.id),
    )
    .map((t) => ({
      id: t.id!,
      uri: t.uri,
      title: t.name,
      artists: (t.artists ?? []).map((a) => a.name),
      album: t.album?.name ?? '',
      durationMs: t.duration_ms ?? 0,
    }))
}
