/**
 * Career mode helpers for the screens: the hub's tabs, the phase tracker, short labels and the "simular" shortcut
 * (sponsor progress is the engine's: sponsorProgress in src/game/career/views.ts). Pure functions over the career API (src/game/career), tested in careerView.test.ts.
 */
import { autoPlayMatch, careerStageOutcome, userPendingMatch, type CareerPhase, type CareerStage, type CareerState, type Contract } from '../game/career';

export type CareerTab = 'roster' | 'market' | 'academy' | 'sponsors' | 'scrims' | 'competition' | 'stats' | 'history';

export const CAREER_TABS: readonly { key: CareerTab; label: string }[] = [
  { key: 'roster', label: 'Elenco' },
  { key: 'market', label: 'Mercado' },
  { key: 'academy', label: 'Base' },
  { key: 'sponsors', label: 'Patrocínios' },
  { key: 'scrims', label: 'Scrims' },
  { key: 'competition', label: 'Competição' },
  { key: 'stats', label: 'Estatísticas' },
  { key: 'history', label: 'Histórico' },
];

/** The tab the hub opens on: the roster in the off-season, the market in the mid-season window, else the competition. */
export function defaultCareerTab(c: CareerState): CareerTab {
  if (c.phase === 'offseason') return 'roster';
  if (c.phase === 'midseason') return 'market';
  if (c.phase === 'report' || c.phase === 'over') return 'history';
  return 'competition';
}

/** Is there a transfer window open now (off-season or mid-season)? */
export const windowOpen = (c: CareerState): boolean => !!c.window && c.window.kind === c.phase;

/**
 * "Simular": plays the org's matches with the automatic veto (autoPlayMatch) until it has none left in the current
 * phase — the mid-season window, the season report or the end of a stage it no longer plays. Never signs anyone.
 */
export function simulateUntilBreak(c0: CareerState, limit = 60): CareerState {
  const phase = c0.phase;
  let c = c0;
  for (let i = 0; i < limit && c.phase === phase && userPendingMatch(c); i++) c = autoPlayMatch(c);
  return c;
}

// ---------------------------------------------------------------------------
// Phase tracker
// ---------------------------------------------------------------------------

export type StepState = 'passed' | 'reached' | 'locked';

export interface PhaseStep {
  key: CareerPhase;
  label: string;
  state: StepState;
  /** Place reached, "em disputa", "sem vaga"... */
  detail: string;
  /** A transfer window (drawn smaller). */
  window: boolean;
}

const STEPS: readonly { key: CareerPhase; label: string; window: boolean }[] = [
  { key: 'offseason', label: 'Pré-temporada', window: true },
  { key: 'league', label: 'Liga', window: false },
  { key: 'midseason', label: 'Janela', window: true },
  { key: 'masters', label: 'Masters', window: false },
  { key: 'champions', label: 'Champions', window: false },
  { key: 'report', label: 'Relatório', window: false },
];

function stageDetail(c: CareerState, stage: CareerStage): string {
  const o = careerStageOutcome(c, stage);
  if (o.status === 'out') return 'sem vaga';
  if (o.place) return o.place.rank === 1 ? 'Campeão' : o.place.label;
  if (o.status === 'playing') return o.wins + o.losses > 0 ? `${o.wins}-${o.losses}` : 'em disputa';
  return '';
}

/** Pré-temporada → Liga → Janela → Masters → Champions → Relatório, with where the season is now. */
export function careerPhaseSteps(c: CareerState): PhaseStep[] {
  const current = c.phase === 'over' ? 'report' : c.phase;
  const at = STEPS.findIndex((s) => s.key === current);
  return STEPS.map((s, i) => {
    const state: StepState = i < at ? 'passed' : i === at ? 'reached' : 'locked';
    let detail = '';
    if (s.key === 'league' || s.key === 'masters' || s.key === 'champions') detail = stageDetail(c, s.key);
    else if (state === 'reached' && s.window) detail = 'janela aberta';
    else if (s.key === 'report' && c.phase === 'over') detail = 'falência';
    return { key: s.key, label: s.label, state, detail, window: s.window };
  });
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/** Morale in words, with its effect on the OVR. */
export function moraleText(m: number): string {
  if (m >= 80) return 'Motivado (+1 OVR)';
  if (m <= 25) return 'Abatido (−1 OVR)';
  if (m < 35) return 'Insatisfeito';
  if (m >= 70) return 'Confiante';
  return 'Estável';
}

/** "2 temporadas", "Último ano", "Sem contrato". */
export function contractText(contract: Contract): string {
  if (contract.years <= 0) return 'Sem contrato';
  if (contract.years === 1) return 'Último ano';
  return `${contract.years} temporadas`;
}

/** "+2", "−1", "0" with a real minus sign. */
export function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return '0';
}
