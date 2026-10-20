/** pt-BR labels for the Daily's facts (VLR stage/round names, placements, impostor rules). */
import type { Region } from '../../engine/types';
import type { ImpostorPuzzle } from './generate';

export const REGION_NAMES: Record<Region, string> = { americas: 'Americas', emea: 'EMEA', pacific: 'Pacific', china: 'China' };

const STAGES: Record<string, string> = {
  Playoffs: 'Playoffs',
  'Group Stage': 'Fase de grupos',
  'Main Event': 'Evento principal',
  'Swiss Stage': 'Fase suíça',
  'Bracket Stage': 'Chave',
  'Play-Ins': 'Play-in',
  'Play-In Stage': 'Play-in',
  'Regular Season': 'Temporada regular',
  'League Play': 'Liga',
};

const ROUNDS: [RegExp, string][] = [
  [/^Grand Final$/i, 'Grande final'],
  [/^Upper Final$/i, 'Final superior'],
  [/^Lower Final$/i, 'Final inferior'],
  [/^Middle Final$/i, 'Final da chave do meio'],
  [/^Final$/i, 'Final'],
  [/^Upper Semifinals$/i, 'Semifinal superior'],
  [/^Lower Semifinals$/i, 'Semifinal inferior'],
  [/^Upper Quarterfinals$/i, 'Quartas superiores'],
  [/^Semifinals$/i, 'Semifinal'],
  [/^Quarterfinals$/i, 'Quartas de final'],
  [/^Upper Round (\d+)$/i, 'Chave superior, rodada $1'],
  [/^Lower Round (\d+)$/i, 'Chave inferior, rodada $1'],
  [/^Middle Round (\d+)$/i, 'Chave do meio, rodada $1'],
  [/^Opening \((\w)\)$/i, 'Abertura (grupo $1)'],
  [/^Winner's \((\w)\)$/i, 'Vencedores (grupo $1)'],
  [/^Elimination \((\w)\)$/i, 'Eliminação (grupo $1)'],
  [/^Decider \((\w)\)$/i, 'Decisiva (grupo $1)'],
  [/^Knockout Round$/i, 'Mata-mata'],
  [/^(Alpha|Omega) - Semifinals$/i, 'Semifinal ($1)'],
  [/^(Alpha|Omega) - Quarterfinals$/i, 'Quartas ($1)'],
  [/^(Alpha|Omega) - Round of 16$/i, 'Oitavas ($1)'],
  [/^Round (\d+)$/i, 'Rodada $1'],
  [/^Week (\d+)$/i, 'Semana $1'],
];

export function stageLabel(stage: string | null): string | null {
  if (!stage) return null;
  return STAGES[stage] ?? stage;
}

export function roundLabel(round: string | null): string | null {
  if (!round) return null;
  for (const [re, label] of ROUNDS) if (re.test(round)) return round.replace(re, label);
  return round;
}

/** "Playoffs · Grande final". */
export function seriesStageLabel(stage: string | null, round: string | null): string {
  return [stageLabel(stage), roundLabel(round)].filter(Boolean).join(' · ');
}

/** "Campeão", "Vice-campeão", "3º–4º lugar"; null when unknown. */
export function placementWords(placement: string | undefined): string | null {
  if (!placement) return null;
  const label = placement.replace(/(\d+)(st|nd|rd|th)/g, '$1º');
  if (/^1º$/.test(label)) return 'Campeão';
  if (/^2º$/.test(label)) return 'Vice-campeão';
  return `${label} lugar`;
}

/** The Impostor's rule, as the screen states it. */
export function impostorRuleText(p: Pick<ImpostorPuzzle, 'rule' | 'teamName' | 'eventName' | 'year'>): { title: string; text: string } {
  switch (p.rule) {
    case 'event':
      return {
        title: `Titulares da ${p.teamName} no ${p.eventName}`,
        text: `Quatro destes foram titulares da ${p.teamName} no ${p.eventName}. Um não estava no elenco desse evento. Quem é o impostor?`,
      };
    case 'year':
      return {
        title: `${p.teamName} em ${p.year}`,
        text: `Quatro destes jogaram pela ${p.teamName} em ${p.year}. Um não jogou pelo time naquele ano. Quem é o impostor?`,
      };
    default:
      return {
        title: `Jogaram pela ${p.teamName}`,
        text: `Quatro destes jogaram pela ${p.teamName} em algum evento da nossa base. Um nunca jogou pelo time. Quem é o impostor?`,
      };
  }
}

/** "2021–2023, 2025" from a sorted list of years. */
export function yearsLabel(years: readonly number[]): string {
  const out: string[] = [];
  let start = years[0];
  let prev = years[0];
  for (const y of [...years.slice(1), Number.NaN]) {
    if (y === (prev ?? 0) + 1) {
      prev = y;
      continue;
    }
    if (start !== undefined) out.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = y;
    prev = y;
  }
  return out.join(', ');
}
