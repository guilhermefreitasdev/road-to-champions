import { formatDecimal } from '../../game/explain';
import {
  FIELD_MODE_LABELS,
  REGION_LABELS,
  STAGE_LABELS,
  USER_ID,
  seasonShareText,
  seasonSummary,
  seasonTeamInfo,
  userSeasonResults,
  type SeasonState,
} from '../../game/season';
import { Icon } from '../components/Icon';
import { Results } from '../components/Results';
import { SharePanel } from '../components/SharePanel';
import { TrialsPath } from '../components/TrialsPath';

interface Props {
  season: SeasonState;
  onNewRun: () => void;
  onStats: () => void;
  onViewSeries: (key: string) => void;
}

export function SeasonEnd({ season, onNewRun, onViewSeries, onStats }: Props) {
  const s = seasonSummary(season);
  const text = seasonShareText(season);
  const last = s.outcomes[s.outcomes.length - 1];
  const champion = s.champion;
  const title = champion ? 'Campeão!' : season.eliminatedAt === 'league' ? 'Eliminado na liga' : last?.rank === 2 ? 'Vice-campeão' : 'Eliminado';
  const subtitle =
    season.eliminatedAt === 'league'
      ? `${last?.place ?? '—'} na Liga ${REGION_LABELS[s.region]}: só os 3 primeiros vão ao Masters`
      : `${last?.place ?? '—'} no ${STAGE_LABELS[s.reached]}`;
  const nameOf = (id: string) => seasonTeamInfo(season, id).name;

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
          <strong>{last?.place ?? '—'}</strong>
          <span> · {subtitle}</span>
        </p>
        <p className="end-team">
          {champion ? `${s.teamName} venceu o Champions` : s.teamName}
          <span className="muted"> · Complete Trials · campo {FIELD_MODE_LABELS[s.field]}</span>
        </p>
        <TrialsPath season={season} />
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
              <dt>Mapas</dt>
              <dd>
                {s.mapsWon}-{s.mapsLost}
              </dd>
            </div>
            {s.outcomes.map((o) => (
              <div key={o.stage}>
                <dt>{STAGE_LABELS[o.stage]}</dt>
                <dd>
                  {o.wins}-{o.losses}
                  {o.place && <span className="muted"> · {o.rank === 1 ? 'campeão' : o.place}</span>}
                </dd>
              </div>
            ))}
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
                <dt>Campeão do Champions</dt>
                <dd>{s.championName}</dd>
              </div>
            )}
            {season.eliminatedAt === 'league' && season.league?.champion && (
              <div className="summary-wide">
                <dt>Campeão da liga</dt>
                <dd>{nameOf(season.league.champion)}</dd>
              </div>
            )}
          </dl>
        </section>

        <section>
          <h2>Suas partidas</h2>
          <Results
            matches={userSeasonResults(season).map((r) => ({ id: r.key, label: `${STAGE_LABELS[r.stage]} · ${r.match.label}`, a: r.match.a, b: r.match.b, result: r.match.result }))}
            nameOf={(id) => (id === USER_ID ? s.teamName : nameOf(id))}
            onView={onViewSeries}
          />
        </section>
      </div>

      <div className="end-actions">
        <button type="button" className="secondary" onClick={onStats}>
          <Icon name="stats" /> Estatísticas da run
        </button>
        <button type="button" className="primary" onClick={onNewRun}>
          Nova run
        </button>
      </div>
    </div>
  );
}
