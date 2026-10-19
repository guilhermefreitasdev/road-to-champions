import { describe, expect, it } from 'vitest';
import {
  LEAGUE_GROUPS,
  LEAGUE_GROUP_MATCHES,
  LEAGUE_PLAYOFFS,
  createLeague,
  drawLeagueGroupIndex,
  leagueGroupMatches,
  leagueGroupOf,
  leaguePending,
  leaguePlaceOf,
  leaguePlayoffMatches,
  leagueStandings,
  lmatchLoser,
  lmatchWinner,
  mastersQualified,
  reportLeagueResult,
  roundRobinRounds,
  runLeague,
  type LMatch,
  type LeagueResult,
  type LeagueState,
} from './league';
import { createRng } from './rng';
import type { Entrant } from './tournament';

const ENTRANTS: Entrant[] = Array.from({ length: 12 }, (_, i) => ({ id: `t${i + 1}`, name: `Time ${i + 1}`, seed: i + 1 }));
const seedOf = (id: string) => Number(id.slice(1));

function resultFor(m: LMatch, winner: 0 | 1, lost = 0, rounds: [number, number] = [26, 20]): LeagueResult {
  const need = Math.ceil(m.bestOf / 2);
  const l = Math.min(lost, need - 1);
  return { winner, score: winner === 0 ? [need, l] : [l, need], rounds: winner === 0 ? rounds : [rounds[1], rounds[0]] };
}

const favouriteWins = (m: LMatch) => resultFor(m, seedOf(m.a) < seedOf(m.b) ? 0 : 1);

function randomPlay(seed: number) {
  const rng = createRng(seed);
  return (m: LMatch) => resultFor(m, rng.int(0, 1) as 0 | 1, rng.int(0, 2), [13 + rng.int(0, 13), rng.int(0, 12)]);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

describe('createLeague', () => {
  it('draws 2 groups of 6 by snake and schedules 30 round-robin Bo3 matches', () => {
    const s = createLeague([...ENTRANTS].reverse());
    expect(s.groups.A).toEqual(['t1', 't4', 't5', 't8', 't9', 't12']);
    expect(s.groups.B).toEqual(['t2', 't3', 't6', 't7', 't10', 't11']);
    expect(s.matches).toHaveLength(2 * LEAGUE_GROUP_MATCHES);
    expect(s.matches.every((m) => m.bestOf === 3 && m.stage === 'groups')).toBe(true);
    expect(s.phase).toBe('groups');
    // Rounds alternate between the groups: A round 1, B round 1, A round 2…
    expect(s.matches.slice(0, 6).map((m) => `${m.group}${m.round}`)).toEqual(['A1', 'A1', 'A1', 'B1', 'B1', 'B1']);
    for (const g of LEAGUE_GROUPS) {
      const pairs = leagueGroupMatches(s, g).map((m) => [m.a, m.b].sort().join('-'));
      expect(new Set(pairs).size).toBe(LEAGUE_GROUP_MATCHES);
      for (const m of leagueGroupMatches(s, g)) expect(leagueGroupOf(s, m.a)).toBe(g);
    }
  });

  it('snake draw sums both groups to 39', () => {
    const sums = [0, 0];
    for (let p = 1; p <= 12; p++) sums[drawLeagueGroupIndex(p)]! += p;
    expect(sums).toEqual([39, 39]);
  });

  it('round robin covers every pair once', () => {
    const rounds = roundRobinRounds();
    expect(rounds).toHaveLength(5);
    const pairs = rounds.flat().map(([a, b]) => [a, b].sort().join('-'));
    expect(new Set(pairs).size).toBe(15);
    for (const r of rounds) expect(new Set(r.flat()).size).toBe(6);
  });

  it('rejects wrong sizes and duplicate ids or seeds', () => {
    expect(() => createLeague(ENTRANTS.slice(0, 11))).toThrow(/12 entrants/);
    expect(() => createLeague(ENTRANTS.map((e) => ({ ...e, id: 'x' })))).toThrow(/unique/);
    expect(() => createLeague(ENTRANTS.map((e) => ({ ...e, seed: 1 })))).toThrow(/unique/);
  });
});

describe('standings and playoffs', () => {
  it('ranks by wins, then map diff, then round diff, then seed; places decided when the group is done', () => {
    let s = createLeague(ENTRANTS);
    const m1 = leagueGroupMatches(s, 'A')[0]!;
    s = reportLeagueResult(s, m1.id, resultFor(m1, 1, 1, [26, 24]));
    const rows = leagueStandings(s).filter((r) => r.group === 'A');
    expect(rows[0]!.id).toBe(m1.b);
    expect(rows[0]).toMatchObject({ wins: 1, losses: 0, mapsWon: 2, mapsLost: 1, roundsWon: 26, roundsLost: 24, status: 'alive' });
    expect(rows.every((r) => r.place === undefined)).toBe(true);
    // Ties: equal records fall back to the group seed.
    expect(rows.slice(1, 5).map((r) => r.groupSeed)).toEqual([...rows.slice(1, 5).map((r) => r.groupSeed)].sort((a, b) => a - b));

    s = runLeague(createLeague(ENTRANTS), favouriteWins);
    const a = leagueStandings(s).filter((r) => r.group === 'A');
    expect(a.map((r) => r.id)).toEqual(['t1', 't4', 't5', 't8', 't9', 't12']);
    expect(a.map((r) => r.place)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(a.map((r) => r.status)).toEqual(['qualified', 'qualified', 'qualified', 'eliminated', 'eliminated', 'eliminated']);
  });

  it('starts the playoffs only when both groups are done, then plays them in order', () => {
    let s = createLeague(ENTRANTS);
    for (const m of leagueGroupMatches(s, 'A')) s = reportLeagueResult(s, m.id, favouriteWins(m));
    expect(s.phase).toBe('groups');
    expect(leaguePlayoffMatches(s)).toHaveLength(0);
    for (const m of leagueGroupMatches(s, 'B')) s = reportLeagueResult(s, m.id, favouriteWins(m));
    expect(s.phase).toBe('playoffs');
    const qf = leaguePending(s);
    expect(qf.map((m) => m.id)).toEqual(['qf-1', 'qf-2']);
    expect(qf[0]).toMatchObject({ a: 't4', b: 't6', bestOf: 3 }); // A2 v B3
    expect(qf[1]).toMatchObject({ a: 't3', b: 't5' }); // B2 v A3
    s = runLeague(s, favouriteWins);
    expect(s.phase).toBe('done');
    expect(s.champion).toBe('t1');
    const ids = leaguePlayoffMatches(s).map((m) => m.id);
    expect([...ids].sort()).toEqual(LEAGUE_PLAYOFFS.map((p) => p.id).sort());
    const final = leaguePlayoffMatches(s).find((m) => m.id === 'final')!;
    expect(final.bestOf).toBe(5);
    expect(lmatchWinner(final)).toBe('t1');
    expect(lmatchLoser(final)).toBe('t2');
    expect(mastersQualified(s)).toEqual(['t1', 't2', 't3']);
    expect(leaguePlaceOf(s, 't1')).toMatchObject({ rank: 1, label: '1º', stage: 'champion' });
    expect(leaguePlaceOf(s, 't2')).toMatchObject({ rank: 2, stage: 'final' });
    expect(leaguePlaceOf(s, 't3')).toMatchObject({ rank: 3, stage: 'top4' });
    expect(leaguePlaceOf(s, 't4')).toMatchObject({ rank: 4, stage: 'top4' });
    expect(leaguePlaceOf(s, 't6')!.label).toBe('5º–6º');
    expect(leaguePlaceOf(s, 't8')!.label).toBe('7º–8º');
    expect(leaguePlaceOf(s, 't10')!.label).toBe('9º–10º');
    expect(leaguePlaceOf(s, 't12')!.label).toBe('11º–12º');
  });

  it('is not done until both the final and the third-place match are played', () => {
    let s = createLeague(ENTRANTS);
    for (const m of leagueGroupMatches(s)) s = reportLeagueResult(s, m.id, favouriteWins(m));
    for (const id of ['qf-1', 'qf-2', 'sf-1', 'sf-2']) {
      const m = leaguePending(s).find((x) => x.id === id)!;
      s = reportLeagueResult(s, m.id, favouriteWins(m));
    }
    const final = leaguePending(s).find((m) => m.id === 'final')!;
    s = reportLeagueResult(s, final.id, favouriteWins(final));
    expect(s.phase).toBe('playoffs');
    expect(mastersQualified(s)).toEqual(['t1', 't2']);
    const third = leaguePending(s)[0]!;
    expect(third.id).toBe('third');
    s = reportLeagueResult(s, third.id, favouriteWins(third));
    expect(s.phase).toBe('done');
  });

  it('never mutates and validates results', () => {
    const s = deepFreeze(createLeague(ENTRANTS));
    const m = s.matches[0]!;
    const next = reportLeagueResult(s, m.id, resultFor(m, 0));
    expect(next).not.toBe(s);
    expect(s.matches[0]!.result).toBeUndefined();
    expect(() => reportLeagueResult(next, m.id, resultFor(m, 0))).toThrow(/already finished/);
    expect(() => reportLeagueResult(s, 'nope', resultFor(m, 0))).toThrow(/Unknown match/);
    expect(() => reportLeagueResult(s, m.id, { winner: 0, score: [2, 2], rounds: [1, 1] })).toThrow(/doesn't fit/);
    expect(() => reportLeagueResult(s, m.id, { winner: 0, score: [2, 0], rounds: [-1, 1] })).toThrow(/Invalid rounds/);
    expect(() => reportLeagueResult(s, m.id, { winner: 1, score: [2, 0], rounds: [1, 1] })).toThrow(/doesn't fit/);
  });

  it('finishes from any random results with 36 matches and 12 distinct places', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s: LeagueState = runLeague(createLeague(ENTRANTS), randomPlay(seed));
      expect(s.phase).toBe('done');
      expect(s.matches).toHaveLength(36);
      const ranks = s.entrants.map((e) => leaguePlaceOf(s, e.id)!.rank).sort((a, b) => a - b);
      expect(ranks).toEqual([1, 2, 3, 4, 5, 5, 7, 7, 9, 9, 11, 11]);
      expect(new Set(mastersQualified(s)).size).toBe(3);
    }
  });
});
