import { describe, expect, it } from 'vitest';
import {
  agentSlug,
  classifyEventTitle,
  isShowmatch,
  parseAgentsPageMaps,
  parseDateRange,
  parseEventPage,
  parseMatchPage,
  parsePlacement,
  parseStatsPage,
  parseStatsStageGroups,
  shortEventName,
  slugify,
  splitVeto,
} from '../../../../scripts/vlr/parse.mjs';
import eventFixture from '../../../../scripts/vlr/__fixtures__/event-1015.html?raw';
import statsFixture from '../../../../scripts/vlr/__fixtures__/event-stats-1015.html?raw';
import matchFixture from '../../../../scripts/vlr/__fixtures__/match-130685.html?raw';
import { AGENTS, MAPS } from '../../game';
import index from './events.json';

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
      { id: 6961, name: 'LOUD' },
      { id: 8127, name: 'OpTic Gaming' },
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

describe('vlr snapshot', () => {
  it('has one file per index entry, all completed international events', () => {
    expect(EVENTS.length).toBe(index.events.length);
    expect(EVENTS.length).toBeGreaterThanOrEqual(15);
    for (const e of index.events) expect(files[`./${e.file}`]).toBeDefined();
    for (const e of EVENTS) {
      expect(['masters', 'champions']).toContain(e.tier);
      expect(e.year).toBeGreaterThanOrEqual(2021);
      expect(e.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.source.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.source.urls.every((u) => u.startsWith('https://www.vlr.gg/'))).toBe(true);
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
