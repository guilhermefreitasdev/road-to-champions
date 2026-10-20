// Vite plugin for the claude.ai preview build (used by vite.config.ts). Plain JS so the app's tsconfig needs no Node
// types.
//
// With VITE_INLINE_PLACES=1:
// - the virtual module `virtual:rtc-places-inline` (imported lazily by src/data/placeImages.ts, so it lands in a chunk
//   of its own that only the Mapa game loads) exports every screenshot of src/data/game/places.json as a smaller WebP
//   data URL (480x270, quality 55, made here with sharp);
// - the virtual modules `virtual:rtc-game-media-inline/<kind>` (minimaps, abilities, weapons; imported lazily by
//   src/data/gameMedia.ts, one chunk per kind) do the same for the local game media listed in
//   src/data/game/game-media.json, in small sizes (GAME_MEDIA_INLINE); a listed file missing on disk is skipped (the
//   game then falls back to the remote URL);
// - the copies of public/media/{places,minimaps,abilities,weapons}/ are removed from dist/ after the build (the
//   preview cannot publish that many files).
// Otherwise the modules are empty and the game serves the files from public/.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ID = 'virtual:rtc-places-inline';
const MEDIA_ID = 'virtual:rtc-game-media-inline/';

/** Inline size per kind of game media: minimaps keep their framing (resize only), alpha kept. */
const GAME_MEDIA_INLINE = {
  minimaps: { size: 512, webp: { quality: 70, alphaQuality: 90 } },
  abilities: { size: 96, webp: { quality: 70, alphaQuality: 90 } },
  weapons: { size: 240, webp: { quality: 70, alphaQuality: 90 } },
};

const dataUrl = (buf) => `data:image/webp;base64,${buf.toString('base64')}`;

async function placesModule() {
  const { places } = JSON.parse(readFileSync(path.join(ROOT, 'src/data/game/places.json'), 'utf8'));
  const images = {};
  for (const p of places) {
    const buf = await sharp(path.join(ROOT, 'public', p.file)).resize(480, 270, { fit: 'cover' }).webp({ quality: 55 }).toBuffer();
    images[p.file] = dataUrl(buf);
  }
  return images;
}

async function gameMediaModule(kind, warn) {
  const spec = GAME_MEDIA_INLINE[kind];
  if (!spec) return {};
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'src/data/game/game-media.json'), 'utf8'));
  const images = {};
  for (const entry of Object.values(manifest[kind] ?? {})) {
    const file = path.join(ROOT, 'public', entry.file);
    if (!existsSync(file)) {
      warn(`game media listed but missing: public/${entry.file}`);
      continue;
    }
    const buf = await sharp(file).resize({ width: spec.size, height: spec.size, fit: 'inside', withoutEnlargement: true }).webp(spec.webp).toBuffer();
    images[entry.file] = dataUrl(buf);
  }
  return images;
}

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
      return source === ID || source.startsWith(MEDIA_ID) ? `\0${source}` : null;
    },
    async load(id) {
      if (id === `\0${ID}`) return `export default ${enabled ? JSON.stringify(await placesModule()) : '{}'};`;
      if (id.startsWith(`\0${MEDIA_ID}`)) {
        const kind = id.slice(MEDIA_ID.length + 1);
        return `export default ${enabled ? JSON.stringify(await gameMediaModule(kind, (m) => this.warn(m))) : '{}'};`;
      }
      return null;
    },
    closeBundle() {
      if (!enabled || command !== 'build') return;
      for (const dir of ['places', 'minimaps', 'abilities', 'weapons']) rmSync(path.join(outDir, 'media', dir), { recursive: true, force: true });
    },
  };
}
