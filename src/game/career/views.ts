/**
 * Career selectors: what the screens read (finances, roster, market, academy, coaches, sponsors, standings and
 * brackets, stats, scrim reports, the season report and the history). Pure functions of CareerState; nothing here
 * changes the state. The shapes reuse season.ts / run.ts view types where the screens already know them.
 */
import { bracketCells, bracketPlaceOf, type BracketCell } from '../../engine/bracket';
import { familiarityOf } from '../../engine/familiarity';
import { LEAGUE_GROUPS, LEAGUE_PLAYOFFS, leaguePlaceOf, leagueStandings } from '../../engine/league';
import { cardFit, teamStrength, type StrengthBreakdown } from '../../engine/team';
import { GROUP_KEYS, PLAYOFF_BRACKET, groupBracket, groupStandings } from '../../engine/tournament';
import type { AuraTier, Card, Coach, Lineup, MapName, Region, Role, Slot } from '../../engine/types';
import { scoutingLevel } from '../difficulty';
import { USER_ID, involvesUser, userWon, withoutUserSuffix, type BracketCell as RunBracketCell, type GroupView, type MapFamiliarity, type ScoutHint, type StandingRow } from '../run';
import { championsPlaceOf, type LeagueCell, type LeagueGroupView, type LeagueRow } from '../season';
import type { StatRow } from '../stats';
import {
  CREDIT_LIMIT,
  MAX_ACADEMY,
  MAX_BENCH,
  SCRIMS_PER_STAGE,
  SPONSOR_OBJECTIVE_LABELS,
  STARTERS,
  TRAINING_FOCUS_SLOTS,
  type SponsorObjective,
} from './constants';
import {
  CAREER_MAP_POOL,
  CAREER_PHASE_TEXT,
  CAREER_STAGES,
  CAREER_STAGE_LABELS,
  LEDGER_LABELS,
  OFFER_KIND_LABELS,
  autoLineup,
  baseUserLineup,
  careerPlayerValue,
  careerRows,
  careerVetoLineup,
  coachReputation,
  coachSalary,
  findCareerCoach,
  formStage,
  freeAgentOvr,
  lineupOf,
  moraleShift,
  nameOf,
  offerTerms,
  payroll,
  playerCard,
  renewalBlock,
  renewalSalary,
  saleCredit,
  scrimStage,
  scrimsLeft,
  seasonRanking,
  seriesKey,
  signPlayer,
  signingBlock,
  sponsorBase,
  sponsorSlots,
  stageBoxes,
  stageMatches,
  starters,
  startBlocks,
  strengthOf,
  userPlacement,
  type CareerMatch,
  type CareerPlayer,
  type CareerStage,
  type CareerState,
  type LedgerEntry,
  type LedgerKind,
  type OfferKind,
  type OfferRef,
  type OfferTerms,
  type PlayerSeasonLine,
  type Placement,
  type Progress,
  type ScrimRecord,
  type SeasonRecord,
  type SponsorOffer,
} from './career';
import {
  CAREER_PHASE_LABELS,
  cardById,
  careerAura,
  careerPhase,
  entryOfCard,
  experience,
  playerInfo,
  rosterByKey,
  type CareerFacts,
  type CareerPhaseLabel,
} from './world';

// ---------------------------------------------------------------------------
// Finances
// ---------------------------------------------------------------------------

export interface CareerFinances {
  money: number;
  /** Salaries due when the season starts (players under contract + coach). */
  payroll: { players: number; coach: number; total: number };
  /** Base pay of the accepted sponsors (credited when the season starts). */
  sponsorBase: number;
  /** Cash after the payroll and the sponsors' base pay (the start check). */
  cashAfterStart: number;
  /** Lowest cash after the payroll the season may start with (−CREDIT_LIMIT, or 0 under a debt warning). */
  floor: number;
  debtWarning: boolean;
  bankrupt: boolean;
  /** This season's money moves, and their totals by kind (pt-BR labels in LEDGER_LABELS). */
  ledger: LedgerEntry[];
  byKind: Partial<Record<LedgerKind, number>>;
  seasonStart: number;
}

export function careerFinances(c: CareerState): CareerFinances {
  const pay = payroll(c);
  const byKind: Partial<Record<LedgerKind, number>> = {};
  for (const e of c.ledger) byKind[e.kind] = (byKind[e.kind] ?? 0) + e.amount;
  const base = sponsorBase(c);
  return {
    money: c.money,
    payroll: pay,
    sponsorBase: base,
    cashAfterStart: c.money + (c.phase === 'offseason' ? base - pay.total : 0),
    floor: c.debtWarning ? 0 : -CREDIT_LIMIT,
    debtWarning: c.debtWarning,
    bankrupt: c.over === 'bankrupt',
    ledger: c.ledger,
    byKind,
    seasonStart: c.seasonStart.money,
  };
}

export { LEDGER_LABELS };

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

export interface CareerRosterRow {
  player: CareerPlayer;
  /** The card as it plays (OVR + morale, career aura), with the pool's id. */
  card: Card;
  handle: string;
  role: Role;
  flexRoles: Role[];
  isIGL: boolean;
  /** Team and event of the card (logo, "card de"). */
  teamId: string;
  eventId: string;
  eventName: string;
  status: CareerPlayer['status'];
  slot?: Slot;
  /** cardFit in his slot (starters). */
  fit?: number;
  ovr: number;
  /** OVR of the card as published (the level he was signed at, before any career growth). */
  cardOvr: number;
  potential: number;
  morale: number;
  /** OVR points from morale (+1 / 0 / −1). */
  moraleShift: number;
  aura?: AuraTier;
  facts: CareerFacts;
  experience: number;
  phase: CareerPhaseLabel;
  phaseLabel: string;
  prodigy: boolean;
  contract: CareerPlayer['contract'];
  /** Market value now, and what selling him credits. */
  value: number;
  saleCredit: number;
  /** Salary a renewal would set and why he would refuse (null = he accepts). */
  renewal: { salary: number; block: string | null };
  focus: boolean;
  import: boolean;
  progress?: Progress;
  history: PlayerSeasonLine[];
}

const STATUS_ORDER = { starter: 0, bench: 1, academy: 2 } as const;
const SLOT_ORDER: Record<Slot, number> = { duelist: 0, initiator: 1, controller: 2, sentinel: 3, flex: 4 };

/** The org's players: starters by slot, then the bench, then the academy. */
export function careerRoster(c: CareerState): CareerRosterRow[] {
  return [...c.players]
    .sort((x, y) => STATUS_ORDER[x.status] - STATUS_ORDER[y.status] || (x.slot ? SLOT_ORDER[x.slot] : 9) - (y.slot ? SLOT_ORDER[y.slot] : 9) || y.ovr - x.ovr)
    .map((p) => {
      const base = cardById(p.cardId);
      const card = playerCard(p, false);
      const entry = entryOfCard(p.cardId);
      const aura = careerAura(base, p.facts);
      const exp = experience(p.id, c.year);
      const phase = careerPhase(exp, aura);
      const row: CareerRosterRow = {
        player: p,
        card,
        handle: base.handle,
        role: base.role,
        flexRoles: base.flexRoles ?? [base.role],
        isIGL: base.isIGL,
        teamId: entry.teamId,
        eventId: entry.eventId,
        eventName: entry.eventName,
        status: p.status,
        ovr: p.ovr,
        cardOvr: base.ovr,
        potential: p.potential,
        morale: p.morale,
        moraleShift: moraleShift(p.morale),
        facts: p.facts,
        experience: exp,
        phase,
        phaseLabel: CAREER_PHASE_LABELS[phase],
        prodigy: playerInfo(p.id).prodigy,
        contract: p.contract,
        value: careerPlayerValue(p),
        saleCredit: saleCredit(p),
        renewal: { salary: renewalSalary(p), block: renewalBlock(c, p.id) },
        focus: !!p.focus,
        import: !!p.import,
        history: p.history,
      };
      if (p.slot) {
        row.slot = p.slot;
        row.fit = cardFit(base, p.slot);
      }
      if (aura) row.aura = aura;
      if (p.progress) row.progress = p.progress;
      return row;
    });
}

export interface RosterLimits {
  starters: number;
  bench: number;
  academy: number;
  maxStarters: number;
  maxBench: number;
  maxAcademy: number;
  focus: number;
  maxFocus: number;
}

export function rosterLimits(c: CareerState): RosterLimits {
  return {
    starters: starters(c).length,
    bench: c.players.filter((p) => p.status === 'bench').length,
    academy: c.players.filter((p) => p.status === 'academy').length,
    maxStarters: STARTERS,
    maxBench: MAX_BENCH,
    maxAcademy: MAX_ACADEMY,
    focus: c.players.filter((p) => p.focus).length,
    maxFocus: TRAINING_FOCUS_SLOTS,
  };
}

/** The org's lineup as it plays now (tournament form of the current stage), pool card ids; null when incomplete. */
export function careerLineup(c: CareerState): Lineup | null {
  if (starters(c).length < STARTERS) return null;
  return withoutUserSuffix(lineupOf(c, USER_ID));
}

/** The strength breakdown of the org's lineup as it plays now; null when incomplete. */
export function careerStrength(c: CareerState): StrengthBreakdown | null {
  const lineup = careerLineup(c);
  return lineup ? teamStrength(lineup) : null;
}

// ---------------------------------------------------------------------------
// Market, academy, coaches, sponsors
// ---------------------------------------------------------------------------

export interface OfferRow extends OfferTerms {
  ref: OfferRef;
  playerId: string;
  handle: string;
  role: Role;
  kind: OfferKind;
  kindLabel: string;
  /** Where he plays now: the AI team's name for a buyout; his latest roster otherwise. */
  teamName: string;
  teamId: string;
  eventId: string;
  region: Region;
  /** null when he can be signed now, else why not (pt-BR). */
  block: string | null;
}

function offerRow(c: CareerState, ref: OfferRef): OfferRow {
  const terms = offerTerms(c, ref);
  const entry = entryOfCard(terms.card.id);
  const team = ref.kind === 'team' && ref.from ? rosterByKey(ref.from) : entry;
  return {
    ...terms,
    ref,
    playerId: ref.playerId,
    handle: terms.card.handle,
    role: terms.card.role,
    kind: ref.kind,
    kindLabel: OFFER_KIND_LABELS[ref.kind],
    teamName: team.teamName,
    teamId: team.teamId,
    eventId: team.eventId,
    region: playerInfo(ref.playerId).region,
    block: signingBlock(c, ref.playerId),
  };
}

/** The open window's offers (signed ones leave the list), most expensive first. */
export function marketOffers(c: CareerState): OfferRow[] {
  const w = c.window;
  if (!w || c.phase !== w.kind) return [];
  const own = new Set(c.players.map((p) => p.id));
  return w.offers.filter((o) => !own.has(o.playerId)).map((o) => offerRow(c, o));
}

export interface SigningPreview {
  offer: OfferRow;
  /** Slot he would take (after "auto-escalar"), or null for the bench. */
  slot: Slot | null;
  strengthBefore: number | null;
  strengthAfter: number | null;
  /** Payroll of the next season start with him (off-season), and the cash after it. */
  payrollAfter: number;
  cashAfter: number;
  block: string | null;
}

/** What signing an offer would do: slot, strength (with the best lineup), payroll and cash. */
export function signingPreview(c: CareerState, playerId: string): SigningPreview {
  const ref = c.window?.offers.find((o) => o.playerId === playerId);
  if (!ref) throw new Error('Jogador fora da lista de ofertas');
  const offer = offerRow(c, ref);
  const before = careerStrength(c)?.total ?? null;
  let after: number | null = before;
  let slot: Slot | null = null;
  let payrollAfter = payroll(c).total + offer.salary;
  let cashAfter = c.money - offer.fee + (c.phase === 'offseason' ? sponsorBase(c) - payrollAfter : 0);
  if (!offer.block) {
    const signed = autoLineup(signPlayer(c, playerId));
    const p = signed.players.find((x) => x.id === playerId)!;
    slot = p.status === 'starter' ? p.slot ?? null : null;
    after = careerStrength(signed)?.total ?? null;
    payrollAfter = payroll(signed).total;
    cashAfter = signed.money + (signed.phase === 'offseason' ? sponsorBase(signed) - payrollAfter : 0);
  }
  return { offer, slot, strengthBefore: before, strengthAfter: after, payrollAfter, cashAfter, block: offer.block };
}

export interface ProspectRow {
  playerId: string;
  card: Card;
  handle: string;
  role: Role;
  ovr: number;
  potential: number;
  experience: number;
  prodigy: boolean;
  teamName: string;
  eventName: string;
  /** null when he can join the academy now. */
  block: string | null;
}

/** The off-season's academy prospects still available. */
export function prospectOffers(c: CareerState): ProspectRow[] {
  const w = c.window;
  if (!w || c.phase !== 'offseason') return [];
  const own = new Set(c.players.map((p) => p.id));
  const full = c.players.filter((p) => p.status === 'academy').length >= MAX_ACADEMY;
  return w.prospects
    .filter((id) => !own.has(id))
    .map((id) => {
      const info = playerInfo(id);
      const ovr = freeAgentOvr(c, id);
      const entry = entryOfCard(info.cardId);
      const card = cardById(info.cardId);
      return {
        playerId: id,
        card,
        handle: info.handle,
        role: card.role,
        ovr,
        potential: Math.max(ovr, offerTerms(c, { playerId: id, kind: 'free' }).potential),
        experience: experience(id, c.year),
        prodigy: info.prodigy,
        teamName: entry.teamName,
        eventName: entry.eventName,
        block: full ? `A base tem ${MAX_ACADEMY} vagas` : null,
      };
    });
}

export interface CoachRow {
  coach: Coach;
  salary: number;
  requiredRep: number;
  /** "Coach do <time> no <evento>". */
  teamName: string;
  eventName: string;
  block: string | null;
}

export function coachOffers(c: CareerState): CoachRow[] {
  const w = c.window;
  if (!w || c.phase !== 'offseason') return [];
  return w.coaches.map((id) => {
    const coach = findCareerCoach(id)!;
    const entry = rosterByKey(`${coach.teamId}-${coach.eventId}`);
    const need = coachReputation(coach);
    return { coach, salary: coachSalary(coach), requiredRep: need, teamName: entry.teamName, eventName: entry.eventName, block: c.reputation < need ? `Pede reputação ${need}` : null };
  });
}

/** The org's coach now, with his salary. */
export function careerCoach(c: CareerState): { coach: Coach; salary: number } | null {
  const coach = findCareerCoach(c.coach?.id);
  return coach && c.coach ? { coach, salary: c.coach.salary } : null;
}

export interface SponsorRow {
  offer: SponsorOffer;
  objectiveLabel: string;
  accepted: boolean;
}

export interface SponsorsView {
  slots: number;
  accepted: SponsorRow[];
  offers: SponsorRow[];
}

export function sponsorsView(c: CareerState): SponsorsView {
  const label = (o: SponsorOffer): SponsorRow => ({ offer: o, objectiveLabel: SPONSOR_OBJECTIVE_LABELS[o.objective], accepted: c.sponsors.some((s) => s.id === o.id) });
  return {
    slots: sponsorSlots(c.reputation),
    accepted: c.sponsors.map(label),
    offers: c.phase === 'offseason' ? (c.window?.sponsorOffers ?? []).map(label) : [],
  };
}

export const objectiveLabel = (o: SponsorObjective): string => SPONSOR_OBJECTIVE_LABELS[o];

// ---------------------------------------------------------------------------
// Teams, standings and brackets
// ---------------------------------------------------------------------------

export interface CareerTeamInfo {
  id: string;
  name: string;
  /** "Seu time" or the roster's event ("Champions 2026"). */
  subtitle: string;
  isUser: boolean;
  region: Region;
  strength: number;
  /** Seed in the current stage (0 outside it). */
  seed: number;
}

export function careerTeamInfo(c: CareerState, id: string): CareerTeamInfo {
  const isUser = id === USER_ID;
  const stage = formStage(c);
  const entrants = stage === 'league' ? c.league?.entrants : stage === 'masters' ? c.masters?.entrants : c.champions?.entrants;
  const entry = isUser ? undefined : rosterByKey(id);
  let strength = 0;
  try {
    strength = strengthOf(c, id);
  } catch {
    // The org's lineup can be incomplete in a window.
  }
  return {
    id,
    name: nameOf(c, id),
    subtitle: isUser ? 'Seu time' : entry!.eventName,
    isUser,
    region: isUser ? c.org.region : entry!.region ?? c.org.region,
    strength,
    seed: entrants?.find((e) => e.id === id)?.seed ?? 0,
  };
}

/** Team and event of an entrant, for its logo. */
export function careerEntrantTeam(c: CareerState, id: string): { teamId: string; eventId?: string; name: string } {
  if (id === USER_ID) return { teamId: USER_ID, name: c.org.name };
  const e = rosterByKey(id);
  return { teamId: e.teamId, eventId: e.eventId, name: e.teamName };
}

export interface LeagueTeamRow {
  id: string;
  name: string;
  teamId: string;
  eventId: string;
  strength: number;
  players: { playerId: string; handle: string; role: Role; ovr: number; isIGL: boolean }[];
}

/** The league's AI teams as they are now (strength with the current stage's form and the difficulty's bonus). */
export function leagueTeams(c: CareerState): LeagueTeamRow[] {
  return c.aiTeams
    .map((t) => {
      const e = rosterByKey(t.id);
      return {
        id: t.id,
        name: e.teamName,
        teamId: e.teamId,
        eventId: e.eventId,
        strength: strengthOf(c, t.id),
        players: t.players.map((p) => {
          const card = cardById(p.cardId);
          return { playerId: p.id, handle: card.handle, role: card.role, ovr: p.ovr, isIGL: card.isIGL };
        }),
      };
    })
    .sort((x, y) => y.strength - x.strength);
}

export function careerLeagueViews(c: CareerState): LeagueGroupView[] {
  const l = c.league;
  if (!l) return [];
  const table = leagueStandings(l).map((r): LeagueRow => ({ ...r, name: nameOf(c, r.id), isUser: r.id === USER_ID }));
  const views = LEAGUE_GROUPS.map((group): LeagueGroupView => {
    const rows = table.filter((r) => r.group === group);
    return { group, rows, hasUser: rows.some((r) => r.isUser) };
  });
  return [...views.filter((v) => v.hasUser), ...views.filter((v) => !v.hasUser)];
}

export function careerLeaguePlayoffCells(c: CareerState): LeagueCell[] {
  const byId = new Map((c.league?.matches ?? []).filter((m) => m.stage === 'playoffs').map((m) => [m.id, m]));
  return LEAGUE_PLAYOFFS.map((slot) => {
    const match = byId.get(slot.id);
    return match ? { slot, match } : { slot };
  });
}

export function careerMastersCells(c: CareerState): BracketCell[] {
  return c.masters ? bracketCells(c.masters) : [];
}

export function careerChampionsGroupViews(c: CareerState): GroupView[] {
  const t = c.champions;
  if (!t) return [];
  const byId = new Map(t.matches.map((m) => [m.id, m]));
  const table = groupStandings(t).map((r): StandingRow => ({ ...r, name: nameOf(c, r.id), isUser: r.id === USER_ID }));
  const views = GROUP_KEYS.map((group): GroupView => {
    const rows = table.filter((r) => r.group === group);
    return {
      group,
      cells: groupBracket(group).map((slot) => {
        const match = byId.get(slot.id);
        return match ? { slot, match } : { slot };
      }),
      rows,
      hasUser: rows.some((r) => r.isUser),
    };
  });
  return [...views.filter((v) => v.hasUser), ...views.filter((v) => !v.hasUser)];
}

export function careerChampionsBracket(c: CareerState): RunBracketCell[] {
  const byId = new Map((c.champions?.matches ?? []).map((m) => [m.id, m]));
  return PLAYOFF_BRACKET.map((slot) => {
    const match = byId.get(slot.id);
    return match ? { slot, match } : { slot };
  });
}

export interface CareerStageOutcome {
  stage: CareerStage;
  wins: number;
  losses: number;
  place?: Placement;
  /** 'out' = the org did not qualify; 'pending' = not built yet. */
  status: 'pending' | 'playing' | 'done' | 'out';
}

export function careerStageOutcome(c: CareerState, stage: CareerStage): CareerStageOutcome {
  const matches = stageMatches(c, stage).filter(involvesUser);
  const wins = matches.filter((m) => m.result && userWon(m)).length;
  const losses = matches.filter((m) => m.result && !userWon(m)).length;
  const state = stage === 'league' ? c.league : stage === 'masters' ? c.masters : c.champions;
  const entered = !!state?.entrants.some((e) => e.id === USER_ID);
  const out: CareerStageOutcome = { stage, wins, losses, status: !state ? 'pending' : !entered ? 'out' : state.phase === 'done' ? 'done' : 'playing' };
  const place = userPlacement(c, stage);
  if (place) out.place = place;
  return out;
}

export interface CareerUserResult {
  key: string;
  stage: CareerStage;
  match: CareerMatch;
  won: boolean;
}

/** Every match the org played this season, in order. */
export function careerUserResults(c: CareerState): CareerUserResult[] {
  return CAREER_STAGES.flatMap((stage) =>
    stageMatches(c, stage)
      .filter((m) => involvesUser(m) && m.result)
      .map((match) => ({ key: seriesKey(stage, match.id), stage, match, won: userWon(match) })),
  );
}

/** Place of any entrant in a stage, once decided. */
export function entrantPlacement(c: CareerState, stage: CareerStage, id: string): Placement | null {
  const p =
    stage === 'league' ? c.league && leaguePlaceOf(c.league, id)
    : stage === 'masters' ? c.masters && bracketPlaceOf(c.masters, id)
    : c.champions && championsPlaceOf(c.champions, id);
  return p ? { rank: p.rank, label: p.label } : null;
}

// ---------------------------------------------------------------------------
// Veto helpers
// ---------------------------------------------------------------------------

export function careerMapFamiliarity(c: CareerState, teamId: string): MapFamiliarity[] {
  const points = familiarityOf(c.mapsPlayed, teamId);
  return CAREER_MAP_POOL.map((map) => ({ map, played: c.mapsPlayed[teamId]?.[map] ?? 0, points: points[map] ?? 0 }));
}

/** Scouting of the opponent's veto preferences (the coach's level shifted by the difficulty). */
export function careerVetoScouting(c: CareerState, opponentId: string): { level: number; hints: ScoutHint[] } {
  const level = scoutingLevel(findCareerCoach(c.coach?.id)?.vetoBonus ?? 0, c.org.difficulty);
  const affinity = careerVetoLineup(c, opponentId).mapAffinity ?? {};
  const all = CAREER_MAP_POOL.map((map: MapName) => ({ map, value: affinity[map] ?? 0 })).sort((x, y) => y.value - x.value || (x.map < y.map ? -1 : 1));
  if (level <= 0) return { level, hints: [] };
  if (level >= 3) return { level, hints: all };
  return { level, hints: level === 1 ? [all[0]!] : [all[0]!, all[all.length - 1]!] };
}

// ---------------------------------------------------------------------------
// Stats, scrims, report, history
// ---------------------------------------------------------------------------

/** The stage the stats tab shows by default: the current one, or the last one played. */
export function careerStatsStage(c: CareerState): CareerStage {
  if (c.phase === 'league' || c.phase === 'masters' || c.phase === 'champions') return c.phase;
  if (c.phase === 'midseason') return 'league';
  return c.champions ? 'champions' : c.masters ? 'masters' : 'league';
}

/** Every player of one stage this season (default: the current or last one), AI vs AI included. Best rating first. */
export function careerAllPlayerStats(c: CareerState, stage: CareerStage = careerStatsStage(c)): StatRow[] {
  return careerRows(c, stageBoxes(c, stage), false, stage);
}

/** The org's players over every competitive series of the season. */
export function careerPlayerStats(c: CareerState): StatRow[] {
  return careerRows(c, stageBoxes(c), true);
}

/** The season's rating ranking (players with RANKING_MIN_MAPS maps), as the awards use it. */
export { seasonRanking };

export interface ScrimInfo {
  stage: CareerStage | null;
  left: number;
  perStage: typeof SCRIMS_PER_STAGE;
  played: ScrimRecord[];
}

export function scrimInfo(c: CareerState): ScrimInfo {
  return { stage: scrimStage(c), left: scrimsLeft(c), perStage: SCRIMS_PER_STAGE, played: c.scrims };
}

export interface ScrimReport {
  scrim: ScrimRecord;
  opponentName: string;
  /** Per player of both teams (rating, K/D/A, ACS, multikills, KAST, first kills/deaths, agents), best rating first. */
  rows: StatRow[];
  mvp: { cardId: string; handle: string; isUser: boolean };
  /** Key of the full series in userSeries (replay). */
  seriesKey: string;
}

/** The per-player report of scrim `n` (1-based, this season). */
export function scrimReport(c: CareerState, n: number): ScrimReport {
  const scrim = c.scrims.find((s) => s.n === n);
  if (!scrim) throw new Error(`No scrim ${n} this season`);
  const rows = careerRows(c, [scrim.box], false, scrim.stage);
  const [side, i] = scrim.box.mvp;
  const cardId = scrim.box.ids[side][i]!;
  return {
    scrim,
    opponentName: nameOf(c, scrim.opponent),
    rows,
    mvp: { cardId: cardId.replace(/#user$/, ''), handle: cardById(cardId.replace(/#user$/, '')).handle, isUser: side === 0 },
    seriesKey: `scrim:${n}`,
  };
}

/** The season report (phase 'report' or 'over'): the last history record. */
export function seasonReport(c: CareerState): SeasonRecord | null {
  return c.phase === 'report' || c.phase === 'over' ? c.history[c.history.length - 1] ?? null : null;
}

export function careerHistory(c: CareerState): SeasonRecord[] {
  return c.history;
}

export interface CareerSummary {
  name: string;
  tag: string;
  region: Region;
  season: number;
  year: number;
  phase: CareerState['phase'];
  phaseText: string;
  money: number;
  reputation: number;
  seasonsPlayed: number;
  titles: Record<CareerStage, number>;
  /** Best finish per stage over the career. */
  best: Partial<Record<CareerStage, Placement>>;
  /** What blocks the next stage now (pt-BR). */
  startBlocks: string[];
  over: boolean;
}

export function careerSummary(c: CareerState): CareerSummary {
  const titles: Record<CareerStage, number> = { league: 0, masters: 0, champions: 0 };
  const best: Partial<Record<CareerStage, Placement>> = {};
  for (const h of c.history) {
    for (const t of h.titles) titles[t]++;
    for (const stage of CAREER_STAGES) {
      const p = h[stage];
      if (p && (!best[stage] || p.rank < best[stage]!.rank)) best[stage] = p;
    }
  }
  return {
    name: c.org.name,
    tag: c.org.tag,
    region: c.org.region,
    season: c.season,
    year: c.year,
    phase: c.phase,
    phaseText: CAREER_PHASE_TEXT[c.phase],
    money: c.money,
    reputation: c.reputation,
    seasonsPlayed: c.history.length,
    titles,
    best,
    startBlocks: c.phase === 'offseason' || c.phase === 'midseason' ? startBlocks(c) : [],
    over: c.phase === 'over',
  };
}

/** Plain-text summary of a season to share (no emoji). */
export function careerShareText(c: CareerState, record: SeasonRecord | null = seasonReport(c)): string {
  if (!record) return '';
  const lines = [`Road to Champions | Carreira`, `${c.org.name} [${c.org.tag}] · temporada ${record.season} (${record.year})`, record.path || 'Sem resultado'];
  if (record.titles.length > 0) lines.push(`Títulos: ${record.titles.map((t) => CAREER_STAGE_LABELS[t]).join(', ')}`);
  if (record.awards.orgBest) lines.push(`Destaque: ${record.awards.orgBest.handle} (rating ${record.awards.orgBest.rating.toFixed(2)})`);
  lines.push(`Caixa US$ ${record.money.end} mil · reputação ${record.reputation.end}`);
  return lines.join('\n');
}

export { baseUserLineup };
