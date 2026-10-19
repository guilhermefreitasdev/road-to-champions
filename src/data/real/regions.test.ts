/**
 * Regions of the real pool. REAL_REPORT=1 prints rosters per region and year:
 *   REAL_REPORT=1 npx vitest run src/data/real/regions --silent=false
 */
import { describe, expect, it } from 'vitest';
import { rosterKey } from '../../engine/roster';
import { REGIONS, type Region } from '../../engine/types';
import type { VlrEventData } from './cards';
import { ALL_ROSTERS, REAL_ROSTERS, REGIONAL_ROSTERS, teamRegion } from './index';
import { COUNTRY_REGION, REGION_OVERRIDES, buildRegionIndex, regionFromCountry, teamIdResolver } from './regions';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const REPORT = env.REAL_REPORT === '1';

const files = import.meta.glob<VlrEventData>('./vlr/events/*.json', { eager: true, import: 'default' });
const EVENTS = Object.values(files);

describe('regions', () => {
  it('maps every country VLR prints in the standings, and has no override in use', () => {
    const countries = new Set(EVENTS.flatMap((e) => e.teams.map((t) => t.countryName ?? null)));
    for (const c of countries) {
      if (c === null) continue;
      expect(regionFromCountry(c), c).toBeDefined();
    }
    for (const v of Object.values(COUNTRY_REGION)) expect(REGIONS).toContain(v);
    expect(Object.keys(REGION_OVERRIDES)).toHaveLength(0);
  });

  it('gives every roster of both pools a region, consistent with teamRegion()', () => {
    expect(ALL_ROSTERS.length).toBe(REAL_ROSTERS.length + REGIONAL_ROSTERS.length);
    for (const r of ALL_ROSTERS) {
      expect(r.region, rosterKey(r)).toBeDefined();
      expect(REGIONS).toContain(r.region);
      expect(teamRegion(r.teamId, r.eventId), rosterKey(r)).toBe(r.region);
      expect(teamRegion(r.teamId, r.year), rosterKey(r)).toBeDefined();
      expect(r.tier).toBe(REGIONAL_ROSTERS.includes(r) ? 'regional' : 'international');
    }
    expect(teamRegion('nobody', 'champions-2022')).toBeUndefined();
  });

  it('uses the league a team played in that year, else its country (2021–22 sub-regions)', () => {
    const by = (teamId: string, eventId: string) => ALL_ROSTERS.find((r) => r.teamId === teamId && r.eventId === eventId)!.region;
    // Franchising era: league membership.
    expect(by('loud', 'champions-2023')).toBe('americas');
    expect(by('fnatic', 'masters-tokyo-2023')).toBe('emea');
    expect(by('paper-rex', 'champions-2023')).toBe('pacific');
    // Chinese teams at 2023 internationals: no China league yet → country.
    expect(by('edward-gaming', 'champions-2023')).toBe('china');
    // 2021–22: sub-region the team qualified from.
    expect(by('kr-esports', 'champions-2021')).toBe('americas'); // LATAM
    expect(by('gambit-esports', 'masters-berlin-2021')).toBe('emea'); // CIS
    expect(by('x10-esports', 'masters-reykjavik-2021')).toBe('pacific'); // SEA
    expect(by('edward-gaming', 'champions-2022')).toBe('china');
    // Year lookups prefer the league.
    expect(teamRegion('loud', 2023)).toBe('americas');
    expect(teamRegion('sentinels', 2021)).toBe('americas');
  });

  it('keeps international team ids as they were, even when a regional team shares the slug', () => {
    const resolve = teamIdResolver(EVENTS);
    const intl = teamIdResolver(EVENTS.filter((e) => e.tier !== 'regional'));
    for (const e of EVENTS.filter((x) => x.tier !== 'regional')) {
      for (const t of e.teams) expect(resolve(t)).toBe(intl(t));
    }
    // Synthetic: a regional-only team sharing a slug with an international one gets the suffix.
    const ev = (slug: string, tier: string, teams: { id: number; slug: string }[]): VlrEventData => ({
      slug,
      shortName: slug,
      year: 2024,
      tier,
      startDate: '2024-01-01',
      mapPool: [],
      teams: teams.map((t) => ({ ...t, name: t.slug, tag: null, played: true, placement: null, players: [] })),
      players: [],
      matches: [],
    });
    const r = teamIdResolver([ev('m', 'masters', [{ id: 1, slug: 'g2' }]), ev('r', 'regional', [{ id: 2, slug: 'g2' }, { id: 3, slug: 'kc' }])]);
    expect(r({ id: 1, slug: 'g2' })).toBe('g2');
    expect(r({ id: 2, slug: 'g2' })).toBe('g2-2');
    expect(r({ id: 3, slug: 'kc' })).toBe('kc');
    const idx = buildRegionIndex([
      { ...ev('m', 'masters', [{ id: 1, slug: 'g2' }]), teams: [{ id: 1, slug: 'g2', name: 'G2', tag: null, played: true, placement: null, players: [], countryName: 'Europe' }] },
      { ...ev('r', 'regional', [{ id: 1, slug: 'g2' }]), region: 'americas' },
    ]);
    expect(idx.teamRegion('g2', 'r')).toBe('americas');
    expect(idx.teamRegion('g2', 'm')).toBe('americas'); // league of the year beats the country
    expect(idx.teamRegion('g2', 2024)).toBe('americas');
  });

  it('prints rosters per region and year with REAL_REPORT=1', () => {
    if (!REPORT) return;
    const years = [...new Set(ALL_ROSTERS.map((r) => r.year))].sort();
    const lines = ['pool        year  ' + REGIONS.map((r) => r.padStart(9)).join('')];
    for (const [label, pool] of [
      ['intl', REAL_ROSTERS],
      ['regional', REGIONAL_ROSTERS],
    ] as const) {
      for (const y of years) {
        const rows = pool.filter((r) => r.year === y);
        if (!rows.length) continue;
        const count = (reg: Region) => rows.filter((r) => r.region === reg).length;
        lines.push(`${label.padEnd(11)} ${y}  ${REGIONS.map((r) => String(count(r)).padStart(9)).join('')}`);
      }
    }
    console.log(lines.join('\n'));
  });
});
