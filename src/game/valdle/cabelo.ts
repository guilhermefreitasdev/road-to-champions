/**
 * "Valdle — Pelo cabelo" (Cena pro): guess the pro from a photo that starts with only its top band (the hair) and
 * grows downward with every miss, while hints open one by one. Pure: built from the pro index (../daily/data.ts) and
 * a lookup of the local photos (src/data/media.ts, Liquipedia), both passed in. Every hint is a field of the pool;
 * an unknown one reads "—", never a guess.
 */
import type { Region, Role } from '../../engine/types';
import { placementRank } from '../daily/data';
import { pickBand, type Maker } from './planner';
import type { ProFacts, ProIndex } from './pro';

/** A local player photo (public/<path>): the event it was taken at (null = the player's current photo). */
export interface CabeloPhoto {
  /** Path under public/ (its file name names the player: the UI never puts it in the DOM). */
  path: string;
  eventId: string | null;
  /** File description page at the source (credit and license), shown only at the end. */
  sourceUrl: string;
}

export interface CabeloPuzzle {
  answer: string;
  photo: CabeloPhoto;
}

/**
 * Share of the photo shown from the top, by misses so far (0 misses = only the hair); the whole photo at the end.
 * One step per try of VALDLE_GAMES.cabelo.maxTries.
 */
export const CABELO_REVEAL = [0.22, 0.35, 0.5, 0.65, 0.8, 0.9] as const;

export function cabeloReveal(misses: number, done: boolean): number {
  if (done) return 1;
  return CABELO_REVEAL[Math.max(0, Math.min(CABELO_REVEAL.length - 1, misses))]!;
}

/** Smallest photo side accepted (pixels of the local WebP; the pipeline writes 128x128 crops of sources >= 200px). */
export const CABELO_MIN_PHOTO_PX = 128;

/** No player repeats within this many days. */
export const CABELO_GAP = 180;

export interface CabeloTitle {
  eventId: string;
  /** Event name with its year ("Champions 2022"). */
  label: string;
}

/** The hints of one answer, in the order they open (after 1, 2, 3, 4 and 5 misses). */
export interface CabeloHints {
  /** Won an international event (Masters or Champions) in our data. */
  intlTitle: boolean;
  /** Those events, oldest first. */
  titles: CabeloTitle[];
  role: Role;
  region: Region | null;
  /** ISO code ('' = unknown). */
  country: string;
  /** Team of the most recent card. */
  lastTeamName: string;
}

export const CABELO_HINT_AT = { intlTitle: 1, titles: 2, roleRegion: 3, country: 4, team: 5 } as const;

export function cabeloHints(index: Pick<ProIndex, 'data'>, f: ProFacts): CabeloHints {
  const p = index.data.players.get(f.id);
  const seen = new Set<string>();
  const titles: CabeloTitle[] = [];
  for (const { entry } of p?.cards ?? []) {
    if ((entry.tier ?? 'international') !== 'international' || placementRank(entry.placement) !== 1 || seen.has(entry.eventId)) continue;
    seen.add(entry.eventId);
    const name = index.data.events.get(entry.eventId)?.name ?? entry.eventId;
    titles.push({ eventId: entry.eventId, label: name.includes(String(entry.year)) ? name : `${name} ${entry.year}` });
  }
  return { intlTitle: titles.length > 0, titles, role: f.role, region: f.region, country: f.country, lastTeamName: f.lastTeamName };
}

/**
 * The answers: unique handles with a local photo and the hints known (country and region), most famous first (the
 * weekly curve picks Monday from the top). `photoOf` gives the photo of the most recent card, else any.
 */
export function cabeloPool(index: ProIndex, photoOf: (f: ProFacts) => CabeloPhoto | null): { facts: ProFacts; photo: CabeloPhoto }[] {
  const out: { facts: ProFacts; photo: CabeloPhoto }[] = [];
  for (const f of index.usable) {
    if (!f.country || !f.region) continue;
    const photo = photoOf(f);
    if (photo) out.push({ facts: f, photo });
  }
  return out;
}

export function cabeloMaker(pool: readonly { facts: ProFacts; photo: CabeloPhoto }[]): Maker<CabeloPuzzle> {
  if (!pool.length) throw new Error('cabelo: empty pool');
  return ({ rng, level, recent }) => {
    const p = pickBand(rng, pool, level, (x, g) => !recent(CABELO_GAP * g).has(`player:${x.facts.id}`), 0.5) ?? pool[0]!;
    return { puzzle: { answer: p.facts.id, photo: { ...p.photo } }, keys: [`player:${p.facts.id}`] };
  };
}
