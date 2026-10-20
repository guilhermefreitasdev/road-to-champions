import { describe, expect, it } from 'vitest';
import agentDetailsJson from '../../data/game/agent-details.json';
import { mapMedia } from '../../data/media';
import { seriesComps } from '../../data/real/comps';
import { SERIES } from '../../data/real/series';
import { addDays } from '../daily/calendar';
import placesJson from '../../data/game/places.json';
import {
  ABILITY_TILES,
  ABILITY_TILES_OPEN,
  AGENT_ORIGINS,
  AGENT_COLUMNS,
  CLASSIC_GAPS,
  WEAPON_COLUMNS,
  abilityTiles,
  askableCallouts,
  calloutLabel,
  calloutLabelEn,
  mapaMaps,
  mapaPlaces,
} from './classic';
import { classicData, classicDaily } from './classicIndex';
import { labelOverlap, spreadLabels } from './geometry';
import { chipShortLabels, mapaView } from './mapaView';
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
  guessSpot,
  MAPA_SPOT_TRIES,
  mapaStepOneDone,
  guessConexoes,
  guessGrade,
  isDone,
  parseValdleStore,
  resultOf,
  settle,
  shareText,
  updateDaily,
  type ValdlePuzzle,
} from './play';
import { CONEXOES_KINDS, GRADE_MIN_ANSWERS, PRO_GAPS, countPartitions, criterionKey, matches, proColumns, type Criterion } from './pro';
import { proDaily, proIndex } from './proIndex';

const DAYS = 365;
const dates = Array.from({ length: DAYS }, (_, i) => addDays(VALDLE_LAUNCH, i));
const daily = (game: ValdleGameId, date: string): ValdlePuzzle =>
  (GROUP_GAMES.classico.includes(game) ? classicDaily(game as 'agente', date) : proDaily(game as 'pro', date)) as ValdlePuzzle;
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

// Node built-ins without @types/node (tsconfig types are vite/client only): vitest runs on Node >= 22.
const proc = (globalThis as { process?: { getBuiltinModule(id: string): unknown; cwd(): string } }).process!;
const fs = proc.getBuiltinModule('node:fs') as { existsSync(p: string): boolean; statSync(p: string): { size: number } };
const PUBLIC = `${proc.cwd()}/public`;

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

  it('reads the wiki screenshots of the Mapa game, under names that give nothing away', () => {
    expect(data.places.length).toBe(placesJson.places.length);
    expect(mapaPlaces(data).length).toBeGreaterThanOrEqual(200);
    const maps = new Set(mapaPlaces(data).map((p) => p.map));
    expect(maps.size).toBeGreaterThanOrEqual(12);
    expect(maps.has('Summit')).toBe(false); // no screenshots: the game skips it
    for (const p of data.places) {
      expect(p.file, p.id).toMatch(/^media\/places\/[0-9a-f]{12}\.webp$/);
      expect(fs.existsSync(`${PUBLIC}/${p.file}`), p.file).toBe(true);
      expect(fs.statSync(`${PUBLIC}/${p.file}`).size, p.file).toBeLessThan(120_000);
      expect(p.source, p.id).toMatch(/^https:\/\/wiki\.playvalorant\.com\//);
    }
    expect(new Set(data.places.map((p) => p.file)).size).toBe(data.places.length);
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

  if (game === 'mapa')
    it('do not repeat a screenshot for months', () => {
      const keyOf = (p: ValdlePuzzle) => `${answerOf(p)}:${(p as ValdlePuzzle<'mapa'>).place}`;
      for (let i = 0; i < puzzles.length; i++) {
        for (let k = Math.max(0, i - CLASSIC_GAPS.mapaPlace); k < i; k++) expect(keyOf(puzzles[k]!), `${puzzles[i]!.id} repeats ${puzzles[k]!.id}`).not.toBe(keyOf(puzzles[i]!));
      }
      expect(new Set(puzzles.map((p) => answerOf(p))).size).toBeGreaterThanOrEqual(12);
    });

  it('do not repeat an answer too soon', () => {
    const gap = GAPS[game];
    const keyOf = KEYS[game];
    for (let i = 0; i < puzzles.length; i++) {
      for (let k = Math.max(0, i - gap); k < i; k++) expect(keyOf(puzzles[k]!), `${puzzles[i]!.id} repeats ${puzzles[k]!.id}`).not.toBe(keyOf(puzzles[i]!));
    }
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
      const place = c.placeById.get(`${m.map}:${m.place}`);
      const map = c.mapById.get(m.map);
      if (!map || !place) out.push('no screenshot of that place');
      else {
        if (!fs.existsSync(`${PUBLIC}/${place.file}`)) out.push('screenshot file missing');
        if (!askableCallouts(map).some((x) => x.id === m.place)) out.push('place not askable');
      }
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
      const p = daily('arma', d);
      store = updateDaily(store, p, (g) => guess(p, g, i === 1 ? 'Nope' : answerOf(p)).progress, d);
      if (i === 1) for (let k = 0; k < 6; k++) store = updateDaily(store, p, (g) => guess(p, g, `x${k}`).progress, d);
    }
    const stats = gameStats(store, 'arma', dates[2]!);
    expect(stats).toMatchObject({ played: 3, won: 2, streak: 1, bestStreak: 1 });
    const p0 = daily('arma', dates[0]!);
    const text = shareText(p0, store.daily.arma![dates[0]!]!);
    expect(text).toContain('Valdle Arma #1');
    expect(text).not.toContain(answerOf(p0));
    expect(text).not.toMatch(EMOJI);
    expect(parseValdleStore(JSON.parse(JSON.stringify(store)))).toEqual(store);
    expect(parseValdleStore({ v: 2 })).toEqual(emptyStore());
    expect(parseValdleStore({ v: 1, daily: { agente: { 'bad-day': {} } }, free: { nope: {} } })).toEqual({ v: 1, daily: { agente: {} } });
  });

  it('plays Mapa in two steps: the map, then where the screenshot is', () => {
    const p = daily('mapa', VALDLE_LAUNCH) as ValdlePuzzle<'mapa'>;
    const map = classicData().mapById.get(p.map)!;
    const answer = map.callouts.find((x) => x.id === p.place)!;
    const wrongMap = classicData().maps.find((m) => m.id !== p.map)!.id;
    const sameRegion = map.callouts.find((x) => x.id !== p.place && x.superRegionEn === answer.superRegionEn)!;
    let g = emptyProgress();
    expect(guessSpot(p, g, p.place).outcome).toBe('over'); // step 2 waits for step 1
    g = guess(p, g, wrongMap).progress;
    g = guess(p, g, p.map).progress;
    expect(mapaStepOneDone(p, g)).toBe(true);
    expect(isDone('mapa', p, g)).toBe(false);
    const miss = guessSpot(p, g, sameRegion.id);
    expect(miss.outcome).toBe('miss');
    expect(guessSpot(p, miss.progress, sameRegion.id).outcome).toBe('repeat');
    const hit = guessSpot(p, miss.progress, p.place);
    expect(hit.outcome).toBe('hit');
    expect(isDone('mapa', p, hit.progress)).toBe(true);
    const done = settle(p, hit.progress, VALDLE_LAUNCH);
    expect(done.result).toMatchObject({ won: true, tries: 2, place: 2 });
    const text = shareText(p, done);
    expect(text.split('\n').slice(1)).toEqual(['Mapa em 2/5 · Lugar em 2/3', 'Mapa: - V', 'Lugar: P V', 'V certo · P mesma região · - errado']);
    for (const name of [map.name, map.id, answer.region, answer.regionEn, calloutLabel(answer), calloutLabelEn(answer)]) expect(text).not.toContain(name);
    expect(text).not.toMatch(EMOJI);

    // Lost map: step 2 still opens; three misses end it.
    let lost = emptyProgress();
    for (const m of classicData().maps.filter((x) => x.id !== p.map).slice(0, VALDLE_GAMES.mapa.maxTries)) lost = guess(p, lost, m.id).progress;
    expect(mapaStepOneDone(p, lost)).toBe(true);
    for (const c of map.callouts.filter((x) => x.id !== p.place).slice(0, MAPA_SPOT_TRIES)) lost = guessSpot(p, lost, c.id).progress;
    expect(isDone('mapa', p, lost)).toBe(true);
    expect(resultOf(p, lost)).toMatchObject({ won: false, place: 0 });
    expect(shareText(p, lost)).toContain('Mapa: não acertou · Lugar: não acertou');
    expect(isDone('mapa', p, giveUp(emptyProgress()))).toBe(true);
  });

  it('drops Mapa progress saved on the old puzzle shape, keeping everything else', () => {
    const old = {
      v: 1,
      daily: { mapa: { [VALDLE_LAUNCH]: { guesses: ['Bind'], finishedOn: VALDLE_LAUNCH, result: { won: true, tries: 1, score: 1, max: 5 } } }, arma: { [VALDLE_LAUNCH]: { guesses: ['Vandal'] } } },
      free: { mapa: { seed: 'abc', progress: { guesses: ['Bind', 'Lotus'] }, played: 4, won: 3 } },
    };
    const store = parseValdleStore(old);
    expect(store.daily.mapa).toEqual({});
    expect(store.daily.arma![VALDLE_LAUNCH]!.guesses).toEqual(['Vandal']);
    expect(store).not.toHaveProperty('free'); // the removed free mode: ignored on load
    const p = daily('mapa', VALDLE_LAUNCH) as ValdlePuzzle<'mapa'>;
    const next = updateDaily(store, p, (g) => guess(p, g, p.map).progress, VALDLE_LAUNCH);
    expect(next.daily.mapa![VALDLE_LAUNCH]).toMatchObject({ guesses: [p.map], shape: 2 });
    expect(parseValdleStore(JSON.parse(JSON.stringify(next)))).toEqual(next);
    expect(gameStats(next, 'mapa', VALDLE_LAUNCH).placeFound).toBe(0);
  });

  it('loads saves from the free-mode days, keeping the dailies and dropping the free part', () => {
    const p = daily('arma', VALDLE_LAUNCH);
    const old = {
      v: 1,
      daily: { arma: { [VALDLE_LAUNCH]: { guesses: [answerOf(p)], finishedOn: VALDLE_LAUNCH, result: { won: true, tries: 1, score: 1, max: 6 } } } },
      free: { arma: { seed: 'seed-1', progress: { guesses: ['Vandal'] }, played: 3, won: 2 }, pro: { seed: 'x', progress: {}, played: 1, won: 0 } },
    };
    const store = parseValdleStore(old);
    expect(Object.keys(store)).toEqual(['v', 'daily']);
    expect(gameStats(store, 'arma', VALDLE_LAUNCH)).toMatchObject({ played: 1, won: 1, streak: 1 });
    expect(gameStats(store, 'arma', VALDLE_LAUNCH)).not.toHaveProperty('freePlayed');
    expect(shareText(p, store.daily.arma![VALDLE_LAUNCH]!)).not.toContain('livre');
    expect(giveUp(emptyProgress()).gaveUp).toBe(true);
  });

  it('keeps the map out of the Mapa view until step 1 ends, and the place until the end', () => {
    const data = classicData();
    for (const date of dates.slice(0, 30)) {
      const p = daily('mapa', date) as ValdlePuzzle<'mapa'>;
      const map = data.mapById.get(p.map)!;
      const answer = map.callouts.find((x) => x.id === p.place)!;
      const place = data.placeById.get(`${p.map}:${p.place}`)!;
      const wrong = mapaMaps(data).find((m) => m.id !== p.map)!;
      // Step 1, before and after a wrong map: only the buttons (every map with screenshots, alike) name maps.
      for (const g of [emptyProgress(), guess(p, emptyProgress(), wrong.id).progress]) {
        const v = mapaView(data, p, g);
        expect(v.step).toBe('map');
        expect(v.map).toBeNull();
        expect(v.chips).toEqual([]);
        expect(v.answer).toBeNull();
        expect(v.source).toBeNull();
        expect(v.image.alt).toBe('Lugar de um mapa');
        expect(v.choices.map((c) => c.id)).toEqual(mapaMaps(data).map((m) => m.id));
        const { choices, mapGuesses, ...rest } = v;
        const text = JSON.stringify(rest);
        for (const s of [map.name, map.id, map.minimap, place.source, calloutLabel(answer), calloutLabelEn(answer)]) expect(text, date).not.toContain(s);
        expect(mapGuesses.every((x) => !x.hit)).toBe(true);
        expect(choices.filter((c) => c.state === 'miss').length).toBe(g.guesses.length);
      }
      // Step 2: the map and one chip per callout, unnamed answer, no wiki link yet.
      const two = mapaView(data, p, guess(p, emptyProgress(), p.map).progress);
      expect(two.step).toBe('where');
      expect(two.map).toMatchObject({ id: p.map, won: true });
      expect(two.choices).toEqual([]);
      expect(two.chips.map((c) => c.id).sort()).toEqual(map.callouts.map((c) => c.id).sort());
      expect(two.chips.every((c) => c.state === 'open')).toBe(true);
      expect(two.answer).toBeNull();
      expect(two.source).toBeNull();
      expect(two.image.alt).not.toContain(calloutLabel(answer));
    }
  });

  it('marks the Mapa chips and reveals the place at the end', () => {
    const data = classicData();
    const p = daily('mapa', VALDLE_LAUNCH) as ValdlePuzzle<'mapa'>;
    const map = data.mapById.get(p.map)!;
    const answer = map.callouts.find((x) => x.id === p.place)!;
    let g = guess(p, emptyProgress(), p.map).progress;
    const far = [...map.callouts].sort((a, b) => Math.hypot(b.x - answer.x, b.y - answer.y) - Math.hypot(a.x - answer.x, a.y - answer.y))[0]!;
    g = guessSpot(p, g, far.id).progress;
    let v = mapaView(data, p, g);
    expect(v.chips.find((c) => c.id === far.id)!.state).toBe('miss');
    expect(v.spots).toEqual([expect.objectContaining({ id: far.id, hit: false, near: false, sameRegion: far.superRegionEn === answer.superRegionEn })]);
    g = guessSpot(p, g, p.place).progress;
    v = mapaView(data, p, g);
    expect(v.step).toBe('done');
    expect(v.chips.find((c) => c.id === p.place)!.state).toBe('hit');
    expect(v.answer).toEqual({ pt: calloutLabel(answer), en: calloutLabelEn(answer) });
    expect(v.source).toMatch(/^https:\/\//);
    const lost = mapaView(data, p, giveUp(guess(p, emptyProgress(), p.map).progress));
    expect(lost.chips.find((c) => c.id === p.place)!.state).toBe('answer');
    // Chips in reading order (the tab order), with compact names unique within the map.
    for (const m of mapaMaps(data)) {
      const short = chipShortLabels(m);
      for (const lang of ['pt', 'en'] as const) expect(new Set([...short.values()].map((x) => x[lang])).size, `${m.id} ${lang}`).toBe(m.callouts.length);
    }
    const rows = v.chips.map((c) => Math.round(c.y * 12));
    expect(rows).toEqual([...rows].sort((a, b) => a - b));
  });

  it('opens the Habilidade tiles one by one, seeded per day', () => {
    const p = daily('habilidade', VALDLE_LAUNCH);
    const steps = ABILITY_TILES_OPEN.map((_, miss) => abilityTiles(p, miss, false));
    expect(steps.map((s) => s.size)).toEqual([...ABILITY_TILES_OPEN]);
    expect(steps[0]!.size).toBe(1);
    for (let i = 1; i < steps.length; i++) for (const t of steps[i - 1]!) expect(steps[i]!.has(t)).toBe(true);
    expect(abilityTiles(p, VALDLE_GAMES.habilidade.maxTries, false).size).toBeLessThan(ABILITY_TILES);
    expect(abilityTiles(p, 0, true).size).toBe(ABILITY_TILES);
    expect([...abilityTiles(p, 2, false)]).toEqual([...abilityTiles(daily('habilidade', VALDLE_LAUNCH), 2, false)]);
    const firsts = new Set(dates.slice(0, 40).map((d) => [...abilityTiles(daily('habilidade', d), 0, false)][0]));
    expect(firsts.size).toBeGreaterThan(6);
  });
});

describe('label layout', () => {
  it('keeps every chip inside the stage and separates them', () => {
    const anchors = [
      { x: 50, y: 50 },
      { x: 52, y: 51 },
      { x: 50, y: 50 },
      { x: 2, y: 199 },
    ];
    const sizes = anchors.map(() => ({ w: 60, h: 24 }));
    const pos = spreadLabels(anchors, sizes, 200, 200);
    expect(labelOverlap(pos, sizes)).toBe(0);
    pos.forEach((p, i) => {
      expect(p.x - sizes[i]!.w / 2).toBeGreaterThanOrEqual(0);
      expect(p.x + sizes[i]!.w / 2).toBeLessThanOrEqual(200);
      expect(p.y - sizes[i]!.h / 2).toBeGreaterThanOrEqual(0);
      expect(p.y + sizes[i]!.h / 2).toBeLessThanOrEqual(200);
    });
    expect(JSON.stringify(spreadLabels(anchors, sizes, 200, 200))).toBe(JSON.stringify(pos));
  });

  it('fits the compact chips of every Mapa map on a phone-sized stage', () => {
    for (const m of mapaMaps(classicData())) {
      const short = chipShortLabels(m);
      const W = 358;
      const sizes = m.callouts.map((c) => ({ w: Math.min(96, short.get(c.id)!.pt.length * 5.6 + 12), h: 28 }));
      const pos = spreadLabels(m.callouts.map((c) => ({ x: c.x * W, y: c.y * W })), sizes, W, W);
      expect(labelOverlap(pos, sizes), m.id).toBeLessThan(150);
    }
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
