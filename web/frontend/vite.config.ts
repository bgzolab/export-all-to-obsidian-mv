import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// During development the Vue app runs on 5173 and proxies API calls to the
// FastAPI backend. VITE_API_TARGET exists because the default port may already
// be taken on a developer machine; production uses same-origin `/api`.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': process.env.VITE_API_TARGET || 'http://127.0.0.1:8787',
    },
  },
})
