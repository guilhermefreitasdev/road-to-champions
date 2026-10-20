import type { CSSProperties } from 'react';
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  AURA_LABELS,
  FLEX_HELP,
  IGL_SOURCE_LABELS,
  PRODIGY_HELP,
  ROLE_LABELS,
  auraTitle,
  formatStat,
} from '../../game/explain';
import { ALL_ROSTERS } from '../../data/real';
import type { Card } from '../../engine/types';
import { flexRolesText, isNaturalFlex } from '../fit';
import { AgentPoolChips } from './AgentPool';
import { CountryChip } from './CountryChip';
import { AgentIcon } from './GameImage';
import { Icon } from './Icon';
import { PlayerPhoto } from './PlayerPhoto';
import { TeamLogo } from './TeamLogo';

interface Props {
  card: Card;
  selected?: boolean;
  onSelect?: () => void;
  /** Position in a dealt hand, for the staggered entrance. */
  index?: number;
}

/**
 * A player card: handle, origin, roster, role (from the agents played at that event), IGL, OVR, the real event
 * stats it came from, attributes and agents. Clickable when onSelect is set.
 */
export function PlayerCard({ card, selected = false, onSelect, index = 0 }: Props) {
  const roster = ALL_ROSTERS.find((e) => e.teamId === card.teamId && e.eventId === card.eventId);
  const stats = card.stats;
  const body = (
    <>
      <span className="card-head">
        <PlayerPhoto playerId={card.playerId} eventId={card.eventId} handle={card.handle} country={card.country} size={44} />
        <span className="card-name">
          <strong>{card.handle}</strong>
          {card.country && (
            <>
              {' '}
              <CountryChip code={card.country} />
            </>
          )}
        </span>
        <span className="ovr" aria-label={`OVR ${card.ovr}`}>
          {card.ovr}
        </span>
      </span>
      <span className="card-roster muted">
        <TeamLogo teamId={card.teamId} eventId={card.eventId} name={roster?.teamName ?? card.teamId} size={18} />
        {roster ? `${roster.teamName} · ${roster.eventName}` : `${card.teamId} · ${card.eventId}`}
      </span>
      <span className="badges">
        <span className={`badge role-${card.role}`} title="Função pelos agentes que jogou neste evento">
          {ROLE_LABELS[card.role]}
        </span>
        {card.isIGL && (
          <span className="badge igl" title={`IGL: faz as calls do time (fonte: ${IGL_SOURCE_LABELS[card.iglSource ?? ''] ?? 'Liquipedia'})`}>
            <Icon name="mic" /> IGL
          </span>
        )}
        {isNaturalFlex(card) && (
          <span className="badge flex-nato" title={`Jogou ${flexRolesText(card)}. ${FLEX_HELP}`}>
            <Icon name="swap" /> Flex nato
          </span>
        )}
        {card.prodigy ? (
          <span className="badge aura prodigy" title={PRODIGY_HELP}>
            Prodígio
          </span>
        ) : (
          card.aura && (
            <span className={`badge aura aura-${card.aura}`} title={auraTitle(card)}>
              {AURA_LABELS[card.aura]}
            </span>
          )
        )}
      </span>
      {stats && (
        <span className="card-stats" title="Stats reais do jogador neste evento (VLR.gg)">
          <span>
            Rating <strong>{formatStat(stats.rating, 2)}</strong>
          </span>
          <span>
            ACS <strong>{formatStat(stats.acs)}</strong>
          </span>
          <span>
            KAST <strong>{stats.kast === null ? '—' : `${stats.kast}%`}</strong>
          </span>
          <span>{stats.rounds} rounds</span>
        </span>
      )}
      <span className="attrs">
        {ATTRIBUTE_KEYS.map((k) => (
          <span key={k} className="attr">
            <span className="attr-label">{ATTRIBUTE_LABELS[k]}</span>
            <span className="attr-value">{card.attrs[k]}</span>
            <span className="attr-bar" aria-hidden="true">
              <span style={{ width: `${card.attrs[k]}%` }} />
            </span>
          </span>
        ))}
      </span>
      {card.agentPool && card.agentPool.length > 0 ? (
        <AgentPoolChips pool={card.agentPool} />
      ) : (
        <span className="agents">
          {card.agents.map((a) => (
            <AgentIcon key={a} name={a} />
          ))}
        </span>
      )}
    </>
  );

  if (!onSelect) return <div className="player-card">{body}</div>;
  return (
    <button
      type="button"
      className={`player-card selectable${selected ? ' selected' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
      style={{ '--i': index } as CSSProperties}
    >
      {selected && (
        <span className="selected-tag">
          <Icon name="check" />
          Escolhido
        </span>
      )}
      {body}
    </button>
  );
}
