import { cardFit, isNaturalFlex } from '../engine/team';
import type { Card, Slot } from '../engine/types';
import { ROLE_LABELS, cardFitLabel } from '../game/explain';

export { isNaturalFlex };

/** How much of the card's OVR a slot keeps (1 = ideal): the engine's card-aware fit, so UI and sim agree. */
export function slotFit(card: Pick<Card, 'role' | 'flexRoles'>, slot: Slot): number {
  return cardFit(card, slot);
}

/** "100%", "100% flex nato", "90% flex" or "75% fora da função" (the engine's wording, explain.ts). */
export function slotFitLabel(card: Pick<Card, 'role' | 'flexRoles'>, slot: Slot): string {
  return cardFitLabel(card, slot);
}

/** "Duelista e Iniciador": the roles behind the "Flex nato" badge. */
export function flexRolesText(card: Pick<Card, 'flexRoles'>): string {
  const names = (card.flexRoles ?? []).map((r) => ROLE_LABELS[r]);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}
