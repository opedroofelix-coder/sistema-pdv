import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Geist Sans (decisão #35) precisa ficar no precache do service
        // worker -- senão o PWA instalado tenta buscar a fonte na rede e
        // cai pro fallback (system-ui) toda vez que abre offline.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
      },
      manifest: {
        name: 'Sistema PDV',
        short_name: 'Sistema PDV',
        description: 'Estoque e PDV para revenda de lotes de leilão',
        theme_color: '#c4306a',
        background_color: '#fbf6f8',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
