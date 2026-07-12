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

async function spotifyFetch<T>(url: string, retried = false): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(url.startsWith('http') ? url : `${BASE}${url}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401 && !retried) {
    await forceRefresh()
    return spotifyFetch<T>(url, true)
  }
  if (res.status === 429) {
    const wait = Number(res.headers.get('Retry-After') ?? '1')
    await new Promise((r) => setTimeout(r, (wait + 1) * 1000))
    return spotifyFetch<T>(url, retried)
  }
  if (!res.ok) {
    throw new Error(`Spotify API error ${res.status}: ${await res.text()}`)
  }
  return res.json() as Promise<T>
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
