import { describe, expect, it } from 'vitest';
import { SAMPLE_AURORA, SAMPLE_TEMPESTADE } from '../data/sample';
import {
  DIMENSION_KEYS,
  DIMENSION_REFERENCE,
  DIMENSION_WEIGHT,
  NO_IGL_CAP,
  NO_IGL_FACTOR,
  SECOND_IGL_COMM_PENALTY,
  SECOND_IGL_DECISION_BONUS,
  UNKNOWN_IGL_DECISION,
  chemistryPairs,
  coachDecision,
  decisionDetail,
  roleFit,
  teamDimensions,
  teamStrength,
  utilityCoverage,
} from './team';
import type { Lineup } from './types';

const withIgls = (lineup: Lineup, igls: number[]): Lineup => ({
  ...lineup,
  players: lineup.players.map((p, i) => ({ ...p, card: { ...p.card, isIGL: igls.includes(i) } })),
});
const noIgl = withIgls(SAMPLE_AURORA, []);
const coach = { id: 'c', name: 'c', teamId: 'aurora', eventId: 'sample', vetoBonus: 1, tacticBonus: 2 };

describe('roleFit', () => {
  it('rewards the natural role, tolerates flex and penalises off-role', () => {
    expect(roleFit('duelist', 'duelist')).toBe(1);
    expect(roleFit('duelist', 'flex')).toBe(0.9);
    expect(roleFit('duelist', 'controller')).toBe(0.75);
  });
});

describe('teamStrength', () => {
  it('penalises a lineup without a controller, but not one without a sentinel', () => {
    expect(teamStrength(SAMPLE_TEMPESTADE).composition).toBeLessThanOrEqual(-8);
    expect(teamStrength(SAMPLE_AURORA).composition).toBe(0);
    const noSentinel: Lineup = {
      ...SAMPLE_AURORA,
      players: SAMPLE_AURORA.players.map((p) => (p.slot === 'sentinel' ? { ...p, slot: 'flex' as const } : p)),
    };
    expect(teamStrength(noSentinel).composition).toBe(0);
  });

  it('sums base, composition and the five dimensions into the total', () => {
    const s = teamStrength(SAMPLE_AURORA);
    const points = DIMENSION_KEYS.reduce((sum, k) => sum + s.points[k], 0);
    expect(s.total).toBeCloseTo(s.base + s.composition + points);
    for (const k of DIMENSION_KEYS) {
      expect(s.points[k]).toBeCloseTo((DIMENSION_WEIGHT[k] * (s.dimensions[k] - DIMENSION_REFERENCE[k])) / 10);
      expect(s.dimensions[k]).toBeGreaterThanOrEqual(0);
      expect(s.dimensions[k]).toBeLessThanOrEqual(100);
    }
  });

  it('rejects lineups that do not have 5 players', () => {
    expect(() => teamStrength({ name: 'x', players: SAMPLE_AURORA.players.slice(0, 4) })).toThrow();
  });
});

describe('decision (IGL)', () => {
  it('blends the IGL (70%), the second voice (15%) and the coach (15%)', () => {
    const d = decisionDetail({ ...SAMPLE_AURORA, coach });
    expect(d.status).toBe('one');
    expect(d.igl!.handle).toBe('nevoa');
    expect(d.second!.handle).toBe('brisa'); // 50: the best non-IGL decision
    expect(d.coach).toBe(coachDecision(coach));
    expect(coachDecision(coach)).toBe(80);
    expect(coachDecision(undefined)).toBe(40);
    expect(d.value).toBeCloseTo(0.7 * 88 + 0.15 * 50 + 0.15 * 80);
    expect(teamStrength({ ...SAMPLE_AURORA, coach }).igl).toBe('one');
  });

  it('without an IGL: best decision-makers take over, ×0.75, capped at 55 — a clear cost', () => {
    const d = decisionDetail(noIgl);
    expect(d.status).toBe('none');
    expect(d.second!.handle).toBe('nevoa');
    // raw = 0.7 × 88 + 0.15 × 50 + 0.15 × 40 (no coach) = 75.1 → ×0.75 = 56.3 → capped 55.
    expect(d.raw).toBeCloseTo(75.1);
    expect(d.value).toBe(NO_IGL_CAP);
    expect(Math.min(NO_IGL_CAP, NO_IGL_FACTOR * d.raw)).toBe(d.value);
    const withIgl = teamStrength(SAMPLE_AURORA);
    const without = teamStrength(noIgl);
    expect(without.igl).toBe('none');
    expect(without.dimensions.decision).toBeLessThan(withIgl.dimensions.decision);
    // Static cost of losing the IGL on this lineup: (75.1 − 55) × 1.0 / 10 ≈ 2 points.
    expect(withIgl.total - without.total).toBeGreaterThan(1.5);
    expect(withIgl.total - without.total).toBeLessThan(3);
  });

  it('a lineup of non-leaders without an IGL falls well below the reference', () => {
    const flat: Lineup = {
      ...noIgl,
      players: noIgl.players.map((p) => ({ ...p, card: { ...p.card, attrs: { ...p.card.attrs, decision: 45 } } })),
    };
    const d = decisionDetail({ ...flat, coach: { ...coach, tacticBonus: 3 } });
    // base = 0.7 × 45 + 0.15 × 45 + 0.15 × 100 = 53.25 → × 0.75 = 39.9
    expect(d.value).toBeCloseTo(39.9375);
    expect(teamStrength(flat).points.decision).toBeLessThan(-3.5);
  });

  it('a coach is worth 15% of the dimension and only partly covers a missing IGL', () => {
    const base = decisionDetail(noIgl).value;
    const champion = decisionDetail({ ...noIgl, coach: { ...coach, tacticBonus: 3 } }).value;
    expect(champion).toBeGreaterThanOrEqual(base);
    expect(champion).toBeLessThanOrEqual(NO_IGL_CAP);
    const withIgl = decisionDetail(SAMPLE_AURORA).value;
    const withIglAndCoach = decisionDetail({ ...SAMPLE_AURORA, coach: { ...coach, tacticBonus: 3 } }).value;
    expect(withIglAndCoach - withIgl).toBeCloseTo(0.15 * 60);
  });

  it('treats an unknown IGL as neutral, not as missing', () => {
    const d = decisionDetail({ ...noIgl, iglKnown: false });
    expect(d.status).toBe('unknown');
    expect(d.value).toBe(UNKNOWN_IGL_DECISION);
    expect(d.value).toBe(DIMENSION_REFERENCE.decision);
    expect(teamStrength({ ...noIgl, iglKnown: false }).points.decision).toBe(0);
    expect(d.value).toBeGreaterThan(decisionDetail(noIgl).value);
    expect(teamStrength({ ...noIgl, iglKnown: true }).igl).toBe('none');
    // A known IGL is used even when the flag says unknown.
    expect(decisionDetail({ ...SAMPLE_AURORA, iglKnown: false }).status).toBe('one');
  });

  it('two IGLs: small decision bonus, communication penalty, no net punishment', () => {
    const two = withIgls(SAMPLE_AURORA, [1, 2]);
    const d = decisionDetail(two);
    expect(d.status).toBe('two');
    expect(d.igl!.handle).toBe('nevoa');
    expect(d.otherIgls).toEqual(['brisa']);
    expect(d.value).toBeCloseTo(decisionDetail(SAMPLE_AURORA).value + SECOND_IGL_DECISION_BONUS);
    const dims = teamDimensions(two);
    expect(dims.communication).toBe(teamDimensions(SAMPLE_AURORA).communication - SECOND_IGL_COMM_PENALTY);
    expect(teamStrength(two).total).toBeGreaterThanOrEqual(teamStrength(SAMPLE_AURORA).total);
  });
});

describe('utility coverage', () => {
  it('cuts utility without a controller or initiator and rewards double controller with an initiator', () => {
    expect(utilityCoverage(['duelist', 'initiator', 'controller', 'sentinel', 'flex'])).toEqual({ factor: 1, bonus: 0 });
    expect(utilityCoverage(['duelist', 'initiator', 'flex', 'sentinel', 'flex']).factor).toBeCloseTo(0.7);
    expect(utilityCoverage(['duelist', 'flex', 'controller', 'sentinel', 'flex']).factor).toBeCloseTo(0.9);
    expect(utilityCoverage(['duelist', 'flex', 'flex', 'sentinel', 'flex']).factor).toBeCloseTo(0.63);
    expect(utilityCoverage(['duelist', 'initiator', 'controller', 'controller', 'sentinel']).bonus).toBe(3);
    expect(utilityCoverage(['duelist', 'flex', 'controller', 'controller', 'sentinel']).bonus).toBe(0);
    expect(teamDimensions(SAMPLE_TEMPESTADE).utility).toBeLessThan(teamDimensions(SAMPLE_AURORA).utility);
  });
});

describe('communication (chemistry)', () => {
  it('caps at 100 for a full roster from the same team and event', () => {
    // 5 teammates = 10 pairs × 6 = 60 → 110, capped at 100 → +2 points.
    expect(chemistryPairs(SAMPLE_AURORA)).toEqual({ teammates: 10, compatriots: 0 });
    expect(teamDimensions(SAMPLE_AURORA).communication).toBe(100);
    expect(teamStrength(SAMPLE_AURORA).points.communication).toBeCloseTo(2);
  });

  it('gives a smaller bonus to compatriots who were not teammates', () => {
    const withCountries = (countries: string[]): Lineup => ({
      ...SAMPLE_AURORA,
      players: SAMPLE_AURORA.players.map((p, i) => ({
        ...p,
        card: { ...p.card, teamId: `team-${i}`, country: countries[i]! },
      })),
    });
    const comm = (l: Lineup) => teamDimensions(l).communication;
    // All BR, all from different teams: 10 pairs × 3 = 80; 4 BR = 6 pairs → 68.
    expect(comm(withCountries(['BR', 'BR', 'BR', 'BR', 'BR']))).toBe(80);
    expect(comm(withCountries(['BR', 'BR', 'BR', 'BR', 'AR']))).toBe(68);
    // BR-BR-BR = 3 pairs, AR-AR = 1 pair.
    expect(chemistryPairs(withCountries(['BR', 'BR', 'BR', 'AR', 'AR']))).toEqual({ teammates: 0, compatriots: 4 });
    expect(comm(withCountries(['BR', 'PT', 'AR', 'CL', 'UY']))).toBe(50);
    expect(teamStrength(withCountries(['BR', 'PT', 'AR', 'CL', 'UY'])).points.communication).toBe(0);
    // Unknown countries ('') are not compatriots.
    expect(chemistryPairs(withCountries(['', '', 'BR', 'BR', 'AR']))).toEqual({ teammates: 0, compatriots: 1 });
  });

  it('counts a pair of teammates once, not also as compatriots', () => {
    // 2 teammates (1 pair × 6) + the other 9 pairs as compatriots (× 3) = 50 + 33 = 83.
    const lineup: Lineup = {
      ...SAMPLE_AURORA,
      players: SAMPLE_AURORA.players.map((p, i) => (i < 2 ? p : { ...p, card: { ...p.card, teamId: `team-${i}` } })),
    };
    expect(chemistryPairs(lineup)).toEqual({ teammates: 1, compatriots: 9 });
    expect(teamDimensions(lineup).communication).toBe(83);
  });
});

describe('mechanics and clutch', () => {
  it('follow the attributes and the role fit', () => {
    const dims = teamDimensions(SAMPLE_AURORA);
    const better: Lineup = {
      ...SAMPLE_AURORA,
      players: SAMPLE_AURORA.players.map((p) => ({
        ...p,
        card: { ...p.card, attrs: { ...p.card.attrs, aim: 99, entry: 99, clutch: 99, presence: 99 } },
      })),
    };
    expect(teamDimensions(better).mechanics).toBeGreaterThan(dims.mechanics);
    expect(teamDimensions(better).clutch).toBeGreaterThan(dims.clutch);
    expect(teamDimensions(better).decision).toBe(dims.decision);
    const offRole: Lineup = { ...SAMPLE_AURORA, players: SAMPLE_AURORA.players.map((p) => ({ ...p, slot: 'flex' as const })) };
    expect(teamDimensions(offRole).mechanics).toBeLessThan(dims.mechanics);
  });
});
