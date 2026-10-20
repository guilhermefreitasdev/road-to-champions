/**
 * Puzzles of "Acerte o ace" (video first, docs/aces.md): the player plays the ace in a click-to-load YouTube embed
 * and guesses whose it is. Map, agent and round are in the video, so they are never hints; the hints are facts the
 * video does not necessarily show (the event and stage, then the pro's team), unlocked by wrong guesses.
 *
 * - `playablePool`: only aces with a checked, embeddable (or not yet checked) video and a pool player as the answer.
 * - Daily (`createAcesDaily`): one ace per São Paulo calendar day (src/game/daily/calendar.ts, #N from the launch),
 *   the same for everyone. The pool (`dailyPool`: only clips whose title does not name the pro when there are
 *   DAILY_MIN_NEUTRAL of them, else all) is walked in cycles: cycle c is a seeded order (createRng("aces:cycle:c"),
 *   never Math.random; neutral titles and oEmbed-confirmed embeds first), so no ace repeats until every ace has been
 *   shown; the order is then repaired so the same pro never appears on two consecutive days (also across cycles).
 * - Free mode (`pickFreeAce`): a seeded draw from the pool with optional filters, avoiding the recently seen ids.
 */
import { createRng, type Rng } from '../../engine/rng';
import type { Ace } from '../../data/real/aces';
import { dayIndex, isDayKey, puzzleNumber } from '../daily/calendar';
import { seriesStageLabel } from '../daily/labels';

export const MAX_TRIES = 5;
/** Points by the try that got it (1st … 5th). */
export const TRY_POINTS = [5, 4, 3, 2, 1] as const;
export const ACE_MAX_POINTS = TRY_POINTS[0];

export type HintKind = 'event' | 'team';
/** Misses needed before each hint shows. */
export const HINT_AFTER: Record<HintKind, number> = { event: 2, team: 4 };
export const HINT_KINDS: readonly HintKind[] = ['event', 'team'];

export interface AceHint {
  kind: HintKind;
  label: string;
  text: string;
}

/**
 * What the UI gets before the answer: the neutral id and what the click-to-load player needs (video id, start, end),
 * nothing else. The title, channel, description, watch URL and every fact of the ace stay in the entry and come out
 * only through `revealAce` once the round ends. The UI shows its own neutral placeholder (no YouTube thumbnail) and
 * builds the YouTube player (youtube-nocookie, `embedPlayerVars`: no native controls) only on the player's click and
 * removes it whenever it pauses or ends. YouTube's own player UI is never covered, so it may still show the title for a
 * few seconds when it starts or on hover, which is why the Daily prefers clips whose title does not name the pro.
 */
export interface AcePuzzle {
  /** Neutral id (VLR match, map game id, round): it never names the player. */
  aceId: string;
  embed: AceEmbed;
}

export interface AceEmbed {
  videoId: string;
  /** Seconds, only when verified from a cited source; null = from the start / to the end. */
  start: number | null;
  end: number | null;
}

export interface DailyAcePuzzle extends AcePuzzle {
  date: string;
  /** "#N" since the Daily launch. */
  number: number;
}

/** Label of the placeholder button. */
export const WATCH_LABEL = 'Assistir ao ace';
export const EMBED_HOST = 'https://www.youtube-nocookie.com/embed/';

/**
 * The plain iframe src, used only when the IFrame Player API cannot load (then YouTube's native controls are the only
 * ones; normally the player is built by the API with `embedPlayerVars`): youtube-nocookie, only the ace (start/end when verified), no related
 * videos from other channels, inline on phones, and autoplay only because it is loaded by the player's click.
 */
export function embedSrc(e: AceEmbed): string {
  const q = [e.start ? `start=${e.start}` : null, e.end ? `end=${e.end}` : null, 'rel=0', 'playsinline=1', 'autoplay=1'].filter(Boolean);
  return `${EMBED_HOST}${e.videoId}?${q.join('&')}`;
}

/** Host of the IFrame Player API player (same privacy-enhanced domain as `embedSrc`). */
export const PLAYER_HOST = 'https://www.youtube-nocookie.com';

/** The IFrame Player API `playerVars` of the click-to-load player (docs/aces.md, "Player"). */
export interface AcePlayerVars {
  autoplay: 1;
  /** No native controls (title bar, progress, share): our own bar under the player drives it through the API. */
  controls: 0;
  disablekb: 1;
  fs: 0;
  rel: 0;
  iv_load_policy: 3;
  playsinline: 1;
  cc_load_policy: 0;
  enablejsapi: 1;
  start?: number;
  end?: number;
}

/**
 * playerVars for the API player: no native controls, keyboard, fullscreen, annotations or captions, related videos
 * only from the same channel, inline on phones and autoplay (it is created by the player's click). `from` resumes at
 * that second (whole seconds, never before the verified start); `end` only when verified.
 */
export function embedPlayerVars(e: AceEmbed, from: number | null = null): AcePlayerVars {
  const vars: AcePlayerVars = { autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, iv_load_policy: 3, playsinline: 1, cc_load_policy: 0, enablejsapi: 1 };
  const start = Math.max(e.start ?? 0, Math.floor(from ?? 0));
  if (start > 0) vars.start = start;
  if (e.end) vars.end = e.end;
  return vars;
}

/** The original video on YouTube (with `t=` when a start time was verified), for the reveal's credit link. */
export function watchUrl(video: { url: string; start: number | null }): string {
  return video.start ? `${video.url}&t=${video.start}s` : video.url;
}

/** "Champions 2022 · Playoffs · Grande final" (event short name, then VLR's stage and round in pt-BR). */
export function eventHintText(ace: Ace): string {
  const stage = seriesStageLabel(ace.stage, ace.seriesRound);
  const name = ace.event.name ?? (ace.event.year ? String(ace.event.year) : 'Evento');
  return stage ? `${name} · ${stage}` : name;
}

/** Hints in unlock order (see HINT_AFTER): facts the video does not necessarily show. */
export function aceHints(ace: Ace): AceHint[] {
  return [
    { kind: 'event', label: 'Evento', text: eventHintText(ace) },
    { kind: 'team', label: 'Time do pro', text: ace.team.name },
  ];
}

export function acePuzzle(ace: Ace): AcePuzzle {
  if (!ace.youtube) throw new Error(`ace ${ace.id} has no video`);
  const y = ace.youtube;
  return { aceId: ace.id, embed: { videoId: y.videoId, start: y.start, end: y.end } };
}

/**
 * Aces the modes can play: a checked video that YouTube has not refused to embed (embeddable true, or null = not
 * checked yet) and a pool player as the answer; sorted by id (stable).
 */
export function playablePool(aces: readonly Ace[]): Ace[] {
  return aces.filter((a) => a.video && a.youtube && a.youtube.embeddable !== false && a.playerId).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const playerKey = (a: Ace): string => a.playerId ?? `vlr:${a.vlrPlayerId}`;

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Swaps aces so that no two neighbours share a pro (`prev` = the last ace of the cycle before). Best effort. */
function spreadPlayers(order: Ace[], prev: Ace | undefined): Ace[] {
  const out = [...order];
  const keyAt = (k: number): string | undefined => (k < 0 ? (prev ? playerKey(prev) : undefined) : k < out.length ? playerKey(out[k]!) : undefined);
  const clash = (k: number): boolean => keyAt(k) === keyAt(k - 1) || keyAt(k) === keyAt(k + 1);
  for (let i = 0; i < out.length; i++) {
    if (keyAt(i) !== keyAt(i - 1)) continue;
    for (let k = 0; k < out.length; k++) {
      if (k === i) continue;
      [out[i], out[k]] = [out[k]!, out[i]!];
      if (!clash(i) && !clash(k)) break;
      [out[i], out[k]] = [out[k]!, out[i]!];
    }
  }
  return out;
}

export interface AcesDaily {
  /** The playable pool the days walk through. */
  pool: readonly Ace[];
  /** The ace of a day (launch day or later); throws on an invalid key, a day before the launch or an empty pool. */
  puzzleFor(date: string): DailyAcePuzzle;
}

/** Neutral-titled clips needed for the Daily to use only them (below this, every playable ace, neutral ones first). */
export const DAILY_MIN_NEUTRAL = 14;

const isNeutral = (a: Ace): boolean => !a.youtube?.titleRevealsPlayer;

/** The Daily's pool: the neutral-titled clips when there are DAILY_MIN_NEUTRAL of them, else every playable ace. */
export function dailyPool(aces: readonly Ace[]): { pool: Ace[]; neutralOnly: boolean } {
  const all = playablePool(aces);
  const neutral = all.filter(isNeutral);
  return neutral.length >= DAILY_MIN_NEUTRAL ? { pool: neutral, neutralOnly: true } : { pool: all, neutralOnly: false };
}

export function createAcesDaily(aces: readonly Ace[]): AcesDaily {
  const { pool, neutralOnly } = dailyPool(aces);
  // Each cycle shows the best clips first: neutral title (when the pool is mixed), then embedding confirmed by
  // oEmbed; seeded order within each group.
  const rank = (a: Ace): number => (neutralOnly || isNeutral(a) ? 0 : 2) + (a.youtube?.embeddable === true ? 0 : 1);
  const order = (rng: Rng): Ace[] => [0, 1, 2, 3].flatMap((g) => shuffled(pool.filter((a) => rank(a) === g), rng));
  const cycles: Ace[][] = [];
  const cycle = (c: number): Ace[] => {
    while (cycles.length <= c) {
      const n = cycles.length;
      const prev = n > 0 ? cycles[n - 1]![cycles[n - 1]!.length - 1] : undefined;
      cycles.push(spreadPlayers(order(createRng(`aces:cycle:${n}`)), prev));
    }
    return cycles[c]!;
  };
  return {
    pool,
    puzzleFor(date) {
      if (!isDayKey(date)) throw new Error(`invalid day key: ${date}`);
      const i = dayIndex(date);
      if (i < 0) throw new Error(`${date} is before the Daily launch`);
      if (!pool.length) throw new Error('no playable aces');
      const ace = cycle(Math.floor(i / pool.length))[i % pool.length]!;
      return { ...acePuzzle(ace), date, number: puzzleNumber(date) };
    },
  };
}

export interface FreeFilter {
  yearFrom?: number;
  yearTo?: number;
  /** 'masters' | 'champions' | 'regional'. */
  tier?: string;
  /** Only clips whose title does not name the pro. */
  neutralOnly?: boolean;
  /** Ace ids to avoid (recently played); ignored when they would leave nothing. */
  exclude?: readonly string[];
}

/** Aces of the playable pool that pass a filter (exclusions not applied). */
export function filterPool(aces: readonly Ace[], f: FreeFilter = {}): Ace[] {
  return playablePool(aces).filter(
    (a) =>
      (f.yearFrom === undefined || (a.event.year ?? 0) >= f.yearFrom) &&
      (f.yearTo === undefined || (a.event.year ?? 0) <= f.yearTo) &&
      (f.tier === undefined || a.event.tier === f.tier) &&
      (!f.neutralOnly || isNeutral(a)),
  );
}

/** A seeded free-mode pick (null when the filter leaves nothing). */
export function pickFreeAce(aces: readonly Ace[], seed: string | number, f: FreeFilter = {}): AcePuzzle | null {
  const base = filterPool(aces, f);
  if (!base.length) return null;
  const exclude = new Set(f.exclude ?? []);
  const fresh = base.filter((a) => !exclude.has(a.id));
  const from = fresh.length ? fresh : base;
  return acePuzzle(from[createRng(seed).int(0, from.length - 1)]!);
}
