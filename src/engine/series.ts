import { simulateMap, type MapResult, type Side } from './match';
import type { Rng } from './rng';
import type { BestOf, Lineup, MapName, TeamIndex } from './types';
import { autoVeto, isVetoComplete, playedMaps, type VetoState } from './veto';

export interface SeriesOptions {
  bestOf: BestOf;
  pool: readonly MapName[];
  /** Already-complete veto (e.g. done by the human player); otherwise the AI vetoes for both teams. */
  veto?: VetoState;
  /** Who starts the veto when autoVeto runs. Defaults to 0. */
  firstTeam?: TeamIndex;
  /** Per-map defender bias, passed to simulateMap. */
  defenderBias?: Partial<Record<MapName, number>>;
}

export interface SeriesResult {
  bestOf: BestOf;
  veto: VetoState;
  /** Only the maps actually played. */
  maps: MapResult[];
  score: [number, number];
  winner: TeamIndex;
}

const other = (team: TeamIndex): TeamIndex => (team === 0 ? 1 : 0);

export function winsNeeded(bestOf: BestOf): number {
  return Math.ceil(bestOf / 2);
}

/** Side the choosing team takes: defense on defender-sided maps, attack otherwise. */
function chosenSide(bias: number): Side {
  return bias > 0 ? 'defense' : 'attack';
}

export function simulateSeries(a: Lineup, b: Lineup, rng: Rng, opts: SeriesOptions): SeriesResult {
  const { bestOf } = opts;
  const veto = opts.veto ?? autoVeto(opts.pool, bestOf, [a, b], rng, opts.firstTeam ?? 0);
  if (!isVetoComplete(veto)) throw new Error('Series veto is not complete');
  if (veto.bestOf !== bestOf) throw new Error(`Veto is for MD${veto.bestOf}, series is MD${bestOf}`);

  const target = winsNeeded(bestOf);
  const score: [number, number] = [0, 0];
  const maps: MapResult[] = [];

  for (const { map, pickedBy } of playedMaps(veto)) {
    if (Math.max(score[0], score[1]) >= target) break;
    const defenderBias = opts.defenderBias?.[map] ?? 0;
    // The team that did not pick the map chooses side; on the decider, the non-first team does.
    const chooser = pickedBy === null ? other(veto.firstTeam) : other(pickedBy);
    const side = chosenSide(defenderBias);
    const teamAStartsOn: Side = chooser === 0 ? side : side === 'attack' ? 'defense' : 'attack';

    const result = simulateMap(a, b, rng, { map, teamAStartsOn, defenderBias, seriesMap: maps.length + 1 });
    maps.push(result);
    score[result.winner]++;
  }

  if (Math.max(score[0], score[1]) < target) throw new Error('Veto does not have enough maps for the series');
  return { bestOf, veto, maps, score, winner: score[0] > score[1] ? 0 : 1 };
}
