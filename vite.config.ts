/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { placesInline } from './scripts/places-inline-plugin.mjs';
import { pwa } from './scripts/pwa-plugin.mjs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  // The claude.ai preview build (player photos inlined) gets no service worker and no manifest link.
  const inline = env.VITE_INLINE_PLAYER_PHOTOS === '1';
  // VITE_INLINE_PLACES=1 (also for the preview): the Mapa game's screenshots as smaller data URLs in a lazy chunk.
  const inlinePlaces = env.VITE_INLINE_PLACES === '1';
  return {
    // Served from the domain root (Vercel).
    base: '/',
    plugins: [react(), placesInline(inlinePlaces), pwa(inline)],
    test: {
      include: ['src/**/*.test.ts'],
    },
  };
});
