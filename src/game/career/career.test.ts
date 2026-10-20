import { describe, expect, it } from 'vitest';
import { createRng } from '../../engine/rng';
import { deserializeCareer, serializeCareer } from '../persist';
import {
  ACADEMY_SALARY,
  AGING_FLOOR,
  AGING_MAX_DELTA,
  AGING_MIN_DELTA,
  CAREER_DIFFICULTY,
  CAREER_VERSION,
  MAX_ACADEMY,
  OVR_MAX,
  OVR_MIN,
  PROSPECT_MAX_EXP,
  PROSPECT_MAX_OVR,
  REP_CHAMPIONS,
  REP_CHAMPIONS_ENTRY,
  REP_DRIFT,
  REP_LEAGUE,
  REP_MASTERS,
  REP_MASTERS_ENTRY,
  REP_SEASON_MVP,
  REP_SPONSOR_FAIL,
  SCRIMS_PER_STAGE,
} from './constants';
import {
  USER_ID,
  acceptSponsor,
  advanceToNextSeason,
  applyUserVeto,
  beginUserVeto,
  benchPlayer,
  createCareer,
  isFreeAgent,
  offerTerms,
  parseCareer,
  playScrim,
  playUserMatch,
  promoteAcademy,
  releasePlayer,
  renewContract,
  renewalBlock,
  scrimOpponents,
  scrimsLeft,
  setStarter,
  signPlayer,
  signProspect,
  signingBlock,
  startBlocks,
  startStage,
  starters,
  userPendingMatch,
  type CareerState,
} from './career';
import { autoOffseason, autoPlayMatch, autoSeason } from './autopilot';
import {
  careerFinances,
  careerLeagueViews,
  careerRoster,
  careerSummary,
  marketOffers,
  prospectOffers,
  scrimReport,
  seasonReport,
  signingPreview,
  sponsorsView,
} from './views';
import { CAREER_START_YEAR, agingStep, experience, playerInfo, potentialOf } from './world';
import { nextTurn } from '../../engine/veto';

const fresh = (seed = 'career-t', difficulty: CareerState['org']['difficulty'] = 'normal'): CareerState =>
  createCareer({ name: 'Org Teste', tag: 'ot', region: 'americas', difficulty, seed });

let readyCache: CareerState | null = null;
/** An off-season with a full lineup (the greedy manager's), ready to start the league. */
const ready = (): CareerState => (readyCache ??= autoOffseason(fresh(), { scrims: false }));

let seasonCache: CareerState | null = null;
const oneSeason = (): CareerState => (seasonCache ??= autoSeason(fresh('career-season')));

const ledgerSum = (c: CareerState) => c.ledger.reduce((s, e) => s + e.amount, 0);
const allLeaguePlayers = (c: CareerState) => c.aiTeams.flatMap((t) => t.players.map((p) => p.id));

describe('createCareer', () => {
  it('opens the first off-season with the org, the market and the league teams', () => {
    const c = fresh();
    expect(c.version).toBe(CAREER_VERSION);
    expect(c.phase).toBe('offseason');
    expect(c.year).toBe(CAREER_START_YEAR);
    expect(c.org).toEqual({ name: 'Org Teste', tag: 'OT', region: 'americas', difficulty: 'normal' });
    expect(c.money).toBe(CAREER_DIFFICULTY.normal.money);
    expect(c.reputation).toBe(CAREER_DIFFICULTY.normal.reputation);
    expect(c.players).toEqual([]);
    expect(c.aiTeams).toHaveLength(11);
    for (const t of c.aiTeams) expect(t.players).toHaveLength(5);
    const ids = allLeaguePlayers(c);
    expect(new Set(ids).size).toBe(ids.length);
    const w = c.window!;
    expect(w.kind).toBe('offseason');
    expect(w.offers.length).toBeGreaterThanOrEqual(20);
    // Every role can be filled with a free agent.
    const freeRoles = new Set(marketOffers(c).filter((o) => o.kind === 'free').map((o) => o.role));
    expect(freeRoles.size).toBe(4);
    expect(w.sponsorOffers).toHaveLength(4);
    expect(w.coaches.length).toBeGreaterThan(0);
    for (const p of prospectOffers(c)) {
      expect(p.ovr).toBeLessThanOrEqual(PROSPECT_MAX_OVR);
      expect(p.experience).toBeLessThanOrEqual(PROSPECT_MAX_EXP);
    }
    expect(startBlocks(c)[0]).toMatch(/titulares/);
  });

  it('derives a tag from the name and rejects unknown regions', () => {
    expect(createCareer({ name: 'Furia Azul', region: 'emea', seed: 'x' }).org.tag).toBe('FA');
    expect(() => createCareer({ name: 'x', region: 'mars' as never, seed: 'x' })).toThrow();
  });
});

describe('market and contracts', () => {
  it('signing pays the fee, fills a slot and keeps the books balanced', () => {
    const c = fresh();
    const offer = marketOffers(c).find((o) => !o.block && o.kind === 'free')!;
    const preview = signingPreview(c, offer.playerId);
    expect(preview.block).toBeNull();
    const next = signPlayer(c, offer.playerId, 3);
    const p = next.players[0]!;
    expect(p.status).toBe('starter');
    expect(p.contract).toEqual({ salary: offer.salary, years: 3 });
    expect(next.money).toBe(c.money - offer.fee);
    expect(next.money).toBe(next.seasonStart.money + ledgerSum(next));
    expect(signingBlock(next, offer.playerId)).toMatch(/elenco/);
  });

  it('a buyout takes the player from his league team, which signs a free agent', () => {
    const c = { ...fresh(), reputation: 100, money: 50_000 };
    const offer = marketOffers(c).find((o) => o.kind === 'team')!;
    const next = signPlayer(c, offer.playerId);
    const team = next.aiTeams.find((t) => t.id === offer.ref.from)!;
    expect(team.players).toHaveLength(5);
    expect(team.players.some((p) => p.id === offer.playerId)).toBe(false);
    const ids = [...allLeaguePlayers(next), ...next.players.map((p) => p.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(isFreeAgent(next, offer.playerId)).toBe(false);
  });

  it('players refuse a small org and the cash cannot go below zero by a signing', () => {
    const c = fresh();
    const star = marketOffers(c).find((o) => o.requiredRep > c.reputation);
    if (star) expect(() => signPlayer(c, star.playerId)).toThrow(/reputação/);
    const poor = { ...c, money: 0 };
    const pricey = marketOffers(poor).find((o) => o.fee > 0 && o.requiredRep <= c.reputation)!;
    expect(signingBlock(poor, pricey.playerId)).toBe('Caixa insuficiente');
  });

  it('the roster holds 5 starters + 2 bench, and the mid-season window 2 signings', () => {
    let c: CareerState = { ...fresh(), money: 100_000, reputation: 100 };
    for (const o of marketOffers(c)) {
      if (c.players.length >= 7) break;
      if (!signingBlock(c, o.playerId)) c = signPlayer(c, o.playerId);
    }
    expect(c.players.filter((p) => p.status !== 'academy')).toHaveLength(7);
    const extra = marketOffers(c).find((o) => !c.players.some((p) => p.id === o.playerId))!;
    expect(signingBlock(c, extra.playerId)).toMatch(/Elenco cheio/);
  });

  it('selling credits half the value; expired contracts leave when the league starts unless renewed', () => {
    const s = oneSeason();
    expect(s.phase).toBe('report');
    let next = advanceToNextSeason(s);
    for (const p of next.players) {
      const before = s.players.find((x) => x.id === p.id)!;
      expect(p.contract.years).toBe(Math.max(0, before.contract.years - 1));
    }
    const lastYear = next.players.find((p) => p.contract.years <= 1 && !renewalBlock(next, p.id));
    if (lastYear) {
      const renewed = renewContract(next, lastYear.id, 2);
      expect(renewed.players.find((p) => p.id === lastYear.id)!.contract.years).toBe(lastYear.contract.years + 2);
    }
    const longer = next.players.find((p) => p.contract.years > 1);
    if (longer) expect(renewalBlock(next, longer.id)).toMatch(/último ano/);
    const seller = next.players.find((p) => p.contract.years >= 1)!;
    const credited = releasePlayer(next, seller.id);
    expect(credited.money).toBeGreaterThan(next.money);
    expect(credited.players.some((p) => p.id === seller.id)).toBe(false);
    // Expired players are gone once the league starts.
    next = autoOffseason(next, { scrims: false });
    if (startBlocks(next).length === 0) {
      const started = startStage(next);
      expect(started.players.every((p) => p.contract.years > 0)).toBe(true);
    }
  });
});

describe('lineup', () => {
  it('setStarter swaps slots and benchPlayer empties one', () => {
    const c = ready();
    const [a, b] = starters(c);
    const swapped = setStarter(c, a!.id, b!.slot!);
    expect(swapped.players.find((p) => p.id === a!.id)!.slot).toBe(b!.slot);
    expect(swapped.players.find((p) => p.id === b!.id)!.slot).toBe(a!.slot);
    const benched = benchPlayer(c, a!.id);
    expect(starters(benched)).toHaveLength(4);
    expect(startBlocks(benched).length).toBeGreaterThan(0);
  });
});

describe('academy, coach and sponsors', () => {
  it('prospects join the academy cheaply and get promoted with a real contract', () => {
    let c = fresh();
    const prospects = prospectOffers(c);
    expect(prospects.length).toBeGreaterThan(0);
    for (const p of prospects.slice(0, MAX_ACADEMY)) c = signProspect(c, p.playerId);
    const academy = c.players.filter((p) => p.status === 'academy');
    expect(academy.length).toBe(Math.min(MAX_ACADEMY, prospects.length));
    for (const p of academy) expect(p.contract).toEqual({ salary: ACADEMY_SALARY, years: 3 });
    const promoted = promoteAcademy(c, academy[0]!.id);
    const p = promoted.players.find((x) => x.id === academy[0]!.id)!;
    expect(p.status).not.toBe('academy');
    expect(p.contract.years).toBe(2);
    // The academy develops faster: same draw, +1 when growing.
    const rng = () => createRng('academy-growth');
    const base = agingStep(rng(), { ovr: 70, potential: 90, experience: 1, prodigy: false, share: 1 });
    const academyStep = agingStep(rng(), { ovr: 70, potential: 90, experience: 1, prodigy: false, share: 0, academy: true });
    expect(academyStep.delta).toBe(base.delta + 1);
  });

  it('sponsor slots follow the reputation', () => {
    const c = fresh();
    const view = sponsorsView(c);
    expect(view.slots).toBe(1);
    const next = acceptSponsor(c, view.offers[0]!.offer.id);
    expect(() => acceptSponsor(next, view.offers[1]!.offer.id)).toThrow(/patrocinador/);
  });

  it('sponsor objectives pay the bonus or cost reputation, and the reputation adds up', () => {
    const s = oneSeason();
    const r = seasonReport(s)!;
    for (const sp of r.sponsors) {
      const met =
        sp.objective === 'league-top6' ? !!r.league && r.league.rank <= 6
        : sp.objective === 'league-top4' ? !!r.league && r.league.rank <= 4
        : sp.objective === 'masters' ? !!r.masters
        : sp.objective === 'champions' ? !!r.champions
        : sp.objective === 'title' ? r.titles.length > 0
        : sp.met;
      expect(sp.met).toBe(met);
      expect(sp.bonus).toBe(met ? s.sponsors.find((x) => x.name === sp.name)!.bonus : 0);
    }
    const bonus = s.ledger.filter((e) => e.kind === 'bonus').reduce((a, e) => a + e.amount, 0);
    expect(bonus).toBe(r.sponsors.reduce((a, x) => a + x.bonus, 0));
    const expected =
      r.reputation.start +
      (REP_LEAGUE[r.league!.rank] ?? 0) +
      (r.masters ? REP_MASTERS_ENTRY + (REP_MASTERS[r.masters.rank] ?? 0) : 0) +
      (r.champions ? REP_CHAMPIONS_ENTRY + (REP_CHAMPIONS[r.champions.rank] ?? 0) : 0) +
      (r.awards.mvp?.isUser ? REP_SEASON_MVP : 0) +
      REP_DRIFT +
      REP_SPONSOR_FAIL * r.sponsors.filter((x) => !x.met).length;
    expect(r.reputation.end).toBe(Math.max(0, Math.min(100, expected)));
    expect(s.reputation).toBe(r.reputation.end);
  });
});

describe('season loop', () => {
  it('plays the org matches with the veto and keeps the books balanced', () => {
    let c = startStage(ready());
    expect(c.phase).toBe('league');
    expect(c.money).toBe(c.seasonStart.money + c.ledger.reduce((s, e) => s + e.amount, 0));
    const pending = userPendingMatch(c)!;
    expect(pending.stage).toBe('league');
    c = beginUserVeto(c);
    while (c.veto && nextTurn(c.veto.state)) {
      const turn = nextTurn(c.veto.state)!;
      expect(turn.team).toBe(pending.side);
      const used = new Set(c.veto.state.steps.map((s) => s.map));
      c = applyUserVeto(c, c.veto.state.pool.find((m) => !used.has(m))!);
    }
    c = playUserMatch(c);
    expect(c.userSeries[`league:${pending.match.id}`]).toBeDefined();
    expect(c.boxScores[`league:${pending.match.id}`]).toBeDefined();
    expect(careerLeagueViews(c)[0]!.rows.some((r) => r.isUser && r.wins + r.losses === 1)).toBe(true);
  });

  it('a whole season ends in a report with awards, finances and player lines', () => {
    const s = oneSeason();
    const r = seasonReport(s)!;
    expect(r.year).toBe(CAREER_START_YEAR);
    expect(r.league).not.toBeNull();
    expect(r.awards.mvp).toBeDefined();
    expect(r.money.end).toBe(s.money);
    expect(s.money).toBe(s.seasonStart.money + ledgerSum(s));
    expect(r.path.startsWith('Liga')).toBe(true);
    for (const p of s.players) expect(p.history).toHaveLength(1);
    expect(s.champions?.phase).toBe('done');
    expect(careerSummary(s).seasonsPlayed).toBe(1);
  });

  it('is deterministic: same seed and actions, same career', () => {
    const a = autoSeason(fresh('det'));
    const b = autoSeason(fresh('det'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = autoSeason(fresh('det-2'));
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
  });

  it('the next season ages everyone, keeps the league whole and opens the off-season', () => {
    const s = oneSeason();
    const next = advanceToNextSeason(s);
    expect(next.year).toBe(s.year + 1);
    expect(next.season).toBe(2);
    expect(next.phase).toBe('offseason');
    expect(next.league).toBeUndefined();
    expect(next.boxScores).toEqual({});
    expect(next.history).toHaveLength(1);
    for (const t of next.aiTeams) expect(t.players).toHaveLength(5);
    const ids = [...allLeaguePlayers(next), ...next.players.map((p) => p.id)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of next.players) {
      expect(p.progress?.year).toBe(next.year);
      expect(p.ovr).toBe(p.progress!.to);
      expect(Math.abs(p.morale - 65)).toBeLessThanOrEqual(Math.abs(s.players.find((x) => x.id === p.id)!.morale - 65));
    }
    expect(() => advanceToNextSeason(next)).toThrow();
  });
});

describe('scrims', () => {
  it('never touch the standings, add familiarity and report every player', () => {
    const c = startStage(ready());
    const left = scrimsLeft(c);
    expect(left).toBe(SCRIMS_PER_STAGE.league);
    const opponent = scrimOpponents(c)[0]!;
    const after = playScrim(c, opponent, 'Lotus');
    expect(after.league).toEqual(c.league);
    expect(after.boxScores).toEqual(c.boxScores);
    expect(after.money).toBe(c.money);
    expect(scrimsLeft(after)).toBe(left - 1);
    expect(after.mapsPlayed[USER_ID]?.Lotus ?? 0).toBe((c.mapsPlayed[USER_ID]?.Lotus ?? 0) + 1);
    expect(after.mapsPlayed[opponent]).toEqual(c.mapsPlayed[opponent]);
    const report = scrimReport(after, 1);
    expect(report.scrim.map).toBe('Lotus');
    expect(report.rows).toHaveLength(10);
    expect(report.rows.filter((r) => r.isUser)).toHaveLength(5);
    expect(after.userSeries['scrim:1']).toBeDefined();
    let used = after;
    while (scrimsLeft(used) > 0) used = playScrim(used, opponent);
    expect(() => playScrim(used, opponent)).toThrow(/scrims/);
  });
});

describe('aging', () => {
  it('stays within bounds: growth capped by potential, decline floored', () => {
    const rng = createRng('aging-bounds');
    for (let i = 0; i < 2000; i++) {
      const ovr = rng.int(55, 95);
      const potential = ovr + rng.int(0, 8);
      const input = {
        ovr,
        potential,
        experience: rng.int(0, 13),
        prodigy: rng.next() < 0.2,
        share: rng.next(),
        morale: rng.int(0, 100),
        focus: rng.next() < 0.3,
        academy: rng.next() < 0.2,
        international: rng.next() < 0.3,
      };
      const r = agingStep(createRng(`a${i}`), input);
      expect(r.delta).toBeGreaterThanOrEqual(AGING_MIN_DELTA);
      expect(r.delta).toBeLessThanOrEqual(AGING_MAX_DELTA);
      expect(r.ovr).toBeGreaterThanOrEqual(OVR_MIN);
      expect(r.ovr).toBeLessThanOrEqual(OVR_MAX);
      if (r.delta > 0) expect(r.ovr).toBeLessThanOrEqual(Math.max(ovr, potential));
      if (r.delta < 0) expect(r.ovr).toBeGreaterThanOrEqual(Math.min(ovr, AGING_FLOOR));
    }
  });

  it('young players grow and veterans decline on average', () => {
    const mean = (exp: number) => {
      let sum = 0;
      for (let i = 0; i < 400; i++) sum += agingStep(createRng(`m${exp}:${i}`), { ovr: 78, potential: 90, experience: exp, prodigy: false, share: 1 }).delta;
      return sum / 400;
    };
    expect(mean(1)).toBeGreaterThan(1);
    expect(mean(5)).toBeGreaterThanOrEqual(0);
    expect(mean(10)).toBeLessThan(-1.5);
  });

  it('potential is fixed per career and player, never below his latest card', () => {
    const id = fresh().aiTeams[0]!.players[0]!.id;
    expect(potentialOf('a', id)).toBe(potentialOf('a', id));
    expect(potentialOf('a', id)).toBeGreaterThanOrEqual(playerInfo(id).ovr);
    expect(experience(id, CAREER_START_YEAR + 3)).toBe(experience(id, CAREER_START_YEAR) + 3);
  });

  it('roster rows explain phase, aura and contract', () => {
    const rows = careerRoster(oneSeason());
    for (const r of rows) {
      expect(r.handle).toBeTruthy();
      expect(['Jovem', 'Auge', 'Veterano', 'Lenda em declínio']).toContain(r.phaseLabel);
      expect(r.value).toBeGreaterThan(0);
    }
  });
});

describe('finances and bankruptcy', () => {
  it('a season ending deep in the red ends the career; a small debt is a warning first', () => {
    const base = startStage(ready());
    let broke: CareerState = { ...base, money: -5000, seasonStart: { ...base.seasonStart, money: base.seasonStart.money - 5000 - base.money } };
    while (broke.phase !== 'report' && broke.phase !== 'over') {
      if (broke.phase === 'midseason') broke = startStage(broke);
      else broke = autoPlayMatch(broke);
    }
    expect(broke.phase).toBe('over');
    expect(broke.over).toBe('bankrupt');
    expect(seasonReport(broke)!.bankrupt).toBe(true);
    expect(() => advanceToNextSeason(broke)).toThrow();

    let red: CareerState = { ...base, money: -2000 };
    while (red.phase !== 'report' && red.phase !== 'over') red = red.phase === 'midseason' ? startStage(red) : autoPlayMatch(red);
    if (red.money < 0 && red.money > -1000) {
      expect(red.phase).toBe('report');
      expect(red.debtWarning).toBe(true);
      const next = advanceToNextSeason(red);
      expect(careerFinances(next).floor).toBe(0);
    }
  });
});

describe('saves', () => {
  it('round-trip losslessly at every phase and reject garbage', () => {
    const states = [fresh(), ready(), startStage(ready()), oneSeason(), advanceToNextSeason(oneSeason())];
    for (const s of states) {
      expect(deserializeCareer(serializeCareer(s))).toEqual(s);
      expect(deserializeCareer(JSON.stringify(s))).toEqual(s);
      expect(parseCareer(JSON.parse(JSON.stringify(s)))).not.toBeNull();
    }
    expect(deserializeCareer('nope')).toBeNull();
    expect(deserializeCareer(JSON.stringify({ ...fresh(), version: 0 }))).toBeNull();
    // A full season packs small enough for localStorage.
    expect(serializeCareer(oneSeason()).length).toBeLessThan(500_000);
  });
});

describe('offer terms', () => {
  it('price buyouts at the value, free agents at 25% and imports at 50%', () => {
    const c = fresh();
    for (const o of marketOffers(c)) {
      const t = offerTerms(c, o.ref);
      const share = o.kind === 'team' ? 1 : o.kind === 'free' ? 0.25 : 0.5;
      expect(Math.abs(t.fee - t.value * share)).toBeLessThanOrEqual(2.5);
      expect(t.salary).toBeGreaterThan(0);
    }
  });
});
