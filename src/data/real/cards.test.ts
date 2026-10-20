import { describe, expect, it } from 'vitest';
import type { Role } from '../../engine/types';
import {
  DECISION,
  MIN_ROUNDS,
  blend,
  buildRealPool,
  coverRoles,
  percentile,
  pickRole,
  placementBonus,
  regionalPlacementBonus,
  roleWeights,
  shrink,
  shrunkClutchRate,
  tacticFromPlacement,
  tierBonus,
  tierGroup,
  vetoAffinity,
  vetoFromExperience,
  type VlrEventData,
  type VlrPlayerRow,
  type VlrTeamRow,
} from './cards';
import type { LiquipediaEvent, LiquipediaTeam } from './liquipedia';
import { auraTier } from './cards';

describe('auraTier', () => {
  const facts = (events: number, titles: number, top3: number, high = 0) => ({ events, titles, top3, high });
  it('follows the research criteria (docs/pesquisa-variancia.md §10.2)', () => {
    expect(auraTier(facts(5, 2, 2), 0, true)).toBe('goat');
    expect(auraTier(facts(5, 1, 2), 0, true)).toBe('legend');
    expect(auraTier(facts(5, 2, 0), 0, true)).toBe('legend');
    expect(auraTier(facts(5, 0, 3), 0, true)).toBe('legend');
    expect(auraTier(facts(2, 0, 1), 0, true)).toBe('star');
    expect(auraTier(facts(3, 0, 0, 2), 0, true)).toBe('star');
    expect(auraTier(facts(3, 1, 0, 0), 1, true)).toBe('star');
    expect(auraTier(facts(1, 0, 0), 0, true)).toBe('rising');
    expect(auraTier(facts(1, 0, 0), 0, false)).toBeUndefined();
    expect(auraTier(facts(3, 1, 0, 1), 0, true)).toBeUndefined();
    expect(auraTier(facts(0, 0, 0), 0, false)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Synthetic fixtures (test-only; never shown in the game)
// ---------------------------------------------------------------------------

const ROLES: Record<string, Role> = {
  Jett: 'duelist',
  Raze: 'duelist',
  Sova: 'initiator',
  Fade: 'initiator',
  Omen: 'controller',
  Viper: 'controller',
  Killjoy: 'sentinel',
  Cypher: 'sentinel',
};
const LINEUP = [['Jett'], ['Sova'], ['Omen'], ['Killjoy'], ['Fade']];

interface PlayerSpec {
  /** 0..1 quality: all stats grow with it. */
  q: number;
  rounds?: number;
  agents?: string[];
  rating?: number | null;
}

let nextId = 1;
function player(handle: string, teamId: number, spec: PlayerSpec, inflate = 0): VlrPlayerRow {
  const { q, rounds = 200, agents = ['Jett'] } = spec;
  return {
    playerId: nextId++,
    playerSlug: handle.toLowerCase(),
    handle,
    country: 'br',
    teamId,
    agents: agents.map((agent, i) => ({ agent, pct: agents.length === 1 ? 100 : i === 0 ? 60 : 40 / (agents.length - 1) })),
    rounds,
    rating: spec.rating === undefined ? 0.8 + 0.5 * q + inflate : spec.rating,
    acs: 150 + 100 * q + inflate * 100,
    kast: 65 + 15 * q,
    adr: 110 + 60 * q,
    kpr: 0.6 + 0.3 * q,
    apr: 0.2 + 0.2 * q,
    fkPct: 8 + 10 * q,
    fdPct: 10,
    hsPct: 20 + 10 * q,
    clutchesWon: Math.round(10 * q),
    clutchesPlayed: 20,
  };
}

interface TeamSpec {
  name: string;
  placement?: [string, number];
  players: PlayerSpec[];
}

function event(
  slug: string,
  year: number,
  teams: TeamSpec[],
  opts: { tier?: string; inflate?: number; maps?: string[]; region?: 'americas' | 'emea' | 'pacific' | 'china'; country?: string } = {},
): VlrEventData {
  const teamRows: VlrTeamRow[] = [];
  const players: VlrPlayerRow[] = [];
  teams.forEach((t, ti) => {
    const id = 1000 + ti;
    const rows = t.players.map((p, pi) =>
      player(`${t.name}${pi}`, id, { agents: LINEUP[pi], ...p }, opts.inflate ?? 0),
    );
    players.push(...rows);
    teamRows.push({
      id,
      slug: t.name.toLowerCase(),
      name: t.name,
      tag: t.name.slice(0, 3).toUpperCase(),
      played: true,
      placement: t.placement ? { text: t.placement[0], min: t.placement[1], max: t.placement[1] } : null,
      players: rows.map((r) => ({ playerId: r.playerId, main: true })),
      countryName: opts.country ?? 'Brazil',
    });
  });
  return {
    slug,
    shortName: slug,
    year,
    tier: opts.tier ?? 'masters',
    region: opts.region ?? null,
    startDate: `${year}-06-01`,
    mapPool: (opts.maps ?? ['Ascent', 'Bind', 'Haven', 'Icebox', 'Lotus', 'Split', 'Sunset']).map((map) => ({ map, played: 1 })),
    teams: teamRows,
    players,
    matches: [],
  };
}

/** Teams whose players all share one quality level, from best to worst. */
const ladder = (n: number, prefix = 'T'): TeamSpec[] =>
  Array.from({ length: n }, (_, i) => ({
    name: `${prefix}${i}`,
    players: Array.from({ length: 5 }, (_, k) => ({ q: 1 - (i * 5 + k) / (n * 5) })),
  }));

function lpTeam(vlrTeam: VlrTeamRow, ev: VlrEventData, extra: Partial<LiquipediaTeam> = {}): LiquipediaTeam {
  const rows = ev.players.filter((p) => p.teamId === vlrTeam.id);
  return {
    name: vlrTeam.name!,
    liquipediaPage: vlrTeam.name,
    vlrTeamId: null,
    players: rows.map((r) => ({ liquipediaId: r.handle, handle: r.handle, flag: 'BR', isSub: false })),
    coach: null,
    staff: [],
    igl: null,
    iglSource: 'none',
    ...extra,
  };
}

function lpEvent(ev: VlrEventData, teams: LiquipediaTeam[]): LiquipediaEvent {
  return {
    id: ev.slug,
    name: ev.slug,
    tier: 'masters',
    year: ev.year,
    startDate: ev.startDate,
    endDate: ev.startDate,
    vlrEventId: null,
    liquipedia: { title: ev.slug, revid: 1, url: '', format: 'TeamCard', rosterSource: 'wikitext' },
    withdrawn: [],
    teams,
  };
}

const cardsOf = (pool: ReturnType<typeof buildRealPool>) => pool.rosters.flatMap((r) => r.cards);

// ---------------------------------------------------------------------------

describe('helpers', () => {
  it('percentile is the mid-rank, 50 without data', () => {
    expect(percentile([1, 2, 3, 4], 4)).toBe(87.5);
    expect(percentile([1, 2, 3, 4], 1)).toBe(12.5);
    expect(percentile([1, 2, 2, 3], 2)).toBe(50);
    expect(percentile([], 7)).toBe(50);
  });

  it('shrinks toward 50 by sample size; a missing percentile is neutral', () => {
    expect(shrink(90, 0)).toBe(50);
    expect(shrink(null, 500)).toBe(50);
    expect(shrink(90, 60)).toBe(70);
    expect(shrink(90, 400)).toBeGreaterThan(shrink(90, 100));
    expect(shrink(10, 400)).toBeLessThan(shrink(10, 100));
  });

  it('blends only the available values', () => {
    expect(blend([[80, 1], [null, 1], [40, 3]])).toBe(50);
    expect(blend([[null, 1]])).toBeNull();
  });

  it('shrinks the clutch rate toward the prior by attempts', () => {
    expect(shrunkClutchRate(1, 1, 20)).toBeCloseTo((100 * (1 + 2)) / 11);
    expect(shrunkClutchRate(null, 5, 20)).toBeNull();
    expect(shrunkClutchRate(10, 50, 20)).toBeCloseTo(20);
  });

  it('maps placement to coach tactic, OVR bonus and experience to veto', () => {
    expect([1, 2, 4, 5, 8, 9].map((min) => tacticFromPlacement({ min }))).toEqual([3, 2, 2, 1, 1, 0]);
    expect(tacticFromPlacement(null)).toBe(0);
    expect([1, 2, 3, 5].map((min) => placementBonus({ min }))).toEqual([3, 2, 1, 0]);
    expect([1, 2, 3, 4, 6, 9].map(vetoFromExperience)).toEqual([0, 1, 1, 2, 3, 3]);
  });
});

describe('roles from agents', () => {
  it('weights roles by pick %, or by order when there is no %', () => {
    expect(roleWeights([{ agent: 'Jett', pct: 70 }, { agent: 'Sova', pct: 30 }], ROLES)).toEqual({
      duelist: 70,
      initiator: 30,
      controller: 0,
      sentinel: 0,
    });
    const byOrder = roleWeights([{ agent: 'Omen', pct: null }, { agent: 'Jett', pct: null }, { agent: 'Unknown', pct: null }], ROLES);
    expect(byOrder.controller).toBeGreaterThan(byOrder.duelist);
  });

  it('breaks ties with the career weights, then falls back to initiator', () => {
    const tie = roleWeights([{ agent: 'Jett', pct: 50 }, { agent: 'Viper', pct: 50 }], ROLES);
    expect(pickRole(tie, { duelist: 10, initiator: 0, controller: 300, sentinel: 0 })).toBe('controller');
    expect(pickRole({ duelist: 0, initiator: 0, controller: 0, sentinel: 0 })).toBe('initiator');
    expect(pickRole(tie)).toBe('controller');
  });

  it('covers a missing role only with a player who played it and whose role is doubled', () => {
    const w = (d: number, i: number, c: number, s: number) => ({ duelist: d, initiator: i, controller: c, sentinel: s });
    const weights = [w(100, 0, 0, 0), w(0, 100, 0, 0), w(0, 0, 100, 0), w(0, 0, 60, 40), w(0, 100, 0, 0)];
    expect(coverRoles(['duelist', 'initiator', 'controller', 'controller', 'initiator'], weights)).toEqual([
      'duelist',
      'initiator',
      'controller',
      'sentinel',
      'initiator',
    ]);
    // 10% Killjoy is not enough to call him a sentinel.
    const thin = [...weights.slice(0, 3), w(0, 0, 90, 10), weights[4]!];
    expect(coverRoles(['duelist', 'initiator', 'controller', 'controller', 'initiator'], thin)[3]).toBe('controller');
    // A lone controller never moves out of the role, even if he also played sentinels.
    const lone = [w(100, 0, 0, 0), w(0, 100, 0, 0), w(0, 0, 50, 50), w(100, 0, 0, 0), w(0, 100, 0, 0)];
    expect(coverRoles(['duelist', 'initiator', 'controller', 'duelist', 'initiator'], lone)[2]).toBe('controller');
  });
});

describe('buildRealPool', () => {
  it('rates players by percentile within the year, so stat inflation across eras does not matter', () => {
    const a = event('ev-2021', 2021, ladder(6, 'A'));
    const b = event('ev-2022', 2022, ladder(6, 'B'), { inflate: 0.3 });
    const pool = buildRealPool([a, b], [], ROLES);
    const ovr = (handle: string) => cardsOf(pool).find((c) => c.handle === handle)!;
    expect(ovr('A00').ovr).toBe(ovr('B00').ovr);
    expect(ovr('A30').attrs).toEqual(ovr('B30').attrs);
    // Inside a year, better stats mean a higher OVR.
    expect(ovr('A00').ovr).toBeGreaterThan(ovr('A30').ovr);
    expect(ovr('A30').ovr).toBeGreaterThan(ovr('A54').ovr);
  });

  it('shrinks small samples toward the middle', () => {
    const teams = ladder(6);
    teams[0]!.players[0] = { q: 1, rounds: 40 };
    teams[0]!.players[1] = { q: 1, rounds: 400 };
    teams[5]!.players[3] = { q: 0, rounds: 40 };
    teams[5]!.players[4] = { q: 0, rounds: 400 };
    const pool = buildRealPool([event('ev', 2023, teams)], [], ROLES);
    const c = (h: string) => cardsOf(pool).find((x) => x.handle === h)!;
    expect(c('T00').ovr).toBeLessThan(c('T01').ovr);
    expect(c('T53').ovr).toBeGreaterThan(c('T54').ovr);
  });

  it('adds the placement and tier bonuses', () => {
    const teams = ladder(4);
    const masters = buildRealPool([event('m', 2023, teams)], [], ROLES);
    const champs = buildRealPool([event('c', 2023, teams, { tier: 'champions' })], [], ROLES);
    const won = teams.map((t, i) => (i === 3 ? { ...t, placement: ['1st', 1] as [string, number] } : t));
    const winner = buildRealPool([event('m', 2023, won)], [], ROLES);
    const ovr = (p: ReturnType<typeof buildRealPool>, h: string) => cardsOf(p).find((c) => c.handle === h)!.ovr;
    expect(ovr(champs, 'T00') - ovr(masters, 'T00')).toBe(2);
    expect(ovr(winner, 'T30') - ovr(masters, 'T30')).toBe(3);
  });

  it('gives roles from the agents and builds valid cards', () => {
    const pool = buildRealPool([event('ev', 2023, ladder(4))], [], ROLES);
    const roster = pool.rosters[0]!;
    expect(roster.cards.map((c) => c.role)).toEqual(['duelist', 'initiator', 'controller', 'sentinel', 'initiator']);
    for (const c of cardsOf(pool)) {
      expect(c.id).toBe(`${c.handle.toLowerCase()}@${c.teamId}-${c.eventId}`);
      expect(c.ovr).toBeGreaterThanOrEqual(50);
      expect(c.ovr).toBeLessThanOrEqual(99);
      for (const v of Object.values(c.attrs)) {
        expect(v).toBeGreaterThanOrEqual(40);
        expect(v).toBeLessThanOrEqual(99);
      }
      expect(c.country).toBe('BR');
      expect(c.stats!.rounds).toBe(200);
    }
  });

  it('keeps a missing stat as null and uses a neutral percentile, with a note', () => {
    const teams = ladder(4);
    teams[0]!.players[0] = { q: 1, rating: null };
    const pool = buildRealPool([event('ev', 2023, teams)], [], ROLES);
    const card = cardsOf(pool).find((c) => c.handle === 'T00')!;
    expect(card.stats!.rating).toBeNull();
    expect(card.ovr).toBeGreaterThan(cardsOf(pool).find((c) => c.handle === 'T30')!.ovr);
    expect(pool.notes.some((n) => n.includes('Rating'))).toBe(true);
  });

  it(`skips a roster with a main player under ${MIN_ROUNDS} rounds`, () => {
    const teams = ladder(4);
    teams[2]!.players[4] = { q: 0.5, rounds: MIN_ROUNDS - 1 };
    const pool = buildRealPool([event('ev', 2023, teams)], [], ROLES);
    expect(pool.rosters.map((r) => r.teamId)).toEqual(['t0', 't1', 't3']);
    expect(pool.skipped).toHaveLength(1);
    expect(pool.skipped[0]).toMatch(/^t2-ev:/);
  });

  it('marks the Liquipedia IGL, keeps its source and flags unknown IGLs', () => {
    const ev = event('ev', 2023, ladder(4));
    const [t0, t1, t2, t3] = ev.teams;
    const lp = lpEvent(ev, [
      lpTeam(t0!, ev, { igl: 'T02', iglSource: 'event-captain', coach: { name: 'Coach Zero', liquipediaId: 'Coach_Zero' } }),
      lpTeam(t1!, ev, { igl: 'T13', iglSource: 'infobox-unique' }),
      lpTeam(t2!, ev, { igl: null, iglSource: 'infobox-ambiguous' }),
      lpTeam(t3!, ev, { igl: 'Somebody', iglSource: 'squad-captain' }),
    ]);
    const pool = buildRealPool([ev], [lp], ROLES);
    const [r0, r1, r2, r3] = pool.rosters;
    expect(r0!.cards.filter((c) => c.isIGL).map((c) => c.handle)).toEqual(['T02']);
    expect(r0!.cards[2]!.iglSource).toBe('event-captain');
    expect(r0!.cards[2]!.attrs.decision).toBe(DECISION.captain);
    expect(r0!.iglKnown).toBe(true);
    expect(r1!.cards[3]!.attrs.decision).toBe(DECISION.infobox);
    // Non-IGLs: 45 ± swing by APR/KAST, never into the IGL range.
    expect(Math.abs(r1!.cards[0]!.attrs.decision - DECISION.none)).toBeLessThanOrEqual(DECISION.swing);
    for (const c of pool.rosters.flatMap((r) => r.cards)) {
      if (!c.isIGL) expect(c.attrs.decision).toBeLessThanOrEqual(DECISION.iglElsewhere + DECISION.swing);
      else expect(c.attrs.decision).toBeGreaterThanOrEqual(DECISION.infobox);
    }
    // No IGL in the data, or an IGL who is not one of the 5 main players: unknown.
    expect(r2!.iglKnown).toBe(false);
    expect(r3!.iglKnown).toBe(false);
    expect([...r2!.cards, ...r3!.cards].some((c) => c.isIGL)).toBe(false);
    // Coach from Liquipedia; no coach → none.
    expect(r0!.coach).toMatchObject({ name: 'Coach Zero', teamId: 't0', eventId: 'ev', vetoBonus: 0, tacticBonus: 0 });
    expect(r0!.coach!.id).toBe('coach-zero@t0-ev');
    expect(r1!.coach).toBeUndefined();
  });

  it('counts coach experience and IGL history across events, in date order', () => {
    const evs = [2021, 2022, 2023, 2024].map((y) => event(`ev-${y}`, y, ladder(4)));
    // Same player ids across events: make team 0 the same people every year.
    for (const ev of evs.slice(1)) {
      ev.players.slice(0, 5).forEach((p, i) => (p.playerId = evs[0]!.players[i]!.playerId));
      ev.teams[0]!.players.forEach((p, i) => (p.playerId = evs[0]!.players[i]!.playerId));
    }
    const lp = evs.map((ev, i) =>
      lpEvent(ev, [
        lpTeam(ev.teams[0]!, ev, {
          coach: { name: 'Vet', liquipediaId: 'Vet' },
          igl: i === 0 ? 'T02' : null,
          iglSource: i === 0 ? 'squad-captain' : 'none',
        }),
      ]),
    );
    const pool = buildRealPool([...evs].reverse(), lp, ROLES);
    const t0 = pool.rosters.filter((r) => r.teamId === 't0');
    expect(t0.map((r) => r.coach!.vetoBonus)).toEqual([0, 1, 1, 2]);
    expect(t0[0]!.cards[2]!.attrs.decision).toBe(DECISION.captain);
    expect(Math.abs(t0[3]!.cards[2]!.attrs.decision - DECISION.iglElsewhere)).toBeLessThanOrEqual(DECISION.swing);
    expect(t0[3]!.cards[2]!.attrs.decision).toBeGreaterThan(t0[3]!.cards[0]!.attrs.decision);
  });

  it('is deterministic and independent of input order', () => {
    const evs = [event('a', 2021, ladder(5)), event('b', 2022, ladder(5), { inflate: 0.1 })];
    const one = buildRealPool(evs, [], ROLES);
    const two = buildRealPool([...evs].reverse(), [], ROLES);
    expect(JSON.stringify(two)).toBe(JSON.stringify(one));
  });

  it('suffixes team ids shared by two different teams and picks the latest 7-map pool', () => {
    const a = event('a', 2021, ladder(4), { maps: ['Ascent', 'Bind', 'Haven', 'Icebox', 'Split'] });
    const b = event('b', 2022, ladder(4), { maps: ['Abyss', 'Ascent', 'Bind', 'Haven', 'Lotus', 'Pearl', 'Split'] });
    const c = event('c', 2023, ladder(4), { maps: ['Ascent', 'Bind'] });
    b.teams[0]!.id = 9999;
    for (const p of b.players) if (p.teamId === 1000) p.teamId = 9999;
    const pool = buildRealPool([a, b, c], [], ROLES);
    const ids = new Set(pool.rosters.map((r) => r.teamId));
    expect(ids.has('t0-1000')).toBe(true);
    expect(ids.has('t0-9999')).toBe(true);
    expect(ids.has('t1')).toBe(true);
    expect(pool.mapPool).toEqual(['Abyss', 'Ascent', 'Bind', 'Haven', 'Lotus', 'Pearl', 'Split']);
    expect(pool.mapPoolEventId).toBe('b');
  });
});

describe('vetoAffinity', () => {
  it('scores picks +1 and bans −1 from the veto line (capped ±2), or pickedBy without one', () => {
    const ev = event('ev', 2023, ladder(3));
    const [t0, t1, t2] = ev.teams;
    ev.matches = [
      {
        teams: [{ id: t0!.id }, { id: t1!.id }],
        maps: [],
        veto: ['T0 ban Icebox', 'T1 ban Bind', 'T0 pick Haven', 'T1 pick Ascent', 'T0 ban Bind', 'T1 ban Split', 'Lotus remains'],
      },
      { teams: [{ id: t2!.id }, { id: t0!.id }], maps: [], veto: ['T2 ban Haven', 'T0 pick Haven', 'T0 pick Haven'] },
      { teams: [{ id: t0!.id }, { id: t2!.id }], maps: [{ map: 'Lotus', pickedBy: 1 }, { map: 'Split', pickedBy: 2 }], veto: null },
    ];
    expect(vetoAffinity(ev, t0!)).toEqual({ Bind: -1, Haven: 2, Icebox: -1, Lotus: 1 });
    expect(vetoAffinity(ev, t1!)).toEqual({ Ascent: 1, Bind: -1, Split: -1 });
    expect(vetoAffinity(ev, t2!)).toEqual({ Haven: -1, Split: 1 });
  });
  it('ranks regional league rows among themselves, with the regional tier and placement bonuses', () => {
    expect(tierGroup('regional')).toBe('regional');
    expect(tierGroup('masters')).toBe('international');
    expect(tierBonus('regional')).toBe(-2);
    expect([1, 2, 3].map((min) => regionalPlacementBonus({ min }))).toEqual([2, 1, 0]);
    expect(regionalPlacementBonus(null)).toBe(0);
    // A league with the same 6-team ladder as a Masters of the same year: same percentiles, bonus apart.
    const intl = event('m', 2023, ladder(6));
    const league = event('league', 2023, ladder(6, 'L'), { tier: 'regional', region: 'emea' });
    // Different organisations from the Masters' teams (the helper numbers teams 1000+ in every event).
    league.teams.forEach((t) => (t.id += 100));
    league.players.forEach((p) => (p.teamId += 100));
    const pool = buildRealPool([intl, league], [], ROLES);
    expect(pool.rosters.map((r) => r.eventId)).toEqual(['m', 'm', 'm', 'm', 'm', 'm']);
    expect(pool.regionalRosters.map((r) => r.eventId)).toEqual(Array(6).fill('league'));
    const ovr = (h: string) => [...pool.rosters, ...pool.regionalRosters].flatMap((r) => r.cards).find((c) => c.handle === h)!.ovr;
    expect(ovr('L00')).toBe(ovr('T00') - 2);
    expect(ovr('L54')).toBe(ovr('T54') - 2);
    // Adding much weaker international rows does not move the league's percentiles (and vice versa).
    const weak = event('m2', 2023, ladder(6, 'W'), { inflate: -0.5 });
    const pool2 = buildRealPool([intl, league, weak], [], ROLES);
    const ovr2 = (h: string) => [...pool2.rosters, ...pool2.regionalRosters].flatMap((r) => r.cards).find((c) => c.handle === h)!.ovr;
    expect(ovr2('L00')).toBe(ovr('L00'));
    expect(ovr2('L30')).toBe(ovr('L30'));
    expect(ovr2('T30')).toBeGreaterThan(ovr('T30'));
    // Region and tier on every entry; the league's region from the event, the Masters' from the league membership.
    for (const r of pool.regionalRosters) expect(r).toMatchObject({ tier: 'regional', region: 'emea' });
    for (const r of pool.rosters) expect(r).toMatchObject({ tier: 'international', region: 'americas' }); // country: Brazil
    const same = event('m3', 2023, ladder(6, 'L'));
    same.teams.forEach((t, i) => (t.id = league.teams[i]!.id));
    const pool3 = buildRealPool([league, same], [], ROLES);
    for (const r of pool3.rosters) expect(r.region).toBe('emea');
    expect(pool3.mapPool).toEqual(pool.mapPool);
  });

  it('infers a league IGL only from the same team’s Liquipedia IGL at an international event of that year', () => {
    const league = event('league', 2023, ladder(3, 'L'), { tier: 'regional', region: 'americas' });
    const intl = event('m', 2023, ladder(3, 'L'));
    const other = event('c', 2023, ladder(3, 'L'), { tier: 'champions' });
    for (const ev of [intl, other]) {
      ev.teams.forEach((t, i) => (t.id = league.teams[i]!.id));
      ev.players.forEach((p, i) => (p.playerId = league.players[i]!.playerId));
      ev.teams.forEach((t, i) => t.players.forEach((p, k) => (p.playerId = league.teams[i]!.players[k]!.playerId)));
    }
    const lp = (ev: VlrEventData, igls: (string | null)[]) =>
      lpEvent(ev, ev.teams.map((t, i) => lpTeam(t, ev, { igl: igls[i] ?? null, iglSource: igls[i] ? 'event-captain' : 'none' })));
    // Team 0: same IGL at both internationals → inferred. Team 1: two different → unknown. Team 2: none → unknown.
    const pool = buildRealPool([league, intl, other], [lp(intl, ['L02', 'L13', null]), lp(other, ['L02', 'L14', null])], ROLES);
    const [r0, r1, r2] = pool.regionalRosters;
    expect(r0!.iglKnown).toBe(true);
    expect(r0!.cards.filter((c) => c.isIGL).map((c) => [c.handle, c.iglSource])).toEqual([['L02', 'same-year-international']]);
    expect(r0!.cards[2]!.attrs.decision).toBe(DECISION.infobox);
    expect(r1!.iglKnown).toBe(false);
    expect(r2!.iglKnown).toBe(false);
    expect(pool.regionalRosters.every((r) => r.coach === undefined)).toBe(true);
    // Another year: nothing carries over.
    const next = event('league-2024', 2024, ladder(3, 'L'), { tier: 'regional', region: 'americas' });
    next.teams.forEach((t, i) => (t.id = league.teams[i]!.id));
    next.players.forEach((p, i) => (p.playerId = league.players[i]!.playerId));
    next.teams.forEach((t, i) => t.players.forEach((p, k) => (p.playerId = league.teams[i]!.players[k]!.playerId)));
    const pool2 = buildRealPool([league, intl, next], [lp(intl, ['L02', 'L13', null])], ROLES);
    expect(pool2.regionalRosters.find((r) => r.eventId === 'league-2024')!.iglKnown).toBe(false);
  });
});
