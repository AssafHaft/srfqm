import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  // Relative base so the same build works at https://<user>.github.io/<repo>/ or any other path.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'מחולל הצעות מחיר – SRF PARK TLV',
        short_name: 'הצעות מחיר',
        description: 'יצירת הצעות מחיר ממותגות וייצוא ל-PDF',
        lang: 'he',
        dir: 'rtl',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f3f6f7',
        theme_color: '#2b4a54',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
});
