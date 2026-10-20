import { describe, expect, it } from 'vitest';
import { SAMPLE_AURORA, SAMPLE_CARDS, SAMPLE_TEMPESTADE } from '../data/sample';
import { openSlots } from '../engine/draft';
import { createRng } from '../engine/rng';
import { simulateSeries, type SeriesResult } from '../engine/series';
import { isVetoComplete, remainingMaps } from '../engine/veto';
import {
  USER_ID,
  applyUserVeto,
  beginUserVeto,
  coachOptions,
  createRun,
  draftOptions,
  pickDraftCoach,
  pickDraftPlayer,
  playUserMatch,
  rollDraft,
  startTournament,
  userPlayerStats,
  type RunState,
} from './run';
import { playerStats, runPlayerStats } from './stats';

const POOL = ['Ascent', 'Bind', 'Haven', 'Lotus', 'Split', 'Sunset', 'Abyss'];
const series = (seed: string): SeriesResult =>
  simulateSeries(SAMPLE_AURORA, SAMPLE_TEMPESTADE, createRng(seed), { bestOf: 3, pool: POOL, formSeed: seed });

describe('playerStats', () => {
  const results = Array.from({ length: 6 }, (_, i) => series(`st-${i}`));

  it('adds up every line of every map', () => {
    const all = playerStats(results);
    expect(all).toHaveLength(10);
    const maps = results.reduce((n, s) => n + s.maps.length, 0);
    for (const p of all) expect(p.maps).toBe(maps);
    const falcao = all.find((p) => p.cardId === SAMPLE_CARDS.falcao.id)!;
    let kills = 0;
    let deaths = 0;
    let rounds = 0;
    let rating = 0;
    let k3 = 0;
    let mvps = 0;
    for (const s of results) {
      for (const m of s.maps) {
        const line = m.players[0].find((l) => l.cardId === falcao.cardId)!;
        kills += line.kills;
        deaths += line.deaths;
        rounds += m.rounds.length;
        rating += line.rating * m.rounds.length;
        k3 += line.multikills.k3;
        if (line.mvp) mvps++;
      }
    }
    expect(falcao.kills).toBe(kills);
    expect(falcao.deaths).toBe(deaths);
    expect(falcao.rounds).toBe(rounds);
    expect(falcao.kd).toBeCloseTo(kills / deaths, 2);
    expect(falcao.rating).toBeCloseTo(rating / rounds, 2);
    expect(falcao.k3).toBe(k3);
    expect(falcao.mvps).toBe(mvps);
    expect(all.reduce((n, p) => n + p.seriesMvps, 0)).toBe(results.length);
    expect(all.reduce((n, p) => n + p.mvps, 0)).toBe(maps);
    // Sorted by rating.
    for (let i = 1; i < all.length; i++) expect(all[i - 1]!.rating).toBeGreaterThanOrEqual(all[i]!.rating);
  });

  it('filters by card id and breaks the numbers down per agent', () => {
    const ids = SAMPLE_AURORA.players.map((p) => p.card.id);
    const mine = playerStats(results, ids);
    expect(mine.map((p) => p.cardId).sort()).toEqual([...ids].sort());
    for (const p of mine) {
      const card = SAMPLE_AURORA.players.find((x) => x.card.id === p.cardId)!.card;
      expect(p.agents.reduce((n, a) => n + a.maps, 0)).toBe(p.maps);
      expect(p.agents.reduce((n, a) => n + a.kills, 0)).toBe(p.kills);
      for (const a of p.agents) expect(card.agents).toContain(a.agent);
      for (let i = 1; i < p.agents.length; i++) expect(p.agents[i - 1]!.maps).toBeGreaterThanOrEqual(p.agents[i]!.maps);
      expect(p.kast).toBeGreaterThan(0);
      expect(p.kast).toBeLessThanOrEqual(100);
    }
    expect(playerStats([])).toEqual([]);
  });
});

/** First option into its role, else flex, else any open slot; then the first coach. */
function autoDraft(run: RunState): RunState {
  let r = run;
  while (r.phase === 'draft' && r.draft.phase !== 'coach') {
    if (r.draft.phase === 'roll') r = rollDraft(r);
    const [card] = draftOptions(r);
    const open = openSlots(r.draft);
    r = pickDraftPlayer(r, card!.id, open.includes(card!.role) ? card!.role : open.includes('flex') ? 'flex' : open[0]!);
  }
  return pickDraftCoach(r, coachOptions(r)[0]!.id);
}

describe('runPlayerStats', () => {
  it("aggregates the user's five over the run, matching the old summary", () => {
    let r = startTournament(autoDraft(createRun('classic', 'stats-run')), 'Stats');
    for (let i = 0; i < 3 && r.phase === 'tournament'; i++) {
      r = beginUserVeto(r);
      while (!isVetoComplete(r.veto!.state)) r = applyUserVeto(r, remainingMaps(r.veto!.state)[0]!);
      r = playUserMatch(r);
    }
    const stats = runPlayerStats(r);
    expect(stats).toHaveLength(5);
    for (const p of stats) expect(p.cardId.endsWith('#user')).toBe(true);
    const old = userPlayerStats(r);
    for (const p of stats) {
      const o = old.find((x) => x.handle === p.handle)!;
      expect(p.kills).toBe(o.kills);
      expect(p.maps).toBe(o.maps);
      expect(p.acs).toBe(o.acs);
    }
    expect(r.tournament!.entrants.some((e) => e.id === USER_ID)).toBe(true);
  });
});
