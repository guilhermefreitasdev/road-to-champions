import { describe, expect, it } from 'vitest';
import { SAMPLE_MAP_POOL } from '../data/mapPools';
import { createRng } from './rng';
import type { Card, Lineup, MapName, Role } from './types';
import {
  aiChooseMap,
  applyVeto,
  autoVeto,
  createVeto,
  isVetoComplete,
  nextTurn,
  playedMaps,
  remainingMaps,
  type VetoState,
} from './veto';

const POOL = SAMPLE_MAP_POOL;

function lineup(name: string, mapAffinity?: Partial<Record<MapName, number>>, vetoBonus = 0): Lineup {
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
        attrs: { aim: 80, entry: 80, utility: 80, clutch: 80, presence: 80, decision: 80 },
        ovr: 80,
      };
      return { card, slot: role };
    }),
    coach: { id: 'c', name: 'Coach', teamId: name, eventId: 'test', vetoBonus, tacticBonus: 0 },
    mapAffinity,
  };
}

/** Applies maps in pool order until the veto is complete. */
function fillInOrder(state: VetoState): VetoState {
  let s = state;
  while (!isVetoComplete(s)) s = applyVeto(s, remainingMaps(s)[0]!);
  return s;
}

const sequence = (s: VetoState) => s.steps.map((st) => [st.team, st.action]);

describe('veto orders', () => {
  it('MD1: six alternating bans, then a decider', () => {
    expect(sequence(fillInOrder(createVeto(POOL, 1)))).toEqual([
      [0, 'ban'],
      [1, 'ban'],
      [0, 'ban'],
      [1, 'ban'],
      [0, 'ban'],
      [1, 'ban'],
      [null, 'decider'],
    ]);
  });

  it('MD3: ban ban pick pick ban ban decider', () => {
    expect(sequence(fillInOrder(createVeto(POOL, 3)))).toEqual([
      [0, 'ban'],
      [1, 'ban'],
      [0, 'pick'],
      [1, 'pick'],
      [0, 'ban'],
      [1, 'ban'],
      [null, 'decider'],
    ]);
  });

  it('MD5: ban ban pick pick pick pick decider', () => {
    expect(sequence(fillInOrder(createVeto(POOL, 5)))).toEqual([
      [0, 'ban'],
      [1, 'ban'],
      [0, 'pick'],
      [1, 'pick'],
      [0, 'pick'],
      [1, 'pick'],
      [null, 'decider'],
    ]);
  });

  it('respects firstTeam = 1', () => {
    const s = fillInOrder(createVeto(POOL, 3, 1));
    expect(s.steps.slice(0, 4).map((st) => st.team)).toEqual([1, 0, 1, 0]);
  });

  it('nextTurn follows the order and is null when complete', () => {
    let s = createVeto(POOL, 3);
    expect(nextTurn(s)).toEqual({ team: 0, action: 'ban' });
    s = applyVeto(applyVeto(s, 'Ascent'), 'Bind');
    expect(nextTurn(s)).toEqual({ team: 0, action: 'pick' });
    s = fillInOrder(s);
    expect(nextTurn(s)).toBeNull();
  });
});

describe('veto state', () => {
  it('requires a pool of exactly 7 distinct maps', () => {
    expect(() => createVeto(POOL.slice(0, 6), 3)).toThrow();
    expect(() => createVeto([...POOL, 'Pearl'], 3)).toThrow();
    expect(() => createVeto([...POOL.slice(0, 6), 'Ascent'], 3)).toThrow();
  });

  it('throws on unknown or already used maps, and on a complete veto', () => {
    const s = applyVeto(createVeto(POOL, 3), 'Ascent');
    expect(() => applyVeto(s, 'Pearl')).toThrow();
    expect(() => applyVeto(s, 'Ascent')).toThrow();
    expect(() => applyVeto(fillInOrder(s), 'Bind')).toThrow();
  });

  it('is immutable', () => {
    const s = createVeto(POOL, 3);
    applyVeto(s, 'Ascent');
    expect(s.steps).toEqual([]);
    expect(remainingMaps(s)).toEqual([...POOL]);
  });

  it('auto-appends the decider with the last remaining map', () => {
    let s = createVeto(POOL, 1);
    for (const m of POOL.slice(0, 5)) s = applyVeto(s, m);
    expect(isVetoComplete(s)).toBe(false);
    s = applyVeto(s, 'Split');
    expect(isVetoComplete(s)).toBe(true);
    expect(s.steps[6]).toEqual({ team: null, action: 'decider', map: 'Sunset' });
    expect(remainingMaps(s)).toEqual([]);
  });

  it('playedMaps lists picks in order, then the decider', () => {
    const md3 = fillInOrder(createVeto(POOL, 3));
    // Ascent, Bind banned; Haven (A), Icebox (B) picked; Lotus, Split banned; Sunset decider.
    expect(playedMaps(md3)).toEqual([
      { map: 'Haven', pickedBy: 0 },
      { map: 'Icebox', pickedBy: 1 },
      { map: 'Sunset', pickedBy: null },
    ]);
    expect(playedMaps(fillInOrder(createVeto(POOL, 1)))).toEqual([{ map: 'Sunset', pickedBy: null }]);
    expect(playedMaps(fillInOrder(createVeto(POOL, 5))).map((p) => p.pickedBy)).toEqual([0, 1, 0, 1, null]);
  });
});

describe('AI veto', () => {
  // Team A loves Ascent and hates Sunset; team B is neutral everywhere.
  const a = lineup('A', { Ascent: 50, Bind: 30, Haven: 10, Sunset: -50 });
  const b = lineup('B');

  it('bans its worst map and picks its best when affinities dwarf the noise', () => {
    for (let seed = 0; seed < 50; seed++) {
      const rng = createRng(seed);
      const s = createVeto(POOL, 3);
      expect(aiChooseMap(s, [a, b], rng)).toBe('Sunset');
      const atPick = applyVeto(applyVeto(s, 'Sunset'), 'Lotus');
      expect(aiChooseMap(atPick, [a, b], rng)).toBe('Ascent');
    }
  });

  it("judges maps from the turn team's perspective (edge vs opponent)", () => {
    // B's turn: B's edge on Ascent is -50, so B bans Ascent.
    const s = applyVeto(createVeto(POOL, 3), 'Sunset');
    expect(aiChooseMap(s, [a, b], createRng(1))).toBe('Ascent');
  });

  it('a better coach shrinks the noise (vetoBonus 3 never misses a small edge, 0 sometimes does)', () => {
    const pickWith = (vetoBonus: number, seed: number) => {
      const near = lineup('A', { Bind: 1.1 }, vetoBonus);
      const s = applyVeto(applyVeto(createVeto(POOL, 3), 'Ascent'), 'Haven');
      return aiChooseMap(s, [near, b], createRng(seed));
    };
    const seeds = Array.from({ length: 200 }, (_, i) => i);
    // Noise is ±0.5 with vetoBonus 3, so a 1.1 edge always wins.
    expect(seeds.every((seed) => pickWith(3, seed) === 'Bind')).toBe(true);
    expect(seeds.some((seed) => pickWith(0, seed) !== 'Bind')).toBe(true);
  });

  it('autoVeto is complete and deterministic for the same seed', () => {
    const run = (seed: string) => autoVeto(POOL, 5, [a, b], createRng(seed));
    const v = run('x');
    expect(isVetoComplete(v)).toBe(true);
    expect(v.bestOf).toBe(5);
    expect(run('x')).toEqual(v);
    expect(new Set(v.steps.map((s) => s.map)).size).toBe(7);
  });

  it('autoVeto honours firstTeam', () => {
    const v = autoVeto(POOL, 3, [a, b], createRng(3), 1);
    expect(v.steps[0]!.team).toBe(1);
  });
});
