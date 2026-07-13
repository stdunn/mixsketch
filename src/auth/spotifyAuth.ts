import { generateCodeVerifier, computeCodeChallenge } from './pkce'

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined
const REDIRECT_URI = `${window.location.origin}/callback`
const SCOPES = 'playlist-read-private playlist-read-collaborative'
const TOKEN_KEY = 'mixsketch:tokens'
const VERIFIER_KEY = 'mixsketch:pkce-verifier'

interface StoredTokens {
  accessToken: string
  refreshToken: string
  /** epoch ms, with a safety margin already subtracted */
  expiresAt: number
}

export function isConfigured(): boolean {
  return Boolean(CLIENT_ID)
}

export function isLoggedIn(): boolean {
  return loadTokens() !== null
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export async function beginLogin(): Promise<void> {
  if (!CLIENT_ID) throw new Error('Missing VITE_SPOTIFY_CLIENT_ID')
  const verifier = generateCodeVerifier()
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  const challenge = await computeCodeChallenge(verifier)
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
  })
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`)
}

export async function completeLogin(code: string): Promise<void> {
  if (!CLIENT_ID) throw new Error('Missing VITE_SPOTIFY_CLIENT_ID')
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  if (!verifier) throw new Error('Login session expired — please try connecting again.')
  await requestTokens(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }),
  )
  sessionStorage.removeItem(VERIFIER_KEY)
}

export async function getAccessToken(): Promise<string> {
  const tokens = loadTokens()
  if (!tokens) throw new Error('Not logged in')
  if (Date.now() < tokens.expiresAt) return tokens.accessToken
  return (await refresh(tokens)).accessToken
}

/** Refresh regardless of expiry — used when the API rejects a token early. */
export async function forceRefresh(): Promise<string> {
  const tokens = loadTokens()
  if (!tokens) throw new Error('Not logged in')
  return (await refresh(tokens)).accessToken
}

/**
 * Proactively refresh the token in the background (every few minutes and on
 * window focus) so the session survives hours of idling without re-auth.
 * Returns a cleanup function; calls onAuthLost if a refresh is rejected.
 */
export function startTokenKeepalive(onAuthLost: () => void): () => void {
  let checking = false
  const check = async () => {
    if (checking) return
    checking = true
    try {
      const tokens = loadTokens()
      if (!tokens) return
      if (Date.now() > tokens.expiresAt - 10 * 60_000) {
        await refresh(tokens)
      }
    } catch {
      onAuthLost()
    } finally {
      checking = false
    }
  }
  const interval = setInterval(() => void check(), 4 * 60_000)
  const onFocus = () => void check()
  window.addEventListener('focus', onFocus)
  document.addEventListener('visibilitychange', onFocus)
  void check()
  return () => {
    clearInterval(interval)
    window.removeEventListener('focus', onFocus)
    document.removeEventListener('visibilitychange', onFocus)
  }
}

function loadTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    return raw ? (JSON.parse(raw) as StoredTokens) : null
  } catch {
    return null
  }
}

async function requestTokens(body: URLSearchParams): Promise<StoredTokens> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    throw new Error(`Spotify token request failed (${res.status}): ${await res.text()}`)
  }
  const data = await res.json()
  const prev = loadTokens()
  const tokens: StoredTokens = {
    accessToken: data.access_token,
    // Spotify may omit refresh_token on refresh responses; keep the old one.
    refreshToken: data.refresh_token ?? prev?.refreshToken ?? '',
    expiresAt: Date.now() + data.expires_in * 1000 - 60_000,
  }
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens))
  return tokens
}

async function refresh(tokens: StoredTokens): Promise<StoredTokens> {
  if (!tokens.refreshToken) {
    logout()
    throw new Error('Session expired — please connect Spotify again.')
  }
  try {
    return await requestTokens(
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
        client_id: CLIENT_ID!,
      }),
    )
  } catch (err) {
    logout()
    throw err
  }
}
