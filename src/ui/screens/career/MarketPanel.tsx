import { useMemo, useRef, useState } from 'react';
import type { Role } from '../../../engine/types';
import {
  CONTRACT_YEARS_MAX,
  CONTRACT_YEARS_MIN,
  DEFAULT_CONTRACT_YEARS,
  careerFinances,
  marketOffers,
  signPlayer,
  signingPreview,
  type OfferKind,
  type OfferRow,
} from '../../../game/career';
import { ROLE_LABELS, SLOT_LABELS, formatDecimal, formatMoney, formatPoints } from '../../../game/explain';
import { REGION_LABELS } from '../../../game/season';
import { ConfirmBar } from '../../components/ConfirmBar';
import { Icon } from '../../components/Icon';
import { PlayerPhoto } from '../../components/PlayerPhoto';
import { TeamLogo } from '../../components/TeamLogo';
import { slotFitLabel } from '../../fit';
import { usePrefersReducedMotion } from '../../motion';
import { BlockNote, Empty, type PanelProps } from './shared';

const ROLES: Role[] = ['duelist', 'initiator', 'controller', 'sentinel'];
const MIN_OVR = [0, 80, 84, 88] as const;
const MAX_FEE = [0, 50, 100, 250, 500] as const;
type Origin = '' | 'region' | OfferKind;

/** Mercado: the open window's offers with filters, the preview of a signing (strength, payroll, cash) and the confirmation. */
export function MarketPanel({ c, act }: PanelProps) {
  const offers = useMemo(() => marketOffers(c), [c]);
  const fin = careerFinances(c);
  const w = c.window && c.window.kind === c.phase ? c.window : null;
  const reducedMotion = usePrefersReducedMotion();
  const detailRef = useRef<HTMLElement>(null);
  const [role, setRole] = useState<Role | ''>('');
  const [minOvr, setMinOvr] = useState(0);
  const [maxFee, setMaxFee] = useState(0);
  const [origin, setOrigin] = useState<Origin>('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [years, setYears] = useState(DEFAULT_CONTRACT_YEARS);
  const [confirming, setConfirming] = useState(false);

  const shown = offers.filter(
    (o) =>
      (!role || o.role === role) &&
      o.ovr >= minOvr &&
      (!maxFee || o.fee <= maxFee) &&
      (!origin || (origin === 'region' ? o.kind !== 'import' : o.kind === origin)) &&
      (!onlyAvailable || !o.block),
  );
  const offer = offers.find((o) => o.playerId === picked) ?? null;
  const preview = useMemo(() => (offer ? signingPreview(c, offer.playerId) : null), [c, offer]);

  if (!w) {
    return (
      <div className="cr-panel">
        <Empty>O mercado abre na pré-temporada (sem limite de contratações) e na janela do meio da temporada, depois da liga (até 2).</Empty>
      </div>
    );
  }

  const pick = (id: string) => {
    setPicked(id === picked ? null : id);
    setConfirming(false);
    setYears(DEFAULT_CONTRACT_YEARS);
    if (id !== picked) {
      requestAnimationFrame(() => {
        detailRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
        detailRef.current?.focus({ preventScroll: true });
      });
    }
  };
  const left = w.maxSignings === null ? null : Math.max(0, w.maxSignings - w.signings);
  const filtersOn = !!role || minOvr > 0 || maxFee > 0 || !!origin || onlyAvailable;

  return (
    <div className="cr-panel">
      <dl className="hub-stats">
        <div>
          <dt>Caixa</dt>
          <dd>{formatMoney(fin.money)}</dd>
        </div>
        <div>
          <dt>Contratações</dt>
          <dd>{left === null ? `${w.signings} (sem limite)` : `${left} de ${w.maxSignings}`}</dd>
        </div>
        <div>
          <dt>Reputação</dt>
          <dd>{c.reputation}</dd>
        </div>
        {c.phase === 'offseason' && (
          <div>
            <dt>Caixa depois da folha</dt>
            <dd className={fin.cashAfterStart < 0 ? 'neg' : ''}>{formatMoney(fin.cashAfterStart)}</dd>
          </div>
        )}
      </dl>
      <details className="market-help small">
        <summary>Como funcionam taxa, salário e reputação</summary>
        <p className="muted measure">
          Taxa na hora: compra de um time da liga = 100% do valor (multa rescisória); agente livre da região = 25%; importado = 50%.
          Salário por temporada = 25% do valor (importado +25%), pago quando a liga começa; na janela do meio, metade na hora. Quem
          tem OVR alto só assina com uma org de reputação suficiente: (OVR − 83) × 5, +10 para importado.
        </p>
      </details>

      <div className="board-filters cr-filters" role="group" aria-label="Filtros do mercado">
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
        <label className="board-select">
          <span>OVR</span>
          <select value={minOvr} onChange={(e) => setMinOvr(Number(e.target.value))}>
            {MIN_OVR.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? 'Todos' : `≥ ${n}`}
              </option>
            ))}
          </select>
        </label>
        <label className="board-select">
          <span>Taxa</span>
          <select value={maxFee} onChange={(e) => setMaxFee(Number(e.target.value))}>
            {MAX_FEE.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? 'Qualquer' : `até ${formatMoney(n)}`}
              </option>
            ))}
          </select>
        </label>
        <label className="board-select">
          <span>Origem</span>
          <select value={origin} onChange={(e) => setOrigin(e.target.value as Origin)}>
            <option value="">Todas</option>
            <option value="region">{REGION_LABELS[c.org.region]} (liga + livres)</option>
            <option value="team">Times da liga</option>
            <option value="free">Agentes livres</option>
            <option value="import">Importados</option>
          </select>
        </label>
        <label className="cr-check">
          <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} />
          Só quem dá para contratar
        </label>
      </div>
      <p className="small muted board-count" aria-live="polite">
        {shown.length} de {offers.length} ofertas
        {filtersOn && (
          <>
            {' '}
            ·{' '}
            <button
              type="button"
              className="ghost cr-clear"
              onClick={() => {
                setRole('');
                setMinOvr(0);
                setMaxFee(0);
                setOrigin('');
                setOnlyAvailable(false);
              }}
            >
              Limpar filtros
            </button>
          </>
        )}
      </p>

      {offer && preview && (
        <section ref={detailRef} tabIndex={-1} className="panel cr-offer-detail" aria-labelledby="cr-offer-title">
          <h3 id="cr-offer-title">
            {offer.handle} <span className="muted">· {offer.kindLabel}</span>
          </h3>
          <dl className="market-diff">
            <div>
              <dt>Força do time</dt>
              <dd>
                {preview.strengthBefore === null ? '—' : formatDecimal(preview.strengthBefore)} <Icon name="kill" label="para" />{' '}
                {preview.strengthAfter === null ? '—' : formatDecimal(preview.strengthAfter)}
                {preview.strengthBefore !== null && preview.strengthAfter !== null && (
                  <>
                    {' '}
                    <DeltaText delta={preview.strengthAfter - preview.strengthBefore} />
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt>Entra como</dt>
              <dd>{preview.slot ? `${SLOT_LABELS[preview.slot]} · ${slotFitLabel(offer.card, preview.slot)}` : 'Reserva'}</dd>
            </div>
            <div>
              <dt>Taxa agora</dt>
              <dd>{formatMoney(offer.fee)}</dd>
            </div>
            <div>
              <dt>Salário</dt>
              <dd>
                {formatMoney(offer.salary)}/temp.{c.phase === 'midseason' ? ' (metade agora)' : ''}
              </dd>
            </div>
            <div>
              <dt>Folha da temporada</dt>
              <dd>{formatMoney(preview.payrollAfter)}</dd>
            </div>
            <div>
              <dt>{c.phase === 'offseason' ? 'Caixa depois da folha' : 'Caixa depois'}</dt>
              <dd className={preview.cashAfter < 0 ? 'neg' : ''}>{formatMoney(preview.cashAfter)}</dd>
            </div>
          </dl>
          <p className="small muted">
            OVR {offer.ovr} · potencial {offer.potential} · exp. {offer.experience} · pede reputação {offer.requiredRep}. A força usa a
            melhor escalação com ele (auto-escalar).
          </p>
          {preview.block ? (
            <BlockNote>{preview.block}</BlockNote>
          ) : confirming ? (
            <ConfirmBar
              title={`Contratar ${offer.handle}?`}
              text={`Paga ${formatMoney(offer.fee)} agora e ${formatMoney(offer.salary)} por temporada, por ${years} temporada${years === 1 ? '' : 's'}.`}
              confirmLabel={`Contratar ${offer.handle}`}
              onConfirm={() => {
                if (act((x) => signPlayer(x, offer.playerId, years))) {
                  setPicked(null);
                  setConfirming(false);
                }
              }}
              onCancel={() => setConfirming(false)}
            />
          ) : (
            <div className="cr-actions">
              <label className="board-select cr-years">
                <span>Contrato</span>
                <select value={years} onChange={(e) => setYears(Number(e.target.value))}>
                  {Array.from({ length: CONTRACT_YEARS_MAX - CONTRACT_YEARS_MIN + 1 }, (_, i) => CONTRACT_YEARS_MIN + i).map((n) => (
                    <option key={n} value={n}>
                      {n} temporada{n === 1 ? '' : 's'}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="primary" onClick={() => setConfirming(true)}>
                Contratar {offer.handle}
              </button>
              <button type="button" className="secondary" onClick={() => setPicked(null)}>
                Fechar
              </button>
            </div>
          )}
        </section>
      )}

      {shown.length === 0 ? (
        <Empty>Nenhuma oferta com esses filtros.</Empty>
      ) : (
        <ul className="cr-list cr-offers">
          {shown.map((o) => (
            <OfferItem key={o.playerId} o={o} on={o.playerId === picked} onPick={() => pick(o.playerId)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DeltaText({ delta }: { delta: number }) {
  return <span className={delta > 0.05 ? 'pos' : delta < -0.05 ? 'neg' : 'muted'}>({formatPoints(delta)})</span>;
}

function OfferItem({ o, on, onPick }: { o: OfferRow; on: boolean; onPick: () => void }) {
  const id = `cr-offer-${o.playerId}`;
  return (
    <li className={`cr-offer${on ? ' is-on' : ''}${o.block ? ' is-locked' : ''}`}>
      <PlayerPhoto playerId={o.card.playerId} eventId={o.eventId} handle={o.handle} country={o.card.country} size={44} />
      <span className="cr-who">
        <strong className="cr-handle">{o.handle}</strong>
        <span className="badges">
          <span className={`badge role-${o.role}`}>{ROLE_LABELS[o.role]}</span>
          {o.card.isIGL && (
            <span className="badge igl">
              <Icon name="mic" /> IGL
            </span>
          )}
          <span className={`badge cr-kind kind-${o.kind}`}>{o.kindLabel}</span>
        </span>
        <span className="small muted cr-card-of">
          <TeamLogo teamId={o.teamId} eventId={o.eventId} name={o.teamName} size={16} /> {o.teamName}
          {o.kind === 'import' ? ` · ${REGION_LABELS[o.region]}` : ''} · exp. {o.experience}
        </span>
      </span>
      <span className="cr-nums">
        <span className="cr-ovr">{o.ovr}</span>
        <span className="small muted">POT {o.potential}</span>
      </span>
      <span className="cr-price small">
        <span>
          Taxa <strong>{formatMoney(o.fee)}</strong>
        </span>
        <span className="muted">{formatMoney(o.salary)}/temp.</span>
      </span>
      <button type="button" className="secondary cr-offer-btn" aria-expanded={on} aria-describedby={o.block ? id : undefined} onClick={onPick}>
        {on ? 'Fechar' : 'Ver proposta'}
      </button>
      {o.block && (
        <BlockNote id={id}>{o.block}</BlockNote>
      )}
    </li>
  );
}
