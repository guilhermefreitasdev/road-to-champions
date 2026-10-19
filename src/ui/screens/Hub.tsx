import { useState } from 'react';
import { formatDecimal } from '../../game/explain';
import {
  USER_ID,
  bracket,
  standings,
  teamInfo,
  userMatches,
  userOpponent,
  userPendingMatch,
  userRecord,
  type RunState,
} from '../../game/run';
import { Bracket } from '../components/Bracket';
import { Results } from '../components/Results';
import { Standings } from '../components/Standings';

interface Props {
  run: RunState;
  onVeto: () => void;
  onViewSeries: (matchId: string) => void;
}

export function Hub({ run, onVeto, onViewSeries }: Props) {
  const t = run.tournament!;
  const inPlayoffs = t.phase !== 'swiss';
  const [tab, setTab] = useState<'swiss' | 'playoffs'>(inPlayoffs ? 'playoffs' : 'swiss');
  const pending = userPendingMatch(run);
  const record = userRecord(run);
  const me = teamInfo(run, USER_ID);
  const nameOf = (id: string) => t.entrants.find((e) => e.id === id)?.name ?? id;
  const played = userMatches(run).filter((m) => m.result);

  return (
    <div className="screen hub">
      <header className="screen-head">
        <p className="eyebrow">Champions · {inPlayoffs ? 'Playoffs' : 'Fase suíça'}</p>
        <h1>{me.name}</h1>
        <p className="muted">
          Seed {me.seed} · força {formatDecimal(me.strength)} · Suíça {record.swiss.wins}-{record.swiss.losses}
          {inPlayoffs && ` · Playoffs ${record.playoffs.wins}-${record.playoffs.losses}`}
        </p>
      </header>

      {pending && <NextMatch run={run} matchId={pending.match.id} onVeto={onVeto} />}

      <div className="tabs" role="tablist" aria-label="Tabela">
        <button type="button" role="tab" aria-selected={tab === 'swiss'} className="tab" onClick={() => setTab('swiss')}>
          Suíça
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'playoffs'}
          className="tab"
          onClick={() => setTab('playoffs')}
        >
          Playoffs
        </button>
      </div>
      <div role="tabpanel">
        {tab === 'swiss' ? (
          <Standings rows={standings(run)} />
        ) : inPlayoffs ? (
          <Bracket cells={bracket(run)} nameOf={nameOf} />
        ) : (
          <p className="muted">Os 8 classificados da Suíça (3 vitórias) vão para a chave de dupla eliminação.</p>
        )}
      </div>

      {played.length > 0 && (
        <section>
          <h2>Suas partidas</h2>
          <Results matches={played} nameOf={nameOf} onView={onViewSeries} />
        </section>
      )}
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
      <p className="eyebrow">
        Próxima partida · {match.label} · MD{match.bestOf}
      </p>
      <div className="versus">
        <span className="vs-team">
          <strong>{me.name}</strong>
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
