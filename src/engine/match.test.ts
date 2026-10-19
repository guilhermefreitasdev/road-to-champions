import { describe, expect, it } from 'vitest';
import { SAMPLE_AURORA, SAMPLE_TEMPESTADE } from '../data/sample';
import { simulateMap } from './match';
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
