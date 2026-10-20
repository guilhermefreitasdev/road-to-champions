import { describe, expect, it } from 'vitest';
import { autoMidseason, autoOffseason, createCareer, sponsorProgress, startStage, userPendingMatch, type CareerState } from '../game/career';
import { careerPhaseSteps, contractText, defaultCareerTab, moraleText, signed, simulateUntilBreak } from './careerView';

const fresh = (): CareerState => createCareer({ name: 'Org Teste', region: 'americas', seed: 'ui-test' });

describe('career view helpers', () => {
  it('tracks the season phases and opens the right tab', () => {
    const c = fresh();
    const steps = careerPhaseSteps(c);
    expect(steps.map((s) => s.label)).toEqual(['Pré-temporada', 'Liga', 'Janela', 'Masters', 'Champions', 'Relatório']);
    expect(steps[0]).toMatchObject({ state: 'reached', detail: 'janela aberta' });
    expect(steps.slice(1).every((s) => s.state === 'locked')).toBe(true);
    expect(defaultCareerTab(c)).toBe('roster');
    expect(sponsorProgress(c, 'league-top4')).toEqual({ state: 'open', text: 'Começa com a liga' });
  });

  it('simulates up to the next break without signing anyone, then to the report', () => {
    let c = startStage(autoOffseason(fresh()));
    expect(c.phase).toBe('league');
    const roster = c.players.map((p) => p.id).sort();
    c = simulateUntilBreak(c);
    expect(c.phase).not.toBe('league');
    expect(c.players.map((p) => p.id).sort()).toEqual(roster);
    if (c.phase === 'midseason') {
      expect(careerPhaseSteps(c)[1]!.state).toBe('passed');
      expect(defaultCareerTab(c)).toBe('market');
      c = startStage(autoMidseason(c));
    }
    for (let i = 0; i < 4 && c.phase !== 'report' && c.phase !== 'over'; i++) c = simulateUntilBreak(c);
    expect(['report', 'over']).toContain(c.phase);
    expect(userPendingMatch(c)).toBeNull();
    const last = careerPhaseSteps(c).at(-1)!;
    expect(last.state).toBe('reached');
    // At the report every objective is settled one way or the other.
    for (const o of ['league-top6', 'league-top4', 'masters', 'champions', 'title', 'top5-rating'] as const) {
      expect(['met', 'missed']).toContain(sponsorProgress(c, o).state);
    }
  });

  it('labels morale, contracts and deltas', () => {
    expect(moraleText(85)).toMatch(/\+1 OVR/);
    expect(moraleText(20)).toMatch(/−1 OVR/);
    expect(moraleText(65)).toBe('Estável');
    expect(contractText({ salary: 50, years: 0 })).toBe('Sem contrato');
    expect(contractText({ salary: 50, years: 1 })).toBe('Último ano');
    expect(contractText({ salary: 50, years: 3 })).toBe('3 temporadas');
    expect([signed(2), signed(-1), signed(0)]).toEqual(['+2', '−1', '0']);
  });
});
