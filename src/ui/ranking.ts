/**
 * "Ranking": every card of the real pool (internationals + regional league stages), ranked by OVR. Pure helpers
 * over ALL_ROSTERS so the screen only renders; nothing here invents a number (OVR and the real stats come from
 * src/data/real/cards.ts).
 */
import { ALL_ROSTERS } from '../data/real';
import slim from '../data/real/vlr/slim.json';
import type { AuraTier, Card, Region, Role, RosterEntry } from '../engine/types';

export type Tier = 'international' | 'regional';
export type YearKey = 'all' | number;

export interface RankEntry {
  card: Card;
  entry: RosterEntry;
  tier: Tier;
  region: Region;
  year: number;
  /** Event start date (ISO) when the data has it: orders a player's timeline. */
  date: string;
}

export interface RankFilters {
  year: YearKey;
  tier: Tier | '';
  region: Region | '';
  role: Role | '';
  aura: Exclude<AuraTier, 'rising'> | '';
  query: string;
  /** Only the best card of each player. */
  onePerPlayer: boolean;
}

const DATES = new Map((slim as { slug: string; startDate: string | null }[]).map((e) => [e.slug, e.startDate ?? '']));

let cache: RankEntry[] | null = null;

/** Every card, best OVR first (ties: real rating, then handle). Built once. */
export function rankEntries(): RankEntry[] {
  if (cache) return cache;
  const out: RankEntry[] = [];
  for (const entry of ALL_ROSTERS) {
    for (const card of entry.cards) {
      out.push({
        card,
        entry,
        tier: entry.tier ?? 'international',
        region: entry.region ?? 'americas',
        year: entry.year,
        date: DATES.get(entry.eventId) || `${entry.year}-12-31`,
      });
    }
  }
  out.sort(
    (a, b) =>
      b.card.ovr - a.card.ovr ||
      (b.card.stats?.rating ?? 0) - (a.card.stats?.rating ?? 0) ||
      a.card.handle.localeCompare(b.card.handle) ||
      a.date.localeCompare(b.date),
  );
  cache = out;
  return out;
}

/** Years in the pool, oldest first. */
export function rankYears(): number[] {
  return [...new Set(rankEntries().map((e) => e.year))].sort((a, b) => a - b);
}

const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The ranking for a set of filters, best first. Ranks are positions in this filtered list. */
export function filterRanking(entries: readonly RankEntry[], f: RankFilters): RankEntry[] {
  const q = fold(f.query.trim());
  const seen = new Set<string>();
  const out: RankEntry[] = [];
  for (const e of entries) {
    if (f.year !== 'all' && e.year !== f.year) continue;
    if (f.tier && e.tier !== f.tier) continue;
    if (f.region && e.region !== f.region) continue;
    if (f.role && e.card.role !== f.role) continue;
    if (f.aura && e.card.aura !== f.aura) continue;
    if (q && !fold(e.card.handle).includes(q) && !fold(e.entry.teamName).includes(q)) continue;
    if (f.onePerPlayer) {
      if (seen.has(e.card.playerId)) continue;
      seen.add(e.card.playerId);
    }
    out.push(e);
  }
  return out;
}

/** All cards of one player, in event order (the OVR timeline). */
export function playerTimeline(playerId: string): RankEntry[] {
  return rankEntries()
    .filter((e) => e.card.playerId === playerId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.entry.eventId.localeCompare(b.entry.eventId));
}

export interface CareerSummary {
  cards: number;
  internationals: number;
  /** International titles (placement 1st at a Masters/LOCK//IN/Champions). */
  titles: number;
  /** Regional league stages won. */
  regionalTitles: number;
  best: RankEntry;
  teams: string[];
}

/** Facts of a player's career in the data (counts over his cards; no invented numbers). */
export function careerSummary(timeline: readonly RankEntry[]): CareerSummary {
  const best = [...timeline].sort((a, b) => b.card.ovr - a.card.ovr)[0]!;
  const intl = timeline.filter((e) => e.tier === 'international');
  return {
    cards: timeline.length,
    internationals: intl.length,
    titles: intl.filter((e) => e.entry.placement === '1st').length,
    regionalTitles: timeline.filter((e) => e.tier === 'regional' && e.entry.placement === '1st').length,
    best,
    teams: [...new Set(timeline.map((e) => e.entry.teamName))],
  };
}
