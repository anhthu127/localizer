import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { mockApi } from './server/mock_api.ts'

// https://vite.dev/config/
export default defineConfig({
  // `mockApi` is the stand-in backend on /api — see server/mock_api.ts.
  // Delete it once the real service exists and set VITE_API_URL instead.
  plugins: [react(), tailwindcss(), mockApi()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
