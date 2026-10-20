import { NO_IGL_CAP, NO_IGL_FACTOR } from '../../engine/team';
import type { Card } from '../../engine/types';
import { Icon } from './Icon';

/** "sem IGL a Tomada de decisão cai 25% (máx. 55)", from the engine's constants. */
export const NO_IGL_TEXT = `sem IGL a Tomada de decisão cai ${Math.round((1 - NO_IGL_FACTOR) * 100)}% (máx. ${NO_IGL_CAP})`;

interface Props {
  /** Cards already in the lineup. */
  picked: readonly (Card | undefined)[];
  /** Picks still to make (0 once the five are in). */
  left: number;
  /** IGLs among the cards on offer right now. */
  offered?: number;
  /** The card about to be picked, if any. */
  selected?: Card;
}

/**
 * Live IGL check for the draft: warns while no IGL is in the lineup (stronger on the last pick and once the five are
 * in), says when the current options include one, and confirms when the selected card fixes it.
 */
export function IglNotice({ picked, left, offered = 0, selected }: Props) {
  const igl = picked.find((c) => c?.isIGL);
  if (igl) {
    return (
      <p className="igl-notice ok" role="status">
        <Icon name="mic" />
        <span>
          <strong>IGL: {igl.handle}.</strong> Ele faz as calls do time.
        </span>
      </p>
    );
  }
  if (picked.length === 0 && !selected) return null;
  if (selected?.isIGL) {
    return (
      <p className="igl-notice ok" role="status">
        <Icon name="mic" />
        <span>
          <strong>{selected.handle} é IGL:</strong> com ele o time não perde Tomada de decisão.
        </span>
      </p>
    );
  }
  const urgent = left <= 1;
  return (
    <p className={`igl-notice warn${urgent ? ' urgent' : ''}`} role="status">
      <Icon name="warning" />
      <span>
        <strong>{left === 0 ? 'Seu time não tem IGL' : 'Nenhum IGL ainda'}:</strong> {NO_IGL_TEXT}.
        {left === 1 && ' Último pick.'}
        {left > 0 && offered > 0 && (
          <>
            {' '}
            {offered === 1 ? 'Há 1 IGL' : `Há ${offered} IGLs`} nesta escolha (selo <span className="badge igl inline">IGL</span>).
          </>
        )}
      </span>
    </p>
  );
}
