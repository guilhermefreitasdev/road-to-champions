/**
 * pt-BR labels and plain-language explanations of the engine's numbers, shared by the UI and its tests.
 */
import {
  COMM_PER_COMPATRIOT_PAIR,
  COMM_PER_TEAMMATE_PAIR,
  DIMENSION_KEYS,
  DIMENSION_REFERENCE,
  DIMENSION_WEIGHT,
  DOUBLE_CONTROLLER_UTILITY,
  MISSING_ROLE_PENALTY as ENGINE_MISSING_ROLE_PENALTY,
  NO_CONTROLLER_UTILITY,
  NO_IGL_CAP,
  NO_IGL_FACTOR,
  NO_INITIATOR_UTILITY,
  SECOND_IGL_COMM_PENALTY,
  SECOND_IGL_DECISION_BONUS,
  UNKNOWN_IGL_DECISION,
  cardFit,
  chemistryPairs,
  decisionDetail,
  dimensionPoints,
  isNaturalFlex,
  roleFit,
  teamStrength,
  utilityCoverage,
  type DimensionKey,
  type StrengthBreakdown,
} from '../engine/team';
import {
  ANCHOR_DIMENSION_BONUS,
  anchors,
} from '../engine/team';
import {
  AURA_OVR,
  AURA_TEAM_CAP,
  FORM_SIGMA,
  META_BONUS_MAX,
  PRODIGY_GROWTH_CAP,
  PRODIGY_GROWTH_PER_STAGE,
  TOURNAMENT_FORM_SHOWN,
} from '../engine/form';
import { AGENT_EDGE_MAX, AGENT_SHRINK_MAPS, AGENT_TEAM_CAP } from '../engine/agents';
import { FAMILIARITY_CAP, FAMILIARITY_PER_MAP } from '../engine/familiarity';
import type { Attributes, AuraTier, Card, Lineup, LineupPlayer, Role, Slot } from '../engine/types';

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
  presence: 'Presença',
  decision: 'Decisão',
};

export const ATTRIBUTE_KEYS = Object.keys(ATTRIBUTE_LABELS) as (keyof Attributes)[];

/** The engine's penalty per missing role (src/engine/team.ts). */
export const MISSING_ROLE_PENALTY: Record<Role, number> = ENGINE_MISSING_ROLE_PENALTY;

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  mechanics: 'Mecânica',
  utility: 'Utilidade',
  decision: 'Tomada de decisão',
  communication: 'Comunicação',
  clutch: 'Clutch',
};

/** One line per dimension: what goes into it. */
export const DIMENSION_HINTS: Record<DimensionKey, string> = {
  mechanics: 'mira e entrada dos cinco (HS%, KPR, ADR, first kills)',
  utility: 'utilidade dos cinco (APR, KAST) e cobertura de controlador e iniciador',
  decision: 'IGL (70%), o segundo melhor em decisão (15%) e o coach (15%)',
  communication: 'duplas que já jogaram juntas ou falam a mesma língua',
  clutch: 'clutch médio, o melhor clutcher e a presença (KAST)',
};

/** "100%", "90% flex" or "75% fora da função" (role only; cardFitLabel knows natural flexes). */
export function fitLabel(role: Role, slot: Slot): string {
  const fit = roleFit(role, slot);
  if (fit === 1) return '100%';
  if (slot === 'flex') return '90% flex';
  return `${Math.round(fit * 100)}% fora da função`;
}

/** Like fitLabel, but card-aware: "100% flex nato" when a natural flex fills another role he played or the flex slot. */
export function cardFitLabel(card: Pick<Card, 'role' | 'flexRoles'>, slot: Slot): string {
  if (slot !== card.role && cardFit(card, slot) === 1) return '100% flex nato';
  return fitLabel(card.role, slot);
}

/** "Flex nato: sem penalidade em Iniciador/Sentinela e no slot Flex", or null for a card that is not a natural flex. */
export function flexLabel(card: Pick<Card, 'role' | 'flexRoles'>): string | null {
  if (!isNaturalFlex(card)) return null;
  const roles = card.flexRoles!.filter((r) => r !== card.role).map((r) => ROLE_LABELS[r]);
  return roles.length > 0 ? `Flex nato: sem penalidade em ${roles.join('/')} e no slot Flex` : 'Flex nato: sem penalidade no slot Flex';
}

export const FLEX_HELP =
  'Flex nato: nos dados, o jogador jogou de verdade duas ou mais funções (parte relevante dos mapas em cada uma). Rende 100% nessas funções e no slot Flex, em vez de 75% fora da função e 90% no Flex.';

export interface StrengthNote {
  key: 'base' | 'composition' | DimensionKey;
  label: string;
  /** Strength points (the base is the OVR average itself). */
  value: number;
  /** Short pt-BR explanations, e.g. "sem controlador: −8". */
  notes: string[];
}

export interface DimensionNote extends StrengthNote {
  key: DimensionKey;
  /** The dimension, 0–100. */
  level: number;
  /** Reference level: a typical real roster scores 0 points here. */
  reference: number;
}

export const formatPoints = (n: number): string => {
  const rounded = Math.round(n * 10) / 10;
  if (rounded === 0) return '0';
  return `${rounded > 0 ? '+' : '−'}${formatDecimal(Math.abs(rounded), Number.isInteger(rounded) ? 0 : 1)}`;
};

/** pt-BR decimal ("84,2"). */
export const formatDecimal = (n: number, digits = 1): string => n.toFixed(digits).replace('.', ',');

const pct = (factor: number): string => `${Math.round((1 - factor) * 100)}%`;

/**
 * Strength breakdown with the reasons behind each part: base and composition in points, the five dimensions
 * (0–100, with the points each one adds) and `warnings`, the things the player should act on ("Sem IGL…").
 * `parts` always sums to the total.
 */
export function explainStrength(lineup: Lineup): {
  breakdown: StrengthBreakdown;
  parts: StrengthNote[];
  dimensions: DimensionNote[];
  warnings: string[];
} {
  const breakdown = teamStrength(lineup);
  const { players } = lineup;
  const warnings: string[] = [];

  const base = players
    .filter((p) => cardFit(p.card, p.slot) < 1)
    .map((p) => `${p.card.handle} (${ROLE_LABELS[p.card.role]}) como ${SLOT_LABELS[p.slot]}: ${fitLabel(p.card.role, p.slot)}`);
  if (base.length === 0) base.push('todos na função: 100% do OVR');
  for (const p of players) {
    if (p.slot !== p.card.role && cardFit(p.card, p.slot) === 1) {
      base.push(`${p.card.handle} como ${SLOT_LABELS[p.slot]}: ${flexLabel(p.card)}`);
    }
  }

  const slots = players.map((p) => p.slot);
  const composition = (Object.keys(MISSING_ROLE_PENALTY) as Role[])
    .filter((r) => !slots.includes(r) && MISSING_ROLE_PENALTY[r] > 0)
    .map((r) => `sem ${ROLE_LABELS[r].toLowerCase()}: −${MISSING_ROLE_PENALTY[r]}`);
  if (composition.length === 0) composition.push('todas as funções que pesam cobertas');
  if (!slots.includes('sentinel')) composition.push('sem sentinela: 0 (19% das comps de elite jogam assim)');

  // Mechanics
  const mechanics = ['média de mira (60%) e entrada (40%) × encaixe'];

  // Utility
  const coverage = utilityCoverage(slots);
  const utility = ['média de utilidade × encaixe'];
  if (!slots.includes('controller')) {
    utility.push(`sem controlador: −${pct(NO_CONTROLLER_UTILITY)} (nenhuma comp de elite joga sem um)`);
    warnings.push(
      `Sem controlador: Utilidade −${pct(NO_CONTROLLER_UTILITY)} e −${MISSING_ROLE_PENALTY.controller} de composição. Em 2.534 composições de eventos internacionais, nenhum time jogou sem um.`,
    );
  }
  if (!slots.includes('initiator')) utility.push(`sem iniciador: −${pct(NO_INITIATOR_UTILITY)}`);
  if (coverage.bonus > 0) utility.push(`dois controladores com iniciador: +${DOUBLE_CONTROLLER_UTILITY}`);

  // Decision
  const d = decisionDetail(lineup);
  const decision: string[] = [];
  const level = (c: { handle: string; attrs: { decision: number } }) => `${c.handle} ${c.attrs.decision}`;
  if (d.status === 'one' || d.status === 'two') {
    const source = IGL_SOURCE_SHORT[d.igl!.iglSource ?? ''] ?? 'Liquipedia';
    decision.push(`IGL: ${level(d.igl!)} (fonte: ${source}) · 70%`);
  } else if (d.status === 'unknown') {
    decision.push(`IGL não consta nos dados: decisão neutra ${UNKNOWN_IGL_DECISION} (mediana dos elencos reais), sem penalidade`);
  } else {
    decision.push(`sem IGL: o melhor em decisão (${level(d.second!)}) faz as calls · 70%`);
  }
  if (d.status !== 'unknown') {
    if (d.status !== 'none' && d.second) decision.push(`segunda voz: ${level(d.second)} · 15%`);
    decision.push(
      lineup.coach
        ? `coach ${lineup.coach.name}: tática ${lineup.coach.tacticBonus} → ${d.coach} · 15%`
        : `sem coach: ${d.coach} · 15%`,
    );
  }
  if (d.status === 'none') {
    const cost = dimensionPoints('decision', d.value) - dimensionPoints('decision', d.raw);
    decision.push(`sem IGL: ×${formatDecimal(NO_IGL_FACTOR, 2)} e teto ${NO_IGL_CAP} → ${Math.round(d.value)}`);
    warnings.push(
      `Sem IGL: Tomada de decisão −${pct(NO_IGL_FACTOR)} (máx. ${NO_IGL_CAP}) — força ≈ ${formatPoints(cost)} agora e ${formatPoints(dimensionPoints('decision', d.value))} contra um time com IGL típico (${DIMENSION_REFERENCE.decision}), mais ~1 ponto nos rounds de compra e pós-plant (×1,5 no 3º mapa e na prorrogação). Sem alguém para fazer as calls, o time compra pior depois de perder, organiza mal pós-plant e retake e se adapta menos ao longo da série.`,
    );
  }
  if (d.status === 'two') {
    decision.push(`segundo IGL (${d.otherIgls.join(', ')}): +${SECOND_IGL_DECISION_BONUS}`);
    warnings.push(
      `Dois IGLs: segunda voz no mid-round (Tomada de decisão +${SECOND_IGL_DECISION_BONUS}), mas duas vozes nas calls (Comunicação −${SECOND_IGL_COMM_PENALTY}).`,
    );
  }
  if (lineup.coach && d.status !== 'unknown') {
    decision.push('o coach cobre parte da tática (preparação, intervalo e timeouts), mas não faz calls durante o round');
  }
  const anchorNames = anchors(lineup).map((c) => c.handle);
  if (anchorNames.length > 0) decision.push(`durão (${anchorNames.join(', ')}): +${ANCHOR_DIMENSION_BONUS}`);

  // Communication
  const { teammates, compatriots } = chemistryPairs(lineup);
  const duplas = (n: number) => `${n} dupla${n === 1 ? '' : 's'}`;
  const communication: string[] = [];
  if (teammates > 0) communication.push(`${duplas(teammates)} do mesmo time e evento: +${COMM_PER_TEAMMATE_PAIR} cada`);
  if (compatriots > 0) communication.push(`${duplas(compatriots)} do mesmo país: +${COMM_PER_COMPATRIOT_PAIR} cada`);
  if (communication.length === 0) communication.push('nenhuma dupla do mesmo time e evento ou do mesmo país');
  if (d.status === 'two') communication.push(`dois IGLs: −${SECOND_IGL_COMM_PENALTY}`);
  if (anchorNames.length > 0) communication.push(`durão: +${ANCHOR_DIMENSION_BONUS}`);

  // Clutch
  const clutch = ['clutch médio (50%), melhor clutcher (30%) e presença média (KAST, 20%)'];

  const notesByKey: Record<DimensionKey, string[]> = { mechanics, utility, decision, communication, clutch };
  const dimensions: DimensionNote[] = DIMENSION_KEYS.map((key) => ({
    key,
    label: DIMENSION_LABELS[key],
    level: breakdown.dimensions[key],
    reference: DIMENSION_REFERENCE[key],
    value: breakdown.points[key],
    notes: [
      ...notesByKey[key],
      `${formatDecimal(DIMENSION_WEIGHT[key])} ponto a cada 10 acima ou abaixo de ${DIMENSION_REFERENCE[key]}`,
    ],
  }));

  return {
    breakdown,
    parts: [
      { key: 'base', label: 'Base (OVR × encaixe)', value: breakdown.base, notes: base },
      { key: 'composition', label: 'Composição', value: breakdown.composition, notes: composition },
      ...dimensions,
    ],
    dimensions,
    warnings,
  };
}

// --- Modelo v3: form, aura, prodigies (docs/design.md "Modelo v3") ---

export const AURA_LABELS: Record<AuraTier, string> = { goat: 'GOAT', legend: 'Lenda', star: 'Estrela', rising: 'Em ascensão' };

/** "2 títulos · top-3 de rating em 3 internacionais · 7º internacional", from the card's career facts. */
export function auraFacts(card: Card): string {
  const c = card.career;
  if (!c) return '';
  const parts: string[] = [];
  if (c.titles > 0) parts.push(`${c.titles} título${c.titles === 1 ? '' : 's'} internaciona${c.titles === 1 ? 'l' : 'is'}`);
  if (c.top3 > 0) parts.push(`top-3 de rating em ${c.top3} internaciona${c.top3 === 1 ? 'l' : 'is'}`);
  if (c.high > 0) parts.push(`rating ≥ 1,10 em ${c.high}`);
  parts.push(c.events === 1 ? 'primeiro internacional' : `${c.events}º internacional`);
  return parts.join(' · ');
}

/** Tooltip of the aura badge: what the tier means, the facts behind it and what it does in the game. */
export function auraTitle(card: Card): string {
  const tier = card.aura;
  if (!tier) return '';
  const facts = auraFacts(card);
  const effect =
    tier === 'rising'
      ? 'Sem efeito no jogo: é só o fato da estreia.'
      : `No jogo: +${AURA_OVR[tier]} OVR-equivalente nas kills, só em mapa decisivo e prorrogação (teto +${AURA_TEAM_CAP} de força por time).`;
  return `${AURA_LABELS[tier]}: ${facts}. ${effect} A aura sai só de fatos (títulos, rating nos internacionais, estreia): nos dados ninguém rende mais em playoff ou decider.`;
}

export const PRODIGY_HELP = `Prodígio: primeiro internacional com rating ≥ 1,10 ou entre os 25% melhores do evento. Na run, +${formatDecimal(PRODIGY_GROWTH_PER_STAGE)} OVR por fase alcançada (máx. +${PRODIGY_GROWTH_CAP}). Nos dados, estreantes rendem igual aos veteranos e quem estreia muito bem cai um pouco depois; o crescimento aqui é parte do jogo.`;

export const ANCHOR_HELP = `Durão: lenda ou GOAT que lidera (IGL ou decisão alta), ou campeão rendendo no nível do time naquele evento. Tomada de decisão e Comunicação +${ANCHOR_DIMENSION_BONUS} (uma vez por time).`;

export const FORM_HELP = `Forma do dia: cada jogador sorteia uma forma por mapa (±${Math.round(FORM_SIGMA * 100)}% nas kills, com dias excepcionais raros), que pesa também um pouco na força do time. Estrelas têm teto maior, não sorte maior: nos dados, o quanto um jogador oscila não se repete de evento para evento; o que muda com o nível é o teto.`;

export const AGENT_HELP = `Agente por mapa: cada jogador escolhe um agente do seu histórico real (mais mapas jogados = mais chance, com um empurrão para o meta do mapa; sem repetir agente no time). O rendimento no agente pesa pouco: a diferença para a média do próprio jogador é encolhida pela amostra (mapas / (mapas + ${AGENT_SHRINK_MAPS})), vale no máximo ±${AGENT_EDGE_MAX} OVR nas kills e no máximo ±${AGENT_TEAM_CAP} de força por time. Nos dados, quase toda a diferença entre o melhor e o pior agente de um jogador é acaso; só uma amostra grande sobrevive ao encolhimento.`;

export const FAMILIARITY_HELP = `Familiaridade com o mapa: cada mapa que um time joga na run ou na temporada vale +${formatDecimal(FAMILIARITY_PER_MAP)} de força nele nas próximas partidas (até +${FAMILIARITY_CAP}). Vale para todos os times, inclusive a IA, e entra no veto: os times puxam os mapas que vêm jogando.`;

/** "Familiaridade: +1 (2 mapas)", or null when the team never played the map. */
export function familiarityLabel(played: number, points: number): string | null {
  if (played <= 0) return null;
  return `Familiaridade: ${formatPoints(points)} (${played} mapa${played === 1 ? '' : 's'})`;
}

/** "Agente: +1,2 OVR" for a non-zero agent edge, or null. */
export function agentEdgeLabel(edgeOvr: number): string | null {
  const rounded = Math.round(edgeOvr * 10) / 10;
  if (rounded === 0) return null;
  return `Agente: ${formatPoints(rounded)} OVR`;
}

export const META_HELP = `Encaixe de meta: a comp que o elenco consegue montar com os agentes que cada card jogou, contra o meta do mapa no ano do pool (participação de cada agente nos slots). Até +${formatDecimal(META_BONUS_MAX)} de força, nunca negativo. Nos dados, um jogador rende igual em qualquer agente ou mapa que joga; o que pesa é a comp certa para o mapa.`;

/** "Em alta neste torneio (+3)" / "Em baixa neste torneio (−2)", or null when the form is too small to mention. */
export function tournamentFormLabel(player: LineupPlayer): string | null {
  const t = player.tournamentForm ?? 0;
  if (Math.abs(t) < TOURNAMENT_FORM_SHOWN) return null;
  return `${t > 0 ? 'Em alta' : 'Em baixa'} neste torneio (${formatPoints(t)})`;
}

/** Notes about the lineup's anchors, prodigies and tournament forms, for the Team screen. */
export function lineupNotes(lineup: Lineup): string[] {
  const notes: string[] = [];
  const anchor = anchors(lineup);
  if (anchor.length > 0) {
    notes.push(`Durão: ${anchor.map((c) => c.handle).join(', ')} — Tomada de decisão e Comunicação +${ANCHOR_DIMENSION_BONUS} (uma vez por time).`);
  }
  for (const p of lineup.players) {
    if (p.card.prodigy) {
      const g = p.growth ?? 0;
      notes.push(
        g > 0
          ? `Prodígio em ascensão: ${p.card.handle} — +${formatDecimal(g)} OVR pelas fases alcançadas nesta run (máx. +${PRODIGY_GROWTH_CAP}).`
          : `Prodígio: ${p.card.handle} — ganha +${formatDecimal(PRODIGY_GROWTH_PER_STAGE)} OVR por fase alcançada nesta run (máx. +${PRODIGY_GROWTH_CAP}).`,
      );
    }
  }
  for (const p of lineup.players) {
    const label = tournamentFormLabel(p);
    if (label) notes.push(`${p.card.handle}: ${label.toLowerCase()}.`);
  }
  return notes;
}

/** Short source of an IGL flag, for the decision notes. */
const IGL_SOURCE_SHORT: Record<string, string> = {
  'event-captain': 'capitão do evento',
  'squad-captain': 'capitão do elenco',
  'infobox-unique': 'perfil de carreira',
};

/** Where an IGL flag came from (Liquipedia), in plain pt-BR. */
export const IGL_SOURCE_LABELS: Record<string, string> = {
  'event-captain': 'capitão do time neste evento (Liquipedia)',
  'squad-captain': 'capitão do elenco na data do evento (Liquipedia)',
  'infobox-unique': 'IGL na carreira, segundo o perfil (Liquipedia)',
};

/** Placement as published ("1st", "3rd–4th", "17th–32nd") in pt-BR ("1º", "3º–4º", "17º–32º"). */
export function placementLabel(text: string): string {
  return text.replace(/(\d+)(st|nd|rd|th)/g, '$1º');
}

/** pt-BR rating with 2 decimals ("1,21"), or "—" when the source has none. */
export function formatStat(n: number | null | undefined, digits = 0): string {
  return n === null || n === undefined ? '—' : n.toFixed(digits).replace('.', ',');
}

/** Flag emoji from an ISO 3166-1 alpha-2 code ("BR" → 🇧🇷). */
export function flagEmoji(country: string): string {
  if (!/^[A-Za-z]{2}$/.test(country)) return '';
  return String.fromCodePoint(...[...country.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
