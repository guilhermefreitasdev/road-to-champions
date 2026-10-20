/**
 * Checks the real card pool built from the committed data. REAL_REPORT=1 prints the OVR distribution, the top
 * cards (overall and per year) with their source stats, and the IGL/coach coverage:
 *   REAL_REPORT=1 npx vitest run src/data/real/real --silent=false
 */
import { describe, expect, it } from 'vitest';
import { rosterKey } from '../../engine/roster';
import { DIMENSION_REFERENCE, teamStrength } from '../../engine/team';
import { MAPS } from '../game';
import { normHandle, type VlrEventData } from './cards';
import { ALL_ROSTERS, REAL_MAP_POOL, REAL_POOL, REAL_ROSTERS, REGIONAL_EVENTS, REGIONAL_ROSTERS, realLineup } from './index';
import { LIQUIPEDIA_EVENTS } from './liquipedia';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const REPORT = env.REAL_REPORT === '1';

const files = import.meta.glob<VlrEventData>('./vlr/events/*.json', { eager: true, import: 'default' });
const VLR = new Map(Object.values(files).map((e) => [e.slug, e]));
const cards = REAL_ROSTERS.flatMap((r) => r.cards.map((card) => ({ card, roster: r })));
const ovrs = cards.map((c) => c.card.ovr).sort((a, b) => a - b);
const quantile = (q: number) => ovrs[Math.round(q * (ovrs.length - 1))]!;

/** The Liquipedia team of a roster, matched independently of the builder (≥ 3 players in common). */
function liquipediaTeam(r: (typeof REAL_ROSTERS)[number]) {
  const handles = new Set(r.cards.map((c) => normHandle(c.handle)));
  const ids = new Set(r.cards.map((c) => c.playerId));
  const ev = LIQUIPEDIA_EVENTS.find((e) => e.id === r.eventId);
  const scored = (ev?.teams ?? []).map((t) => ({
    t,
    n: t.players.filter((p) => handles.has(normHandle(p.handle)) || (p.vlrPlayerId && ids.has(p.vlrPlayerId))).length,
  }));
  const best = scored.sort((a, b) => b.n - a.n)[0];
  return best && best.n >= 3 ? best.t : undefined;
}

describe('REAL_ROSTERS', () => {
  it('has most of the 253 rosters that played, 5 cards each, from ≥ 18 events and ≥ 60 teams', () => {
    expect(REAL_ROSTERS.length).toBeGreaterThanOrEqual(240);
    expect(new Set(REAL_ROSTERS.map((r) => r.eventId)).size).toBeGreaterThanOrEqual(18);
    expect(new Set(REAL_ROSTERS.map((r) => r.teamId)).size).toBeGreaterThanOrEqual(60);
    for (const r of REAL_ROSTERS) {
      expect(r.cards, rosterKey(r)).toHaveLength(5);
      expect(new Set(r.cards.map((c) => c.playerId)).size).toBe(5);
    }
    const regionalIds = REGIONAL_EVENTS.map((e) => e.id);
    expect(REAL_POOL.skipped.filter((s) => !regionalIds.some((id) => s.includes(`-${id}:`))).length).toBeLessThanOrEqual(5);
    for (const r of REAL_ROSTERS) expect(r.tier).toBe('international');
  });

  it('has unique card ids, roster keys and coach ids in the expected format', () => {
    const ids = cards.map((c) => c.card.id);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = REAL_ROSTERS.map(rosterKey);
    expect(new Set(keys).size).toBe(keys.length);
    const coachIds = REAL_ROSTERS.flatMap((r) => (r.coach ? [r.coach.id] : []));
    expect(new Set(coachIds).size).toBe(coachIds.length);
    for (const { card, roster } of cards) {
      expect(card.id).toMatch(new RegExp(`^[a-z0-9-]+@${roster.teamId}-${roster.eventId}$`));
      expect(card.teamId).toBe(roster.teamId);
      expect(card.eventId).toBe(roster.eventId);
    }
  });

  it('copies the source stats verbatim (no invented numbers)', () => {
    for (const { card, roster } of cards) {
      const row = VLR.get(roster.eventId)!.players.find((p) => String(p.playerId) === card.playerId)!;
      expect(row.handle).toBe(card.handle);
      expect(card.stats).toEqual({ rounds: row.rounds, rating: row.rating, acs: row.acs, kast: row.kast });
      expect(card.agents).toEqual(row.agents.map((a) => a.agent).filter((a) => card.agents.includes(a)));
    }
  });

  it('spreads OVR from the mid-60s to the mid-90s, attributes in 40–99', () => {
    expect(quantile(0)).toBeGreaterThanOrEqual(60);
    expect(quantile(0.1)).toBeGreaterThanOrEqual(68);
    expect(quantile(0.5)).toBeGreaterThanOrEqual(76);
    expect(quantile(0.5)).toBeLessThanOrEqual(82);
    expect(quantile(1)).toBeGreaterThanOrEqual(92);
    expect(quantile(1)).toBeLessThanOrEqual(97);
    for (const { card } of cards) {
      for (const v of Object.values(card.attrs)) {
        expect(v).toBeGreaterThanOrEqual(40);
        expect(v).toBeLessThanOrEqual(99);
      }
    }
  });

  it('puts the champions’ best players near the top', () => {
    const p90 = quantile(0.9);
    for (const r of REAL_ROSTERS.filter((x) => x.placement === '1st')) {
      expect(Math.max(...r.cards.map((c) => c.ovr)), rosterKey(r)).toBeGreaterThanOrEqual(p90);
    }
  });

  it('covers the four roles in almost every roster', () => {
    const full = REAL_ROSTERS.filter((r) => new Set(r.cards.map((c) => c.role)).size === 4).length;
    expect(full / REAL_ROSTERS.length).toBeGreaterThan(0.95);
    expect(REAL_ROSTERS.every((r) => r.cards.some((c) => c.role === 'controller'))).toBe(true);
  });

  it('has the dimension references of src/engine/team.ts at the pool medians (a typical roster scores 0 points)', () => {
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    const dims = REAL_ROSTERS.map((r) => teamStrength(realLineup(r)).dimensions);
    for (const key of ['mechanics', 'utility', 'decision', 'clutch'] as const) {
      expect(Math.abs(median(dims.map((d) => d[key])) - DIMENSION_REFERENCE[key]), key).toBeLessThanOrEqual(3);
    }
    // Every real roster is 5 teammates: communication maxes out, as the old chemistry cap did (+2).
    expect(median(dims.map((d) => d.communication))).toBe(100);
    // Removing the IGL from a real roster costs 1.5–3.5 points of strength before the in-round term.
    const costs = REAL_ROSTERS.filter((r) => r.iglKnown).map((r) => {
      const l = realLineup(r);
      const without = { ...l, iglKnown: true, players: l.players.map((p) => ({ ...p, card: { ...p.card, isIGL: false } })) };
      return teamStrength(l).total - teamStrength(without).total;
    });
    expect(Math.min(...costs)).toBeGreaterThan(1.5);
    expect(Math.max(...costs)).toBeLessThan(3.5);
    expect(median(costs)).toBeGreaterThan(1.8);
    expect(median(costs)).toBeLessThan(2.5);
  });

  it('marks the IGL only when Liquipedia names one of the 5, and has the coach whenever Liquipedia has one', () => {
    for (const r of REAL_ROSTERS) {
      const lp = liquipediaTeam(r);
      expect(lp, rosterKey(r)).toBeDefined();
      const igls = r.cards.filter((c) => c.isIGL);
      if (r.iglKnown) {
        expect(igls).toHaveLength(1);
        // Same person: VLR id from the Liquipedia infobox (e.g. "FNS" is "FiNESSE" on VLR), or same handle.
        const igl = lp!.players.find((p) => p.handle === lp!.igl)!;
        expect(igl.vlrPlayerId === igls[0]!.playerId || normHandle(igl.handle) === normHandle(igls[0]!.handle)).toBe(true);
        expect(['event-captain', 'squad-captain', 'infobox-unique']).toContain(igls[0]!.iglSource);
      } else {
        expect(igls).toHaveLength(0);
        expect(r.iglKnown).toBe(false);
      }
      if (lp!.coach) expect(r.coach?.name, rosterKey(r)).toBe(lp!.coach.name);
      else expect(r.coach).toBeUndefined();
      if (r.coach) {
        expect(r.coach.vetoBonus).toBeGreaterThanOrEqual(0);
        expect(r.coach.vetoBonus).toBeLessThanOrEqual(3);
        expect(r.coach.tacticBonus).toBeGreaterThanOrEqual(0);
        expect(r.coach.tacticBonus).toBeLessThanOrEqual(3);
      }
    }
    expect(REAL_ROSTERS.filter((r) => r.iglKnown).length / REAL_ROSTERS.length).toBeGreaterThan(0.7);
    expect(REAL_ROSTERS.filter((r) => r.coach).length / REAL_ROSTERS.length).toBeGreaterThan(0.95);
  });

  it('builds AI lineups with small map affinities from the stored vetoes', () => {
    for (const r of REAL_ROSTERS) {
      const lineup = realLineup(r);
      expect(lineup.iglKnown).toBe(r.iglKnown ? undefined : false);
      expect(() => teamStrength(lineup)).not.toThrow();
      for (const v of Object.values(lineup.mapAffinity ?? {})) expect(Math.abs(v!)).toBeLessThanOrEqual(2);
    }
    expect(Object.keys(REAL_POOL.affinity).length).toBeGreaterThan(40);
  });

  it('vetoes on the 7 maps of the most recent full pool', () => {
    expect(REAL_MAP_POOL).toHaveLength(7);
    expect(new Set(REAL_MAP_POOL).size).toBe(7);
    const known = new Set(MAPS.map((m) => m.name));
    for (const m of REAL_MAP_POOL) expect(known.has(m)).toBe(true);
    expect(REAL_POOL.mapPoolEventId).toBe('champions-2026');
  });

  it('prints a report with REAL_REPORT=1', () => {
    if (!REPORT) return;
    const fmt = ({ card: c, roster: r }: (typeof cards)[number]) =>
      `${String(c.ovr).padStart(3)} ${c.handle.padEnd(11)} ${`${r.teamName} · ${r.eventName}`.padEnd(42)} ${c.role.padEnd(10)} ${String(r.placement ?? '').padEnd(8)} rounds ${c.stats!.rounds} rating ${c.stats!.rating ?? '—'} ACS ${c.stats!.acs ?? '—'} KAST ${c.stats!.kast ?? '—'}${c.isIGL ? ` IGL(${c.iglSource})` : ''}`;
    const top = [...cards].sort((a, b) => b.card.ovr - a.card.ovr || a.card.id.localeCompare(b.card.id));
    const lines = [
      `${REAL_ROSTERS.length} rosters, ${cards.length} cards; OVR min/p10/p50/p90/max ${quantile(0)}/${quantile(0.1)}/${quantile(0.5)}/${quantile(0.9)}/${quantile(1)}`,
      `IGL known ${REAL_ROSTERS.filter((r) => r.iglKnown).length}, coach ${REAL_ROSTERS.filter((r) => r.coach).length}, affinity ${Object.keys(REAL_POOL.affinity).length}`,
      `skipped: ${REAL_POOL.skipped.join(' | ')}`,
      `notes: ${REAL_POOL.notes.join(' | ')}`,
      'TOP 15',
      ...top.slice(0, 15).map(fmt),
    ];
    for (const year of [...new Set(REAL_ROSTERS.map((r) => r.year))].sort()) {
      lines.push(`TOP ${year}`, ...top.filter((c) => c.roster.year === year).slice(0, 3).map(fmt));
    }
    console.log(lines.join('\n'));
  });
});

describe('REGIONAL_ROSTERS', () => {
  const regionalCards = REGIONAL_ROSTERS.flatMap((r) => r.cards.map((card) => ({ card, roster: r })));
  const regionalOvrs = regionalCards.map((c) => c.card.ovr).sort((a, b) => a - b);
  const rq = (q: number) => regionalOvrs[Math.round(q * (regionalOvrs.length - 1))]!;

  it('has every league stage with at least 8 rosters of 5 cards, tier regional, region set, ids unique across pools', () => {
    expect(REGIONAL_EVENTS.length).toBeGreaterThanOrEqual(27);
    for (const e of REGIONAL_EVENTS) {
      const rosters = REGIONAL_ROSTERS.filter((r) => r.eventId === e.id);
      expect(rosters.length, e.id).toBeGreaterThanOrEqual(8);
      expect(rosters.every((r) => r.region === e.region && r.year === e.year && r.eventName === e.name), e.id).toBe(true);
      expect(e.maps.length).toBeGreaterThanOrEqual(7);
    }
    for (const r of REGIONAL_ROSTERS) {
      expect(r.tier).toBe('regional');
      expect(r.cards, rosterKey(r)).toHaveLength(5);
      expect(new Set(r.cards.map((c) => c.playerId)).size).toBe(5);
      expect(r.coach).toBeUndefined();
    }
    const ids = ALL_ROSTERS.flatMap((r) => r.cards.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
    const keys = ALL_ROSTERS.map(rosterKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('copies the source stats verbatim and keeps attributes and OVR in range (a notch below the internationals)', () => {
    for (const { card, roster } of regionalCards) {
      const row = VLR.get(roster.eventId)!.players.find((p) => String(p.playerId) === card.playerId)!;
      expect(row.handle).toBe(card.handle);
      expect(card.stats).toEqual({ rounds: row.rounds, rating: row.rating, acs: row.acs, kast: row.kast });
      for (const v of Object.values(card.attrs)) {
        expect(v).toBeGreaterThanOrEqual(40);
        expect(v).toBeLessThanOrEqual(99);
      }
    }
    expect(rq(0)).toBeGreaterThanOrEqual(58);
    expect(rq(0.5)).toBeGreaterThanOrEqual(72);
    expect(rq(0.5)).toBeLessThanOrEqual(quantile(0.5));
    expect(rq(1)).toBeLessThanOrEqual(quantile(1));
    expect(rq(1)).toBeGreaterThanOrEqual(88);
  });

  it('marks an IGL only when the same team had a Liquipedia IGL at an international event of that year', () => {
    let known = 0;
    for (const r of REGIONAL_ROSTERS) {
      const igls = r.cards.filter((c) => c.isIGL);
      if (r.iglKnown) {
        known++;
        expect(igls).toHaveLength(1);
        expect(igls[0]!.iglSource).toBe('same-year-international');
        const intl = REAL_ROSTERS.filter(
          (x) => x.year === r.year && x.iglKnown && x.cards.some((c) => c.playerId === igls[0]!.playerId && c.isIGL),
        );
        expect(intl.length, rosterKey(r)).toBeGreaterThan(0);
        expect(realLineup(r).iglKnown).toBeUndefined();
      } else {
        expect(igls).toHaveLength(0);
        expect(realLineup(r).iglKnown).toBe(false);
      }
      expect(() => teamStrength(realLineup(r))).not.toThrow();
    }
    expect(known / REGIONAL_ROSTERS.length).toBeGreaterThan(0.25);
  });

  it('prints a regional report with REAL_REPORT=1', () => {
    if (!REPORT) return;
    const top = [...regionalCards].sort((a, b) => b.card.ovr - a.card.ovr || a.card.id.localeCompare(b.card.id));
    const fmt = ({ card: c, roster: r }: (typeof regionalCards)[number]) =>
      `${String(c.ovr).padStart(3)} ${c.handle.padEnd(11)} ${`${r.teamName} · ${r.eventName}`.padEnd(42)} ${c.role.padEnd(10)} ${String(r.placement ?? '').padEnd(8)} rounds ${c.stats!.rounds} rating ${c.stats!.rating ?? '—'} ACS ${c.stats!.acs ?? '—'}${c.isIGL ? ' IGL' : ''}`;
    console.log(
      [
        `${REGIONAL_ROSTERS.length} regional rosters, ${regionalCards.length} cards; OVR min/p10/p50/p90/max ${rq(0)}/${rq(0.1)}/${rq(0.5)}/${rq(0.9)}/${rq(1)}`,
        `IGL known ${REGIONAL_ROSTERS.filter((r) => r.iglKnown).length}, affinity ${REGIONAL_ROSTERS.filter((r) => REAL_POOL.affinity[rosterKey(r)]).length}`,
        `skipped: ${REAL_POOL.skipped.filter((s) => REGIONAL_EVENTS.some((e) => s.includes(`-${e.id}:`))).join(' | ')}`,
        'TOP 10',
        ...top.slice(0, 10).map(fmt),
      ].join('\n'),
    );
  });
});

describe('Modelo v3: aura, anchors and prodigies are facts of the snapshot', () => {
  const cards = REAL_ROSTERS.flatMap((r) => r.cards);
  const find = (handle: string, eventId: string) => cards.find((c) => c.handle.toLowerCase() === handle && c.eventId === eventId)!;
  const count = (f: (c: (typeof cards)[number]) => boolean) => cards.filter(f).length;

  it('tiers the pool in the research\'s proportions (≈ 20 GOAT, 24–35 legend cards, hundreds of stars and debuts)', () => {
    expect(count((c) => c.aura === 'goat')).toBeGreaterThanOrEqual(12);
    expect(count((c) => c.aura === 'goat')).toBeLessThanOrEqual(30);
    expect(count((c) => c.aura === 'legend')).toBeGreaterThanOrEqual(20);
    expect(count((c) => c.aura === 'legend')).toBeLessThanOrEqual(50);
    expect(count((c) => c.aura === 'star')).toBeGreaterThan(150);
    expect(count((c) => c.aura === 'rising')).toBeGreaterThan(200);
    expect(count((c) => !c.aura)).toBeGreaterThan(400);
    expect(count((c) => !!c.anchor)).toBeGreaterThan(40);
    expect(count((c) => !!c.anchor)).toBeLessThan(120);
    expect(count((c) => !!c.prodigy)).toBeGreaterThan(40);
    expect(count((c) => !!c.prodigy)).toBeLessThan(100);
    // Every prodigy is a debutant; every GOAT has two titles and two top-3 ratings; every card has its facts.
    expect(cards.filter((c) => c.prodigy).every((c) => c.aura === 'rising' && c.career?.events === 1)).toBe(true);
    expect(cards.filter((c) => c.aura === 'goat').every((c) => c.career!.titles >= 2 && c.career!.top3 >= 2)).toBe(true);
    expect(cards.every((c) => c.career && c.career.events >= 1)).toBe(true);
  });

  it('names the obvious ones: Chronicle and Derke GOATs, yay 2022 a legend, Sacy 2024 a legend and anchor, Demon1 a prodigy', () => {
    expect(find('chronicle', 'masters-tokyo-2023').aura).toBe('goat');
    expect(find('derke', 'champions-2024').aura).toBe('goat');
    expect(find('yay', 'champions-2022').aura).toBe('legend');
    expect(find('yay', 'champions-2022').career).toEqual({ events: 5, titles: 1, top3: 3, high: 5 });
    expect(find('sacy', 'masters-madrid-2024').aura).toBe('legend');
    expect(find('sacy', 'champions-2022').anchor).toBe(true);
    expect(find('boaster', 'masters-tokyo-2023').anchor).toBe(true);
    expect(find('demon1', 'masters-tokyo-2023').prodigy).toBe(true);
    expect(find('demon1', 'masters-tokyo-2023').aura).toBe('rising');
    // A debutant champion is not an anchor, even rated above the team's median.
    expect(find('tkzin', 'champions-2026').aura).toBe('rising');
    expect(find('tkzin', 'champions-2026').anchor).toBeUndefined();
    // Saadhak leads (IGL) but his facts stop at 'regular' before his titles stack up.
    expect(find('saadhak', 'champions-2021').aura).toBeUndefined();
  });

  it('facts never look ahead: a card only counts events up to and including its own', () => {
    expect(find('aspas', 'masters-reykjavik-2022').career).toEqual({ events: 1, titles: 0, top3: 0, high: 1 });
    expect(find('aspas', 'champions-2022').career!.titles).toBe(1);
    expect(find('aspas', 'champions-2025').career!.events).toBe(10);
    const regional = REGIONAL_ROSTERS.flatMap((r) => r.cards).find((c) => c.handle === 'aspas' && c.eventId === 'americas-kickoff-2024')!;
    expect(regional.career!.events).toBe(6);
    expect(regional.aura).toBe('star');
    expect(regional.prodigy).toBeUndefined();
  });

  it('presence is the KAST percentile, not a second OVR', () => {
    const rated = cards.filter((c) => c.stats?.kast !== null && c.stats?.kast !== undefined);
    const corr = (xs: number[], ys: number[]) => {
      const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
      const my = ys.reduce((s, y) => s + y, 0) / ys.length;
      const sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i]! - my), 0);
      const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
      const syy = ys.reduce((s, y) => s + (y - my) ** 2, 0);
      return sxy / Math.sqrt(sxx * syy);
    };
    const withKast = corr(rated.map((c) => c.attrs.presence), rated.map((c) => c.stats!.kast!));
    const withOvr = corr(rated.map((c) => c.attrs.presence), rated.map((c) => c.ovr));
    expect(withKast).toBeGreaterThan(0.8);
    expect(withOvr).toBeLessThan(withKast);
  });
});
