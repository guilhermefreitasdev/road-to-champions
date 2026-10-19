/**
 * Draft engine: pure functions over an immutable, JSON-serializable state.
 * Classic: a roulette rolls a roster (team + event), the user picks one player into an open slot; 3 rerolls.
 * Ultimate: 5 fixed options per pick, derived from the seed (a page refresh never changes them); no rerolls.
 * Same seed + same actions ⇒ same state.
 */
import { createRng } from './rng';
import { findCard, findCoach, rosterKey, shuffled } from './roster';
import type { Card, Lineup, RosterEntry, Slot } from './types';

export type DraftMode = 'classic' | 'ultimate';
export type DraftPhase = 'roll' | 'pick' | 'coach' | 'done';

export const SLOTS: readonly Slot[] = ['duelist', 'initiator', 'controller', 'sentinel', 'flex'];
export const CLASSIC_REROLLS = 3;
export const OPTIONS_PER_PICK = 5;
export const COACH_OPTIONS = 3;

export interface DraftPick {
  cardId: string;
  slot: Slot;
}

export interface DraftState {
  mode: DraftMode;
  seed: string;
  phase: DraftPhase;
  /** Classic: 3; ultimate: 0. */
  rerollsLeft: number;
  /** How many rolls happened (drives determinism). */
  rollCount: number;
  /** Classic: the rolled roster. */
  current?: { teamId: string; eventId: string };
  /** Ultimate: the card ids offered for the current pick. */
  options?: string[];
  picks: DraftPick[];
  coachOptions?: string[];
  coachId?: string;
}

export function createDraft(pool: readonly RosterEntry[], mode: DraftMode, seed: string): DraftState {
  if (mode === 'classic') {
    return { mode, seed, phase: 'roll', rerollsLeft: CLASSIC_REROLLS, rollCount: 0, picks: [] };
  }
  return { mode, seed, phase: 'pick', rerollsLeft: 0, rollCount: 0, picks: [], options: ultimateOptions(pool, seed)[0]! };
}

/**
 * All ultimate options for a run: one list of card ids per pick. Each pick offers cards from distinct
 * rosters, and no playerId appears twice in the whole run, so an option never clashes with an earlier pick.
 */
export function ultimateOptions(pool: readonly RosterEntry[], seed: string): string[][] {
  const rng = createRng(`${seed}:ultimate`);
  const usedPlayers = new Set<string>();
  const all: string[][] = [];
  for (let pick = 0; pick < SLOTS.length; pick++) {
    const options: string[] = [];
    for (const entry of shuffled(pool, rng)) {
      if (options.length === OPTIONS_PER_PICK) break;
      const candidates = entry.cards.filter((c) => !usedPlayers.has(c.playerId));
      if (candidates.length === 0) continue;
      const card = candidates[rng.int(0, candidates.length - 1)]!;
      options.push(card.id);
      usedPlayers.add(card.playerId);
    }
    if (options.length < OPTIONS_PER_PICK) {
      throw new Error(`Pool too small for ultimate draft: pick ${pick + 1} has ${options.length} options`);
    }
    all.push(options);
  }
  return all;
}

/** Classic: spins the roulette (phase 'roll' → 'pick'). */
export function roll(state: DraftState, pool: readonly RosterEntry[]): DraftState {
  assertMode(state, 'classic');
  assertPhase(state, 'roll');
  return { ...state, phase: 'pick', rollCount: state.rollCount + 1, current: drawRoster(state, pool) };
}

/** Classic: spends a reroll to replace the rolled roster. */
export function reroll(state: DraftState, pool: readonly RosterEntry[]): DraftState {
  assertMode(state, 'classic');
  assertPhase(state, 'pick');
  if (state.rerollsLeft <= 0) throw new Error('No rerolls left');
  return {
    ...state,
    rerollsLeft: state.rerollsLeft - 1,
    rollCount: state.rollCount + 1,
    current: drawRoster(state, pool, state.current),
  };
}

/** Cards the user may pick now. Classic: the rolled roster minus players already picked; ultimate: the options. */
export function availableCards(state: DraftState, pool: readonly RosterEntry[]): Card[] {
  if (state.phase !== 'pick') return [];
  const picked = pickedPlayers(state, pool);
  let cards: Card[];
  if (state.mode === 'classic') {
    const entry = state.current && findRoster(pool, state.current);
    cards = entry ? entry.cards : [];
  } else {
    cards = (state.options ?? []).map((id) => findCard(pool, id)).filter((c): c is Card => c !== undefined);
  }
  return cards.filter((c) => !picked.has(c.playerId));
}

export function openSlots(state: DraftState): Slot[] {
  const filled = new Set(state.picks.map((p) => p.slot));
  return SLOTS.filter((s) => !filled.has(s));
}

/** Puts a card into an open slot. After the 5th pick the draft moves on to the coach. */
export function pickPlayer(state: DraftState, pool: readonly RosterEntry[], cardId: string, slot: Slot): DraftState {
  assertPhase(state, 'pick');
  if (!SLOTS.includes(slot)) throw new Error(`Unknown slot "${slot}"`);
  if (!openSlots(state).includes(slot)) throw new Error(`Slot "${slot}" is already filled`);
  const card = availableCards(state, pool).find((c) => c.id === cardId);
  if (!card) {
    const known = findCard(pool, cardId);
    if (known && pickedPlayers(state, pool).has(known.playerId)) {
      throw new Error(`Player "${known.handle}" is already in the lineup`);
    }
    throw new Error(`Card "${cardId}" is not available for this pick`);
  }

  const picks = [...state.picks, { cardId, slot }];
  const next: DraftState = { ...state, picks };
  delete next.current;
  delete next.options;

  if (picks.length === SLOTS.length) {
    return { ...next, phase: 'coach', coachOptions: drawCoaches(pool, state.seed) };
  }
  if (state.mode === 'classic') return { ...next, phase: 'roll' };
  return { ...next, phase: 'pick', options: ultimateOptions(pool, state.seed)[picks.length]! };
}

/** Chooses one of the offered coaches (phase 'coach' → 'done'). */
export function pickCoach(state: DraftState, pool: readonly RosterEntry[], coachId: string): DraftState {
  assertPhase(state, 'coach');
  if (!(state.coachOptions ?? []).includes(coachId) || !findCoach(pool, coachId)) {
    throw new Error(`Coach "${coachId}" is not one of the options`);
  }
  return { ...state, phase: 'done', coachId };
}

/** The drafted team as a Lineup. Needs all 5 picks; the coach is included once chosen. */
export function draftLineup(state: DraftState, pool: readonly RosterEntry[], name: string): Lineup {
  if (state.picks.length !== SLOTS.length) {
    throw new Error(`Draft has ${state.picks.length} picks, needs ${SLOTS.length}`);
  }
  const players = state.picks.map(({ cardId, slot }) => {
    const card = findCard(pool, cardId);
    if (!card) throw new Error(`Unknown card "${cardId}"`);
    return { card, slot };
  });
  const lineup: Lineup = { name, players };
  if (state.coachId) {
    const coach = findCoach(pool, state.coachId);
    if (!coach) throw new Error(`Unknown coach "${state.coachId}"`);
    lineup.coach = coach;
  }
  return lineup;
}

// --- internals ---

function assertMode(state: DraftState, mode: DraftMode): void {
  if (state.mode !== mode) throw new Error(`Only available in ${mode} mode`);
}

function assertPhase(state: DraftState, phase: DraftPhase): void {
  if (state.phase !== phase) throw new Error(`Expected phase "${phase}", draft is in "${state.phase}"`);
}

function findRoster(pool: readonly RosterEntry[], ref: { teamId: string; eventId: string }): RosterEntry | undefined {
  return pool.find((e) => e.teamId === ref.teamId && e.eventId === ref.eventId);
}

function pickedPlayers(state: DraftState, pool: readonly RosterEntry[]): Set<string> {
  const ids = new Set<string>();
  for (const pick of state.picks) {
    const card = findCard(pool, pick.cardId);
    if (card) ids.add(card.playerId);
  }
  return ids;
}

/**
 * Rolls a roster that still has at least one pickable player. On a reroll, the current roster is
 * avoided when anything else is eligible. Seeded by the roll number, so it is reproducible.
 */
function drawRoster(
  state: DraftState,
  pool: readonly RosterEntry[],
  avoid?: { teamId: string; eventId: string },
): { teamId: string; eventId: string } {
  const picked = pickedPlayers(state, pool);
  let eligible = pool.filter((e) => e.cards.some((c) => !picked.has(c.playerId)));
  if (avoid) {
    const others = eligible.filter((e) => rosterKey(e) !== rosterKey(avoid));
    if (others.length > 0) eligible = others;
  }
  if (eligible.length === 0) throw new Error('No roster with available players left in the pool');
  const rng = createRng(`${state.seed}:roll:${state.rollCount}`);
  const entry = eligible[rng.int(0, eligible.length - 1)]!;
  return { teamId: entry.teamId, eventId: entry.eventId };
}

/** Up to 3 coaches with distinct names (the same coach may appear at several events). */
function drawCoaches(pool: readonly RosterEntry[], seed: string): string[] {
  const rng = createRng(`${seed}:coach`);
  const coaches = pool.flatMap((e) => (e.coach ? [e.coach] : []));
  const ids: string[] = [];
  const names = new Set<string>();
  for (const coach of shuffled(coaches, rng)) {
    if (ids.length === COACH_OPTIONS) break;
    if (names.has(coach.name) || ids.includes(coach.id)) continue;
    names.add(coach.name);
    ids.push(coach.id);
  }
  if (ids.length === 0) throw new Error('Pool has no coaches');
  return ids;
}
