import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Connect, Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

// Persistent local storage for key/BPM data and custom playlist orders,
// served by the Vite dev server so the SPA needs no separate backend.

interface TrackDataRow {
  track_id: string
  bpm: number | null
  camelot_key: string | null
  key_name: string | null
  source: string
  fetched_at: number
}

function openDb(root: string): DatabaseSync {
  const dir = path.join(root, 'data')
  fs.mkdirSync(dir, { recursive: true })
  const db = new DatabaseSync(path.join(dir, 'mixsketch.db'))
  db.exec(`
    CREATE TABLE IF NOT EXISTS track_data (
      track_id   TEXT PRIMARY KEY,
      bpm        REAL,
      camelot_key TEXT,
      key_name   TEXT,
      source     TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS playlist_order (
      playlist_id TEXT NOT NULL,
      position    INTEGER NOT NULL,
      track_id    TEXT NOT NULL,
      PRIMARY KEY (playlist_id, position)
    );
  `)
  return db
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : null)
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

export function mixsketchDb(): Plugin {
  let db: DatabaseSync

  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    // req.url has the /api/db prefix already stripped by middlewares.use()
    const url = new URL(req.url ?? '/', 'http://localhost')
    try {
      // POST /keys/get {ids: string[]} → {[trackId]: info}
      if (req.method === 'POST' && url.pathname === '/keys/get') {
        const body = (await readJsonBody(req)) as { ids?: string[] }
        const ids = (body?.ids ?? []).filter((id) => typeof id === 'string')
        const result: Record<string, unknown> = {}
        const stmt = db.prepare('SELECT * FROM track_data WHERE track_id = ?')
        for (const id of ids) {
          const row = stmt.get(id) as TrackDataRow | undefined
          if (row) {
            result[row.track_id] = {
              bpm: row.bpm,
              camelotKey: row.camelot_key,
              keyName: row.key_name,
              source: row.source,
              fetchedAt: row.fetched_at,
            }
          }
        }
        return sendJson(res, 200, result)
      }

      // POST /keys/set {entries: {[trackId]: info}} → upsert
      if (req.method === 'POST' && url.pathname === '/keys/set') {
        const body = (await readJsonBody(req)) as {
          entries?: Record<
            string,
            { bpm: number | null; camelotKey: string | null; keyName: string | null; source: string; fetchedAt: number }
          >
        }
        const entries = Object.entries(body?.entries ?? {})
        const stmt = db.prepare(`
          INSERT INTO track_data (track_id, bpm, camelot_key, key_name, source, fetched_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(track_id) DO UPDATE SET
            bpm = excluded.bpm,
            camelot_key = excluded.camelot_key,
            key_name = excluded.key_name,
            source = excluded.source,
            fetched_at = excluded.fetched_at
        `)
        db.exec('BEGIN')
        try {
          for (const [id, info] of entries) {
            stmt.run(id, info.bpm, info.camelotKey, info.keyName, info.source, info.fetchedAt)
          }
          db.exec('COMMIT')
        } catch (err) {
          db.exec('ROLLBACK')
          throw err
        }
        return sendJson(res, 200, { saved: entries.length })
      }

      // GET /order?playlist=<id> → {order: string[] | null}
      if (req.method === 'GET' && url.pathname === '/order') {
        const playlistId = url.searchParams.get('playlist')
        if (!playlistId) return sendJson(res, 400, { error: 'playlist param required' })
        const rows = db
          .prepare('SELECT track_id FROM playlist_order WHERE playlist_id = ? ORDER BY position')
          .all(playlistId) as { track_id: string }[]
        return sendJson(res, 200, { order: rows.length ? rows.map((r) => r.track_id) : null })
      }

      // PUT /order?playlist=<id> {order: string[]} → replace custom order
      // DELETE /order?playlist=<id> → reset to Spotify order
      if ((req.method === 'PUT' || req.method === 'DELETE') && url.pathname === '/order') {
        const playlistId = url.searchParams.get('playlist')
        if (!playlistId) return sendJson(res, 400, { error: 'playlist param required' })
        db.exec('BEGIN')
        try {
          db.prepare('DELETE FROM playlist_order WHERE playlist_id = ?').run(playlistId)
          if (req.method === 'PUT') {
            const body = (await readJsonBody(req)) as { order?: string[] }
            const order = (body?.order ?? []).filter((id) => typeof id === 'string')
            const stmt = db.prepare(
              'INSERT INTO playlist_order (playlist_id, position, track_id) VALUES (?, ?, ?)',
            )
            order.forEach((trackId, i) => stmt.run(playlistId, i, trackId))
          }
          db.exec('COMMIT')
        } catch (err) {
          db.exec('ROLLBACK')
          throw err
        }
        return sendJson(res, 200, { ok: true })
      }

      next()
    } catch (err) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) })
    }
  }

  return {
    name: 'mixsketch-db',
    configureServer(server) {
      db = openDb(server.config.root)
      server.middlewares.use('/api/db', handler)
    },
  }
}
