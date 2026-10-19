import { describe, expect, it } from 'vitest';
import { SAMPLE_MAP_POOL } from '../data/mapPools';
import { createRng } from './rng';
import { simulateSeries, winsNeeded } from './series';
import type { BestOf, Card, Lineup, MapName, Role } from './types';
import { applyVeto, createVeto, isVetoComplete, playedMaps, remainingMaps, type VetoState } from './veto';

const POOL = SAMPLE_MAP_POOL;

function lineup(name: string, ovr = 80, mapAffinity?: Partial<Record<MapName, number>>): Lineup {
  const roles: Role[] = ['duelist', 'initiator', 'controller', 'sentinel', 'initiator'];
  return {
    name,
    players: roles.map((role, i) => {
      const card: Card = {
        id: `${name}-${i}`,
        playerId: `${name}-${i}`,
        handle: `${name}${i}`,
        country: 'BR',
        teamId: name,
        eventId: 'test',
        role,
        isIGL: i === 2,
        agents: [],
        attrs: { aim: ovr, entry: ovr, utility: ovr, clutch: ovr, consistency: ovr, decision: ovr },
        ovr,
      };
      return { card, slot: role };
    }),
    mapAffinity,
  };
}

/** Veto that takes maps in pool order. MD3 → Haven (A pick), Icebox (B pick), Sunset (decider). */
function vetoInOrder(bestOf: BestOf, firstTeam: 0 | 1 = 0): VetoState {
  let s = createVeto(POOL, bestOf, firstTeam);
  while (!isVetoComplete(s)) s = applyVeto(s, remainingMaps(s)[0]!);
  return s;
}

const A = lineup('A');
const B = lineup('B');

describe('winsNeeded', () => {
  it('is a majority of the maps', () => {
    expect(winsNeeded(1)).toBe(1);
    expect(winsNeeded(3)).toBe(2);
    expect(winsNeeded(5)).toBe(3);
  });
});

describe('simulateSeries', () => {
  it('is deterministic for the same seed', () => {
    const run = () => simulateSeries(A, lineup('B', 76), createRng('final'), { bestOf: 5, pool: POOL });
    expect(run()).toEqual(run());
  });

  it('stops as soon as a team reaches winsNeeded, with a score consistent with the maps', () => {
    for (const bestOf of [1, 3, 5] as const) {
      for (let seed = 0; seed < 40; seed++) {
        const r = simulateSeries(A, B, createRng(seed), { bestOf, pool: POOL });
        const wins: [number, number] = [0, 0];
        for (const m of r.maps) wins[m.winner]++;
        expect(r.score).toEqual(wins);
        expect(r.score[r.winner]).toBe(winsNeeded(bestOf));
        expect(r.score[r.winner === 0 ? 1 : 0]).toBeLessThan(winsNeeded(bestOf));
        expect(r.maps[r.maps.length - 1]!.winner).toBe(r.winner);
        expect(r.maps.map((m) => m.map)).toEqual(
          playedMaps(r.veto)
            .slice(0, r.maps.length)
            .map((p) => p.map),
        );
      }
    }
  });

  it('never plays the third map of an MD3 after a 2-0', () => {
    let sweeps = 0;
    for (let seed = 0; seed < 40; seed++) {
      const r = simulateSeries(A, lineup('B', 70), createRng(seed), { bestOf: 3, pool: POOL });
      if (r.maps[0]!.winner === r.maps[1]!.winner) {
        sweeps++;
        expect(r.maps).toHaveLength(2);
      } else {
        expect(r.maps).toHaveLength(3);
      }
    }
    expect(sweeps).toBeGreaterThan(0);
  });

  it('runs autoVeto with the right format and first team when no veto is given', () => {
    const r = simulateSeries(A, B, createRng(1), { bestOf: 3, pool: POOL, firstTeam: 1 });
    expect(isVetoComplete(r.veto)).toBe(true);
    expect(r.veto.bestOf).toBe(3);
    expect(r.veto.steps[0]!.team).toBe(1);
  });

  it('tells simulateMap the position of each map in the series', () => {
    // Same seed, same maps: map 3 of a series is simulated with seriesMap 3, so a decision gap weighs more there.
    const veto = vetoInOrder(3);
    const weak = lineup('B', 80);
    weak.players.forEach((p) => {
      p.card.isIGL = false;
      p.card.attrs.decision = 45;
    });
    let third = 0;
    let thirdWins = 0;
    for (let seed = 0; seed < 300; seed++) {
      const r = simulateSeries(A, weak, createRng(seed), { bestOf: 3, pool: POOL, veto });
      if (r.maps.length === 3) {
        third++;
        if (r.maps[2]!.winner === 0) thirdWins++;
      }
    }
    expect(third).toBeGreaterThan(50);
    expect(thirdWins / third).toBeGreaterThan(0.55);
  });

  it('respects a provided veto', () => {
    const veto = vetoInOrder(5);
    const r = simulateSeries(A, B, createRng(2), { bestOf: 5, pool: POOL, veto });
    expect(r.veto).toBe(veto);
    expect(r.maps.map((m) => m.map)).toEqual(['Haven', 'Icebox', 'Lotus', 'Split', 'Sunset'].slice(0, r.maps.length));
  });

  it('throws on an incomplete veto or a mismatched format', () => {
    const partial = applyVeto(createVeto(POOL, 3), 'Ascent');
    expect(() => simulateSeries(A, B, createRng(1), { bestOf: 3, pool: POOL, veto: partial })).toThrow();
    expect(() => simulateSeries(A, B, createRng(1), { bestOf: 5, pool: POOL, veto: vetoInOrder(3) })).toThrow();
  });

  /** First seed whose MD3 goes the distance, so all three side choices can be checked. */
  function fullMd3(veto: VetoState, defenderBias?: Partial<Record<MapName, number>>) {
    for (let seed = 0; seed < 100; seed++) {
      const r = simulateSeries(A, B, createRng(seed), { bestOf: 3, pool: POOL, veto, defenderBias });
      if (r.maps.length === 3) return r;
    }
    throw new Error('No 3-map series found');
  }
  const firstSides = (r: ReturnType<typeof simulateSeries>) => r.maps.map((m) => m.rounds[0]!.teamASide);

  it('lets the non-picking team choose side, and team B choose on the decider', () => {
    // No bias: the chooser takes attack. Haven (A pick) → B attacks; Icebox (B pick) → A attacks; decider → B attacks.
    expect(firstSides(fullMd3(vetoInOrder(3)))).toEqual(['defense', 'attack', 'defense']);
    // Defender-sided maps: the chooser takes defense.
    const bias = { Haven: 2, Icebox: 1, Sunset: 3 };
    expect(firstSides(fullMd3(vetoInOrder(3), bias))).toEqual(['attack', 'defense', 'attack']);
    // Attacker-sided maps: the chooser takes attack.
    expect(firstSides(fullMd3(vetoInOrder(3), { Haven: -2, Icebox: -1, Sunset: -3 }))).toEqual([
      'defense',
      'attack',
      'defense',
    ]);
  });

  it('gives the decider side choice to the non-first team when team 1 starts the veto', () => {
    // firstTeam 1: Haven picked by team 1 → team 0 chooses; Icebox by team 0 → team 1; decider → team 0.
    expect(firstSides(fullMd3(vetoInOrder(3, 1)))).toEqual(['attack', 'defense', 'attack']);
  });
});
