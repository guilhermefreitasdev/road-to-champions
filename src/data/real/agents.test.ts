/**
 * Per-agent stats (vlr/agent-stats.json, scripts/vlr/agents.mjs) and what the cards take from them: `agentPool`
 * and `flexRoles`. AGENTS_REPORT=1 prints coverage, the natural flex count and examples:
 *   AGENTS_REPORT=1 npx vitest run src/data/real/agents --silent=false
 */
import { describe, expect, it } from 'vitest';
import type { Role } from '../../engine/types';
import { AGENTS } from '../game';
import {
  AGENT_POOL_SIZE,
  AGENT_YEAR_MIN_MAPS,
  agentPoolFor,
  agentWindow,
  flexRolesFor,
  type AgentCell,
  type AgentStatsData,
  type VlrEventData,
} from './cards';
import { AGENT_STATS, ALL_ROSTERS } from './index';
import agentStatsJson from './vlr/agent-stats.json';
import slim from './vlr/slim.json';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const REPORT = env.AGENTS_REPORT === '1';

const ROLE_OF: Record<string, Role> = Object.fromEntries(AGENTS.map((a) => [a.name, a.role]));
const cards = ALL_ROSTERS.flatMap((r) => r.cards.map((card) => ({ card, roster: r })));

const cell = (maps: number, rating: number | null = 1, acs: number | null = 200, k: number | null = maps * 15, d: number | null = maps * 15): AgentCell => ({
  maps,
  rounds: maps * 22,
  rating,
  acs,
  k,
  d,
});

describe('agent pool and natural flex (synthetic data)', () => {
  const stats: AgentStatsData = {
    '1': {
      '2022': { Jett: cell(30, 1.2), Raze: cell(4, 0.9) },
      '2023': { Raze: cell(6, 1.1, 220, 90, 60), Sova: cell(1) },
      '2024': { Omen: cell(5), Sova: cell(5), Jett: cell(2) },
    },
  };

  it('uses the card\'s year when it has enough maps, else every year up to it; never a later year', () => {
    expect(agentWindow(stats, 1, 2022).window).toBe('year');
    expect([...agentWindow(stats, 1, 2022).cells.keys()]).toEqual(['Jett', 'Raze']);
    const y2023 = agentWindow(stats, 1, 2023); // 7 maps in 2023 < AGENT_YEAR_MIN_MAPS → 2022 + 2023
    expect(AGENT_YEAR_MIN_MAPS).toBe(8);
    expect(y2023.window).toBe('career');
    expect(y2023.cells.get('Raze')).toMatchObject({ maps: 10, rounds: 220 });
    expect(y2023.cells.get('Raze')!.rating).toBeCloseTo((0.9 * 88 + 1.1 * 132) / 220, 10);
    expect(y2023.cells.has('Omen')).toBe(false);
    expect(agentWindow(stats, 1, 2021)).toEqual({ window: 'none', cells: new Map() });
    expect(agentWindow(stats, 2, 2024).window).toBe('none');
    expect(agentWindow(undefined, 1, 2024).window).toBe('none');
  });

  it('lists the window\'s agents by maps (top 6), then the event\'s own agents, with rounded numbers or nulls', () => {
    const { cells } = agentWindow(stats, 1, 2023);
    const pool = agentPoolFor(cells, ['Raze', 'Neon'], ROLE_OF);
    expect(pool).toEqual([
      { agent: 'Jett', maps: 30, rating: 1.2, acs: 200, kd: 1 },
      { agent: 'Raze', maps: 10, rating: 1.02, acs: 212, kd: 1.25 },
      { agent: 'Sova', maps: 1, rating: 1, acs: 200, kd: 1 },
      { agent: 'Neon', maps: 0, rating: null, acs: null, kd: null },
    ]);
    const many = new Map(['Jett', 'Raze', 'Neon', 'Yoru', 'Phoenix', 'Reyna', 'Iso', 'Sova'].map((a, i) => [a, cell(10 - i)]));
    expect(agentPoolFor(many, ['Sova'], ROLE_OF).map((a) => a.agent)).toEqual(['Jett', 'Raze', 'Neon', 'Yoru', 'Phoenix', 'Reyna', 'Sova']);
    expect(AGENT_POOL_SIZE).toBe(6);
    expect(agentPoolFor(new Map([['Nobody', cell(9)]]), ['Jett'], ROLE_OF)).toEqual([
      { agent: 'Jett', maps: 0, rating: null, acs: null, kd: null },
    ]);
    expect(agentPoolFor(new Map([['Jett', cell(3, null, null, null, null)]]), [], ROLE_OF)).toEqual([
      { agent: 'Jett', maps: 3, rating: null, acs: null, kd: null },
    ]);
  });

  it('is a natural flex only with two roles at ≥ 25% of at least 8 maps; the card\'s role always first', () => {
    const cells = (m: Record<string, number>) => new Map(Object.entries(m).map(([a, n]) => [a, cell(n)]));
    expect(flexRolesFor(cells({ Jett: 6, Sova: 4 }), 'duelist', ROLE_OF)).toEqual(['duelist', 'initiator']);
    expect(flexRolesFor(cells({ Jett: 6, Sova: 4 }), 'initiator', ROLE_OF)).toEqual(['initiator', 'duelist']);
    expect(flexRolesFor(cells({ Jett: 8, Sova: 2 }), 'duelist', ROLE_OF)).toEqual(['duelist']); // 20%
    expect(flexRolesFor(cells({ Jett: 3, Sova: 1 }), 'duelist', ROLE_OF)).toEqual(['duelist']); // 4 maps: too few
    expect(flexRolesFor(cells({ Omen: 4, Viper: 3, Killjoy: 3, Sova: 2 }), 'controller', ROLE_OF)).toEqual(['controller', 'sentinel']);
    expect(flexRolesFor(cells({ Jett: 4, Sova: 4, Omen: 4 }), 'sentinel', ROLE_OF)).toEqual(['sentinel', 'duelist', 'initiator', 'controller']);
    expect(flexRolesFor(new Map(), 'controller', ROLE_OF)).toEqual(['controller']);
  });

  it('counts Viper as controller and sentinel (smoke + site anchor)', () => {
    const cells = (m: Record<string, number>) => new Map(Object.entries(m).map(([a, n]) => [a, cell(n)]));
    // A pure Viper player is a natural controller/sentinel flex.
    expect(flexRolesFor(cells({ Viper: 12 }), 'controller', ROLE_OF)).toEqual(['controller', 'sentinel']);
    // Viper maps lift the sentinel share above 25% even when the player also smokes on Omen.
    expect(flexRolesFor(cells({ Omen: 7, Viper: 3 }), 'controller', ROLE_OF)).toEqual(['controller', 'sentinel']);
    // Without Viper, an Omen/Astra player stays a pure controller.
    expect(flexRolesFor(cells({ Omen: 7, Astra: 3 }), 'controller', ROLE_OF)).toEqual(['controller']);
  });
});

describe('vlr/agent-stats.json', () => {
  const players = agentStatsJson.players as unknown as Record<string, Record<string, Record<string, AgentCell>>>;
  const mains = new Set((slim as VlrEventData[]).flatMap((e) => e.players.map((p) => String(p.playerId))));
  const cells = Object.entries(players).flatMap(([id, years]) =>
    Object.entries(years).flatMap(([year, agents]) => Object.entries(agents).map(([agent, c]) => ({ id, year: Number(year), agent, c }))),
  );

  it('covers the main players of the snapshot with hundreds of series and thousands of maps', () => {
    expect(agentStatsJson.source.series).toBeGreaterThanOrEqual(1100);
    expect(agentStatsJson.source.maps).toBeGreaterThanOrEqual(2900);
    expect(Object.keys(players).length).toBeGreaterThanOrEqual(600);
    for (const id of Object.keys(players)) expect(mains.has(id), id).toBe(true);
    expect(AGENT_STATS).toBe(agentStatsJson.players);
  });

  it('has known agents, years 2021+, sane numbers, agents ordered by maps', () => {
    for (const { id, year, agent, c } of cells) {
      const at = `${id}/${year}/${agent}`;
      expect(ROLE_OF[agent], at).toBeDefined();
      expect(year, at).toBeGreaterThanOrEqual(2021);
      expect(year, at).toBeLessThanOrEqual(2026);
      expect(Number.isInteger(c.maps) && c.maps >= 1, at).toBe(true);
      expect(c.rounds, at).toBeGreaterThanOrEqual(13 * c.maps);
      expect(c.rounds, at).toBeLessThanOrEqual(60 * c.maps);
      if (c.rating !== null) expect(c.rating >= 0 && c.rating <= 3, at).toBe(true);
      if (c.acs !== null) expect(c.acs >= 0 && c.acs <= 600, at).toBe(true);
      expect(c.k === null, at).toBe(c.d === null);
      if (c.k !== null) {
        expect(c.k, at).toBeLessThanOrEqual(c.rounds * 2);
        expect(c.d!, at).toBeLessThanOrEqual(c.rounds);
      }
    }
    for (const years of Object.values(players)) {
      for (const agents of Object.values(years)) {
        const maps = Object.values(agents).map((c) => c.maps);
        expect(maps).toEqual([...maps].sort((a, b) => b - a));
      }
    }
    // VLR publishes no Rating for the China league maps of 2024 to early 2025 (nor Masters Shanghai 2024): null there.
    expect(cells.filter((x) => x.c.rating !== null).length / cells.length).toBeGreaterThan(0.8);
    expect(cells.filter((x) => x.c.acs !== null && x.c.k !== null).length / cells.length).toBeGreaterThan(0.98);
  });
});

describe('cards: agentPool and flexRoles', () => {
  it('gives every card an agent pool (≥ 1 known agent, unique, real numbers or nulls)', () => {
    for (const { card } of cards) {
      const pool = card.agentPool!;
      expect(pool.length, card.id).toBeGreaterThanOrEqual(1);
      expect(pool.length, card.id).toBeLessThanOrEqual(AGENT_POOL_SIZE + 3);
      expect(new Set(pool.map((a) => a.agent)).size, card.id).toBe(pool.length);
      for (const a of pool) {
        expect(ROLE_OF[a.agent], `${card.id} ${a.agent}`).toBeDefined();
        expect(a.maps, card.id).toBeGreaterThanOrEqual(0);
        if (a.maps === 0) expect([a.rating, a.acs, a.kd], card.id).toEqual([null, null, null]);
        if (a.rating !== null) expect(a.rating >= 0 && a.rating <= 3, card.id).toBe(true);
      }
      // The event's own agents (VLR top 3) are always in the pool.
      for (const agent of card.agents) expect(pool.some((a) => a.agent === agent), `${card.id} ${agent}`).toBe(true);
    }
  });

  it('has per-map data for nearly every card', () => {
    const withMaps = (tier: string) => {
      const list = cards.filter((c) => c.roster.tier === tier);
      return list.filter((c) => c.card.agentPool!.some((a) => a.maps > 0)).length / list.length;
    };
    expect(withMaps('international')).toBeGreaterThan(0.98);
    expect(withMaps('regional')).toBeGreaterThan(0.98);
  });

  it('puts the card\'s role first in flexRoles, unique roles, and a plausible share of natural flexes', () => {
    for (const { card } of cards) {
      const roles = card.flexRoles!;
      expect(roles[0], card.id).toBe(card.role);
      expect(new Set(roles).size, card.id).toBe(roles.length);
    }
    const flex = cards.filter((c) => c.card.flexRoles!.length >= 2).length / cards.length;
    // 2026-10-20: 32% international, 33% regional (Viper players who also play sentinel are the largest group).
    expect(flex).toBeGreaterThan(0.15);
    expect(flex).toBeLessThan(0.45);
  });

  it('prints a report with AGENTS_REPORT=1', () => {
    if (!REPORT) return;
    const pct = (n: number, of: number) => `${n} (${((100 * n) / of).toFixed(1)}%)`;
    for (const tier of ['international', 'regional']) {
      const list = cards.filter((c) => c.roster.tier === tier);
      const windows = new Map<string, number>();
      for (const { card } of list) {
        const w = agentWindow(AGENT_STATS, card.playerId, ALL_ROSTERS.find((r) => r.eventId === card.eventId)!.year).window;
        windows.set(w, (windows.get(w) ?? 0) + 1);
      }
      const flex = list.filter((c) => c.card.flexRoles!.length >= 2);
      const withMaps = list.filter((c) => c.card.agentPool!.some((a) => a.maps > 0)).length;
      const size = list.reduce((s, c) => s + c.card.agentPool!.length, 0) / list.length;
      const pairs = new Map<string, number>();
      for (const { card } of flex) {
        const k = [...card.flexRoles!].sort().join('+');
        pairs.set(k, (pairs.get(k) ?? 0) + 1);
      }
      console.log(
        `${tier}: pool with map data ${pct(withMaps, list.length)}, mean pool size ${size.toFixed(1)}; flex by roles ${[...pairs].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`,
      );
      console.log(
        `${tier}: ${list.length} cards; window ${[...windows].map(([w, n]) => `${w} ${pct(n, list.length)}`).join(', ')}; natural flex ${pct(flex.length, list.length)}`,
      );
    }
    const share = (card: (typeof cards)[number]['card']) => {
      const { cells } = agentWindow(AGENT_STATS, card.playerId, ALL_ROSTERS.find((r) => r.eventId === card.eventId)!.year);
      const m: Record<string, number> = {};
      let total = 0;
      for (const [a, c] of cells) {
        m[ROLE_OF[a]!] = (m[ROLE_OF[a]!] ?? 0) + c.maps;
        total += c.maps;
      }
      return card.flexRoles!.map((r) => `${r} ${Math.round((100 * (m[r] ?? 0)) / total)}%`).join(' / ') + ` of ${total} maps`;
    };
    const intlFlex = cards.filter((c) => c.roster.tier === 'international' && c.card.flexRoles!.length >= 2);
    const seen = new Set<string>();
    for (const { card, roster } of intlFlex.sort((a, b) => b.card.ovr - a.card.ovr)) {
      if (seen.has(card.playerId) || seen.size >= 15) continue;
      seen.add(card.playerId);
      console.log(`  ${card.handle} @ ${roster.teamName}, ${roster.eventName} (OVR ${card.ovr}): ${share(card)}; ${card.agentPool!.map((a) => `${a.agent} ${a.maps}`).join(', ')}`);
    }
  });
});
