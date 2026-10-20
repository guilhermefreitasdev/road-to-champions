/**
 * "Valdle — Cena pro" over the real pool (the Diário's facts index, the series and their comps): the index and the
 * daily / free puzzles, built once on first use.
 */
import { AGENTS } from '../../data/game';
import { seriesComps } from '../../data/real/comps';
import { SERIES } from '../../data/real/series';
import type { Role } from '../../engine/types';
import { dailyData } from '../daily';
import { createPlanner, type Planner } from './planner';
import type { ValdlePuzzle } from './play';
import { buildProIndex, proMakers, type ProIndex } from './pro';

let index: ProIndex | null = null;

export function proIndex(): ProIndex {
  return (index ??= buildProIndex(dailyData(), Object.fromEntries(AGENTS.map((a) => [a.name, a.role])) as Record<string, Role>, SERIES));
}

type ProGame = 'pro' | 'grade' | 'conexoes' | 'comp';
let planners: { [G in ProGame]: Planner<ValdlePuzzle<G>> } | null = null;

function plannersOf() {
  if (!planners) {
    const m = proMakers(proIndex(), SERIES, seriesComps());
    planners = {
      pro: createPlanner('pro', m.pro),
      grade: createPlanner('grade', m.grade),
      conexoes: createPlanner('conexoes', m.conexoes),
      comp: createPlanner('comp', m.comp),
    } as unknown as { [G in ProGame]: Planner<ValdlePuzzle<G>> };
  }
  return planners;
}

export function proDaily<G extends ProGame>(game: G, date: string): ValdlePuzzle<G> {
  return plannersOf()[game].daily(date) as ValdlePuzzle<G>;
}

export function proFree<G extends ProGame>(game: G, seed: string): ValdlePuzzle<G> {
  return plannersOf()[game].free(seed) as ValdlePuzzle<G>;
}
