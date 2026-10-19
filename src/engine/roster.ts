import { createRng, type Rng } from './rng';
import type { Card, Coach, Lineup, LineupPlayer, MapName, Role, RosterEntry, Slot } from './types';

const ROLES: readonly Role[] = ['duelist', 'initiator', 'controller', 'sentinel'];

/** Fisher–Yates shuffle that returns a new array. */
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Key of a roster at one event, e.g. "aurora-champions-exemplo-2022". */
export function rosterKey(entry: Pick<RosterEntry, 'teamId' | 'eventId'>): string {
  return `${entry.teamId}-${entry.eventId}`;
}

/**
 * Lineup for an AI team: each card goes to its own role slot, the extra one to flex.
 * If a roster doubles up on a role and misses another, the leftover card fills the free slot.
 */
export function rosterToLineup(entry: RosterEntry, affinity?: Partial<Record<MapName, number>>): Lineup {
  if (entry.cards.length !== 5) {
    throw new Error(`Roster "${rosterKey(entry)}" must have 5 cards, got ${entry.cards.length}`);
  }
  const used = new Set<Slot>();
  const players: LineupPlayer[] = [];
  const leftovers: Card[] = [];
  for (const card of entry.cards) {
    if (used.has(card.role)) {
      leftovers.push(card);
    } else {
      used.add(card.role);
      players.push({ card, slot: card.role });
    }
  }
  for (const card of leftovers) {
    const slot = (['flex', ...ROLES] as Slot[]).find((s) => !used.has(s))!;
    used.add(slot);
    players.push({ card, slot });
  }

  const lineup: Lineup = { name: entry.teamName, players };
  if (entry.coach) lineup.coach = entry.coach;
  if (affinity) lineup.mapAffinity = { ...affinity };
  return lineup;
}

export function findCard(pool: readonly RosterEntry[], cardId: string): Card | undefined {
  for (const entry of pool) {
    const card = entry.cards.find((c) => c.id === cardId);
    if (card) return card;
  }
  return undefined;
}

export function findCoach(pool: readonly RosterEntry[], coachId: string): Coach | undefined {
  return pool.find((entry) => entry.coach?.id === coachId)?.coach;
}

/**
 * Picks `count` opponent rosters with distinct teamIds, deterministically from the seed.
 * Rosters containing any of the `exclude` playerIds (the user's players) are avoided; a team whose
 * every roster has one of them is only used as a last resort, so a tournament can still be filled.
 */
export function pickOpponents(
  pool: readonly RosterEntry[],
  count: number,
  seed: string,
  exclude: readonly string[] = [],
): RosterEntry[] {
  const rng = createRng(`${seed}:opponents`);
  const excluded = new Set(exclude);
  const byTeam = new Map<string, RosterEntry[]>();
  for (const entry of pool) {
    const list = byTeam.get(entry.teamId) ?? [];
    list.push(entry);
    byTeam.set(entry.teamId, list);
  }
  if (byTeam.size < count) {
    throw new Error(`Need ${count} distinct teams, pool has ${byTeam.size}`);
  }

  const clean: RosterEntry[] = [];
  const fallback: RosterEntry[] = [];
  for (const teamId of shuffled([...byTeam.keys()], rng)) {
    const rosters = byTeam.get(teamId)!;
    const ok = rosters.filter((r) => !r.cards.some((c) => excluded.has(c.playerId)));
    const from = ok.length > 0 ? ok : rosters;
    const chosen = from[rng.int(0, from.length - 1)]!;
    (ok.length > 0 ? clean : fallback).push(chosen);
  }
  return [...clean, ...fallback].slice(0, count);
}
