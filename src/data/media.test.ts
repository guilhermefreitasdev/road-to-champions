import { describe, expect, it } from 'vitest';
import { CURRENT_MAP_POOL, CURRENT_MAP_POOL_SOURCE } from './currentMapPool';
import { AGENTS, MAPS } from './game';
import { MEDIA_COUNTS, agentMedia, mapMedia, mediaUrl, playerMedia, teamMedia } from './media';
import { REAL_ROSTERS } from './real';
import gameMedia from './game/media.json';
import realMedia from './real/media.json';

// Node built-ins without @types/node (tsconfig types are vite/client only): vitest runs on Node >= 22.
const proc = (globalThis as { process?: { getBuiltinModule(id: string): unknown; cwd(): string } }).process!;
const fs = proc.getBuiltinModule('node:fs') as { existsSync(p: string): boolean; statSync(p: string): { size: number } };
const PUBLIC = `${proc.cwd()}/public`;

interface Meta {
  sourceUrl: string;
  credit: string;
}
const rows = <T extends Meta>(o: Record<string, T>, path: (v: T) => string) =>
  Object.entries(o).map(([k, v]) => [k, path(v), v] as const);

describe('media snapshot (public/media)', () => {
  it('has a local image for every competitive map and every agent', () => {
    for (const m of MAPS) expect(mapMedia(m.name)?.image, m.name).toMatch(/^media\/maps\/[a-z0-9-]+\.webp$/);
    for (const a of AGENTS) expect(agentMedia(a.name)?.icon, a.name).toMatch(/^media\/agents\/[a-z0-9-]+\.webp$/);
  });

  it('every referenced file exists, is small, and carries a Liquipedia source page and credit', () => {
    const all = [
      ...rows(gameMedia.maps, (v) => v.image),
      ...rows(gameMedia.agents, (v) => v.icon),
      ...rows(realMedia.teams, (v) => v.logo),
      ...rows(realMedia.players as Record<string, Meta & { photo: string }>, (v) => v.photo),
    ];
    expect(all.length).toBeGreaterThan(40);
    let total = 0;
    for (const [key, path, meta] of all) {
      const file = `${PUBLIC}/${path}`;
      expect(fs.existsSync(file), `${key}: ${path}`).toBe(true);
      const size = fs.statSync(file).size;
      expect(size, `${key}: ${path} too big`).toBeLessThan(120_000);
      total += size;
      expect(meta.sourceUrl).toMatch(/^https:\/\/liquipedia\.net\//);
      expect(meta.credit).toContain('CC-BY-SA');
    }
    expect(total).toBeLessThan(8 * 1024 * 1024);
  });

  it('team logos and player photos are keyed by the ids the cards use', () => {
    const rosterKeys = new Set(REAL_ROSTERS.map((r) => `${r.teamId}-${r.eventId}`));
    const teamIds = new Set(REAL_ROSTERS.map((r) => r.teamId));
    for (const key of Object.keys(realMedia.teams)) expect(rosterKeys.has(key) || teamIds.has(key), key).toBe(true);
    const playerKeys = new Set(REAL_ROSTERS.flatMap((r) => r.cards.flatMap((c) => [c.playerId, `${c.playerId}@${c.eventId}`])));
    for (const key of Object.keys(realMedia.players)) expect(playerKeys.has(key), key).toBe(true);
  });

  it('resolves era-specific media first, then the current one', () => {
    const era = Object.entries(realMedia.teams).find(([, v]) => v.eraSpecific);
    if (era) {
      const [key] = era;
      const r = REAL_ROSTERS.find((r) => `${r.teamId}-${r.eventId}` === key)!;
      expect(teamMedia(r.teamId, r.eventId)?.logo).toBe(era[1].logo);
    }
    expect(teamMedia('no-such-team', 'no-such-event')).toBeUndefined();
    expect(playerMedia('0', 'no-such-event')).toBeUndefined();
    expect(mediaUrl('media/maps/ascent.webp')).toMatch(/\/media\/maps\/ascent\.webp$/);
    expect(MEDIA_COUNTS.maps).toBe(MAPS.length);
  });
});

describe('CURRENT_MAP_POOL', () => {
  it('is 7 known maps from a dated Liquipedia revision', () => {
    expect(CURRENT_MAP_POOL).toHaveLength(7);
    expect(new Set(CURRENT_MAP_POOL).size).toBe(7);
    const known = new Set(MAPS.map((m) => m.name));
    for (const m of CURRENT_MAP_POOL) expect(known.has(m), m).toBe(true);
    expect(CURRENT_MAP_POOL_SOURCE.revisionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(CURRENT_MAP_POOL_SOURCE.revid).toBeGreaterThan(0);
  });
});
