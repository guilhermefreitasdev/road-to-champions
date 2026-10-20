import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { REGIONS, type Region, type Role } from '../../engine/types';
import { AURA_LABELS, ROLE_LABELS, auraFacts, auraTitle, formatDecimal, formatStat, placementLabel } from '../../game/explain';
import { REGION_LABELS } from '../../game/season';
import { CountryChip } from '../components/CountryChip';
import { Icon } from '../components/Icon';
import { PlayerCard } from '../components/PlayerCard';
import { PlayerPhoto } from '../components/PlayerPhoto';
import { TeamLogo } from '../components/TeamLogo';
import { flexRolesText, isNaturalFlex } from '../fit';
import { careerSummary, filterRanking, playerTimeline, rankEntries, rankYears, type RankEntry, type RankFilters, type Tier, type YearKey } from '../ranking';

const PAGE = 50;
const ROLES: Role[] = ['duelist', 'initiator', 'controller', 'sentinel'];
const ROLE_SHORT: Record<Role, string> = { duelist: 'DUE', initiator: 'INI', controller: 'CON', sentinel: 'SEN' };
const AURAS = ['goat', 'legend', 'star'] as const;
const TIER_LABELS: Record<Tier, string> = { international: 'Internacional', regional: 'Liga regional' };

const DEFAULTS: RankFilters = { year: 'all', tier: '', region: '', role: '', aura: '', query: '', onePerPlayer: true };

interface Props {
  onBack: () => void;
}

/** "Ranking": the top OVRs of every card in the real pool, all-time or per year, with filters and a detail drawer. */
export function Ranking({ onBack }: Props) {
  const all = useMemo(rankEntries, []);
  const years = useMemo(rankYears, []);
  const [f, setF] = useState<RankFilters>(DEFAULTS);
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<RankEntry | null>(null);
  const list = useMemo(() => filterRanking(all, f), [all, f]);
  const set = (patch: Partial<RankFilters>) => {
    setF((cur) => ({ ...cur, ...patch }));
    setShown(PAGE);
  };
  // A year view lists every card of the year by default; all-time keeps each player's best card.
  const setYear = (year: YearKey) => set({ year, onePerPlayer: year === 'all' });
  const filtersOn = !!(f.tier || f.region || f.role || f.aura || f.query);
  const yearKeys: YearKey[] = ['all', ...years];

  const onYearKey = (e: ReactKeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = yearKeys.indexOf(f.year);
    const next = yearKeys[(i + (e.key === 'ArrowRight' ? 1 : yearKeys.length - 1)) % yearKeys.length]!;
    setYear(next);
    document.getElementById(`rank-year-${next}`)?.focus();
  };

  return (
    <div className="screen ranking-screen">
      <header className="screen-head">
        <h1>Ranking</h1>
        <p className="context">Os maiores OVRs do VCT · {all.length.toLocaleString('pt-BR')} cards</p>
        <p className="small muted measure">
          Cada card é um jogador num evento (Masters, LOCK//IN, Champions ou etapa de liga regional). OVR pela fórmula do jogo sobre os
          stats reais do evento (VLR.gg); Rating, ACS e KAST são os números reais.
        </p>
      </header>

      <div className="rank-years" role="tablist" aria-label="Período" onKeyDown={onYearKey}>
        {yearKeys.map((y) => (
          <button
            key={y}
            id={`rank-year-${y}`}
            type="button"
            role="tab"
            className="tab"
            aria-selected={f.year === y}
            aria-controls="rank-panel"
            tabIndex={f.year === y ? 0 : -1}
            onClick={() => setYear(y)}
          >
            {y === 'all' ? 'Todos os tempos' : y}
          </button>
        ))}
      </div>

      <section id="rank-panel" role="tabpanel" aria-labelledby={`rank-year-${f.year}`} className="rank-panel">
        <div className="board-filters rank-filters" role="group" aria-label="Filtros do ranking">
          <label className="board-search">
            <span className="sr-only">Buscar jogador ou time</span>
            <Icon name="search" />
            <input type="search" name="rank-search" value={f.query} placeholder="Buscar jogador ou time…" autoComplete="off" spellCheck={false} onChange={(e) => set({ query: e.target.value })} />
          </label>
          <label className="board-select">
            <span>Torneios</span>
            <select value={f.tier} onChange={(e) => set({ tier: e.target.value as Tier | '' })}>
              <option value="">Ambos</option>
              <option value="international">Internacionais</option>
              <option value="regional">Ligas regionais</option>
            </select>
          </label>
          <label className="board-select">
            <span>Região</span>
            <select value={f.region} onChange={(e) => set({ region: e.target.value as Region | '' })}>
              <option value="">Todas</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {REGION_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="board-select">
            <span>Função</span>
            <select value={f.role} onChange={(e) => set({ role: e.target.value as Role | '' })}>
              <option value="">Todas</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="board-select">
            <span>Aura</span>
            <select value={f.aura} onChange={(e) => set({ aura: e.target.value as RankFilters['aura'] })}>
              <option value="">Todas</option>
              {AURAS.map((a) => (
                <option key={a} value={a}>
                  {AURA_LABELS[a]}
                </option>
              ))}
            </select>
          </label>
          <label className="rank-toggle">
            <input type="checkbox" checked={f.onePerPlayer} onChange={(e) => set({ onePerPlayer: e.target.checked })} />
            <span>1 card por jogador</span>
          </label>
        </div>

        <p className="small muted board-count" aria-live="polite">
          {list.length.toLocaleString('pt-BR')} {f.onePerPlayer ? (list.length === 1 ? 'jogador' : 'jogadores') : list.length === 1 ? 'card' : 'cards'}
          {f.year === 'all' ? '' : ` em ${f.year}`}
          {filtersOn && (
            <>
              {' · '}
              <button type="button" className="link-btn" onClick={() => set({ tier: '', region: '', role: '', aura: '', query: '' })}>
                limpar filtros
              </button>
            </>
          )}
        </p>

        {list.length === 0 ? (
          <p className="empty-state">Nenhum card com esses filtros.</p>
        ) : (
          <ol className="rank-list">
            {list.slice(0, shown).map((e, i) => (
              <li key={e.card.id}>
                <RankRow e={e} rank={i + 1} onOpen={() => setSelected(e)} />
              </li>
            ))}
          </ol>
        )}
        {shown < list.length && (
          <button type="button" className="secondary wide rank-more" onClick={() => setShown((n) => n + PAGE)}>
            Mostrar mais <span className="muted">· {Math.min(shown, list.length)} de {list.length.toLocaleString('pt-BR')}</span>
          </button>
        )}
      </section>

      <button type="button" className="secondary wide" onClick={onBack}>
        <Icon name="back" /> Voltar ao início
      </button>

      <Detail entry={selected} onSelect={setSelected} onClose={() => setSelected(null)} />
    </div>
  );
}

/** Chips of a card: IGL, natural flex, aura (text + icon, not color alone). */
function Chips({ e }: { e: RankEntry }) {
  const c = e.card;
  return (
    <>
      {c.isIGL && (
        <span className="badge igl" title="IGL do time neste evento">
          <Icon name="mic" /> IGL
        </span>
      )}
      {isNaturalFlex(c) && (
        <span className="badge flex-nato" title={`Flex nato: jogou ${flexRolesText(c)}`}>
          <Icon name="swap" /> Flex
        </span>
      )}
      {c.aura && c.aura !== 'rising' && (
        <span className={`badge aura aura-${c.aura}`} title={auraTitle(c)}>
          {AURA_LABELS[c.aura]}
        </span>
      )}
    </>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank > 3) return <span className="rank-pos">{rank}</span>;
  return (
    <span className={`rank-pos podium-${rank}`} aria-label={`${rank}º lugar`}>
      <Icon name={rank === 1 ? 'trophy' : 'medal'} />
      <span aria-hidden="true">{rank}º</span>
    </span>
  );
}

function RankRow({ e, rank, onOpen }: { e: RankEntry; rank: number; onOpen: () => void }) {
  const c = e.card;
  const s = c.stats;
  return (
    <button type="button" className={`rank-row${rank <= 3 ? ` is-podium podium-${rank}` : ''}`} onClick={onOpen} aria-haspopup="dialog">
      <RankBadge rank={rank} />
      <PlayerPhoto playerId={c.playerId} eventId={c.eventId} handle={c.handle} country={c.country} size={44} />
      <span className="rank-name">
        <span className="rank-handle">
          <strong>{c.handle}</strong>
          <Chips e={e} />
        </span>
        <span className="rank-team small muted">
          <TeamLogo teamId={c.teamId} eventId={c.eventId} name={e.entry.teamName} size={16} />
          <span className="rank-team-text">
            {e.entry.teamName} · {e.entry.eventName}
          </span>
        </span>
      </span>
      <span className={`rank-role role-${c.role}`} title={ROLE_LABELS[c.role]}>
        <Icon name={`role-${c.role}`} />
        <abbr title={ROLE_LABELS[c.role]}>{ROLE_SHORT[c.role]}</abbr>
      </span>
      <span className="rank-ovr" aria-label={`OVR ${c.ovr}`}>
        {c.ovr}
      </span>
      <span className="rank-stats small">
        <span>
          <span className="muted">R</span> {formatStat(s?.rating, 2)}
        </span>
        <span>
          <span className="muted">ACS</span> {formatStat(s?.acs)}
        </span>
        <span>
          <span className="muted">KAST</span> {s?.kast == null ? '—' : `${s.kast}%`}
        </span>
      </span>
    </button>
  );
}

/** The card in full, every other card of the player (OVR timeline) and his career facts, in a modal drawer. */
function Detail({ entry, onSelect, onClose }: { entry: RankEntry | null; onSelect: (e: RankEntry) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (entry && !d.open) d.showModal();
    if (!entry && d.open) d.close();
  }, [entry]);
  const timeline = useMemo(() => (entry ? playerTimeline(entry.card.playerId) : []), [entry]);
  const career = timeline.length ? careerSummary(timeline) : null;
  const c = entry?.card;

  return (
    <dialog
      ref={ref}
      className="rank-drawer"
      aria-labelledby="rank-drawer-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {entry && c && career && (
        <div className="rank-drawer-body">
          <header className="rank-drawer-head">
            <h2 id="rank-drawer-title">
              {c.handle} {c.country && <CountryChip code={c.country} />}
            </h2>
            <button type="button" className="ghost rank-close" onClick={onClose} aria-label="Fechar">
              <Icon name="close" />
            </button>
          </header>
          <PlayerCard card={c} />
          {c.aura && <p className="small muted">{auraFacts(c)}</p>}

          <section aria-labelledby="rank-career-title">
            <h3 id="rank-career-title">Carreira nos dados</h3>
            <dl className="rank-career">
              <div>
                <dt>Cards</dt>
                <dd>{career.cards}</dd>
              </div>
              <div>
                <dt>Internacionais</dt>
                <dd>{career.internationals}</dd>
              </div>
              <div>
                <dt>Títulos internacionais</dt>
                <dd>{career.titles}</dd>
              </div>
              <div>
                <dt>Etapas de liga vencidas</dt>
                <dd>{career.regionalTitles}</dd>
              </div>
              <div className="wide">
                <dt>Melhor card</dt>
                <dd>
                  {career.best.card.ovr} <span className="muted">· {career.best.entry.eventName}</span>
                </dd>
              </div>
              <div className="wide">
                <dt>Times</dt>
                <dd>{career.teams.join(', ')}</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="rank-timeline-title">
            <h3 id="rank-timeline-title">OVR por evento</h3>
            <Timeline timeline={timeline} current={entry} />
            <ol className="rank-cards">
              {timeline.map((t) => (
                <li key={t.card.id}>
                  <button type="button" className={`rank-card-btn${t.card.id === c.id ? ' is-on' : ''}`} aria-current={t.card.id === c.id ? 'true' : undefined} onClick={() => onSelect(t)}>
                    <span className="rank-card-ovr">{t.card.ovr}</span>
                    <span className="rank-card-main">
                      <strong>{t.entry.eventName}</strong>
                      <span className="small muted">
                        {t.entry.teamName} · {TIER_LABELS[t.tier]}
                        {t.entry.placement ? ` · ${placementLabel(t.entry.placement)}` : ''}
                      </span>
                    </span>
                    <span className="small rank-card-r">R {formatStat(t.card.stats?.rating, 2)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </dialog>
  );
}

/** A small SVG line of OVR by event (theme tokens; the list below carries the same data for AT). */
function Timeline({ timeline, current }: { timeline: readonly RankEntry[]; current: RankEntry }) {
  const W = 320;
  const H = 120;
  const pad = { l: 28, r: 10, t: 14, b: 22 };
  const ovrs = timeline.map((t) => t.card.ovr);
  const lo = Math.min(...ovrs) - 2;
  const hi = Math.max(...ovrs) + 2;
  const x = (i: number) => (timeline.length === 1 ? (W + pad.l - pad.r) / 2 : pad.l + (i * (W - pad.l - pad.r)) / (timeline.length - 1));
  const y = (v: number) => pad.t + ((hi - v) * (H - pad.t - pad.b)) / Math.max(1, hi - lo);
  const points = timeline.map((t, i) => `${x(i)},${y(t.card.ovr)}`).join(' ');
  const first = timeline[0]!;
  const last = timeline[timeline.length - 1]!;
  return (
    <svg
      className="rank-timeline"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`OVR de ${current.card.handle} em ${timeline.length} eventos, de ${first.card.ovr} (${first.year}) a ${last.card.ovr} (${last.year}); máximo ${Math.max(...ovrs)}`}
    >
      {[Math.round(hi - 2), Math.round(lo + 2)].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="tl-grid" />
          <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="tl-label">
            {v}
          </text>
        </g>
      ))}
      {timeline.length > 1 && <polyline points={points} className="tl-line" />}
      {timeline.map((t, i) => {
        const on = t.card.id === current.card.id;
        return <circle key={t.card.id} cx={x(i)} cy={y(t.card.ovr)} r={on ? 6 : 3.5} className={`tl-dot${on ? ' is-on' : ''}${t.tier === 'international' ? ' intl' : ''}`} />;
      })}
      <text x={x(0)} y={H - 6} textAnchor={timeline.length === 1 ? 'middle' : 'start'} className="tl-label">
        {first.year}
      </text>
      {timeline.length > 1 && (
        <text x={x(timeline.length - 1)} y={H - 6} textAnchor="end" className="tl-label">
          {last.year}
        </text>
      )}
      <text x={x(timeline.indexOf(current))} y={y(current.card.ovr) - 10} textAnchor="middle" className="tl-label tl-current">
        {formatDecimal(current.card.ovr, 0)}
      </text>
    </svg>
  );
}
