import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { mixsketchDb } from './server/dbPlugin.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), mixsketchDb()],
  server: {
    // Spotify requires the loopback IP (not "localhost") in redirect URIs,
    // so the app must be served and opened at http://127.0.0.1:5173.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      // GetSongBPM's API has no CORS headers, so browser calls go through the dev server.
      '/api/getsongbpm': {
        target: 'https://api.getsong.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/getsongbpm/, ''),
      },
    },
  },
})
