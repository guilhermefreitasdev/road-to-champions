/**
 * The four puzzles of each day, generated from the calendar date alone (same date ⇒ same puzzles for everyone).
 *
 * Days are planned in order from the launch (#1): each day draws from seeded pools (createRng of the date and the
 * challenge, never Math.random) and looks back at the days before it, so a team is not repeated within ~30 days of
 * the same challenge, an answer (roster, player, series) not within a year, and the four puzzles of one day never
 * share a team or a player. The difficulty follows the weekday: Monday picks from the most famous end of each pool
 * (international events, titles, aura tier, OVR), Sunday from deeper in it. See docs/design.md, "Modo Diário".
 */
import { createRng, type Rng } from '../../engine/rng';
import type { Region, Role, RosterEntry } from '../../engine/types';
import type { SeriesResult } from '../../data/real/series';
import { dayIndex, keyFromDayNumber, dayNumber, puzzleNumber, weekdayIndex, DAILY_LAUNCH } from './calendar';
import { placementRank, rosterKey, type DailyData, type DailyPlayer } from './data';

export { CHALLENGES, type ChallengeId } from './challenges';

export interface PuzzlePlayer {
  playerId: string;
  handle: string;
  country: string;
  role: Role;
  /** Event of the card whose photo is shown (the photo taken there, when the source has one). */
  photoEventId: string;
}

export interface LinhasPuzzle {
  teamId: string;
  teamName: string;
  eventId: string;
  eventName: string;
  tier: string;
  year: number;
  region: Region | undefined;
  placement: string | undefined;
  /** The 5 starters (the 5 cards of the roster), in a seeded order. */
  slots: PuzzlePlayer[];
}

export interface ProClues {
  role: Role;
  country: string;
  /** Most played agents over the career, with maps. */
  agents: { agent: string; maps: number }[];
  /** A real stat line at one event (the event itself is the last clue). */
  stat: { year: number; rating: number; acs: number; kast: number; rounds: number };
  /** Teams as a starter, with the years. */
  teams: { teamId: string; name: string; years: number[] }[];
  event: { eventId: string; eventName: string; teamId: string; teamName: string; placement: string | undefined };
}

export interface ProPuzzle {
  answer: PuzzlePlayer;
  clues: ProClues;
}

/** 'ever': played for X in any event of the data; 'event': starter of X at one event; 'year': played for X that year. */
export type ImpostorRule = 'ever' | 'event' | 'year';

export interface ImpostorOption extends PuzzlePlayer {
  /** True for the four who fit the rule. */
  member: boolean;
  /** Members: the events where they played for the team (names). Impostor: the teams they played for (names). */
  facts: string[];
}

export interface ImpostorPuzzle {
  rule: ImpostorRule;
  teamId: string;
  teamName: string;
  /** Rule 'event'. */
  eventId?: string;
  eventName?: string;
  /** Rule 'year'. */
  year?: number;
  /** Event whose logo is shown (the rule's event, else the team's latest event in scope). */
  logoEventId: string;
  options: ImpostorOption[];
  impostorId: string;
}

export interface PlacarPuzzle {
  seriesId: number;
  eventId: string;
  eventName: string;
  tier: string;
  stage: string | null;
  round: string | null;
  date: string | null;
  bestOf: number;
  /** Display order (seeded, so the bracket's order never hints the winner). */
  teams: [{ teamId: string; name: string }, { teamId: string; name: string }];
  score: [number, number];
  maps: { map: string; score: [number, number]; pickedBy: 0 | 1 | null }[];
  /** Choices for the bonus question (the event's map pool). */
  mapOptions: string[];
}

export interface DailyPuzzle {
  date: string;
  number: number;
  /** Monday 0 … Sunday 6: the difficulty level. */
  level: number;
  linhas: LinhasPuzzle;
  pro: ProPuzzle;
  impostor: ImpostorPuzzle;
  placar: PlacarPuzzle;
}

// --- Tunables ---------------------------------------------------------------------------------------------------

/** Days a team is not repeated within the same challenge (Linhas, Impostor). */
export const TEAM_GAP_DAYS = 30;
/** Placar shows two teams a day: a shorter gap. */
export const PLACAR_TEAM_GAP_DAYS = 21;
/** Days an answer (roster, player) is not repeated. */
export const ANSWER_GAP_DAYS = 365;
/** Days a series is not repeated (the pool of memorable playoff series is smaller than the rosters'). */
export const SERIES_GAP_DAYS = 180;
/** Band of each pool (sorted by fame, most famous first) for a level: center and half-width as fractions. */
const BAND_CENTER = (level: number) => 0.05 + 0.12 * level;
const BAND_HALF = 0.1;
/** Weights of the Impostor's rules. */
const RULE_WEIGHTS: Record<ImpostorRule, number> = { ever: 0.4, event: 0.35, year: 0.25 };
/** Placar: only playoff series (any international series) at least this memorable (finals, deciders...). */
const PLACAR_MIN_MEMORABLE = 3;

// --- Helpers --------------------------------------------------------------------------------------------------

function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * A seeded pick from the level's band of a fame-sorted pool, among the items that pass `ok`. The band widens when
 * nothing in it passes; the gap (in days) is relaxed (halved down to 0) only when the whole pool fails.
 */
function pickBand<T>(rng: Rng, pool: readonly T[], level: number, ok: (t: T, gapScale: number) => boolean): T | null {
  const n = pool.length;
  if (n === 0) return null;
  for (const gapScale of [1, 0.5, 0.25, 0]) {
    for (let half = BAND_HALF; half <= 1.01; half += 0.15) {
      const c = BAND_CENTER(level);
      const lo = Math.floor(Math.max(0, c - half) * n);
      const hi = Math.min(n, Math.ceil(Math.min(1, c + half) * n));
      const candidates = pool.slice(lo, Math.max(hi, lo + 1)).filter((t) => ok(t, gapScale));
      if (candidates.length) return candidates[rng.int(0, candidates.length - 1)]!;
    }
  }
  return null;
}

/** Memoizes a set per gap scale (the band search asks for the same few scales many times). */
function gapSets<T>(build: (gapScale: number) => Set<T>): (gapScale: number) => Set<T> {
  const cache = new Map<number, Set<T>>();
  return (g) => {
    let set = cache.get(g);
    if (!set) cache.set(g, (set = build(g)));
    return set;
  };
}

function weightedPick<T>(rng: Rng, items: readonly T[], weight: (t: T) => number): T | null {
  if (!items.length) return null;
  return items[rng.weightedIndex(items.map(weight))]!;
}

const isBracketRound = (s: SeriesResult) =>
  /Upper|Lower|Grand Final|Semifinal|Quarterfinal|Middle|Knockout|Final/i.test(s.round ?? '') ||
  /Playoff|Bracket|Main Event/i.test(s.stage ?? '');

/** How memorable a series is: finals, internationals, deciders and upsets (by roster OVR) score higher. */
export function seriesMemorability(s: SeriesResult, data: DailyData): number {
  const round = s.round ?? '';
  let m = 0;
  if (/Grand Final/i.test(round)) m += 6;
  else if (/Upper Final|Lower Final|^Final$|Middle Final/i.test(round)) m += 4;
  else if (/Semifinal|Lower Round [3-9]/i.test(round)) m += 2;
  else if (isBracketRound(s)) m += 1;
  else if (/Decider|Elimination|Winner/i.test(round)) m += 0.5;
  m += s.tier === 'champions' ? 4 : s.tier === 'masters' ? 3 : 0;
  const need = Math.ceil(s.bestOf / 2);
  if (Math.min(...s.score) === need - 1) m += 3;
  const ovr = (i: 0 | 1) => {
    const r = data.rosters.get(`${s.teams[i].teamId}@${s.eventId}`);
    return r ? r.cards.reduce((sum, c) => sum + c.ovr, 0) / r.cards.length : null;
  };
  const winner: 0 | 1 = s.score[0] > s.score[1] ? 0 : 1;
  const w = ovr(winner);
  const l = ovr(winner === 0 ? 1 : 0);
  if (w !== null && l !== null && w <= l - 2) m += 2;
  return m;
}

function puzzlePlayer(p: DailyPlayer, photoEventId: string): PuzzlePlayer {
  return { playerId: p.playerId, handle: p.handle, country: p.country, role: p.role, photoEventId };
}

/** Card event nearest to a year (the latest one at or before it, else the earliest after), for the photo. */
function photoEventNear(p: DailyPlayer, year: number, preferTeamNot?: ReadonlySet<string>): string {
  const cards = preferTeamNot ? p.cards.filter((c) => !preferTeamNot.has(c.entry.teamId)) : p.cards;
  const list = cards.length ? cards : p.cards;
  const before = list.filter((c) => c.entry.year <= year);
  return (before.length ? before[before.length - 1]! : list[0]!).entry.eventId;
}

// --- Pools --------------------------------------------------------------------------------------------------------

interface Pools {
  linhas: RosterEntry[];
  pro: DailyPlayer[];
  impostorTeams: string[];
  placar: SeriesResult[];
}

function buildPools(data: DailyData): Pools {
  const usable = (playerId: string) => {
    const p = data.players.get(playerId);
    return !!p && !data.dupNorms.has(p.norm);
  };
  const linhas = [...data.rosters.values()]
    .filter((r) => r.cards.length === 5 && new Set(r.cards.map((c) => c.playerId)).size === 5)
    .sort((a, b) => data.rosterFame(b) - data.rosterFame(a) || rosterKey(a).localeCompare(rosterKey(b)));
  const pro = [...data.players.values()]
    .filter((p) => usable(p.playerId) && p.country && proStatCard(p) && data.topAgents(p.playerId).length > 0)
    .sort((a, b) => b.fame - a.fame || a.playerId.localeCompare(b.playerId));
  const impostorTeams = [...data.teams.values()]
    .filter((t) => mainsOf(data, new Set([t.teamId])).length >= 4)
    .sort((a, b) => b.fame - a.fame || a.teamId.localeCompare(b.teamId))
    .map((t) => t.teamId);
  const memo = new Map(data.series.map((s) => [s.id, seriesMemorability(s, data)]));
  const placar = data.series
    .filter(
      (s) =>
        s.bestOf >= 3 &&
        s.teams[0].teamId !== s.teams[1].teamId &&
        (isBracketRound(s) || s.tier !== 'regional') &&
        (memo.get(s.id) ?? 0) >= PLACAR_MIN_MEMORABLE,
    )
    .sort((a, b) => (memo.get(b.id) ?? 0) - (memo.get(a.id) ?? 0) || a.id - b.id);
  return { linhas, pro, impostorTeams, placar };
}

/** The card behind the Pro's stat line: most rounds among the cards with rating, ACS and KAST. */
function proStatCard(p: DailyPlayer) {
  const ok = p.cards.filter((c) => c.card.stats && c.card.stats.rating !== null && c.card.stats.acs !== null && c.card.stats.kast !== null);
  return ok.sort((a, b) => (b.card.stats?.rounds ?? 0) - (a.card.stats?.rounds ?? 0))[0];
}

/** Usable players who were a main player of any team id of `family` (optionally at one event / in one year). */
function mainsOf(data: DailyData, family: ReadonlySet<string>, where?: { eventId?: string; year?: number }): string[] {
  const out = new Set<string>();
  for (const m of data.memberships) {
    if (!m.main || !family.has(m.teamId)) continue;
    if (where?.eventId && m.eventId !== where.eventId) continue;
    if (where?.year && m.year !== where.year) continue;
    const p = data.players.get(m.playerId);
    if (p && !data.dupNorms.has(p.norm)) out.add(m.playerId);
  }
  return [...out].sort();
}

/** Every player (subs included) on a list of the family (optionally at one event / in one year). */
export function listedFor(data: DailyData, family: ReadonlySet<string>, where?: { eventId?: string; year?: number }): Set<string> {
  const out = new Set<string>();
  for (const m of data.memberships) {
    if (!family.has(m.teamId)) continue;
    if (where?.eventId && m.eventId !== where.eventId) continue;
    if (where?.year && m.year !== where.year) continue;
    out.add(m.playerId);
  }
  return out;
}

// --- The planner ----------------------------------------------------------------------------------------------------

export interface DailyGenerator {
  /** The puzzles of a day (YYYY-MM-DD, launch or later). */
  puzzleFor(date: string): DailyPuzzle;
}

export function createDailyGenerator(data: DailyData): DailyGenerator {
  const pools = buildPools(data);
  const days: DailyPuzzle[] = [];

  const recent = <T>(i: number, gap: number, get: (d: DailyPuzzle) => T[]): Set<T> => {
    const out = new Set<T>();
    for (let k = Math.max(0, i - Math.round(gap)); k < i; k++) for (const x of get(days[k]!)) out.add(x);
    return out;
  };

  const make = (i: number): DailyPuzzle => {
    const date = keyFromDayNumber(dayNumber(DAILY_LAUNCH) + i);
    const level = weekdayIndex(date);
    const rng = (what: string) => createRng(`daily:${date}:${what}`);
    const familyOf = (teamId: string) => data.teamFamily(teamId);

    // 1. Linhas Históricas.
    const linhasRng = rng('linhas');
    const linhasAnswers = gapSets((g) => recent(i, ANSWER_GAP_DAYS * g, (d) => [`${d.linhas.teamId}@${d.linhas.eventId}`]));
    const linhasTeams = gapSets((g) => recent(i, TEAM_GAP_DAYS * g, (d) => [d.linhas.teamId]));
    const entry = pickBand(linhasRng, pools.linhas, level, (r, g) => !linhasAnswers(g).has(rosterKey(r)) && !linhasTeams(g).has(r.teamId));
    if (!entry) throw new Error(`daily ${date}: no roster`);
    const event = data.events.get(entry.eventId);
    const linhas: LinhasPuzzle = {
      teamId: entry.teamId,
      teamName: entry.teamName,
      eventId: entry.eventId,
      eventName: entry.eventName,
      tier: event?.tier ?? 'regional',
      year: entry.year,
      region: entry.region,
      placement: entry.placement,
      slots: shuffle(linhasRng, entry.cards).map((c) => ({
        playerId: c.playerId,
        handle: c.handle,
        country: c.country,
        role: c.role,
        photoEventId: entry.eventId,
      })),
    };
    const takenTeams = new Set(familyOf(entry.teamId));
    const takenPlayers = new Set(entry.cards.map((c) => c.playerId));

    // 3. O Impostor (before the Pro, which must avoid its five players).
    const impostor = makeImpostor(data, pools, rng('impostor'), level, takenTeams, gapSets((g) => recent(i, TEAM_GAP_DAYS * g, (d) => [d.impostor.teamId])));
    if (!impostor) throw new Error(`daily ${date}: no impostor puzzle`);
    for (const t of familyOf(impostor.teamId)) takenTeams.add(t);
    for (const o of impostor.options) takenPlayers.add(o.playerId);

    // 4. Placar Clássico.
    const placarRng = rng('placar');
    const placarAnswers = gapSets((g) => recent(i, SERIES_GAP_DAYS * g, (d) => [d.placar.seriesId]));
    const placarTeams = gapSets((g) => recent(i, PLACAR_TEAM_GAP_DAYS * g, (d) => d.placar.teams.map((t) => t.teamId)));
    const series = pickBand(placarRng, pools.placar, level, (s, g) => {
      if (s.teams.some((t) => takenTeams.has(t.teamId))) return false;
      if (placarAnswers(g).has(s.id)) return false;
      return !s.teams.some((t) => placarTeams(g).has(t.teamId));
    });
    if (!series) throw new Error(`daily ${date}: no series`);
    const placar = makePlacar(data, series, placarRng);
    for (const t of placar.teams) for (const f of familyOf(t.teamId)) takenTeams.add(f);

    // 2. Quem é o Pro.
    const proRng = rng('pro');
    const proAnswers = gapSets((g) => recent(i, ANSWER_GAP_DAYS * g, (d) => [d.pro.answer.playerId]));
    const answer = pickBand(proRng, pools.pro, level, (p, g) => !takenPlayers.has(p.playerId) && !proAnswers(g).has(p.playerId));
    if (!answer) throw new Error(`daily ${date}: no pro`);
    const pro = makePro(data, answer);

    return { date, number: puzzleNumber(date), level, linhas, pro, impostor, placar };
  };

  return {
    puzzleFor(date: string): DailyPuzzle {
      const i = dayIndex(date);
      if (i < 0) throw new Error(`daily: ${date} is before the launch (${DAILY_LAUNCH})`);
      while (days.length <= i) days.push(make(days.length));
      return days[i]!;
    },
  };
}

function makePro(data: DailyData, p: DailyPlayer): ProPuzzle {
  const stat = proStatCard(p)!;
  const teams = new Map<string, Set<number>>();
  for (const m of data.byPlayer.get(p.playerId) ?? []) {
    if (!m.main) continue;
    teams.set(m.teamId, (teams.get(m.teamId) ?? new Set()).add(m.year));
  }
  for (const { entry } of p.cards) teams.set(entry.teamId, (teams.get(entry.teamId) ?? new Set()).add(entry.year));
  const history = [...teams]
    .map(([teamId, years]) => ({ teamId, name: data.teamName(teamId), years: [...years].sort((a, b) => a - b) }))
    .sort((a, b) => a.years[0]! - b.years[0]! || a.years[a.years.length - 1]! - b.years[b.years.length - 1]! || a.name.localeCompare(b.name));
  return {
    answer: puzzlePlayer(p, stat.entry.eventId),
    clues: {
      role: p.role,
      country: p.country,
      agents: data.topAgents(p.playerId, 3),
      stat: {
        year: stat.entry.year,
        rating: stat.card.stats!.rating!,
        acs: stat.card.stats!.acs!,
        kast: stat.card.stats!.kast!,
        rounds: stat.card.stats!.rounds,
      },
      teams: history,
      event: {
        eventId: stat.entry.eventId,
        eventName: stat.entry.eventName,
        teamId: stat.entry.teamId,
        teamName: stat.entry.teamName,
        placement: stat.entry.placement,
      },
    },
  };
}

function makePlacar(data: DailyData, s: SeriesResult, rng: Rng): PlacarPuzzle {
  const flip = rng.next() < 0.5;
  const ord = <T>(pair: readonly [T, T]): [T, T] => (flip ? [pair[1], pair[0]] : [pair[0], pair[1]]);
  const event = data.events.get(s.eventId);
  const options = new Set([...(event?.maps ?? []), ...s.maps.map((m) => m.map)]);
  return {
    seriesId: s.id,
    eventId: s.eventId,
    eventName: s.eventName,
    tier: s.tier,
    stage: s.stage,
    round: s.round,
    date: s.date,
    bestOf: s.bestOf,
    teams: ord(s.teams).map((t) => ({ teamId: t.teamId, name: t.name })) as PlacarPuzzle['teams'],
    score: ord(s.score),
    maps: s.maps.map((m) => ({
      map: m.map,
      score: ord(m.score),
      pickedBy: m.pickedBy === null ? null : flip ? ((1 - m.pickedBy) as 0 | 1) : m.pickedBy,
    })),
    mapOptions: [...options].sort((a, b) => a.localeCompare(b)),
  };
}

function makeImpostor(
  data: DailyData,
  pools: Pools,
  rng: Rng,
  level: number,
  takenTeams: ReadonlySet<string>,
  recentTeams: (gapScale: number) => ReadonlySet<string>,
): ImpostorPuzzle | null {
  const ruleOrder = (() => {
    const rules = Object.keys(RULE_WEIGHTS) as ImpostorRule[];
    const first = rules[rng.weightedIndex(rules.map((r) => RULE_WEIGHTS[r]))]!;
    return [first, ...rules.filter((r) => r !== first)];
  })();
  for (const rule of ruleOrder) {
    const tried = new Set<string>();
    for (let attempt = 0; attempt < 12; attempt++) {
      const teamId = pickBand(rng, pools.impostorTeams, level, (t, g) => {
        if (tried.has(t) || takenTeams.has(t)) return false;
        return !recentTeams(g).has(t);
      });
      if (!teamId) break;
      tried.add(teamId);
      const puzzle = buildImpostor(data, rng, rule, teamId, level);
      if (puzzle) return puzzle;
    }
  }
  return null;
}

function buildImpostor(data: DailyData, rng: Rng, rule: ImpostorRule, teamId: string, level: number): ImpostorPuzzle | null {
  const team = data.teams.get(teamId)!;
  const family = data.teamFamily(teamId);
  let members: string[];
  let listed: Set<string>;
  let eventId: string | undefined;
  let eventName: string | undefined;
  let year: number | undefined;
  if (rule === 'event') {
    const rosters = team.rosters.filter((r) => r.cards.filter((c) => !data.dupNorms.has(data.players.get(c.playerId)!.norm)).length >= 4);
    const roster = weightedPick(rng, rosters, (r) => (level <= 3 ? 1 + data.rosterFame(r) : 1));
    if (!roster) return null;
    eventId = roster.eventId;
    eventName = roster.eventName;
    members = roster.cards.map((c) => c.playerId).filter((id) => !data.dupNorms.has(data.players.get(id)!.norm));
    listed = listedFor(data, family, { eventId });
  } else if (rule === 'year') {
    const years = [...new Set(team.rosters.map((r) => r.year))].filter((y) => mainsOf(data, family, { year: y }).length >= 4);
    if (!years.length) return null;
    year = years[rng.int(0, years.length - 1)]!;
    members = mainsOf(data, family, { year });
    listed = listedFor(data, family, { year });
  } else {
    members = mainsOf(data, family);
    listed = listedFor(data, family);
  }
  if (members.length < 4) return null;
  const fame = (id: string) => data.players.get(id)?.fame ?? 0;
  const four: string[] = [];
  const pool = [...members];
  while (four.length < 4 && pool.length) {
    const pick = weightedPick(rng, pool, (id) => (level <= 3 ? 2 + fame(id) : 1))!;
    pool.splice(pool.indexOf(pick), 1);
    if (four.some((x) => data.players.get(x)!.norm === data.players.get(pick)!.norm)) continue;
    four.push(pick);
  }
  if (four.length < 4) return null;

  // The impostor: never on any list of the team (rule's scope), a distinct handle, from the team's world.
  const avgFame = four.reduce((s, id) => s + fame(id), 0) / 4;
  const span = team.rosters.map((r) => r.year);
  const [y0, y1] = [Math.min(...span), Math.max(...span)];
  const everListed = listedFor(data, family);
  const norms = new Set(four.map((id) => data.players.get(id)!.norm));
  const candidates = [...data.players.values()].filter((p) => {
    if (listed.has(p.playerId) || data.dupNorms.has(p.norm) || norms.has(p.norm)) return false;
    if (rule === 'year') return p.firstYear <= year! && p.lastYear >= year! - 1 && (p.region === team.region || everListed.has(p.playerId));
    if (rule === 'event') {
      const ev = data.events.get(eventId!);
      return p.firstYear <= ev!.year && p.lastYear >= ev!.year - 1 && (p.region === team.region || everListed.has(p.playerId));
    }
    return p.region === team.region && p.lastYear >= y0 && p.firstYear <= y1;
  });
  // A trap is worth more: someone who did play for the team, just not in the rule's scope.
  const impostor = weightedPick(rng, candidates, (p) => {
    const trap = rule !== 'ever' && everListed.has(p.playerId) ? 4 : 1;
    return (trap * 1) / (1 + Math.abs(p.fame - avgFame) / 6);
  });
  if (!impostor) return null;

  const scopeLabel = (m: { eventId: string }) => data.events.get(m.eventId)?.name ?? m.eventId;
  const memberFacts = (id: string): string[] => {
    const evs = (data.byPlayer.get(id) ?? []).filter(
      (m) => family.has(m.teamId) && (!eventId || m.eventId === eventId) && (!year || m.year === year),
    );
    return [...new Set(evs.map(scopeLabel))];
  };
  const impostorFacts = (id: string): string[] => {
    const teams = new Map<string, Set<number>>();
    for (const m of data.byPlayer.get(id) ?? []) teams.set(m.teamId, (teams.get(m.teamId) ?? new Set()).add(m.year));
    return [...teams].map(([t, ys]) => {
      const sorted = [...ys].sort((a, b) => a - b);
      return `${data.teamName(t)} (${sorted[0]}${sorted.length > 1 ? `–${sorted[sorted.length - 1]}` : ''})`;
    });
  };
  const refYear = year ?? (eventId ? data.events.get(eventId)!.year : y1);
  const memberPhoto = (p: DailyPlayer): string => {
    const atTeam = p.cards.filter((c) => family.has(c.entry.teamId) && (!eventId || c.entry.eventId === eventId) && (!year || c.entry.year === year));
    return (atTeam[atTeam.length - 1] ?? p.cards[p.cards.length - 1]!).entry.eventId;
  };
  const options: ImpostorOption[] = shuffle(rng, [...four, impostor.playerId]).map((id) => {
    const p = data.players.get(id)!;
    const member = id !== impostor.playerId;
    return {
      ...puzzlePlayer(p, member ? memberPhoto(p) : photoEventNear(p, refYear, family)),
      member,
      facts: member ? memberFacts(id) : impostorFacts(id),
    };
  });
  return {
    rule,
    teamId,
    teamName: team.name,
    ...(eventId ? { eventId, eventName: eventName! } : {}),
    ...(year ? { year } : {}),
    logoEventId: eventId ?? [...team.rosters].reverse().find((r) => !year || r.year === year)?.eventId ?? team.rosters[team.rosters.length - 1]!.eventId,
    options,
    impostorId: impostor.playerId,
  };
}

/**
 * Problems of a day's puzzles (empty = playable and unambiguous): used by the tests over a year of days.
 * Re-derives every answer from the data instead of trusting the generator.
 */
export function puzzleProblems(data: DailyData, p: DailyPuzzle): string[] {
  const out: string[] = [];
  // Linhas.
  const roster = data.rosters.get(`${p.linhas.teamId}@${p.linhas.eventId}`);
  if (!roster) out.push('linhas: roster not in the pool');
  else if (new Set(p.linhas.slots.map((s) => s.playerId)).size !== 5 || !p.linhas.slots.every((s) => roster.cards.some((c) => c.playerId === s.playerId)))
    out.push('linhas: slots are not the 5 starters');
  // Pro.
  const ans = data.players.get(p.pro.answer.playerId);
  if (!ans) out.push('pro: unknown player');
  else if (data.dupNorms.has(ans.norm)) out.push('pro: answer shares its handle');
  const c = p.pro.clues;
  if (!c.country || !c.agents.length || !c.teams.length || !Number.isFinite(c.stat.rating)) out.push('pro: a clue is missing');
  // Impostor.
  const fam = data.teamFamily(p.impostor.teamId);
  const scope = p.impostor.rule === 'event' ? { eventId: p.impostor.eventId! } : p.impostor.rule === 'year' ? { year: p.impostor.year! } : undefined;
  const listed = listedFor(data, fam, scope);
  const nonMembers = p.impostor.options.filter((o) => !listed.has(o.playerId));
  if (p.impostor.options.length !== 5) out.push('impostor: not 5 options');
  if (nonMembers.length !== 1 || nonMembers[0]!.playerId !== p.impostor.impostorId) out.push('impostor: not exactly one impostor');
  for (const o of p.impostor.options) {
    if (o.playerId === p.impostor.impostorId) continue;
    const mainHere = (data.byPlayer.get(o.playerId) ?? []).some(
      (m) => m.main && fam.has(m.teamId) && (!scope || ('eventId' in scope ? m.eventId === scope.eventId : m.year === scope.year)),
    );
    if (!mainHere) out.push(`impostor: ${o.handle} is not a main player in scope`);
  }
  const norms = p.impostor.options.map((o) => data.players.get(o.playerId)?.norm ?? '');
  if (new Set(norms).size !== 5 || norms.some((n) => data.dupNorms.has(n))) out.push('impostor: repeated or shared handles');
  // Placar.
  const s = p.placar;
  const need = Math.ceil(s.bestOf / 2);
  const wins: [number, number] = [0, 0];
  for (const m of s.maps) wins[m.score[0] > m.score[1] ? 0 : 1]++;
  if (s.bestOf < 3 || Math.max(...s.score) !== need || wins[0] !== s.score[0] || wins[1] !== s.score[1]) out.push('placar: score does not add up');
  if (!s.mapOptions.includes(s.maps[s.maps.length - 1]?.map ?? '')) out.push('placar: last map not among the options');
  if (s.teams[0].teamId === s.teams[1].teamId) out.push('placar: same team twice');
  // One day: no team in two puzzles, no player in two puzzles.
  const teamSets = [
    data.teamFamily(p.linhas.teamId),
    data.teamFamily(p.impostor.teamId),
    new Set([...data.teamFamily(s.teams[0].teamId), ...data.teamFamily(s.teams[1].teamId)]),
  ];
  for (let a = 0; a < teamSets.length; a++)
    for (let b = a + 1; b < teamSets.length; b++) if ([...teamSets[a]!].some((t) => teamSets[b]!.has(t))) out.push('day: a team appears in two puzzles');
  const proId = p.pro.answer.playerId;
  if (p.linhas.slots.some((x) => x.playerId === proId) || p.impostor.options.some((o) => o.playerId === proId)) out.push('day: the Pro appears in another puzzle');
  return out;
}

/** Placement as the puzzle shows it (rank only), for difficulty reports. */
export const puzzlePlacementRank = placementRank;
