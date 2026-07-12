import type { TrackKeyInfo } from '../types'

// localStorage cache of key/BPM data, keyed by Spotify track ID.
// Misses are cached too (source: 'none') so unknown tracks aren't re-queried every visit.

const STORE_KEY = 'mixsketch:keydata'

export type KeyInfoMap = Record<string, TrackKeyInfo>

function load(): KeyInfoMap {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as KeyInfoMap
  } catch {
    return {}
  }
}

export function getAllKeyInfo(): KeyInfoMap {
  return load()
}

export function getKeyInfo(trackId: string): TrackKeyInfo | undefined {
  return load()[trackId]
}

export function setKeyInfo(trackId: string, info: TrackKeyInfo): void {
  const map = load()
  map[trackId] = info
  localStorage.setItem(STORE_KEY, JSON.stringify(map))
}
