import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import {
  PLAYOFF_BRACKET,
  createTournament,
  matchLoser,
  matchWinner,
  pairSwissGroup,
  pendingMatches,
  playoffMatches,
  reportResult,
  runTournament,
  swissStandings,
  type Entrant,
  type MatchResult,
  type TMatch,
  type TournamentState,
} from './tournament';

const ENTRANTS: Entrant[] = Array.from({ length: 16 }, (_, i) => ({
  id: `t${i + 1}`,
  name: `Time ${i + 1}`,
  seed: i + 1,
}));

const seedOf = (id: string) => Number(id.slice(1));

/** A clean result for whichever side wins, with the loser taking as many maps as allowed by `lost`. */
function resultFor(m: TMatch, winner: 0 | 1, lost = 0): MatchResult {
  const need = Math.ceil(m.bestOf / 2);
  const l = Math.min(lost, need - 1);
  return { winner, score: winner === 0 ? [need, l] : [l, need] };
}

/** Better (lower) seed always wins. */
const favouriteWins = (m: TMatch) => resultFor(m, seedOf(m.a) < seedOf(m.b) ? 0 : 1);

/** Random winner and loser maps from a seeded Rng. */
function randomPlay(seed: number) {
  const rng = createRng(seed);
  return (m: TMatch) => resultFor(m, rng.int(0, 1) as 0 | 1, rng.int(0, 2));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

const swissOf = (s: TournamentState) => s.matches.filter((m) => m.stage === 'swiss');

describe('createTournament', () => {
  it('pairs round 1 as 1v16, 2v15 … 8v9, all Bo1', () => {
    const state = createTournament([...ENTRANTS].reverse());
    const pending = pendingMatches(state);
    expect(state.phase).toBe('swiss');
    expect(pending.map((m) => [m.a, m.b])).toEqual(
      Array.from({ length: 8 }, (_, i) => [`t${i + 1}`, `t${16 - i}`]),
    );
    for (const m of pending) {
      expect(m.bestOf).toBe(1);
      expect(m.round).toBe('swiss-r1');
      expect(m.label).toBe('Suíça · Rodada 1 (0-0)');
    }
  });

  it('rejects anything but 16 unique ids and seeds', () => {
    expect(() => createTournament(ENTRANTS.slice(1))).toThrow();
    expect(() => createTournament([...ENTRANTS.slice(1), { ...ENTRANTS[1]!, seed: 99 }])).toThrow(/ids/);
    expect(() => createTournament([...ENTRANTS.slice(1), { id: 'x', name: 'X', seed: 2 }])).toThrow(/seeds/);
  });
});

describe('reportResult', () => {
  const state = createTournament(ENTRANTS);
  const first = pendingMatches(state)[0]!;

  it('rejects unknown and finished matches', () => {
    expect(() => reportResult(state, 'nope', { winner: 0, score: [1, 0] })).toThrow(/Unknown match/);
    const done = reportResult(state, first.id, { winner: 0, score: [1, 0] });
    expect(() => reportResult(done, first.id, { winner: 0, score: [1, 0] })).toThrow(/already finished/);
  });

  it('rejects scores that do not fit the best-of and winner', () => {
    for (const score of [
      [2, 0],
      [0, 1],
      [1, 1],
      [0, 0],
      [-1, 0],
      [1.5, 0],
    ] as [number, number][]) {
      expect(() => reportResult(state, first.id, { winner: 0, score })).toThrow();
    }
    expect(() => reportResult(state, first.id, { winner: 2 as 0, score: [1, 0] })).toThrow();
  });

  it('does not mutate the input state', () => {
    const frozen = deepFreeze(createTournament(ENTRANTS));
    const before = JSON.stringify(frozen);
    let s: TournamentState = frozen;
    for (const m of pendingMatches(frozen)) s = reportResult(s, m.id, favouriteWins(m));
    expect(JSON.stringify(frozen)).toBe(before);
    expect(pendingMatches(s)).toHaveLength(8);
  });

  it('validates Bo3 and Bo5 scores', () => {
    const s = runUntil(createTournament(ENTRANTS), favouriteWins, (st) => st.phase === 'playoffs');
    const qf = pendingMatches(s)[0]!;
    expect(qf.bestOf).toBe(3);
    expect(() => reportResult(s, qf.id, { winner: 0, score: [1, 0] })).toThrow();
    expect(() => reportResult(s, qf.id, { winner: 0, score: [2, 2] })).toThrow();
    expect(() => reportResult(s, qf.id, { winner: 1, score: [2, 1] })).toThrow();
    expect(() => reportResult(s, qf.id, { winner: 1, score: [1, 2] })).not.toThrow();
  });
});

function runUntil(
  state: TournamentState,
  play: (m: TMatch) => MatchResult,
  stop: (s: TournamentState) => boolean,
): TournamentState {
  let s = state;
  while (!stop(s)) {
    const m = pendingMatches(s)[0];
    if (!m) throw new Error('stuck');
    s = reportResult(s, m.id, play(m));
  }
  return s;
}

describe('swissStandings', () => {
  it('computes Buchholz from played opponents', () => {
    const after1 = runUntil(createTournament(ENTRANTS), favouriteWins, (s) => swissOf(s).length > 8);
    const table = swissStandings(after1);
    expect(table.slice(0, 8).map((r) => r.id)).toEqual(ENTRANTS.slice(0, 8).map((e) => e.id));
    for (const row of table) expect(row.buchholz).toBe(row.wins === 1 ? -1 : 1);
  });

  it('pairs later rounds within the same record, higher Buchholz/seed vs lower', () => {
    const s = runUntil(createTournament(ENTRANTS), favouriteWins, (st) => swissOf(st).length > 8);
    const r2 = pendingMatches(s);
    // All 1-0 teams have Buchholz −1, so they rank by seed: 1v8, 2v7, 3v6, 4v5.
    expect(r2.slice(0, 4).map((m) => [m.a, m.b])).toEqual([
      ['t1', 't8'],
      ['t2', 't7'],
      ['t3', 't6'],
      ['t4', 't5'],
    ]);
    expect(r2[0]!.label).toBe('Suíça · Rodada 2 (1-0)');
    expect(r2[4]!.label).toBe('Suíça · Rodada 2 (0-1)');
  });
});

describe('pairSwissGroup', () => {
  it('pairs top vs bottom when there are no rematches', () => {
    expect(pairSwissGroup(['a', 'b', 'c', 'd'], () => false)).toEqual([
      ['a', 'd'],
      ['b', 'c'],
    ]);
  });

  it('avoids rematches when possible', () => {
    const played = (x: string, y: string) => [x, y].sort().join() === 'a,d';
    expect(pairSwissGroup(['a', 'b', 'c', 'd'], played)).toEqual([
      ['a', 'c'],
      ['b', 'd'],
    ]);
  });

  it('accepts the fewest rematches when they are unavoidable', () => {
    // a has played everyone.
    const played = (x: string, y: string) => x === 'a' || y === 'a';
    const pairs = pairSwissGroup(['a', 'b', 'c', 'd'], played);
    expect(pairs.filter(([x, y]) => played(x, y))).toHaveLength(1);
  });
});

/** Checks every invariant of a finished tournament. */
function checkTournament(state: TournamentState) {
  expect(state.phase).toBe('done');
  expect(pendingMatches(state)).toHaveLength(0);

  // Swiss: records, match counts, rematches, Bo3 placement.
  const swiss = swissOf(state);
  const record = new Map(ENTRANTS.map((e) => [e.id, { w: 0, l: 0 }]));
  const met = new Set<string>();
  let rematches = 0;
  for (const m of swiss) {
    const ra = record.get(m.a)!;
    const rb = record.get(m.b)!;
    expect([ra.w, ra.l]).toEqual([rb.w, rb.l]);
    const decisive = ra.w === 2 || ra.l === 2;
    expect(m.bestOf).toBe(decisive ? 3 : 1);
    expect(Number(m.round.slice('swiss-r'.length))).toBe(ra.w + ra.l + 1);
    const key = [m.a, m.b].sort().join();
    if (met.has(key)) rematches++;
    met.add(key);
    const winner = matchWinner(m)!;
    for (const id of [m.a, m.b]) {
      const r = record.get(id)!;
      if (id === winner) r.w++;
      else r.l++;
    }
  }
  const finals = [...record.values()];
  for (const r of finals) {
    expect(r.w === 3 || r.l === 3).toBe(true);
    expect(r.w + r.l).toBeLessThanOrEqual(5);
  }
  expect(finals.filter((r) => r.w === 3)).toHaveLength(8);
  expect(finals.filter((r) => r.l === 3)).toHaveLength(8);
  expect(swiss.length).toBe(33); // 8 + 8 + 8 + 6 + 3

  const table = swissStandings(state);
  expect(table.filter((r) => r.status === 'advanced')).toHaveLength(8);
  expect(table.filter((r) => r.status === 'eliminated')).toHaveLength(8);

  // Playoff seeding: 3-0, 3-1, 3-2; then Buchholz; then seed.
  const expectedSeeds = table
    .filter((r) => r.wins === 3)
    .sort((x, y) => x.losses - y.losses || y.buchholz - x.buchholz || seedOf(x.id) - seedOf(y.id))
    .map((r) => r.id);
  expect(state.playoffSeeds).toEqual(expectedSeeds);
  const seeds = state.playoffSeeds!;
  const po = playoffMatches(state);
  expect(po).toHaveLength(14);
  expect(po.filter((m) => m.round === 'ub-qf').map((m) => [m.a, m.b])).toEqual(
    [
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ].map(([a, b]) => [seeds[a! - 1], seeds[b! - 1]]),
  );
  for (const m of po) expect(m.bestOf).toBe(m.round === 'gf' || m.round === 'lb-final' ? 5 : 3);

  // Double elimination: losses only end a run on the 2nd loss (or the grand final).
  const losses = new Map<string, number>();
  const lastMatch = new Map<string, TMatch>();
  for (const m of po) {
    expect(losses.get(m.a) ?? 0).toBeLessThan(2);
    expect(losses.get(m.b) ?? 0).toBeLessThan(2);
    const loser = matchLoser(m)!;
    losses.set(loser, (losses.get(loser) ?? 0) + 1);
    lastMatch.set(m.a, m);
    lastMatch.set(m.b, m);
  }
  const gf = po.find((m) => m.id === 'gf')!;
  expect(state.champion).toBe(matchWinner(gf));
  for (const id of seeds) {
    if (id === state.champion) {
      expect(losses.get(id) ?? 0).toBeLessThanOrEqual(1);
    } else if (id === matchLoser(gf)) {
      expect(losses.get(id) ?? 0).toBeGreaterThanOrEqual(1);
    } else {
      expect(losses.get(id)).toBe(2);
    }
  }
  // Lower round 2 never repeats a quarter-final.
  for (const m of po.filter((x) => x.round === 'lb-r2')) {
    const qf = po.filter((x) => x.round === 'ub-qf');
    expect(qf.some((q) => [q.a, q.b].sort().join() === [m.a, m.b].sort().join())).toBe(false);
  }
  return { rematches };
}

describe('runTournament', () => {
  it('runs a full tournament where favourites always win', () => {
    const state = runTournament(createTournament(ENTRANTS), favouriteWins);
    const { rematches } = checkTournament(state);
    expect(rematches).toBe(0);
    expect(state.champion).toBe('t1');
    // Both 3-0 teams take the top two seeds (order by Buchholz), so they can only meet late.
    expect(state.playoffSeeds!.slice(0, 2).sort()).toEqual(['t1', 't2']);
    const gf = playoffMatches(state).find((m) => m.round === 'gf')!;
    expect([gf.a, gf.b]).toEqual(['t1', 't2']);
    expect(gf.label).toBe('Grande final');
  });

  it('holds every invariant across many random tournaments, with no Swiss rematches', () => {
    for (let seed = 0; seed < 300; seed++) {
      const state = runTournament(createTournament(ENTRANTS), randomPlay(seed));
      const { rematches } = checkTournament(state);
      expect(rematches, `seed ${seed}`).toBe(0);
    }
  });

  it('survives a JSON round-trip after every result', () => {
    const play = randomPlay(42);
    let s = createTournament(ENTRANTS);
    for (;;) {
      const m = pendingMatches(s)[0];
      if (!m) break;
      s = JSON.parse(JSON.stringify(reportResult(s, m.id, play(m)))) as TournamentState;
    }
    expect(s).toEqual(runTournament(createTournament(ENTRANTS), randomPlay(42)));
    checkTournament(s);
  });

  it('only exposes playoff matches whose teams are known, following the bracket skeleton', () => {
    const s = runUntil(createTournament(ENTRANTS), favouriteWins, (st) => st.phase === 'playoffs');
    expect(pendingMatches(s).map((m) => m.id)).toEqual(['ub-qf-1', 'ub-qf-2', 'ub-qf-3', 'ub-qf-4']);
    expect(PLAYOFF_BRACKET).toHaveLength(14);
    const done = runTournament(s, favouriteWins);
    expect(
      playoffMatches(done)
        .map((m) => m.id)
        .sort(),
    ).toEqual(PLAYOFF_BRACKET.map((b) => b.id).sort());
    expect(() => reportResult(done, 'gf', { winner: 0, score: [3, 0] })).toThrow(/already finished/);
  });
});
