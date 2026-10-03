import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages project site: https://dejansandic14.github.io/pwa-todo/
const base = '/pwa-todo/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // Our own service worker: the plugin compiles src/sw.ts to sw.js and only injects
      // the precache file list (built js/css/html + manifest + icons) into `self.__WB_MANIFEST`.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // Registration is done by hand in src/main.tsx; do not inject a script tag.
      injectRegister: null,
      devOptions: {
        enabled: true,
        type: 'module',
      },
      manifest: {
        id: base,
        name: 'PWA Todo',
        short_name: 'Todo',
        description: 'Lista zadataka i vrijeme u Banjoj Luci — radi i bez interneta.',
        lang: 'sr-Latn',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f3f4f6',
        theme_color: '#1d4ed8',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
