import { useMemo, useRef, useState } from 'react';
import type { Card } from '../../engine/types';
import { MARKET_HELP, ROLE_LABELS, SLOT_LABELS, explainPrice, formatDecimal, formatMoney, formatPoints } from '../../game/explain';
import {
  REGION_LABELS,
  USER_ID,
  marketOffers,
  saleValue,
  seasonLineup,
  seasonTeamInfo,
  signingPreview,
  userLineup,
  type MarketOffer,
  type MarketWindow,
  type SeasonState,
} from '../../game/season';
import { ConfirmBar } from '../components/ConfirmBar';
import { DifficultyBadge } from '../components/Difficulty';
import { Icon } from '../components/Icon';
import { PlayerCard } from '../components/PlayerCard';
import { PlayerPhoto } from '../components/PlayerPhoto';
import { TrialsPath } from '../components/TrialsPath';
import { difficultyOf } from '../difficulty';
import { slotFitLabel } from '../fit';
import { usePrefersReducedMotion } from '../motion';

interface Props {
  season: SeasonState;
  /** Signs `cardId` in place of `replaceCardId`; false when the engine refused (the error is shown by the app). */
  onSign: (cardId: string, replaceCardId: string) => boolean;
  onClose: () => void;
  onStats: () => void;
  /** Card lookup by id (the season's signings, including who left). */
  cardOf: (cardId: string) => Card | undefined;
}

export const WINDOW_LABELS: Record<MarketWindow, { name: string; stage: string; next: string }> = {
  'post-league': { name: 'pós-Liga', stage: 'Liga', next: 'Masters' },
  'post-masters': { name: 'pós-Masters', stage: 'Masters', next: 'Champions' },
};

/**
 * Complete Trials free agency, after the league and after the Masters: pick an offer (step 1), pick who leaves with
 * the slot fit and the strength before/after (step 2), confirm (step 3); then close the window and play on.
 */
export function Market({ season, onSign, onClose, onStats, cardOf }: Props) {
  const market = season.market!;
  const offers = useMemo(() => marketOffers(season), [season]);
  const reducedMotion = usePrefersReducedMotion();
  const teamRef = useRef<HTMLElement>(null);
  const [offerId, setOfferId] = useState<string | null>(null);
  const [outId, setOutId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const raw = useMemo(() => seasonLineup(season), [season]);
  const formOvr = new Map(userLineup(season).players.map((p) => [p.card.id, p.card.ovr]));
  const me = seasonTeamInfo(season, USER_ID);
  const left = Math.max(0, market.maxSignings - market.signed.length);
  const label = WINDOW_LABELS[market.window];
  const bestSale = Math.max(...raw.players.map((p) => saleValue(p.card)));
  const offer = offers.find((o) => o.card.id === offerId) ?? null;
  const previews = useMemo(
    () => (offer ? new Map(raw.players.map((p) => [p.card.id, signingPreview(season, offer.card.id, p.card.id)])) : null),
    [season, offer, raw],
  );
  const outPlayer = raw.players.find((p) => p.card.id === outId) ?? null;
  const preview = outPlayer ? previews?.get(outPlayer.card.id) ?? null : null;
  const transfers = [...(season.transfers ?? []), ...market.signed.map((x) => ({ ...x, window: market.window }))];

  /** Why an offer can't be taken right now (null = it can). */
  const lockReason = (o: MarketOffer): string | null => {
    if (left === 0) return `Limite de ${market.maxSignings} contratações nesta janela atingido.`;
    if (o.price > market.budget + bestSale) return `Orçamento insuficiente: faltam ${formatMoney(o.price - market.budget - bestSale)} mesmo liberando o jogador mais valioso.`;
    return null;
  };

  const pickOffer = (id: string) => {
    const opening = offerId !== id;
    setOfferId(opening ? id : null);
    setOutId(null);
    setConfirming(false);
    if (opening) {
      requestAnimationFrame(() => {
        teamRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
        teamRef.current?.focus({ preventScroll: true });
      });
    }
  };
  const cancel = () => {
    setOfferId(null);
    setOutId(null);
    setConfirming(false);
  };

  return (
    <div className="screen market-screen">
      <header className="screen-head">
        <h1>Janela de transferências · {label.name}</h1>
        <p className="context">
          {me.name} · Complete Trials · {REGION_LABELS[season.region ?? 'americas']}
        </p>
        <p className="head-badges">
          <DifficultyBadge difficulty={difficultyOf(season)} />
        </p>
        <TrialsPath season={season} compact />
        <dl className="hub-stats market-stats">
          <div>
            <dt>Orçamento</dt>
            <dd>{formatMoney(market.budget)}</dd>
          </div>
          <div>
            <dt>Contratações restantes</dt>
            <dd>
              {left} de {market.maxSignings}
            </dd>
          </div>
          <div>
            <dt>Prêmio da {label.stage}</dt>
            <dd>{formatMoney(market.prize)}</dd>
          </div>
          <div>
            <dt>Força</dt>
            <dd>{formatDecimal(me.strength)}</dd>
          </div>
        </dl>
        <p className="small muted measure">
          Reforce o time antes do {label.next}. O contratado entra na posição de quem sai; quem sai é liberado e metade do valor dele
          volta para o orçamento. O dinheiro que sobrar fica para a próxima janela.
        </p>
        <details className="market-help small">
          <summary>Como funcionam preços e prêmios</summary>
          <p className="muted measure">{MARKET_HELP}</p>
        </details>
      </header>

      {transfers.length > 0 && (
        <section className="panel market-signed" aria-labelledby="signed-title">
          <h2 id="signed-title">Contratações da temporada</h2>
          <ul>
            {transfers.map((x) => (
              <li key={`${x.window}-${x.in}`}>
                <Icon name="swap" /> <strong>{cardOf(x.in)?.handle ?? x.in}</strong> no lugar de {cardOf(x.out)?.handle ?? x.out}
                <span className="muted">
                  {' '}
                  · {WINDOW_LABELS[x.window].name} · {formatMoney(x.price)} (liberação {formatMoney(x.sale)})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="market-grid">
        <section ref={teamRef} tabIndex={-1} className={`panel market-team${offer ? ' is-choosing' : ''}`} aria-labelledby="market-team-title">
          <h2 id="market-team-title">{offer ? `Quem sai para ${offer.card.handle} entrar?` : 'Seu time'}</h2>
          <p className="small muted">
            {offer
              ? `Passo 2 de 3: escolha quem sai. ${offer.card.handle} (${formatMoney(offer.price)}) entra na posição dele.`
              : 'OVR com a fase do torneio. Valor de liberação = metade do valor de mercado.'}
          </p>
          <fieldset className="market-five" disabled={!offer}>
            <legend className="sr-only">{offer ? `Quem sai para ${offer.card.handle} entrar` : 'Seu time'}</legend>
            <ul>
              {raw.players.map((p) => {
                const pv = previews?.get(p.card.id);
                const on = outId === p.card.id;
                const delta = pv ? pv.strengthAfter - pv.strengthBefore : 0;
                const body = (
                  <>
                    <PlayerPhoto playerId={p.card.playerId} eventId={p.card.eventId} handle={p.card.handle} country={p.card.country} size={40} />
                    <span className="mf-main">
                      <strong>{p.card.handle}</strong>
                      <span className="small muted">
                        {p.slot === p.card.role ? ROLE_LABELS[p.card.role] : `${SLOT_LABELS[p.slot]} · ${ROLE_LABELS[p.card.role]}`}
                      </span>
                    </span>
                    <span className="mf-nums">
                      <span className="mf-ovr" title="OVR com a fase do torneio">
                        {formOvr.get(p.card.id) ?? p.card.ovr}
                      </span>
                      <span className="small muted">libera {formatMoney(saleValue(p.card))}</span>
                      {pv && !pv.blocked && (
                        <span className={`small mf-delta ${delta > 0.05 ? 'pos' : delta < -0.05 ? 'neg' : ''}`}>força {formatPoints(delta)}</span>
                      )}
                    </span>
                    {offer && pv && (
                      <span className={`small mf-fit${pv.fit < 1 ? ' is-off' : ''}`}>
                        <Icon name={pv.fit < 1 ? 'warning' : 'check'} /> {offer.card.handle} como {SLOT_LABELS[p.slot]}: {slotFitLabel(offer.card, p.slot)}
                      </span>
                    )}
                    {pv?.blocked && (
                      <span className="small mf-lock">
                        <Icon name="lock" /> {pv.blocked}
                        {pv.budgetAfter < 0 ? `: faltam ${formatMoney(-pv.budgetAfter)}` : ''}
                      </span>
                    )}
                  </>
                );
                return (
                  <li key={p.card.id}>
                    {offer ? (
                      <label className={`mf-row selectable${on ? ' is-on' : ''}${pv?.blocked ? ' is-locked' : ''}`}>
                        <input
                          type="radio"
                          name="market-out"
                          value={p.card.id}
                          checked={on}
                          disabled={!!pv?.blocked}
                          onChange={() => {
                            setOutId(p.card.id);
                            setConfirming(false);
                          }}
                        />
                        {body}
                      </label>
                    ) : (
                      <div className="mf-row">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </fieldset>

          {offer && outPlayer && preview && !preview.blocked && !confirming && (
            <div className="market-review">
              <dl className="market-diff">
                <div>
                  <dt>Força do time</dt>
                  <dd>
                    {formatDecimal(preview.strengthBefore)} <Icon name="kill" label="para" /> {formatDecimal(preview.strengthAfter)}{' '}
                    <span className={preview.strengthAfter - preview.strengthBefore > 0.05 ? 'pos' : preview.strengthAfter - preview.strengthBefore < -0.05 ? 'neg' : 'muted'}>
                      ({formatPoints(preview.strengthAfter - preview.strengthBefore)})
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Encaixe como {SLOT_LABELS[preview.slot]}</dt>
                  <dd>{slotFitLabel(offer.card, preview.slot)}</dd>
                </div>
                <div>
                  <dt>Preço − liberação</dt>
                  <dd>
                    {formatMoney(preview.price)} − {formatMoney(preview.sale)}
                  </dd>
                </div>
                <div>
                  <dt>Orçamento depois</dt>
                  <dd>{formatMoney(preview.budgetAfter)}</dd>
                </div>
              </dl>
              <div className="market-review-actions">
                <button type="button" className="secondary" onClick={cancel}>
                  Cancelar
                </button>
                <button type="button" className="primary" onClick={() => setConfirming(true)}>
                  Revisar troca
                </button>
              </div>
            </div>
          )}
          {offer && !outPlayer && (
            <button type="button" className="secondary wide market-cancel" onClick={cancel}>
              <Icon name="close" /> Desistir de {offer.card.handle}
            </button>
          )}
          {offer && outPlayer && preview && confirming && (
            <ConfirmBar
              title={`Passo 3 de 3: contratar ${offer.card.handle}?`}
              text={`${offer.card.handle} entra como ${SLOT_LABELS[preview.slot]} no lugar de ${outPlayer.card.handle}, que é liberado. Preço ${formatMoney(preview.price)}, liberação ${formatMoney(preview.sale)}: o orçamento fica em ${formatMoney(preview.budgetAfter)}. Não dá para desfazer.`}
              confirmLabel={`Contratar ${offer.card.handle}`}
              onConfirm={() => {
                if (onSign(offer.card.id, outPlayer.card.id)) cancel();
              }}
              onCancel={() => setConfirming(false)}
            />
          )}
        </section>

        <section className="market-offers" aria-labelledby="offers-title">
          <h2 id="offers-title">
            Jogadores livres <span className="muted">· {offers.length}</span>
          </h2>
          <p className="small muted">{offer ? `Escolhido: ${offer.card.handle}. Toque de novo para desistir.` : 'Passo 1 de 3: escolha um jogador livre.'}</p>
          {offers.length === 0 ? (
            <p className="empty-state">Nenhum jogador livre nesta janela.</p>
          ) : (
            <ul className="offer-grid">
              {offers.map((o) => {
                const reason = lockReason(o);
                const on = offerId === o.card.id;
                return (
                  <li key={o.card.id} className={`offer${on ? ' is-on' : ''}${reason ? ' is-locked' : ''}`}>
                    <PlayerCard card={o.card} />
                    <div className="offer-foot">
                      <span className="offer-price">
                        <span className="small muted">Preço</span>
                        <strong title={explainPrice(o.card)}>{formatMoney(o.price)}</strong>
                      </span>
                      <button
                        type="button"
                        className={on ? 'primary' : 'secondary'}
                        aria-pressed={on}
                        disabled={!!reason}
                        aria-describedby={reason ? `offer-${o.card.id}-why` : undefined}
                        onClick={() => pickOffer(o.card.id)}
                      >
                        {on ? (
                          <>
                            <Icon name="check" /> Escolhido
                          </>
                        ) : (
                          <>
                            Contratar <span className="sr-only">{o.card.handle}</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="small muted offer-price-why">{explainPrice(o.card)}</p>
                    {reason && (
                      <p id={`offer-${o.card.id}-why`} className="small offer-why">
                        <Icon name="lock" /> {reason}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <div className="market-actions">
        <button type="button" className="secondary" onClick={onStats}>
          <Icon name="stats" /> Estatísticas
        </button>
        <button type="button" className="primary" onClick={onClose}>
          Fechar janela e seguir para o {label.next}
        </button>
      </div>
    </div>
  );
}
