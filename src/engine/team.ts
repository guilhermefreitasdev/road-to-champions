import type { Lineup, Role, Slot } from './types';

/** Multiplier applied to a card's OVR depending on the slot it fills. */
export function roleFit(cardRole: Role, slot: Slot): number {
  if (slot === cardRole) return 1;
  if (slot === 'flex') return 0.9;
  return 0.75;
}

/** Penalty for each role missing from the lineup's slots. A team without a controller suffers the most. */
const MISSING_ROLE_PENALTY: Record<Role, number> = {
  controller: 8,
  initiator: 3,
  sentinel: 2,
  duelist: 2,
};

/** Chemistry per pair of players who were teammates at the same event (they already know each other). */
export const CHEMISTRY_PER_PAIR = 0.5;
/**
 * Chemistry per pair from the same country (shared language/calls) who were not teammates at that event.
 * Half a teammate pair: it lets a drafted squad build some chemistry without copying a real roster.
 */
export const COUNTRY_CHEMISTRY_PER_PAIR = 0.25;
/**
 * Overall chemistry cap. A real roster's OVRs already come from stats it put up together, so its synergy is
 * partly counted twice; capping at 3 (was 4) keeps chemistry a tiebreaker-sized edge that a drafted squad of
 * compatriots plus a couple of real teammate pairs can also reach, instead of a free tier for every AI roster.
 */
export const CHEMISTRY_CAP = 3;

export interface StrengthBreakdown {
  /** Average of OVR × role fit. */
  base: number;
  composition: number;
  igl: number;
  chemistry: number;
  coach: number;
  total: number;
}

export function teamStrength(lineup: Lineup): StrengthBreakdown {
  const { players } = lineup;
  if (players.length !== 5) {
    throw new Error(`Lineup "${lineup.name}" must have 5 players, got ${players.length}`);
  }

  const base =
    players.reduce((sum, p) => sum + p.card.ovr * roleFit(p.card.role, p.slot), 0) / players.length;

  const slots = new Set(players.map((p) => p.slot));
  let composition = 0;
  for (const role of Object.keys(MISSING_ROLE_PENALTY) as Role[]) {
    if (!slots.has(role)) composition -= MISSING_ROLE_PENALTY[role];
  }

  const iglCount = players.filter((p) => p.card.isIGL).length;
  const igl = iglCount === 0 ? -4 : iglCount === 1 ? 2 : 0;

  const { teammates, compatriots } = chemistryPairs(lineup);
  const chemistry = Math.min(CHEMISTRY_CAP, teammates * CHEMISTRY_PER_PAIR + compatriots * COUNTRY_CHEMISTRY_PER_PAIR);
  const coach = lineup.coach?.tacticBonus ?? 0;

  return { base, composition, igl, chemistry, coach, total: base + composition + igl + chemistry + coach };
}

/** Pairs that give chemistry. Each pair counts once: as teammates when they were, otherwise as compatriots. */
export function chemistryPairs(lineup: Lineup): { teammates: number; compatriots: number } {
  const { players } = lineup;
  let teammates = 0;
  let compatriots = 0;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i]!.card;
      const b = players[j]!.card;
      if (a.teamId === b.teamId && a.eventId === b.eventId) teammates++;
      else if (a.country === b.country) compatriots++;
    }
  }
  return { teammates, compatriots };
}
