import type { CSSProperties } from 'react';
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, ROLE_LABELS, flagEmoji } from '../../game/explain';
import { rosterOf } from '../../game/run';
import type { Card } from '../../engine/types';
import { AgentIcon } from './GameImage';
import { Icon } from './Icon';

interface Props {
  card: Card;
  selected?: boolean;
  onSelect?: () => void;
  /** Position in a dealt hand, for the staggered entrance. */
  index?: number;
}

/** A player card: handle, origin, roster, role, OVR, attributes and agents. Clickable when onSelect is set. */
export function PlayerCard({ card, selected = false, onSelect, index = 0 }: Props) {
  const roster = rosterOf(card.teamId, card.eventId);
  const body = (
    <>
      <span className="card-head">
        <span className="card-name">
          <strong>{card.handle}</strong>
          <span className="muted">
            {' '}
            {flagEmoji(card.country)} {card.country}
          </span>
        </span>
        <span className="ovr" aria-label={`OVR ${card.ovr}`}>
          {card.ovr}
        </span>
      </span>
      <span className="card-roster muted">
        {roster ? `${roster.teamName} · ${roster.eventName}` : `${card.teamId} · ${card.eventId}`}
      </span>
      <span className="badges">
        <span className={`badge role-${card.role}`}>{ROLE_LABELS[card.role]}</span>
        {card.isIGL && <span className="badge igl">IGL</span>}
      </span>
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
      <span className="agents">
        {card.agents.map((a) => (
          <AgentIcon key={a} name={a} />
        ))}
      </span>
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
