const API_KEY = import.meta.env.VITE_GETSONGBPM_API_KEY as string | undefined

export function hasGetSongBpmKey(): boolean {
  return Boolean(API_KEY)
}

export interface GsbResult {
  bpm: number | null
  /** Musical notation from the API, e.g. "Gm" */
  keyName: string | null
  /** Open Key notation from the API, e.g. "6m" — most reliable for Camelot conversion */
  openKey: string | null
}

interface GsbSearchSong {
  tempo?: string | number | null
  key_of?: string | null
  open_key?: string | null
}

/** Strip "(feat. …)" and " - Radio Edit"-style suffixes that hurt search matching. */
function cleanTitle(title: string): string {
  return title
    .replace(/\s*\(feat\.[^)]*\)/gi, '')
    .replace(/\s*\[feat\.[^\]]*\]/gi, '')
    .replace(/\s+-\s+.*$/, '')
    .trim()
}

/**
 * Look up a track's BPM and key on GetSongBPM. Returns null when nothing matched.
 * Calls go through the Vite dev-server proxy (see vite.config.ts) because the
 * API doesn't send CORS headers.
 */
export async function lookupTrack(title: string, artist: string): Promise<GsbResult | null> {
  if (!API_KEY) return null
  const lookup = `song:${cleanTitle(title)} artist:${artist}`
  const url = `/api/getsongbpm/search/?api_key=${encodeURIComponent(API_KEY)}&type=both&lookup=${encodeURIComponent(lookup)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GetSongBPM error ${res.status}`)
  const data = await res.json()
  // On "no result" the API returns {search: {error: "..."}} instead of an array.
  const results: GsbSearchSong[] = Array.isArray(data?.search) ? data.search : []
  if (results.length === 0) return null
  const first = results[0]
  const tempo = first.tempo != null ? Number(first.tempo) : null
  return {
    bpm: tempo != null && Number.isFinite(tempo) && tempo > 0 ? tempo : null,
    keyName: first.key_of ?? null,
    openKey: first.open_key ?? null,
  }
}
