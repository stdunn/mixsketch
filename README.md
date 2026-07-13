# MixSketch

A local app for sketching out DJ mixes from your Spotify playlists. View your
playlists, see each track's BPM and Camelot key, and click any track to find
the other tracks in the playlist that are harmonically compatible.

> **Where does BPM/key come from?** Spotify removed the Audio Features API for
> apps registered after Nov 27, 2024, but older apps still have access. MixSketch
> probes the endpoint at runtime: if your Spotify app is grandfathered in, data
> comes straight from Spotify (batched, fast); otherwise it falls back to
> [GetSongBPM](https://getsongbpm.com). Either way, results — along with manual
> edits and your custom track orders — persist in a local SQLite database at
> `data/mixsketch.db`, served through the Vite dev server (no separate backend;
> uses Node 24's built-in `node:sqlite`).

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

2. **GetSongBPM API key** (optional — only needed for BPM/key data if your
   Spotify app was created after Nov 27, 2024) — get a free key at
   [getsongbpm.com/api](https://getsongbpm.com/api) and add it:

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
  playlist that mixes harmonically from it: same Camelot code, ±1 or ±2 on the
  wheel in the same ring, the relative major/minor, and the energy switch
  (minor → major one number down, major → minor one number up, e.g. 5A → 4B,
  8B → 9A). Compatible rows also get a green key badge in the table. Click a
  track in the panel to jump the selection to it.
- **Edit BPM / key** in the side panel to correct or fill in values manually;
  manual entries persist in SQLite and are never overwritten by lookups.
- **Sort** by clicking the #, Title, Artist, BPM, or Key column headers
  (Key sorts in Camelot order). **Filter** by title or artist with the search
  box.
- **Drag rows to sketch a mix order** (when sorted by # with no filter). The
  custom order is saved per playlist and survives restarts; "Reset to playlist
  order" puts Spotify's order back.
- Sessions refresh their Spotify token automatically in the background, so you
  won't have to reconnect after stepping away.

## Roadmap

- Saving a sketched order as a new Spotify playlist
