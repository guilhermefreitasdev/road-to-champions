/**
 * Images of the Mapa game (VALORANT Wiki screenshots, src/data/game/places.json). Regular builds serve the files from
 * public/media/places/ (hashed names: the URL says neither the map nor the callout). Builds made with
 * VITE_INLINE_PLACES=1 (the claude.ai preview, which cannot publish many files) get smaller copies as data URLs in a
 * chunk of their own, generated at build time by scripts/places-inline-plugin.mjs and loaded only by the Mapa game.
 */
import { publicUrl } from './publicUrl';

export const PLACES_INLINED = import.meta.env.VITE_INLINE_PLACES === '1';

let inlined: Promise<Record<string, string>> | null = null;

/** The URL to show for a place file right away, or null when it has to be loaded first (inlined builds). */
export function placeImageNow(file: string): string | null {
  return PLACES_INLINED ? null : publicUrl(file);
}

/** The URL of a place file: the public file, or its inlined copy (falls back to the file if it is missing). */
export function loadPlaceImage(file: string): Promise<string> {
  if (!PLACES_INLINED) return Promise.resolve(publicUrl(file));
  inlined ??= import('virtual:rtc-places-inline').then((m) => m.default);
  return inlined.then((images) => images[file] ?? publicUrl(file)).catch(() => publicUrl(file));
}
