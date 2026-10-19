import { describe, expect, it } from 'vitest';
import { LIQUIPEDIA as data, type LiquipediaTeam } from './index';

// LIQUIPEDIA_REPORT=1 npx vitest run src/data/real/liquipedia  prints coverage numbers.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const REPORT = env.LIQUIPEDIA_REPORT === '1';
const teams: LiquipediaTeam[] = data.events.flatMap((e) => e.teams);
const pct = (n: number, d: number) => Math.round((100 * n) / d);

describe('liquipedia events.json', () => {
  it('has the international events with attribution', () => {
    expect(data.events.length).toBeGreaterThanOrEqual(15);
    expect(new Set(data.events.map((e) => e.id)).size).toBe(data.events.length);
    expect(data.source.license).toBe('CC-BY-SA 3.0');
    const sourceTitles = new Set(data.sources.map((s) => s.title));
    for (const e of data.events) {
      expect(e.liquipedia.title).toBeTruthy();
      expect(e.liquipedia.revid).toBeGreaterThan(0);
      expect(sourceTitles.has(e.liquipedia.title)).toBe(true);
    }
    for (const s of data.sources) expect(s.revid).toBeGreaterThan(0);
  });

  it.each(data.events.map((e) => [e.id, e] as const))('%s has ≥ 8 teams with full rosters', (_, e) => {
    expect(e.teams.length).toBeGreaterThanOrEqual(8);
    expect(new Set(e.teams.map((t) => t.name)).size).toBe(e.teams.length);
    for (const t of e.teams) {
      const starters = t.players.filter((p) => !p.isSub);
      expect(starters.length, `${e.id} ${t.name}`).toBeGreaterThanOrEqual(5);
      expect(new Set(t.players.map((p) => p.handle)).size, `${e.id} ${t.name} duplicate handle`).toBe(t.players.length);
    }
  });

  it('has a coach for most teams', () => {
    const withCoach = teams.filter((t) => t.coach).length;
    if (REPORT) console.log(`coach coverage: ${withCoach}/${teams.length} (${pct(withCoach, teams.length)}%)`);
    expect(withCoach / teams.length).toBeGreaterThan(0.9);
  });

  it('never has two IGLs, and the IGL is a player of the team', () => {
    for (const t of teams) {
      if (t.igl === null) {
        expect(['infobox-ambiguous', 'event-ambiguous', 'conflict', 'none']).toContain(t.iglSource);
        continue;
      }
      expect(['event-captain', 'squad-captain', 'infobox-unique']).toContain(t.iglSource);
      expect(t.players.filter((p) => p.handle === t.igl)).toHaveLength(1);
      expect('iglCandidates' in t).toBe(false);
    }
    if (REPORT) {
      const by: Record<string, number> = {};
      for (const t of teams) by[t.iglSource] = (by[t.iglSource] ?? 0) + 1;
      const known = teams.filter((t) => t.igl).length;
      console.log(`igl coverage: ${known}/${teams.length} (${pct(known, teams.length)}%)`, by);
    }
  });

  it('uses ISO alpha-2 flags and Liquipedia page ids for almost every player', () => {
    const players = teams.flatMap((t) => t.players);
    for (const p of players) if (p.flag !== null) expect(p.flag).toMatch(/^[A-Z]{2}$/);
    expect(players.filter((p) => p.flag).length / players.length).toBeGreaterThan(0.97);
    expect(players.filter((p) => p.liquipediaId).length / players.length).toBeGreaterThan(0.97);
  });
});
