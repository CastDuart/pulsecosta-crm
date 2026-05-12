import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3003,
    proxy: {
      '/api': {
        target: 'https://crm.pulsecosta.es',
        changeOrigin: true,
      },
    },
  },
})
