import { describe, expect, it } from 'vitest';
import { openSlots } from '../engine/draft';
import { rosterKey } from '../engine/roster';
import { cardFit } from '../engine/team';
import { REGIONS, type Card, type Region } from '../engine/types';
import { leaguePlaceOf } from '../engine/league';
import { ALL_ROSTERS } from '../data/real';
import { isVetoComplete, remainingMaps } from '../engine/veto';
import { explainPrice } from './explain';
import {
  LEAGUE_PRIZE,
  MARKET_MAX_SIGNINGS,
  MARKET_SALE_SHARE,
  MARKET_START_BUDGET,
  MARKET_TIERS,
  USER_ID,
  applyUserVeto,
  beginUserVeto,
  chooseRegion,
  closeMarket,
  createSeason,
  fieldCandidates,
  marketOffers,
  seasonTeamInfo,
  parseSeason,
  pickSeasonCoach,
  pickSeasonPlayer,
  playUserMatch,
  playerValue,
  regionPool,
  rollSeasonDraft,
  saleValue,
  seasonCoachOptions,
  seasonDraftOptions,
  seasonLineup,
  signFreeAgent,
  signingPreview,
  startLeague,
  userLineup,
  type SeasonState,
} from './season';

function autoDraft(s: SeasonState): SeasonState {
  let r = s;
  while (r.stage === 'draft' && r.draft!.phase !== 'coach') {
    if (r.draft!.phase === 'roll') r = rollSeasonDraft(r);
    const open = openSlots(r.draft!);
    const options = [...seasonDraftOptions(r)].sort((x, y) => y.ovr - x.ovr);
    const card = options.find((c) => open.includes(c.role)) ?? options[0]!;
    r = pickSeasonPlayer(r, card.id, open.includes(card.role) ? card.role : open.includes('flex') ? 'flex' : open[0]!);
  }
  return pickSeasonCoach(r, seasonCoachOptions(r)[0]!.id);
}

function playOne(s: SeasonState): SeasonState {
  let r = beginUserVeto(s);
  while (!isVetoComplete(r.veto!.state)) r = applyUserVeto(r, remainingMaps(r.veto!.state)[0]!);
  return playUserMatch(r);
}

/** The first season (over a few seeds) that reaches the first market window, on an easy setting. */
function firstMarket(): SeasonState {
  for (let i = 0; i < 30; i++) {
    const region: Region = (['americas', 'emea', 'pacific', 'china'] as const)[i % 4]!;
    let s = startLeague(autoDraft(chooseRegion(createSeason(`mk-${i}`, 'easy'), region)), 'Mercado');
    while (s.stage === 'league') s = playOne(s);
    if (s.stage === 'market') return s;
  }
  throw new Error('No season reached the market');
}

const market = firstMarket();
const pool = regionPool(market.region!);
const cardById = new Map<string, Card>(pool.flatMap((e) => e.cards.map((c) => [c.id, c] as const)));

describe('player value', () => {
  it('doubles every 4 OVR from 100 at OVR 80, with aura and IGL premiums', () => {
    const plain = (ovr: number): Card => ({ ...[...cardById.values()][0]!, ovr, aura: undefined, isIGL: false });
    expect(playerValue(plain(80))).toBe(100);
    expect(playerValue(plain(84))).toBe(200);
    expect(playerValue(plain(88))).toBe(400);
    expect(playerValue(plain(76))).toBe(50);
    expect(playerValue({ ...plain(80), isIGL: true })).toBe(115);
    expect(playerValue({ ...plain(80), aura: 'goat' })).toBe(130);
    expect(playerValue(plain(60))).toBe(10);
    expect(saleValue(plain(84))).toBe(200 * MARKET_SALE_SHARE);
    expect(explainPrice(plain(84))).toMatch(/OVR 84/);
    expect(explainPrice({ ...plain(84), isIGL: true })).toMatch(/IGL/);
  });
});

describe('free agency', () => {
  it('opens after the league with the prize, offers and the next field', () => {
    const m = market.market!;
    expect(market.stage).toBe('market');
    expect(m.window).toBe('post-league');
    expect(m.maxSignings).toBe(MARKET_MAX_SIGNINGS);
    expect(Object.values(LEAGUE_PRIZE)).toContain(m.prize);
    expect(m.budget).toBe(MARKET_START_BUDGET + m.prize);
    expect(m.nextField).toHaveLength(8);
    expect(m.nextField).toContain(USER_ID);

    const offers = marketOffers(market);
    const total = MARKET_TIERS.star + MARKET_TIERS.mid + MARKET_TIERS.value;
    expect(offers.length).toBeGreaterThanOrEqual(10);
    expect(offers.length).toBeLessThanOrEqual(total);
    const players = offers.map((o) => o.card.playerId);
    expect(new Set(players).size).toBe(players.length);
    const banned = new Set(seasonLineup(market).players.map((p) => p.card.playerId));
    for (const id of m.nextField) if (id !== USER_ID) for (const e of pool.filter((x) => rosterKey(x) === id)) for (const c of e.cards) banned.add(c.playerId);
    for (const o of offers) {
      expect(banned.has(o.card.playerId)).toBe(false);
      expect(cardById.has(o.card.id)).toBe(true);
      expect(o.price).toBe(playerValue(o.card));
      expect(o.teamName.length).toBeGreaterThan(0);
    }
    // Most expensive first, with stars and cheap picks.
    for (let i = 1; i < offers.length; i++) expect(offers[i - 1]!.price).toBeGreaterThanOrEqual(offers[i]!.price);
    expect(offers[0]!.price).toBeGreaterThan(3 * offers[offers.length - 1]!.price);
    expect(userLineup(market).players).toHaveLength(5);
  });

  it('signs into the released player’s slot, crediting the sale and charging the price', () => {
    const offers = marketOffers(market);
    const cheap = offers[offers.length - 1]!;
    const out = seasonLineup(market).players[0]!;
    const pre = signingPreview(market, cheap.card.id, out.card.id);
    expect(pre.blocked).toBeNull();
    expect(pre.slot).toBe(out.slot);
    expect(pre.fit).toBe(cardFit(cheap.card, out.slot));
    const s = signFreeAgent(market, cheap.card.id, `${out.card.id}#user`);
    const m = s.market!;
    expect(m.budget).toBe(market.market!.budget + saleValue(out.card) - cheap.price);
    expect(pre.budgetAfter).toBe(m.budget);
    expect(m.signed).toEqual([{ in: cheap.card.id, out: out.card.id, price: cheap.price, sale: saleValue(out.card) }]);
    const lineup = seasonLineup(s);
    expect(lineup.players[0]!.card.id).toBe(cheap.card.id);
    expect(lineup.players[0]!.slot).toBe(out.slot);
    expect(marketOffers(s).some((o) => o.card.id === cheap.card.id)).toBe(false);
    expect(parseSeason(JSON.parse(JSON.stringify(s)))).toEqual(s);

    // Validation.
    expect(() => signFreeAgent(s, cheap.card.id, lineup.players[1]!.card.id)).toThrow(/already signed|not on offer/);
    expect(() => signFreeAgent(s, offers[0]!.card.id, 'nobody')).toThrow(/not in the lineup/);
    expect(() => signFreeAgent(market, 'nope', out.card.id)).toThrow(/not on offer/);
    const broke: SeasonState = { ...s, market: { ...m, budget: -10_000 } };
    expect(() => signFreeAgent(broke, offers[0]!.card.id, lineup.players[1]!.card.id)).toThrow(/budget/);
    expect(signingPreview(broke, offers[0]!.card.id, lineup.players[1]!.card.id).blocked).toMatch(/Orçamento/);
    let full = s;
    const rest = marketOffers(s).slice(-MARKET_MAX_SIGNINGS);
    full = { ...full, market: { ...full.market!, budget: 100_000 } };
    full = signFreeAgent(full, rest[0]!.card.id, seasonLineup(full).players[1]!.card.id);
    expect(() => signFreeAgent(full, rest[1]!.card.id, seasonLineup(full).players[2]!.card.id)).toThrow(/signings per window/);
  });

  it('closes into the Masters with the field fixed at opening and keeps the money', () => {
    const offers = marketOffers(market);
    const out = seasonLineup(market).players[4]!;
    const signed = signFreeAgent(market, offers[offers.length - 1]!.card.id, out.card.id);
    const next = closeMarket(signed);
    expect(['masters', 'champions', 'market', 'done']).toContain(next.stage);
    expect(next.market === undefined || next.market.window === 'post-masters').toBe(true);
    expect(next.funds).toBe(signed.market!.budget);
    expect(next.transfers).toEqual([{ ...signed.market!.signed[0]!, window: 'post-league' }]);
    expect(next.masters!.entrants.map((e) => e.id).sort()).toEqual([...market.market!.nextField].sort());
    expect(() => closeMarket(next.stage === 'market' ? { ...next, stage: 'masters' } : next)).toThrow(/market/);
    // Deterministic.
    expect(JSON.stringify(closeMarket(signFreeAgent(market, offers[offers.length - 1]!.card.id, out.card.id)))).toBe(JSON.stringify(next));
    // Skipping the window costs nothing.
    expect(closeMarket(market).funds).toBe(market.market!.budget);
  });

  it('opens a second window after the Masters with the carried money plus the Masters prize', () => {
    let s = closeMarket(market);
    for (let guard = 0; s.stage === 'masters' && guard < 20; guard++) s = playOne(s);
    expect(s.stage).toBe('market');
    expect(s.market!.window).toBe('post-masters');
    expect(s.market!.budget).toBe(market.market!.budget + s.market!.prize);
    expect(s.market!.nextField).toHaveLength(16);
    expect(parseSeason(JSON.parse(JSON.stringify(s)))).toEqual(s);
    const after = closeMarket(s);
    expect(after.champions!.entrants.map((e) => e.id).sort()).toEqual([...s.market!.nextField].sort());
  });
});

describe('offers never bring a player the user can still face', () => {
  it('after the league: not from the Masters field, the league top 4 (Champions) or any other region’s candidates', () => {
    const byKey = new Map(ALL_ROSTERS.map((e) => [rosterKey(e), e]));
    let windows = 0;
    for (let i = 0; i < 40 && windows < 12; i++) {
      const region: Region = REGIONS[i % 4]!;
      let s = startLeague(autoDraft(chooseRegion(createSeason(`face-${i}`, 'easy'), region)), 'Face');
      while (s.stage === 'league') s = playOne(s);
      if (s.stage !== 'market') continue;
      windows++;
      const faced = new Set<string>(s.market!.nextField);
      for (const e of s.league!.entrants) if ((leaguePlaceOf(s.league!, e.id)?.rank ?? 99) <= 4) faced.add(e.id);
      for (const r of REGIONS) if (r !== region) for (const e of fieldCandidates(r, s.field)) faced.add(rosterKey(e));
      faced.delete(USER_ID);
      const banned = new Set([...faced].flatMap((id) => byKey.get(id)!.cards.map((c) => c.playerId)));
      for (const o of marketOffers(s)) expect(banned.has(o.card.playerId)).toBe(false);
      // The Champions that follows never has a signed player on both sides.
      let t = s;
      const offer = marketOffers(t).find((o) => !signingPreview(t, o.card.id, seasonLineup(t).players[0]!.card.id).blocked);
      if (offer) t = signFreeAgent(t, offer.card.id, seasonLineup(t).players[0]!.card.id);
      t = closeMarket(t);
      while (t.stage === 'masters') t = playOne(t);
      if (t.stage !== 'market') continue;
      t = closeMarket(t);
      if (!offer) continue;
      for (const e of t.champions!.entrants) {
        if (e.id !== USER_ID) expect(byKey.get(e.id)!.cards.some((c) => c.playerId === offer.card.playerId)).toBe(false);
      }
    }
    expect(windows).toBeGreaterThan(5);
  });

  it('previews the strength the hub shows (same tournament form as the matches)', () => {
    const out = seasonLineup(market).players[0]!.card.id;
    const pre = signingPreview(market, marketOffers(market)[0]!.card.id, out);
    expect(pre.strengthBefore).toBeCloseTo(seasonTeamInfo(market, USER_ID).strength, 9);
  });
});
