/**
 * Player statistics over many series, for the "Estatísticas" tab: K/D/A, ACS, estimated rating, KAST, first
 * kills and deaths, multikills, MVPs and a per-agent breakdown. Pure selectors over SeriesResult or over the compact
 * box scores every run and season keeps (src/game/boxscore.ts); the numbers are the simulator's, never real stats.
 */
import { ALL_ROSTERS } from '../data/real';
import { applyTournamentForm, prodigyGrowth } from '../engine/form';
import type { SeriesResult } from '../engine/series';
import type { Card, Role } from '../engine/types';
import { L, type CompactSeries } from './boxscore';
import { USER_ID, lineupOf as runLineupOf, runFormSeed, teamInfo, userStagesReached as runStagesReached, type RunState } from './run';
import {
  formStage,
  isCompStage,
  lineupOf as seasonLineupOf,
  seasonTeamInfo,
  stageFormSeed,
  userStagesReachedIn as seasonStagesReachedIn,
  type CompStage,
  type SeasonState,
} from './season';

export interface AgentStatLine {
  agent: string;
  maps: number;
  rounds: number;
  kills: number;
  deaths: number;
  /** Kills / deaths (kills when he never died), 2 decimals. */
  kd: number;
  /** Rounds-weighted estimated rating, 2 decimals. */
  rating: number;
  /** Rounds-weighted ACS. */
  acs: number;
}

export interface PlayerStatsLine {
  cardId: string;
  handle: string;
  maps: number;
  rounds: number;
  kills: number;
  deaths: number;
  assists: number;
  /** Kills / deaths (kills when he never died), 2 decimals. */
  kd: number;
  /** Rounds-weighted ACS. */
  acs: number;
  /** Rounds-weighted estimated rating, 2 decimals. */
  rating: number;
  /** Rounds-weighted KAST, %. */
  kast: number;
  firstKills: number;
  firstDeaths: number;
  k3: number;
  k4: number;
  aces: number;
  /** Map MVPs (best rating of the 10). */
  mvps: number;
  /** Series MVPs. */
  seriesMvps: number;
  /** Per agent, most maps first (maps where the sim picked no agent are left out). */
  agents: AgentStatLine[];
}

/**
 * One player of the championship (the user's or an AI team's), for the comparison table. `fk`/`fd` repeat
 * firstKills/firstDeaths under the table's short names.
 */
export interface StatRow extends PlayerStatsLine {
  /** Real team id of the card's entrant (logos); USER_ID for the user's players. */
  teamId: string;
  /** Entrant id in the competition (roster key, or USER_ID). */
  entrantId: string;
  /** Name of the entrant as the tables show it. */
  teamName: string;
  isUser: boolean;
  role: Role;
  /** The card's OVR as used: tournament form (and the user's prodigy growth) included. */
  ovr: number;
  fk: number;
  fd: number;
}

/** A normalized line: what the aggregation reads from a PlayerLine or a CompactLine. */
interface NLine {
  cardId: string;
  handle: string;
  kills: number;
  deaths: number;
  assists: number;
  firstKills: number;
  firstDeaths: number;
  k3: number;
  k4: number;
  k5: number;
  rating: number;
  acs: number;
  kast: number;
  mvp: boolean;
  agent?: string;
}

interface NSeries {
  maps: { rounds: number; lines: NLine[] }[];
  mvpCardId: string;
}

interface Acc {
  maps: number;
  rounds: number;
  kills: number;
  deaths: number;
  assists: number;
  acs: number;
  rating: number;
  kast: number;
}

const zero = (): Acc => ({ maps: 0, rounds: 0, kills: 0, deaths: 0, assists: 0, acs: 0, rating: 0, kast: 0 });

function add(acc: Acc, line: NLine, rounds: number): void {
  acc.maps++;
  acc.rounds += rounds;
  acc.kills += line.kills;
  acc.deaths += line.deaths;
  acc.assists += line.assists;
  acc.acs += line.acs * rounds;
  acc.rating += line.rating * rounds;
  acc.kast += line.kast * rounds;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const kd = (kills: number, deaths: number): number => round2(deaths > 0 ? kills / deaths : kills);
const avg = (sum: number, rounds: number): number => (rounds > 0 ? sum / rounds : 0);

/**
 * Aggregated stats of the players in `results`, keyed by card id. With `ids`, only those card ids (e.g. the user's
 * five); without, every player. Sorted by rating, then ACS, then handle.
 */
export function playerStats(results: readonly SeriesResult[], ids?: Iterable<string>): PlayerStatsLine[] {
  return aggregate(results.map(fromSeries), ids);
}

function fromSeries(series: SeriesResult): NSeries {
  return {
    mvpCardId: series.mvp.cardId,
    maps: series.maps.map((m) => ({
      rounds: m.rounds.length,
      lines: [...m.players[0], ...m.players[1]].map((p): NLine => {
        const line: NLine = {
          cardId: p.cardId,
          handle: p.handle,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
          firstKills: p.firstKills,
          firstDeaths: p.firstDeaths,
          k3: p.multikills.k3,
          k4: p.multikills.k4,
          k5: p.multikills.k5,
          rating: p.rating,
          acs: p.acs,
          kast: p.kast,
          mvp: p.mvp,
        };
        if (p.agent) line.agent = p.agent;
        return line;
      }),
    })),
  };
}

/** Every card of the data by id (the user's ids carry '#user'). */
const CARDS = new Map<string, Card>(ALL_ROSTERS.flatMap((e) => e.cards.map((c) => [c.id, c] as const)));
const baseId = (cardId: string): string => cardId.replace(/#user$/, '');
const cardOf = (cardId: string): Card | undefined => CARDS.get(baseId(cardId));

function fromCompact(c: CompactSeries): NSeries {
  return {
    mvpCardId: c.ids[c.mvp[0]][c.mvp[1]] ?? '',
    maps: c.maps.map((m) => ({
      rounds: m.rounds,
      lines: ([0, 1] as const).flatMap((t) =>
        m.lines[t].map((x, i): NLine => {
          const cardId = c.ids[t][i]!;
          const line: NLine = {
            cardId,
            handle: cardOf(cardId)?.handle ?? cardId,
            kills: x[L.k],
            deaths: x[L.d],
            assists: x[L.a],
            firstKills: x[L.fk],
            firstDeaths: x[L.fd],
            k3: x[L.k3],
            k4: x[L.k4],
            k5: x[L.k5],
            rating: x[L.rating] / 100,
            acs: x[L.acs],
            kast: x[L.kast],
            mvp: x[L.mvp] === 1,
          };
          if (x[L.agent]) line.agent = x[L.agent];
          return line;
        }),
      ),
    })),
  };
}

function aggregate(results: readonly NSeries[], ids?: Iterable<string>): PlayerStatsLine[] {
  const only = ids ? new Set(ids) : null;
  const totals = new Map<string, { handle: string; acc: Acc; fk: number; fd: number; k3: number; k4: number; aces: number; mvps: number; seriesMvps: number; agents: Map<string, Acc> }>();
  for (const series of results) {
    for (const map of series.maps) {
      const rounds = map.rounds;
      for (const line of map.lines) {
        if (only && !only.has(line.cardId)) continue;
        let t = totals.get(line.cardId);
        if (!t) {
          t = { handle: line.handle, acc: zero(), fk: 0, fd: 0, k3: 0, k4: 0, aces: 0, mvps: 0, seriesMvps: 0, agents: new Map() };
          totals.set(line.cardId, t);
        }
        add(t.acc, line, rounds);
        t.fk += line.firstKills;
        t.fd += line.firstDeaths;
        t.k3 += line.k3;
        t.k4 += line.k4;
        t.aces += line.k5;
        if (line.mvp) t.mvps++;
        if (line.agent) {
          const a = t.agents.get(line.agent) ?? zero();
          add(a, line, rounds);
          t.agents.set(line.agent, a);
        }
      }
    }
    const t = totals.get(series.mvpCardId);
    if (t && series.maps.length > 0) t.seriesMvps++;
  }
  return [...totals.entries()]
    .map(([cardId, t]): PlayerStatsLine => ({
      cardId,
      handle: t.handle,
      maps: t.acc.maps,
      rounds: t.acc.rounds,
      kills: t.acc.kills,
      deaths: t.acc.deaths,
      assists: t.acc.assists,
      kd: kd(t.acc.kills, t.acc.deaths),
      acs: Math.round(avg(t.acc.acs, t.acc.rounds)),
      rating: round2(avg(t.acc.rating, t.acc.rounds)),
      kast: Math.round(avg(t.acc.kast, t.acc.rounds)),
      firstKills: t.fk,
      firstDeaths: t.fd,
      k3: t.k3,
      k4: t.k4,
      aces: t.aces,
      mvps: t.mvps,
      seriesMvps: t.seriesMvps,
      agents: [...t.agents.entries()]
        .map(([agent, a]) => ({
          agent,
          maps: a.maps,
          rounds: a.rounds,
          kills: a.kills,
          deaths: a.deaths,
          kd: kd(a.kills, a.deaths),
          rating: round2(avg(a.rating, a.rounds)),
          acs: Math.round(avg(a.acs, a.rounds)),
        }))
        .sort((x, y) => y.maps - x.maps || y.rating - x.rating || x.agent.localeCompare(y.agent)),
    }))
    .sort((x, y) => y.rating - x.rating || y.acs - x.acs || x.handle.localeCompare(y.handle));
}

/** How to describe the entrants and the cards' OVR of one competition (a run, or one stage of a season). */
interface RowContext {
  teamName: (entrantId: string) => string;
  /** OVR of a card id as used by that entrant (its lineup), or computed for a card no longer in it. */
  ovr: (entrantId: string, cardId: string) => number;
}

/** Box scores → StatRows: every player who played, with his team, role and OVR as used. */
function rows(boxes: readonly CompactSeries[], ctx: RowContext, onlyUser = false): StatRow[] {
  const entrantOf = new Map<string, string>();
  for (const b of boxes) for (const t of [0, 1] as const) for (const id of b.ids[t]) entrantOf.set(id, b.teams[t]);
  const ids = onlyUser ? [...entrantOf.entries()].filter(([, e]) => e === USER_ID).map(([id]) => id) : undefined;
  const names = new Map<string, string>();
  const nameOf = (id: string): string => {
    let n = names.get(id);
    if (n === undefined) names.set(id, (n = ctx.teamName(id)));
    return n;
  };
  return aggregate(boxes.map(fromCompact), ids).map((p): StatRow => {
    const entrantId = entrantOf.get(p.cardId)!;
    const card = cardOf(p.cardId);
    const isUser = entrantId === USER_ID;
    return {
      ...p,
      teamId: isUser ? USER_ID : card?.teamId ?? entrantId,
      entrantId,
      teamName: nameOf(entrantId),
      isUser,
      role: card?.role ?? 'duelist',
      ovr: ctx.ovr(entrantId, p.cardId),
      fk: p.firstKills,
      fd: p.firstDeaths,
    };
  });
}

/** OVR of `cardId` in `lineup` when he is in it, else the card with the same tournament form drawn alone. */
function ovrIn(players: readonly { card: Card }[], cardId: string, seedBase: string, growth: number): number {
  const inLineup = players.find((p) => p.card.id === cardId);
  if (inLineup) return inLineup.card.ovr;
  const card = cardOf(cardId);
  if (!card) return 0;
  const alone = applyTournamentForm({ name: '', players: [{ card: { ...card, id: cardId }, slot: card.role }] }, seedBase, growth);
  return alone.players[0]!.card.ovr;
}

function runContext(run: RunState): RowContext {
  const lineups = new Map<string, readonly { card: Card }[]>();
  const growth = prodigyGrowth(runStagesReached(run));
  return {
    teamName: (id) => teamInfo(run, id).name,
    ovr: (entrant, cardId) => {
      let players = lineups.get(entrant);
      if (!players) {
        players = runLineupOf(run, entrant).players;
        lineups.set(entrant, players);
      }
      return ovrIn(players, cardId, runFormSeed(run), entrant === USER_ID ? growth : 0);
    },
  };
}

/** Stats of the user's players over every series of the run (with their OVR as used). */
export function runPlayerStats(run: RunState): StatRow[] {
  return rows(Object.values(run.boxScores ?? {}), runContext(run), true);
}

/** Every player of the Champions, over every match played so far (AI vs AI too). Best rating first. */
export function runAllPlayerStats(run: RunState): StatRow[] {
  return rows(Object.values(run.boxScores ?? {}), runContext(run));
}

function seasonContext(s: SeasonState, stage: CompStage): RowContext {
  const lineups = new Map<string, readonly { card: Card }[]>();
  // The prodigies' growth as they played this stage (by its end, or so far for the current one), not today's.
  const growth = prodigyGrowth(seasonStagesReachedIn(s, stage));
  const current = formStage(s) === stage;
  return {
    teamName: (id) => seasonTeamInfo(s, id).name,
    ovr: (entrant, cardId) => {
      let players = lineups.get(entrant);
      if (!players) {
        // The current stage's lineups as they play; another stage's cards are drawn with that stage's form.
        players = current ? seasonLineupOf(s, entrant).players : [];
        lineups.set(entrant, players);
      }
      return ovrIn(players, cardId, stageFormSeed(s, stage), entrant === USER_ID ? growth : 0);
    },
  };
}

function seasonBoxes(s: SeasonState, stage?: CompStage): CompactSeries[] {
  return Object.entries(s.boxScores ?? {})
    .filter(([key]) => !stage || key.startsWith(`${stage}:`))
    .map(([, box]) => box);
}

/** The stage the stats tab shows by default: the current one, or the last one played. */
export function seasonStatsStage(s: SeasonState): CompStage {
  if (isCompStage(s.stage)) return s.stage;
  if (s.stage === 'market') return s.market?.window === 'post-masters' ? 'masters' : 'league';
  return s.champions ? 'champions' : s.masters ? 'masters' : 'league';
}

/** Stats of the user's players over every series of the season (league, Masters and Champions). */
export function seasonPlayerStats(s: SeasonState): StatRow[] {
  return rows(seasonBoxes(s), seasonContext(s, formStage(s)), true);
}

/** Every player of one stage of the season (default: the current or last one), AI vs AI included. */
export function seasonAllPlayerStats(s: SeasonState, stage: CompStage = seasonStatsStage(s)): StatRow[] {
  return rows(seasonBoxes(s, stage), seasonContext(s, stage));
}
