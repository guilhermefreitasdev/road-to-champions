import type { ReactNode } from 'react';
import { acceptSponsor, dropSponsor, sponsorSlots, sponsorsView, type ObjectiveProgress, type ObjectiveState, type SponsorRow } from '../../../game/career';
import { formatMoney } from '../../../game/explain';
import { Icon } from '../../components/Icon';
import { BlockNote, Empty, type PanelProps } from './shared';

const STATE_ICON: Record<ObjectiveState, 'check' | 'ban' | 'chevron' | 'decider'> = { met: 'check', missed: 'ban', 'on-track': 'chevron', open: 'decider' };

/** Patrocínios: the accepted contracts (base pay, bonus objective and its progress) and the off-season's offers. */
export function SponsorsPanel({ c, act }: PanelProps) {
  const view = sponsorsView(c);
  const offseason = c.phase === 'offseason';
  const full = view.accepted.length >= view.slots;
  const open = view.offers.filter((o) => !o.accepted);

  return (
    <div className="cr-panel">
      <p className="small muted measure">
        Contratos de uma temporada. O fixo entra quando a liga começa; o bônus no fim, se o objetivo for cumprido (se não, −2 de
        reputação). Vagas pela reputação: 1 abaixo de 35, 2 abaixo de 65, 3 a partir de 65. Hoje: {view.slots} vaga
        {view.slots === 1 ? '' : 's'} (reputação {c.reputation}
        {sponsorSlots(c.reputation) < 3 ? `; a próxima vaga com ${c.reputation < 35 ? 35 : 65}` : ''}).
      </p>

      <h3 className="hub-subtitle">
        Seus patrocinadores ({view.accepted.length}/{view.slots})
      </h3>
      {view.accepted.length === 0 ? (
        <p className="small muted">Nenhum patrocinador nesta temporada.</p>
      ) : (
        <ul className="cr-list">
          {view.accepted.map((row) => (
            <SponsorItem key={row.offer.id} row={row}>
              {row.progress && <Progress state={row.progress} />}
              <button type="button" className="secondary" disabled={!offseason} aria-describedby={!offseason ? `cr-sp-${row.offer.id}` : undefined} onClick={() => act((x) => dropSponsor(x, row.offer.id), `Contrato com ${row.offer.name} desfeito`)}>
                Desistir
              </button>
              {!offseason && <BlockNote id={`cr-sp-${row.offer.id}`}>Contrato fechado até o fim da temporada</BlockNote>}
            </SponsorItem>
          ))}
        </ul>
      )}

      <h3 className="hub-subtitle">Ofertas</h3>
      {!offseason ? (
        <Empty>As ofertas de patrocínio chegam na pré-temporada.</Empty>
      ) : open.length === 0 ? (
        <Empty>Nenhuma oferta em aberto.</Empty>
      ) : (
        <ul className="cr-list">
          {open.map((row) => {
            const id = `cr-spo-${row.offer.id}`;
            return (
              <SponsorItem key={row.offer.id} row={row}>
                <button type="button" className="primary" disabled={full} aria-describedby={full ? id : undefined} onClick={() => act((x) => acceptSponsor(x, row.offer.id), `${row.offer.name} fechado: ${formatMoney(row.offer.base)} quando a liga começar`)}>
                  Aceitar
                </button>
                {full && <BlockNote id={id}>Sem vaga: {view.slots} patrocinador{view.slots === 1 ? '' : 'es'} com a sua reputação</BlockNote>}
              </SponsorItem>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SponsorItem({ row, children }: { row: SponsorRow; children: ReactNode }) {
  const o = row.offer;
  return (
    <li className="cr-sponsor">
      <span className="cr-sponsor-mark" aria-hidden="true">
        {o.name
          .split(/\s+/)
          .map((w) => w[0])
          .join('')
          .slice(0, 2)}
      </span>
      <span className="cr-who">
        <strong>{o.name}</strong>
        <span className="small">
          Fixo <strong>{formatMoney(o.base)}</strong> · bônus <strong>{formatMoney(o.bonus)}</strong>
        </span>
        <span className="small muted">Objetivo: {row.objectiveLabel}</span>
      </span>
      <span className="cr-sponsor-actions">{children}</span>
    </li>
  );
}

function Progress({ state }: { state: ObjectiveProgress }) {
  return (
    <span className={`cr-objective obj-${state.state} small`}>
      <Icon name={STATE_ICON[state.state]} /> {state.text}
    </span>
  );
}
