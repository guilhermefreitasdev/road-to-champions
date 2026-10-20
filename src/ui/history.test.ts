import { describe, expect, it } from 'vitest';
import { openSlots } from '../engine/draft';
import { isVetoComplete, remainingMaps } from '../engine/veto';
import {
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
  type RunState,
} from '../game/run';
import * as season from '../game/season';
import { HISTORY_MAX, addEntry, parseHistory, runEntry, seasonEntry, type HistoryEntry } from './history';
import { withDifficulty } from './components/SharePanel';
import { difficultyOf } from './difficulty';
import { buildEvents, viewAt } from './playback';
import { runStats, runUserSeries } from './playerStats';

function autoDraft(run: RunState): RunState {
  let r = run;
  while (r.phase === 'draft' && r.draft.phase !== 'coach') {
    if (r.draft.phase === 'roll') r = rollDraft(r);
    const [card] = draftOptions(r);
    const open = openSlots(r.draft);
    const slot = open.includes(card!.role) ? card!.role : open.includes('flex') ? 'flex' : open[0]!;
    r = pickDraftPlayer(r, card!.id, slot);
  }
  return pickDraftCoach(r, coachOptions(r)[0]!.id);
}

function fullRun(seed: string): RunState {
  let r = startTournament(autoDraft(createRun('classic', seed)), 'Time Teste');
  while (r.phase === 'tournament') {
    r = beginUserVeto(r);
    while (!isVetoComplete(r.veto!.state)) r = applyUserVeto(r, remainingMaps(r.veto!.state)[0]!);
    r = playUserMatch(r);
  }
  return r;
}

function fullSeason(seed: string): season.SeasonState {
  let s = season.chooseRegion(season.createSeason(seed), 'emea');
  while (s.stage === 'draft' && s.draft!.phase !== 'coach') {
    if (s.draft!.phase === 'roll') s = season.rollSeasonDraft(s);
    const [card] = season.seasonDraftOptions(s);
    const open = openSlots(s.draft!);
    const slot = open.includes(card!.role) ? card!.role : open.includes('flex') ? 'flex' : open[0]!;
    s = season.pickSeasonPlayer(s, card!.id, slot);
  }
  s = season.startLeague(season.pickSeasonCoach(s, season.seasonCoachOptions(s)[0]!.id), 'Liga Teste');
  while (s.stage !== 'done') {
    if (s.stage === 'market') {
      s = season.closeMarket(s);
      continue;
    }
    s = season.beginUserVeto(s);
    while (!isVetoComplete(s.veto!.state)) s = season.applyUserVeto(s, remainingMaps(s.veto!.state)[0]!);
    s = season.playUserMatch(s);
  }
  return s;
}

const run = fullRun('history-ui');
const date = new Date('2026-10-20T12:00:00Z');

describe('player stats (UI aggregate)', () => {
  it('sums the user lines of every series and keeps rates in range', () => {
    const rows = runStats(run);
    expect(rows).toHaveLength(5);
    const series = runUserSeries(run);
    const maps = series.reduce((n, s) => n + s.series.maps.length, 0);
    for (const p of rows) {
      expect(p.maps).toBe(maps);
      expect(p.kast).toBeGreaterThanOrEqual(0);
      expect(p.kast).toBeLessThanOrEqual(100);
      expect(p.rating).toBeGreaterThan(0);
      expect(p.agents.reduce((n, a) => n + a.maps, 0)).toBeLessThanOrEqual(p.maps);
    }
    const kills = series.flatMap((s) => s.series.maps.flatMap((m) => m.players[s.side])).reduce((n, l) => n + l.kills, 0);
    expect(rows.reduce((n, p) => n + p.kills, 0)).toBe(kills);
  });
});

describe('history', () => {
  it('snapshots a finished run', () => {
    const e = runEntry(run, date);
    expect(e.id).toBe('run:' + run.seed);
    expect(e.mode).toBe('classic');
    expect(e.teamName).toBe('Time Teste');
    expect(e.record).toMatch(/^Grupos \d-\d/);
    expect(e.players).toHaveLength(5);
    expect(e.date).toBe(date.toISOString());
  });

  it('snapshots a finished Complete Trials season', () => {
    const e = seasonEntry(fullSeason('history-trials'), date);
    expect(e.mode).toBe('trials');
    expect(e.modeLabel).toContain('EMEA');
    expect(e.record).toMatch(/^Liga \d-\d/);
    expect(e.players).toHaveLength(5);
  });

  it('adds newest first, replaces the same run and caps the list', () => {
    const base = runEntry(run, date);
    let list: HistoryEntry[] = [];
    for (let i = 0; i < HISTORY_MAX + 5; i++) list = addEntry(list, { ...base, id: `run:${i}` });
    expect(list).toHaveLength(HISTORY_MAX);
    expect(list[0]!.id).toBe(`run:${HISTORY_MAX + 4}`);
    list = addEntry(list, { ...base, id: 'run:10', teamName: 'De novo' });
    expect(list.filter((e) => e.id === 'run:10')).toHaveLength(1);
    expect(list[0]!.teamName).toBe('De novo');
  });

  it('records the difficulty and keeps entries from before difficulties readable', () => {
    const hard = runEntry({ ...run, difficulty: 'hard' }, date);
    expect(hard.difficulty).toBe('hard');
    const { difficulty: _old, ...legacy } = hard;
    expect(parseHistory(JSON.parse(JSON.stringify([legacy])))).toEqual([legacy]);
    // An unknown difficulty is dropped from the entry, not the entry itself.
    const [odd] = parseHistory([{ ...hard, difficulty: 'nightmare' }]);
    expect(odd?.difficulty).toBeUndefined();
    expect(odd?.teamName).toBe(hard.teamName);
    expect(difficultyOf(null)).toBe('normal');
    expect(difficultyOf({ difficulty: 'legend' })).toBe('legend');
    expect(difficultyOf({ difficulty: 'x' })).toBe('normal');
  });

  it('adds the difficulty to the share text once', () => {
    const text = 'Road to Champions X\nDraft clássico · Força 70\nMapas 4-2';
    expect(withDifficulty(text, 'hard').split('\n')).toEqual(['Road to Champions X', 'Dificuldade Difícil', 'Draft clássico · Força 70', 'Mapas 4-2']);
    expect(withDifficulty(withDifficulty(text, 'hard'), 'hard')).toBe(withDifficulty(text, 'hard'));
    expect(withDifficulty(text)).toBe(text);
  });

  it('round-trips through JSON and drops malformed entries', () => {
    const e = runEntry(run, date);
    expect(parseHistory(JSON.parse(JSON.stringify([e, { id: 1 }, null, 'x'])))).toEqual([e]);
    expect(parseHistory({ not: 'a list' })).toEqual([]);
  });
});

describe('playback', () => {
  const { series } = runUserSeries(run)[0]!;
  const events = buildEvents(series);

  it('replays to exactly the simulated result', () => {
    const end = viewAt(series, events, events.length);
    expect(end.finished).toBe(true);
    expect(end.seriesScore).toEqual(series.score);
    expect(end.mapsDone).toBe(series.maps.length);
    expect(end.score).toEqual(series.maps[series.maps.length - 1]!.score);
  });

  it('ticks the score round by round and tracks multikills', () => {
    const firstRoundEnd = events.findIndex((e) => e.kind === 'round-end');
    const v = viewAt(series, events, firstRoundEnd + 1);
    expect(v.score[0] + v.score[1]).toBe(1);
    expect(v.mapsDone).toBe(0);
    const kills = events.filter((e) => e.kind === 'kill');
    const total = series.maps.reduce((n, m) => n + m.rounds.reduce((k, r) => k + r.kills.length, 0), 0);
    expect(kills).toHaveLength(total);
    const aces = series.maps.reduce((n, m) => n + m.players.flat().reduce((a, p) => a + p.multikills.k5, 0), 0);
    expect(kills.filter((k) => k.kind === 'kill' && k.streak === 5)).toHaveLength(aces);
  });
});
