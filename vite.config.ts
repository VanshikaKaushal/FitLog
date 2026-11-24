import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: 'FitLog', short_name: 'FitLog',
        description: 'Your personal workout log, available offline.',
        start_url: '/', scope: '/', display: 'standalone',
        background_color: '#f3f6f4', theme_color: '#f3f6f4',
        icons: [192, 512].map(size => ({
          src: '/icon-' + size + '.png', sizes: size + 'x' + size, type: 'image/png', purpose: 'any maskable',
        })),
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{html,js,css,png,svg,webmanifest}'],
      },
    }),
  ],
})
