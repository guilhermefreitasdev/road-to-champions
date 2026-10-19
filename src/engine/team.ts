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

const CHEMISTRY_PER_PAIR = 0.5;
const CHEMISTRY_CAP = 4;

export interface StrengthBreakdown {
  /** Average of OVR × role fit. */
  base: number;
  composition: number;
  igl: number;
  chemistry: number;
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

  // Players who were teammates at the same event already know each other.
  let pairs = 0;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i]!.card;
      const b = players[j]!.card;
      if (a.teamId === b.teamId && a.eventId === b.eventId) pairs++;
    }
  }
  const chemistry = Math.min(CHEMISTRY_CAP, pairs * CHEMISTRY_PER_PAIR);

  return { base, composition, igl, chemistry, total: base + composition + igl + chemistry };
}
