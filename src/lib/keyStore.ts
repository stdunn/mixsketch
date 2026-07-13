import type { TrackKeyInfo } from '../types'

// Client for the sqlite-backed key/BPM store served by the Vite dev server
// (see server/dbPlugin.ts). Misses are cached too (source: 'none') so unknown
// tracks aren't re-queried every visit.

export type KeyInfoMap = Record<string, TrackKeyInfo>

const LEGACY_LS_KEY = 'mixsketch:keydata'

async function dbFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/db${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`Local DB error ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

export async function getKeyInfoBatch(trackIds: string[]): Promise<KeyInfoMap> {
  if (trackIds.length === 0) return {}
  return dbFetch<KeyInfoMap>('/keys/get', {
    method: 'POST',
    body: JSON.stringify({ ids: trackIds }),
  })
}

export async function saveKeyInfo(entries: KeyInfoMap): Promise<void> {
  if (Object.keys(entries).length === 0) return
  await dbFetch('/keys/set', { method: 'POST', body: JSON.stringify({ entries }) })
}

export async function getPlaylistOrder(playlistId: string): Promise<string[] | null> {
  const data = await dbFetch<{ order: string[] | null }>(
    `/order?playlist=${encodeURIComponent(playlistId)}`,
  )
  return data.order
}

export async function savePlaylistOrder(playlistId: string, order: string[]): Promise<void> {
  await dbFetch(`/order?playlist=${encodeURIComponent(playlistId)}`, {
    method: 'PUT',
    body: JSON.stringify({ order }),
  })
}

export async function clearPlaylistOrder(playlistId: string): Promise<void> {
  await dbFetch(`/order?playlist=${encodeURIComponent(playlistId)}`, { method: 'DELETE' })
}

/** One-time migration of key data cached in localStorage by earlier versions. */
export async function migrateLegacyLocalStorage(): Promise<void> {
  const raw = localStorage.getItem(LEGACY_LS_KEY)
  if (!raw) return
  try {
    const entries = JSON.parse(raw) as KeyInfoMap
    await saveKeyInfo(entries)
    localStorage.removeItem(LEGACY_LS_KEY)
  } catch {
    // leave the data in place; migration retries next launch
  }
}
