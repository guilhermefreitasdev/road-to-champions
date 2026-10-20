/**
 * The Valdle games of "Outros modos" (docs/design.md, "Outros modos"): ids, names, tries and the calendar of the
 * daily puzzles. No data dependency, so the shell and the home card can read it before any pool loads.
 */
import { dayNumber } from '../daily/calendar';

/** "Cena pro" plays on the real pool (players, teams, series); "Jogo clássico" on the game itself (valorant-api.com). */
export type ValdleGroup = 'classico' | 'cena';

export type ValdleGameId = 'agente' | 'habilidade' | 'mapa' | 'callout' | 'arma' | 'pro' | 'grade' | 'conexoes' | 'comp';

export interface ValdleGameInfo {
  id: ValdleGameId;
  group: ValdleGroup;
  label: string;
  blurb: string;
  /** Guess games: tries; Grade 3x3: picks (9 cells + 3 misses); Conexões: mistakes allowed. */
  maxTries: number;
}

export const VALDLE_GAMES: Record<ValdleGameId, ValdleGameInfo> = {
  agente: { id: 'agente', group: 'classico', label: 'Agente Clássico', blurb: 'Adivinhe o agente: cada palpite compara função, origem, estreia no VCT e mais.', maxTries: 7 },
  habilidade: { id: 'habilidade', group: 'classico', label: 'Habilidade', blurb: 'De quem é esta habilidade? O ícone se descobre aos quadrados e as pistas abrem a cada erro.', maxTries: 6 },
  mapa: { id: 'mapa', group: 'classico', label: 'Mapa', blurb: 'Um lugar de um mapa, bem ampliado: qual é o mapa? Depois, toque no nome do lugar no minimapa.', maxTries: 5 },
  callout: { id: 'callout', group: 'classico', label: 'Callout', blurb: 'Um ponto destacado no mapa: qual é o callout?', maxTries: 5 },
  arma: { id: 'arma', group: 'classico', label: 'Arma', blurb: 'Adivinhe a arma por categoria, preço, dano, cadência e pente.', maxTries: 6 },
  pro: { id: 'pro', group: 'cena', label: 'Pro Clássico', blurb: 'Adivinhe o pro: cada palpite compara time, país, região, função, títulos e mais.', maxTries: 8 },
  grade: { id: 'grade', group: 'cena', label: 'Grade 3x3', blurb: 'Preencha cada casa com um pro que cumpra a linha e a coluna.', maxTries: 12 },
  conexoes: { id: 'conexoes', group: 'cena', label: 'Conexões', blurb: '16 pros, 4 grupos de 4 ligados por um fato escondido.', maxTries: 4 },
  comp: { id: 'comp', group: 'cena', label: 'Comp Misteriosa', blurb: 'Uma composição real num mapa real: qual time jogou com ela?', maxTries: 6 },
};

export const GROUP_GAMES: Record<ValdleGroup, readonly ValdleGameId[]> = {
  cena: ['pro', 'grade', 'conexoes', 'comp'],
  classico: ['agente', 'habilidade', 'mapa', 'callout', 'arma'],
};


export const VALDLE_GAME_IDS: readonly ValdleGameId[] = [...GROUP_GAMES.cena, ...GROUP_GAMES.classico];

/** Puzzle #1 of every Valdle game (one puzzle per day in São Paulo, like the Diário). */
export const VALDLE_LAUNCH = '2026-10-20';

/** "#N": 1 on the launch day. */
export function valdleNumber(date: string): number {
  return dayNumber(date) - dayNumber(VALDLE_LAUNCH) + 1;
}

export const isValdleGame = (x: unknown): x is ValdleGameId => typeof x === 'string' && x in VALDLE_GAMES;
