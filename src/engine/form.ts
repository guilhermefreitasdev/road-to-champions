/**
 * "Modelo v3": per-map form, tournament form, aura, prodigies and meta fit (docs/pesquisa-variancia.md §6, §9–12;
 * docs/design.md "Modelo v3"). Pure helpers over the seeded Rng; the constants are the design decisions,
 * calibrated in src/engine/form.test.ts against the measured targets.
 *
 * Nothing here is a new attribute measured per player: the ceiling of a map comes from the OVR and the role
 * (volatility is not a trait: its event-to-event correlation is −0.005), aura tiers are career facts
 * (src/data/real/cards.ts) and their effects are small and bounded.
 */
import { createRng, type Rng } from './rng';
import { roleFit } from './team';
import type { AuraTier, Card, Lineup, LineupPlayer, MapName, Role } from './types';

// --- Per-map form (§6.1) ---
/** Rating-equivalent SD of a player's map around his mean (measured individual component: 0.248). */
export const FORM_SIGMA = 0.1;
/** The SD grows 6% per 10 OVR (measured 0.29 → 0.33 from the bottom to the top quartile). */
export const FORM_OVR_SLOPE = 0.006;
/** Duelists swing ~10% more than initiators (measured 0.262 … 0.235). */
export const FORM_ROLE_FACTOR: Record<Role, number> = { duelist: 1.06, sentinel: 1.01, controller: 0.98, initiator: 0.95 };
/** Bounds of the kill multiplier. */
export const FORM_MIN = 0.55;
export const FORM_MAX = 1.9;
/** Strength points per unit of OVR-share-weighted form excess: the five together give σ ≈ 4 points. */
export const FORM_TEAM_K = 90;
/** Bound of the team's individual-form term, in strength points. */
export const FORM_TEAM_CAP = 8;
/** Hot hand inside a series: z of the next map = ρ × z + sqrt(1 − ρ²) × new (measured lag-1 0.067). */
export const FORM_SERIES_RHO = 0.1;
/**
 * Scoreboard tags, on the estimated rating of the map (what the player sees), not on the hidden draw: "Inspirado"
 * at ≥ 1.4 (a real map ≥ 1.5 happens in 7.7% of the player-maps; the estimate has a lighter tail) and "Apagado"
 * at ≤ 0.6 (a real map ≤ 0.7: 15%).
 */
export const INSPIRED_RATING = 1.4;
export const COLD_RATING = 0.6;
/** Right skew of the form draw (target skewness ≈ +0.2). */
const FORM_SKEW = 0.1;

/** z ~ (0, 1) with a light right tail: sum of three uniforms, then a quadratic skew. */
export function drawFormZ(rng: Rng): number {
  const u = (rng.next() + rng.next() + rng.next() - 1.5) * 2;
  return u + (FORM_SKEW * (u * u - 1)) / 2;
}

/** Rating-equivalent SD of a card's map form. */
export function formSigma(ovr: number, role: Role): number {
  return FORM_SIGMA * (1 + FORM_OVR_SLOPE * (ovr - 80)) * FORM_ROLE_FACTOR[role];
}

/** Kill multiplier of a map: exp(σ × z), bounded. */
export function formFactor(z: number, ovr: number, role: Role): number {
  return Math.max(FORM_MIN, Math.min(FORM_MAX, Math.exp(formSigma(ovr, role) * z)));
}

/** Seed of a player's form on a map, so the draw depends only on the match, the map and the card. */
export function formSeed(base: string, map: MapName, cardId: string): string {
  return `${base}:${map}:${cardId}`;
}

/** Form z of a player on a map, with the series hot hand when the previous map's z is known. */
export function mapFormZ(rng: Rng, prev?: number): number {
  const fresh = drawFormZ(rng);
  if (prev === undefined) return fresh;
  return FORM_SERIES_RHO * prev + Math.sqrt(1 - FORM_SERIES_RHO * FORM_SERIES_RHO) * fresh;
}

/** Share of a lineup's strength that each player carries: OVR × fit over the sum. */
export function strengthShares(players: readonly LineupPlayer[]): number[] {
  const weights = players.map((p) => p.card.ovr * roleFit(p.card.role, p.slot));
  const sum = weights.reduce((s, w) => s + w, 0) || 1;
  return weights.map((w) => w / sum);
}

/** Strength points a team gets from its players' map forms: K × Σ (f − 1) × share, bounded. */
export function teamFormPoints(players: readonly LineupPlayer[], factors: readonly number[]): number {
  const shares = strengthShares(players);
  const sum = factors.reduce((s, f, i) => s + (f - 1) * shares[i]!, 0);
  return Math.max(-FORM_TEAM_CAP, Math.min(FORM_TEAM_CAP, FORM_TEAM_K * sum));
}

// --- Tournament form (§6.2) ---
/** SD of a player's tournament form in OVR points (measured true SD of the event mean: 0.041 rating ≈ 2.5 OVR). */
export const TOURNAMENT_FORM_SD = 2.5;
export const TOURNAMENT_FORM_MAX = 6;
/** The Team screen only mentions a form of this size or more. */
export const TOURNAMENT_FORM_SHOWN = 2;
/** Attributes shifted by the tournament form and the prodigy growth (the OVR follows). */
const FORM_ATTRS = ['aim', 'entry', 'utility'] as const;

/** N(0, 2.5) truncated at ±6, rounded to a half point. */
export function drawTournamentForm(rng: Rng): number {
  const z = (rng.next() + rng.next() + rng.next() - 1.5) * 2;
  const t = Math.max(-TOURNAMENT_FORM_MAX, Math.min(TOURNAMENT_FORM_MAX, TOURNAMENT_FORM_SD * z));
  return Math.round(t * 2) / 2;
}

/** A card with its aim, entry, utility and OVR shifted by `delta` OVR points (bounded 0–100 / 50–99). */
export function shiftCard(card: Card, delta: number): Card {
  if (delta === 0) return card;
  const attrs = { ...card.attrs };
  for (const k of FORM_ATTRS) attrs[k] = Math.max(0, Math.min(100, Math.round(attrs[k] + delta)));
  return { ...card, attrs, ovr: Math.max(50, Math.min(99, Math.round(card.ovr + delta))) };
}

/**
 * Applies each player's tournament form (seeded by `${seedBase}:${cardId}`) and, for prodigies, the run's growth
 * (`growth` OVR points, see prodigyGrowth). Returns a new lineup; the originals are untouched.
 */
export function applyTournamentForm(lineup: Lineup, seedBase: string, growth = 0): Lineup {
  return {
    ...lineup,
    players: lineup.players.map((p) => {
      const form = drawTournamentForm(createRng(`${seedBase}:${p.card.id}`));
      const g = p.card.prodigy ? growth : 0;
      const out: LineupPlayer = { ...p, card: shiftCard(p.card, form + g), tournamentForm: form };
      if (g > 0) out.growth = g;
      return out;
    }),
  };
}

// --- Prodigies (§11.2) ---
/** OVR points a prodigy gains per stage reached in a run, and the cap. Design, not data (debuts regress). */
export const PRODIGY_GROWTH_PER_STAGE = 0.5;
export const PRODIGY_GROWTH_CAP = 2;

/** Growth of a prodigy after `stagesReached` stages (0 at the start of the run). */
export function prodigyGrowth(stagesReached: number): number {
  return Math.min(PRODIGY_GROWTH_CAP, Math.max(0, stagesReached) * PRODIGY_GROWTH_PER_STAGE);
}

// --- Aura (§10.3) ---
/** Personal aura in decider maps and overtime: kill weight × (1 + a), death weight / (1 + a / 2). */
export const AURA_KILL: Record<AuraTier, number> = { goat: 0.06, legend: 0.04, star: 0.02, rising: 0 };
/** OVR-equivalent of the personal aura in those rounds, applied to the strength through the player's share. */
export const AURA_OVR: Record<AuraTier, number> = { goat: 3, legend: 2, star: 1, rising: 0 };
/**
 * Cap of a team's aura strength (deciders and overtime): never more than a small edge. 1 point (the research
 * proposed 2): with 2, the top decile of drafted teams, almost all stars and legends, won ≈ 9 pp more titles
 * than without aura (src/game/balance.test.ts, BT=12); the research allows +3 pp.
 */
export const AURA_TEAM_CAP = 1;
/** Strength points of a team's personal auras in a decider or overtime round, capped. */
export function auraPoints(players: readonly LineupPlayer[]): number {
  const shares = strengthShares(players);
  const sum = players.reduce((s, p, i) => s + (p.card.aura ? AURA_OVR[p.card.aura] : 0) * shares[i]!, 0);
  return Math.min(AURA_TEAM_CAP, sum);
}

// --- Meta fit (§9.3) ---
/** Agent share of the slots on one map (0–100), e.g. { Omen: 20, Fade: 15, ... }. */
export type MapMeta = Readonly<Record<string, number>>;
/** Meta of every map of a pool (year of the veto pool). */
export type MetaTable = Readonly<Record<MapName, MapMeta>>;
/** Bonus for a composition that is the map's meta: the real pick advantage (+1.3) rounded up; never negative. */
export const META_BONUS_MAX = 1.5;

export interface MetaFit {
  /** 0–1: share of the most-meta comp's weight the lineup's best comp reaches. */
  fit: number;
  /** Strength points (META_BONUS_MAX × fit). */
  points: number;
  /** Agent chosen for each player (by lineup order); '' when none of the player's agents is in the meta. */
  agents: string[];
}

/**
 * Best composition a lineup can field from its players' repertoires (agents played at their events), scored by
 * the map's meta shares, against the best five-agent comp of the meta. No player × agent affinity: in the data
 * a player performs the same on any agent he plays; only the comp fits the map or not.
 */
export function metaFit(lineup: Lineup, meta: MapMeta | undefined): MetaFit {
  const n = lineup.players.length;
  if (!meta) return { fit: 0, points: 0, agents: Array<string>(n).fill('') };
  const top = Object.values(meta)
    .sort((a, b) => b - a)
    .slice(0, n);
  const max = top.reduce((s, v) => s + v, 0);
  const agents = Array<string>(n).fill('');
  if (max <= 0) return { fit: 0, points: 0, agents };
  // Greedy: the player with the best available agent takes it; agents are unique within the comp.
  const taken = new Set<string>();
  const left = new Set(lineup.players.map((_, i) => i));
  let total = 0;
  while (left.size > 0) {
    let best: { i: number; agent: string; share: number } | null = null;
    for (const i of left) {
      for (const agent of lineup.players[i]!.card.agents) {
        if (taken.has(agent)) continue;
        const share = meta[agent] ?? 0;
        if (share > 0 && (!best || share > best.share || (share === best.share && i < best.i))) best = { i, agent, share };
      }
    }
    if (!best) break;
    agents[best.i] = best.agent;
    taken.add(best.agent);
    left.delete(best.i);
    total += best.share;
  }
  const fit = Math.max(0, Math.min(1, total / max));
  return { fit, points: Math.round(META_BONUS_MAX * fit * 100) / 100, agents };
}
