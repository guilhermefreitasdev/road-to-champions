// Vite plugin for the claude.ai preview build (used by vite.config.ts). Plain JS so the app's tsconfig needs no Node
// types.
//
// With VITE_INLINE_PLACES=1, the virtual module `virtual:rtc-places-inline` (imported lazily by src/data/placeImages.ts,
// so it lands in a chunk of its own that only the Mapa game loads) exports every screenshot of
// src/data/game/places.json as a smaller WebP data URL (480x270, quality 55, made here with sharp), and the copies of
// public/media/places/ are removed from dist/ after the build (the preview cannot publish that many files).
// Otherwise the module is empty and the game serves the files from public/.
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ID = 'virtual:rtc-places-inline';
const RESOLVED = `\0${ID}`;

/** @param {boolean} enabled @returns {import('vite').Plugin} */
export function placesInline(enabled) {
  let outDir = '';
  let command = 'serve';
  return {
    name: 'rtc-places-inline',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
      command = config.command;
    },
    resolveId(source) {
      return source === ID ? RESOLVED : null;
    },
    async load(id) {
      if (id !== RESOLVED) return null;
      if (!enabled) return 'export default {};';
      const { places } = JSON.parse(readFileSync(path.join(ROOT, 'src/data/game/places.json'), 'utf8'));
      const images = {};
      for (const p of places) {
        const buf = await sharp(path.join(ROOT, 'public', p.file)).resize(480, 270, { fit: 'cover' }).webp({ quality: 55 }).toBuffer();
        images[p.file] = `data:image/webp;base64,${buf.toString('base64')}`;
      }
      return `export default ${JSON.stringify(images)};`;
    },
    closeBundle() {
      if (enabled && command === 'build') rmSync(path.join(outDir, 'media', 'places'), { recursive: true, force: true });
    },
  };
}
