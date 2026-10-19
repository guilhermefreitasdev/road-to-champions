import { describe, expect, it } from 'vitest';
import { SAMPLE_AURORA, SAMPLE_TEMPESTADE } from '../data/sample';
import { roleFit, teamStrength } from './team';
import type { Lineup } from './types';

describe('roleFit', () => {
  it('rewards the natural role, tolerates flex and penalises off-role', () => {
    expect(roleFit('duelist', 'duelist')).toBe(1);
    expect(roleFit('duelist', 'flex')).toBe(0.9);
    expect(roleFit('duelist', 'controller')).toBe(0.75);
  });
});

describe('teamStrength', () => {
  it('penalises a lineup without a controller', () => {
    expect(teamStrength(SAMPLE_TEMPESTADE).composition).toBeLessThanOrEqual(-8);
    expect(teamStrength(SAMPLE_AURORA).composition).toBe(0);
  });

  it('rewards exactly one IGL and penalises none', () => {
    expect(teamStrength(SAMPLE_AURORA).igl).toBe(2);
    const noIgl: Lineup = {
      ...SAMPLE_AURORA,
      players: SAMPLE_AURORA.players.map((p) => ({ ...p, card: { ...p.card, isIGL: false } })),
    };
    expect(teamStrength(noIgl).igl).toBe(-4);
  });

  it('caps chemistry for a full roster from the same team and event', () => {
    // 5 teammates = 10 pairs × 0.5 = 5, capped at 4.
    expect(teamStrength(SAMPLE_AURORA).chemistry).toBe(4);
  });

  it('sums the parts into the total', () => {
    const s = teamStrength(SAMPLE_AURORA);
    expect(s.total).toBeCloseTo(s.base + s.composition + s.igl + s.chemistry + s.coach);
  });

  it("adds the coach's tactic bonus", () => {
    const coach = { id: 'c', name: 'c', teamId: 'aurora', eventId: 'sample', vetoBonus: 1, tacticBonus: 2 };
    const withCoach = teamStrength({ ...SAMPLE_AURORA, coach });
    expect(withCoach.coach).toBe(2);
    expect(withCoach.total).toBeCloseTo(teamStrength(SAMPLE_AURORA).total + 2);
  });

  it('rejects lineups that do not have 5 players', () => {
    expect(() => teamStrength({ name: 'x', players: SAMPLE_AURORA.players.slice(0, 4) })).toThrow();
  });
});
