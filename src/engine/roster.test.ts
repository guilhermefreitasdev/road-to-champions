import { describe, expect, it } from 'vitest';
import { SAMPLE_MAP_AFFINITY, SAMPLE_ROSTERS, sampleLineup } from '../data/sample';
import { SAMPLE_MAP_POOL } from '../data/mapPools';
import { findCard, findCoach, pickOpponents, rosterKey, rosterToLineup } from './roster';
import { teamStrength } from './team';
import type { Role, RosterEntry } from './types';

const ROLES: Role[] = ['duelist', 'initiator', 'controller', 'sentinel'];
const avgOvr = (r: RosterEntry) => r.cards.reduce((s, c) => s + c.ovr, 0) / r.cards.length;

describe('SAMPLE_ROSTERS invariants', () => {
  it('has at least 24 rosters spread over 2021–2025', () => {
    expect(SAMPLE_ROSTERS.length).toBeGreaterThanOrEqual(24);
    expect(new Set(SAMPLE_ROSTERS.map((r) => r.year))).toEqual(new Set([2021, 2022, 2023, 2024, 2025]));
    expect(new Set(SAMPLE_ROSTERS.map((r) => r.teamId)).size).toBeGreaterThanOrEqual(16);
  });

  it.each(SAMPLE_ROSTERS.map((r) => [rosterKey(r), r] as const))('%s: 5 cards, all roles, one IGL, coach', (_, r) => {
    expect(r.cards).toHaveLength(5);
    const roles = new Set(r.cards.map((c) => c.role));
    for (const role of ROLES) expect(roles.has(role)).toBe(true);
    expect(r.cards.filter((c) => c.isIGL)).toHaveLength(1);
    expect(new Set(r.cards.map((c) => c.playerId)).size).toBe(5);
    for (const c of r.cards) {
      expect(c.id).toBe(`${c.playerId}@${r.teamId}-${r.eventId}`);
      expect(c.teamId).toBe(r.teamId);
      expect(c.eventId).toBe(r.eventId);
      expect(c.ovr).toBeGreaterThanOrEqual(65);
      expect(c.ovr).toBeLessThanOrEqual(95);
      expect(c.agents.length).toBeGreaterThan(0);
      for (const v of Object.values(c.attrs)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
    expect(r.coach).toBeDefined();
    for (const bonus of [r.coach!.vetoBonus, r.coach!.tacticBonus]) {
      expect(bonus).toBeGreaterThanOrEqual(0);
      expect(bonus).toBeLessThanOrEqual(3);
    }
  });

  it('has unique card ids, roster keys and coach ids', () => {
    const ids = SAMPLE_ROSTERS.flatMap((r) => r.cards.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
    const keys = SAMPLE_ROSTERS.map(rosterKey);
    expect(new Set(keys).size).toBe(keys.length);
    const coachIds = SAMPLE_ROSTERS.map((r) => r.coach!.id);
    expect(new Set(coachIds).size).toBe(coachIds.length);
  });

  it('never has the same player on two teams at one event', () => {
    const seen = new Set<string>();
    for (const r of SAMPLE_ROSTERS) {
      for (const c of r.cards) {
        const key = `${c.playerId}@${r.eventId}`;
        expect(seen.has(key), key).toBe(false);
        seen.add(key);
      }
    }
  });

  it('has strong and weak versions of the same player', () => {
    const ovrs = new Map<string, number[]>();
    for (const c of SAMPLE_ROSTERS.flatMap((r) => r.cards)) ovrs.set(c.playerId, [...(ovrs.get(c.playerId) ?? []), c.ovr]);
    const multi = [...ovrs.values()].filter((v) => v.length > 1);
    expect(multi.length).toBeGreaterThanOrEqual(10);
    expect(multi.some((v) => Math.max(...v) - Math.min(...v) >= 8)).toBe(true);
  });

  it('has clear tiers', () => {
    const avgs = SAMPLE_ROSTERS.map(avgOvr);
    expect(avgs.filter((a) => a >= 88).length).toBeGreaterThanOrEqual(3);
    expect(avgs.filter((a) => a <= 76).length).toBeGreaterThanOrEqual(3);
    expect(avgs.filter((a) => a > 76 && a < 88).length).toBeGreaterThanOrEqual(10);
  });

  it('gives roles matching attributes', () => {
    for (const c of SAMPLE_ROSTERS.flatMap((r) => r.cards)) {
      if (c.role === 'duelist') expect(c.attrs.entry).toBeGreaterThan(c.attrs.utility);
      if (c.role === 'controller') expect(c.attrs.utility).toBeGreaterThan(c.attrs.entry);
      if (c.isIGL) expect(c.attrs.decision).toBeGreaterThanOrEqual(70);
    }
  });

  it('has map affinity for every roster, on pool maps, within [-3, 3]', () => {
    for (const r of SAMPLE_ROSTERS) {
      const affinity = SAMPLE_MAP_AFFINITY[rosterKey(r)];
      expect(affinity).toBeDefined();
      for (const [map, v] of Object.entries(affinity!)) {
        expect(SAMPLE_MAP_POOL).toContain(map);
        expect(Math.abs(v!)).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe('rosterToLineup', () => {
  it('puts each card in its role slot and the extra one in flex, keeping coach and affinity', () => {
    for (const r of SAMPLE_ROSTERS) {
      const lineup = sampleLineup(r);
      expect(lineup.name).toBe(r.teamName);
      expect(new Set(lineup.players.map((p) => p.slot)).size).toBe(5);
      const nonFlex = lineup.players.filter((p) => p.slot !== 'flex');
      for (const p of nonFlex) expect(p.slot).toBe(p.card.role);
      expect(lineup.coach).toBe(r.coach);
      expect(lineup.mapAffinity).toEqual(SAMPLE_MAP_AFFINITY[rosterKey(r)]);
      expect(() => teamStrength(lineup)).not.toThrow();
      expect(teamStrength(lineup).composition).toBe(0);
    }
  });

  it('fills a missing role slot with a doubled-up card', () => {
    const r = SAMPLE_ROSTERS[0]!;
    const noSentinel: RosterEntry = {
      ...r,
      cards: r.cards.map((c) => (c.role === 'sentinel' ? { ...c, role: 'duelist' as const } : c)),
    };
    const slots = rosterToLineup(noSentinel).players.map((p) => p.slot);
    expect(new Set(slots)).toEqual(new Set(['duelist', 'initiator', 'controller', 'sentinel', 'flex']));
  });

  it('carries an unknown IGL to the lineup', () => {
    const r = SAMPLE_ROSTERS[0]!;
    expect(rosterToLineup({ ...r, iglKnown: false }).iglKnown).toBe(false);
    expect(rosterToLineup(r).iglKnown).toBeUndefined();
  });

  it('rejects rosters without 5 cards', () => {
    const r = SAMPLE_ROSTERS[0]!;
    expect(() => rosterToLineup({ ...r, cards: r.cards.slice(0, 4) })).toThrow(/5 cards/);
  });
});

describe('findCard / findCoach', () => {
  it('finds by id or returns undefined', () => {
    const r = SAMPLE_ROSTERS[3]!;
    expect(findCard(SAMPLE_ROSTERS, r.cards[2]!.id)).toBe(r.cards[2]);
    expect(findCard(SAMPLE_ROSTERS, 'nope')).toBeUndefined();
    expect(findCoach(SAMPLE_ROSTERS, r.coach!.id)).toBe(r.coach);
    expect(findCoach(SAMPLE_ROSTERS, 'nope')).toBeUndefined();
  });
});

describe('pickOpponents', () => {
  it('returns distinct teams, deterministically', () => {
    const a = pickOpponents(SAMPLE_ROSTERS, 15, 'seed-1');
    expect(a).toHaveLength(15);
    expect(new Set(a.map((r) => r.teamId)).size).toBe(15);
    expect(pickOpponents(SAMPLE_ROSTERS, 15, 'seed-1')).toEqual(a);
    const keys = (rs: RosterEntry[]) => rs.map(rosterKey).join();
    const seeds = ['s1', 's2', 's3', 's4'].map((s) => keys(pickOpponents(SAMPLE_ROSTERS, 15, s)));
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it('avoids rosters with excluded players when possible', () => {
    const exclude = ['falcao', 'trovao', 'navalha', 'vapor', 'rastro'];
    const picked = pickOpponents(SAMPLE_ROSTERS, 15, 'x', exclude);
    expect(new Set(picked.map((r) => r.teamId)).size).toBe(15);
    const clash = picked.filter((r) => r.cards.some((c) => exclude.includes(c.playerId)));
    // Only teams whose every roster has an excluded player may clash (aurora c25 is falcao-free).
    for (const r of clash) {
      const all = SAMPLE_ROSTERS.filter((x) => x.teamId === r.teamId);
      expect(all.every((x) => x.cards.some((c) => exclude.includes(c.playerId)))).toBe(true);
    }
    expect(picked.find((r) => r.teamId === 'aurora')?.eventId ?? 'champions-exemplo-2025').toBe('champions-exemplo-2025');
  });

  it('throws when there are not enough teams', () => {
    expect(() => pickOpponents(SAMPLE_ROSTERS.slice(0, 3), 15, 's')).toThrow(/distinct teams/);
  });
});
