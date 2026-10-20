import { describe, expect, it } from 'vitest';
import { dailyData, dailyPuzzle } from '.';
import {
  DAILY_LAUNCH,
  addDays,
  dayKeyAt,
  dayNumber,
  formatCountdown,
  isDayKey,
  keyFromDayNumber,
  msUntilNextDay,
  puzzleNumber,
  weekdayIndex,
} from './calendar';
import { ANSWER_GAP_DAYS, PLACAR_TEAM_GAP_DAYS, SERIES_GAP_DAYS, TEAM_GAP_DAYS, createDailyGenerator, puzzleProblems, type DailyPuzzle } from './generate';
import {
  answerPlacar,
  dailyStats,
  dayResult,
  emptyProgress,
  emptyStore,
  guessLinhas,
  guessPro,
  hintLinhas,
  impostorResult,
  linhasResult,
  parseDailyStore,
  pickImpostor,
  placarResult,
  placarTruth,
  proCluesShown,
  proResult,
  revealLinhas,
  settleDay,
  shareText,
  type DailyStore,
  type DayProgress,
} from './play';
import { normalizeName, rankMatches } from './text';
import { impostorRuleText, placementWords, seriesStageLabel, yearsLabel } from './labels';

const DAYS = 365;
const days: DailyPuzzle[] = Array.from({ length: DAYS }, (_, i) => dailyPuzzle(addDays(DAILY_LAUNCH, i)));

describe('calendar (America/Sao_Paulo)', () => {
  it('turns the day at midnight in São Paulo, not UTC', () => {
    expect(dayKeyAt(new Date('2026-10-20T02:59:59Z'))).toBe('2026-10-19');
    expect(dayKeyAt(new Date('2026-10-20T03:00:00Z'))).toBe('2026-10-20');
    expect(dayKeyAt(new Date('2026-12-31T23:30:00Z'))).toBe('2026-12-31');
    expect(dayKeyAt(new Date('2027-01-01T03:00:00Z'))).toBe('2027-01-01');
  });

  it('follows the historical daylight saving time in the zone database (2018)', () => {
    // 2018-11-04: clocks jumped from 00:00 to 01:00 (UTC-3 → UTC-2).
    expect(dayKeyAt(new Date('2018-11-04T02:30:00Z'))).toBe('2018-11-03');
    expect(dayKeyAt(new Date('2018-11-04T03:30:00Z'))).toBe('2018-11-04');
  });

  it('counts down to the next midnight in São Paulo', () => {
    expect(msUntilNextDay(new Date('2026-10-20T02:59:00Z'))).toBe(60_000);
    expect(msUntilNextDay(new Date('2026-10-20T03:00:00Z'))).toBe(86_400_000);
    expect(formatCountdown(3 * 3600_000 + 5 * 60_000)).toBe('3h 05min');
    expect(formatCountdown(65_000)).toBe('1min 05s');
  });

  it('numbers puzzles from the launch and does day arithmetic in whole days', () => {
    expect(puzzleNumber(DAILY_LAUNCH)).toBe(1);
    expect(puzzleNumber(addDays(DAILY_LAUNCH, 41))).toBe(42);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(keyFromDayNumber(dayNumber('2026-10-20'))).toBe('2026-10-20');
    expect(weekdayIndex('2026-10-19')).toBe(0); // Monday
    expect(weekdayIndex('2026-10-25')).toBe(6); // Sunday
    expect(isDayKey('2026-02-30')).toBe(false);
    expect(isDayKey('2026-10-20')).toBe(true);
  });
});

describe('text matching', () => {
  it('ignores case, accents and punctuation', () => {
    expect(normalizeName('Šacy')).toBe('sacy');
    expect(normalizeName(' aspas ')).toBe('aspas');
    expect(normalizeName('d4v41')).toBe('d4v41');
    expect(normalizeName('Less.')).toBe('less');
    expect(rankMatches('as', ['Sacy', 'aspas', 'Less', 'Asuna'], (s) => s)).toEqual(['aspas', 'Asuna']);
  });
});

describe('labels', () => {
  it('translates VLR stages, placements and year runs', () => {
    expect(seriesStageLabel('Playoffs', 'Grand Final')).toBe('Playoffs · Grande final');
    expect(seriesStageLabel('Group Stage', 'Decider (B)')).toBe('Fase de grupos · Decisiva (grupo B)');
    expect(seriesStageLabel('Playoffs', 'Lower Round 2')).toBe('Playoffs · Chave inferior, rodada 2');
    expect(placementWords('1st')).toBe('Campeão');
    expect(placementWords('2nd')).toBe('Vice-campeão');
    expect(placementWords('3rd–4th')).toBe('3º–4º lugar');
    expect(placementWords(undefined)).toBeNull();
    expect(yearsLabel([2021, 2022, 2023, 2025])).toBe('2021–2023, 2025');
    expect(yearsLabel([2024])).toBe('2024');
    expect(impostorRuleText({ rule: 'year', teamName: 'LOUD', year: 2022 }).title).toBe('LOUD em 2022');
  });
});

describe('puzzle generation', () => {
  const data = dailyData();

  it('is deterministic: the same date gives the same puzzles, however it is reached', () => {
    const fresh = createDailyGenerator(data);
    for (const i of [200, 0, 37, 364]) {
      expect(JSON.stringify(fresh.puzzleFor(addDays(DAILY_LAUNCH, i)))).toBe(JSON.stringify(days[i]));
    }
    expect(() => fresh.puzzleFor(addDays(DAILY_LAUNCH, -1))).toThrow();
  });

  it('never produces an ambiguous or broken puzzle over 365 consecutive days', () => {
    const problems = days.flatMap((d) => puzzleProblems(data, d).map((p) => `${d.date}: ${p}`));
    expect(problems).toEqual([]);
  });

  it('does not repeat a team within ~30 days of a challenge, a roster or Pro within a year, a series within 6 months', () => {
    const issues: string[] = [];
    const within = <T>(get: (d: DailyPuzzle) => T[], gap: number, label: string) => {
      days.forEach((d, i) => {
        for (let k = Math.max(0, i - gap); k < i; k++) {
          const before = new Set(get(days[k]!));
          for (const x of get(d)) if (before.has(x)) issues.push(`${label} ${String(x)} on ${d.date} and ${days[k]!.date}`);
        }
      });
    };
    within((d) => [d.linhas.teamId], TEAM_GAP_DAYS, 'linhas team');
    within((d) => [d.impostor.teamId], TEAM_GAP_DAYS, 'impostor team');
    within((d) => d.placar.teams.map((t) => t.teamId), PLACAR_TEAM_GAP_DAYS, 'placar team');
    within((d) => [`${d.linhas.teamId}@${d.linhas.eventId}`], ANSWER_GAP_DAYS, 'roster');
    within((d) => [d.pro.answer.playerId], ANSWER_GAP_DAYS, 'pro');
    within((d) => [d.placar.seriesId], SERIES_GAP_DAYS, 'series');
    expect(issues).toEqual([]);
  });

  it('gets harder through the week: Monday answers are more famous than Sunday ones', () => {
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const byLevel = (level: number, f: (d: DailyPuzzle) => number) => avg(days.filter((d) => d.level === level).map(f));
    const proFame = (d: DailyPuzzle) => data.players.get(d.pro.answer.playerId)!.fame;
    const rosterFame = (d: DailyPuzzle) => data.rosterFame(data.rosters.get(`${d.linhas.teamId}@${d.linhas.eventId}`)!);
    expect(byLevel(0, proFame)).toBeGreaterThan(byLevel(3, proFame));
    expect(byLevel(3, proFame)).toBeGreaterThan(byLevel(6, proFame));
    expect(byLevel(0, rosterFame)).toBeGreaterThan(byLevel(6, rosterFame));
    // Mondays: mostly international rosters.
    expect(days.filter((d) => d.level === 0 && d.linhas.tier !== 'regional').length).toBeGreaterThan(days.filter((d) => d.level === 0).length * 0.7);
  });

  it('uses every Impostor rule and only real series of the playoffs or internationals', () => {
    const rules = new Set(days.map((d) => d.impostor.rule));
    expect([...rules].sort()).toEqual(['event', 'ever', 'year']);
    for (const d of days) {
      const s = data.series.find((x) => x.id === d.placar.seriesId)!;
      expect(s).toBeDefined();
      expect(s.bestOf).toBeGreaterThanOrEqual(3);
      // Same maps and scores as the source, in the display order.
      const flip = d.placar.teams[0].teamId !== s.teams[0].teamId;
      expect(d.placar.score).toEqual(flip ? [s.score[1], s.score[0]] : s.score);
    }
  });

  it('builds every Pro clue from the data', () => {
    for (const d of days.slice(0, 60)) {
      const p = data.players.get(d.pro.answer.playerId)!;
      const c = d.pro.clues;
      expect(c.country).toBe(p.country);
      expect(c.role).toBe(p.role);
      const card = p.cards.find((x) => x.entry.eventId === c.event.eventId && x.entry.teamId === c.event.teamId)!;
      expect(card.card.stats).toMatchObject({ rating: c.stat.rating, acs: c.stat.acs, kast: c.stat.kast, rounds: c.stat.rounds });
      expect(c.teams.some((t) => t.teamId === c.event.teamId && t.years.includes(c.stat.year))).toBe(true);
    }
  });
});

describe('playing a day', () => {
  const d = days[0]!;

  it('scores Linhas: names, misses, hints and the reveal', () => {
    const [a, b, c] = d.linhas.slots;
    let s = emptyProgress().linhas;
    s = hintLinhas(s, a!.playerId, 'country');
    s = hintLinhas(s, a!.playerId, 'initial');
    let r = guessLinhas(s, d.linhas, { playerId: a!.playerId, handle: a!.handle });
    expect(r.outcome).toBe('hit');
    s = r.state;
    // Typed in another case: matches the handle.
    r = guessLinhas(s, d.linhas, { playerId: 'nobody', handle: b!.handle.toUpperCase() });
    expect(r.outcome).toBe('hit');
    s = r.state;
    expect(guessLinhas(s, d.linhas, { playerId: b!.playerId, handle: b!.handle }).outcome).toBe('repeat');
    r = guessLinhas(s, d.linhas, { playerId: 'x1', handle: 'zzz-not-here' });
    expect(r.outcome).toBe('miss');
    s = hintLinhas(r.state, c!.playerId, 'role');
    s = revealLinhas(s);
    const res = linhasResult(s, d.linhas);
    expect(res).toMatchObject({ done: true, names: 2, won: false });
    expect(res.points).toBeCloseTo(0.25 + 1);
    // Five misses end it.
    let m = emptyProgress().linhas;
    for (let i = 0; i < 5; i++) m = guessLinhas(m, d.linhas, { playerId: `m${i}`, handle: `miss${i}` }).state;
    expect(m.done).toBe(true);
  });

  it('scores the Pro by the try that got it and reveals one clue per miss', () => {
    let s = emptyProgress().pro;
    expect(proCluesShown(s, d.pro)).toBe(1);
    s = guessPro(s, d.pro, 'wrong-1').state;
    s = guessPro(s, d.pro, 'wrong-2').state;
    expect(proCluesShown(s, d.pro)).toBe(3);
    expect(guessPro(s, d.pro, 'wrong-1').outcome).toBe('repeat');
    s = guessPro(s, d.pro, d.pro.answer.playerId).state;
    expect(proResult(s, d.pro)).toMatchObject({ done: true, won: true, tries: 3, points: 3 });
    let f = emptyProgress().pro;
    for (let i = 0; i < 6; i++) f = guessPro(f, d.pro, `w${i}`).state;
    expect(proResult(f, d.pro)).toMatchObject({ done: true, won: false, points: 0 });
  });

  it('scores the Impostor (one try) and the Placar (winner, score, last map)', () => {
    const imp = pickImpostor(emptyProgress().impostor, d.impostor.impostorId);
    expect(pickImpostor(imp, 'someone-else').pick).toBe(d.impostor.impostorId);
    expect(impostorResult(imp, d.impostor)).toMatchObject({ won: true, points: 5 });
    const t = placarTruth(d.placar);
    const exact = answerPlacar(emptyProgress().placar, d.placar, t.winner, t.loserMaps, t.lastMap);
    expect(placarResult(exact, d.placar)).toMatchObject({ points: 5, won: true });
    const other = d.placar.mapOptions.find((m) => m !== t.lastMap)!;
    const wrong = answerPlacar(emptyProgress().placar, d.placar, (1 - t.winner) as 0 | 1, t.loserMaps, other);
    expect(placarResult(wrong, d.placar)).toMatchObject({ points: 0, won: false });
    expect(() => answerPlacar(emptyProgress().placar, d.placar, 0, 9, null)).toThrow();
  });

  it('settles the day once and writes a share text without emoji', () => {
    let p: DayProgress = emptyProgress();
    p.linhas = revealLinhas(p.linhas);
    p.pro = guessPro(p.pro, d.pro, d.pro.answer.playerId).state;
    p.impostor = pickImpostor(p.impostor, d.impostor.options.find((o) => o.member)!.playerId);
    expect(settleDay(p, d, d.date).finishedOn).toBeUndefined();
    const t = placarTruth(d.placar);
    p.placar = answerPlacar(p.placar, d.placar, t.winner, t.loserMaps, null);
    p = settleDay(p, d, d.date);
    expect(p.finishedOn).toBe(d.date);
    expect(p.result).toEqual(dayResult(p, d));
    const text = shareText(d, p);
    expect(text).toBe(`Road to Champions · Diário #1 · 2/4 · 9/20 pts\nLinhas 0/5 · Pro em 1 · Impostor errado · Placar certo`);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    // From the archive (finished on a later day): marked, and it does not count for the streak.
    const late = settleDay({ ...p, finishedOn: undefined }, d, addDays(d.date, 3));
    expect(shareText(d, late)).toContain('Diário #1 (arquivo)');
  });
});

describe('stats and streak', () => {
  const finished = (date: string, finishedOn = date, points = 10, wins = 2): DayProgress => ({
    ...emptyProgress(),
    finishedOn,
    result: {
      points,
      wins,
      challenges: {
        linhas: { done: true, points: 0, won: false },
        pro: { done: true, points: 0, won: false },
        impostor: { done: true, points: 0, won: false },
        placar: { done: true, points: 0, won: false },
      },
      summary: { linhas: '', pro: '', impostor: '', placar: '' },
    },
  });

  it('counts consecutive days played on their own day', () => {
    const store: DailyStore = {
      v: 1,
      days: {
        '2026-10-15': finished('2026-10-15', '2026-10-15', 12, 3),
        '2026-10-16': finished('2026-10-16', '2026-10-16', 8, 1),
        // Played after midnight (archive): finished, but breaks the streak.
        '2026-10-17': finished('2026-10-17', '2026-10-18', 20, 4),
        '2026-10-18': finished('2026-10-18'),
        '2026-10-19': finished('2026-10-19'),
      },
    };
    // Today (20) still open: the streak runs up to yesterday.
    expect(dailyStats(store, '2026-10-20')).toMatchObject({ streak: 2, bestStreak: 2, played: 5, best: 20, average: 12 });
    store.days['2026-10-20'] = finished('2026-10-20');
    expect(dailyStats(store, '2026-10-20').streak).toBe(3);
    // A missed day resets it.
    expect(dailyStats(store, '2026-10-22').streak).toBe(0);
    expect(dailyStats(store, '2026-10-22').bestStreak).toBe(3);
    expect(dailyStats(store, '2026-10-22').wins).toEqual([0, 1, 3, 1, 1]);
  });

  it('starts empty and reads saves defensively', () => {
    expect(dailyStats(emptyStore(), '2026-10-20')).toMatchObject({ played: 0, streak: 0, average: 0, best: 0 });
    expect(parseDailyStore(null)).toEqual(emptyStore());
    expect(parseDailyStore({ v: 2, days: {} })).toEqual(emptyStore());
    const parsed = parseDailyStore({
      v: 1,
      days: {
        'not-a-day': {},
        '2026-10-20': { linhas: { found: ['1', 2], hints: { '1': ['country', 'bogus'] }, done: true }, placar: { winner: 3 } },
      },
    });
    expect(Object.keys(parsed.days)).toEqual(['2026-10-20']);
    expect(parsed.days['2026-10-20']!.linhas).toEqual({ found: ['1'], misses: [], hints: { '1': ['country'] }, done: true });
    expect(parsed.days['2026-10-20']!.placar.winner).toBeNull();
    const roundTrip = { v: 1, days: { '2026-10-19': finished('2026-10-19') } };
    expect(parseDailyStore(JSON.parse(JSON.stringify(roundTrip)))).toEqual(roundTrip);
  });
});
