import { describe, expect, it } from 'vitest';
import {
  bracketCells,
  bracketPending,
  bracketPlaceOf,
  bracketRanking,
  createBracket,
  reportBracketResult,
  runBracket,
  seedOfSource,
} from './bracket';
import { createRng } from './rng';
import { PLAYOFF_BRACKET, type Entrant, type MatchResult, type TMatch } from './tournament';

const ENTRANTS: Entrant[] = Array.from({ length: 8 }, (_, i) => ({ id: `t${i + 1}`, name: `Time ${i + 1}`, seed: i + 1 }));
const seedOf = (id: string) => Number(id.slice(1));

function resultFor(m: TMatch, winner: 0 | 1, lost = 0): MatchResult {
  const need = Math.ceil(m.bestOf / 2);
  const l = Math.min(lost, need - 1);
  return { winner, score: winner === 0 ? [need, l] : [l, need] };
}
const favouriteWins = (m: TMatch) => resultFor(m, seedOf(m.a) < seedOf(m.b) ? 0 : 1);

describe('createBracket', () => {
  it('seeds the quarter-finals 1v8, 4v5, 2v7, 3v6, all Bo3 with a Bo5 grand final', () => {
    const s = createBracket([...ENTRANTS].reverse());
    expect(s.entrants.map((e) => e.id)).toEqual(ENTRANTS.map((e) => e.id));
    expect(bracketPending(s).map((m) => [m.a, m.b])).toEqual([
      ['t1', 't8'],
      ['t4', 't5'],
      ['t2', 't7'],
      ['t3', 't6'],
    ]);
    const cells = bracketCells(s);
    expect(cells).toHaveLength(PLAYOFF_BRACKET.length);
    expect(cells.map((c) => c.slot.bestOf)).toEqual(PLAYOFF_BRACKET.map((p) => (p.id === 'gf' ? 5 : 3)));
    expect(cells.filter((c) => c.match)).toHaveLength(4);
    expect(seedOfSource(PLAYOFF_BRACKET[0]!.a)).toBe(1);
    expect(seedOfSource({ winnerOf: 'x' })).toBeUndefined();
  });

  it('rejects wrong sizes and duplicates', () => {
    expect(() => createBracket(ENTRANTS.slice(0, 7))).toThrow(/8 entrants/);
    expect(() => createBracket(ENTRANTS.map((e) => ({ ...e, seed: 2 })))).toThrow(/unique/);
  });

  it('plays 14 matches to a champion and gives every team a place', () => {
    const s = runBracket(createBracket(ENTRANTS), favouriteWins);
    expect(s.phase).toBe('done');
    expect(s.champion).toBe('t1');
    expect(s.matches).toHaveLength(14);
    expect(bracketPlaceOf(s, 't1')).toMatchObject({ rank: 1, stage: 'champion' });
    expect(bracketPlaceOf(s, 't2')).toMatchObject({ rank: 2, label: '2º', stage: 'final' });
    expect(bracketPlaceOf(s, 't3')).toMatchObject({ rank: 3, stage: 'top4' });
    expect(bracketPlaceOf(s, 't4')).toMatchObject({ rank: 4, stage: 'top4' });
    expect(bracketPlaceOf(s, 't5')!.label).toBe('5º–6º');
    expect(bracketPlaceOf(s, 't8')!.label).toBe('7º–8º');
    expect(bracketRanking(s)).toEqual(['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8']);
  });

  it('is immutable, validates results and finishes from random results', () => {
    const s = createBracket(ENTRANTS);
    const m = bracketPending(s)[0]!;
    const next = reportBracketResult(s, m.id, resultFor(m, 1));
    expect(s.matches[0]!.result).toBeUndefined();
    expect(next.matches[0]!.result).toEqual({ winner: 1, score: [0, 2] });
    expect(() => reportBracketResult(next, m.id, resultFor(m, 1))).toThrow(/already finished/);
    expect(() => reportBracketResult(s, m.id, { winner: 0, score: [3, 0] })).toThrow(/doesn't fit/);
    for (let seed = 1; seed <= 20; seed++) {
      const rng = createRng(seed);
      const done = runBracket(createBracket(ENTRANTS), (x) => resultFor(x, rng.int(0, 1) as 0 | 1, rng.int(0, 2)));
      expect(done.phase).toBe('done');
      const ranks = done.entrants.map((e) => bracketPlaceOf(done, e.id)!.rank).sort((a, b) => a - b);
      expect(ranks).toEqual([1, 2, 3, 4, 5, 5, 7, 7]);
    }
  });
});
