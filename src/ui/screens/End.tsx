import { formatDecimal } from '../../game/explain';
import { FINISH_STAGES, MODE_LABELS, runSummary, shareText, type FinishStage, type RunState } from '../../game/run';
import { Icon } from '../components/Icon';
import { Results } from '../components/Results';
import { SharePanel } from '../components/SharePanel';

interface Props {
  run: RunState;
  onNewRun: () => void;
  onViewSeries: (matchId: string) => void;
}

const STAGE_LABELS: Record<FinishStage, string> = {
  groups: 'Grupos',
  playoffs: 'Playoffs',
  top4: 'Top 4',
  final: 'Final',
  champion: 'Título',
};

export function End({ run, onNewRun, onViewSeries }: Props) {
  const s = runSummary(run);
  const text = shareText(run);
  const nameOf = (id: string) => run.tournament!.entrants.find((e) => e.id === id)?.name ?? id;
  const champion = !!s.finish?.champion;
  const title = champion ? 'Campeão!' : s.finish?.place === '2º' ? 'Vice-campeão' : 'Eliminado';

  return (
    <div className={`screen end${champion ? ' is-champion' : ''}`}>
      <header className={`end-hero${champion ? ' champion' : ''}`}>
        {champion && (
          <span className="trophy" aria-hidden="true">
            <Icon name="trophy" />
          </span>
        )}
        <h1>{title}</h1>
        <p className="end-place">
          <strong>{s.finish?.place ?? '—'}</strong>
          {s.finish && !champion && <span> · {s.finish.label}</span>}
        </p>
        <p className="end-team">
          {champion ? `${s.teamName} venceu o Champions` : s.teamName}
          <span className="muted"> · {MODE_LABELS[s.mode]}</span>
        </p>
        {s.finish && <StagePath reached={s.finish.stage} />}
      </header>

      <SharePanel text={text} />

      <div className="end-grid">
        <section className="panel">
          <h2>Resumo</h2>
          <dl className="summary">
            <div>
              <dt>Força do time</dt>
              <dd>{formatDecimal(s.strength)}</dd>
            </div>
            <div>
              <dt>Grupos</dt>
              <dd>
                {s.record.groups.wins}-{s.record.groups.losses}
                {s.record.groups.place && s.record.groups.group && (
                  <span className="muted">
                    {' '}
                    · {s.record.groups.place}º no Grupo {s.record.groups.group}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt>Playoffs</dt>
              <dd>
                {s.record.playoffs.wins + s.record.playoffs.losses > 0
                  ? `${s.record.playoffs.wins}-${s.record.playoffs.losses}`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>Mapas</dt>
              <dd>
                {s.record.mapsWon}-{s.record.mapsLost}
              </dd>
            </div>
            {s.mvp && (
              <div className="summary-wide">
                <dt>MVP</dt>
                <dd>
                  {s.mvp.handle}{' '}
                  <span className="muted">
                    · ACS {s.mvp.acs} · K/D/A {s.mvp.kills}/{s.mvp.deaths}/{s.mvp.assists}
                  </span>
                </dd>
              </div>
            )}
            {!champion && s.championName && (
              <div className="summary-wide">
                <dt>Campeão</dt>
                <dd>{s.championName}</dd>
              </div>
            )}
          </dl>
        </section>

        <section>
          <h2>Suas partidas</h2>
          <Results matches={s.record.results.map((r) => r.match)} nameOf={nameOf} onView={onViewSeries} />
        </section>
      </div>

      <button type="button" className="secondary wide" onClick={onNewRun}>
        Nova run
      </button>
    </div>
  );
}

/** Groups → playoffs → top 4 → final → title, with how far this run went (icon + text, not color alone). */
function StagePath({ reached }: { reached: FinishStage }) {
  const at = FINISH_STAGES.indexOf(reached);
  return (
    <ol className="stage-path" aria-label={`Até onde você chegou: ${STAGE_LABELS[reached]}`}>
      {FINISH_STAGES.map((stage, i) => {
        const state = i < at ? 'passed' : i === at ? 'reached' : 'locked';
        return (
          <li key={stage} className={`stage ${state}`} aria-current={state === 'reached' ? 'step' : undefined}>
            <span className="stage-dot" aria-hidden="true">
              {state === 'passed' && <Icon name="check" />}
              {state === 'reached' && <Icon name={stage === 'champion' ? 'trophy' : 'decider'} />}
            </span>
            <span className="stage-label">{STAGE_LABELS[stage]}</span>
          </li>
        );
      })}
    </ol>
  );
}
