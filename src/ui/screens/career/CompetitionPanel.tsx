import { useState, type KeyboardEvent } from 'react';
import { seedOfSource } from '../../../engine/bracket';
import {
  CAREER_STAGES,
  CAREER_STAGE_LABELS,
  careerChampionsBracket,
  careerChampionsGroupViews,
  careerEntrantTeam,
  careerLeaguePlayoffCells,
  careerLeagueViews,
  careerMastersCells,
  careerStageOutcome,
  careerUserResults,
  leagueTeams,
  nameOf,
  seriesKey,
  type CareerStage,
  type CareerState,
} from '../../../game/career';
import { formatDecimal } from '../../../game/explain';
import { REGION_LABELS } from '../../../game/season';
import { Bracket, sourceLabel } from '../../components/Bracket';
import { GroupStage } from '../../components/GroupStage';
import { Icon, YouTag } from '../../components/Icon';
import { LeagueBracket } from '../../components/LeagueBracket';
import { LeagueTable } from '../../components/LeagueTable';
import { Results } from '../../components/Results';
import { TeamLogo } from '../../components/TeamLogo';

interface Props {
  c: CareerState;
  onViewSeries: (key: string) => void;
}

/** Competição: the league's teams before it starts, then the tables and brackets of each stage and your matches. */
export function CompetitionPanel({ c, onViewSeries }: Props) {
  const enabled = CAREER_STAGES.filter((s) => careerStageOutcome(c, s).status !== 'pending');
  const current: CareerStage = c.phase === 'masters' || c.phase === 'champions' ? c.phase : enabled.includes('champions') ? 'champions' : enabled.includes('masters') ? 'masters' : 'league';
  const [picked, setTab] = useState<CareerStage | null>(null);
  const tab = picked && enabled.includes(picked) ? picked : current;
  const team = (id: string) => careerEntrantTeam(c, id);
  const results = careerUserResults(c);
  const view = (stage: CareerStage) => (id: string) => onViewSeries(seriesKey(stage, id));

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || enabled.length === 0) return;
    e.preventDefault();
    const i = enabled.indexOf(tab);
    const next = enabled[(i + (e.key === 'ArrowRight' ? 1 : enabled.length - 1)) % enabled.length]!;
    setTab(next);
    document.getElementById(`cr-comp-tab-${next}`)?.focus();
  };

  return (
    <div className="cr-panel">
      {!c.league ? (
        <LeagueField c={c} />
      ) : (
        <>
          <div className="tabs" role="tablist" aria-label="Etapas" onKeyDown={onKeyDown}>
            {CAREER_STAGES.map((key) => {
              const o = careerStageOutcome(c, key);
              const on = enabled.includes(key);
              return (
                <button
                  key={key}
                  id={`cr-comp-tab-${key}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  aria-controls={`cr-comp-panel-${key}`}
                  tabIndex={tab === key ? 0 : -1}
                  className="tab"
                  disabled={!on}
                  onClick={() => setTab(key)}
                >
                  {CAREER_STAGE_LABELS[key]}
                  {!on && <Icon name="lock" label="ainda não chegou" />}
                  {o.status === 'out' && <span className="small muted"> (sem você)</span>}
                </button>
              );
            })}
          </div>
          <div role="tabpanel" id={`cr-comp-panel-${tab}`} aria-labelledby={`cr-comp-tab-${tab}`}>
            {tab === 'league' && (
              <div className="league-stage">
                <p className="small muted bk-note">
                  Turno único em MD3 (5 séries por time), 2 grupos de 6. Os 3 primeiros de cada grupo vão aos playoffs; os 3 primeiros
                  dos playoffs vão ao Masters e os 4 primeiros ao Champions.
                </p>
                <div className="league-tables">
                  {careerLeagueViews(c).map((v) => (
                    <section key={v.group} className={`group-card is-selected${v.hasUser ? ' has-user' : ''}`} aria-labelledby={`cr-league-${v.group}`}>
                      <h3 id={`cr-league-${v.group}`} className="group-title">
                        Grupo {v.group}
                        {v.hasUser && <YouTag />}
                      </h3>
                      <LeagueTable group={v.group} rows={v.rows} team={team} />
                    </section>
                  ))}
                </div>
                <h3 className="hub-subtitle">Playoffs</h3>
                <LeagueBracket cells={careerLeaguePlayoffCells(c)} team={team} onView={view('league')} />
              </div>
            )}
            {tab === 'masters' && (
              <>
                <p className="small muted bk-note">8 times: os 3 primeiros da liga e 5 das outras regiões. Dupla eliminação, MD3 e grande final MD5.</p>
                <Bracket
                  cells={careerMastersCells(c)}
                  team={team}
                  onView={view('masters')}
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
                <GroupStage views={careerChampionsGroupViews(c)} team={team} onView={view('champions')} />
                <h3 className="hub-subtitle">Playoffs</h3>
                {c.champions?.phase === 'groups' && <p className="small muted bk-note">Os 2 primeiros de cada grupo vão para a chave de dupla eliminação.</p>}
                <Bracket cells={careerChampionsBracket(c)} team={team} onView={view('champions')} />
              </>
            )}
          </div>
        </>
      )}

      <section className="hub-results" aria-labelledby="cr-results-title">
        <h3 id="cr-results-title" className="hub-subtitle">
          Suas partidas na temporada
        </h3>
        {results.length > 0 ? (
          <Results
            matches={results.map((r) => ({ id: r.key, label: `${CAREER_STAGE_LABELS[r.stage]} · ${r.match.label}`, a: r.match.a, b: r.match.b, result: r.match.result }))}
            nameOf={(id) => nameOf(c, id)}
            onView={onViewSeries}
          />
        ) : (
          <p className="empty-state">Nenhuma partida oficial ainda. Os placares completos aparecem aqui.</p>
        )}
      </section>
    </div>
  );
}

/** Before the league: the 11 AI teams as they are now (strength with the league's form and the difficulty's bonus). */
function LeagueField({ c }: { c: CareerState }) {
  const teams = leagueTeams(c);
  return (
    <section aria-labelledby="cr-field-title">
      <h3 id="cr-field-title" className="hub-subtitle">
        Liga {REGION_LABELS[c.org.region]}: seus 11 adversários
      </h3>
      <p className="small muted">Força com a fase do torneio da liga e o bônus da IA da dificuldade. A tabela e a chave aparecem quando a liga começar.</p>
      <ul className="cr-list cr-field">
        {teams.map((t) => (
          <li key={t.id} className="cr-field-team">
            <TeamLogo teamId={t.teamId} eventId={t.eventId} name={t.name} size={32} />
            <span className="cr-who">
              <strong>{t.name}</strong>
              <span className="small muted">
                {t.players.map((p) => `${p.handle}${p.isIGL ? ' (IGL)' : ''} ${p.ovr}`).join(' · ')}
              </span>
            </span>
            <span className="cr-nums">
              <span className="cr-ovr">{formatDecimal(t.strength)}</span>
              <span className="small muted">força</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
