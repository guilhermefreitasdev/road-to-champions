/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { pwa } from './scripts/pwa-plugin.mjs';

export default defineConfig(({ mode }) => {
  // The claude.ai preview build (player photos inlined) gets no service worker and no manifest link.
  const inline = loadEnv(mode, '.', 'VITE_').VITE_INLINE_PLAYER_PHOTOS === '1';
  return {
    // Served from the domain root (Vercel).
    base: '/',
    plugins: [react(), pwa(inline)],
    test: {
      include: ['src/**/*.test.ts'],
    },
  };
});
