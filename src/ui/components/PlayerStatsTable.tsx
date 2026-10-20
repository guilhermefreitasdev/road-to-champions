import { Fragment, useState } from 'react';
import type { Card } from '../../engine/types';
import { ROLE_LABELS, formatDecimal } from '../../game/explain';
import type { PlayerStatsRow } from '../playerStats';
import { AgentPoolTable, agentName } from './AgentPool';
import { AgentIcon } from './GameImage';
import { Icon } from './Icon';

type SortKey = 'maps' | 'kills' | 'kd' | 'acs' | 'rating' | 'kast' | 'fk' | 'k3' | 'k4' | 'aces' | 'mvps';

const COLUMNS: { key: SortKey; label: string; title: string }[] = [
  { key: 'maps', label: 'Mapas', title: 'Mapas jogados' },
  { key: 'kills', label: 'K/D/A', title: 'Kills / mortes / assistências (ordena por kills)' },
  { key: 'kd', label: 'KD', title: 'Kills por morte' },
  { key: 'acs', label: 'ACS', title: 'ACS estimado, ponderado pelos rounds' },
  { key: 'rating', label: 'R', title: 'Rating estimado pelo simulador (1,00 = linha média; não é o Rating 2.0 do VLR)' },
  { key: 'kast', label: 'KAST', title: '% de rounds com kill, assistência, sobrevivência ou troca' },
  { key: 'fk', label: 'FK/FD', title: 'First kills / first deaths (ordena por first kills)' },
  { key: 'k3', label: '3K', title: 'Rounds com 3 kills' },
  { key: 'k4', label: '4K', title: 'Rounds com 4 kills' },
  { key: 'aces', label: 'ACE', title: 'Rounds com 5 kills' },
  { key: 'mvps', label: 'MVP', title: 'Mapas como MVP (melhor rating dos 10)' },
];

interface Props {
  rows: readonly PlayerStatsRow[];
  /** Cards behind the rows, by card id: role and the real agent pool. Absent in old history entries. */
  cards?: ReadonlyMap<string, Card>;
  caption: string;
  /** Prefix for ids, so two tables on one page never clash. */
  idPrefix: string;
}

/** The user's five over a run: sortable columns, and a per-player breakdown by agent (run + real pool). */
export function PlayerStatsTable({ rows, cards, caption, idPrefix }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'rating', dir: -1 });
  const [open, setOpen] = useState<string | null>(null);
  const sorted = [...rows].sort((a, b) => sort.dir * (a[sort.key] - b[sort.key]) || b.acs - a.acs || (a.handle < b.handle ? -1 : 1));
  const best = Math.max(...rows.map((r) => r.rating));

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }));

  if (rows.length === 0) return <p className="empty-state">Nenhum mapa jogado ainda: as estatísticas aparecem depois da primeira série.</p>;

  return (
    <div className="table-wrap stats-wrap">
      <table className="stats-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Jogador</th>
            {COLUMNS.map((c) => (
              <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.dir === -1 ? 'descending' : 'ascending') : undefined}>
                <button type="button" className={`sort${sort.key === c.key ? ' is-sorted' : ''}`} title={c.title} onClick={() => toggleSort(c.key)}>
                  {c.label}
                  {sort.key === c.key && <Icon name="chevron" className={`sort-arrow ${sort.dir === -1 ? 'desc' : 'asc'}`} />}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            // The sim suffixes the user's card ids ("…#user"); the cards map is keyed by the plain id.
            const card = cards?.get(p.cardId) ?? cards?.get(p.cardId.replace(/#.*$/, ''));
            const isOpen = open === p.cardId;
            const detailId = `${idPrefix}-detail-${p.cardId}`;
            return (
              <Fragment key={p.cardId}>
                <tr className={isOpen ? 'is-open' : undefined}>
                  <th scope="row">
                    <button
                      type="button"
                      className="stats-player"
                      aria-expanded={isOpen}
                      aria-controls={detailId}
                      onClick={() => setOpen(isOpen ? null : p.cardId)}
                    >
                      <Icon name="chevron" className="stats-chevron" />
                      <span className="stats-handle">{p.handle}</span>
                      {card && <span className="stats-role">{ROLE_LABELS[card.role]}</span>}
                      {p.rating === best && rows.length > 1 && <span className="tag mvp">Top</span>}
                    </button>
                  </th>
                  <td>{p.maps}</td>
                  <td className="kda">
                    {p.kills}/{p.deaths}/{p.assists}
                  </td>
                  <td className={p.kd >= 1 ? 'pos' : 'neg'}>{formatDecimal(p.kd, 2)}</td>
                  <td>{p.acs}</td>
                  <td className="rating">{formatDecimal(p.rating, 2)}</td>
                  <td>{p.kast}%</td>
                  <td>
                    {p.fk}/{p.fd}
                  </td>
                  <td>{p.k3 || '–'}</td>
                  <td>{p.k4 || '–'}</td>
                  <td className={p.aces ? 'ace' : undefined}>{p.aces || '–'}</td>
                  <td>{p.mvps || '–'}</td>
                </tr>
                {isOpen && (
                  <tr className="stats-detail" id={detailId}>
                    <td colSpan={COLUMNS.length + 1}>
                      <div className="stats-detail-grid">
                        <RunAgents row={p} />
                        {card?.agentPool && card.agentPool.length > 0 ? (
                          <AgentPoolTable pool={card.agentPool} caption="Pool real (VLR.gg)" />
                        ) : (
                          <p className="small muted">Pool real de agentes: sem dados para este card.</p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RunAgents({ row }: { row: PlayerStatsRow }) {
  if (row.agents.length === 0) return <p className="small muted">Agentes nesta run: o simulador não registrou agentes nestes mapas.</p>;
  return (
    <div className="agent-pool">
      <table className="agent-table">
        <caption>Nesta run</caption>
        <thead>
          <tr>
            <th scope="col">Agente</th>
            <th scope="col">Mapas</th>
            <th scope="col">R</th>
            <th scope="col">K/D</th>
            <th scope="col">KD</th>
          </tr>
        </thead>
        <tbody>
          {row.agents.map((a) => (
            <tr key={a.agent}>
              <th scope="row">
                <span className="agent-cell">
                  <AgentIcon name={a.agent} />
                  <span>{agentName(a.agent)}</span>
                </span>
              </th>
              <td>{a.maps}</td>
              <td>{formatDecimal(a.rating, 2)}</td>
              <td>
                {a.kills}/{a.deaths}
              </td>
              <td>{formatDecimal(a.kd, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
