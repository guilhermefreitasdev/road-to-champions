import { useMemo, useState, type CSSProperties } from 'react';
import type { Card, Role } from '../../engine/types';
import { ROLE_LABELS, formatDecimal } from '../../game/explain';
import type { StatRow } from '../../game/stats';
import { AgentIcon } from './GameImage';
import { agentName } from './AgentPool';
import { Icon, YouTag } from './Icon';
import { PlayerPhoto } from './PlayerPhoto';
import { OvrCell } from './PlayerStatsTable';
import { TeamLogo } from './TeamLogo';

type Key = 'ovr' | 'maps' | 'rating' | 'acs' | 'kd' | 'kast' | 'fk' | 'multi' | 'mvps';

interface Column {
  key: Key;
  label: string;
  title: string;
  value: (r: StatRow) => number;
  /** Shows the top-3 marks (maps played is a volume, not a ranking). */
  ranked: boolean;
}

/** Rounds with 3+ kills, aces first, then 4Ks, as one sortable number. */
const multi = (r: StatRow): number => (r.k3 + r.k4 + r.aces) * 10000 + r.aces * 100 + r.k4;

const COLUMNS: Column[] = [
  { key: 'ovr', label: 'OVR', title: 'OVR com que jogou (card + fase do torneio + crescimento)', value: (r) => r.ovr, ranked: true },
  { key: 'maps', label: 'Mapas', title: 'Mapas jogados nesta etapa', value: (r) => r.maps, ranked: false },
  { key: 'rating', label: 'Rating', title: 'Rating estimado pelo simulador (1,00 = linha média; não é o Rating 2.0 do VLR)', value: (r) => r.rating, ranked: true },
  { key: 'acs', label: 'ACS', title: 'ACS estimado, ponderado pelos rounds', value: (r) => r.acs, ranked: true },
  { key: 'kd', label: 'K/D', title: 'Kills por morte', value: (r) => r.kd, ranked: true },
  { key: 'kast', label: 'KAST', title: '% de rounds com kill, assistência, sobrevivência ou troca', value: (r) => r.kast, ranked: true },
  { key: 'fk', label: 'FK/FD', title: 'First kills / first deaths (ordena por first kills)', value: (r) => r.fk, ranked: true },
  { key: 'multi', label: '3K/4K/ACE', title: 'Rounds com 3, 4 e 5 kills (ordena pelo total de rounds com 3+ kills)', value: multi, ranked: true },
  { key: 'mvps', label: 'MVP', title: 'Mapas como MVP (melhor rating dos 10)', value: (r) => r.mvps, ranked: true },
];

/** Metrics side by side in "Comparar" (all higher-is-better). */
const COMPARE: { label: string; value: (r: StatRow) => number; format: (n: number) => string }[] = [
  { label: 'Rating', value: (r) => r.rating, format: (n) => formatDecimal(n, 2) },
  { label: 'ACS', value: (r) => r.acs, format: String },
  { label: 'K/D', value: (r) => r.kd, format: (n) => formatDecimal(n, 2) },
  { label: 'KAST', value: (r) => r.kast, format: (n) => `${n}%` },
  { label: 'First kills', value: (r) => r.fk, format: String },
  { label: 'Rounds com 3+ kills', value: (r) => r.k3 + r.k4 + r.aces, format: String },
  { label: 'MVPs', value: (r) => r.mvps, format: String },
  { label: 'OVR', value: (r) => r.ovr, format: String },
];

const LETTERS = ['A', 'B', 'C'] as const;
const MAX_COMPARE = 3;
const ROLES: Role[] = ['duelist', 'initiator', 'controller', 'sentinel'];
const MIN_MAPS = [1, 2, 3, 5] as const;

const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

interface Props {
  rows: readonly StatRow[];
  /** Base card behind a row (photo, event, base OVR); the sim's user ids carry a "#user" suffix. */
  cardOf: (cardId: string) => Card | undefined;
  /** Prefix for ids, so two boards never clash. */
  idPrefix: string;
  caption: string;
}

/**
 * "Campeonato": every player of the competition. Sortable columns (Rating by default), filters by minimum maps,
 * team, role and name, the user's players marked (shield + VOCÊ), top-3 marks per column, and a compare mode
 * (2–3 players side by side with bars).
 */
export function Leaderboard({ rows, cardOf, idPrefix, caption }: Props) {
  const maxMaps = Math.max(0, ...rows.map((r) => r.maps));
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: 'rating', dir: -1 });
  const [minMaps, setMinMaps] = useState<number>(() => (maxMaps >= 2 ? 2 : 1));
  const [team, setTeam] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [query, setQuery] = useState('');
  const [comparing, setComparing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  // Keyed by entrant: two teams with the same name (the user can name his after an opponent) stay apart.
  const teams = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; isUser: boolean }>();
    for (const r of rows) seen.set(r.entrantId, { id: r.entrantId, name: r.teamName, isUser: r.isUser });
    return [...seen.values()].sort((a, b) => Number(b.isUser) - Number(a.isUser) || a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = fold(query.trim());
    return rows.filter(
      (r) => r.maps >= minMaps && (!team || r.entrantId === team) && (!role || r.role === role) && (!q || fold(r.handle).includes(q) || fold(r.teamName).includes(q)),
    );
  }, [rows, minMaps, team, role, query]);

  const col = COLUMNS.find((c) => c.key === sort.key)!;
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => sort.dir * (col.value(a) - col.value(b)) || b.rating - a.rating || b.acs - a.acs || a.handle.localeCompare(b.handle)),
    [filtered, sort.dir, col],
  );

  // Top 3 of each ranked column among the players shown (ties share the place).
  const podium = useMemo(() => {
    const out = new Map<Key, Map<string, number>>();
    for (const c of COLUMNS) {
      if (!c.ranked) continue;
      const values = filtered.map((r) => c.value(r));
      const marks = new Map<string, number>();
      for (const r of filtered) {
        const v = c.value(r);
        if (v <= 0) continue;
        const place = 1 + values.filter((x) => x > v).length;
        if (place <= 3) marks.set(r.cardId, place);
      }
      out.set(c.key, marks);
    }
    return out;
  }, [filtered]);

  const toggleSort = (key: Key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }));
  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_COMPARE ? p : [...p, id]));
  const defaultMin = maxMaps >= 2 ? 2 : 1;
  const filtersOn = minMaps !== defaultMin || !!team || !!role || !!query;
  const clearFilters = () => {
    setMinMaps(defaultMin);
    setTeam('');
    setRole('');
    setQuery('');
  };

  if (rows.length === 0) return <p className="empty-state">Nenhum mapa jogado nesta etapa ainda: a tabela aparece depois das primeiras séries.</p>;

  const comparedRows = picked.map((id) => rows.find((r) => r.cardId === id)).filter((r): r is StatRow => !!r);

  return (
    <div className="board">
      <div className="board-filters" role="group" aria-label="Filtros">
        <label className="board-search">
          <span className="sr-only">Buscar jogador ou time</span>
          <Icon name="search" />
          <input type="search" value={query} placeholder="Buscar jogador ou time…" onChange={(e) => setQuery(e.target.value)} autoComplete="off" spellCheck={false} name="board-search" />
        </label>
        <label className="board-select">
          <span>Mínimo</span>
          <select value={minMaps} onChange={(e) => setMinMaps(Number(e.target.value))}>
            {MIN_MAPS.map((n) => (
              <option key={n} value={n}>
                {n === 1 ? 'Todos' : `≥ ${n} mapas`}
              </option>
            ))}
          </select>
        </label>
        <label className="board-select">
          <span>Time</span>
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">Todos os times</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.isUser ? ' (você)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="board-select">
          <span>Função</span>
          <select value={role} onChange={(e) => setRole(e.target.value as Role | '')}>
            <option value="">Todas</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={`secondary board-compare-btn${comparing ? ' is-on' : ''}`} aria-pressed={comparing} onClick={() => setComparing((c) => !c)}>
          <Icon name="stats" /> Comparar
        </button>
      </div>

      <p className="small muted board-count" aria-live="polite">
        {sorted.length} de {rows.length} jogadores
        {minMaps > 1 ? ` · com ${minMaps}+ mapas` : ''}
        {filtersOn && (
          <>
            {' · '}
            <button type="button" className="link-btn" onClick={clearFilters}>
              limpar filtros
            </button>
          </>
        )}
      </p>

      {comparing && (
        <ComparePanel rows={comparedRows} all={rows} cardOf={cardOf} onRemove={(id) => setPicked((p) => p.filter((x) => x !== id))} />
      )}

      {sorted.length === 0 ? (
        <p className="empty-state">
          Nenhum jogador com esses filtros.{' '}
          <button type="button" className="link-btn" onClick={clearFilters}>
            Limpar filtros
          </button>
        </p>
      ) : (
        <div className="table-wrap stats-wrap board-wrap" tabIndex={0} role="region" aria-label={`${caption}: role para os lados para ver todas as colunas`}>
          <table className="stats-table board-table" id={`${idPrefix}-table`}>
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
              {sorted.map((r, i) => {
                const card = cardOf(r.cardId);
                const isPicked = picked.includes(r.cardId);
                const mark = (k: Key) => <Podium place={podium.get(k)?.get(r.cardId)} />;
                const main = r.agents[0];
                return (
                  <tr key={r.cardId} className={`${r.isUser ? 'is-user' : ''}${isPicked ? ' is-picked' : ''}`}>
                    <th scope="row">
                      <span className="board-player">
                        {comparing && (
                          <input
                            type="checkbox"
                            className="board-check"
                            checked={isPicked}
                            disabled={!isPicked && picked.length >= MAX_COMPARE}
                            onChange={() => togglePick(r.cardId)}
                            aria-label={`Comparar ${r.handle}`}
                            title={!isPicked && picked.length >= MAX_COMPARE ? 'Máximo de 3 jogadores' : undefined}
                          />
                        )}
                        <span className="board-rank">{i + 1}</span>
                        <PlayerPhoto playerId={card?.playerId ?? r.cardId} eventId={card?.eventId} handle={r.handle} country={card?.country} size={32} />
                        <span className="board-name">
                          <span className="board-handle">
                            {r.handle}
                            {r.isUser && <YouTag />}
                            {isPicked && <span className="cmp-letter">{LETTERS[picked.indexOf(r.cardId)]}</span>}
                          </span>
                          <span className="board-team small muted">
                            <TeamLogo teamId={r.teamId} eventId={card?.eventId} name={r.teamName} size={14} />
                            <span className="board-team-name">{r.teamName}</span>
                            <span className="board-role">
                              <span aria-hidden="true">· </span>
                              {ROLE_LABELS[r.role]}
                            </span>
                            {main && (
                              <span className="board-agent" title={`Agente mais jogado: ${agentName(main.agent)} (${main.maps} mapa${main.maps === 1 ? '' : 's'})`}>
                                <AgentIcon name={main.agent} />
                              </span>
                            )}
                          </span>
                        </span>
                      </span>
                    </th>
                    <td>
                      <OvrCell ovr={r.ovr} base={card?.ovr} />
                      {mark('ovr')}
                    </td>
                    <td>{r.maps}</td>
                    <td className="rating">
                      {formatDecimal(r.rating, 2)}
                      {mark('rating')}
                    </td>
                    <td>
                      {r.acs}
                      {mark('acs')}
                    </td>
                    <td className={r.kd >= 1 ? 'pos' : 'neg'}>
                      {formatDecimal(r.kd, 2)}
                      {mark('kd')}
                    </td>
                    <td>
                      {r.kast}%{mark('kast')}
                    </td>
                    <td>
                      {r.fk}/{r.fd}
                      {mark('fk')}
                    </td>
                    <td className={r.aces ? 'ace' : undefined}>
                      {r.k3}/{r.k4}/{r.aces}
                      {mark('multi')}
                    </td>
                    <td>
                      {r.mvps || '–'}
                      {mark('mvps')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** 1º/2º/3º of a column: a numbered chip (text + shape; the medal tint is extra). */
function Podium({ place }: { place: number | undefined }) {
  if (!place) return null;
  return (
    <span className={`podium p${place}`} title={`${place}º nesta coluna`}>
      {place}º
    </span>
  );
}

function ComparePanel({
  rows,
  all,
  cardOf,
  onRemove,
}: {
  rows: StatRow[];
  all: readonly StatRow[];
  cardOf: (id: string) => Card | undefined;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="compare-panel" aria-label="Comparação de jogadores">
      <ul className="cmp-people">
        {rows.map((r, i) => {
          const card = cardOf(r.cardId);
          return (
            <li key={r.cardId} className={`cmp-person cmp-${i}`}>
              <span className="cmp-letter">{LETTERS[i]}</span>
              <PlayerPhoto playerId={card?.playerId ?? r.cardId} eventId={card?.eventId} handle={r.handle} country={card?.country} size={36} />
              <span className="cmp-person-name">
                <strong>
                  {r.handle}
                  {r.isUser && <YouTag />}
                </strong>
                <span className="small muted">
                  {r.teamName} · {ROLE_LABELS[r.role]} · {r.maps} mapa{r.maps === 1 ? '' : 's'} · {r.kills}/{r.deaths}/{r.assists}
                </span>
              </span>
              <button type="button" className="ghost cmp-remove" onClick={() => onRemove(r.cardId)} aria-label={`Remover ${r.handle} da comparação`}>
                <Icon name="close" />
              </button>
            </li>
          );
        })}
      </ul>
      {rows.length < 2 ? (
        <p className="small muted cmp-hint">
          Marque {rows.length === 0 ? '2 ou 3 jogadores' : 'mais um jogador (até 3)'} na coluna da esquerda da tabela para ver os números lado a lado.
        </p>
      ) : (
        <dl className="cmp-metrics">
          {COMPARE.map((m) => {
            const top = Math.max(...all.map(m.value), 0.0001);
            const best = Math.max(...rows.map(m.value));
            return (
              <div key={m.label} className="cmp-metric">
                <dt>{m.label}</dt>
                {rows.map((r, i) => {
                  const v = m.value(r);
                  const isBest = v === best && rows.some((o) => m.value(o) !== best);
                  return (
                    <dd key={r.cardId} className={`cmp-row cmp-${i}`}>
                      <span className="cmp-letter" aria-hidden="true">
                        {LETTERS[i]}
                      </span>
                      <span className="sr-only">{r.handle}: </span>
                      <span className="cmp-track" aria-hidden="true">
                        <span className="cmp-fill" style={{ '--w': `${Math.max(2, (v / top) * 100)}%` } as CSSProperties} />
                      </span>
                      <span className="cmp-value">
                        {m.format(v)}
                        {isBest && <Icon name="check" label="melhor" className="cmp-best" />}
                      </span>
                    </dd>
                  );
                })}
              </div>
            );
          })}
        </dl>
      )}
    </section>
  );
}
