import {
  AURA_KILL,
  COLD_RATING,
  INSPIRED_RATING,
  auraPoints,
  formFactor,
  formSeed,
  mapFormZ,
  metaFit,
  teamFormPoints,
  type MapMeta,
} from './form';
import { agentEdge, agentFactor, agentTeamPoints, pickAgents, type AgentRoles } from './agents';
import { strengthShares } from './form';
import { createRng, type Rng } from './rng';
import { cardFit, teamStrength, type StrengthBreakdown } from './team';
import type { AuraTier, Lineup, LineupPlayer, MapName, TeamIndex } from './types';

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
  /** 1-based position of this map in its series (1 when omitted): decision weighs more on later maps. */
  seriesMap?: number;
  /**
   * Base of the per-player form seeds (e.g. `${runSeed}:${matchId}`): each player's form on this map then depends
   * only on the match, the map and the card (never on UI actions). Without it, the forms are drawn from `rng`.
   */
  formSeed?: string;
  /** Form z of each player on the previous map of the series (hot hand, ρ = 0.1), by team and lineup order. */
  prevForm?: [number[], number[]];
  /** Decider (last possible map of the series): personal auras act on every round. */
  decider?: boolean;
  /** Agent meta of this map (share of the slots per agent): the comp that fits it best earns up to +1.5. */
  meta?: MapMeta;
  /**
   * Map familiarity of each team (strength points, src/engine/familiarity.ts): what the team gained by playing this
   * map earlier in the run or season. Kept apart from `adjust` so the scoreboard can show it.
   */
  familiarity?: [number, number];
  /** Agent → role table: a player in another role's slot picks that role's agents when his pool has them. */
  agentRoles?: AgentRoles;
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

export interface Multikills {
  k2: number;
  k3: number;
  k4: number;
  /** Aces. */
  k5: number;
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
  /**
   * Estimated rating (not VLR's Rating 2.0): 1.00 is an average line; built from kills, deaths, assists and KAST
   * per round so that, like the real rating, it follows the result (RATING_WEIGHTS). Picks the MVPs.
   */
  rating: number;
  /** Rounds with 2, 3, 4 and 5 kills. */
  multikills: Multikills;
  /** Map form drawn for the player, as a z-score (0 = his level). The tags on the scoreboard follow `rating`. */
  form: number;
  /** Best estimated rating of the 10 on this map. */
  mvp: boolean;
  /** Agent the player used on this map (from his real pool), when the sim picks one. */
  agent?: string;
  /** Agent edge on that agent, in OVR points (src/engine/agents.ts), when not zero. */
  agentEdge?: number;
}

/** Strength points each team got on this map beyond its lineup strength, for the UI and the calibration tests. */
export interface MapEdges {
  /** Team-level form (±1.5 × FORM_SWING). */
  swing: number;
  /** Sum of the players' map forms (K × Σ (f − 1) × share). */
  form: number;
  /** Meta fit of the comp (0 … META_BONUS_MAX). */
  meta: number;
  /** Personal auras in a decider / overtime (0 otherwise). */
  aura: number;
  /** Agent edges of the players on their picked agents (Σ edge × share, ±AGENT_TEAM_CAP; 0 without real pools). */
  agent: number;
  /** Map familiarity (MapOptions.familiarity). */
  familiarity: number;
}

export interface MapResult {
  map: MapName;
  score: [number, number];
  winner: TeamIndex;
  rounds: RoundResult[];
  players: [PlayerLine[], PlayerLine[]];
  strength: [StrengthBreakdown, StrengthBreakdown];
  edges: [MapEdges, MapEdges];
}

const ROUNDS_TO_WIN = 13;
const HALF_LENGTH = 12;
const REGULATION_ROUNDS = 24;
const MAX_ROUNDS = 200;
/**
 * Strength points per logistic unit: higher = more upsets. Tuned with FORM_SWING so that, over a whole map,
 * +10 strength wins ≈ 74% and +20 ≈ 93% (was 15: +10 ≈ 94%, which made every series a formality).
 * src/game/balance.test.ts measures it.
 */
const ROUND_SCALE = 30;
/**
 * Width of each team's map-level form: a team plays a map up to ±1.5 × FORM_SWING points off its level (σ ≈ 4).
 * 8 since Modelo v3 (was 10): the players' individual forms now add σ ≈ 4 per team, so the total map form stays
 * between the old engine (σ_p ≈ 0.06 in round probability) and the real one (0.08–0.09).
 */
export const FORM_SWING = 8;
/**
 * Economy after the pistol (docs/pesquisa-taticas.md §3.3, 541 pro pistols): the pistol winner takes round 2
 * (half buy vs eco) 87% of the time → logit 1.9 → 57 points at ROUND_SCALE 30; and only 38% of round 3 (the
 * "bonus round": the pistol loser has a full buy) → logit −0.48 → −15 points. There is no momentum beyond that
 * (full buy vs full buy repeats the previous winner 49.9%).
 */
const ROUND2_EDGE = 57;
const ROUND3_EDGE = -15;
/**
 * Decision (tactics) in the rounds where calls act — buys after a loss, post-plant, retakes — i.e. every gun
 * round: strength points per 10 points of decision difference. Larger late in a series (×1.25 on map 2, ×1.5
 * from map 3: adaptation and anti-strat) and in overtime (×1.5: every OT round resets the economy, so the calls
 * and the nerves decide). A typical "no IGL" gap (75 → 55, 20 points) costs ≈ 1 point on map 1 and ≈ 1.5 on
 * map 3, on top of the static decision term in src/engine/team.ts (≈ 2): ≈ 57–59% of maps for the IGL side.
 */
const DECISION_EDGE = 0.5;
const DECISION_OT_FACTOR = 1.5;
/** Clutch and composure: strength points per 10 points of clutch difference, overtime rounds only. */
const CLUTCH_OT_EDGE = 0.5;
const ASSIST_CHANCE = 0.5;

/**
 * Kills by the round winner (index = kills): 5 (elimination) is most common, 3–4 when the spike decides. With the
 * loser's quota, 6.9 kills per round over the 10 players (measured 6.86, docs/pesquisa-variancia.md §2.6).
 */
export const WINNER_KILL_WEIGHTS = [0, 0, 0, 0.1, 0.26, 0.64];
/** Kills by the round loser: 0–4 (the winner always keeps someone alive). */
export const LOSER_KILL_WEIGHTS = [0.05, 0.13, 0.26, 0.32, 0.24];
/**
 * Kill chain: the player who made the last kill of the round has his weight × (1 + CHAIN × kills so far × form)
 * for the next one. 0.25 reproduces the real 3K / 4K / ace rates (3.8% / 0.8% / 0.08% per player-round, stars
 * higher); ≥ 0.5 doubles the aces.
 */
export const CHAIN = 0.25;
/**
 * Trade: a player who has just killed is exposed, so his death weight is × (1 + TRADE × kills so far in the round)
 * for the other side's next kill. Spreads the kills of a star across rounds (a real 0.84-KPR player makes a 3K+
 * in 6.9% of the rounds, a multinomial lottery would give him 9%) without touching his kills per round.
 */
export const TRADE = 0.7;
/**
 * Estimated rating of a line: intercept + kills, deaths and assists per round and KAST (as a fraction). An
 * average line (KPR 0.69, DPR 0.69, APR 0.25, KAST 72%) rates 1.00; a map of a real top rating (≈ 1.5) needs
 * KPR ≈ 1.0 with few deaths. Deaths count because the real rating follows the result (one third of a map's
 * rating variance is the team's), which ACS alone (kills) does not capture.
 */
export const RATING_WEIGHTS = { intercept: 0.98, kpr: 0.8, dpr: -0.8, apr: 0.25, kast: 0.6 } as const;

/** Estimated rating from per-round numbers (see RATING_WEIGHTS). */
export function estimateRating(kpr: number, dpr: number, apr: number, kast: number): number {
  const w = RATING_WEIGHTS;
  return Math.round((w.intercept + w.kpr * kpr + w.dpr * dpr + w.apr * apr + w.kast * (kast - 0.72)) * 100) / 100;
}

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

/** Decision weight by position in the series: ×1 on map 1, ×1.25 on map 2, ×1.5 from map 3. */
export function decisionMapFactor(seriesMap: number): number {
  return seriesMap >= 3 ? 1.5 : seriesMap === 2 ? 1.25 : 1;
}

/** Map-level form swing (≈ ±12 points, σ ≈ 4), so the stronger lineup does not always win: upsets happen on bad days. */
function formSwing(rng: Rng): number {
  return (rng.next() + rng.next() + rng.next() - 1.5) * FORM_SWING;
}

/** A player in a map: lineup entry plus his form and aura for the round simulation. */
interface MapPlayer {
  p: LineupPlayer;
  /** Kill multiplier of the map (form). */
  f: number;
  /** Kill multiplier of the agent edge (1 without one), applied like the form. */
  a: number;
  aura: AuraTier | undefined;
}

function killWeight(m: MapPlayer, opening: boolean, auraOn: boolean): number {
  const { aim, entry } = m.p.card.attrs;
  const fit = cardFit(m.p.card, m.p.slot);
  const base = (opening ? entry * 0.7 + aim * 0.3 : aim * 0.6 + entry * 0.4) * fit * m.f * m.a;
  return auraOn && m.aura ? base * (1 + AURA_KILL[m.aura]) : base;
}

function deathWeight(m: MapPlayer, auraOn: boolean): number {
  const { presence, clutch } = m.p.card.attrs;
  const base = (140 - (presence + clutch) / 2) / Math.sqrt(m.f * m.a);
  return auraOn && m.aura ? base / (1 + AURA_KILL[m.aura] / 2) : base;
}

function simulateKills(teams: [MapPlayer[], MapPlayer[]], winner: TeamIndex, rng: Rng, auraOn: boolean): KillEvent[] {
  const loser: TeamIndex = winner === 0 ? 1 : 0;
  const quota: [number, number] = [0, 0];
  quota[winner] = rng.weightedIndex(WINNER_KILL_WEIGHTS);
  quota[loser] = rng.weightedIndex(LOSER_KILL_WEIGHTS);

  const alive: [MapPlayer[], MapPlayer[]] = [[...teams[0]], [...teams[1]]];
  const kills: KillEvent[] = [];
  const killsBy = new Map<MapPlayer, number>();
  let last: MapPlayer | null = null;

  while (quota[0] + quota[1] > 0) {
    const side: TeamIndex = rng.weightedIndex(quota) === 0 ? 0 : 1;
    const other: TeamIndex = side === 0 ? 1 : 0;
    if (alive[side].length === 0 || alive[other].length === 0) {
      quota[side] = 0;
      continue;
    }
    const opening = kills.length === 0;
    const weights = alive[side].map((m) => {
      const w = killWeight(m, opening, auraOn);
      return m === last ? w * (1 + CHAIN * (killsBy.get(m) ?? 0) * m.f) : w;
    });
    const killer = alive[side][rng.weightedIndex(weights)]!;
    const victimIdx = rng.weightedIndex(alive[other].map((m) => deathWeight(m, auraOn) * (1 + TRADE * (killsBy.get(m) ?? 0))));
    const victim = alive[other][victimIdx]!;
    alive[other].splice(victimIdx, 1);

    const event: KillEvent = { killer: killer.p.card.id, victim: victim.p.card.id };
    const helpers = alive[side].filter((m) => m !== killer);
    if (helpers.length > 0 && rng.next() < ASSIST_CHANCE) {
      event.assister = helpers[rng.weightedIndex(helpers.map((m) => m.p.card.attrs.utility * Math.sqrt(m.f)))]!.p.card.id;
    }
    kills.push(event);
    killsBy.set(killer, (killsBy.get(killer) ?? 0) + 1);
    last = killer;
    quota[side]--;
  }
  return kills;
}

function buildLines(
  lineup: Lineup,
  rounds: RoundResult[],
  forms: readonly number[],
  agents: readonly (string | undefined)[],
  agentEdges: readonly number[],
): PlayerLine[] {
  return lineup.players.map(({ card }, idx) => {
    let kills = 0;
    let deaths = 0;
    let assists = 0;
    let firstKills = 0;
    let firstDeaths = 0;
    let kastRounds = 0;
    const multikills: Multikills = { k2: 0, k3: 0, k4: 0, k5: 0 };
    for (const round of rounds) {
      let contributed = false;
      let died = false;
      let inRound = 0;
      round.kills.forEach((k, i) => {
        if (k.killer === card.id) {
          kills++;
          inRound++;
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
      if (inRound === 2) multikills.k2++;
      else if (inRound === 3) multikills.k3++;
      else if (inRound === 4) multikills.k4++;
      else if (inRound >= 5) multikills.k5++;
      if (contributed || !died) kastRounds++;
    }
    const n = rounds.length;
    const line: PlayerLine = {
      cardId: card.id,
      handle: card.handle,
      kills,
      deaths,
      assists,
      firstKills,
      firstDeaths,
      acs: Math.round((kills * 220 + assists * 40 + firstKills * 25) / n),
      kast: Math.round((kastRounds / n) * 100),
      rating: estimateRating(kills / n, deaths / n, assists / n, kastRounds / n),
      multikills,
      form: forms[idx]!,
      mvp: false,
    };
    const agent = agents[idx];
    if (agent) line.agent = agent;
    if (agentEdges[idx]) line.agentEdge = agentEdges[idx];
    return line;
  });
}

/** Order of two lines for the MVP: rating, then ACS, then K − D, then kills (positive when `a` is better). */
export function compareLines(a: Pick<PlayerLine, 'rating' | 'acs' | 'kills' | 'deaths'>, b: Pick<PlayerLine, 'rating' | 'acs' | 'kills' | 'deaths'>): number {
  return a.rating - b.rating || a.acs - b.acs || a.kills - a.deaths - (b.kills - b.deaths) || a.kills - b.kills;
}

/** Marks the map MVP: the best line of the 10 (compareLines; the first listed wins a full tie). */
function markMvp(players: [PlayerLine[], PlayerLine[]]): void {
  let best: PlayerLine | null = null;
  for (const line of [...players[0], ...players[1]]) {
    if (!best || compareLines(line, best) > 0) best = line;
  }
  if (best) best.mvp = true;
}

/** "Inspirado": a map at or above INSPIRED_RATING (the research's "inspired map", rating ≥ 1.5, ≈ 8% of player-maps). */
export function isInspired(line: Pick<PlayerLine, 'rating'>): boolean {
  return line.rating >= INSPIRED_RATING;
}

/** "Apagado": a map at or below COLD_RATING. */
export function isCold(line: Pick<PlayerLine, 'rating'>): boolean {
  return line.rating <= COLD_RATING;
}

export function simulateMap(a: Lineup, b: Lineup, rng: Rng, opts: MapOptions): MapResult {
  const strength: [StrengthBreakdown, StrengthBreakdown] = [teamStrength(a), teamStrength(b)];
  const start = opts.teamAStartsOn ?? 'attack';
  const defenderBias = opts.defenderBias ?? 0;
  const swing: [number, number] = [formSwing(rng), formSwing(rng)];
  const affinity = (l: Lineup) => l.mapAffinity?.[opts.map] ?? 0;

  // Per-player form of the map (seeded per match, map and card when formSeed is given) and the aura flags.
  // Agents come from their own seed (never from `rng`), so picking them changes no other draw.
  const lineups: [Lineup, Lineup] = [a, b];
  const forms: [number[], number[]] = [[], []];
  const agents = lineups.map((l, t) =>
    pickAgents(l.players, `${opts.formSeed ?? 'map'}:${opts.map}:agents:${t}`, opts.meta, opts.agentRoles),
  ) as [(string | undefined)[], (string | undefined)[]];
  const agentEdges = lineups.map((l, t) => l.players.map((p, i) => agentEdge(p.card, agents[t]![i])));
  const teams = lineups.map((l, t) =>
    l.players.map((p, i): MapPlayer => {
      const prev = opts.prevForm?.[t]?.[i];
      const z = mapFormZ(opts.formSeed ? createRng(formSeed(opts.formSeed, opts.map, p.card.id)) : rng, prev);
      forms[t]![i] = z;
      return { p, f: formFactor(z, p.card.ovr, p.card.role), a: agentFactor(agentEdges[t]![i]!), aura: p.card.aura };
    }),
  ) as [MapPlayer[], MapPlayer[]];
  const edges = lineups.map((l, t): MapEdges => ({
    swing: swing[t]!,
    form: teamFormPoints(l.players, teams[t]!.map((m) => m.f)),
    meta: metaFit(l, opts.meta).points,
    aura: 0,
    agent: agentTeamPoints(agentEdges[t]!, strengthShares(l.players)),
    familiarity: opts.familiarity?.[t] ?? 0,
  })) as [MapEdges, MapEdges];
  const aura: [number, number] = [auraPoints(a.players), auraPoints(b.players)];
  const decider = opts.decider ?? false;

  const adjust = (opts.adjust?.[0] ?? 0) + affinity(a) - (opts.adjust?.[1] ?? 0) - affinity(b);
  const fixed = (key: 'swing' | 'form' | 'meta' | 'agent' | 'familiarity') => edges[0][key] - edges[1][key];
  const dimension = (key: 'decision' | 'clutch') => strength[0].dimensions[key] - strength[1].dimensions[key];
  const decisionEdge = (DECISION_EDGE * dimension('decision') * decisionMapFactor(opts.seriesMap ?? 1)) / 10;
  const clutchEdge = (CLUTCH_OT_EDGE * dimension('clutch')) / 10;

  const score: [number, number] = [0, 0];
  const rounds: RoundResult[] = [];

  for (let n = 1; ; n++) {
    if (n > MAX_ROUNDS) throw new Error('Map did not finish');
    const teamASide = sideOf(n, start);
    let diff =
      strength[0].total - strength[1].total + fixed('swing') + fixed('form') + fixed('meta') + fixed('agent') + fixed('familiarity') + adjust;
    diff += teamASide === 'defense' ? defenderBias : -defenderBias;

    // Economy: anti-eco (round 2) and bonus round (round 3) after each pistol.
    const prev = rounds[rounds.length - 1];
    const prev2 = rounds[rounds.length - 2];
    if (prev && isPistol(prev.number)) diff += prev.winner === 0 ? ROUND2_EDGE : -ROUND2_EDGE;
    else if (prev2 && isPistol(prev2.number)) diff += prev2.winner === 0 ? ROUND3_EDGE : -ROUND3_EDGE;

    // Tactics in gun rounds (buys, post-plant, retakes); calls and nerves weigh more in overtime.
    const overtime = n > REGULATION_ROUNDS;
    if (!isPistol(n)) diff += overtime ? decisionEdge * DECISION_OT_FACTOR : decisionEdge;
    if (overtime) diff += clutchEdge;

    // Personal auras: deciders and overtime only (measured +0.017 rating for the top quartile in deciders).
    const auraOn = decider || overtime;
    if (auraOn) {
      diff += aura[0] - aura[1];
      edges[0].aura = aura[0];
      edges[1].aura = aura[1];
    }

    const pA = 1 / (1 + Math.exp(-diff / ROUND_SCALE));
    const winner: TeamIndex = rng.next() < pA ? 0 : 1;
    score[winner]++;
    rounds.push({ number: n, winner, teamASide, kills: simulateKills(teams, winner, rng, auraOn) });

    const lead = Math.abs(score[0] - score[1]);
    if (Math.max(score[0], score[1]) >= ROUNDS_TO_WIN && lead >= 2) break;
  }

  const players: [PlayerLine[], PlayerLine[]] = [
    buildLines(a, rounds, forms[0], agents[0], agentEdges[0]!),
    buildLines(b, rounds, forms[1], agents[1], agentEdges[1]!),
  ];
  markMvp(players);
  return {
    map: opts.map,
    score,
    winner: score[0] > score[1] ? 0 : 1,
    rounds,
    players,
    strength,
    edges,
  };
}
