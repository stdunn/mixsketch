export interface Playlist {
  id: string
  name: string
  description: string
  imageUrl: string | null
  trackCount: number
  owner: string
}

export interface Track {
  id: string
  uri: string
  title: string
  artists: string[]
  album: string
  durationMs: number
}

/** 'none' means a lookup ran and found nothing — cached so it isn't retried every visit. */
export type KeySource = 'getsongbpm' | 'manual' | 'none'

export interface TrackKeyInfo {
  bpm: number | null
  /** Camelot wheel code, e.g. "8A" */
  camelotKey: string | null
  /** Original musical notation from the data source, e.g. "Am" */
  keyName: string | null
  source: KeySource
  fetchedAt: number
}
