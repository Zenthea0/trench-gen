import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Sur GitHub Pages l'application est servie sous /<nom-du-depot>/ : le workflow fournit BASE_PATH.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Générateur de tranchées',
        short_name: 'Tranchées',
        description: 'Génère des réseaux de tranchées cohérents pour Trench Crusade à partir de vos blocs.',
        lang: 'fr',
        theme_color: '#3b2d20',
        background_color: '#f3ead8',
        display: 'standalone',
        orientation: 'any',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg,json}'] },
    }),
  ],
  build: { target: 'es2022', sourcemap: false },
});
