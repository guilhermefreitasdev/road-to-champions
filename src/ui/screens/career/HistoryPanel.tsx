import {
  CAREER_STAGES,
  CAREER_STAGE_LABELS,
  LEDGER_LABELS,
  OFFER_KIND_LABELS,
  careerHistory,
  careerSummary,
  playerCard,
  type Award,
  type CareerState,
  type LedgerKind,
  type SeasonRecord,
} from '../../../game/career';
import { formatDecimal, formatMoney } from '../../../game/explain';
import { Icon, YouTag } from '../../components/Icon';
import { signed } from '../../careerView';

/** Histórico: titles and best finishes of the career, then every season's report, newest first. */
export function HistoryPanel({ c }: { c: CareerState }) {
  const summary = careerSummary(c);
  const history = [...careerHistory(c)].reverse();
  return (
    <div className="cr-panel">
      <dl className="hub-stats">
        <div>
          <dt>Temporadas</dt>
          <dd>{summary.seasonsPlayed}</dd>
        </div>
        {CAREER_STAGES.map((s) => (
          <div key={s}>
            <dt>Títulos {CAREER_STAGE_LABELS[s]}</dt>
            <dd>{summary.titles[s]}</dd>
          </div>
        ))}
        {CAREER_STAGES.map((s) =>
          summary.best[s] ? (
            <div key={`best-${s}`}>
              <dt>Melhor {CAREER_STAGE_LABELS[s]}</dt>
              <dd>{summary.best[s]!.rank === 1 ? 'Campeão' : summary.best[s]!.label}</dd>
            </div>
          ) : null,
        )}
      </dl>
      {history.length === 0 ? (
        <p className="empty-state">A primeira temporada ainda não terminou. Cada relatório de fim de temporada fica guardado aqui.</p>
      ) : (
        <ol className="cr-seasons">
          {history.map((r) => (
            <li key={r.season}>
              <SeasonRecordCard c={c} record={r} headingLevel={3} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const KIND_ORDER: LedgerKind[] = ['prize', 'sponsor', 'bonus', 'sale', 'salaries', 'coach', 'fee'];

/** One season's record: path, titles, awards, sponsors, money and reputation, and the signings that stayed. */
export function SeasonRecordCard({ c, record: r, headingLevel = 2 }: { c: CareerState; record: SeasonRecord; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? 'h2' : 'h3';
  const signings = c.players
    .filter((p) => p.joined.year === r.year)
    .sort((x, y) => y.joined.fee - x.joined.fee)
    .map((p) => ({ handle: playerCard(p, false).handle, from: p.joined.from, fee: p.joined.fee }));
  return (
    <article className="panel cr-season">
      <header className="cr-season-head">
        <H className="cr-season-title">
          Temporada {r.season} · {r.year}
        </H>
        <p className="cr-path">{r.path || 'Sem resultado'}</p>
        {r.titles.length > 0 && (
          <p className="cr-titles">
            <Icon name="trophy" /> Campeão: {r.titles.map((t) => CAREER_STAGE_LABELS[t]).join(', ')}
          </p>
        )}
        {r.bankrupt && (
          <p className="cr-warn">
            <Icon name="warning" /> Falência
          </p>
        )}
      </header>
      <div className="cr-season-grid">
        <section>
          <h4>Prêmios</h4>
          <ul className="cr-awards">
            <AwardItem label="MVP da temporada" award={r.awards.mvp} />
            <AwardItem label="Revelação" award={r.awards.rookie} />
            <AwardItem label="Destaque da org" award={r.awards.orgBest} />
          </ul>
          <h4>Campeões</h4>
          <ul className="cr-plain small">
            {CAREER_STAGES.filter((s) => r.winners[s]).map((s) => (
              <li key={s}>
                {CAREER_STAGE_LABELS[s]}: <strong>{r.winners[s]}</strong>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h4>Dinheiro</h4>
          <p className="small">
            {formatMoney(r.money.start)} <Icon name="kill" label="para" /> <strong className={r.money.end < 0 ? 'neg' : ''}>{formatMoney(r.money.end)}</strong>
          </p>
          <ul className="cr-plain small cr-ledger-kinds">
            {KIND_ORDER.filter((k) => r.money.byKind[k]).map((k) => (
              <li key={k}>
                <span>{LEDGER_LABELS[k]}</span>
                <span className={r.money.byKind[k]! > 0 ? 'pos' : 'neg'}>
                  {r.money.byKind[k]! > 0 ? '+' : ''}
                  {formatMoney(r.money.byKind[k]!)}
                </span>
              </li>
            ))}
          </ul>
          <h4>Reputação</h4>
          <p className="small">
            {r.reputation.start} <Icon name="kill" label="para" /> <strong>{r.reputation.end}</strong> ({signed(r.reputation.end - r.reputation.start)})
          </p>
          {r.strength > 0 && <p className="small muted">Força no fim: {formatDecimal(r.strength)}</p>}
        </section>
        <section>
          <h4>Patrocínios</h4>
          {r.sponsors.length === 0 ? (
            <p className="small muted">Nenhum.</p>
          ) : (
            <ul className="cr-plain small">
              {r.sponsors.map((s) => (
                <li key={s.name} className={`cr-objective obj-${s.met ? 'met' : 'missed'}`}>
                  <Icon name={s.met ? 'check' : 'ban'} /> {s.name}: {s.met ? `objetivo cumprido, +${formatMoney(s.bonus)}` : 'objetivo perdido, −2 de reputação'}
                </li>
              ))}
            </ul>
          )}
          <h4>Contratações que seguem no elenco</h4>
          {signings.length === 0 ? (
            <p className="small muted">Nenhuma.</p>
          ) : (
            <ul className="cr-plain small">
              {signings.map((s) => (
                <li key={s.handle}>
                  <strong>{s.handle}</strong> · {s.from === 'academy' ? 'base' : OFFER_KIND_LABELS[s.from].toLowerCase()}
                  {s.fee > 0 ? ` · ${formatMoney(s.fee)}` : ''}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </article>
  );
}

function AwardItem({ label, award }: { label: string; award: Award | undefined }) {
  return (
    <li>
      <span className="cr-k">{label}</span>
      {award ? (
        <span>
          <strong>{award.handle}</strong> {award.isUser && <YouTag />}
          <span className="small muted">
            {' '}
            · {award.teamName} · rating {formatDecimal(award.rating, 2)} em {award.maps} mapas
          </span>
        </span>
      ) : (
        <span className="small muted">—</span>
      )}
    </li>
  );
}
