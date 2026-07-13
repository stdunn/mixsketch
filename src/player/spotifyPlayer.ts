import { getAccessToken } from '../auth/spotifyAuth'

// Singleton wrapper around the Spotify Web Playback SDK. The SDK turns the
// browser tab into a Spotify Connect device ("MixSketch"); playback requires
// Spotify Premium. Components subscribe via useSyncExternalStore.

interface SdkTrack {
  name: string
  uri: string
  artists: { name: string }[]
}

interface SdkPlaybackState {
  paused: boolean
  position: number
  duration: number
  track_window?: { current_track?: SdkTrack }
}

interface SdkPlayer {
  connect(): Promise<boolean>
  disconnect(): void
  addListener(event: string, cb: (data: never) => void): void
  togglePlay(): Promise<void>
  seek(ms: number): Promise<void>
  setVolume(v: number): Promise<void>
}

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void
    Spotify?: {
      Player: new (opts: {
        name: string
        getOAuthToken: (cb: (token: string) => void) => void
        volume: number
      }) => SdkPlayer
    }
  }
}

export type PlayerStatus = 'idle' | 'connecting' | 'ready' | 'premium_required' | 'error'

export interface PlayerState {
  status: PlayerStatus
  deviceId: string | null
  paused: boolean
  /** position at positionTimestamp; extrapolate while playing */
  position: number
  positionTimestamp: number
  duration: number
  track: { name: string; artists: string; uri: string } | null
  volume: number
  error: string | null
}

let state: PlayerState = {
  status: 'idle',
  deviceId: null,
  paused: true,
  position: 0,
  positionTimestamp: Date.now(),
  duration: 0,
  track: null,
  volume: 0.8,
  error: null,
}

const listeners = new Set<() => void>()
let player: SdkPlayer | null = null
let sdkLoading: Promise<void> | null = null

function update(partial: Partial<PlayerState>): void {
  state = { ...state, ...partial }
  listeners.forEach((l) => l())
}

export function subscribePlayer(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getPlayerState(): PlayerState {
  return state
}

function loadSdk(): Promise<void> {
  if (window.Spotify) return Promise.resolve()
  if (sdkLoading) return sdkLoading
  sdkLoading = new Promise((resolve) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve()
    const script = document.createElement('script')
    script.src = 'https://sdk.scdn.co/spotify-player.js'
    script.async = true
    document.body.appendChild(script)
  })
  return sdkLoading
}

export async function initPlayer(): Promise<void> {
  if (player || state.status === 'connecting') return
  update({ status: 'connecting' })
  await loadSdk()
  const p = new window.Spotify!.Player({
    name: 'MixSketch',
    getOAuthToken: (cb) => {
      getAccessToken()
        .then(cb)
        .catch(() => {})
    },
    volume: state.volume,
  })
  player = p
  p.addListener('ready', (data: { device_id: string }) =>
    update({ status: 'ready', deviceId: data.device_id, error: null }),
  )
  p.addListener('not_ready', () => update({ deviceId: null }))
  p.addListener('initialization_error', (data: { message: string }) =>
    update({ status: 'error', error: data.message }),
  )
  p.addListener('authentication_error', (data: { message: string }) =>
    update({ status: 'error', error: data.message }),
  )
  p.addListener('account_error', () =>
    update({
      status: 'premium_required',
      error: 'Spotify Premium is required for in-app playback.',
    }),
  )
  p.addListener('player_state_changed', (s: SdkPlaybackState | null) => {
    if (!s) return
    const t = s.track_window?.current_track
    update({
      paused: s.paused,
      position: s.position,
      positionTimestamp: Date.now(),
      duration: s.duration,
      track: t ? { name: t.name, artists: t.artists.map((a) => a.name).join(', '), uri: t.uri } : null,
    })
  })
  await p.connect()
}

export async function togglePlay(): Promise<void> {
  await player?.togglePlay()
}

export async function seekTo(ms: number): Promise<void> {
  await player?.seek(ms)
  update({ position: ms, positionTimestamp: Date.now() })
}

export async function setPlayerVolume(v: number): Promise<void> {
  await player?.setVolume(v)
  update({ volume: v })
}

export function disconnectPlayer(): void {
  player?.disconnect()
  player = null
  update({ status: 'idle', deviceId: null, track: null, paused: true })
}
