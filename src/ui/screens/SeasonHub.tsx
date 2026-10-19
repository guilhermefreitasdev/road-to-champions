import { useState, type KeyboardEvent } from 'react';
import { seedOfSource } from '../../engine/bracket';
import { formatDecimal } from '../../game/explain';
import { sourceLabel } from '../components/Bracket';
import {
  COMP_STAGES,
  FIELD_MODE_LABELS,
  REGION_LABELS,
  STAGE_LABELS,
  USER_ID,
  championsBracket,
  championsGroupViews,
  leaguePlayoffCells,
  leagueViews,
  mastersCells,
  seasonEntrantTeam,
  seasonTeamInfo,
  seriesKey,
  stageOutcome,
  userOpponent,
  userPendingMatch,
  userSeasonResults,
  type CompStage,
  type SeasonState,
} from '../../game/season';
import { Bracket } from '../components/Bracket';
import { GroupStage } from '../components/GroupStage';
import { YouTag } from '../components/Icon';
import { LeagueBracket } from '../components/LeagueBracket';
import { LeagueTable } from '../components/LeagueTable';
import { Results } from '../components/Results';
import { TrialsPath } from '../components/TrialsPath';

interface Props {
  season: SeasonState;
  onVeto: () => void;
  onViewSeries: (key: string) => void;
}

const STAGE_CONTEXT: Record<CompStage, (s: SeasonState) => string> = {
  league: (s) => `Liga ${REGION_LABELS[s.region!]} · ${s.league?.phase === 'playoffs' ? 'Playoffs' : 'Fase de grupos'}`,
  masters: () => 'Masters · Dupla eliminação',
  champions: (s) => `Champions · ${s.champions?.phase === 'groups' ? 'Fase de grupos' : 'Playoffs'}`,
};

export function SeasonHub({ season, onVeto, onViewSeries }: Props) {
  const current = season.stage as CompStage;
  const [tab, setTab] = useState<CompStage>(current);
  const pending = userPendingMatch(season);
  const me = seasonTeamInfo(season, USER_ID);
  const outcome = stageOutcome(season, current);
  const team = (id: string) => seasonEntrantTeam(season, id);
  const results = userSeasonResults(season);
  const nameOf = (id: string) => (id === USER_ID ? me.name : seasonTeamInfo(season, id).name);

  return (
    <div className="screen hub season-hub">
      <header className="screen-head">
        <h1>{me.name}</h1>
        <p className="context">Complete Trials · {STAGE_CONTEXT[current](season)}</p>
        <TrialsPath season={season} compact />
        <dl className="hub-stats">
          <div>
            <dt>Servidor</dt>
            <dd>{REGION_LABELS[season.region!]}</dd>
          </div>
          <div>
            <dt>Seed</dt>
            <dd>{me.seed}</dd>
          </div>
          <div>
            <dt>Força</dt>
            <dd>{formatDecimal(me.strength)}</dd>
          </div>
          <div>
            <dt>{STAGE_LABELS[current]}</dt>
            <dd>
              {outcome.wins}-{outcome.losses}
            </dd>
          </div>
          <div>
            <dt>Campo</dt>
            <dd>{FIELD_MODE_LABELS[season.field]}</dd>
          </div>
        </dl>
      </header>

      <div className="hub-grid">
        {pending && <NextMatch season={season} onVeto={onVeto} />}

        <section className="hub-table" aria-label="Tabelas da temporada">
          <Tabs season={season} tab={tab} onChange={setTab} />
          <div role="tabpanel" id={`hub-panel-${tab}`} aria-labelledby={`hub-tab-${tab}`}>
            {tab === 'league' && <LeagueTab season={season} team={team} onView={(id) => onViewSeries(seriesKey('league', id))} />}
            {tab === 'masters' && (
              <>
                <p className="small muted bk-note">
                  8 times: os 3 primeiros da sua liga e 5 das outras regiões. Dupla eliminação, MD3 e grande final MD5.
                </p>
                <Bracket
                  cells={mastersCells(season)}
                  team={team}
                  onView={(id) => onViewSeries(seriesKey('masters', id))}
                  label={(src) => {
                    const seed = seedOfSource(src);
                    return seed === undefined ? sourceLabel(src) : `Seed ${seed}`;
                  }}
                />
              </>
            )}
            {tab === 'champions' && (
              <>
                <h3 className="hub-subtitle">Grupos</h3>
                <GroupStage views={championsGroupViews(season)} team={team} onView={(id) => onViewSeries(seriesKey('champions', id))} />
                <h3 className="hub-subtitle">Playoffs</h3>
                {season.champions?.phase === 'groups' && (
                  <p className="small muted bk-note">
                    Os 2 primeiros de cada grupo vão para a chave de dupla eliminação. Os times aparecem aqui quando os grupos
                    terminarem.
                  </p>
                )}
                <Bracket cells={championsBracket(season)} team={team} onView={(id) => onViewSeries(seriesKey('champions', id))} />
              </>
            )}
          </div>
        </section>

        <section className="hub-results">
          <h2>Suas partidas</h2>
          {results.length > 0 ? (
            <Results
              matches={results.map((r) => ({ id: r.key, label: `${STAGE_LABELS[r.stage]} · ${r.match.label}`, a: r.match.a, b: r.match.b, result: r.match.result }))}
              nameOf={nameOf}
              onView={onViewSeries}
            />
          ) : (
            <p className="empty-state">Nenhuma partida jogada ainda. Os placares completos aparecem aqui.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function LeagueTab({ season, team, onView }: { season: SeasonState; team: Parameters<typeof LeagueTable>[0]['team']; onView: (id: string) => void }) {
  const views = leagueViews(season);
  return (
    <div className="league-stage">
      {season.field === 'prime' && (
        <p className="small muted bk-note">Modo Prime: cada time joga com o elenco mais forte que já teve; o evento aparece ao lado do nome.</p>
      )}
      <p className="small muted bk-note">
        Turno único em MD3 (5 séries por time). Desempate: saldo de mapas, depois de rounds. Os 3 primeiros de cada grupo vão
        aos playoffs; os 3 primeiros dos playoffs vão ao Masters.
      </p>
      <div className="league-tables">
        {views.map((v) => (
          <section key={v.group} className={`group-card is-selected${v.hasUser ? ' has-user' : ''}`} aria-labelledby={`league-${v.group}-title`}>
            <h3 id={`league-${v.group}-title`} className="group-title">
              Grupo {v.group}
              {v.hasUser && <YouTag />}
            </h3>
            <LeagueTable group={v.group} rows={v.rows} team={team} />
          </section>
        ))}
      </div>
      <h3 className="hub-subtitle">Playoffs</h3>
      <LeagueBracket cells={leaguePlayoffCells(season)} team={team} onView={onView} />
    </div>
  );
}

function NextMatch({ season, onVeto }: { season: SeasonState; onVeto: () => void }) {
  const pending = userPendingMatch(season)!;
  const { match, stage } = pending;
  const opp = seasonTeamInfo(season, userOpponent(match));
  const me = seasonTeamInfo(season, USER_ID);
  const vetoStarted = season.veto?.stage === stage && season.veto.matchId === match.id;
  return (
    <section className="panel next-match" aria-label="Próxima partida">
      <h2 className="next-title">Próxima partida</h2>
      <p className="context">
        {STAGE_LABELS[stage]} · {match.label} · MD{match.bestOf}
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
            {opp.subtitle} · {REGION_LABELS[opp.region]} · seed {opp.seed} · força {formatDecimal(opp.strength)}
          </span>
        </span>
      </div>
      <button type="button" className="primary wide" onClick={onVeto}>
        {vetoStarted ? 'Continuar veto' : 'Ir para o veto'}
      </button>
    </section>
  );
}

/** Liga / Masters / Champions tabs; a stage not reached yet is disabled. Arrow keys move between tabs. */
function Tabs({ season, tab, onChange }: { season: SeasonState; tab: CompStage; onChange: (t: CompStage) => void }) {
  const enabled = COMP_STAGES.filter((s) => stageOutcome(season, s).status !== 'pending');
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = enabled.indexOf(tab);
    const next = enabled[(i + (e.key === 'ArrowRight' ? 1 : enabled.length - 1)) % enabled.length]!;
    onChange(next);
    document.getElementById(`hub-tab-${next}`)?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label="Etapas" onKeyDown={onKeyDown}>
      {COMP_STAGES.map((key) => (
        <button
          key={key}
          id={`hub-tab-${key}`}
          type="button"
          role="tab"
          aria-selected={tab === key}
          aria-controls={`hub-panel-${key}`}
          tabIndex={tab === key ? 0 : -1}
          className="tab"
          disabled={!enabled.includes(key)}
          onClick={() => onChange(key)}
        >
          {STAGE_LABELS[key]}
        </button>
      ))}
    </div>
  );
}
