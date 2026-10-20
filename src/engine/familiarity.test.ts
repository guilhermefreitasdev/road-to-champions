import { describe, expect, it } from 'vitest';
import { SAMPLE_AURORA } from '../data/sample';
import { FAMILIARITY_CAP, FAMILIARITY_PER_MAP, familiarityOf, familiarityPoints, recordMapsPlayed } from './familiarity';
import { simulateMap } from './match';
import { createRng } from './rng';
import { simulateSeries } from './series';

describe('map familiarity', () => {
  it(`is +${FAMILIARITY_PER_MAP} per map played, capped at +${FAMILIARITY_CAP}`, () => {
    expect(familiarityPoints(0)).toBe(0);
    expect(familiarityPoints(1)).toBe(0.5);
    expect(familiarityPoints(3)).toBe(1.5);
    expect(familiarityPoints(4)).toBe(2);
    expect(familiarityPoints(9)).toBe(FAMILIARITY_CAP);
  });

  it('records every map for both teams without mutating the table', () => {
    const t0 = {};
    const t1 = recordMapsPlayed(t0, ['a', 'b'], ['Ascent', 'Bind']);
    const t2 = recordMapsPlayed(t1, ['a', 'c'], ['Ascent']);
    expect(t0).toEqual({});
    expect(t1).toEqual({ a: { Ascent: 1, Bind: 1 }, b: { Ascent: 1, Bind: 1 } });
    expect(t2.a).toEqual({ Ascent: 2, Bind: 1 });
    expect(familiarityOf(t2, 'a')).toEqual({ Ascent: 1, Bind: 0.5 });
    expect(familiarityOf(t2, 'zzz')).toEqual({});
    expect(familiarityOf(undefined, 'a')).toEqual({});
  });

  it('enters the map as a separate edge and helps the familiar team', () => {
    let plain = 0;
    let familiar = 0;
    const n = 600;
    for (let i = 0; i < n; i++) {
      if (simulateMap(SAMPLE_AURORA, SAMPLE_AURORA, createRng(`f${i}`), { map: 'Ascent' }).winner === 0) plain++;
      const r = simulateMap(SAMPLE_AURORA, SAMPLE_AURORA, createRng(`f${i}`), { map: 'Ascent', familiarity: [FAMILIARITY_CAP, 0] });
      expect(r.edges[0].familiarity).toBe(FAMILIARITY_CAP);
      expect(r.edges[1].familiarity).toBe(0);
      if (r.winner === 0) familiar++;
    }
    expect(familiar).toBeGreaterThan(plain);
  });

  it('series hand each map its own familiarity', () => {
    const pool = ['Ascent', 'Bind', 'Haven', 'Lotus', 'Split', 'Sunset', 'Abyss'];
    const s = simulateSeries(SAMPLE_AURORA, SAMPLE_AURORA, createRng('fs'), {
      bestOf: 3,
      pool,
      familiarity: [{ Ascent: 1, Bind: 2, Haven: 0.5, Lotus: 1.5, Split: 1, Sunset: 2, Abyss: 0.5 }, {}],
    });
    const table: Record<string, number> = { Ascent: 1, Bind: 2, Haven: 0.5, Lotus: 1.5, Split: 1, Sunset: 2, Abyss: 0.5 };
    for (const m of s.maps) {
      expect(m.edges[0].familiarity).toBe(table[m.map]);
      expect(m.edges[1].familiarity).toBe(0);
    }
  });
});
