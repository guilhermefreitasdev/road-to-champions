export type Role = 'duelist' | 'initiator' | 'controller' | 'sentinel';

/** A lineup slot: one of the four roles, or flex. */
export type Slot = Role | 'flex';

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

export interface LineupPlayer {
  card: Card;
  slot: Slot;
}

export interface Lineup {
  name: string;
  players: LineupPlayer[];
}
