import { describe, expect, it } from 'vitest';
import { compactSeries, parseSeriesPage as parse, seriesProblem as problem, type SeriesPage } from '../../../scripts/vlr/parse.mjs';
import matchFixture from '../../../scripts/vlr/__fixtures__/match-130685.html?raw';
import { MAPS } from '../game';
import { ALL_ROSTERS } from '.';
import { SERIES, buildSeries, type RawSeries } from './series';
import seriesJson from './series.json';
import slim from './vlr/slim.json';
import type { VlrEventData } from './cards';

describe('series parser (fixture: Champions 2022 grand final, trimmed to two maps)', () => {
  it('reads event, stage/round, date, best-of, teams, score and maps', () => {
    const s = parse(matchFixture);
    expect(s).toEqual({
      eventId: 1015,
      eventPath: '/event/1015/valorant-champions-2022/playoffs',
      stage: 'Playoffs',
      round: 'Grand Final',
      date: '2022-09-18',
      bestOf: 5,
      teams: [
        { id: 6961, slug: 'loud', name: 'LOUD' },
        { id: 8127, slug: 'optic-gaming', name: 'OpTic Gaming' },
      ],
      score: [3, 1],
      maps: [
        { map: 'Ascent', score: [15, 13], pickedBy: 1 },
        { map: 'Bind', score: [6, 13], pickedBy: 2 },
      ],
    });
    // The excerpt keeps 2 of the 4 maps: the checker refuses a score the maps do not add up to.
    expect(problem(s)).toBe('maps do not add up to the score');
    const full = { ...s, maps: [...s.maps, { map: 'Breeze', score: [13, 9], pickedBy: 1 }, { map: 'Haven', score: [13, 8], pickedBy: 2 }] } as SeriesPage;
    expect(problem(full)).toBeNull();
    expect(problem({ ...full, round: 'Showmatch' })).toBe('showmatch');
    expect(problem({ ...full, score: [3, 3] })).toBe('score is not a finished series');
    expect(compactSeries(130685, 'champions-2022', full)).toEqual({
      id: 130685,
      event: 'champions-2022',
      stage: 'Playoffs',
      round: 'Grand Final',
      date: '2022-09-18',
      bo: 5,
      teams: [
        [6961, 'loud', 'LOUD'],
        [8127, 'optic-gaming', 'OpTic Gaming'],
      ],
      score: [3, 1],
      maps: [
        ['Ascent', 15, 13, 1],
        ['Bind', 6, 13, 2],
        ['Breeze', 13, 9, 1],
        ['Haven', 13, 8, 2],
      ],
    });
  });
});

describe('series.json', () => {
  const raw = (seriesJson as unknown as { series: RawSeries[] }).series;
  const mapNames = new Set(MAPS.map((m) => m.name));
  const events = new Set((slim as VlrEventData[]).map((e) => e.slug));

  it('keeps every row, each consistent: finished score, maps add up, known maps and events', () => {
    expect(SERIES.length).toBe(raw.length);
    expect(SERIES.length).toBeGreaterThan(1100);
    expect(new Set(SERIES.map((s) => s.id)).size).toBe(SERIES.length);
    for (const s of SERIES) {
      expect(events.has(s.eventId)).toBe(true);
      const need = Math.ceil(s.bestOf / 2);
      expect(Math.max(...s.score)).toBe(need);
      expect(s.maps).toHaveLength(s.score[0] + s.score[1]);
      const wins = [0, 0];
      for (const m of s.maps) {
        expect(mapNames.has(m.map)).toBe(true);
        wins[m.score[0] > m.score[1] ? 0 : 1]!++;
      }
      expect(wins).toEqual(s.score);
      expect(s.teams[0].teamId).not.toBe(s.teams[1].teamId);
    }
  });

  it('covers every international event and the finals of the regional stages', () => {
    const intl = (slim as VlrEventData[]).filter((e) => e.tier !== 'regional');
    for (const e of intl) expect(SERIES.some((s) => s.eventId === e.slug && /Grand Final/i.test(s.round ?? ''))).toBe(true);
    const finals = SERIES.filter((s) => s.tier === 'regional' && /Grand Final/i.test(s.round ?? '')).length;
    expect(finals).toBeGreaterThanOrEqual(35);
  });

  it('resolves teams to the pool ids of the cards (logos, rosters)', () => {
    const rosterKeys = new Set(ALL_ROSTERS.map((r) => `${r.teamId}@${r.eventId}`));
    const finals = SERIES.filter((s) => /Grand Final/i.test(s.round ?? ''));
    const resolved = finals.flatMap((s) => s.teams.map((t) => rosterKeys.has(`${t.teamId}@${s.eventId}`)));
    expect(resolved.filter(Boolean).length).toBe(resolved.length);
    const gf = SERIES.find((s) => s.id === 130685)!;
    expect(gf).toMatchObject({ eventName: 'Champions 2022', tier: 'champions', bestOf: 5, score: [3, 1] });
    expect(gf.teams.map((t) => t.teamId)).toEqual(['loud', 'optic-gaming']);
  });

  it('drops rows of unknown events or with a missing team', () => {
    const row = raw[0]!;
    expect(buildSeries([{ ...row, event: 'nope' }], slim as VlrEventData[])).toEqual([]);
    expect(buildSeries([{ ...row, teams: [[null, null, null], row.teams[1]!] }], slim as VlrEventData[])).toEqual([]);
  });
});
