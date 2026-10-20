import type { Rng } from './rng';
import type { BestOf, Lineup, MapName, TeamIndex } from './types';

export type VetoAction = 'ban' | 'pick' | 'decider';

export interface VetoStep {
  /** null for the decider, which nobody picks. */
  team: TeamIndex | null;
  action: VetoAction;
  map: MapName;
}

export interface VetoState {
  pool: MapName[];
  bestOf: BestOf;
  /** Team that bans first ("A"). */
  firstTeam: TeamIndex;
  steps: VetoStep[];
}

export const VETO_POOL_SIZE = 7;

/** Ban/pick order for each format; teams alternate, starting with firstTeam. The last map is the decider. */
export const VETO_ORDERS: Record<BestOf, readonly ('ban' | 'pick')[]> = {
  1: ['ban', 'ban', 'ban', 'ban', 'ban', 'ban'],
  3: ['ban', 'ban', 'pick', 'pick', 'ban', 'ban'],
  5: ['ban', 'ban', 'pick', 'pick', 'pick', 'pick'],
};

/** Base AI noise in strength points; each point of coach vetoBonus removes 0.5. The difficulty may pass another base. */
export const AI_NOISE = 2;
const AI_NOISE_PER_VETO_BONUS = 0.5;

const other = (team: TeamIndex): TeamIndex => (team === 0 ? 1 : 0);

export function createVeto(pool: readonly MapName[], bestOf: BestOf, firstTeam: TeamIndex = 0): VetoState {
  if (pool.length !== VETO_POOL_SIZE || new Set(pool).size !== VETO_POOL_SIZE) {
    throw new Error(`Veto pool must have ${VETO_POOL_SIZE} distinct maps, got [${pool.join(', ')}]`);
  }
  return { pool: [...pool], bestOf, firstTeam, steps: [] };
}

/** Who acts next and how; null when the veto is complete. */
export function nextTurn(state: VetoState): { team: TeamIndex; action: 'ban' | 'pick' } | null {
  const i = state.steps.length;
  const action = VETO_ORDERS[state.bestOf][i];
  if (action === undefined) return null;
  return { team: i % 2 === 0 ? state.firstTeam : other(state.firstTeam), action };
}

export function remainingMaps(state: VetoState): MapName[] {
  const used = new Set(state.steps.map((s) => s.map));
  return state.pool.filter((m) => !used.has(m));
}

export function isVetoComplete(state: VetoState): boolean {
  return state.steps.some((s) => s.action === 'decider');
}

/** Bans or picks `map` for the team on turn. Appends the decider once the last ban/pick is done. */
export function applyVeto(state: VetoState, map: MapName): VetoState {
  const turn = nextTurn(state);
  if (!turn) throw new Error('Veto is already complete');
  const remaining = remainingMaps(state);
  if (!remaining.includes(map)) throw new Error(`Map "${map}" is not available in this veto`);

  const steps: VetoStep[] = [...state.steps, { team: turn.team, action: turn.action, map }];
  if (steps.length === VETO_ORDERS[state.bestOf].length) {
    const decider = remaining.find((m) => m !== map);
    if (decider === undefined) throw new Error('No map left for the decider');
    steps.push({ team: null, action: 'decider', map: decider });
  }
  return { ...state, steps };
}

/** Maps to be played, in order: picks as they were made, then the decider. */
export function playedMaps(state: VetoState): { map: MapName; pickedBy: TeamIndex | null }[] {
  const picks = state.steps.filter((s) => s.action === 'pick').map((s) => ({ map: s.map, pickedBy: s.team }));
  const decider = state.steps.filter((s) => s.action === 'decider').map((s) => ({ map: s.map, pickedBy: null }));
  return [...picks, ...decider];
}

/**
 * AI choice for the team on turn: edge = own map affinity − opponent's + noise.
 * Bans the lowest edge, picks the highest. A better coach (vetoBonus) means less noise.
 */
export function aiChooseMap(state: VetoState, lineups: [Lineup, Lineup], rng: Rng, baseNoise: number = AI_NOISE): MapName {
  const turn = nextTurn(state);
  if (!turn) throw new Error('Veto is already complete');
  const own = lineups[turn.team];
  const opp = lineups[other(turn.team)];
  const amplitude = Math.max(0, baseNoise - AI_NOISE_PER_VETO_BONUS * (own.coach?.vetoBonus ?? 0));

  let best: MapName | undefined;
  let bestScore = -Infinity;
  for (const map of remainingMaps(state)) {
    const edge = (own.mapAffinity?.[map] ?? 0) - (opp.mapAffinity?.[map] ?? 0) + (rng.next() * 2 - 1) * amplitude;
    const score = turn.action === 'ban' ? -edge : edge;
    if (score > bestScore) {
      best = map;
      bestScore = score;
    }
  }
  if (best === undefined) throw new Error('No map left to choose');
  return best;
}

/** Runs the whole veto with the AI on both sides. */
export function autoVeto(
  pool: readonly MapName[],
  bestOf: BestOf,
  lineups: [Lineup, Lineup],
  rng: Rng,
  firstTeam: TeamIndex = 0,
): VetoState {
  let state = createVeto(pool, bestOf, firstTeam);
  while (!isVetoComplete(state)) state = applyVeto(state, aiChooseMap(state, lineups, rng));
  return state;
}
