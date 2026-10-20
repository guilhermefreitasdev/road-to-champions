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
import { compactSeries, L } from './boxscore';
import { deserializeRun, deserializeSeason, serializeRun, serializeSeason } from './persist';
import { lineupOf, teamInfo } from './run';
import {
  applyUserVeto as seasonApplyVeto,
  beginUserVeto as seasonBeginVeto,
  chooseRegion,
  closeMarket,
  createSeason,
  pickSeasonCoach,
  pickSeasonPlayer,
  playUserMatch as seasonPlayMatch,
  rollSeasonDraft,
  seasonCoachOptions,
  seasonDraftOptions,
  seriesKey,
  stageMatches,
  startLeague,
  type SeasonState,
} from './season';
import { playerStats, runAllPlayerStats, runPlayerStats, seasonAllPlayerStats, seasonPlayerStats } from './stats';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

function autoSeasonDraft(s: SeasonState): SeasonState {
  let r = s;
  while (r.stage === 'draft' && r.draft!.phase !== 'coach') {
    if (r.draft!.phase === 'roll') r = rollSeasonDraft(r);
    const open = openSlots(r.draft!);
    const options = [...seasonDraftOptions(r)].sort((x, y) => y.ovr - x.ovr);
    const card = options.find((c) => open.includes(c.role)) ?? options[0]!;
    r = pickSeasonPlayer(r, card.id, open.includes(card.role) ? card.role : open.includes('flex') ? 'flex' : open[0]!);
  }
  return pickSeasonCoach(r, seasonCoachOptions(r)[0]!.id);
}

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

describe('box scores and the all-players table', () => {
  /** A whole run (the user vetoes the first remaining map), so every series of the Champions is played. */
  function wholeRun(seed: string): RunState {
    let r = startTournament(autoDraft(createRun('classic', seed)), 'Todos');
    while (r.phase === 'tournament') {
      r = beginUserVeto(r);
      while (!isVetoComplete(r.veto!.state)) r = applyUserVeto(r, remainingMaps(r.veto!.state)[0]!);
      r = playUserMatch(r);
    }
    return r;
  }
  const run = wholeRun('box-run');

  it('keeps a compact box score for every series played, AI vs AI included', () => {
    const played = run.tournament!.matches.filter((m) => m.result);
    expect(played).toHaveLength(34);
    expect(Object.keys(run.boxScores).sort()).toEqual(played.map((m) => m.id).sort());
    for (const m of played) {
      const box = run.boxScores[m.id]!;
      expect(box.teams).toEqual([m.a, m.b]);
      expect(box.maps).toHaveLength(m.result!.score[0] + m.result!.score[1]);
      expect(box.ids[0]).toHaveLength(5);
      expect(box.ids[1]).toHaveLength(5);
      const full = run.userSeries[m.id];
      if (full) expect(box).toEqual(compactSeries(full, m.a, m.b));
    }
    // localStorage budget: the whole run (with the user's full series, packed for the save) stays under 400 KB.
    const size = serializeRun(run).length;
    expect(deserializeRun(serializeRun(run))).toEqual(run);
    const boxes = JSON.stringify(run.boxScores).length;
    if (env.STATS_REPORT) console.log(`run JSON ${JSON.stringify(run).length} B, packed ${size} B, box scores ${boxes} B (${Math.round(boxes / 34)} B/series)`);
    expect(boxes).toBeLessThan(80_000);
    expect(size).toBeLessThan(400_000);
  });

  it('lists all 80 players with team, role and OVR as used, the user’s five among them', () => {
    const all = runAllPlayerStats(run);
    expect(all).toHaveLength(80);
    expect(all.filter((p) => p.isUser)).toHaveLength(5);
    const lines = Object.values(run.boxScores).flatMap((b) => b.maps.flatMap((m) => [...m.lines[0], ...m.lines[1]]));
    expect(all.reduce((n, p) => n + p.kills, 0)).toBe(lines.reduce((n, l) => n + l[L.k], 0));
    for (const p of all) {
      const lineup = lineupOf(run, p.entrantId);
      const player = lineup.players.find((x) => x.card.id === p.cardId)!;
      expect(player).toBeDefined();
      expect(p.ovr).toBe(player.card.ovr);
      expect(p.role).toBe(player.card.role);
      expect(p.fk).toBe(p.firstKills);
      expect(p.teamName).toBe(teamInfo(run, p.entrantId).name);
      if (!p.isUser) expect(p.teamId).toBe(player.card.teamId);
    }
    for (let i = 1; i < all.length; i++) expect(all[i - 1]!.rating).toBeGreaterThanOrEqual(all[i]!.rating);
    // The user's tab is the same rows.
    const mine = runPlayerStats(run);
    expect(mine).toEqual(all.filter((p) => p.isUser));
    expect(runAllPlayerStats(createRun('classic', 'empty'))).toEqual([]);
  });

  it('measures a whole season and filters it by stage', () => {
    const whole = (seed: string): SeasonState => {
      let s = startLeague(autoSeasonDraft(chooseRegion(createSeason(seed, 'easy'), 'americas')), 'Temporada');
      for (let guard = 0; s.stage !== 'done' && guard < 80; guard++) {
        if (s.stage === 'market') s = closeMarket(s);
        else {
          s = seasonBeginVeto(s);
          while (!isVetoComplete(s.veto!.state)) s = seasonApplyVeto(s, remainingMaps(s.veto!.state)[0]!);
          s = seasonPlayMatch(s);
        }
      }
      return s;
    };
    // The biggest save is a season that reaches the Champions.
    let s = whole('box-season-0');
    for (let i = 1; i < 12 && !s.champions; i++) s = whole(`box-season-${i}`);
    const keys = Object.keys(s.boxScores);
    const played = (['league', 'masters', 'champions'] as const).flatMap((st) => stageMatches(s, st).filter((m) => m.result).map((m) => seriesKey(st, m.id)));
    expect(keys.sort()).toEqual(played.sort());
    const size = serializeSeason(s).length;
    expect(deserializeSeason(serializeSeason(s))).toEqual(s);
    if (env.STATS_REPORT) console.log(`season (${s.champions ? 'Champions' : 'league'}, ${Object.keys(s.userSeries).length} user series) JSON ${JSON.stringify(s).length} B, packed ${size} B, box scores ${JSON.stringify(s.boxScores).length} B, ${keys.length} series`);
    expect(size).toBeLessThan(400_000);
    const league = seasonAllPlayerStats(s, 'league');
    expect(league).toHaveLength(60);
    if (s.champions) {
      expect(seasonAllPlayerStats(s)).toEqual(seasonAllPlayerStats(s, 'champions'));
      expect(seasonAllPlayerStats(s, 'champions')).toHaveLength(80);
    }
    const mine = seasonPlayerStats(s);
    expect(mine.length).toBeGreaterThanOrEqual(5);
    for (const p of mine) expect(p.isUser).toBe(true);
  });
});
