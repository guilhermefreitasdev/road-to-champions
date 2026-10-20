/**
 * A greedy manager for the career: what src/game/career/balance.test.ts plays with to measure the balance, and what
 * the UI can offer as "auto" (sign for empty slots, auto-veto). Pure and deterministic, over the public actions only.
 *
 * Policy: renew whoever is still worth it; take the sponsors that pay most (base + bonus × a rough chance); hire the
 * best coach the money allows; fill empty slots with the best score (OVR × fit, +IGL when the team has none) within a
 * per-slot budget; then upgrade the weakest link while the strength gain is ≥ UPGRADE_MIN_GAIN and the cash after the
 * payroll stays above `reserve`; sign prospects with high potential; promote academy players who caught up; use the
 * scrims; veto like the AI does.
 */
import { SLOTS } from '../../engine/draft';
import { cardFit, teamStrength } from '../../engine/team';
import type { Slot } from '../../engine/types';
import { aiChooseMap, nextTurn } from '../../engine/veto';
import { createRng } from '../../engine/rng';
import { difficultySettings } from '../difficulty';
import { MAX_ACADEMY, MAX_BENCH, STARTERS, type SponsorObjective } from './constants';
import {
  USER_ID,
  acceptSponsor,
  applyUserVeto,
  autoLineup,
  baseUserLineup,
  beginUserVeto,
  careerVetoLineup,
  coachReputation,
  coachSalary,
  findCareerCoach,
  hireCoach,
  offerTerms,
  payroll,
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
  sponsorBase,
  sponsorSlots,
  starters,
  startBlocks,
  saleCredit,
  startStage,
  userPendingMatch,
  type CareerState,
} from './career';
import { cardById } from './world';

export interface AutopilotOptions {
  /** Minimum cash after the season's payroll the manager keeps (negative = uses the credit line). Default 0. */
  reserve?: number;
  /** Upgrades per off-season (default 3) and per mid-season window (default 1). */
  upgrades?: number;
  midseasonUpgrades?: number;
  /** Strength points an upgrade must add (default 0.8). */
  minGain?: number;
  /** Use the scrims (default true). */
  scrims?: boolean;
}

/** Rough chance of meeting each sponsor objective, for ranking the offers. */
const OBJECTIVE_CHANCE: Record<SponsorObjective, number> = {
  'league-top6': 0.6,
  'league-top4': 0.4,
  masters: 0.3,
  champions: 0.35,
  title: 0.1,
  'top5-rating': 0.3,
};

const strength = (c: CareerState): number => {
  try {
    return teamStrength(baseUserLineup(c, false)).total;
  } catch {
    return -Infinity;
  }
};

/** Cash left after the season's payroll and sponsors' base pay (what startStage checks). */
const cashAfterStart = (c: CareerState): number => c.money + sponsorBase(c) - payroll(c).total;

function tryOr(c: CareerState, f: (c: CareerState) => CareerState): CareerState {
  try {
    return f(c);
  } catch {
    return c;
  }
}

/** Fills the empty starting slots from the window's offers within a per-slot budget. */
function fillSlots(c0: CareerState, reserve: number): CareerState {
  let c = c0;
  for (let guard = 0; guard < 8; guard++) {
    const five = starters(c);
    if (five.length >= STARTERS) break;
    const used = new Set(five.map((p) => p.slot));
    const open = SLOTS.filter((s) => !used.has(s));
    // A bench player who fits goes in first.
    const bench = c.players.filter((p) => p.status === 'bench').sort((x, y) => y.ovr - x.ovr)[0];
    if (bench) {
      const card = cardById(bench.cardId);
      const slot = open.find((s) => cardFit(card, s) === 1) ?? open[0]!;
      c = setStarter(c, bench.id, slot);
      continue;
    }
    const hasIgl = five.some((p) => cardById(p.cardId).isIGL);
    const budget = (cashAfterStart(c) - reserve) / open.length;
    let best: { id: string; score: number; slot: Slot } | null = null;
    let cheapest: { id: string; cost: number; slot: Slot } | null = null;
    for (const o of c.window?.offers ?? []) {
      if (signingBlock(c, o.playerId)) continue;
      const t = offerTerms(c, o);
      const cost = t.fee + t.salary;
      const slot = open.reduce((a, s) => (cardFit(t.card, s) > cardFit(t.card, a) ? s : a), open[0]!);
      if (!cheapest || cost < cheapest.cost) cheapest = { id: o.playerId, cost, slot };
      if (cost > budget * 1.3) continue;
      const score = t.ovr * cardFit(t.card, slot) + (t.card.isIGL && !hasIgl ? 5 : 0);
      if (!best || score > best.score) best = { id: o.playerId, score, slot };
    }
    const pick = best ?? cheapest;
    if (!pick) break;
    const next = tryOr(c, (x) => signPlayer(x, pick.id));
    if (next === c) break;
    const signed = next.players.find((p) => p.id === pick.id)!;
    c = signed.status === 'starter' ? next : setStarter(next, pick.id, pick.slot);
  }
  return c;
}

/** Replaces the starter whose swap for an offer adds the most strength, when it is worth it and affordable. */
function upgradeOnce(c: CareerState, reserve: number, minGain: number): CareerState | null {
  const before = strength(c);
  let best: { state: CareerState; gain: number } | null = null;
  const five = starters(c);
  for (const o of c.window?.offers ?? []) {
    if (signingBlock(c, o.playerId)) continue;
    const t = offerTerms(c, o);
    if (five.every((p) => p.ovr >= t.ovr + 2) && !t.card.isIGL) continue;
    let signed: CareerState;
    try {
      signed = signPlayer(c, o.playerId);
    } catch {
      continue;
    }
    for (const out of five) {
      try {
        let next = setStarter(signed, o.playerId, out.slot!);
        next = releasePlayer(next, out.id);
        if (cashAfterStart(next) < reserve && next.phase === 'offseason') continue;
        if (next.phase === 'midseason' && next.money < reserve) continue;
        const gain = strength(next) - before;
        if (gain >= minGain && (!best || gain > best.gain)) best = { state: next, gain };
      } catch {
        // Not a legal swap.
      }
    }
  }
  return best?.state ?? null;
}

/** Plays every scrim left on the first league team (auto map). */
function useScrims(c0: CareerState): CareerState {
  let c = c0;
  const [opponent] = scrimOpponents(c);
  while (opponent && scrimsLeft(c) > 0 && starters(c).length === STARTERS) c = playScrim(c, opponent);
  return c;
}

/** The off-season, done greedily; returns the state ready for startStage (or as far as it got). */
export function autoOffseason(c0: CareerState, opts: AutopilotOptions = {}): CareerState {
  const reserve = opts.reserve ?? 0;
  let c = c0;
  if (c.phase !== 'offseason' || !c.window) return c;
  // Renewals: everyone still at the level of the lineup.
  const worst = Math.min(...starters(c).map((p) => p.ovr), 99);
  for (const p of c.players) {
    if (p.contract.years > 0) continue;
    const keep = p.status === 'academy' ? p.potential >= 80 : p.ovr >= worst - 2;
    if (keep && !renewalBlock(c, p.id)) c = renewContract(c, p.id);
  }
  // Sponsors.
  const offers = [...c.window!.sponsorOffers].sort((x, y) => y.base + y.bonus * OBJECTIVE_CHANCE[y.objective] - (x.base + x.bonus * OBJECTIVE_CHANCE[x.objective]));
  for (const o of offers) if (c.sponsors.length < sponsorSlots(c.reputation)) c = tryOr(c, (x) => acceptSponsor(x, o.id));
  // Coach: the best one affordable (salary ≤ 10% of the cash).
  const coaches = c.window!.coaches
    .map((id) => findCareerCoach(id)!)
    .filter((k) => coachReputation(k) <= c.reputation && coachSalary(k) <= Math.max(50, 0.1 * c.money));
  const current = findCareerCoach(c.coach?.id);
  const bestCoach = coaches.sort((x, y) => y.tacticBonus + y.vetoBonus - (x.tacticBonus + x.vetoBonus))[0];
  if (bestCoach && (!current || bestCoach.tacticBonus + bestCoach.vetoBonus > current.tacticBonus + current.vetoBonus)) c = hireCoach(c, bestCoach.id);
  // Expiring players leave at the start: take them off the lineup now so the slots get filled.
  for (const p of c.players) if (p.contract.years <= 0) c = tryOr(c, (x) => releasePlayer(x, p.id));
  c = fillSlots(c, reserve);
  c = autoLineup(c);
  for (let i = 0; i < (opts.upgrades ?? 3); i++) {
    const next = upgradeOnce(c, reserve, opts.minGain ?? 0.8);
    if (!next) break;
    c = next;
  }
  // Academy: prospects with high potential while there is room and cash; promote who caught up.
  for (const id of c.window!.prospects) {
    if (c.players.filter((p) => p.status === 'academy').length >= MAX_ACADEMY) break;
    if (cashAfterStart(c) < reserve + 100) break;
    c = tryOr(c, (x) => signProspect(x, id));
  }
  c = promoteReady(c);
  c = autoLineup(c);
  c = austerity(c, reserve);
  if (opts.scrims !== false) c = useScrims(c);
  return c;
}

/** Academy players who reached the weakest starter go up (selling the weakest bench player when the roster is full). */
function promoteReady(c0: CareerState): CareerState {
  let c = c0;
  for (const p of c.players.filter((x) => x.status === 'academy')) {
    const weakest = Math.min(...starters(c).map((x) => x.ovr));
    if (p.ovr < weakest + 1) continue;
    if (c.players.filter((x) => x.status !== 'academy').length >= STARTERS + MAX_BENCH) {
      const bench = c.players.filter((x) => x.status === 'bench').sort((x, y) => x.ovr - y.ovr)[0];
      if (!bench || bench.ovr >= p.ovr) continue;
      c = tryOr(c, (x) => releasePlayer(x, bench.id));
    }
    c = tryOr(c, (x) => promoteAcademy(x, p.id));
  }
  return c;
}

/** Sells bench players, then the academy, while the season cannot start for lack of cash. */
function austerity(c0: CareerState, reserve: number): CareerState {
  let c = c0;
  const short = (x: CareerState) => cashAfterStart(x) < Math.min(reserve, x.debtWarning ? 0 : reserve);
  for (let guard = 0; guard < 6 && (short(c) || startBlocks(c).some((b) => b.includes('caixa') || b.includes('crédito'))); guard++) {
    const sellable = c.players
      .filter((p) => p.status !== 'starter')
      .sort((x, y) => y.contract.salary + saleCredit(y) - (x.contract.salary + saleCredit(x)))[0];
    if (!sellable) break;
    c = tryOr(c, (x) => releasePlayer(x, sellable.id));
  }
  return c;
}

/** The mid-season window, done greedily (one upgrade by default). */
export function autoMidseason(c0: CareerState, opts: AutopilotOptions = {}): CareerState {
  let c = c0;
  if (c.phase !== 'midseason') return c;
  c = fillSlots(c, opts.reserve ?? 0);
  for (let i = 0; i < (opts.midseasonUpgrades ?? 1); i++) {
    const next = upgradeOnce(c, Math.max(0, opts.reserve ?? 0), opts.minGain ?? 0.8);
    if (!next) break;
    c = next;
  }
  c = promoteReady(c);
  c = autoLineup(c);
  if (opts.scrims !== false) c = useScrims(c);
  return c;
}

/** Vetoes the org's next match as the AI would (the difficulty's veto noise) and plays it. */
export function autoPlayMatch(c0: CareerState): CareerState {
  let c = beginUserVeto(c0);
  const pending = userPendingMatch(c)!;
  for (let guard = 0; guard < 10 && c.veto && nextTurn(c.veto.state); guard++) {
    const lineups = [careerVetoLineup(c, pending.match.a), careerVetoLineup(c, pending.match.b)] as const;
    const rng = createRng(`${c.seed}:${c.year}:auto:${pending.match.id}:${c.veto.state.steps.length}`);
    c = applyUserVeto(c, aiChooseMap(c.veto.state, [lineups[0], lineups[1]], rng, difficultySettings(c.org.difficulty).vetoNoise));
  }
  return playUserMatch(c);
}

/** Plays a whole season from the off-season to the report (or the end of the career). */
export function autoSeason(c0: CareerState, opts: AutopilotOptions = {}): CareerState {
  let c = autoOffseason(c0, opts);
  if (startBlocks(c).length > 0) return c;
  c = startStage(c);
  for (let guard = 0; guard < 200; guard++) {
    if (c.phase === 'report' || c.phase === 'over') return c;
    if (c.phase === 'midseason') {
      c = autoMidseason(c, opts);
      if (startBlocks(c).length > 0) return c;
      c = startStage(c);
      continue;
    }
    if (opts.scrims !== false && scrimsLeft(c) > 0) c = useScrims(c);
    if (!userPendingMatch(c)) return c;
    c = autoPlayMatch(c);
  }
  return c;
}

export { USER_ID };
