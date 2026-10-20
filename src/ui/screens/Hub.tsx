import { useState, type KeyboardEvent } from 'react';
import { formatDecimal } from '../../game/explain';
import {
  USER_ID,
  bracket,
  entrantTeam,
  groupViews,
  teamInfo,
  userMatches,
  userOpponent,
  userPendingMatch,
  userRecord,
  type RunState,
} from '../../game/run';
import { Bracket } from '../components/Bracket';
import { GroupStage } from '../components/GroupStage';
import { Icon, YouTag } from '../components/Icon';
import { Results } from '../components/Results';

interface Props {
  run: RunState;
  onVeto: () => void;
  onViewSeries: (matchId: string) => void;
  onStats: () => void;
}

export function Hub({ run, onVeto, onViewSeries, onStats }: Props) {
  const t = run.tournament!;
  const inPlayoffs = t.phase !== 'groups';
  const [tab, setTab] = useState<TabKey>(inPlayoffs ? 'playoffs' : 'groups');
  const pending = userPendingMatch(run);
  const record = userRecord(run);
  const me = teamInfo(run, USER_ID);
  const nameOf = (id: string) => t.entrants.find((e) => e.id === id)?.name ?? id;
  const played = userMatches(run).filter((m) => m.result);
  const team = (id: string) => entrantTeam(run, id);

  return (
    <div className="screen hub">
      <header className="screen-head">
        <h1>{me.name}</h1>
        <p className="context" data-stage={inPlayoffs ? 'playoffs' : 'groups'}>
          Champions · {inPlayoffs ? 'Playoffs' : 'Fase de grupos'}
        </p>
        <dl className="hub-stats">
          <div>
            <dt>Seed</dt>
            <dd>{me.seed}</dd>
          </div>
          <div>
            <dt>Força</dt>
            <dd>{formatDecimal(me.strength)}</dd>
          </div>
          {record.groups.group && (
            <div>
              <dt>Grupo</dt>
              <dd>{record.groups.group}</dd>
            </div>
          )}
          <div>
            <dt>Grupos</dt>
            <dd>
              {record.groups.wins}-{record.groups.losses}
            </dd>
          </div>
          {inPlayoffs && (
            <div>
              <dt>Playoffs</dt>
              <dd>
                {record.playoffs.wins}-{record.playoffs.losses}
              </dd>
            </div>
          )}
        </dl>
        <div className="hub-actions">
          <button type="button" className="secondary" onClick={onStats} disabled={played.length === 0} aria-describedby={played.length === 0 ? 'stats-hint' : undefined}>
            <Icon name="stats" /> Estatísticas
          </button>
          {played.length === 0 && (
            <span id="stats-hint" className="small muted">
              Disponível depois da primeira série.
            </span>
          )}
        </div>
      </header>

      <div className="hub-grid">
        {pending && <NextMatch run={run} matchId={pending.match.id} onVeto={onVeto} />}

        <section className="hub-table" aria-label="Tabela do torneio">
          <Tabs tab={tab} onChange={setTab} />
          <div role="tabpanel" id={`hub-panel-${tab}`} aria-labelledby={`hub-tab-${tab}`}>
            {tab === 'groups' ? (
              <GroupStage views={groupViews(run)} team={team} onView={onViewSeries} />
            ) : (
              <>
                {!inPlayoffs && (
                  <p className="small muted bk-note">
                    Os 2 primeiros de cada grupo vão para a chave de dupla eliminação: cada 1º enfrenta o 2º de outro
                    grupo nas quartas. Os times aparecem aqui quando os grupos terminarem.
                  </p>
                )}
                <Bracket cells={bracket(run)} team={team} onView={onViewSeries} />
              </>
            )}
          </div>
        </section>

        <section className="hub-results">
          <h2>Suas partidas</h2>
          {played.length > 0 ? (
            <Results matches={played} nameOf={nameOf} onView={onViewSeries} />
          ) : (
            <p className="empty-state">Nenhuma partida jogada ainda. Os placares completos aparecem aqui.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function NextMatch({ run, matchId, onVeto }: { run: RunState; matchId: string; onVeto: () => void }) {
  const match = run.tournament!.matches.find((m) => m.id === matchId)!;
  const opp = teamInfo(run, userOpponent(match));
  const me = teamInfo(run, USER_ID);
  const vetoStarted = run.veto?.matchId === matchId;
  return (
    <section className="panel next-match" aria-label="Próxima partida">
      <h2 className="next-title">Próxima partida</h2>
      <p className="context">
        {match.label} · MD{match.bestOf}
      </p>
      <div className="versus">
        <span className="vs-team mine">
          <strong>{me.name}</strong>
          <YouTag />
          <span className="small muted">
            seed {me.seed} · força {formatDecimal(me.strength)}
          </span>
        </span>
        <span className="vs">vs</span>
        <span className="vs-team">
          <strong>{opp.name}</strong>
          <span className="small muted">
            {opp.subtitle} · seed {opp.seed} · força {formatDecimal(opp.strength)}
          </span>
        </span>
      </div>
      <button type="button" className="primary wide" onClick={onVeto}>
        {vetoStarted ? 'Continuar veto' : 'Ir para o veto'}
      </button>
    </section>
  );
}

type TabKey = 'groups' | 'playoffs';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'groups', label: 'Grupos' },
  { key: 'playoffs', label: 'Playoffs' },
];

/** Tab list with roving focus: arrow keys move between tabs. */
function Tabs({ tab, onChange }: { tab: TabKey; onChange: (t: TabKey) => void }) {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = TABS[(TABS.findIndex((t) => t.key === tab) + 1) % TABS.length]!.key;
    onChange(next);
    document.getElementById(`hub-tab-${next}`)?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label="Tabela" onKeyDown={onKeyDown}>
      {TABS.map(({ key, label }) => (
        <button
          key={key}
          id={`hub-tab-${key}`}
          type="button"
          role="tab"
          aria-selected={tab === key}
          aria-controls={`hub-panel-${key}`}
          tabIndex={tab === key ? 0 : -1}
          className="tab"
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
