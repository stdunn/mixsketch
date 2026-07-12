# MixSketch

A local app for sketching out DJ mixes from your Spotify playlists. View your
playlists, see each track's BPM and Camelot key, and click any track to find
the other tracks in the playlist that are harmonically compatible.

> **Why no Spotify BPM/key?** Spotify removed the Audio Features API for apps
> registered after Nov 27, 2024, so key/BPM data comes from
> [GetSongBPM](https://getsongbpm.com) instead and is cached in localStorage.

## Setup

1. **Spotify Client ID** — in the
   [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), open
   your app and add this Redirect URI (must be `127.0.0.1`, not `localhost`):

   ```
   http://127.0.0.1:5173/callback
   ```

   Then copy the Client ID into `.env.local`:

   ```
   VITE_SPOTIFY_CLIENT_ID=your_client_id_here
   ```

2. **GetSongBPM API key** (optional but needed for BPM/key data) — get a free
   key at [getsongbpm.com/api](https://getsongbpm.com/api) and add it:

   ```
   VITE_GETSONGBPM_API_KEY=your_key_here
   ```

3. Run it:

   ```
   npm install
   npm run dev
   ```

   Open **http://127.0.0.1:5173** (use the IP, not `localhost` — Spotify's
   OAuth redirect and the browser storage are tied to that origin).

## Usage

- **Connect Spotify** logs in via OAuth (Authorization Code + PKCE, no backend;
  tokens stay in your browser's localStorage).
- The home page lists your playlists; click one to see its tracks with BPM and
  Camelot key columns (looked up lazily and cached, so the first visit to a
  playlist is slower than later ones).
- **Click a track** to select it — a side panel shows every other track in the
  playlist that's in key (same Camelot code, ±1 on the wheel in the same ring,
  or the relative major/minor). Compatible rows also get a green key badge in
  the table. Click a track in the panel to jump the selection to it.

## Roadmap

- Manual BPM/key overrides
- Filter by title/artist, sort by BPM / Camelot key
- Drag-and-drop mix ordering and saving as a new Spotify playlist
