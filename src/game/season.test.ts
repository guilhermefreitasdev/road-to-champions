import { describe, expect, it } from 'vitest';
import { ALL_ROSTERS, REGIONAL_ROSTERS } from '../data/real';
import { openSlots } from '../engine/draft';
import { rosterKey } from '../engine/roster';
import { REGIONS, type Region, type RosterEntry } from '../engine/types';
import { isVetoComplete, remainingMaps } from '../engine/veto';
import { seasonPlayerStats } from './stats';
import {
  CHAMPIONS_PER_REGION,
  LEAGUE_OPPONENTS,
  MASTERS_TEAMS,
  USER_ID,
  aiStrength,
  applyUserVeto,
  beginUserVeto,
  championsGroupViews,
  chooseRegion,
  createSeason,
  entrantName,
  fieldCandidates,
  fieldRosterFor,
  findSeasonMatch,
  leaguePlayoffCells,
  leagueViews,
  mastersCells,
  SEASON_MAP_POOL,
  SEASON_VERSION,
  parseSeason,
  seasonMapFamiliarity,
  pickSeasonCoach,
  pickSeasonPlayer,
  playUserMatch,
  regionOf,
  regionPool,
  regionPreview,
  rerollSeasonDraft,
  rollSeasonDraft,
  seasonCoachOptions,
  seasonDraftOptions,
  seasonEntrantTeam,
  seasonPath,
  seasonRolledRoster,
  seasonShareText,
  seasonSummary,
  seasonTeamInfo,
  setFieldMode,
  stageOutcome,
  startLeague,
  userPendingMatch,
  userSeasonResults,
  type FieldMode,
  type SeasonState,
} from './season';

/** The project has no Node types, hence the cast (as in balance.test.ts). */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

function autoDraft(s: SeasonState): SeasonState {
  let r = s;
  while (r.stage === 'draft' && r.draft!.phase !== 'coach') {
    if (r.draft!.phase === 'roll') r = rollSeasonDraft(r);
    const open = openSlots(r.draft!);
    // Greedy OVR drafter (as src/game/balance.test.ts): the best card whose role is open, else the best into flex.
    const options = [...seasonDraftOptions(r)].sort((x, y) => y.ovr - x.ovr);
    const card = options.find((c) => open.includes(c.role)) ?? options[0];
    if (!card) throw new Error('No card to pick');
    const slot = open.includes(card.role) ? card.role : open.includes('flex') ? 'flex' : open[0]!;
    r = pickSeasonPlayer(r, card.id, slot);
  }
  return pickSeasonCoach(r, seasonCoachOptions(r)[0]!.id);
}

function playOne(s: SeasonState): SeasonState {
  let r = beginUserVeto(s);
  while (!isVetoComplete(r.veto!.state)) r = applyUserVeto(r, remainingMaps(r.veto!.state)[0]!);
  return playUserMatch(r);
}

function fullSeason(seed: string, region: Region = 'americas', field: FieldMode = 'current', onStop?: (s: SeasonState) => void): SeasonState {
  let s = startLeague(autoDraft(chooseRegion(createSeason(seed), region, field)), 'Time Teste');
  for (let guard = 0; s.stage !== 'done'; guard++) {
    if (guard > 60) throw new Error('Season did not finish');
    onStop?.(s);
    s = playOne(s);
  }
  return s;
}

const byKey = new Map(ALL_ROSTERS.map((e) => [rosterKey(e), e]));
const rosterOf = (id: string): RosterEntry => byKey.get(id)!;

describe('field rosters', () => {
  it('fieldRosterFor picks the latest roster (current) or the strongest (prime), one per team', () => {
    const loud = ALL_ROSTERS.filter((e) => e.teamId === 'loud');
    const current = fieldRosterFor('loud', 'current')!;
    expect(current.year).toBe(Math.max(...loud.map((e) => e.year)));
    const prime = fieldRosterFor('loud', 'prime')!;
    expect(aiStrength(prime)).toBe(Math.max(...loud.map(aiStrength)));
    expect(fieldRosterFor('nope', 'current')).toBeUndefined();
  });

  it('breaks ties deterministically: the last roster of the latest year, the first of equal strength', () => {
    const [a, b] = ALL_ROSTERS.filter((e) => e.teamId === 'fnatic' && e.year === 2023);
    const pool = [a!, b!];
    expect(fieldRosterFor('fnatic', 'current', pool)).toBe(b);
    expect(fieldRosterFor('fnatic', 'current', [b!, a!])).toBe(a);
    const twin = { ...a!, eventId: 'twin', cards: a!.cards.map((c) => ({ ...c, id: `${c.id}-twin` })) };
    expect(fieldRosterFor('fnatic', 'prime', [a!, twin])).toBe(a);
  });

  it('every region has enough distinct teams, each with one candidate of its region', () => {
    for (const region of REGIONS) {
      const candidates = fieldCandidates(region, 'current');
      expect(candidates.length).toBeGreaterThanOrEqual(LEAGUE_OPPONENTS);
      expect(new Set(candidates.map((e) => e.teamId)).size).toBe(candidates.length);
      for (const e of candidates) expect(regionOf(e)).toBe(region);
      expect(regionPool(region).every((e) => e.region === region)).toBe(true);
      const prime = fieldCandidates(region, 'prime');
      expect(prime.map((e) => e.teamId)).toEqual(candidates.map((e) => e.teamId));
    }
    expect(REGIONAL_ROSTERS.length).toBeGreaterThan(0);
    const preview = regionPreview('emea');
    expect(preview.teams.length).toBe(6);
    expect(preview.teamCount).toBeGreaterThan(10);
  });

  it('entrantName shows the event only in Prime mode', () => {
    const e = fieldRosterFor('loud', 'prime')!;
    expect(entrantName(e, 'current')).toBe('LOUD');
    expect(entrantName(e, 'prime')).toBe(`LOUD · ${e.eventName}`);
  });
});

describe('region and draft', () => {
  it('rolls only rosters of the chosen region, with 3 rerolls', () => {
    let s = chooseRegion(createSeason('r1'), 'pacific');
    expect(s.stage).toBe('draft');
    expect(s.draft!.rerollsLeft).toBe(3);
    s = rollSeasonDraft(s);
    for (let i = 0; i < 3; i++) {
      expect(regionOf(seasonRolledRoster(s)!)).toBe('pacific');
      s = rerollSeasonDraft(s);
    }
    expect(seasonDraftOptions(s).length).toBeGreaterThan(0);
    expect(() => chooseRegion(s, 'emea')).toThrow(/stage/);
    expect(() => chooseRegion(createSeason('x'), 'moon' as Region)).toThrow(/Unknown region/);
  });

  it('locks the field mode once the league starts', () => {
    let s = chooseRegion(createSeason('f1'), 'emea', 'prime');
    expect(s.field).toBe('prime');
    s = setFieldMode(s, 'current');
    expect(s.field).toBe('current');
    const l = startLeague(autoDraft(s), 'X');
    expect(() => setFieldMode(l, 'prime')).toThrow(/locked/);
  });
});

describe('league', () => {
  it('fields the user + 11 distinct teams of the region with their field roster', () => {
    for (const field of ['current', 'prime'] as const) {
      const s = startLeague(autoDraft(chooseRegion(createSeason(`l-${field}`), 'china', field)), 'Dragões');
      expect(['league', 'done']).toContain(s.stage);
      const entrants = s.league!.entrants;
      expect(entrants).toHaveLength(12);
      expect(entrants.some((e) => e.id === USER_ID)).toBe(true);
      const opps = entrants.filter((e) => e.id !== USER_ID).map((e) => rosterOf(e.id));
      expect(new Set(opps.map((e) => e.teamId)).size).toBe(LEAGUE_OPPONENTS);
      for (const e of opps) {
        expect(regionOf(e)).toBe('china');
        expect(fieldRosterFor(e.teamId, field)).toBe(e);
        const info = seasonTeamInfo(s, rosterKey(e));
        expect(info.name).toBe(entrantName(e, field));
        if (field === 'prime') expect(info.name).toContain(' · ');
      }
      expect(seasonTeamInfo(s, USER_ID)).toMatchObject({ name: 'Dragões', isUser: true, region: 'china', subtitle: 'Seu time' });
      expect(seasonEntrantTeam(s, USER_ID).teamId).toBe(USER_ID);
      // Seeds follow strength.
      const strengths = entrants.map((e) => seasonTeamInfo(s, e.id).strength);
      expect(strengths).toEqual([...strengths].sort((a, b) => b - a));
      const views = leagueViews(s);
      expect(views[0]!.hasUser).toBe(true);
      expect(views.flatMap((v) => v.rows)).toHaveLength(12);
      expect(leaguePlayoffCells(s)).toHaveLength(6);
      expect(userPendingMatch(s)!.stage).toBe('league');
    }
  });
});

describe('a whole season', () => {
  it('goes league → Masters → Champions or ends in the league, deterministically', () => {
    let qualified = 0;
    let eliminated = 0;
    for (let i = 0; i < 40 && (qualified === 0 || eliminated === 0); i++) {
      const seed = `season-${i}`;
      const region = REGIONS[i % REGIONS.length]!;
      const stages = new Set<string>();
      const s = fullSeason(seed, region, i % 2 ? 'prime' : 'current', (x) => stages.add(x.stage));
      expect(s.stage).toBe('done');
      expect(s.veto).toBeUndefined();
      const sum = seasonSummary(s);
      expect(sum.region).toBe(region);
      expect(sum.path.startsWith(seasonPath(s).split(' → ')[0]!)).toBe(true);
      expect(seasonShareText(s)).toContain('Complete Trials');
      expect(seasonShareText(s)).not.toContain('Time Teste');
      expect(userSeasonResults(s).length).toBeGreaterThanOrEqual(5);
      for (const r of userSeasonResults(s)) expect(s.userSeries[r.key]).toBeDefined();
      // Deterministic: same seed and choices, same JSON.
      expect(JSON.stringify(fullSeason(seed, region, i % 2 ? 'prime' : 'current'))).toBe(JSON.stringify(s));
      // Saves round-trip.
      expect(parseSeason(JSON.parse(JSON.stringify(s)))).toEqual(s);

      if (s.eliminatedAt === 'league') {
        eliminated++;
        expect(s.masters).toBeUndefined();
        expect(s.champions).toBeUndefined();
        expect(stageOutcome(s, 'league')).toMatchObject({ status: 'done' });
        expect(stageOutcome(s, 'league').rank).toBeGreaterThan(3);
        expect(sum.reached).toBe('league');
        expect(sum.path).toMatch(/^.+ → Liga \d+º/);
        continue;
      }
      qualified++;
      expect(stages.has('masters')).toBe(true);
      expect(stageOutcome(s, 'league').rank).toBeLessThanOrEqual(3);
      // Masters: 8 teams, the user and the league's other two qualified, 2+2+1 from the other regions.
      const masters = s.masters!;
      expect(masters.entrants).toHaveLength(MASTERS_TEAMS);
      expect(masters.phase).toBe('done');
      const mRegions = masters.entrants.filter((e) => e.id !== USER_ID).map((e) => regionOf(rosterOf(e.id)));
      const counts = Object.fromEntries(REGIONS.map((r) => [r, mRegions.filter((x) => x === r).length]));
      expect(counts[region]).toBe(2);
      expect(Object.values(counts).sort()).toEqual([1, 2, 2, 2]);
      expect(mastersCells(s)).toHaveLength(14);
      expect(stageOutcome(s, 'masters').place).toBeDefined();
      // Champions: 16 teams, 4 per region, the Masters teams among them, distinct teams.
      const champions = s.champions!;
      expect(champions.entrants).toHaveLength(16);
      expect(champions.phase).toBe('done');
      const cIds = champions.entrants.map((e) => e.id);
      for (const e of masters.entrants) expect(cIds).toContain(e.id);
      const cRegions = cIds.map((id) => (id === USER_ID ? region : regionOf(rosterOf(id))));
      for (const r of REGIONS) expect(cRegions.filter((x) => x === r)).toHaveLength(CHAMPIONS_PER_REGION);
      const teams = cIds.filter((id) => id !== USER_ID).map((id) => rosterOf(id).teamId);
      expect(new Set(teams).size).toBe(teams.length);
      expect(championsGroupViews(s)).toHaveLength(4);
      expect(stageOutcome(s, 'champions').place).toBeDefined();
      expect(sum.reached).toBe('champions');
      expect(sum.championName).toBeDefined();
      expect(sum.path).toContain('Masters');
      expect(sum.path).toContain('Champions');
      if (sum.champion) expect(sum.path).toContain('🏆');
      const first = userSeasonResults(s)[0]!;
      expect(findSeasonMatch(s, first.key)!.match.id).toBe(first.match.id);
    }
    console.log('qualified', qualified, 'eliminated', eliminated);
    expect(qualified).toBeGreaterThan(0);
    expect(eliminated).toBeGreaterThan(0);
  });

  // TRIALS_REPORT=1 npx vitest run src/game/season --silent=false: how often the greedy drafter survives the league.
  it.skipIf(!env.TRIALS_REPORT)('reports the qualification rate of the greedy drafter', () => {
    const n = Number(env.TRIALS_N ?? 24);
    for (const field of ['current', 'prime'] as const) {
      let masters = 0;
      let top4 = 0;
      let titles = 0;
      for (let i = 0; i < n; i++) {
        const s = fullSeason(`rate-${i}`, REGIONS[i % 4]!, field);
        if (s.masters) masters++;
        if ((stageOutcome(s, 'masters').rank ?? 9) <= 4) top4++;
        if (s.champions?.champion === USER_ID) titles++;
      }
      console.log(`${field}: Masters ${Math.round((100 * masters) / n)}% · top 4 do Masters ${Math.round((100 * top4) / n)}% · título ${Math.round((100 * titles) / n)}% (n=${n})`);
    }
  });

  it('parseSeason rejects broken saves', () => {
    expect(parseSeason(null)).toBeNull();
    expect(parseSeason({ version: 99 })).toBeNull();
    const s = chooseRegion(createSeason('p'), 'emea');
    expect(parseSeason({ ...s, region: 'moon' })).toBeNull();
    expect(parseSeason({ ...s, field: 'x' })).toBeNull();
    expect(parseSeason({ ...s, stage: 'league' })).toBeNull();
    expect(parseSeason(createSeason('p'))).toEqual(createSeason('p'));
  });
});

describe('map familiarity across the season', () => {
  it('carries the maps played from the league to the Champions, for every team', () => {
    // A season that reaches the Masters (so familiarity crosses a stage boundary).
    let s: SeasonState | null = null;
    for (let i = 0; i < 12 && !s; i++) {
      const done = fullSeason(`fam-${i}`);
      if (done.masters) s = done;
    }
    expect(SEASON_VERSION).toBe(3);
    const season = s ?? fullSeason('fam-0');
    const stages = [season.league?.matches ?? [], season.masters?.matches ?? [], season.champions?.matches ?? []];
    const played = stages.flat().reduce((n, m) => n + (m.result ? m.result.score[0] + m.result.score[1] : 0), 0);
    // Every map of every series counts for both teams; teams from other regions also start the Masters/Champions
    // with the league's median (they played their own leagues), so the table holds at least the maps played.
    const recorded = Object.values(season.mapsPlayed).reduce((n, row) => n + Object.values(row ?? {}).reduce((m: number, c) => m + (c ?? 0), 0), 0);
    expect(recorded).toBeGreaterThanOrEqual(2 * played);
    const leagueIds = new Set(season.league!.entrants.map((e) => e.id));
    const newcomers = (season.masters?.entrants ?? []).filter((e) => !leagueIds.has(e.id));
    expect(newcomers.length).toBeGreaterThan(0);
    for (const e of newcomers) expect(Object.values(season.mapsPlayed[e.id] ?? {}).length).toBeGreaterThan(0);
    const fam = seasonMapFamiliarity(season, USER_ID);
    expect(fam.map((f) => f.map)).toEqual([...SEASON_MAP_POOL]);
    expect(fam.reduce((n, f) => n + f.played, 0)).toBeGreaterThan(0);
    for (const f of fam) expect(f.points).toBe(Math.min(2, 0.5 * f.played));
    // Stats of the user's five over the whole season.
    const stats = seasonPlayerStats(season);
    expect(stats).toHaveLength(5);
    const maps = Object.values(season.userSeries).reduce((n, x) => n + x.maps.length, 0);
    for (const p of stats) expect(p.maps).toBe(maps);
  });

  it('needs the maps-played table in a save', () => {
    const s = startLeague(autoDraft(chooseRegion(createSeason('fam-save'), 'emea')), 'F');
    expect(parseSeason(s)).not.toBeNull();
    const old: Record<string, unknown> = { ...s };
    delete old.mapsPlayed;
    expect(parseSeason(old)).toBeNull();
    expect(parseSeason({ ...s, version: 2 })).toBeNull();
  });
});
