import { describe, expect, it } from 'vitest';
import { SAMPLE_AURORA, SAMPLE_TEMPESTADE } from '../data/sample';
import { decisionMapFactor, simulateMap } from './match';
import { createRng } from './rng';

const play = (seed: number | string) =>
  simulateMap(SAMPLE_AURORA, SAMPLE_TEMPESTADE, createRng(seed), { map: 'Haven' });

describe('simulateMap', () => {
  it('is deterministic for the same seed', () => {
    expect(play('final')).toEqual(play('final'));
  });

  it('always ends with a valid Valorant score', () => {
    for (let seed = 0; seed < 300; seed++) {
      const { score, winner, rounds } = play(seed);
      const [w, l] = winner === 0 ? score : [score[1], score[0]];
      expect(rounds.length).toBe(w + l);
      if (l <= 11) {
        expect(w).toBe(13);
      } else {
        // Overtime: win by two.
        expect(w - l).toBe(2);
      }
    }
  });

  it('swaps sides at half-time and every overtime round', () => {
    for (let seed = 0; seed < 300; seed++) {
      const { rounds } = play(seed);
      expect(rounds[0]!.teamASide).toBe('attack');
      if (rounds.length >= 13) expect(rounds[12]!.teamASide).toBe('defense');
      if (rounds.length >= 26) {
        expect(rounds[24]!.teamASide).toBe('attack');
        expect(rounds[25]!.teamASide).toBe('defense');
      }
    }
  });

  it("keeps each team's kills equal to the other team's deaths", () => {
    for (let seed = 0; seed < 50; seed++) {
      const { players } = play(seed);
      const sum = (lines: typeof players[0], key: 'kills' | 'deaths') =>
        lines.reduce((acc, p) => acc + p[key], 0);
      expect(sum(players[0], 'kills')).toBe(sum(players[1], 'deaths'));
      expect(sum(players[1], 'kills')).toBe(sum(players[0], 'deaths'));
    }
  });

  it('never lets the round winner lose all five players', () => {
    const { rounds } = play('wipe-check');
    for (const round of rounds) {
      const winnerIds = new Set(
        (round.winner === 0 ? SAMPLE_AURORA : SAMPLE_TEMPESTADE).players.map((p) => p.card.id),
      );
      const winnerDeaths = round.kills.filter((k) => winnerIds.has(k.victim)).length;
      expect(winnerDeaths).toBeLessThan(5);
    }
  });

  it('lets the stronger lineup win most, but not all, maps', () => {
    let wins = 0;
    const n = 400;
    for (let seed = 0; seed < n; seed++) if (play(seed).winner === 0) wins++;
    expect(wins / n).toBeGreaterThan(0.75);
    expect(wins / n).toBeLessThan(1);
  });
});

describe('simulateMap economy and decision terms', () => {
  const equal = (seed: number, opts: Partial<Parameters<typeof simulateMap>[3]> = {}, b = SAMPLE_AURORA) =>
    simulateMap(SAMPLE_AURORA, b, createRng(seed), { map: 'Ascent', ...opts });

  it('gives the pistol winner round 2 (~87%) but not round 3 (~38%), in both halves', () => {
    let r2 = 0;
    let r3 = 0;
    let r14 = 0;
    let r15 = 0;
    let second = 0;
    const n = 1500;
    for (let seed = 0; seed < n; seed++) {
      const { rounds } = equal(seed);
      if (rounds[1]!.winner === rounds[0]!.winner) r2++;
      if (rounds[2]!.winner === rounds[0]!.winner) r3++;
      if (rounds.length < 15) continue; // 13–0 and 13–1 maps have no second-half round 3
      second++;
      if (rounds[13]!.winner === rounds[12]!.winner) r14++;
      if (rounds[14]!.winner === rounds[12]!.winner) r15++;
    }
    expect(r2 / n).toBeGreaterThan(0.83);
    expect(r2 / n).toBeLessThan(0.91);
    expect(r3 / n).toBeGreaterThan(0.32);
    expect(r3 / n).toBeLessThan(0.44);
    expect(second).toBeGreaterThan(n * 0.9);
    expect(r14 / second).toBeGreaterThan(0.83);
    expect(r15 / second).toBeLessThan(0.45);
  });

  it('weighs decision more on later maps of a series and never on the pistol rounds', () => {
    const rudderless = {
      ...SAMPLE_AURORA,
      players: SAMPLE_AURORA.players.map((p) => ({ ...p, card: { ...p.card, isIGL: false, attrs: { ...p.card.attrs, decision: 45 } } })),
    };
    const winRate = (seriesMap: number) => {
      let wins = 0;
      for (let seed = 0; seed < 600; seed++) if (equal(seed, { seriesMap }, rudderless).winner === 0) wins++;
      return wins / 600;
    };
    const map1 = winRate(1);
    const map3 = winRate(3);
    expect(map1).toBeGreaterThan(0.55);
    expect(map3).toBeGreaterThan(map1);
    expect(decisionMapFactor(1)).toBe(1);
    expect(decisionMapFactor(2)).toBe(1.25);
    expect(decisionMapFactor(3)).toBe(1.5);
    expect(decisionMapFactor(5)).toBe(1.5);
    // Pistols are decided by aim and nerves, not by the calls: the same as with no decision gap at all.
    let pistols = 0;
    for (let seed = 0; seed < 600; seed++) {
      const { rounds } = equal(seed, {}, rudderless);
      if (rounds[0]!.winner === 0) pistols++;
      if (rounds[12]!.winner === 0) pistols++;
    }
    expect(pistols / 1200).toBeGreaterThan(0.44);
    expect(pistols / 1200).toBeLessThan(0.56);
  });

  it('keeps the series position out of the result when it does not change the maps', () => {
    expect(equal(7, { seriesMap: 1 })).toEqual(equal(7));
  });
});

describe('simulateMap adjustments', () => {
  it('favours the team with map affinity or an adjust bonus', () => {
    const winRate = (opts: Parameters<typeof simulateMap>[3], b = SAMPLE_TEMPESTADE) => {
      let wins = 0;
      for (let seed = 0; seed < 300; seed++) {
        if (simulateMap(SAMPLE_AURORA, b, createRng(seed), opts).winner === 0) wins++;
      }
      return wins / 300;
    };
    const base = winRate({ map: 'Bind' });
    expect(winRate({ map: 'Bind', adjust: [0, 15] })).toBeLessThan(base);
    expect(winRate({ map: 'Bind' }, { ...SAMPLE_TEMPESTADE, mapAffinity: { Bind: 15 } })).toBeLessThan(base);
    expect(winRate({ map: 'Haven' }, { ...SAMPLE_TEMPESTADE, mapAffinity: { Bind: 15 } })).toBe(winRate({ map: 'Haven' }));
  });
});
