/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages のサブパス配信に対応（リポジトリ名）
const build = `${(process.env.GITHUB_SHA ?? 'dev').slice(0, 7)} / ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;

export default defineConfig({
  define: { __BUILD__: JSON.stringify(build) },
  base: process.env.BASE_PATH ?? '/buhilog/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'ぶひろぐ',
        short_name: 'ぶひろぐ',
        description: '困りごとと対処法を記録し、自分の傾向を見つけるセルフモニタリング',
        lang: 'ja',
        theme_color: '#ff8fa8',
        background_color: '#fff6ee',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { skipWaiting: true, clientsClaim: true, cleanupOutdatedCaches: true, globPatterns: ['**/*.{js,css,html,svg,png,webp}'] },
    }),
  ],
  test: { environment: 'jsdom', globals: true, setupFiles: ['tests/setup.ts'] },
});
