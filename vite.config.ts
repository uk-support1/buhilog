/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages のサブパス配信に対応（リポジトリ名）
export default defineConfig({
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
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg}'] },
    }),
  ],
  test: { environment: 'jsdom', globals: true, setupFiles: ['tests/setup.ts'] },
});
