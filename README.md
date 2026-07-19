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
- **Click a track** to select it (blue highlight) — a side panel lists every
  other track in the playlist that mixes harmonically from it, and matching
  rows get a traffic-light tint from green (best) to orange (sketchiest):
  - **Perfect (green):** the exact same key
  - **Strong (light green):** ±1 on the wheel in the same ring, or the
    relative major/minor
  - **Good (lime):** ±2 in the same ring, or the directional energy switch —
    minor pairs with the major one number down (5A ↔ 4B), major with the
    minor one number up (8B ↔ 9A), never the reverse
  - **Mood flip (amber):** the parallel key — same tonic, other mode
    (8A ↔ 11B, i.e. A minor ↔ A major)
  - **Spicy (orange):** +5 or +7 in the same ring (1A → 6A / 8A) — a semitone
    shift in pitch

  The panel groups matches by tier, best first; within a tier the closest
  tempo to the selected track sorts first, and each entry shows its BPM delta
  (e.g. "128 BPM (+2)"). Click a track in the panel to jump the selection —
  or **drag a match out of the panel onto the table** to move that track to
  wherever you drop it, exactly as if you'd dragged its row.
- **Edit BPM / key** in the side panel to correct or fill in values manually;
  manual entries persist in SQLite and are never overwritten by lookups.
- **Sort** by clicking the #, Title, Artist, BPM, or Key column headers
  (Key sorts in Camelot order). **Filter** by title or artist with the search
  box.
- **Drag rows to sketch a mix order** (when sorted by # with no filter). The
  custom order is saved per playlist and survives restarts; "Reset to playlist
  order" puts Spotify's order back.
- **Duplicate playlist** (top right of the toolbar) creates a new private
  Spotify playlist containing the tracks in your current sketch order — you
  pick the name first. Great for freezing a finished sketch without touching
  the original playlist.
- **Remove a track** with the ⋯ button at the right edge of its row →
  "Remove from playlist" — this edits the real Spotify playlist (works on
  playlists you own; duplicates are removed one copy at a time).
- **Playback**: hover a row (or select a track) and hit ▶ to play it right in
  the app via Spotify's Web Playback SDK — the tab shows up as a "MixSketch"
  device in Spotify Connect. The bottom player bar has play/pause, a seek
  slider, and volume. **Requires Spotify Premium** (free accounts see a notice
  instead).
- Sessions refresh their Spotify token automatically in the background, so you
  won't have to reconnect after stepping away.

## Roadmap

- Reordering the original playlist on Spotify to match a sketch
