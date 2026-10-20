import { CAREER_STAGE_LABELS, careerHistory, careerShareText, careerSummary, seasonReport, type CareerState } from '../../game/career';
import { formatMoney } from '../../game/explain';
import { REGION_LABELS } from '../../game/season';
import { DifficultyBadge } from '../components/Difficulty';
import { Icon } from '../components/Icon';
import { OrgEmblem } from '../components/OrgEmblem';
import { SharePanel } from '../components/SharePanel';
import { SeasonRecordCard } from './career/HistoryPanel';

interface Props {
  c: CareerState;
  /** advanceToNextSeason (report only). */
  onAdvance: () => void;
  onOffice: () => void;
  /** Bankruptcy: start a new career (the create screen). */
  onNewCareer: () => void;
}

/** End of a season ("Relatório") and, after a bankruptcy, the end of the career. */
export function CareerReport({ c, onAdvance, onOffice, onNewCareer }: Props) {
  const record = seasonReport(c);
  const over = c.phase === 'over';
  const summary = careerSummary(c);
  const titles = record?.titles ?? [];
  const title = over
    ? 'Falência'
    : titles.includes('champions') ? 'Campeão do Champions!'
    : titles.length > 0 ? `Campeão: ${titles.map((t) => CAREER_STAGE_LABELS[t]).join(' e ')}`
    : `Fim da temporada ${c.season}`;

  return (
    <div className="screen career-report">
      <header className="screen-head cr-report-head">
        <OrgEmblem emblem={c.org.emblem} tag={c.org.tag} size={72} className="cr-report-emblem" />
        <h1 className={over ? 'loss-text' : titles.length > 0 ? 'cr-champ' : undefined}>
          {titles.length > 0 && !over && <Icon name="trophy" />} {title}
        </h1>
        <p className="context">
          {c.org.name} · {REGION_LABELS[c.org.region]} · temporada {c.season} ({c.year})
        </p>
        <p className="head-badges">
          <DifficultyBadge difficulty={c.org.difficulty} />
        </p>
      </header>

      {over && (
        <section className="panel cr-over" aria-labelledby="cr-over-title">
          <h2 id="cr-over-title">Carreira encerrada</h2>
          <p className="measure">
            A org terminou a temporada com {formatMoney(c.money)} em caixa
            {c.money > -1000 ? ', no vermelho pela segunda temporada seguida' : ', abaixo do limite de US$ 1 mi negativo'}. Os credores
            fecharam as portas.
          </p>
          <dl className="hub-stats">
            <div>
              <dt>Temporadas</dt>
              <dd>{summary.seasonsPlayed}</dd>
            </div>
            <div>
              <dt>Títulos</dt>
              <dd>{summary.titles.league + summary.titles.masters + summary.titles.champions}</dd>
            </div>
            <div>
              <dt>Reputação final</dt>
              <dd>{c.reputation}</dd>
            </div>
          </dl>
        </section>
      )}

      {record && <SeasonRecordCard c={c} record={record} />}

      {over && careerHistory(c).length > 1 && (
        <section className="panel" aria-labelledby="cr-path-title">
          <h2 id="cr-path-title">A carreira</h2>
          <ol className="cr-plain small">
            {careerHistory(c).map((r) => (
              <li key={r.season}>
                Temporada {r.season} ({r.year}): {r.path || 'sem resultado'}
                {r.titles.length > 0 ? ` · títulos: ${r.titles.map((t) => CAREER_STAGE_LABELS[t]).join(', ')}` : ''}
              </li>
            ))}
          </ol>
        </section>
      )}

      <SharePanel text={careerShareText(c)} difficulty={c.org.difficulty} title="Compartilhe a temporada" note="Texto simples, sem emoji: o caminho da temporada e o caixa." />

      <div className="cr-report-actions">
        {over ? (
          <button type="button" className="primary big wide" onClick={onNewCareer}>
            Nova carreira
          </button>
        ) : (
          <button type="button" className="primary big wide" onClick={onAdvance}>
            Avançar para a próxima temporada <Icon name="chevron" />
          </button>
        )}
        <button type="button" className="secondary wide" onClick={onOffice}>
          <Icon name="back" /> Ver escritório
        </button>
      </div>
      {!over && (
        <p className="small muted measure">
          Na virada, todo mundo envelhece (jovens crescem, veteranos caem), os contratos perdem uma temporada e a moral volta para
          perto de 65. Os times da IA também mudam.
        </p>
      )}
    </div>
  );
}
