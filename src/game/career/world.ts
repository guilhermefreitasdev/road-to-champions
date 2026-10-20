/**
 * The career's world: who every real player is (latest card, debut year, region), his potential, the aging curve,
 * the current teams of each region and the effective cards the sim plays with. Pure functions over the real pool
 * (src/data/real) and the career seed; no state lives here.
 *
 * Age: the data has no birth dates, so "experience" (seasons since the player's first roster in the data) is the age
 * proxy everywhere: experience = year − debutYear. A card keeps the level it had at its event; signing an old
 * card does not make the player young again (his experience still counts from his debut).
 */
import { ALL_ROSTERS } from '../../data/real';
import { auraTier } from '../../data/real/cards';
import { shiftCard } from '../../engine/form';
import { createRng, type Rng } from '../../engine/rng';
import { rosterKey } from '../../engine/roster';
import type { AuraTier, Card, Region, RosterEntry } from '../../engine/types';
import { REGIONS } from '../../engine/types';
import { regionOf } from '../season';
import {
  ACADEMY_BONUS,
  AGING_CURVE,
  AGING_FLOOR,
  AGING_MAX_DELTA,
  AGING_MIN_DELTA,
  FOCUS_BONUS,
  INTERNATIONAL_PROGRESS,
  MORALE_HIGH,
  MORALE_LOW,
  MORALE_PROGRESS,
  OVR_MAX,
  OVR_MIN,
  POTENTIAL_HEADROOM,
  POTENTIAL_MAX,
  POTENTIAL_PRODIGY,
  PRIME_MAX_EXP,
  PRODIGY_EXTRA,
  YOUNG_MAX_EXP,
} from './constants';

/** First career season: the latest year in the data (the world starts as the data ends). */
export const CAREER_START_YEAR = Math.max(...ALL_ROSTERS.map((e) => e.year));

export interface PlayerInfo {
  playerId: string;
  handle: string;
  /** The player's most recent card (latest year; the last in pool order on a tie): his level as a free agent. */
  cardId: string;
  ovr: number;
  /** Year of his first roster in the data (the age proxy). */
  debutYear: number;
  /** Region of his most recent roster. */
  region: Region;
  /** A prodigy on any card (a fact: first international in the top quarter or rated ≥ 1.10). */
  prodigy: boolean;
}

const CARD_BY_ID = new Map<string, Card>();
const ENTRY_BY_CARD = new Map<string, RosterEntry>();
const INFO = new Map<string, PlayerInfo>();
for (const entry of ALL_ROSTERS) {
  for (const card of entry.cards) {
    CARD_BY_ID.set(card.id, card);
    ENTRY_BY_CARD.set(card.id, entry);
    const cur = INFO.get(card.playerId);
    if (!cur) {
      INFO.set(card.playerId, { playerId: card.playerId, handle: card.handle, cardId: card.id, ovr: card.ovr, debutYear: entry.year, region: regionOf(entry), prodigy: !!card.prodigy });
      continue;
    }
    cur.debutYear = Math.min(cur.debutYear, entry.year);
    cur.prodigy ||= !!card.prodigy;
    const latest = ENTRY_BY_CARD.get(cur.cardId)!;
    if (entry.year >= latest.year) {
      cur.cardId = card.id;
      cur.ovr = card.ovr;
      cur.handle = card.handle;
      cur.region = regionOf(entry);
    }
  }
}

/** Every real player, by player id. */
export const PLAYERS: ReadonlyMap<string, PlayerInfo> = INFO;

export function playerInfo(playerId: string): PlayerInfo {
  const info = INFO.get(playerId);
  if (!info) throw new Error(`Unknown player "${playerId}"`);
  return info;
}

export function cardById(cardId: string): Card {
  const card = CARD_BY_ID.get(cardId);
  if (!card) throw new Error(`Unknown card "${cardId}"`);
  return card;
}

/** The roster a card belongs to (team and event). */
export function entryOfCard(cardId: string): RosterEntry {
  const entry = ENTRY_BY_CARD.get(cardId);
  if (!entry) throw new Error(`Unknown card "${cardId}"`);
  return entry;
}

const ROSTER_BY_KEY = new Map(ALL_ROSTERS.map((e) => [rosterKey(e), e]));
export function rosterByKey(key: string): RosterEntry {
  const entry = ROSTER_BY_KEY.get(key);
  if (!entry) throw new Error(`Unknown roster "${key}"`);
  return entry;
}

/**
 * The region's current teams: every team whose most recent roster is from the region's latest year in the data
 * (its latest roster each). Pool order.
 */
export function currentTeams(region: Region): RosterEntry[] {
  const latest = new Map<string, RosterEntry>();
  for (const e of ALL_ROSTERS) {
    if (regionOf(e) !== region) continue;
    const cur = latest.get(e.teamId);
    if (!cur || e.year >= cur.year) latest.set(e.teamId, e);
  }
  const year = Math.max(...[...latest.values()].map((e) => e.year));
  return [...latest.values()].filter((e) => e.year === year);
}

const CURRENT_BY_REGION = new Map(REGIONS.map((r) => [r, currentTeams(r)]));
export function currentTeamsOf(region: Region): readonly RosterEntry[] {
  return CURRENT_BY_REGION.get(region)!;
}

const OTHER_REGIONS_PLAYERS = new Map(
  REGIONS.map((r) => [r, new Set(REGIONS.filter((x) => x !== r).flatMap((x) => CURRENT_BY_REGION.get(x)!.flatMap((e) => e.cards.map((c) => c.playerId))))]),
);
/** Players on the current rosters of the regions other than `region` (static teams: never free agents for that org). */
export function otherRegionsPlayers(region: Region): ReadonlySet<string> {
  return OTHER_REGIONS_PLAYERS.get(region)!;
}

/** Seasons since the player's debut in `year`. */
export function experience(playerId: string, year: number): number {
  return Math.max(0, year - playerInfo(playerId).debutYear);
}

export type CareerPhaseLabel = 'young' | 'prime' | 'veteran' | 'fading-legend';
export const CAREER_PHASE_LABELS: Record<CareerPhaseLabel, string> = {
  young: 'Jovem',
  prime: 'Auge',
  veteran: 'Veterano',
  'fading-legend': 'Lenda em declínio',
};

/** Career phase by experience; a veteran with a Legend or GOAT aura is a "Lenda em declínio". */
export function careerPhase(exp: number, aura?: AuraTier): CareerPhaseLabel {
  if (exp <= YOUNG_MAX_EXP) return 'young';
  if (exp <= PRIME_MAX_EXP) return 'prime';
  return aura === 'legend' || aura === 'goat' ? 'fading-legend' : 'veteran';
}

const rangeFor = <T extends { maxExp: number }>(table: readonly T[], exp: number): T => table.find((r) => exp <= r.maxExp) ?? table[table.length - 1]!;

/**
 * Potential of a player in a career: his latest card's OVR + a headroom drawn once per career and player, larger for
 * players who debuted recently (experience at the career's start), +POTENTIAL_PRODIGY for prodigies; ≤ POTENTIAL_MAX.
 */
export function potentialOf(seed: string, playerId: string): number {
  const info = playerInfo(playerId);
  const exp0 = CAREER_START_YEAR - info.debutYear;
  const range = rangeFor(POTENTIAL_HEADROOM, exp0);
  const headroom = createRng(`${seed}:potential:${playerId}`).int(range.min, range.max) + (info.prodigy ? POTENTIAL_PRODIGY : 0);
  return Math.min(POTENTIAL_MAX, Math.max(info.ovr, info.ovr + headroom));
}

export interface AgingInput {
  ovr: number;
  potential: number;
  /** Experience in the new season. */
  experience: number;
  prodigy: boolean;
  /** Share of the team's competitive maps played last season (0–1); AI players count as 1. */
  share: number;
  morale?: number;
  focus?: boolean;
  academy?: boolean;
  /** Played a Masters or Champions with half the team's maps there. */
  international?: boolean;
  /** Scene level correction of the year (sceneShift), applied after the bounds. */
  scene?: number;
}

export interface AgingPart {
  /** pt-BR label for the UI. */
  label: string;
  value: number;
}

export interface AgingResult {
  /** OVR after the season. */
  ovr: number;
  delta: number;
  /** The explained terms before rounding and the bounds. */
  parts: AgingPart[];
}

/** Seeded RNG of a player's aging into `year` (the same draw for the user's and the AI's players). */
export function agingRng(seed: string, year: number, playerId: string): Rng {
  return createRng(`${seed}:aging:${year}:${playerId}`);
}

/**
 * One season of progression (docs/design.md, "Modo Carreira" → "Evolução"): the curve's draw for the experience
 * (AGING_CURVE), then playing time (growth × (0.5 + 0.5 × share), not for the academy), prodigy, academy, training
 * focus, morale and big stages. Rounded, bounded to [AGING_MIN_DELTA, AGING_MAX_DELTA]; growth never passes the
 * potential and decline never takes a player below AGING_FLOOR (nor anything outside OVR_MIN–OVR_MAX).
 */
export function agingStep(rng: Rng, input: AgingInput): AgingResult {
  const range = rangeFor(AGING_CURVE, input.experience);
  const base = rng.int(range.min, range.max);
  const parts: AgingPart[] = [{ label: `Curva (${input.experience} temporada${input.experience === 1 ? '' : 's'} de carreira)`, value: base }];
  let total = base;
  if (base > 0) {
    if (input.prodigy && input.experience <= YOUNG_MAX_EXP) {
      parts.push({ label: 'Prodígio', value: PRODIGY_EXTRA });
      total += PRODIGY_EXTRA;
    }
    if (input.academy) {
      parts.push({ label: 'Base (Challengers)', value: ACADEMY_BONUS });
      total += ACADEMY_BONUS;
    } else {
      const share = Math.max(0, Math.min(1, input.share));
      const cut = -(total * (1 - (0.5 + 0.5 * share)));
      if (cut < -0.01) {
        parts.push({ label: 'Pouco tempo de jogo', value: Math.round(cut * 10) / 10 });
        total += cut;
      }
    }
  }
  if (input.focus) {
    const v = base < 0 ? Math.min(FOCUS_BONUS, -base) : FOCUS_BONUS;
    parts.push({ label: 'Foco de treino', value: v });
    total += v;
  }
  if (input.morale !== undefined && input.morale >= MORALE_HIGH) {
    parts.push({ label: 'Moral alta', value: MORALE_PROGRESS });
    total += MORALE_PROGRESS;
  } else if (input.morale !== undefined && input.morale < MORALE_LOW) {
    parts.push({ label: 'Moral baixa', value: -MORALE_PROGRESS });
    total -= MORALE_PROGRESS;
  }
  if (input.international) {
    parts.push({ label: 'Experiência internacional', value: INTERNATIONAL_PROGRESS });
    total += INTERNATIONAL_PROGRESS;
  }
  const delta = Math.max(AGING_MIN_DELTA, Math.min(AGING_MAX_DELTA, Math.round(total)));
  let ovr = input.ovr + delta;
  if (delta > 0) ovr = Math.min(ovr, Math.max(input.ovr, input.potential));
  if (delta < 0) ovr = Math.max(ovr, Math.min(input.ovr, AGING_FLOOR));
  if (input.scene) {
    parts.push({ label: 'Nível da cena', value: input.scene });
    ovr += input.scene;
  }
  ovr = Math.max(OVR_MIN, Math.min(OVR_MAX, ovr));
  return { ovr, delta: ovr - input.ovr, parts };
}

const worldCache = new Map<string, number>();

/** One season of a player who plays every season (share 1, no morale/focus), as the AI and the free agents age. */
function worldChain(seed: string, playerId: string, startOvr: number, year: number, scene: boolean): number {
  if (year <= CAREER_START_YEAR) return startOvr;
  const key = `${scene ? 's' : 'r'}|${seed}|${playerId}|${startOvr}|${year}`;
  let v = worldCache.get(key);
  if (v === undefined) {
    const prev = worldChain(seed, playerId, startOvr, year - 1, scene);
    const input: AgingInput = {
      ovr: prev,
      potential: Math.max(prev, potentialOf(seed, playerId)),
      experience: experience(playerId, year),
      prodigy: playerInfo(playerId).prodigy,
      share: 1,
    };
    if (scene) input.scene = sceneShift(seed, year);
    v = agingStep(agingRng(seed, year, playerId), input).ovr;
    if (worldCache.size > 100_000) worldCache.clear();
    worldCache.set(key, v);
  }
  return v;
}

/** Every player on a current roster of any region with his card's OVR: the scene's reference population. */
const SCENE_REFERENCE: readonly { playerId: string; ovr: number }[] = (() => {
  const seen = new Set<string>();
  const out: { playerId: string; ovr: number }[] = [];
  for (const list of CURRENT_BY_REGION.values()) {
    for (const e of list) {
      for (const c of e.cards) {
        if (seen.has(c.playerId)) continue;
        seen.add(c.playerId);
        out.push({ playerId: c.playerId, ovr: c.ovr });
      }
    }
  }
  return out;
})();

const sceneCache = new Map<string, number>();
/**
 * How much the scene's average OVR would have moved by `year` without the correction: the mean raw aging of the
 * reference population (every current roster in 2026). The data has no debuts after it, so the young cohort only
 * matures and veterans only decline; a card's OVR is a percentile within its year, so the scene's level must stay put.
 */
export function sceneLevel(seed: string, year: number): number {
  if (year <= CAREER_START_YEAR) return 0;
  const key = `${seed}|${year}`;
  let v = sceneCache.get(key);
  if (v === undefined) {
    let sum = 0;
    for (const r of SCENE_REFERENCE) sum += worldChain(seed, r.playerId, r.ovr, year, false) - r.ovr;
    v = sum / SCENE_REFERENCE.length;
    if (sceneCache.size > 1000) sceneCache.clear();
    sceneCache.set(key, v);
  }
  return v;
}

/**
 * The scene correction applied to everyone's aging into `year` (integer OVR points, usually −1, 0 or +1): the change of
 * the rounded scene level, with the sign flipped. Keeps the world's mean OVR stable while each player still follows
 * his own curve relative to the others ("Nível da cena" in the aging explanation).
 */
export function sceneShift(seed: string, year: number): number {
  return Math.round(sceneLevel(seed, year - 1)) - Math.round(sceneLevel(seed, year));
}

/**
 * OVR in `year` of a player who started the career at `startOvr` and played every season (the other regions' static
 * rosters, the free agents): the aging steps from CAREER_START_YEAR + 1 to `year`, with the same draws and scene
 * correction as the league's AI players.
 */
export function worldOvr(seed: string, playerId: string, startOvr: number, year: number): number {
  return worldChain(seed, playerId, startOvr, year, true);
}

const AURA_RANK: Record<AuraTier, number> = { rising: 1, star: 2, legend: 3, goat: 4 };

/** Career facts earned inside the career (international = Masters and Champions). */
export interface CareerFacts {
  /** Masters/Champions played (at least one map). */
  events: number;
  /** Masters/Champions won. */
  titles: number;
  /** Events with a top-3 rating (EVENT_TOP3_MIN_MAPS maps or more). */
  top3: number;
  /** Events with a rating ≥ EVENT_HIGH_RATING. */
  high: number;
  /** Season MVP awards (each counts as a top-3 for the aura). */
  mvpAwards: number;
}

export const NO_FACTS: CareerFacts = { events: 0, titles: 0, top3: 0, high: 0, mvpAwards: 0 };

/**
 * Aura in the career: the card's real facts (Card.career, up to its event) plus the facts earned in the career, through
 * the same tiers as the cards (cards.ts auraTier; a season MVP counts as a top-3, a career title as a title with a
 * top-8 rating). Never below the card's own tier: the facts only add up.
 */
export function careerAura(card: Card, facts: CareerFacts): AuraTier | undefined {
  const c = card.career ?? { events: 0, titles: 0, top3: 0, high: 0 };
  const combined = { events: c.events + facts.events, titles: c.titles + facts.titles, top3: c.top3 + facts.top3 + facts.mvpAwards, high: c.high + facts.high };
  const earned = auraTier(combined, facts.titles, combined.events === 1);
  const own = card.aura;
  if (!earned) return own;
  if (!own) return earned;
  return AURA_RANK[earned] > AURA_RANK[own] ? earned : own;
}

/** A card at another OVR (aim, entry and utility follow, as with the tournament form), with an id and aura override. */
export function cardAt(base: Card, ovr: number, opts: { id?: string; aura?: AuraTier | null } = {}): Card {
  const shifted = shiftCard(base, ovr - base.ovr);
  const out: Card = { ...shifted, ovr: Math.max(OVR_MIN, Math.min(99, ovr)) };
  if (opts.id) out.id = opts.id;
  if (opts.aura === null) delete out.aura;
  else if (opts.aura) out.aura = opts.aura;
  return out;
}
