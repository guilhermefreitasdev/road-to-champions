import { describe, expect, it } from 'vitest';
import {
  agentSlug,
  aggregateAgentStats,
  classifyEvent,
  classifyEventTitle,
  classifyRegionalTitle,
  isShowmatch,
  parseAgentsPageMaps,
  parseDateRange,
  parseEventPage,
  parseMatchMapStats,
  parseMatchPage,
  parsePlacement,
  parseStatsPage,
  parseStatsStageGroups,
  shortEventName,
  slimEvent,
  slugify,
  splitVeto,
} from '../../../../scripts/vlr/parse.mjs';
import eventFixture from '../../../../scripts/vlr/__fixtures__/event-1015.html?raw';
import statsFixture from '../../../../scripts/vlr/__fixtures__/event-stats-1015.html?raw';
import matchFixture from '../../../../scripts/vlr/__fixtures__/match-130685.html?raw';
import matchMapsFixture from '../../../../scripts/vlr/__fixtures__/match-maps-130685.html?raw';
import { AGENTS, MAPS } from '../../game';
import index from './events.json';
import slim from './slim.json';

const AGENT_BY_SLUG = Object.fromEntries(AGENTS.map((a) => [agentSlug(a.name), a.name]));

describe('vlr parsers (fixtures)', () => {
  it('parses the event stats table, mapping agent slugs to our names', () => {
    const rows = parseStatsPage(statsFixture, AGENT_BY_SLUG);
    expect(rows.map((r) => r.handle)).toEqual(['kiNgg', 'pANcada', 'Melser']);
    const kingg = rows[0]!;
    expect(kingg).toMatchObject({
      playerId: 8549,
      teamTag: 'LEV',
      country: 'cl',
      maps: 8,
      rounds: 179,
      rating: 1.31,
      acs: 261,
      kd: 1.36,
      kast: 77,
      adr: 160.9,
      kpr: 0.89,
      apr: 0.3,
      fkPct: 23,
      fdPct: 12,
      hsPct: 23,
      clutchPct: 11,
      clutches: '2/18',
      clutchesWon: 2,
      clutchesPlayed: 18,
      k: 159,
      d: 117,
      a: 53,
      fk: 42,
      fd: 21,
    });
    expect(kingg.agents).toEqual([
      { agent: 'Raze', pct: 50 },
      { agent: 'KAY/O', pct: 25 },
      { agent: 'Viper', pct: 25 },
    ]);
    expect(kingg.agentsHidden).toBe(0);
    // VLR shows the top 3 agents plus "+N"; the hidden ones are counted, never guessed.
    expect(rows[1]!.agentsHidden).toBe(2);
    expect(rows[2]!.agents.map((a) => a.agent)).toEqual(['Omen', 'Astra', 'Sage']);
  });

  it('flags unknown agent slugs instead of dropping them', () => {
    const rows = parseStatsPage(statsFixture, {});
    expect(rows[0]!.agents[0]!.agent).toBe('unknown:raze');
  });

  it('parses the event page header, stages, standings and rosters', () => {
    const page = parseEventPage(eventFixture);
    expect(page.title).toBe('Valorant Champions 2022');
    expect(page.datesText).toBe('Aug 31 – Sep 19, 2022');
    expect(page.location).toBe('İstanbul, Türkiye');
    expect(page.locationCountry).toBe('tr');
    expect(page.stages.map((s) => [s.title, s.active])).toEqual([
      ['Playoffs', true],
      ['Group Stage', false],
    ]);
    expect(page.standings[0]).toMatchObject({ placeText: '1st', place: { min: 1, max: 1 }, teamId: 6961, name: 'LOUD' });
    expect(page.rosters[0]!.teamId).toBe(2359);
    expect(page.rosters[0]!.players).toHaveLength(5);
    expect(page.rosters[0]!.players[0]).toEqual({ id: 1311, handle: 'Melser', country: 'cl' });
  });

  it('parses a match page: teams, score, maps and the raw veto', () => {
    const m = parseMatchPage(matchFixture);
    expect(m.date).toBe('2022-09-18');
    expect(m.patch).toBe('5.04');
    expect(m.teams).toEqual([
      { id: 6961, name: 'LOUD', players: [] },
      { id: 8127, name: 'OpTic Gaming', players: [] },
    ]);
    expect(m.score).toEqual([3, 1]);
    expect(m.maps).toEqual([
      { gameId: 95131, map: 'Ascent', score: [15, 13], pickedBy: 1 },
      { gameId: 95132, map: 'Bind', score: [6, 13], pickedBy: 2 },
    ]);
    expect(m.vetoRaw).toBe(
      'LOUD ban Pearl; LOUD ban Fracture; LOUD pick Ascent; OPTC pick Bind; LOUD pick Breeze; OPTC pick Haven; Icebox remains',
    );
    expect(m.veto).toHaveLength(7);
    expect(m.veto![6]).toBe('Icebox remains');
  });

  it('reads the series scoreboard: player ids and tags per team, in header order', () => {
    const row = (id: number, handle: string, tag: string) =>
      `<div class="ovw-row"><div class="ovw-cell mod-player"><div class="ovw-player"><a href="/player/${id}/${handle.toLowerCase()}">
        <div class="ovw-player-name text-of">${handle}</div><div class="ovw-player-tag ge-text-light">${tag}</div></a></div></div></div>`;
    const html = `<div class="match-header-vs"><a class="match-header-link mod-1" href="/team/8185/kiwoom-drx"><div class="wf-title-med">DRX</div></a>
      <a class="match-header-link mod-2" href="/team/8304/talon"><div class="wf-title-med">TALON</div></a></div>
      <div class="vm-stats-game" data-game-id="all"><div class="ovw-table"><div class="ovw-row mod-head"></div>${row(485, 'stax', 'KRX')}${row(4462, 'MaKo', 'KRX')}</div>
      <div class="ovw-table">${row(3977, 'Crws', 'TLN')}</div></div>
      <div class="vm-stats-game" data-game-id="1"><div class="ovw-table">${row(999, 'nope', 'X')}</div></div>`;
    const m = parseMatchPage(html);
    expect(m.teams).toEqual([
      { id: 8185, name: 'DRX', players: [{ id: 485, handle: 'stax', tag: 'KRX' }, { id: 4462, handle: 'MaKo', tag: 'KRX' }] },
      { id: 8304, name: 'TALON', players: [{ id: 3977, handle: 'Crws', tag: 'TLN' }] },
    ]);
  });

  it('reads the per-map scoreboards: agent and the map\'s Rating, ACS, K/D/A per player, rounds from the score', () => {
    const m = parseMatchMapStats(matchMapsFixture, AGENT_BY_SLUG);
    expect(m.eventId).toBe(1015);
    expect(m.date).toBe('2022-09-18');
    expect(m.maps).toHaveLength(1);
    const ascent = m.maps[0]!;
    expect(ascent).toMatchObject({ gameId: 95131, map: 'Ascent', rounds: 28 });
    expect(ascent.players).toEqual([
      { playerId: 659, handle: 'Sacy', side: 1, agent: 'Sova', rating: 1.83, acs: 313, k: 32, d: 15, a: 14 },
      { playerId: 683, handle: 'pANcada', side: 1, agent: 'Omen', rating: 1.02, acs: 179, k: 18, d: 19, a: 12 },
      { playerId: 817, handle: 'FiNESSE', side: 2, agent: 'Killjoy', rating: 1.11, acs: 218, k: 20, d: 20, a: 8 },
      { playerId: 881, handle: 'yay', side: 2, agent: 'Jett', rating: 1.03, acs: 247, k: 27, d: 23, a: 0 },
    ]);
  });

  it('per-map scoreboards: no guesses for odd rows (two icons, unknown slug, missing numbers or score)', () => {
    const cell = (col: string, v: string) => `<div class="ovw-cell" data-col="${col}"><span class="stats-sq"><span class="side mod-both">${v}</span></span></div>`;
    const row = (id: number, icons: string[], rating: string) =>
      `<div class="ovw-row"><div class="ovw-cell mod-player"><a href="/player/${id}/p${id}"><div class="ovw-player-name">p${id}</div></a></div>
       <div class="ovw-cell mod-agents">${icons.map((i) => `<img src="/img/vlr/game/agents/${i}.png">`).join('')}</div>
       ${cell('rating2', rating)}${cell('acs', '')}</div>`;
    const html = `<div class="vm-stats-game" data-game-id="all"><div class="ovw-table">${row(9, ['jett'], '9.99')}</div></div>
      <div class="vm-stats-game" data-game-id="7"><div class="vm-stats-game-header"><div class="team"><div class="score">13</div></div>
      <div class="map"><div class="map-name">Lotus</div></div><div class="team"><div class="score"></div></div></div>
      <div class="ovw-table"><div class="ovw-row mod-head"></div>${row(1, ['jett', 'raze'], '1.10')}${row(2, ['newagent'], '')}</div>
      <div class="ovw-table">${row(3, [], '0.90')}</div></div>`;
    const m = parseMatchMapStats(html, AGENT_BY_SLUG);
    expect(m.eventId).toBeNull();
    expect(m.maps).toEqual([
      {
        gameId: 7,
        map: 'Lotus',
        rounds: null,
        players: [
          { playerId: 1, handle: 'p1', side: 1, agent: null, rating: 1.1, acs: null, k: null, d: null, a: null },
          { playerId: 2, handle: 'p2', side: 1, agent: 'unknown:newagent', rating: null, acs: null, k: null, d: null, a: null },
          { playerId: 3, handle: 'p3', side: 2, agent: null, rating: 0.9, acs: null, k: null, d: null, a: null },
        ],
      },
    ]);
  });

  it('aggregates maps into playerId → year → agent, rating and ACS weighted by rounds, agents by maps', () => {
    const p = (playerId: number, agent: string | null, rating: number | null, acs: number | null, k: number | null, d: number | null) =>
      ({ playerId, handle: `p${playerId}`, side: 1 as const, agent, rating, acs, k, d, a: 0 });
    const out = aggregateAgentStats(
      [
        { year: 2024, maps: [{ gameId: 1, map: 'Bind', rounds: 20, players: [p(5, 'Jett', 1.2, 250, 20, 10), p(6, 'Sova', 1, 200, 15, 15)] }] },
        { year: 2024, maps: [{ gameId: 2, map: 'Lotus', rounds: 30, players: [p(5, 'Jett', 0.7, 150, 10, 20), p(6, null, 1, 1, 1, 1)] }] },
        { year: 2024, maps: [{ gameId: 3, map: 'Split', rounds: 24, players: [p(5, 'Raze', null, null, null, null)] }] },
        { year: 2023, maps: [{ gameId: 4, map: 'Pearl', rounds: 26, players: [p(5, 'unknown:x', 1, 1, 1, 1), p(7, 'Omen', 1, 1, 1, 1)] }] },
      ],
      (id) => id !== 7,
    );
    expect(Object.keys(out)).toEqual(['5', '6']);
    expect(out['5']).toEqual({
      2024: {
        Jett: { maps: 2, rounds: 50, rating: 0.9, acs: 190, k: 30, d: 30 },
        Raze: { maps: 1, rounds: 24, rating: null, acs: null, k: null, d: null },
      },
    });
    expect(out['6']).toEqual({ 2024: { Sova: { maps: 1, rounds: 20, rating: 1, acs: 200, k: 15, d: 15 } } });
  });

  it('classifies regional league stages (and leaves qualifiers, Challengers and the Evolution Series out)', () => {
    expect(classifyRegionalTitle('Champions Tour 2023: Americas League')).toEqual({ year: 2023, region: 'americas', stage: 'league' });
    expect(classifyRegionalTitle('Champions Tour 2024: EMEA Kickoff')).toEqual({ year: 2024, region: 'emea', stage: 'kickoff' });
    expect(classifyRegionalTitle('VCT 2025: Pacific Stage 2')).toEqual({ year: 2025, region: 'pacific', stage: 'stage2' });
    expect(classifyRegionalTitle('VCT 2026: China Stage 1')).toEqual({ year: 2026, region: 'china', stage: 'stage1' });
    for (const t of [
      'Champions Tour 2023: Americas Last Chance Qualifier',
      'Champions Tour 2023: Champions China Qualifier',
      'Champions Tour EMEA Stage 2: Challengers',
      'China Evolution Series 2026: Act 3',
      'Champions Tour 2024: Pacific Ascension',
      'Valorant Champions 2025',
    ]) {
      expect(classifyRegionalTitle(t), t).toBeNull();
    }
    expect(classifyEvent('VCT 2025: Pacific Stage 2')).toEqual({ tier: 'regional', region: 'pacific', stage: 'stage2' });
    expect(classifyEvent('Valorant Champions 2025')).toEqual({ tier: 'champions', region: null, stage: null });
    expect(classifyEvent('China Evolution Series: Epilogue')).toBeNull();
    expect(shortEventName('VCT 2025: Pacific Stage 2', 'regional', 2025, { region: 'pacific', stage: 'stage2' })).toBe('Pacific Stage 2 2025');
    expect(slugify(shortEventName('Champions Tour 2023: Americas League', 'regional', 2023, { region: 'americas', stage: 'league' }))).toBe(
      'americas-league-2023',
    );
  });

  it('reads stage groups (for the showmatch exclude filter) and the agents-page map list', () => {
    const html = `<div class="st-ss-group"><div class="st-ss-lbl"><span>Playoffs</span></div>
      <input type="checkbox" class="st-ss" value="1"><input type="checkbox" class="st-ss" value="2"></div>
      <div class="st-ss-group"><div class="st-ss-lbl"><span>Showmatch</span></div><input type="checkbox" class="st-ss" value="9"></div>`;
    expect(parseStatsStageGroups(html)).toEqual([
      { label: 'Playoffs', values: ['1', '2'] },
      { label: 'Showmatch', values: ['9'] },
    ]);
    expect(isShowmatch('Showmatch')).toBe(true);
    expect(isShowmatch('Upper Final')).toBe(false);
    const agents = `<table><tr class="pr-global-row mod-all"><td></td><td>86</td></tr>
      <tr class="pr-global-row "><td><span class="map-pseudo-icon">A</span> Ascent </td><td class="mod-right">17</td></tr></table>`;
    expect(parseAgentsPageMaps(agents)).toEqual([{ map: 'Ascent', played: 17 }]);
  });

  it('handles small helpers', () => {
    expect(parseDateRange('Aug 31 – Sep 19, 2022')).toEqual({ start: '2022-08-31', end: '2022-09-19' });
    expect(parseDateRange('May 24 – 30, 2021')).toEqual({ start: '2021-05-24', end: '2021-05-30' });
    expect(parseDateRange('Dec 28, 2021 – Jan 2, 2022')).toEqual({ start: '2021-12-28', end: '2022-01-02' });
    expect(parseDateRange('')).toEqual({ start: null, end: null });
    expect(parsePlacement('5th–6th')).toEqual({ min: 5, max: 6 });
    expect(splitVeto('Some note')).toBeNull();
    expect(classifyEventTitle('Valorant Champions 2022')).toBe('champions');
    expect(classifyEventTitle('Valorant Champions Tour Stage 2: Masters Reykjavík')).toBe('masters');
    expect(classifyEventTitle('Champions Tour 2023: LOCK//IN São Paulo')).toBe('masters');
    expect(classifyEventTitle('Valorant Masters Toronto 2025')).toBe('masters');
    expect(classifyEventTitle('Champions Tour LATAM Stage 1: Masters')).toBeNull();
    expect(classifyEventTitle('Champions Tour 2023: Americas Last Chance Qualifier')).toBeNull();
    expect(shortEventName('Champions Tour 2023: LOCK//IN São Paulo', 'masters', 2023)).toBe('LOCK//IN São Paulo 2023');
    expect(slugify('Masters Reykjavík 2021')).toBe('masters-reykjavik-2021');
  });
});

// ---------------------------------------------------------------------------------------------
// Validation of the generated snapshot (src/data/real/vlr/events/*.json)

interface Team {
  id: number;
  name: string | null;
  played: boolean;
  placement: { text: string; min: number; max: number } | null;
  players: { playerId: number; rounds: number | null; main: boolean }[];
}
interface Player {
  playerId: number;
  handle: string;
  teamId: number;
  agents: { agent: string; pct: number | null }[];
  rounds: number | null;
  rating: number | null;
  acs: number | null;
  kd: number | null;
  kast: number | null;
  adr: number | null;
  kpr: number | null;
  apr: number | null;
  fkPct: number | null;
  fdPct: number | null;
  hsPct: number | null;
  clutchPct: number | null;
  clutchesWon: number | null;
  clutchesPlayed: number | null;
  k: number | null;
  d: number | null;
  a: number | null;
  fk: number | null;
  fd: number | null;
}
interface VlrEvent {
  id: number;
  slug: string;
  tier: string;
  region: string | null;
  stage: string | null;
  year: number;
  startDate: string | null;
  endDate: string | null;
  source: { urls: string[]; fetchedAt: string | null };
  mapPool: { map: string; played: number | null }[];
  teams: Team[];
  players: Player[];
  matches: { teams: { id: number | null }[]; maps: { map: string | null }[]; veto: string[] | null }[];
}

const files = import.meta.glob<VlrEvent>('./events/*.json', { eager: true, import: 'default' });
const EVENTS = Object.values(files);
const AGENT_NAMES = new Set(AGENTS.map((a) => a.name));
const MAP_NAMES = new Set(MAPS.map((m) => m.name));

const RANGES: [keyof Player, number, number][] = [
  ['rating', 0, 3],
  ['acs', 0, 500],
  ['kd', 0, 5],
  ['kast', 0, 100],
  ['adr', 0, 300],
  ['kpr', 0, 2],
  ['apr', 0, 2],
  ['fkPct', 0, 100],
  ['fdPct', 0, 100],
  ['hsPct', 0, 100],
  ['clutchPct', 0, 100],
];

const INTERNATIONAL = EVENTS.filter((e) => e.tier !== 'regional');
const REGIONAL = EVENTS.filter((e) => e.tier === 'regional');

describe('vlr snapshot', () => {
  it('has one file per index entry, all completed VCT events (international or regional league stages)', () => {
    expect(EVENTS.length).toBe(index.events.length);
    expect(INTERNATIONAL.length).toBeGreaterThanOrEqual(15);
    for (const e of index.events) expect(files[`./${e.file}`]).toBeDefined();
    for (const e of EVENTS) {
      expect(['masters', 'champions', 'regional']).toContain(e.tier);
      expect(e.year).toBeGreaterThanOrEqual(2021);
      expect(e.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.source.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.source.urls.every((u) => u.startsWith('https://www.vlr.gg/'))).toBe(true);
      if (e.tier === 'regional') {
        expect(['americas', 'emea', 'pacific', 'china']).toContain(e.region);
        expect(['league', 'kickoff', 'stage1', 'stage2']).toContain(e.stage);
        expect(e.slug).toBe(`${e.region}-${e.stage!.replace(/(\d)$/, '-$1')}-${e.year}`);
      } else {
        expect(e.region).toBeNull();
        expect(e.stage).toBeNull();
      }
    }
    const idx = new Map(index.events.map((e) => [e.slug, e]));
    for (const e of EVENTS) expect(idx.get(e.slug), e.slug).toMatchObject({ tier: e.tier, region: e.region, stage: e.stage, year: e.year });
  });

  it('bundles slim.json: exactly slimEvent() of every full file (main players only, builder fields only)', () => {
    expect(slim.length).toBe(EVENTS.length);
    const bySlug = new Map(slim.map((e) => [e.slug, e]));
    for (const e of EVENTS) {
      const s = bySlug.get(e.slug)!;
      expect(s, e.slug).toEqual(slimEvent(e));
      expect(s.players.length).toBe(e.teams.reduce((n, t) => n + t.players.filter((p) => p.main).length, 0));
      expect(Object.keys(s.players[0] ?? {})).not.toContain('kd');
    }
  });

  it('has every regional league stage 2023–2025 (3 leagues in 2023, then Kickoff/Stage 1/Stage 2 × 4 regions), one per key', () => {
    const keys = new Set(REGIONAL.map((e) => `${e.region}:${e.stage}:${e.year}`));
    expect(keys.size).toBe(REGIONAL.length);
    for (const r of ['americas', 'emea', 'pacific']) expect(keys.has(`${r}:league:2023`), r).toBe(true);
    for (const y of [2024, 2025]) {
      for (const r of ['americas', 'emea', 'pacific', 'china']) {
        for (const s of ['kickoff', 'stage1', 'stage2']) expect(keys.has(`${r}:${s}:${y}`), `${r} ${s} ${y}`).toBe(true);
      }
    }
    // A league stage has its whole league: 10 teams in 2023, 11–12 afterwards (16 in the 2026 Stage 2, which
    // opened with a play-in for Challengers teams), 5 main players each.
    for (const e of REGIONAL) {
      const played = e.teams.filter((t) => t.played);
      expect(played.length, e.slug).toBeGreaterThanOrEqual(e.year === 2023 ? 10 : 11);
      expect(played.length, e.slug).toBeLessThanOrEqual(16);
      expect(e.teams.filter((t) => t.placement?.min === 1), e.slug).toHaveLength(1);
      expect(e.players.length, e.slug).toBeGreaterThanOrEqual(5 * played.length);
    }
  });

  it.each(EVENTS.map((e) => [e.slug, e] as const))('%s: teams and rosters are complete', (_, e) => {
    const played = e.teams.filter((t) => t.played);
    expect(played.length).toBeGreaterThanOrEqual(8);
    for (const t of played) {
      expect(t.players.filter((p) => p.main)).toHaveLength(5);
      for (const p of t.players) expect(p.rounds).toBeGreaterThan(0);
    }
    for (const t of e.teams.filter((x) => !x.played)) expect(t.players).toHaveLength(0);
    const teamIds = new Set(e.teams.map((t) => t.id));
    for (const p of e.players) expect(teamIds.has(p.teamId)).toBe(true);
  });

  it.each(EVENTS.map((e) => [e.slug, e] as const))('%s: player numbers are in sane ranges', (_, e) => {
    for (const p of e.players) {
      expect(p.rounds, p.handle).toBeGreaterThan(0);
      for (const [key, min, max] of RANGES) {
        const v = p[key] as number | null;
        if (v === null) continue;
        expect(v, `${p.handle} ${String(key)}`).toBeGreaterThanOrEqual(min);
        expect(v, `${p.handle} ${String(key)}`).toBeLessThanOrEqual(max);
      }
      for (const key of ['k', 'd', 'a', 'fk', 'fd'] as const) {
        expect(Number.isInteger(p[key] ?? 0), `${p.handle} ${key}`).toBe(true);
      }
      if (p.clutchesWon !== null && p.clutchesPlayed !== null) {
        expect(p.clutchesWon).toBeLessThanOrEqual(p.clutchesPlayed);
      }
      expect(p.agents.length).toBeGreaterThan(0);
      for (const a of p.agents) expect(AGENT_NAMES.has(a.agent), `${p.handle} ${a.agent}`).toBe(true);
    }
  });

  it.each(EVENTS.map((e) => [e.slug, e] as const))('%s: map pool uses known maps', (_, e) => {
    expect(e.mapPool.length).toBeGreaterThanOrEqual(5);
    for (const m of e.mapPool) expect(MAP_NAMES.has(m.map), m.map).toBe(true);
    const pool = new Set(e.mapPool.map((m) => m.map));
    for (const match of e.matches) {
      for (const g of match.maps) expect(pool.has(g.map ?? ''), `${g.map}`).toBe(true);
      for (const t of match.teams) expect(e.teams.some((x) => x.id === t.id)).toBe(true);
    }
  });
});
