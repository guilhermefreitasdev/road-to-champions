import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import {
  GROUP_KEYS,
  GROUP_STAGE,
  PLAYOFF_BRACKET,
  createTournament,
  drawGroupIndex,
  groupMatches,
  groupOf,
  groupStandings,
  matchLoser,
  matchWinner,
  pendingMatches,
  playoffMatches,
  reportResult,
  resolveSource,
  runTournament,
  type Entrant,
  type GroupKey,
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

const pair = (m: TMatch) => [m.a, m.b].sort().join();

describe('createTournament', () => {
  it('draws the groups as a snake by seed: A 1-8-9-16, B 2-7-10-15, C 3-6-11-14, D 4-5-12-13', () => {
    const state = createTournament([...ENTRANTS].reverse());
    expect(state.phase).toBe('groups');
    expect(state.groups).toEqual({
      A: ['t1', 't8', 't9', 't16'],
      B: ['t2', 't7', 't10', 't15'],
      C: ['t3', 't6', 't11', 't14'],
      D: ['t4', 't5', 't12', 't13'],
    });
    expect(Array.from({ length: 16 }, (_, i) => drawGroupIndex(i + 1))).toEqual([
      0, 1, 2, 3, 3, 2, 1, 0, 0, 1, 2, 3, 3, 2, 1, 0,
    ]);
    for (const g of GROUP_KEYS) expect(state.groups[g].reduce((s, id) => s + seedOf(id), 0)).toBe(34);
  });

  it('opens every group with seed 1 v 4 and 2 v 3, all Bo3, labelled in pt-BR', () => {
    const state = createTournament(ENTRANTS);
    const pending = pendingMatches(state);
    expect(pending.map((m) => m.id)).toEqual(GROUP_KEYS.flatMap((g) => [`${g}-opening-1`, `${g}-opening-2`]));
    expect(pending.slice(0, 2).map((m) => [m.a, m.b])).toEqual([
      ['t1', 't16'],
      ['t8', 't9'],
    ]);
    for (const m of pending) {
      expect(m.stage).toBe('groups');
      expect(m.round).toBe('opening');
      expect(m.bestOf).toBe(3);
      expect(m.label).toBe(`Grupo ${m.group} · Abertura`);
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
    expect(() => reportResult(state, 'nope', { winner: 0, score: [2, 0] })).toThrow(/Unknown match/);
    const done = reportResult(state, first.id, { winner: 0, score: [2, 0] });
    expect(() => reportResult(done, first.id, { winner: 0, score: [2, 0] })).toThrow(/already finished/);
  });

  it('rejects scores that do not fit the best-of and winner', () => {
    for (const score of [
      [1, 0],
      [0, 2],
      [2, 2],
      [3, 0],
      [-1, 0],
      [1.5, 0],
    ] as [number, number][]) {
      expect(() => reportResult(state, first.id, { winner: 0, score })).toThrow();
    }
    expect(() => reportResult(state, first.id, { winner: 2 as 0, score: [2, 0] })).toThrow();
    expect(() => reportResult(state, first.id, { winner: 1, score: [1, 2] })).not.toThrow();
  });

  it('does not mutate the input state', () => {
    const frozen = deepFreeze(createTournament(ENTRANTS));
    const before = JSON.stringify(frozen);
    let s: TournamentState = frozen;
    for (const m of pendingMatches(frozen)) s = reportResult(s, m.id, favouriteWins(m));
    expect(JSON.stringify(frozen)).toBe(before);
    // Every group now has its winners' and elimination match.
    expect(pendingMatches(s).map((m) => m.round)).toEqual(GROUP_KEYS.flatMap(() => ['winners', 'elimination']));
  });

  it('validates Bo5 scores in the lower final and grand final', () => {
    const s = runUntil(createTournament(ENTRANTS), favouriteWins, (st) => pendingMatches(st)[0]?.round === 'lb-final');
    const lbf = pendingMatches(s)[0]!;
    expect(lbf.bestOf).toBe(5);
    expect(() => reportResult(s, lbf.id, { winner: 0, score: [2, 0] })).toThrow();
    expect(() => reportResult(s, lbf.id, { winner: 0, score: [3, 3] })).toThrow();
    expect(() => reportResult(s, lbf.id, { winner: 1, score: [2, 3] })).not.toThrow();
  });
});

describe('group stage', () => {
  it('builds the GSL bracket: winners from the openers, decider from the winners loser and elimination winner', () => {
    // Upsets in group A: t16 beats t1, t9 beats t8; then t9 wins the winners' match and t1 the elimination.
    const winners: Record<string, string> = {
      'A-opening-1': 't16',
      'A-opening-2': 't9',
      'A-winners': 't9',
      'A-elimination': 't1',
      'A-decider': 't1',
    };
    const play = (m: TMatch) => {
      const w = winners[m.id];
      return w ? resultFor(m, m.a === w ? 0 : 1, 1) : favouriteWins(m);
    };
    const played = (st: TournamentState, id: string) => !!st.matches.find((m) => m.id === id)?.result;
    let s = runUntil(createTournament(ENTRANTS), play, (st) => played(st, 'A-winners') && played(st, 'A-elimination'));
    const byId = (id: string) => s.matches.find((m) => m.id === id)!;
    expect([byId('A-winners').a, byId('A-winners').b]).toEqual(['t16', 't9']);
    expect([byId('A-elimination').a, byId('A-elimination').b]).toEqual(['t1', 't8']);
    expect(byId('A-winners').label).toBe('Grupo A · Vencedores');
    expect(byId('A-elimination').label).toBe('Grupo A · Eliminação');
    const decider = byId('A-decider');
    expect(decider.label).toBe('Grupo A · Decisiva');
    expect([decider.a, decider.b]).toEqual(['t16', 't1']);
    s = runUntil(s, play, (st) => played(st, 'A-decider'));
    const table = groupStandings(s).filter((r) => r.group === 'A');
    expect(table.map((r) => [r.id, r.place, r.status, `${r.wins}-${r.losses}`])).toEqual([
      ['t9', 1, 'qualified', '2-0'],
      ['t1', 2, 'qualified', '2-1'],
      ['t16', 3, 'eliminated', '1-2'],
      ['t8', 4, 'eliminated', '0-2'],
    ]);
  });

  it('keeps alive teams without a place, ordered by record then group seed', () => {
    const s = runUntil(createTournament(ENTRANTS), favouriteWins, (st) => groupMatches(st).length > 8);
    const a = groupStandings(s).filter((r) => r.group === 'A');
    expect(a.map((r) => r.id)).toEqual(['t1', 't8', 't9', 't16']);
    expect(a.every((r) => r.status === 'alive' && r.place === undefined)).toBe(true);
    expect(groupOf(s, 't13')).toBe('D');
  });
});

/** Checks every invariant of a finished tournament. */
function checkTournament(state: TournamentState) {
  expect(state.phase).toBe('done');
  expect(pendingMatches(state)).toHaveLength(0);
  expect(state.matches).toHaveLength(34);

  // Groups: 5 Bo3 matches each, only inside the group, no rematch before the decider, 2 losses to go out.
  const losses = new Map<string, number>();
  for (const g of GROUP_KEYS) {
    const ms = groupMatches(state, g);
    expect(ms).toHaveLength(5);
    expect(ms.map((m) => m.round).sort()).toEqual(['decider', 'elimination', 'opening', 'opening', 'winners']);
    for (const m of ms) {
      expect(m.bestOf).toBe(3);
      expect(state.groups[g]).toContain(m.a);
      expect(state.groups[g]).toContain(m.b);
      for (const id of [m.a, m.b]) expect(losses.get(id) ?? 0, `${id} played after 2 losses`).toBeLessThan(2);
      const loser = matchLoser(m)!;
      losses.set(loser, (losses.get(loser) ?? 0) + 1);
    }
    // Every team plays 2 or 3 group matches.
    for (const id of state.groups[g]) {
      const n = ms.filter((m) => m.a === id || m.b === id).length;
      expect(n === 2 || n === 3).toBe(true);
    }
  }
  const table = groupStandings(state);
  expect(table).toHaveLength(16);
  for (const g of GROUP_KEYS) {
    const rows = table.filter((r) => r.group === g);
    expect(rows.map((r) => r.place)).toEqual([1, 2, 3, 4]);
    expect(rows.map((r) => r.status)).toEqual(['qualified', 'qualified', 'eliminated', 'eliminated']);
    expect([rows[0]!.wins, rows[0]!.losses]).toEqual([2, 0]);
    expect(rows[1]!.wins).toBe(2);
    expect(rows[3]!.losses).toBe(2);
    // Eliminated teams have exactly 2 losses; qualified teams at most 1.
    for (const r of rows) expect(r.losses).toBe(r.status === 'eliminated' ? 2 : r.place === 1 ? 0 : 1);
  }

  // Playoffs: group winners face another group's runner-up; each half holds one team of every group.
  const po = playoffMatches(state);
  expect(po).toHaveLength(14);
  const place = (g: GroupKey, p: number) => table.find((r) => r.group === g && r.place === p)!.id;
  expect(po.filter((m) => m.round === 'ub-qf').map((m) => [m.a, m.b])).toEqual([
    [place('A', 1), place('B', 2)],
    [place('C', 1), place('D', 2)],
    [place('B', 1), place('A', 2)],
    [place('D', 1), place('C', 2)],
  ]);
  const halves = [
    ['ub-qf-1', 'ub-qf-2'],
    ['ub-qf-3', 'ub-qf-4'],
  ].map((ids) => po.filter((m) => ids.includes(m.id)).flatMap((m) => [m.a, m.b]));
  for (const half of halves) expect(half.map((id) => groupOf(state, id)).sort()).toEqual(['A', 'B', 'C', 'D']);
  for (const m of po.filter((x) => x.round === 'ub-qf' || x.round === 'ub-sf' || x.round === 'lb-r1')) {
    expect(groupOf(state, m.a), m.id).not.toBe(groupOf(state, m.b));
  }
  for (const m of po) expect(m.bestOf).toBe(m.round === 'gf' || m.round === 'lb-final' ? 5 : 3);

  // Double elimination: losses only end a run on the 2nd loss (or the grand final).
  const poLosses = new Map<string, number>();
  for (const m of po) {
    expect(poLosses.get(m.a) ?? 0).toBeLessThan(2);
    expect(poLosses.get(m.b) ?? 0).toBeLessThan(2);
    const loser = matchLoser(m)!;
    poLosses.set(loser, (poLosses.get(loser) ?? 0) + 1);
  }
  const gf = po.find((m) => m.id === 'gf')!;
  expect(state.champion).toBe(matchWinner(gf));
  const qualified = table.filter((r) => r.status === 'qualified').map((r) => r.id);
  expect(new Set(po.flatMap((m) => [m.a, m.b]))).toEqual(new Set(qualified));
  for (const id of qualified) {
    if (id === state.champion) expect(poLosses.get(id) ?? 0).toBeLessThanOrEqual(1);
    else if (id === matchLoser(gf)) expect(poLosses.get(id) ?? 0).toBeGreaterThanOrEqual(1);
    else expect(poLosses.get(id)).toBe(2);
  }
  // Lower round 2 never repeats a quarter-final.
  const qf = po.filter((x) => x.round === 'ub-qf');
  for (const m of po.filter((x) => x.round === 'lb-r2')) expect(qf.some((q) => pair(q) === pair(m))).toBe(false);
}

describe('runTournament', () => {
  it('runs a full tournament where favourites always win', () => {
    const state = runTournament(createTournament(ENTRANTS), favouriteWins);
    checkTournament(state);
    expect(state.champion).toBe('t1');
    const winners = groupStandings(state).filter((r) => r.place === 1).map((r) => r.id);
    expect(winners).toEqual(['t1', 't2', 't3', 't4']);
    // t1 (A) and t2 (B) start in opposite halves, so they meet in the upper final and the grand final.
    const gf = playoffMatches(state).find((m) => m.round === 'gf')!;
    expect([gf.a, gf.b]).toEqual(['t1', 't2']);
    expect(gf.label).toBe('Grande final');
  });

  it('schedules all openers first, then winners/elimination, then deciders, then the playoffs', () => {
    const state = runTournament(createTournament(ENTRANTS), randomPlay(7));
    const order = state.matches.map((m) => m.round);
    const rank = (r: string) =>
      r === 'opening' ? 0 : r === 'winners' || r === 'elimination' ? 1 : r === 'decider' ? 2 : 3;
    expect(order.map(rank)).toEqual([...order.map(rank)].sort((a, b) => a - b));
    expect(GROUP_STAGE).toHaveLength(20);
  });

  it('holds every invariant across many random tournaments', () => {
    for (let seed = 0; seed < 300; seed++) checkTournament(runTournament(createTournament(ENTRANTS), randomPlay(seed)));
  });

  it('is deterministic', () => {
    const a = runTournament(createTournament(ENTRANTS), randomPlay(3));
    const b = runTournament(createTournament(ENTRANTS), randomPlay(3));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
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
    expect(groupMatches(s).every((m) => m.result)).toBe(true);
    expect(pendingMatches(s).map((m) => m.id)).toEqual(['ub-qf-1', 'ub-qf-2', 'ub-qf-3', 'ub-qf-4']);
    expect(resolveSource(s, { group: 'C', place: 2 })).toBe('t6');
    expect(PLAYOFF_BRACKET).toHaveLength(14);
    const done = runTournament(s, favouriteWins);
    expect(
      playoffMatches(done)
        .map((m) => m.id)
        .sort(),
    ).toEqual(PLAYOFF_BRACKET.map((b) => b.id).sort());
    expect(() => reportResult(done, 'gf', { winner: 0, score: [3, 0] })).toThrow(/already finished/);
  });

  it('creates the quarter-finals only when every group is finished', () => {
    const s = runUntil(createTournament(ENTRANTS), favouriteWins, (st) => groupMatches(st).filter((m) => m.result).length === 19);
    expect(s.phase).toBe('groups');
    expect(playoffMatches(s)).toHaveLength(0);
  });
});
