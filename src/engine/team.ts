/**
 * Team strength, "Modelo v2" (docs/pesquisa-taticas.md §6, docs/design.md "Força do time v2").
 *
 * total = base (OVR × role fit) + composition + Σ weight_d × (dimension_d − reference_d) / 10
 *
 * The five dimensions (0–100) say WHY a team is strong: mechanics, utility, decision (tactics: IGL-driven, coach
 * 15%), communication (chemistry) and clutch. A team at the reference level of every dimension (a typical real
 * roster) gets exactly base + composition, so the OVR, which already carries most of the mechanics, is not
 * counted twice: mechanics, utility and clutch have small weights; decision carries the IGL.
 */
import type { Card, Coach, Lineup, Role, Slot } from './types';

/** Multiplier applied to a card's OVR depending on the slot it fills. */
export function roleFit(cardRole: Role, slot: Slot): number {
  if (slot === cardRole) return 1;
  if (slot === 'flex') return 0.9;
  return 0.75;
}

/**
 * Penalty for each role missing from the lineup's slots. The controller is near-mandatory (0 of 2,534 pro
 * compositions played without one); the sentinel costs nothing (19% of pro comps skip it and win as often).
 */
export const MISSING_ROLE_PENALTY: Record<Role, number> = {
  controller: 8,
  initiator: 3,
  sentinel: 0,
  duelist: 2,
};

export const DIMENSION_KEYS = ['mechanics', 'utility', 'decision', 'communication', 'clutch'] as const;
export type DimensionKey = (typeof DIMENSION_KEYS)[number];
export type TeamDimensions = Record<DimensionKey, number>;

/**
 * Strength points per 10 points of a dimension above/below its reference. Mechanics, utility and clutch are
 * mostly inside the OVR already, so they only nudge; decision is where the IGL lives (losing the IGL takes a
 * typical real roster from 75 to the 55 cap: −2 here, plus ≈ −1 from the in-round term in src/engine/match.ts on
 * map 1 and ≈ −1.5 on map 3; a drafted team of non-leaders sits near 40: −3.4 and −1.7). Weight 1.4 / edge 0.7
 * matched the research's 4–5 points but made the OVR-only drafter's median team too weak and its IGL-only top
 * decile too strong (src/game/balance.test.ts); communication reproduces the old chemistry cap (+2 for a full
 * real roster).
 */
export const DIMENSION_WEIGHT: TeamDimensions = {
  mechanics: 0.3,
  utility: 0.3,
  decision: 1.0,
  communication: 0.4,
  clutch: 0.3,
};

/**
 * Reference level of each dimension: the median of the real rosters (src/data/real, measured 2026-10-19 in
 * src/data/real/real.test.ts), so a typical roster scores 0 points on every dimension. Communication's reference
 * is "no pairs" (50) so that chemistry is always a bonus, as before.
 */
export const DIMENSION_REFERENCE: TeamDimensions = {
  mechanics: 68,
  utility: 69,
  decision: 74,
  communication: 50,
  clutch: 74,
};

// --- Utility coverage (composition, docs/pesquisa-taticas.md §4.1) ---
/** Utility multiplier without a controller slot: no smokes, no executes, no retakes. */
export const NO_CONTROLLER_UTILITY = 0.7;
/** Utility multiplier without an initiator slot. */
export const NO_INITIATOR_UTILITY = 0.9;
/** Utility bonus for a double-controller comp that keeps an initiator (the 1-1-2-1 meta). */
export const DOUBLE_CONTROLLER_UTILITY = 3;

// --- Communication (chemistry) ---
/** Communication points per pair of players who were teammates at the same event. */
export const COMM_PER_TEAMMATE_PAIR = 6;
/** Communication points per pair from the same country who were not teammates at that event. */
export const COMM_PER_COMPATRIOT_PAIR = 3;
/** Two IGLs: two voices on the calls. */
export const SECOND_IGL_COMM_PENALTY = 5;

// --- Decision (tactics) ---
/** Share of the IGL, of the best other decision-maker and of the coach in the decision dimension. */
export const DECISION_SHARES = { igl: 0.7, second: 0.15, coach: 0.15 } as const;
/** Without an IGL the team keeps this share of its best decision-makers' level, capped at NO_IGL_CAP. */
export const NO_IGL_FACTOR = 0.75;
export const NO_IGL_CAP = 55;
/** A second IGL is a second voice in the mid-round. */
export const SECOND_IGL_DECISION_BONUS = 5;
/** Decision of a roster whose IGL the data does not name: the reference (median real roster) — neither penalty nor bonus. */
export const UNKNOWN_IGL_DECISION = DIMENSION_REFERENCE.decision;

export type IglStatus = 'one' | 'two' | 'none' | 'unknown';

export interface DecisionDetail {
  status: IglStatus;
  /** The IGL used in the formula (the best one when there are two). */
  igl?: Card;
  /** Handles of the other IGLs, when there are two or more. */
  otherIgls: string[];
  /** Best decision-maker who is not the IGL (or the best of the five without one). */
  second?: Card;
  /** Coach's share of the dimension, 40–100 (40 without a coach). */
  coach: number;
  /** Decision before the no-IGL rule (equal to `value` when the rule does not apply). */
  raw: number;
  /** The decision dimension, 0–100. */
  value: number;
}

export interface StrengthBreakdown {
  /** Average of OVR × role fit. */
  base: number;
  /** Missing-role penalties (slots), in strength points. */
  composition: number;
  /** The five dimensions, 0–100. */
  dimensions: TeamDimensions;
  /** Strength points from each dimension: weight × (value − reference) / 10. */
  points: TeamDimensions;
  igl: IglStatus;
  total: number;
}

/** Coach's share of the decision dimension: 40 without a coach, 100 for a champion coach (tactic 3). */
export function coachDecision(coach?: Coach): number {
  return 40 + 20 * (coach?.tacticBonus ?? 0);
}

/** Decision dimension with everything the UI needs to explain it. */
export function decisionDetail(lineup: Lineup): DecisionDetail {
  const cards = lineup.players.map((p) => p.card);
  const byDecision = (list: Card[]) => [...list].sort((a, b) => b.attrs.decision - a.attrs.decision);
  const igls = byDecision(cards.filter((c) => c.isIGL));
  const coach = coachDecision(lineup.coach);
  const { igl: wIgl, second: wSecond, coach: wCoach } = DECISION_SHARES;

  if (igls.length === 0) {
    const [best, next] = byDecision(cards);
    if (lineup.iglKnown === false) {
      return { status: 'unknown', otherIgls: [], second: best, coach, raw: UNKNOWN_IGL_DECISION, value: UNKNOWN_IGL_DECISION };
    }
    const raw = wIgl * best!.attrs.decision + wSecond * (next?.attrs.decision ?? 0) + wCoach * coach;
    return { status: 'none', otherIgls: [], second: best, coach, raw, value: Math.min(NO_IGL_CAP, NO_IGL_FACTOR * raw) };
  }

  const igl = igls[0]!;
  const [second] = byDecision(cards.filter((c) => c !== igl));
  let raw = wIgl * igl.attrs.decision + wSecond * (second?.attrs.decision ?? 0) + wCoach * coach;
  if (igls.length > 1) raw = Math.min(100, raw + SECOND_IGL_DECISION_BONUS);
  return {
    status: igls.length > 1 ? 'two' : 'one',
    igl,
    otherIgls: igls.slice(1).map((c) => c.handle),
    second,
    coach,
    raw,
    value: raw,
  };
}

/**
 * Pairs that give communication (chemistry). Each pair counts once: as teammates when they were, otherwise as
 * compatriots (an unknown country, '', never matches).
 */
export function chemistryPairs(lineup: Lineup): { teammates: number; compatriots: number } {
  const { players } = lineup;
  let teammates = 0;
  let compatriots = 0;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i]!.card;
      const b = players[j]!.card;
      if (a.teamId === b.teamId && a.eventId === b.eventId) teammates++;
      else if (a.country !== '' && a.country === b.country) compatriots++;
    }
  }
  return { teammates, compatriots };
}

/** Utility coverage multiplier and bonus from the slots (0 without a controller is too harsh; ×0.7 instead). */
export function utilityCoverage(slots: readonly Slot[]): { factor: number; bonus: number } {
  const count = (role: Role) => slots.filter((s) => s === role).length;
  let factor = 1;
  if (count('controller') === 0) factor *= NO_CONTROLLER_UTILITY;
  if (count('initiator') === 0) factor *= NO_INITIATOR_UTILITY;
  const bonus = count('controller') >= 2 && count('initiator') >= 1 ? DOUBLE_CONTROLLER_UTILITY : 0;
  return { factor, bonus };
}

const clamp100 = (n: number): number => Math.max(0, Math.min(100, n));

/** The five dimensions of a lineup, 0–100. */
export function teamDimensions(lineup: Lineup): TeamDimensions {
  const { players } = lineup;
  const n = players.length;
  const avg = (f: (p: (typeof players)[number]) => number) => players.reduce((s, p) => s + f(p), 0) / n;
  const fit = (p: (typeof players)[number]) => roleFit(p.card.role, p.slot);

  const mechanics = avg((p) => fit(p) * (0.6 * p.card.attrs.aim + 0.4 * p.card.attrs.entry));

  const coverage = utilityCoverage(players.map((p) => p.slot));
  const utility = avg((p) => fit(p) * p.card.attrs.utility) * coverage.factor + coverage.bonus;

  const decision = decisionDetail(lineup);

  const { teammates, compatriots } = chemistryPairs(lineup);
  const communication =
    Math.min(100, 50 + COMM_PER_TEAMMATE_PAIR * teammates + COMM_PER_COMPATRIOT_PAIR * compatriots) -
    (decision.status === 'two' ? SECOND_IGL_COMM_PENALTY : 0);

  const clutch =
    0.5 * avg((p) => p.card.attrs.clutch) +
    0.3 * Math.max(...players.map((p) => p.card.attrs.clutch)) +
    0.2 * avg((p) => p.card.attrs.consistency);

  return {
    mechanics: clamp100(mechanics),
    utility: clamp100(utility),
    decision: clamp100(decision.value),
    communication: clamp100(communication),
    clutch: clamp100(clutch),
  };
}

/** Strength points a dimension value is worth. */
export function dimensionPoints(key: DimensionKey, value: number): number {
  return (DIMENSION_WEIGHT[key] * (value - DIMENSION_REFERENCE[key])) / 10;
}

export function teamStrength(lineup: Lineup): StrengthBreakdown {
  const { players } = lineup;
  if (players.length !== 5) {
    throw new Error(`Lineup "${lineup.name}" must have 5 players, got ${players.length}`);
  }

  const base =
    players.reduce((sum, p) => sum + p.card.ovr * roleFit(p.card.role, p.slot), 0) / players.length;

  const slots = new Set(players.map((p) => p.slot));
  let composition = 0;
  for (const role of Object.keys(MISSING_ROLE_PENALTY) as Role[]) {
    if (!slots.has(role)) composition -= MISSING_ROLE_PENALTY[role];
  }

  const dimensions = teamDimensions(lineup);
  const points = {} as TeamDimensions;
  let total = base + composition;
  for (const key of DIMENSION_KEYS) {
    points[key] = dimensionPoints(key, dimensions[key]);
    total += points[key];
  }

  return { base, composition, dimensions, points, igl: decisionDetail(lineup).status, total };
}
