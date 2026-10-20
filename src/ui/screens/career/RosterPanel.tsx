import { useState } from 'react';
import { SLOTS } from '../../../engine/draft';
import type { Slot } from '../../../engine/types';
import {
  CONTRACT_YEARS_MAX,
  CONTRACT_YEARS_MIN,
  autoLineup,
  benchPlayer,
  careerCoach,
  careerRoster,
  careerStrength,
  coachOffers,
  hireCoach,
  promoteAcademy,
  releaseCoach,
  releasePlayer,
  renewContract,
  rosterLimits,
  setStarter,
  setTrainingFocus,
  type CareerRosterRow,
  type CareerState,
} from '../../../game/career';
import { AURA_LABELS, ROLE_LABELS, SLOT_LABELS, formatDecimal, formatMoney } from '../../../game/explain';
import { ConfirmBar } from '../../components/ConfirmBar';
import { Icon } from '../../components/Icon';
import { PlayerPhoto } from '../../components/PlayerPhoto';
import { TeamLogo } from '../../components/TeamLogo';
import { entryOfCard } from '../../../game/career/world';
import { contractText, moraleText, signed, windowOpen } from '../../careerView';
import { BlockNote, Meter, type PanelProps } from './shared';

/** Elenco: the five by slot, the bench, the coach and the training focus; lineup, renewals and sales. */
export function RosterPanel({ c, act }: PanelProps) {
  const rows = careerRoster(c);
  const limits = rosterLimits(c);
  const strength = careerStrength(c);
  const [selling, setSelling] = useState<string | null>(null);
  const main = rows.filter((r) => r.status !== 'academy');
  const bench = main.filter((r) => r.status === 'bench');
  const editable = !c.veto && c.phase !== 'over';

  return (
    <div className="cr-panel">
      <div className="cr-panel-head">
        <dl className="hub-stats">
          <div>
            <dt>Força</dt>
            <dd>{strength ? formatDecimal(strength.total) : '—'}</dd>
          </div>
          <div>
            <dt>Titulares</dt>
            <dd>
              {limits.starters}/{limits.maxStarters}
            </dd>
          </div>
          <div>
            <dt>Reservas</dt>
            <dd>
              {limits.bench}/{limits.maxBench}
            </dd>
          </div>
          <div>
            <dt>Foco de treino</dt>
            <dd>
              {limits.focus}/{limits.maxFocus}
            </dd>
          </div>
        </dl>
        <button type="button" className="secondary" disabled={!editable || main.length === 0} onClick={() => act(autoLineup)}>
          <Icon name="swap" /> Auto-escalar
        </button>
      </div>
      <p className="small muted measure">
        A força usa a fase do torneio da próxima etapa. O foco de treino (até {limits.maxFocus} jogadores) dá +1 de evolução, ou 1 a
        menos de declínio, na virada da temporada. Moral ≥ 80 dá +1 de OVR; ≤ 25, −1.
      </p>
      {c.veto && <p className="small cr-note"><Icon name="lock" /> Veto em andamento: termine a partida para mudar a escalação.</p>}

      <h3 className="hub-subtitle">Titulares</h3>
      <ul className="cr-list">
        {SLOTS.map((slot) => {
          const row = main.find((r) => r.status === 'starter' && r.slot === slot);
          if (!row) {
            return (
              <li key={slot} className="cr-empty-slot">
                <span className="cr-slot-tag">{SLOT_LABELS[slot]}</span>
                <span className="small muted">Vaga vazia: contrate no Mercado, promova da Base ou escale um reserva.</span>
              </li>
            );
          }
          return (
            <PlayerItem key={row.player.id} row={row} c={c} act={act} editable={editable} selling={selling === row.player.id} onSell={setSelling} />
          );
        })}
      </ul>

      <h3 className="hub-subtitle">
        Reservas ({bench.length}/{limits.maxBench})
      </h3>
      {bench.length > 0 ? (
        <ul className="cr-list">
          {bench.map((row) => (
            <PlayerItem key={row.player.id} row={row} c={c} act={act} editable={editable} selling={selling === row.player.id} onSell={setSelling} />
          ))}
        </ul>
      ) : (
        <p className="small muted">Sem reservas. Um reserva cobre um titular que sai e entra na escalação quando você quiser.</p>
      )}

      <CoachSection c={c} act={act} />
    </div>
  );
}

interface ItemProps extends PanelProps {
  row: CareerRosterRow;
  editable: boolean;
  selling: boolean;
  onSell: (id: string | null) => void;
}

/** A player of the org (main roster or academy) with its actions; the sale asks for confirmation in place. */
export function PlayerItem({ row, c, act, editable, selling, onSell }: ItemProps) {
  const p = row.player;
  const academy = row.status === 'academy';
  const limits = rosterLimits(c);
  const open = windowOpen(c);
  const [years, setYears] = useState(2);
  const id = `cr-${p.id}`;
  const delta = row.progress && row.progress.year === c.year ? row.progress.to - row.progress.from : null;
  const focusBlock = !row.focus && limits.focus >= limits.maxFocus ? `Foco em no máximo ${limits.maxFocus} jogadores` : null;
  const sellBlock = !open ? 'Vendas só nas janelas de transferências' : null;
  const promoteBlock = !academy ? null : !open ? 'Promoções só nas janelas' : limits.starters + limits.bench >= limits.maxStarters + limits.maxBench ? 'Elenco cheio (5 titulares + 2 reservas)' : null;
  const renewable = p.contract.years <= 1;
  const teamName = entryOfCard(p.cardId).teamName;

  const position = (value: string) => {
    if (value === 'bench') act((x) => benchPlayer(x, p.id));
    else act((x) => setStarter(x, p.id, value as Slot));
  };

  return (
    <li className={`cr-player${row.status === 'starter' ? ' is-starter' : ''}`}>
      <div className="cr-player-main">
        <PlayerPhoto playerId={row.card.playerId} eventId={row.eventId} handle={row.handle} country={row.card.country} size={48} />
        <div className="cr-who">
          <strong className="cr-handle">{row.handle}</strong>
          <span className="badges">
            {row.slot && row.slot !== row.role && <span className="cr-slot-tag">{SLOT_LABELS[row.slot]}</span>}
            <span className={`badge role-${row.role}`}>{ROLE_LABELS[row.role]}</span>
            {row.isIGL && (
              <span className="badge igl">
                <Icon name="mic" /> IGL
              </span>
            )}
            {row.aura && <span className={`badge aura aura-${row.aura}`}>{AURA_LABELS[row.aura]}</span>}
            {row.prodigy && <span className="badge aura prodigy">Prodígio</span>}
            <span className={`badge cr-phase phase-${row.phase}`}>{row.phaseLabel}</span>
            {row.import && <span className="badge">Importado</span>}
            {row.focus && (
              <span className="badge cr-focus-badge">
                <Icon name="flame" /> Foco
              </span>
            )}
          </span>
          <span className="small muted cr-card-of">
            <TeamLogo teamId={row.teamId} eventId={row.eventId} name={teamName} size={16} /> {teamName} · {row.eventName} · exp. {row.experience}{' '}
            {row.experience === 1 ? 'ano' : 'anos'}
          </span>
        </div>
        <div className="cr-nums">
          <span className="cr-ovr" aria-label={`OVR ${row.ovr}`}>
            {row.ovr}
          </span>
          {delta !== null && (
            <span className={`small cr-delta ${delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'muted'}`} title="Evolução na virada da temporada">
              {delta > 0 ? '▲' : delta < 0 ? '▼' : '='} {signed(delta)}
            </span>
          )}
          <span className="small muted" title="Potencial: teto da evolução">
            POT {row.potential}
          </span>
        </div>
      </div>

      <div className="cr-player-info">
        <span className="cr-info-item cr-morale">
          <span className="cr-k">Moral</span>
          <Meter value={row.morale} label={`Moral de ${row.handle}`} text={moraleText(row.morale)} tone={row.morale >= 70 ? 'good' : row.morale < 40 ? 'bad' : 'neutral'} />
        </span>
        <span className="cr-info-item">
          <span className="cr-k">Contrato</span>
          <span>
            {formatMoney(p.contract.salary)}/temp. · <strong className={p.contract.years <= 1 ? 'cr-warn' : ''}>{contractText(p.contract)}</strong>
          </span>
        </span>
        <span className="cr-info-item">
          <span className="cr-k">Valor</span>
          <span>{formatMoney(row.value)}</span>
        </span>
      </div>
      {p.contract.years <= 0 && c.phase === 'offseason' && (
        <p className="small cr-warn">
          <Icon name="warning" /> Sem contrato: sai quando a liga começar, a não ser que renove.
        </p>
      )}

      <div className="cr-actions">
        {!academy && editable && (
          <label className="board-select cr-pos">
            <span>Posição</span>
            <select value={row.slot ?? 'bench'} onChange={(e) => position(e.target.value)}>
              {SLOTS.map((s) => (
                <option key={s} value={s}>
                  Titular: {SLOT_LABELS[s]}
                </option>
              ))}
              <option value="bench">Reserva</option>
            </select>
          </label>
        )}
        <button
          type="button"
          className={`secondary cr-focus${row.focus ? ' is-on' : ''}`}
          aria-pressed={row.focus}
          disabled={!!focusBlock || c.phase === 'over'}
          aria-describedby={focusBlock ? `${id}-focus` : undefined}
          onClick={() => act((x) => setTrainingFocus(x, p.id, !row.focus))}
        >
          <Icon name="flame" /> Foco de treino
        </button>
        {renewable && !academy && (
          <span className="cr-renew">
            <label className="board-select cr-years">
              <span>Anos</span>
              <select value={years} onChange={(e) => setYears(Number(e.target.value))} disabled={!!row.renewal.block}>
                {range(CONTRACT_YEARS_MIN, CONTRACT_YEARS_MAX).map((n) => (
                  <option key={n} value={n}>
                    +{n}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="secondary"
              disabled={!!row.renewal.block}
              aria-describedby={row.renewal.block ? `${id}-renew` : undefined}
              onClick={() => act((x) => renewContract(x, p.id, years))}
            >
              Renovar · {formatMoney(row.renewal.salary)}/temp.
            </button>
          </span>
        )}
        {academy && (
          <button type="button" className="secondary" disabled={!!promoteBlock} aria-describedby={promoteBlock ? `${id}-promote` : undefined} onClick={() => act((x) => promoteAcademy(x, p.id))}>
            <Icon name="chevron" /> Promover ao elenco
          </button>
        )}
        <button type="button" className="secondary cr-sell" disabled={!!sellBlock} aria-describedby={sellBlock ? `${id}-sell` : undefined} aria-expanded={selling} onClick={() => onSell(p.id)}>
          {row.saleCredit > 0 ? `Vender (+${formatMoney(row.saleCredit)})` : 'Dispensar'}
        </button>
      </div>
      <div className="cr-blocks">
        {focusBlock && <BlockNote id={`${id}-focus`}>{focusBlock}</BlockNote>}
        {renewable && !academy && row.renewal.block && <BlockNote id={`${id}-renew`}>Renovação: {row.renewal.block}</BlockNote>}
        {promoteBlock && <BlockNote id={`${id}-promote`}>{promoteBlock}</BlockNote>}
        {sellBlock && <BlockNote id={`${id}-sell`}>{sellBlock}</BlockNote>}
      </div>
      {selling && (
        <ConfirmBar
          title={`${row.saleCredit > 0 ? 'Vender' : 'Dispensar'} ${row.handle}?`}
          text={
            row.saleCredit > 0
              ? `Entra ${formatMoney(row.saleCredit)} no caixa (metade do valor) e o salário dele sai da folha. O salário já pago não volta.`
              : 'O contrato acabou: ele sai sem gerar dinheiro.'
          }
          confirmLabel={row.saleCredit > 0 ? `Vender ${row.handle}` : `Dispensar ${row.handle}`}
          onConfirm={() => {
            if (act((x) => releasePlayer(x, p.id))) onSell(null);
          }}
          onCancel={() => onSell(null)}
        />
      )}

      {(row.progress || row.history.length > 0) && (
        <details className="cr-details small">
          <summary>Evolução e temporadas</summary>
          {row.progress && (
            <div className="cr-progress">
              <p className="muted">
                Virada para {row.progress.year}: OVR {row.progress.from} → {row.progress.to}
              </p>
              <ul>
                {row.progress.parts.map((part) => (
                  <li key={part.label}>
                    {part.label}: <strong className={part.value > 0 ? 'pos' : part.value < 0 ? 'neg' : ''}>{formatSigned(part.value)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {row.history.length > 0 && (
            <div className="cr-scroll">
              <table className="cr-table">
                <caption className="sr-only">Temporadas de {row.handle}</caption>
                <thead>
                  <tr>
                    <th scope="col">Ano</th>
                    <th scope="col">OVR</th>
                    <th scope="col">Mapas</th>
                    <th scope="col">Rating</th>
                    <th scope="col">ACS</th>
                    <th scope="col">K/D/A</th>
                  </tr>
                </thead>
                <tbody>
                  {row.history.map((h) => (
                    <tr key={h.year}>
                      <th scope="row">{h.year}</th>
                      <td>{h.ovr}</td>
                      <td>
                        {h.maps} ({Math.round(h.share * 100)}%)
                      </td>
                      <td>{h.maps > 0 ? formatDecimal(h.rating, 2) : '—'}</td>
                      <td>{h.maps > 0 ? h.acs : '—'}</td>
                      <td>{h.maps > 0 ? `${h.kills}/${h.deaths}/${h.assists}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      )}
    </li>
  );
}

const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const formatSigned = (n: number): string => (n > 0 ? `+${formatDecimal(n)}` : n < 0 ? `−${formatDecimal(Math.abs(n))}` : '0');

/** The coach slot: the current one (release in the off-season) and the off-season's offers. */
function CoachSection({ c, act }: { c: CareerState; act: PanelProps['act'] }) {
  const coach = careerCoach(c);
  const offers = coachOffers(c);
  const [releasing, setReleasing] = useState(false);
  const offseason = c.phase === 'offseason';
  return (
    <section className="cr-coach" aria-labelledby="cr-coach-title">
      <h3 id="cr-coach-title" className="hub-subtitle">
        Coach
      </h3>
      {coach ? (
        <div className="cr-coach-card">
          <TeamLogo teamId={coach.coach.teamId} eventId={coach.coach.eventId} name={coach.coach.name} size={32} />
          <span className="cr-who">
            <strong>{coach.coach.name}</strong>
            <span className="small muted">
              Tática {coach.coach.tacticBonus}/3 · Veto {coach.coach.vetoBonus}/3 · {formatMoney(coach.salary)}/temp.
            </span>
          </span>
          <button type="button" className="secondary" disabled={!offseason} aria-describedby={!offseason ? 'cr-coach-block' : undefined} onClick={() => setReleasing(true)}>
            Dispensar
          </button>
          {!offseason && <BlockNote id="cr-coach-block">Só na pré-temporada</BlockNote>}
        </div>
      ) : (
        <p className="small muted">Sem coach: a tomada de decisão do time perde força e o veto fica sem leitura do adversário.</p>
      )}
      {releasing && (
        <ConfirmBar
          title="Dispensar o coach?"
          text="Ele sai sem custo e sem reembolso. Você pode contratar outro da lista desta pré-temporada."
          confirmLabel="Dispensar coach"
          onConfirm={() => {
            if (act(releaseCoach)) setReleasing(false);
          }}
          onCancel={() => setReleasing(false)}
        />
      )}
      {offers.length > 0 && (
        <>
          <p className="small muted">Ofertas desta pré-temporada (o salário é pago quando a liga começa):</p>
          <ul className="cr-list cr-coach-offers">
            {offers.map((o) => (
              <li key={o.coach.id} className="cr-coach-card">
                <TeamLogo teamId={o.coach.teamId} eventId={o.coach.eventId} name={o.teamName} size={32} />
                <span className="cr-who">
                  <strong>{o.coach.name}</strong>
                  <span className="small muted">
                    {o.teamName} · {o.eventName} · Tática {o.coach.tacticBonus}/3 · Veto {o.coach.vetoBonus}/3
                  </span>
                  <span className="small">
                    {formatMoney(o.salary)}/temp. · reputação {o.requiredRep}
                  </span>
                </span>
                <button type="button" className="secondary" disabled={!!o.block} aria-describedby={o.block ? `cr-coach-${o.coach.id}` : undefined} onClick={() => act((x) => hireCoach(x, o.coach.id))}>
                  {coach ? 'Trocar' : 'Contratar'}
                </button>
                {o.block && <BlockNote id={`cr-coach-${o.coach.id}`}>{o.block}</BlockNote>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
