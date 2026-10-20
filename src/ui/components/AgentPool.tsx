import { agentByName } from '../../data/game';
import type { AgentStat } from '../../engine/types';
import { formatStat } from '../../game/explain';
import { AgentIcon } from './GameImage';

/** Below this many maps an agent's numbers are a small sample. */
export const SMALL_SAMPLE_MAPS = 10;

export function agentName(name: string): string {
  return agentByName(name)?.displayName ?? name;
}

/** Best and worst agent by real rating (only when two or more have one). */
export function poolExtremes(pool: readonly AgentStat[]): { best?: string; worst?: string } {
  const rated = pool.filter((a) => a.rating !== null);
  if (rated.length < 2) return {};
  const sorted = [...rated].sort((x, y) => y.rating! - x.rating! || y.maps - x.maps);
  return { best: sorted[0]!.agent, worst: sorted[sorted.length - 1]!.agent };
}

/**
 * A player's real agent pool (VLR map scoreboards, never invented): maps, rating, ACS and K/D per agent, best and
 * worst agent marked with text, and a "amostra pequena" note under SMALL_SAMPLE_MAPS maps.
 */
export function AgentPoolTable({ pool, caption }: { pool: readonly AgentStat[]; caption: string }) {
  const { best, worst } = poolExtremes(pool);
  const small = pool.some((a) => a.maps < SMALL_SAMPLE_MAPS);
  return (
    <div className="agent-pool">
      <table className="agent-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Agente</th>
            <th scope="col">Mapas</th>
            <th scope="col" title="Rating do VLR com o agente">
              R
            </th>
            <th scope="col">ACS</th>
            <th scope="col">K/D</th>
          </tr>
        </thead>
        <tbody>
          {pool.map((a) => (
            <tr key={a.agent} className={a.agent === best ? 'is-best' : a.agent === worst ? 'is-worst' : undefined}>
              <th scope="row">
                <span className="agent-cell">
                  <AgentIcon name={a.agent} />
                  <span>{agentName(a.agent)}</span>
                  {a.agent === best && <span className="tag best">Melhor</span>}
                  {a.agent === worst && <span className="tag worst">Pior</span>}
                  {a.maps < SMALL_SAMPLE_MAPS && (
                    <span className="sample-flag" title={`Menos de ${SMALL_SAMPLE_MAPS} mapas: amostra pequena`}>
                      *
                    </span>
                  )}
                </span>
              </th>
              <td>{a.maps}</td>
              <td>{formatStat(a.rating, 2)}</td>
              <td>{formatStat(a.acs)}</td>
              <td>{formatStat(a.kd, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {small && <p className="small muted sample-note">* amostra pequena: menos de {SMALL_SAMPLE_MAPS} mapas com o agente.</p>}
    </div>
  );
}

/** Compact chips for a card: the top agents with maps and rating. */
export function AgentPoolChips({ pool, limit = 3 }: { pool: readonly AgentStat[]; limit?: number }) {
  return (
    <span className="agent-chips" title="Pool real de agentes (VLR.gg): mapas e rating com cada um">
      {pool.slice(0, limit).map((a) => (
        <span key={a.agent} className="agent-chip">
          <AgentIcon name={a.agent} />
          <span className="agent-chip-text">
            <span className="agent-chip-maps">
              {a.maps} mapa{a.maps === 1 ? '' : 's'}
              {a.maps < SMALL_SAMPLE_MAPS && <span className="sr-only"> (amostra pequena)</span>}
            </span>
            <span className="agent-chip-rating">R {formatStat(a.rating, 2)}</span>
          </span>
        </span>
      ))}
    </span>
  );
}
