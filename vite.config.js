import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase/firestore')) {
              return 'firebase-firestore'
            }
            if (id.includes('firebase')) {
              return 'firebase-core'
            }
            if (id.includes('@supabase')) {
              return 'supabase'
            }
            if (id.includes('react') || id.includes('scheduler')) {
              return 'vendor'
            }
          }
        },
      },
    },
  },

})
