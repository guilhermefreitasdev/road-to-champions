import { describe, expect, it } from 'vitest';
import { ALL_ROSTERS } from '../data/real';
import { careerSummary, filterRanking, playerTimeline, rankEntries, rankYears, type RankFilters } from './ranking';

const base: RankFilters = { year: 'all', tier: '', region: '', role: '', aura: '', query: '', onePerPlayer: false };

describe('ranking', () => {
  const all = rankEntries();

  it('lists every card of the pool, best OVR first', () => {
    expect(all).toHaveLength(ALL_ROSTERS.reduce((n, e) => n + e.cards.length, 0));
    for (let i = 1; i < all.length; i++) expect(all[i - 1]!.card.ovr).toBeGreaterThanOrEqual(all[i]!.card.ovr);
    expect(rankYears()[0]).toBe(2021);
  });

  it('keeps one card per player (his best) when asked', () => {
    const one = filterRanking(all, { ...base, onePerPlayer: true });
    expect(new Set(one.map((e) => e.card.playerId)).size).toBe(one.length);
    const best = Math.max(...playerTimeline(one[0]!.card.playerId).map((e) => e.card.ovr));
    expect(one[0]!.card.ovr).toBe(best);
  });

  it('filters by year, tier, region, role, aura and search', () => {
    const y = filterRanking(all, { ...base, year: 2023, tier: 'international', region: 'emea', role: 'duelist' });
    expect(y.length).toBeGreaterThan(0);
    for (const e of y) {
      expect(e.year).toBe(2023);
      expect(e.tier).toBe('international');
      expect(e.region).toBe('emea');
      expect(e.card.role).toBe('duelist');
    }
    for (const e of filterRanking(all, { ...base, aura: 'goat' })) expect(e.card.aura).toBe('goat');
    const q = filterRanking(all, { ...base, query: 'ASPAS' });
    expect(q.every((e) => e.card.handle.toLowerCase().includes('aspas') || e.entry.teamName.toLowerCase().includes('aspas'))).toBe(true);
  });

  it('summarizes a career from the player cards', () => {
    const t = playerTimeline(all[0]!.card.playerId);
    const c = careerSummary(t);
    expect(c.cards).toBe(t.length);
    expect(c.best.card.ovr).toBe(Math.max(...t.map((e) => e.card.ovr)));
    expect(c.titles).toBeLessThanOrEqual(c.internationals);
  });
});
