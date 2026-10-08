import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // These modules load only after choosing a PDF. Include both realms up
  // front so Vite does not re-optimize and reload an open editor at that point.
  optimizeDeps: { include: ['pdfjs-dist/legacy/build/pdf.mjs', 'pdfjs-dist/legacy/build/pdf.worker.mjs'] },
  worker: { format: 'es' },
  build: { rollupOptions: { output: { manualChunks: { supabase: ['@supabase/supabase-js'] } } } },
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['icon.svg', 'pwa-192.png', 'pwa-512.png'],
    manifest: {
      name: 'Candeia — Ministério de Louvor', short_name: 'Candeia',
      description: 'Cultos, escalas e repertórios do seu ministério.',
      lang: 'pt-BR', theme_color: '#171717', background_color: '#faf9f6',
      display: 'standalone', start_url: '/', scope: '/',
      icons: [{ src: '/pwa-192.png', sizes: '192x192', type: 'image/png' }, { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
    },
    workbox: { globPatterns: ['**/*.{js,css,html,png,svg,woff2}'], globIgnores: ['downloads/**', '**/pdf-*.js', '**/pdf.worker-*.js', '**/cifra-pdf-worker-*.js'], navigateFallbackDenylist: [/^\/auth\//, /^\/downloads\//], cleanupOutdatedCaches: true },
  })],
  test: { include: ['src/**/*.test.ts', 'tests/*.test.ts'], environment: 'node' },
} as Parameters<typeof defineConfig>[0]);
