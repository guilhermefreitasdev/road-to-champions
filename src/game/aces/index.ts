/**
 * "Acerte o ace" (docs/aces.md): video first. The player opens a YouTube link to a real pro ace, watches it and
 * guesses whose it is. Nothing that names the pro is shown before the round ends: the puzzle is only a neutral link
 * ("Assistir ao ace", with t= when verified) and the Daily number; title, channel, description and the facts come
 * out of `reveal` once it is over.
 *
 * API (all pure over the snapshot; the UI keeps the save in localStorage under `rtc:aces:v1`):
 * - Data: `ACES` (src/data/real/aces.ts, every curated ace with its VLR-checked facts), `playableAces()`.
 * - Daily: `acesDailyPuzzle(date)` → { aceId, link, date, number } (São Paulo day, #N as the Daily; no repeat until
 *   the pool cycles; prefers clips whose title does not name the pro, `dailyPool`).
 * - Free: `freeAcePuzzle(seed, filter)` → { aceId, link } | null (seeded; filters by year, tier, neutral titles;
 *   avoids `filter.exclude`, e.g. save.free.recent).
 * - Playing a puzzle (by aceId, so the UI never holds the answer): `guess(aceId, state, guess)` → { state, outcome },
 *   `feedback(aceId, state)` (país, região, função, estreia, colega de time of each wrong guess), `hints(aceId, state)`
 *   (event after 2 misses, team after 4), `result(aceId, state)` (points 5-4-3-2-1 by try), `giveUp`, `settle`,
 *   `reveal(aceId, state)` (null while open), `share(puzzle, state)` (plain text, no emoji).
 * - Save: `AcesSave` (v1) with `emptyAcesSave`, `parseAcesSave`, `recordFree`, `acesStats`.
 * - Guess input: the UI's player autocomplete over the pool (`dailyData().playerList`) gives { playerId, handle };
 *   a typed handle without id also works (`isAnswer`: handle or alias, case/accent-insensitive).
 */
import { ACES, type Ace } from '../../data/real/aces';
import { dailyData } from '../daily';
import type { DailyData } from '../daily/data';
import type { FactsLookup, PlayerFacts } from './facts';
import {
  aceResult,
  guessAce,
  guessFeedback,
  revealAce,
  settleAce,
  shareText,
  visibleHints,
  type AceGuess,
  type AceProgress,
  type AceResult,
  type AceReveal,
  type GuessFeedback,
  type GuessOutcome,
} from './play';
import { acePuzzle, createAcesDaily, pickFreeAce, playablePool, type AceHint, type AcesDaily, type AcePuzzle, type DailyAcePuzzle, type FreeFilter } from './puzzle';

export * from './facts';
export * from './play';
export * from './puzzle';
export { titleNamesPlayer } from './text';
export { ACES };
export type { Ace };

/** Facts of the Daily's player index (country, region, main role, first year, teams per event). */
export function factsFromDaily(data: DailyData): FactsLookup {
  const cache = new Map<string, PlayerFacts | undefined>();
  return (playerId) => {
    if (cache.has(playerId)) return cache.get(playerId);
    const p = data.players.get(playerId);
    const facts: PlayerFacts | undefined = p && {
      playerId,
      handle: p.handle,
      country: p.country,
      region: p.region,
      role: p.role,
      firstYear: p.firstYear,
      teamsAt: (eventId) => (data.byPlayer.get(playerId) ?? []).filter((m) => m.eventId === eventId).map((m) => m.teamId),
    };
    cache.set(playerId, facts);
    return facts;
  };
}

let daily: AcesDaily | null = null;
let facts: FactsLookup | null = null;
const byId = new Map(ACES.map((a) => [a.id, a]));

function aceOf(aceId: string): Ace {
  const a = byId.get(aceId);
  if (!a) throw new Error(`unknown ace ${aceId}`);
  return a;
}

const realFacts = (): FactsLookup => (facts ??= factsFromDaily(dailyData()));

export const playableAces = (): Ace[] => playablePool(ACES);

export function acesDailyPuzzle(date: string): DailyAcePuzzle {
  daily ??= createAcesDaily(ACES);
  return daily.puzzleFor(date);
}

export const freeAcePuzzle = (seed: string | number, filter: FreeFilter = {}): AcePuzzle | null => pickFreeAce(ACES, seed, filter);

/** The puzzle of an ace id (to resume a saved free round). */
export const puzzleOf = (aceId: string): AcePuzzle => acePuzzle(aceOf(aceId));

export const guess = (aceId: string, state: AceProgress, g: AceGuess): { state: AceProgress; outcome: GuessOutcome } => guessAce(state, aceOf(aceId), g);
export const feedback = (aceId: string, state: AceProgress): GuessFeedback[] => guessFeedback(state, aceOf(aceId), realFacts());
export const hints = (aceId: string, state: AceProgress): AceHint[] => visibleHints(state, aceOf(aceId));
export const result = (aceId: string, state: AceProgress): AceResult => aceResult(state, aceOf(aceId));
export const settle = (aceId: string, state: AceProgress, today: string): AceProgress => settleAce(state, aceOf(aceId), today);
export const reveal = (aceId: string, state: AceProgress): AceReveal | null => revealAce(state, aceOf(aceId));
export const share = (puzzle: DailyAcePuzzle, state: AceProgress): string => shareText(puzzle, state, aceOf(puzzle.aceId));
