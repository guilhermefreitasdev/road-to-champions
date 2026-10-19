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
  leadership: number;
}

/** A player in a specific event — the core unit of the game ("aspas @ LOUD, Champions 2022"). */
export interface Card {
  id: string;
  playerId: string;
  handle: string;
  country: string;
  teamId: string;
  eventId: string;
  role: Role;
  isIGL: boolean;
  agents: string[];
  attrs: Attributes;
  ovr: number;
}

/** A coach in a specific event. Bonuses are in strength points. */
export interface Coach {
  id: string;
  name: string;
  teamId: string;
  eventId: string;
  /** Helps the AI veto and is shown to the player. 0–3. */
  vetoBonus: number;
  /** Added to team strength on every map. 0–3. */
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
}

export interface LineupPlayer {
  card: Card;
  slot: Slot;
}

export interface Lineup {
  name: string;
  players: LineupPlayer[];
  coach?: Coach;
  /** Strength points added on specific maps (map comfort). Missing maps count as 0. */
  mapAffinity?: Partial<Record<MapName, number>>;
}
