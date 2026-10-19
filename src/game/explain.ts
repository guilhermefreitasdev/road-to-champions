/**
 * pt-BR labels and plain-language explanations of the engine's numbers, shared by the UI and its tests.
 */
import { roleFit, teamStrength, type StrengthBreakdown } from '../engine/team';
import type { Attributes, Lineup, Role, Slot } from '../engine/types';

export const ROLE_LABELS: Record<Role, string> = {
  duelist: 'Duelista',
  initiator: 'Iniciador',
  controller: 'Controlador',
  sentinel: 'Sentinela',
};

export const SLOT_LABELS: Record<Slot, string> = { ...ROLE_LABELS, flex: 'Flex' };

/** Compact slot names for tight layouts. */
export const SLOT_SHORT: Record<Slot, string> = {
  duelist: 'DUE',
  initiator: 'INI',
  controller: 'CON',
  sentinel: 'SEN',
  flex: 'FLEX',
};

export const ATTRIBUTE_LABELS: Record<keyof Attributes, string> = {
  aim: 'Mira',
  entry: 'Entrada',
  utility: 'Utilidade',
  clutch: 'Clutch',
  consistency: 'Consistência',
  leadership: 'Liderança',
};

export const ATTRIBUTE_KEYS = Object.keys(ATTRIBUTE_LABELS) as (keyof Attributes)[];

/** Mirrors the engine's penalty per missing role (src/engine/team.ts); run.test checks they agree. */
export const MISSING_ROLE_PENALTY: Record<Role, number> = { controller: 8, initiator: 3, sentinel: 2, duelist: 2 };

/** "100%", "90% flex" or "75% fora da função". */
export function fitLabel(role: Role, slot: Slot): string {
  const fit = roleFit(role, slot);
  if (fit === 1) return '100%';
  if (slot === 'flex') return '90% flex';
  return `${Math.round(fit * 100)}% fora da função`;
}

export interface StrengthNote {
  key: keyof Omit<StrengthBreakdown, 'total'>;
  label: string;
  value: number;
  /** Short pt-BR explanations, e.g. "sem controlador: −8". */
  notes: string[];
}

export const formatPoints = (n: number): string => {
  const rounded = Math.round(n * 10) / 10;
  if (rounded === 0) return '0';
  return `${rounded > 0 ? '+' : '−'}${formatDecimal(Math.abs(rounded), Number.isInteger(rounded) ? 0 : 1)}`;
};

/** pt-BR decimal ("84,2"). */
export const formatDecimal = (n: number, digits = 1): string => n.toFixed(digits).replace('.', ',');

/** Strength breakdown with the reasons behind each part. */
export function explainStrength(lineup: Lineup): { breakdown: StrengthBreakdown; parts: StrengthNote[] } {
  const breakdown = teamStrength(lineup);
  const { players } = lineup;

  const base = players
    .filter((p) => roleFit(p.card.role, p.slot) < 1)
    .map((p) => `${p.card.handle} (${ROLE_LABELS[p.card.role]}) como ${SLOT_LABELS[p.slot]}: ${fitLabel(p.card.role, p.slot)}`);
  if (base.length === 0) base.push('todos na função: 100% do OVR');

  const slots = new Set(players.map((p) => p.slot));
  const composition = (Object.keys(MISSING_ROLE_PENALTY) as Role[])
    .filter((r) => !slots.has(r))
    .map((r) => `sem ${ROLE_LABELS[r].toLowerCase()}: −${MISSING_ROLE_PENALTY[r]}`);
  if (composition.length === 0) composition.push('todas as funções cobertas');

  const igls = players.filter((p) => p.card.isIGL).length;
  const igl = [igls === 0 ? 'sem IGL: −4' : igls === 1 ? '1 IGL: +2' : `${igls} IGLs disputando a call: +0`];

  const pairs = Math.round(breakdown.chemistry / 0.5);
  const chemistry = [
    breakdown.chemistry === 0
      ? 'nenhuma dupla que jogou junta no mesmo evento'
      : `${pairs >= 8 ? '8+' : pairs} dupla${pairs === 1 ? '' : 's'} do mesmo time e evento: +0,5 cada (máx. +4)`,
  ];

  const coach = [lineup.coach ? `${lineup.coach.name}: tática +${lineup.coach.tacticBonus}` : 'sem coach'];

  return {
    breakdown,
    parts: [
      { key: 'base', label: 'Base (OVR × encaixe)', value: breakdown.base, notes: base },
      { key: 'composition', label: 'Composição', value: breakdown.composition, notes: composition },
      { key: 'igl', label: 'IGL', value: breakdown.igl, notes: igl },
      { key: 'chemistry', label: 'Química', value: breakdown.chemistry, notes: chemistry },
      { key: 'coach', label: 'Coach', value: breakdown.coach, notes: coach },
    ],
  };
}

/** Flag emoji from an ISO 3166-1 alpha-2 code ("BR" → 🇧🇷). */
export function flagEmoji(country: string): string {
  if (!/^[A-Za-z]{2}$/.test(country)) return '';
  return String.fromCodePoint(...[...country.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
