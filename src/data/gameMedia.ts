/**
 * Local copies of the images the Valdle used to hot-link from media.valorant-api.com (map minimaps, ability icons,
 * weapon icons): `npm run data:game-media` (scripts/fetch-game-data.mjs) writes them to public/media/{minimaps,
 * abilities,weapons}/ and lists them in src/data/game/game-media.json, keyed by the source URL. A local file is used
 * when the manifest lists it; the remote URL stays as the fallback. Builds made with VITE_INLINE_PLACES=1 (the claude.ai
 * preview) get smaller copies as data URLs from a lazy chunk per kind (scripts/places-inline-plugin.mjs).
 */
import manifestJson from './game/game-media.json';
import { publicUrl } from './publicUrl';

export type GameMediaKind = 'minimaps' | 'abilities' | 'weapons';

export interface GameMediaEntry {
  /** Path under public/. */
  file: string;
  /** What it shows (map, "Agent Slot" or weapon), for people reading the manifest. */
  label: string;
  width: number;
  height: number;
}

const manifest = manifestJson as unknown as Record<GameMediaKind, Record<string, GameMediaEntry>>;

const INLINED = import.meta.env.VITE_INLINE_PLACES === '1';

/** The manifest entry of a remote image, or undefined when there is no local copy. */
export function gameMediaEntry(kind: GameMediaKind, remote: string): GameMediaEntry | undefined {
  return manifest[kind]?.[remote];
}

const inlined: Partial<Record<GameMediaKind, Promise<Record<string, string>>>> = {};

function inlineModule(kind: GameMediaKind): Promise<Record<string, string>> {
  // One literal import per kind, so each kind is a chunk of its own (Callout never loads the ability icons).
  const load =
    kind === 'minimaps'
      ? import('virtual:rtc-game-media-inline/minimaps')
      : kind === 'abilities'
        ? import('virtual:rtc-game-media-inline/abilities')
        : import('virtual:rtc-game-media-inline/weapons');
  return load.then((m) => m.default).catch(() => ({}));
}

/**
 * The URLs to try for a remote image, best first: the local copy (or its inlined data URL), then the remote URL.
 * Synchronous (null) when the list needs the lazy inline chunk first; see `gameMediaCandidates`.
 */
export function gameMediaCandidatesNow(kind: GameMediaKind, remote: string | null): string[] | null {
  if (!remote) return [];
  const entry = gameMediaEntry(kind, remote);
  if (!entry) return [remote];
  if (INLINED) return null;
  return [publicUrl(entry.file), remote];
}

export function gameMediaCandidates(kind: GameMediaKind, remote: string | null): Promise<string[]> {
  const now = gameMediaCandidatesNow(kind, remote);
  if (now) return Promise.resolve(now);
  const entry = gameMediaEntry(kind, remote!)!;
  inlined[kind] ??= inlineModule(kind);
  return inlined[kind].then((images) => [images[entry.file] ?? publicUrl(entry.file), remote!]);
}
