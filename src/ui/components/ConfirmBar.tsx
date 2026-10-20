import { useEffect, useId, useRef } from 'react';
import { Icon } from './Icon';

interface Props {
  title: string;
  text: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * In-page confirmation for a destructive action (no window.confirm): focus lands on "Cancelar", Escape cancels,
 * and the destructive button says exactly what it does.
 */
export function ConfirmBar({ title, text, confirmLabel, onConfirm, onCancel }: Props) {
  const id = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const cancel = useRef(onCancel);
  useEffect(() => {
    cancel.current = onCancel;
  });
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <section className="confirm-bar" role="alertdialog" aria-modal="false" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`}>
      <Icon name="warning" className="confirm-icon" />
      <div className="confirm-text">
        <h2 id={`${id}-t`}>{title}</h2>
        <p id={`${id}-d`}>{text}</p>
      </div>
      <div className="confirm-actions">
        <button type="button" className="secondary" ref={cancelRef} onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </section>
  );
}
