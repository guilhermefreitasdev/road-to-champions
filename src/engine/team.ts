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
 * partly counted twice; capping at 2 (was 4, then 3) keeps chemistry a tiebreaker-sized edge that a drafted squad
 * of compatriots plus a couple of real teammate pairs can also reach. With the real pool, 3 gave every AI roster
 * a free +3 the drafted median could not match (see src/game/balance.test.ts).
 */
export const CHEMISTRY_CAP = 2;

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

  const igl = iglTerm(lineup);

  const { teammates, compatriots } = chemistryPairs(lineup);
  const chemistry = Math.min(CHEMISTRY_CAP, teammates * CHEMISTRY_PER_PAIR + compatriots * COUNTRY_CHEMISTRY_PER_PAIR);
  const coach = lineup.coach?.tacticBonus ?? 0;

  return { base, composition, igl, chemistry, coach, total: base + composition + igl + chemistry + coach };
}

/** IGL bonus: +2 with exactly one, 0 with several; −4 with none, unless the lineup says its IGL is unknown (0). */
export function iglTerm(lineup: Lineup): number {
  const count = lineup.players.filter((p) => p.card.isIGL).length;
  if (count === 0) return lineup.iglKnown === false ? 0 : -4;
  return count === 1 ? 2 : 0;
}

/**
 * Pairs that give chemistry. Each pair counts once: as teammates when they were, otherwise as compatriots
 * (an unknown country, '', never matches).
 */
export function chemistryPairs(lineup: Lineup): { teammates: number; compatriots: number } {
  const { players } = lineup;
  let teammates = 0;
  let compatriots = 0;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i]!.card;
      const b = players[j]!.card;
      if (a.teamId === b.teamId && a.eventId === b.eventId) teammates++;
      else if (a.country !== '' && a.country === b.country) compatriots++;
    }
  }
  return { teammates, compatriots };
}
