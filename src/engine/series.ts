import type { MetaTable } from './form';
import { compareLines, simulateMap, type MapResult, type Side } from './match';
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
  /** Base of the per-player form seeds (e.g. `${runSeed}:${matchId}`), see MapOptions.formSeed. */
  formSeed?: string;
  /** Agent meta per map (the veto pool's year), see MapOptions.meta. */
  meta?: MetaTable;
}

export interface SeriesMvp {
  team: TeamIndex;
  cardId: string;
  handle: string;
  /** Rounds-weighted estimated rating over the series. */
  rating: number;
  /** Rounds-weighted ACS over the series. */
  acs: number;
}

export interface SeriesResult {
  bestOf: BestOf;
  veto: VetoState;
  /** Only the maps actually played. */
  maps: MapResult[];
  score: [number, number];
  winner: TeamIndex;
  /** Best rounds-weighted estimated rating of the 10 over the maps played. */
  mvp: SeriesMvp;
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

    const mapOpts: Parameters<typeof simulateMap>[3] = {
      map,
      teamAStartsOn,
      defenderBias,
      seriesMap: maps.length + 1,
      decider: maps.length + 1 === bestOf,
    };
    if (opts.formSeed !== undefined) mapOpts.formSeed = opts.formSeed;
    const prev = maps[maps.length - 1];
    if (prev) mapOpts.prevForm = [prev.players[0].map((p) => p.form), prev.players[1].map((p) => p.form)];
    const meta = opts.meta?.[map];
    if (meta) mapOpts.meta = meta;
    const result = simulateMap(a, b, rng, mapOpts);
    maps.push(result);
    score[result.winner]++;
  }

  if (Math.max(score[0], score[1]) < target) throw new Error('Veto does not have enough maps for the series');
  return { bestOf, veto, maps, score, winner: score[0] > score[1] ? 0 : 1, mvp: seriesMvp(maps) };
}

/** MVP of a series: best rounds-weighted estimated rating of the 10 (ties like compareLines; then team order). */
export function seriesMvp(maps: readonly MapResult[]): SeriesMvp {
  const totals = new Map<string, { team: TeamIndex; handle: string; rating: number; acs: number; kills: number; deaths: number; rounds: number }>();
  for (const m of maps) {
    const n = m.rounds.length;
    ([0, 1] as const).forEach((team) => {
      for (const line of m.players[team]) {
        const t = totals.get(line.cardId) ?? { team, handle: line.handle, rating: 0, acs: 0, kills: 0, deaths: 0, rounds: 0 };
        t.rating += line.rating * n;
        t.acs += line.acs * n;
        t.kills += line.kills;
        t.deaths += line.deaths;
        t.rounds += n;
        totals.set(line.cardId, t);
      }
    });
  }
  let best: { cardId: string; team: TeamIndex; handle: string; rating: number; acs: number; kills: number; deaths: number } | null = null;
  for (const [cardId, t] of totals) {
    const line = { cardId, team: t.team, handle: t.handle, rating: t.rating / t.rounds, acs: t.acs / t.rounds, kills: t.kills, deaths: t.deaths };
    if (!best || compareLines(line, best) > 0) best = line;
  }
  if (!best) throw new Error('A series needs at least one map');
  return { team: best.team, cardId: best.cardId, handle: best.handle, rating: Math.round(best.rating * 100) / 100, acs: Math.round(best.acs) };
}
