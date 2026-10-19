export type Role = 'duelist' | 'initiator' | 'controller' | 'sentinel';

/** A lineup slot: one of the four roles, or flex. */
export type Slot = Role | 'flex';

export type TeamIndex = 0 | 1;
export type BestOf = 1 | 3 | 5;
export type MapName = string;

/** Card attributes, 0–100. */
export interface Attributes {
  aim: number;
  entry: number;
  utility: number;
  clutch: number;
  consistency: number;
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
}

export interface LineupPlayer {
  card: Card;
  slot: Slot;
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
