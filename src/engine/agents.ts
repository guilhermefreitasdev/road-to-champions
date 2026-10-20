/**
 * Agents per map: who plays what, and the (small, bounded) agent edge. docs/design.md "Agentes por mapa".
 *
 * The pick is real repertoire: each player draws an agent from his real pool (`Card.agentPool`, maps played on
 * each agent), weighted by those maps and nudged toward the map's meta, never repeating an agent inside a team;
 * without a pool he draws from the agents he played at the card's event (`Card.agents`).
 *
 * The edge is deliberately tiny. docs/pesquisa-variancia.md §9.1 measured the player × agent residual as noise
 * (true SD 0 in every cut; best-minus-worst agent gap 0.163, smaller than chance's 0.216), so a raw "agent rating"
 * would be a lottery with a stat's name. We keep it only because the player sees his best and worst agents, and we
 * make it earn its place with samples: the gap to the player's own average is shrunk by maps / (maps + 30) (a
 * 10-map agent keeps 25%, a 90-map one 75%), turned into OVR points and bounded to ±2 per player; on the team
 * strength it only enters through the players' shares, capped at ±1.
 */
import { createRng } from './rng';
import type { MapMeta } from './form';
import type { Card, LineupPlayer, Role } from './types';

/** Shrinkage of an agent's rating gap: maps / (maps + AGENT_SHRINK_MAPS). */
export const AGENT_SHRINK_MAPS = 30;
/** OVR points per rating point (the tournament form's measured 0.041 rating ≈ 2.5 OVR, src/engine/form.ts). */
export const AGENT_OVR_PER_RATING = 60;
/** Bound of a player's agent edge, in OVR points. */
export const AGENT_EDGE_MAX = 2;
/** Bound of the team's agent term (Σ edge × strength share), in strength points. */
export const AGENT_TEAM_CAP = 1;
/** Meta nudge of the pick: weight × (1 + AGENT_META_NUDGE × meta share %), so a 20% meta agent weighs ×2. */
export const AGENT_META_NUDGE = 0.05;

/** Agent → role table (valorant-api.com), so a player in another role's slot picks that role's agents when he has them. */
export type AgentRoles = Readonly<Record<string, Role>>;

/**
 * Agents that also do another role's job, on top of their official one. Viper is a controller (smokes) that
 * also anchors a site like a sentinel (owner's call, 2026-10-20): her maps count for both roles in "flex nato",
 * and a Viper player can fill a sentinel slot with her.
 */
export const EXTRA_AGENT_ROLES: Readonly<Record<string, readonly Role[]>> = { Viper: ['sentinel'] };

/** Roles an agent covers: the official one plus any extra role from EXTRA_AGENT_ROLES. */
export function agentRolesOf(agent: string, roles: AgentRoles): Role[] {
  const main = roles[agent];
  const extra = EXTRA_AGENT_ROLES[agent] ?? [];
  return main ? [main, ...extra.filter((r) => r !== main)] : [...extra];
}

interface Candidate {
  agent: string;
  weight: number;
}

/** A player's agent options with their pick weights (maps played; 1 each for the event's agents). */
function candidates(p: LineupPlayer, meta: MapMeta | undefined, roles: AgentRoles | undefined): Candidate[] {
  const { card, slot } = p;
  const pool = card.agentPool?.filter((a) => a.maps > 0).map((a) => ({ agent: a.agent, maps: a.maps }));
  const base = pool && pool.length > 0 ? pool : card.agents.map((agent) => ({ agent, maps: 1 }));
  let list = base;
  if (roles && slot !== 'flex') {
    const inRole = base.filter((a) => agentRolesOf(a.agent, roles).includes(slot));
    if (inRole.length > 0) list = inRole;
  }
  return list.map(({ agent, maps }) => ({ agent, weight: maps * (1 + AGENT_META_NUDGE * (meta?.[agent] ?? 0)) }));
}

/**
 * Agent of each player on a map (by lineup order; undefined when the player has no agent left). Deterministic from
 * `seed`; players with fewer options choose first, so a one-trick keeps his agent. No agent repeats in the team.
 */
export function pickAgents(players: readonly LineupPlayer[], seed: string, meta?: MapMeta, roles?: AgentRoles): (string | undefined)[] {
  const rng = createRng(seed);
  const options = players.map((p) => candidates(p, meta, roles));
  const order = players.map((_, i) => i).sort((a, b) => options[a]!.length - options[b]!.length || a - b);
  const taken = new Set<string>();
  const out: (string | undefined)[] = players.map(() => undefined);
  for (const i of order) {
    let free = options[i]!.filter((c) => !taken.has(c.agent));
    // Every agent of the pick list is taken: any agent he ever played that is still free.
    if (free.length === 0) free = candidates({ ...players[i]!, slot: 'flex' }, meta, undefined).filter((c) => !taken.has(c.agent));
    if (free.length === 0) continue;
    const agent = free[rng.weightedIndex(free.map((c) => c.weight))]!.agent;
    taken.add(agent);
    out[i] = agent;
  }
  return out;
}

/**
 * Agent edge of a card on an agent, in OVR points: (agent rating − the player's maps-weighted rating over his pool)
 * × maps / (maps + 30) × 60, bounded to ±2 and rounded to 0.1. 0 without a pool, without the agent in it, or
 * without ratings.
 */
export function agentEdge(card: Pick<Card, 'agentPool'>, agent: string | undefined): number {
  const pool = card.agentPool;
  if (!pool || !agent) return 0;
  const stat = pool.find((a) => a.agent === agent);
  if (!stat || stat.rating === null || stat.maps <= 0) return 0;
  let maps = 0;
  let sum = 0;
  for (const a of pool) {
    if (a.rating === null || a.maps <= 0) continue;
    maps += a.maps;
    sum += a.rating * a.maps;
  }
  if (maps === 0) return 0;
  const gap = stat.rating - sum / maps;
  const shrunk = (gap * stat.maps) / (stat.maps + AGENT_SHRINK_MAPS);
  const ovr = Math.max(-AGENT_EDGE_MAX, Math.min(AGENT_EDGE_MAX, shrunk * AGENT_OVR_PER_RATING));
  return Math.round(ovr * 10) / 10 || 0;
}

/** Kill multiplier of an agent edge (log scale = rating-equivalent, like the map form): exp(edge / 60), ≈ ±3.4% at ±2. */
export function agentFactor(edgeOvr: number): number {
  return Math.exp(edgeOvr / AGENT_OVR_PER_RATING);
}

/** Team strength points of the players' agent edges: Σ edge × strength share, capped at ±AGENT_TEAM_CAP. */
export function agentTeamPoints(edges: readonly number[], shares: readonly number[]): number {
  const sum = edges.reduce((s, e, i) => s + e * (shares[i] ?? 0), 0);
  return Math.round(Math.max(-AGENT_TEAM_CAP, Math.min(AGENT_TEAM_CAP, sum)) * 100) / 100 || 0;
}
