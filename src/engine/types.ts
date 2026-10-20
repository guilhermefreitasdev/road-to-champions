export type Role = 'duelist' | 'initiator' | 'controller' | 'sentinel';

/** A lineup slot: one of the four roles, or flex. */
export type Slot = Role | 'flex';

export type TeamIndex = 0 | 1;
export type BestOf = 1 | 3 | 5;
export type MapName = string;

/** Competitive region ("server"). Pre-franchising teams (2021–22) are mapped by country/sub-region. */
export type Region = 'americas' | 'emea' | 'pacific' | 'china';
export const REGIONS: readonly Region[] = ['americas', 'emea', 'pacific', 'china'];

/** International = Masters/LOCK//IN/Champions; regional = a VCT regional league stage. */
export type EventTier = 'international' | 'regional';

/** Card attributes, 0–100. */
export interface Attributes {
  aim: number;
  entry: number;
  utility: number;
  clutch: number;
  /**
   * Presence (KAST): share of rounds with a kill, assist, survival or trade. Was "consistency" (KAST + rating),
   * which measured level, not regularity: per-map volatility is not a measurable trait (docs/pesquisa-variancia.md §2.3).
   */
  presence: number;
  /**
   * Decision-making (calls, buys, mid-round). A game scale over Liquipedia facts, not a stat: the event's IGL
   * is high, an IGL elsewhere moderate, the rest around 45 nudged by APR/KAST (see docs/design.md).
   */
  decision: number;
}

/** Real numbers behind a card, as published for that event (null when the source has no value). Display only. */
export interface CardStats {
  rounds: number;
  rating: number | null;
  acs: number | null;
  kast: number | null;
}

/**
 * Aura tier, from career facts up to and including the card's event (international events only, docs/design.md
 * "Modelo v3"): 'goat' ≥ 2 titles and ≥ 2 top-3 ratings; 'legend' 1 title + 2 top-3, or 2 titles, or 3 top-3;
 * 'star' ≥ 1 top-3, or rating ≥ 1.10 twice, or a title with a top-8 rating; 'rising' = first international event.
 */
export type AuraTier = 'rising' | 'star' | 'legend' | 'goat';

/** Career facts behind the aura, counted over the international events up to and including the card's. */
export interface CardCareer {
  /** International events played (as a main player), including this one when it is international. */
  events: number;
  /** International titles. */
  titles: number;
  /** Events where the player's rating was in the top 3 of the event. */
  top3: number;
  /** Events with rating ≥ 1.10. */
  high: number;
}

/** A player in a specific event — the core unit of the game ("aspas @ LOUD, Champions 2022"). */
export interface Card {
  id: string;
  playerId: string;
  handle: string;
  /** ISO 3166-1 alpha-2, uppercase; '' when unknown (never counts for chemistry). */
  country: string;
  teamId: string;
  eventId: string;
  role: Role;
  isIGL: boolean;
  agents: string[];
  attrs: Attributes;
  ovr: number;
  /** Where the IGL flag came from (e.g. 'event-captain', 'infobox-unique'), when the data says. */
  iglSource?: string;
  stats?: CardStats;
  /** Aura tier (absent = regular). Fact-based, see AuraTier. */
  aura?: AuraTier;
  /** "Durão": a legend/GOAT who leads (IGL or decision ≥ 60), or a champion rated at or above the team's median. */
  anchor?: boolean;
  /** First international event with rating ≥ 1.10 or in the event's top 25%. */
  prodigy?: boolean;
  career?: CardCareer;
  /**
   * Real per-agent numbers for this player (most played first), aggregated from VLR map scoreboards up to and
   * including the card's year. Display + a bounded, sample-shrunk agent edge in the sim; never invented.
   */
  agentPool?: AgentStat[];
  /**
   * Roles the player has genuinely played (share of maps ≥ a threshold), main role first. Two or more = a
   * natural flex ("flex nato"): no off-role penalty in those roles and full value in the flex slot.
   */
  flexRoles?: Role[];
}

/** One agent in a player's real pool. */
export interface AgentStat {
  agent: string;
  /** Maps played on the agent (the sample size). */
  maps: number;
  rating: number | null;
  acs: number | null;
  /** Kills / deaths on the agent. */
  kd: number | null;
}

/** A coach in a specific event. Bonuses are in strength points. */
export interface Coach {
  id: string;
  name: string;
  teamId: string;
  eventId: string;
  /** Helps the AI veto and is shown to the player. 0–3. */
  vetoBonus: number;
  /** Preparation, half-time and timeouts: 15% of the team's decision dimension (0 → 40, 3 → 100). 0–3. */
  tacticBonus: number;
}

/** A real team's roster at one event: what the draft roulette rolls. */
export interface RosterEntry {
  teamId: string;
  teamName: string;
  eventId: string;
  eventName: string;
  year: number;
  cards: Card[];
  coach?: Coach;
  /** false when the source does not say who the IGL was: the team then gets a neutral decision, not the "no IGL" rule. */
  iglKnown?: boolean;
  /** Final placement at the event as published ("1st", "3rd–4th"…). */
  placement?: string;
  /** Region the team competed in at that event. */
  region?: Region;
  /** Defaults to 'international' (the original pool). */
  tier?: EventTier;
}

export interface LineupPlayer {
  card: Card;
  slot: Slot;
  /**
   * Tournament form ("fase"), in OVR points, already applied to the card's attributes and OVR by
   * applyTournamentForm (src/engine/form.ts). Display only.
   */
  tournamentForm?: number;
  /** Prodigy growth in this run, in OVR points, already applied (src/engine/form.ts). Display only. */
  growth?: number;
}

export interface Lineup {
  name: string;
  players: LineupPlayer[];
  coach?: Coach;
  /** false = IGL unknown (AI rosters without data): neutral decision instead of the "no IGL" rule. */
  iglKnown?: boolean;
  /** Strength points added on specific maps (map comfort). Missing maps count as 0. */
  mapAffinity?: Partial<Record<MapName, number>>;
}
