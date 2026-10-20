/**
 * "Valdle — Jogo clássico" over the real snapshot (src/data/game, valorant-api.com; agent debut years from the VLR
 * agent stats; the Mapa game's screenshots from the VALORANT Wiki, places.json): the data and the daily / free puzzles, built once on first use. Does not import the card pool.
 */
import agentDetailsJson from '../../data/game/agent-details.json';
import placesJson from '../../data/game/places.json';
import weaponsJson from '../../data/game/weapons.json';
import agentStatsJson from '../../data/real/vlr/agent-stats.json';
import { AGENTS, MAPS } from '../../data/game';
import { buildClassicData, classicMakers, type ClassicData, type ClassicInput } from './classic';
import { createPlanner, type Planner } from './planner';
import type { ValdlePuzzle } from './play';

let data: ClassicData | null = null;

export function classicData(): ClassicData {
  return (data ??= buildClassicData({
    agents: AGENTS as ClassicInput['agents'],
    details: agentDetailsJson as ClassicInput['details'],
    maps: MAPS,
    places: placesJson.places,
    weapons: weaponsJson as ClassicInput['weapons'],
    agentStats: (agentStatsJson as unknown as { players: ClassicInput['agentStats'] }).players,
  }));
}

type ClassicGame = 'agente' | 'habilidade' | 'mapa' | 'callout' | 'arma';
let planners: { [G in ClassicGame]: Planner<ValdlePuzzle<G>> } | null = null;

function plannersOf() {
  if (!planners) {
    const m = classicMakers(classicData());
    planners = {
      agente: createPlanner('agente', m.agente),
      habilidade: createPlanner('habilidade', m.habilidade),
      mapa: createPlanner('mapa', m.mapa),
      callout: createPlanner('callout', m.callout),
      arma: createPlanner('arma', m.arma),
    } as unknown as { [G in ClassicGame]: Planner<ValdlePuzzle<G>> };
  }
  return planners;
}

export function classicDaily<G extends ClassicGame>(game: G, date: string): ValdlePuzzle<G> {
  return plannersOf()[game].daily(date) as ValdlePuzzle<G>;
}

export function classicFree<G extends ClassicGame>(game: G, seed: string): ValdlePuzzle<G> {
  return plannersOf()[game].free(seed) as ValdlePuzzle<G>;
}
