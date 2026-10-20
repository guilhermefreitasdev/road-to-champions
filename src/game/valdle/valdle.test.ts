import { describe, expect, it } from 'vitest';
import agentDetailsJson from '../../data/game/agent-details.json';
import { mapMedia } from '../../data/media';
import { seriesComps } from '../../data/real/comps';
import { SERIES } from '../../data/real/series';
import { addDays } from '../daily/calendar';
import { AGENT_ORIGINS, AGENT_COLUMNS, CLASSIC_GAPS, WEAPON_COLUMNS, askableCallouts, calloutLabel } from './classic';
import { classicData, classicDaily, classicFree } from './classicIndex';
import { compareAll, exact, exactOr, numeric } from './feedback';
import { GROUP_GAMES, VALDLE_GAMES, VALDLE_LAUNCH, valdleNumber, type ValdleGameId } from './games';
import {
  answerBonus,
  answerOf,
  conexoesKey,
  emptyProgress,
  emptyStore,
  gameStats,
  giveUp,
  gradeCells,
  guess,
  guessConexoes,
  guessGrade,
  isDone,
  newFree,
  parseValdleStore,
  resultOf,
  settle,
  shareText,
  updateDaily,
  updateFree,
  type ValdlePuzzle,
} from './play';
import { CONEXOES_KINDS, GRADE_MIN_ANSWERS, PRO_GAPS, countPartitions, criterionKey, matches, proColumns, type Criterion } from './pro';
import { proDaily, proFree, proIndex } from './proIndex';

const DAYS = 365;
const dates = Array.from({ length: DAYS }, (_, i) => addDays(VALDLE_LAUNCH, i));
const daily = (game: ValdleGameId, date: string): ValdlePuzzle =>
  (GROUP_GAMES.classico.includes(game) ? classicDaily(game as 'agente', date) : proDaily(game as 'pro', date)) as ValdlePuzzle;
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

describe('feedback', () => {
  it('marks hits, partial hits and arrows toward the answer', () => {
    expect(exact('a', 'a')).toEqual({ mark: 'hit', arrow: null });
    expect(exact(null, null).mark).toBe('hit');
    expect(exactOr('x', 'y', () => true).mark).toBe('partial');
    expect(exactOr(null, 'y', () => true).mark).toBe('miss');
    expect(numeric(2021, 2023)).toEqual({ mark: 'miss', arrow: 'up' });
    expect(numeric(2024, 2023, 1)).toEqual({ mark: 'partial', arrow: 'down' });
    expect(numeric(null, 2023)).toEqual({ mark: 'miss', arrow: null });
  });
});

describe('jogo clássico data', () => {
  const data = classicData();

  it('derives every origin from a word of the official English bio', () => {
    for (const d of agentDetailsJson) {
      expect(Object.keys(AGENT_ORIGINS), `${d.name} needs a reviewed origin entry`).toContain(d.name);
      const o = AGENT_ORIGINS[d.name];
      if (o) expect(d.descriptionEn, d.name).toContain(o.keyword);
    }
    expect(data.agentById.get('Raze')?.origin).toBe('BR');
    expect(data.agentById.get('Omen')?.origin).toBeNull();
  });

  it('reads the starter flag, passives and VCT debut from the data', () => {
    const jett = data.agentById.get('Jett')!;
    expect(jett.starter).toBe(true);
    expect(jett.passive).toBe(true);
    expect(jett.vctYear).toBe(2021);
    expect(data.agentById.get('Omen')!.starter).toBe(false);
    for (const a of data.agents) expect(a.vctYear === null || (a.vctYear >= 2021 && a.vctYear <= 2026)).toBe(true);
  });

  it('has the buyable weapons with their real stats', () => {
    expect(data.weapons.length).toBeGreaterThanOrEqual(18);
    const vandal = data.weaponById.get('Vandal')!;
    expect(vandal).toMatchObject({ category: 'Rifle', cost: 2900, magazine: 25, headDamage: 160, automatic: true, penetration: 2 });
    expect(data.weaponById.get('Sheriff')!.automatic).toBe(false);
    expect(compareAll(WEAPON_COLUMNS, vandal, vandal).every((f) => f.mark === 'hit')).toBe(true);
  });

  it('names callouts uniquely within a map, with positions on the minimap', () => {
    for (const m of data.maps) {
      expect(new Set(m.callouts.map((c) => c.id)).size, m.id).toBe(m.callouts.length);
      expect(new Set(m.callouts.map(calloutLabel)).size, m.id).toBe(m.callouts.length);
      expect(askableCallouts(m).length, m.id).toBeGreaterThanOrEqual(10);
      expect(mapMedia(m.id), `${m.id} local image`).toBeTruthy();
    }
  });

  it('compares agents column by column', () => {
    const raze = data.agentById.get('Raze')!;
    const reyna = data.agentById.get('Reyna')!;
    const f = compareAll(AGENT_COLUMNS, reyna, raze);
    expect(f[0]!.mark).toBe('hit'); // both duelists
    expect(f[1]!.mark).toBe('partial'); // Mexico vs Brazil: both Americas
  });
});

describe.each(['agente', 'habilidade', 'mapa', 'callout', 'arma', 'pro', 'grade', 'conexoes', 'comp'] as ValdleGameId[])('%s daily puzzles', (game) => {
  const puzzles = dates.map((d) => daily(game, d));

  it('are numbered from the launch and deterministic', () => {
    expect(puzzles[0]!.number).toBe(1);
    expect(puzzles[9]!.number).toBe(valdleNumber(dates[9]!));
    expect(JSON.stringify(daily(game, dates[200]!))).toBe(JSON.stringify(puzzles[200]));
    expect(() => daily(game, addDays(VALDLE_LAUNCH, -1))).toThrow();
  });

  it('are valid and unambiguous for a year', () => {
    const problems = puzzles.flatMap((p) => problemsOf(p).map((x) => `${p.id}: ${x}`));
    expect(problems).toEqual([]);
  });

  it('do not repeat an answer too soon', () => {
    const gap = GAPS[game];
    const keyOf = KEYS[game];
    for (let i = 0; i < puzzles.length; i++) {
      for (let k = Math.max(0, i - gap); k < i; k++) expect(keyOf(puzzles[k]!), `${puzzles[i]!.id} repeats ${puzzles[k]!.id}`).not.toBe(keyOf(puzzles[i]!));
    }
  });

  it('free mode is seeded and valid', () => {
    const free = (seed: string) => (GROUP_GAMES.classico.includes(game) ? classicFree(game as 'agente', seed) : proFree(game as 'pro', seed)) as ValdlePuzzle;
    expect(JSON.stringify(free('abc'))).toBe(JSON.stringify(free('abc')));
    for (const seed of ['a', 'b', 'c', 'd', 'e']) expect(problemsOf(free(seed))).toEqual([]);
  });
});

const GAPS: Record<ValdleGameId, number> = {
  agente: CLASSIC_GAPS.agente,
  habilidade: CLASSIC_GAPS.habilidade,
  mapa: CLASSIC_GAPS.mapa,
  callout: 60,
  arma: CLASSIC_GAPS.arma,
  pro: 120,
  grade: 120,
  conexoes: 120,
  comp: 120,
};
const KEYS: Record<ValdleGameId, (p: ValdlePuzzle) => string> = {
  agente: answerOf,
  habilidade: (p) => `${answerOf(p)}:${(p as ValdlePuzzle<'habilidade'>).slot}`,
  mapa: answerOf,
  callout: (p) => `${(p as ValdlePuzzle<'callout'>).map}:${answerOf(p)}`,
  arma: answerOf,
  pro: answerOf,
  grade: (p) => [...(p as ValdlePuzzle<'grade'>).rows, ...(p as ValdlePuzzle<'grade'>).cols].map(criterionKey).sort().join('|'),
  conexoes: (p) => (p as ValdlePuzzle<'conexoes'>).groups.map((g) => conexoesKey(g.players)).sort().join('|'),
  comp: (p) => String((p as ValdlePuzzle<'comp'>).seriesId),
};

/** Re-derives every answer from the data instead of trusting the generators. */
function problemsOf(p: ValdlePuzzle): string[] {
  const out: string[] = [];
  const c = classicData();
  switch (p.game) {
    case 'agente':
      if (!c.agentById.has(answerOf(p))) out.push('unknown agent');
      break;
    case 'habilidade': {
      const h = p as ValdlePuzzle<'habilidade'>;
      const ab = c.agentById.get(h.agent)?.abilities.find((a) => a.slot === h.slot);
      if (!ab || !ab.icon || h.slot === 'Passive') out.push('ability without icon');
      if (!ab?.description) out.push('ability without description');
      break;
    }
    case 'mapa': {
      const m = p as ValdlePuzzle<'mapa'>;
      if (!c.mapById.has(m.map) || !mapMedia(m.map)) out.push('map without image');
      if (m.focus.x < 0.2 || m.focus.x > 0.8 || m.focus.y < 0.2 || m.focus.y > 0.8) out.push('focus off the image');
      break;
    }
    case 'callout': {
      const k = p as ValdlePuzzle<'callout'>;
      const map = c.mapById.get(k.map);
      if (!map || !askableCallouts(map).some((x) => x.id === k.callout)) out.push('callout not askable');
      break;
    }
    case 'arma':
      if (!c.weaponById.has(answerOf(p))) out.push('unknown weapon');
      break;
    case 'pro': {
      const f = proIndex().facts.get(answerOf(p));
      if (!f) out.push('unknown player');
      else {
        if (proIndex().data.dupNorms.has(f.norm)) out.push('answer shares its handle');
        if (!f.country || !f.region || !f.topAgent || f.intlFirstYear === null) out.push('a column is unknown');
      }
      break;
    }
    case 'grade': {
      const g = p as ValdlePuzzle<'grade'>;
      const idx = proIndex();
      const keys = [...g.rows, ...g.cols].map(criterionKey);
      if (new Set(keys).size !== 6) out.push('repeated criterion');
      g.rows.forEach((r, i) =>
        g.cols.forEach((col, j) => {
          const truth = [...idx.facts.values()].filter((f) => matches(f, r) && matches(f, col)).map((f) => f.id).sort();
          const listed = [...g.answers[i * 3 + j]!].sort();
          if (truth.length < GRADE_MIN_ANSWERS) out.push(`cell ${i},${j} has ${truth.length} answers`);
          if (JSON.stringify(truth) !== JSON.stringify(listed)) out.push(`cell ${i},${j} answers differ`);
        }),
      );
      break;
    }
    case 'conexoes': {
      const k = p as ValdlePuzzle<'conexoes'>;
      const idx = proIndex();
      const ids = k.groups.flatMap((g) => g.players);
      if (k.groups.length !== 4 || ids.length !== 16 || new Set(ids).size !== 16) out.push('not 16 distinct players in 4 groups');
      if (JSON.stringify([...k.order].sort()) !== JSON.stringify([...ids].sort())) out.push('order is not the 16 players');
      for (const g of k.groups) {
        if (!(CONEXOES_KINDS as readonly string[]).includes(g.criterion.kind)) out.push('unexpected kind');
        for (const id of g.players) {
          const f = idx.facts.get(id)!;
          if (idx.data.dupNorms.has(f.norm)) out.push(`${f.handle} shares a handle`);
          if (!matches(f, g.criterion)) out.push(`${f.handle} does not fit ${criterionKey(g.criterion)}`);
          if (k.groups.some((o) => o !== g && matches(f, o.criterion))) out.push(`${f.handle} fits two groups`);
        }
      }
      // Uniqueness over every fact of the kinds the game uses, recomputed here.
      const chosen = ids.map((id) => idx.facts.get(id)!);
      const crit = new Map<string, Criterion>();
      for (const f of chosen) {
        for (const team of f.teams) crit.set(`team:${team}`, { kind: 'team', team });
        if (f.country) crit.set(`country:${f.country}`, { kind: 'country', country: f.country });
        for (const event of f.wins) crit.set(`won:${event}`, { kind: 'won', event });
        if (f.topAgent) crit.set(`agent:${f.topAgent}`, { kind: 'agent', agent: f.topAgent });
      }
      const sets = [...crit.values()].map((cr) => chosen.filter((f) => matches(f, cr)).map((f) => f.id)).filter((s) => s.length >= 4);
      if (countPartitions(ids, sets, 3) !== 1) out.push('more than one solution');
      break;
    }
    case 'comp': {
      const k = p as ValdlePuzzle<'comp'>;
      const idx = proIndex();
      const s = SERIES.find((x) => x.id === k.seriesId);
      const comps = seriesComps().get(k.seriesId)?.[k.mapIndex];
      if (!s || !comps) {
        out.push('series or comp missing');
        break;
      }
      const side = idx.familyOf(s.teams[0].teamId) === k.team.key ? 0 : 1;
      if (idx.familyOf(s.teams[side].teamId) !== k.team.key) out.push('team not in the series');
      if (JSON.stringify([...comps[side]]) !== JSON.stringify(k.agents)) out.push('comp differs from the data');
      if (s.maps[k.mapIndex]?.map !== k.map) out.push('map differs');
      // No other team played those five agents on that map at that event.
      const owners = new Set<string>();
      for (const x of SERIES.filter((y) => y.eventId === k.eventId)) {
        x.maps.forEach((m, i) => {
          const cc = seriesComps().get(x.id)?.[i];
          if (!cc || m.map !== k.map) return;
          ([0, 1] as const).forEach((sd) => {
            if (cc[sd].join() === k.agents.join()) owners.add(idx.familyOf(x.teams[sd].teamId));
          });
        });
      }
      if (owners.size !== 1) out.push(`comp used by ${owners.size} teams at the event`);
      break;
    }
  }
  return out;
}

describe('pro index', () => {
  it('builds the Pro Clássico columns from the pool facts', () => {
    const idx = proIndex();
    const cols = proColumns(idx);
    const p = daily('pro', VALDLE_LAUNCH);
    const f = idx.facts.get(answerOf(p))!;
    expect(compareAll(cols, f, f).every((x) => x.mark === 'hit')).toBe(true);
    expect(cols.map((c) => c.label)).toContain('Agente nº 1');
  });

  it('counts partitions exactly', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    expect(countPartitions(ids, [['a', 'b', 'c', 'd'], ['e', 'f', 'g', 'h']])).toBe(1);
    expect(countPartitions(ids, [['a', 'b', 'c', 'd', 'e'], ['e', 'f', 'g', 'h'], ['a', 'f', 'g', 'h'], ['b', 'c', 'd', 'e']])).toBe(2);
    expect(PRO_GAPS.pro).toBeGreaterThan(100);
  });
});

describe('playing', () => {
  it('plays a guess game to a win and to a loss', () => {
    const p = daily('agente', VALDLE_LAUNCH);
    const answer = answerOf(p);
    const wrong = classicData().agents.map((a) => a.id).filter((id) => id !== answer);
    let g = emptyProgress();
    g = guess(p, g, wrong[0]!).progress;
    expect(guess(p, g, wrong[0]!).outcome).toBe('repeat');
    const won = guess(p, g, answer);
    expect(won.outcome).toBe('hit');
    expect(isDone('agente', p, won.progress)).toBe(true);
    expect(resultOf(p, won.progress)).toMatchObject({ won: true, tries: 2 });
    let lost = emptyProgress();
    for (const id of wrong.slice(0, VALDLE_GAMES.agente.maxTries)) lost = guess(p, lost, id).progress;
    expect(isDone('agente', p, lost)).toBe(true);
    expect(resultOf(p, lost).won).toBe(false);
    expect(guess(p, lost, answer).outcome).toBe('over');
  });

  it('asks the Habilidade bonus after the agent part', () => {
    const p = daily('habilidade', VALDLE_LAUNCH) as ValdlePuzzle<'habilidade'>;
    let g = answerBonus(p, emptyProgress(), p.slot);
    expect(g.bonus).toBeUndefined();
    g = guess(p, g, p.agent).progress;
    g = answerBonus(p, g, p.slot);
    expect(resultOf(p, g).bonus).toBe(true);
    expect(answerBonus(p, g, 'Ultimate').bonus).toBe(p.slot);
  });

  it('fills the Grade 3x3, one player per cell and never twice', () => {
    const p = daily('grade', VALDLE_LAUNCH) as ValdlePuzzle<'grade'>;
    let g = emptyProgress();
    const used = new Set<string>();
    for (let cell = 0; cell < 9; cell++) {
      const id = p.answers[cell]!.find((x) => !used.has(x))!;
      used.add(id);
      const r = guessGrade(p, g, cell, id);
      expect(r.outcome).toBe('hit');
      g = r.progress;
    }
    expect(gradeCells(p, g).every(Boolean)).toBe(true);
    expect(resultOf(p, g)).toMatchObject({ won: true, score: 9 });
    const empty = emptyProgress();
    const first = guessGrade(p, empty, 0, p.answers[0]![0]!).progress;
    expect(guessGrade(p, first, 0, p.answers[0]![1]!).outcome).toBe('filled');
    const other = p.answers.findIndex((a, i) => i > 0 && a.includes(p.answers[0]![0]!));
    if (other > 0) expect(guessGrade(p, first, other, p.answers[0]![0]!).outcome).toBe('used');
  });

  it('plays Conexões with mistakes and one-away', () => {
    const p = daily('conexoes', VALDLE_LAUNCH) as ValdlePuzzle<'conexoes'>;
    const [g0, g1] = p.groups;
    const mixed = [...g0!.players.slice(0, 3), g1!.players[0]!];
    let g = emptyProgress();
    const r = guessConexoes(p, g, mixed);
    expect(r.outcome).toBe('miss');
    expect(r.oneAway).toBe(true);
    g = r.progress;
    for (const grp of p.groups) g = guessConexoes(p, g, grp.players).progress;
    expect(resultOf(p, g)).toMatchObject({ won: true, score: 4, tries: 1 });
    const text = shareText(p, settle(p, g, VALDLE_LAUNCH));
    expect(text).toContain('4/4 grupos · 1 erro');
    expect(text).not.toMatch(EMOJI);
  });

  it('settles daily puzzles into the store, with streaks and a spoiler-free share text', () => {
    let store = emptyStore();
    for (const [i, d] of dates.slice(0, 3).entries()) {
      const p = daily('mapa', d);
      store = updateDaily(store, p, (g) => guess(p, g, i === 1 ? 'Nope' : answerOf(p)).progress, d);
      if (i === 1) for (let k = 0; k < 6; k++) store = updateDaily(store, p, (g) => guess(p, g, `x${k}`).progress, d);
    }
    const stats = gameStats(store, 'mapa', dates[2]!);
    expect(stats).toMatchObject({ played: 3, won: 2, streak: 1, bestStreak: 1 });
    const p0 = daily('mapa', dates[0]!);
    const text = shareText(p0, store.daily.mapa![dates[0]!]!);
    expect(text).toContain('Valdle Mapa #1');
    expect(text).not.toContain(answerOf(p0));
    expect(text).not.toMatch(EMOJI);
    expect(parseValdleStore(JSON.parse(JSON.stringify(store)))).toEqual(store);
    expect(parseValdleStore({ v: 2 })).toEqual(emptyStore());
    expect(parseValdleStore({ v: 1, daily: { agente: { 'bad-day': {} } }, free: { nope: {} } })).toEqual({ v: 1, daily: { agente: {} }, free: {} });
  });

  it('counts free puzzles once and keeps the open one', () => {
    const p = classicFree('arma', 'seed-1');
    let store = newFree(emptyStore(), 'arma', p.id);
    store = updateFree(store, p, (g) => guess(p, g, answerOf(p)).progress, VALDLE_LAUNCH);
    store = updateFree(store, p, (g) => g, VALDLE_LAUNCH);
    expect(store.free.arma).toMatchObject({ seed: 'seed-1', played: 1, won: 1 });
    store = newFree(store, 'arma', 'seed-2');
    expect(store.free.arma).toMatchObject({ seed: 'seed-2', played: 1, won: 1, progress: { guesses: [] } });
    expect(shareText(p, store.free.arma!.progress)).toContain('Modo livre');
    expect(giveUp(emptyProgress()).gaveUp).toBe(true);
  });
});

describe('callout schematic', () => {
  it('gives every callout a cell that holds it', async () => {
    const { voronoiCells, contains } = await import('./geometry');
    for (const m of classicData().maps) {
      const cells = voronoiCells(m.callouts);
      m.callouts.forEach((c, i) => {
        expect(cells[i]!.length, `${m.id} ${c.id}`).toBeGreaterThanOrEqual(3);
        expect(contains(cells[i]!, c), `${m.id} ${c.id}`).toBe(true);
      });
    }
  });
});
