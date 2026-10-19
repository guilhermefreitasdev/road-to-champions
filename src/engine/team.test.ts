import { describe, expect, it } from 'vitest';
import { SAMPLE_AURORA, SAMPLE_TEMPESTADE } from '../data/sample';
import { CHEMISTRY_CAP, chemistryPairs, roleFit, teamStrength } from './team';
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

  it('does not penalise a lineup whose IGL is unknown, but still rewards a known one', () => {
    const noIgl: Lineup = {
      ...SAMPLE_AURORA,
      players: SAMPLE_AURORA.players.map((p) => ({ ...p, card: { ...p.card, isIGL: false } })),
    };
    expect(teamStrength({ ...noIgl, iglKnown: false }).igl).toBe(0);
    expect(teamStrength({ ...noIgl, iglKnown: true }).igl).toBe(-4);
    expect(teamStrength({ ...SAMPLE_AURORA, iglKnown: false }).igl).toBe(2);
  });

  it('caps chemistry for a full roster from the same team and event', () => {
    // 5 teammates = 10 pairs × 0.5 = 5, capped at CHEMISTRY_CAP (2).
    expect(chemistryPairs(SAMPLE_AURORA)).toEqual({ teammates: 10, compatriots: 0 });
    expect(teamStrength(SAMPLE_AURORA).chemistry).toBe(CHEMISTRY_CAP);
    expect(CHEMISTRY_CAP).toBe(2);
  });

  it('gives a smaller bonus to compatriots who were not teammates', () => {
    const withCountries = (countries: string[]): Lineup => ({
      ...SAMPLE_AURORA,
      players: SAMPLE_AURORA.players.map((p, i) => ({
        ...p,
        card: { ...p.card, teamId: `team-${i}`, country: countries[i]! },
      })),
    });
    // All BR, all from different teams: 10 pairs × 0.25 = 2.5, capped at 2; 4 BR = 6 pairs × 0.25.
    expect(teamStrength(withCountries(['BR', 'BR', 'BR', 'BR', 'BR'])).chemistry).toBe(2);
    expect(teamStrength(withCountries(['BR', 'BR', 'BR', 'BR', 'AR'])).chemistry).toBe(1.5);
    // BR-BR-BR = 3 pairs, AR-AR = 1 pair.
    expect(chemistryPairs(withCountries(['BR', 'BR', 'BR', 'AR', 'AR']))).toEqual({ teammates: 0, compatriots: 4 });
    expect(teamStrength(withCountries(['BR', 'PT', 'AR', 'CL', 'UY'])).chemistry).toBe(0);
    // Unknown countries ('') are not compatriots.
    expect(chemistryPairs(withCountries(['', '', 'BR', 'BR', 'AR']))).toEqual({ teammates: 0, compatriots: 1 });
  });

  it('counts a pair of teammates once, not also as compatriots', () => {
    // 2 teammates (1 pair × 0.5) + 3 compatriots from other teams (the other 9 pairs × 0.25) = 2.75, capped at 2.
    const lineup: Lineup = {
      ...SAMPLE_AURORA,
      players: SAMPLE_AURORA.players.map((p, i) => (i < 2 ? p : { ...p, card: { ...p.card, teamId: `team-${i}` } })),
    };
    expect(chemistryPairs(lineup)).toEqual({ teammates: 1, compatriots: 9 });
    expect(teamStrength(lineup).chemistry).toBe(2);
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
