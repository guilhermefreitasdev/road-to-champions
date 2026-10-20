// Vite plugin for the PWA (used by vite.config.ts). Plain JS so the app's tsconfig needs no Node types.
//
// Emits dist/sw.js from the template src/pwa/sw.js with this build's precache list (every emitted chunk and asset,
// the shell, and the manifest/icons from public/; not public/media (minimaps and Valdle icons included), which the
// worker caches on demand, nor the inlined images of a VITE_INLINE_PLACES build: the Mapa screenshots, a
// multi-megabyte chunk only that game loads, and the game media chunks of src/data/gameMedia.ts) and a version
// hash of that list. Skipped in the claude.ai preview build (VITE_INLINE_PLAYER_PHOTOS=1), whose sandbox does not
// allow service workers; that build also drops the manifest link. Registration: src/ui/sw-register.ts.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const template = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/pwa/sw.js');

/** The chunks of inlined images (scripts/places-inline-plugin.mjs: Mapa screenshots, game media): never precached. */
const INLINE_IDS = ['virtual:rtc-places-inline', 'virtual:rtc-game-media-inline/'];
const isPlacesChunk = (out) => out.type === 'chunk' && out.moduleIds.some((id) => INLINE_IDS.some((v) => id.includes(v)));

/** @param {boolean} inline @returns {import('vite').Plugin} */
export function pwa(inline) {
  let base = '/';
  let publicDir = '';
  return {
    name: 'rtc-pwa',
    apply: 'build',
    configResolved(config) {
      base = config.base;
      publicDir = config.publicDir;
    },
    transformIndexHtml(html) {
      return inline ? html.replace(/\s*<link rel="manifest"[^>]*>/, '') : html;
    },
    generateBundle(_options, bundle) {
      if (inline) return;
      const built = Object.keys(bundle).filter((file) => !file.endsWith('.map') && !file.endsWith('.html') && !isPlacesChunk(bundle[file]));
      const icons = readdirSync(path.join(publicDir, 'icons')).map((file) => `icons/${file}`);
      const precache = ['index.html', 'manifest.webmanifest', 'favicon.svg', ...icons, ...built].sort();
      const source = readFileSync(template, 'utf8');
      const version = createHash('sha256').update(precache.join('\n')).update(source).digest('hex').slice(0, 12);
      const values = { VERSION: version, BASE: base, PRECACHE: precache };
      let filled = source;
      for (const [name, value] of Object.entries(values)) {
        const line = new RegExp(`^const ${name} = (?:'__${name}__'|__${name}__);$`, 'm');
        if (!line.test(filled)) this.error(`src/pwa/sw.js: no "const ${name} = …__${name}__…;" line to fill in`);
        filled = filled.replace(line, () => `const ${name} = ${JSON.stringify(value)};`);
      }
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: filled });
    },
  };
}
