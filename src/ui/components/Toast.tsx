import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export interface ToastMessage {
  /** New id = new message (restarts the timer even when the text repeats). */
  id: number;
  kind: 'error' | 'success';
  text: string;
}

/** How long a message stays: errors longer, so there is time to read the reason. Paused while hovered or focused. */
export const TOAST_MS = { success: 4000, error: 9000 } as const;

/**
 * Action feedback that is visible wherever the page is scrolled: a fixed card at the top of the viewport. Two live
 * regions stay mounted (polite for successes, assertive for errors) so screen readers announce every new message;
 * it closes on its own (TOAST_MS), with the close button or Esc.
 */
export function Toast({ toast, onClose }: { toast: ToastMessage | null; onClose: () => void }) {
  const [paused, setPaused] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!toast || paused) return;
    const timer = window.setTimeout(() => closeRef.current(), TOAST_MS[toast.kind]);
    return () => window.clearTimeout(timer);
  }, [toast, paused]);

  useEffect(() => {
    if (!toast) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toast]);

  useEffect(() => setPaused(false), [toast?.id]);

  const card = toast && (
    <div
      key={toast.id}
      className={`toast toast-${toast.kind}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon name={toast.kind === 'error' ? 'warning' : 'check'} className="toast-icon" />
      <p className="toast-text">
        {toast.kind === 'error' && <strong>Não foi possível. </strong>}
        {toast.text}
      </p>
      <button type="button" className="toast-close" onClick={onClose} aria-label="Fechar aviso">
        <Icon name="close" />
      </button>
    </div>
  );

  return (
    <div className="toast-region">
      <div role="status" aria-live="polite" aria-atomic="true">
        {toast?.kind === 'success' ? card : null}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true">
        {toast?.kind === 'error' ? card : null}
      </div>
    </div>
  );
}
