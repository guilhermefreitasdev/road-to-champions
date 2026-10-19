import type { Rng } from './rng';
import { roleFit, teamStrength, type StrengthBreakdown } from './team';
import type { Lineup, LineupPlayer, MapName, TeamIndex } from './types';

export type { TeamIndex } from './types';
export type Side = 'attack' | 'defense';

export interface MapOptions {
  map: MapName;
  /** Side team A starts on. Defaults to attack. */
  teamAStartsOn?: Side;
  /** Strength points added to whoever is defending; negative favours attackers. */
  defenderBias?: number;
  /** Extra strength points per team for this map (e.g. veto/comp bonuses), on top of lineup.mapAffinity. */
  adjust?: [number, number];
}

export interface KillEvent {
  killer: string;
  victim: string;
  assister?: string;
}

export interface RoundResult {
  number: number;
  winner: TeamIndex;
  teamASide: Side;
  kills: KillEvent[];
}

export interface PlayerLine {
  cardId: string;
  handle: string;
  kills: number;
  deaths: number;
  assists: number;
  firstKills: number;
  firstDeaths: number;
  /** Estimated average combat score (we have no damage data, so it is derived from kills and assists). */
  acs: number;
  /** % of rounds with a kill, assist or survival. */
  kast: number;
}

export interface MapResult {
  map: MapName;
  score: [number, number];
  winner: TeamIndex;
  rounds: RoundResult[];
  players: [PlayerLine[], PlayerLine[]];
  strength: [StrengthBreakdown, StrengthBreakdown];
}

const ROUNDS_TO_WIN = 13;
const HALF_LENGTH = 12;
const REGULATION_ROUNDS = 24;
const MAX_ROUNDS = 200;
/**
 * Strength points per logistic unit: higher = more upsets. Tuned with FORM_SWING so that, over a whole map,
 * +10 strength wins ≈ 78% and +20 ≈ 94% (was 15: +10 ≈ 94%, which made every series a formality).
 * src/game/balance.test.ts measures it.
 */
const ROUND_SCALE = 30;
/** Width of each team's map-level form: a team plays a map up to ±1.5 × FORM_SWING points off its level. */
const FORM_SWING = 8;
/** Edge for the team that won the pistol round in the following (anti-eco) round. */
const ANTI_ECO_EDGE = 6;
const ASSIST_CHANCE = 0.5;

/** Kills by the round winner: 5 (elimination) is most common, 3–4 when the spike decides. */
const WINNER_KILL_WEIGHTS = [0, 0, 0, 0.15, 0.25, 0.6];
/** Kills by the round loser: 0–4 (the winner always keeps someone alive). */
const LOSER_KILL_WEIGHTS = [0.15, 0.25, 0.3, 0.2, 0.1];

function sideOf(round: number, start: Side): Side {
  const swapped: Side = start === 'attack' ? 'defense' : 'attack';
  if (round <= HALF_LENGTH) return start;
  if (round <= REGULATION_ROUNDS) return swapped;
  // Overtime: sides swap every round, starting from the original side.
  return (round - REGULATION_ROUNDS - 1) % 2 === 0 ? start : swapped;
}

function isPistol(round: number): boolean {
  return round === 1 || round === HALF_LENGTH + 1;
}

/** Map-level form swing (≈ ±12 points, σ ≈ 4), so the stronger lineup does not always win: upsets happen on bad days. */
function formSwing(rng: Rng): number {
  return (rng.next() + rng.next() + rng.next() - 1.5) * FORM_SWING;
}

function killWeight(p: LineupPlayer, opening: boolean): number {
  const { aim, entry } = p.card.attrs;
  const fit = roleFit(p.card.role, p.slot);
  return (opening ? entry * 0.7 + aim * 0.3 : aim * 0.6 + entry * 0.4) * fit;
}

function deathWeight(p: LineupPlayer): number {
  const { consistency, clutch } = p.card.attrs;
  return 140 - (consistency + clutch) / 2;
}

function simulateKills(
  teams: [LineupPlayer[], LineupPlayer[]],
  winner: TeamIndex,
  rng: Rng,
): KillEvent[] {
  const loser: TeamIndex = winner === 0 ? 1 : 0;
  const quota: [number, number] = [0, 0];
  quota[winner] = rng.weightedIndex(WINNER_KILL_WEIGHTS);
  quota[loser] = rng.weightedIndex(LOSER_KILL_WEIGHTS);

  const alive: [LineupPlayer[], LineupPlayer[]] = [[...teams[0]], [...teams[1]]];
  const kills: KillEvent[] = [];

  while (quota[0] + quota[1] > 0) {
    const side: TeamIndex = rng.weightedIndex(quota) === 0 ? 0 : 1;
    const other: TeamIndex = side === 0 ? 1 : 0;
    if (alive[side].length === 0 || alive[other].length === 0) {
      quota[side] = 0;
      continue;
    }
    const opening = kills.length === 0;
    const killer = alive[side][rng.weightedIndex(alive[side].map((p) => killWeight(p, opening)))]!;
    const victimIdx = rng.weightedIndex(alive[other].map(deathWeight));
    const victim = alive[other][victimIdx]!;
    alive[other].splice(victimIdx, 1);

    const event: KillEvent = { killer: killer.card.id, victim: victim.card.id };
    const helpers = alive[side].filter((p) => p !== killer);
    if (helpers.length > 0 && rng.next() < ASSIST_CHANCE) {
      event.assister = helpers[rng.weightedIndex(helpers.map((p) => p.card.attrs.utility))]!.card.id;
    }
    kills.push(event);
    quota[side]--;
  }
  return kills;
}

function buildLines(lineup: Lineup, rounds: RoundResult[]): PlayerLine[] {
  return lineup.players.map(({ card }) => {
    let kills = 0;
    let deaths = 0;
    let assists = 0;
    let firstKills = 0;
    let firstDeaths = 0;
    let kastRounds = 0;
    for (const round of rounds) {
      let contributed = false;
      let died = false;
      round.kills.forEach((k, i) => {
        if (k.killer === card.id) {
          kills++;
          contributed = true;
          if (i === 0) firstKills++;
        }
        if (k.assister === card.id) {
          assists++;
          contributed = true;
        }
        if (k.victim === card.id) {
          deaths++;
          died = true;
          if (i === 0) firstDeaths++;
        }
      });
      if (contributed || !died) kastRounds++;
    }
    const n = rounds.length;
    return {
      cardId: card.id,
      handle: card.handle,
      kills,
      deaths,
      assists,
      firstKills,
      firstDeaths,
      acs: Math.round((kills * 220 + assists * 40 + firstKills * 25) / n),
      kast: Math.round((kastRounds / n) * 100),
    };
  });
}

export function simulateMap(a: Lineup, b: Lineup, rng: Rng, opts: MapOptions): MapResult {
  const strength: [StrengthBreakdown, StrengthBreakdown] = [teamStrength(a), teamStrength(b)];
  const start = opts.teamAStartsOn ?? 'attack';
  const defenderBias = opts.defenderBias ?? 0;
  const form = formSwing(rng) - formSwing(rng);
  const affinity = (l: Lineup) => l.mapAffinity?.[opts.map] ?? 0;
  const adjust = (opts.adjust?.[0] ?? 0) + affinity(a) - (opts.adjust?.[1] ?? 0) - affinity(b);

  const score: [number, number] = [0, 0];
  const rounds: RoundResult[] = [];

  for (let n = 1; ; n++) {
    if (n > MAX_ROUNDS) throw new Error('Map did not finish');
    const teamASide = sideOf(n, start);
    let diff = strength[0].total - strength[1].total + form + adjust;
    diff += teamASide === 'defense' ? defenderBias : -defenderBias;

    const prev = rounds[rounds.length - 1];
    if (prev && isPistol(prev.number)) {
      diff += prev.winner === 0 ? ANTI_ECO_EDGE : -ANTI_ECO_EDGE;
    }

    const pA = 1 / (1 + Math.exp(-diff / ROUND_SCALE));
    const winner: TeamIndex = rng.next() < pA ? 0 : 1;
    score[winner]++;
    rounds.push({ number: n, winner, teamASide, kills: simulateKills([a.players, b.players], winner, rng) });

    const lead = Math.abs(score[0] - score[1]);
    if (Math.max(score[0], score[1]) >= ROUNDS_TO_WIN && lead >= 2) break;
  }

  return {
    map: opts.map,
    score,
    winner: score[0] > score[1] ? 0 : 1,
    rounds,
    players: [buildLines(a, rounds), buildLines(b, rounds)],
    strength,
  };
}
