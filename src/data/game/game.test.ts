import { describe, expect, it } from 'vitest';
import { SAMPLE_MAP_POOL } from '../mapPools';
import gameMediaJson from './game-media.json';
import { AGENTS, MAPS, agentByName, calloutToMinimap, mapByName } from './index';
import weaponsJson from './weapons.json';

const ROLES = ['duelist', 'initiator', 'controller', 'sentinel'];
const CORE_SLOTS = ['Grenade', 'Ability1', 'Ability2', 'Ultimate'];
const NON_COMPETITIVE = ['The Range', 'Basic Training', 'Gauntlet', 'District', 'Kasbah', 'Drift', 'Glitch', 'Piazza'];
const EPS = 0.02;

// Node built-ins without @types/node (tsconfig types are vite/client only): vitest runs on Node >= 22.
const proc = (globalThis as { process?: { getBuiltinModule(id: string): unknown; cwd(): string } }).process!;
const fs = proc.getBuiltinModule('node:fs') as { existsSync(p: string): boolean };
const PUBLIC = `${proc.cwd()}/public`;

describe('agents snapshot', () => {
  it('has a reasonable number of agents with unique names and uuids', () => {
    expect(AGENTS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(AGENTS.map((a) => a.name)).size).toBe(AGENTS.length);
    expect(new Set(AGENTS.map((a) => a.displayName)).size).toBe(AGENTS.length);
    expect(new Set(AGENTS.map((a) => a.uuid)).size).toBe(AGENTS.length);
  });

  it('is sorted by English name', () => {
    const names = AGENTS.map((a) => a.name);
    expect(names).toEqual([...names].sort());
  });

  it.each(AGENTS.map((a) => [a.name, a] as const))('%s has a valid role and abilities', (_, agent) => {
    expect(ROLES).toContain(agent.role);
    expect(agent.displayName).toBeTruthy();
    expect(agent.displayIcon).toMatch(/^https:\/\//);
    expect(agent.abilities.length).toBeGreaterThanOrEqual(4);
    for (const ab of agent.abilities) {
      expect(ab.name.trim()).not.toBe('');
      expect(ab.displayName.trim()).not.toBe('');
      expect(ab.name).not.toMatch(/\s{2,}|\n/);
    }
    // The four keybind abilities always exist and have icons (needed by the "guess the ability" mode).
    for (const slot of CORE_SLOTS) {
      const ab = agent.abilities.find((a) => a.slot === slot);
      expect(ab, `${agent.name} ${slot}`).toBeDefined();
      expect(ab?.displayIcon).toMatch(/^https:\/\//);
    }
  });

  it('covers every role', () => {
    for (const role of ROLES) expect(AGENTS.some((a) => a.role === role)).toBe(true);
  });

  it('looks up agents by English or pt-BR name', () => {
    expect(agentByName('jett')?.role).toBe('duelist');
    expect(agentByName('Omen')?.role).toBe('controller');
    expect(agentByName('nobody')).toBeUndefined();
  });
});

describe('maps snapshot', () => {
  it('keeps only standard competitive maps', () => {
    expect(MAPS.length).toBeGreaterThanOrEqual(7);
    expect(new Set(MAPS.map((m) => m.name)).size).toBe(MAPS.length);
    for (const name of NON_COMPETITIVE) expect(mapByName(name)).toBeUndefined();
    for (const m of MAPS) expect(m.name).not.toMatch(/^Skirmish/);
  });

  it('contains every map of SAMPLE_MAP_POOL', () => {
    for (const name of SAMPLE_MAP_POOL) expect(mapByName(name)?.name).toBe(name);
  });

  it.each(MAPS.map((m) => [m.name, m] as const))('%s has callouts that land inside the minimap', (_, map) => {
    expect(map.displayIcon).toMatch(/^https:\/\//);
    expect(map.splash).toMatch(/^https:\/\//);
    expect(map.xMultiplier).not.toBe(0);
    expect(map.yMultiplier).not.toBe(0);
    expect(map.callouts.length).toBeGreaterThanOrEqual(10);
    const supers = new Set<string>();
    for (const c of map.callouts) {
      expect(c.regionName.trim()).not.toBe('');
      expect(c.superRegionName.trim()).not.toBe('');
      expect(c.regionNameEn.trim()).not.toBe('');
      supers.add(c.superRegionNameEn);
      const p = calloutToMinimap(map, c);
      expect(p.x, `${c.superRegionNameEn} ${c.regionNameEn} x`).toBeGreaterThanOrEqual(-EPS);
      expect(p.x, `${c.superRegionNameEn} ${c.regionNameEn} x`).toBeLessThanOrEqual(1 + EPS);
      expect(p.y, `${c.superRegionNameEn} ${c.regionNameEn} y`).toBeGreaterThanOrEqual(-EPS);
      expect(p.y, `${c.superRegionNameEn} ${c.regionNameEn} y`).toBeLessThanOrEqual(1 + EPS);
    }
    expect(supers.has('A')).toBe(true);
    expect(supers.has('B')).toBe(true);
  });

  it('callouts are not all bunched up (spread across the minimap)', () => {
    for (const map of MAPS) {
      const pts = map.callouts.map((c) => calloutToMinimap(map, c));
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.4);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.4);
    }
  });
});

describe('local game media (game-media.json, npm run data:game-media)', () => {
  const kinds = ['minimaps', 'abilities', 'weapons'] as const;
  const sources: Record<(typeof kinds)[number], Set<string>> = {
    minimaps: new Set(MAPS.map((m) => m.displayIcon)),
    abilities: new Set(AGENTS.flatMap((a) => a.abilities.flatMap((ab) => (ab.displayIcon ? [ab.displayIcon] : [])))),
    weapons: new Set((weaponsJson as { displayIcon: string }[]).map((w) => w.displayIcon)),
  };
  const manifest = gameMediaJson as unknown as Record<(typeof kinds)[number], Record<string, { file: string; width: number; height: number }>>;

  it.each(kinds)('%s: every entry is a snapshot image with a WebP under public/media/<kind>/', (kind) => {
    for (const [url, entry] of Object.entries(manifest[kind])) {
      expect(sources[kind].has(url), url).toBe(true);
      expect(entry.file).toMatch(new RegExp(`^media/${kind}/[0-9a-f-]+\\.webp$`));
      expect(fs.existsSync(`${PUBLIC}/${entry.file}`), entry.file).toBe(true);
    }
  });

  it('minimaps keep the square framing of the callout coordinates', () => {
    for (const [url, entry] of Object.entries(manifest.minimaps)) {
      const map = MAPS.find((m) => m.displayIcon === url)!;
      expect(entry.file).toBe(`media/minimaps/${map.uuid}.webp`);
      expect(entry.width).toBe(entry.height);
    }
  });

  it('ability and weapon files never name what they show', () => {
    for (const kind of ['abilities', 'weapons'] as const) {
      for (const entry of Object.values(manifest[kind])) expect(entry.file).toMatch(/\/[0-9a-f]{12}\.webp$/);
    }
  });
});
