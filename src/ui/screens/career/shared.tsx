import type { ReactNode } from 'react';
import type { CareerState } from '../../../game/career';
import { Icon } from '../../components/Icon';

/**
 * What every career panel gets: the career and the action runner (saves; shows the engine's error, or `success`, in
 * the toast fixed in the viewport; false on refusal).
 */
export interface PanelProps {
  c: CareerState;
  act: (fn: (c: CareerState) => CareerState, success?: string | ((next: CareerState) => string)) => boolean;
}

/** Why an action is not available now: lock icon + the engine's pt-BR reason (never color alone). */
export function BlockNote({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <span id={id} className="cr-block small">
      <Icon name="lock" /> {children}
    </span>
  );
}

/** A 0–100 meter (morale, reputation) with the number and a word next to it. */
export function Meter({ value, label, text, tone }: { value: number; label: string; text?: string; tone?: 'good' | 'bad' | 'neutral' }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span className={`cr-meter${tone ? ` ${tone}` : ''}`}>
      <span className="cr-meter-bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-valuetext={text ? `${v}, ${text}` : String(v)}>
        <span className="cr-meter-fill" style={{ width: `${v}%` }} />
      </span>
      <span className="cr-meter-num">{v}</span>
      {text && <span className="cr-meter-text small muted">{text}</span>}
    </span>
  );
}

/** Empty state of a panel. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty-state">{children}</p>;
}
