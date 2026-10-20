import { useState } from 'react';
import { ACADEMY_CONTRACT_YEARS, ACADEMY_SALARY, careerRoster, prospectOffers, rosterLimits, signProspect } from '../../../game/career';
import { ROLE_LABELS, formatMoney } from '../../../game/explain';
import { Icon } from '../../components/Icon';
import { PlayerPhoto } from '../../components/PlayerPhoto';
import { PlayerItem } from './RosterPanel';
import { BlockNote, Empty, type PanelProps } from './shared';

/** Base: the academy (3 slots, cheap, +1 growth a season) and the off-season's prospects. */
export function AcademyPanel({ c, act }: PanelProps) {
  const academy = careerRoster(c).filter((r) => r.status === 'academy');
  const limits = rosterLimits(c);
  const prospects = prospectOffers(c);
  const [selling, setSelling] = useState<string | null>(null);
  const editable = !c.veto && c.phase !== 'over';

  return (
    <div className="cr-panel">
      <p className="small muted measure">
        A base tem {limits.maxAcademy} vagas. Prospectos jogam o Challengers: crescem +1 por temporada a mais que no elenco (sem
        precisar de tempo de jogo) e +1 com foco de treino, até o potencial. Custam {formatMoney(ACADEMY_SALARY)} por temporada,
        contrato de {ACADEMY_CONTRACT_YEARS}. Promova numa janela quando ele alcançar o time.
      </p>
      <h3 className="hub-subtitle">
        Sua base ({limits.academy}/{limits.maxAcademy})
      </h3>
      {academy.length > 0 ? (
        <ul className="cr-list">
          {academy.map((row) => (
            <PlayerItem key={row.player.id} row={row} c={c} act={act} editable={editable} selling={selling === row.player.id} onSell={setSelling} />
          ))}
        </ul>
      ) : (
        <p className="small muted">Ninguém na base ainda.</p>
      )}

      <h3 className="hub-subtitle">Prospectos desta pré-temporada</h3>
      {c.phase !== 'offseason' ? (
        <Empty>Os prospectos aparecem na pré-temporada.</Empty>
      ) : prospects.length === 0 ? (
        <Empty>Nenhum prospecto disponível.</Empty>
      ) : (
        <ul className="cr-list">
          {prospects.map((p) => {
            const id = `cr-prospect-${p.playerId}`;
            const room = Math.max(0, p.potential - p.ovr);
            return (
              <li key={p.playerId} className="cr-offer">
                <PlayerPhoto playerId={p.card.playerId} eventId={p.card.eventId} handle={p.handle} country={p.card.country} size={44} />
                <span className="cr-who">
                  <strong className="cr-handle">{p.handle}</strong>
                  <span className="badges">
                    <span className={`badge role-${p.role}`}>{ROLE_LABELS[p.role]}</span>
                    {p.prodigy && <span className="badge aura prodigy">Prodígio</span>}
                  </span>
                  <span className="small muted">
                    {p.teamName} · {p.eventName} · exp. {p.experience}
                  </span>
                  <span className="small cr-hint">
                    <Icon name="chevron" /> Margem de {room} até o potencial
                    {room > 0 ? `: ~${Math.max(1, Math.ceil(room / 3))} temporada${Math.ceil(room / 3) > 1 ? 's' : ''} na base` : ''}
                  </span>
                </span>
                <span className="cr-nums">
                  <span className="cr-ovr">{p.ovr}</span>
                  <span className="small muted">POT {p.potential}</span>
                </span>
                <button type="button" className="secondary cr-offer-btn" disabled={!!p.block} aria-describedby={p.block ? id : undefined} onClick={() => act((x) => signProspect(x, p.playerId))}>
                  Levar para a base
                </button>
                {p.block && <BlockNote id={id}>{p.block}</BlockNote>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
