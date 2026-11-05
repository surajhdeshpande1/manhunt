import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'TAG — Live Manhunt',
        short_name: 'TAG',
        description: 'Real-world manhunt. Hide, run, get tagged.',
        id: '/',
        lang: 'en',
        theme_color: '#0b0b0c',
        background_color: '#0b0b0c',
        display_override: ['standalone', 'minimal-ui'],
        categories: ['games', 'sports'],
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        shortcuts: [
          { name: 'Play', short_name: 'Play', url: '/home', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
          { name: 'Profile', short_name: 'Profile', url: '/home/profile', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
        ],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['splash/**', 'wake.mp4'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          { urlPattern: /^https:\/\/tiles\.openfreemap\.org\/.*/, handler: 'CacheFirst',
            options: { cacheName: 'map-tiles', expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 14 } } },
        ],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 1600 },
});
