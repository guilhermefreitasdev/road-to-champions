import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Height of one reel item, px (kept in sync with .reel-item in styles.css). */
export const REEL_ITEM = 44;

export interface ReelEntry {
  key: string;
  label: string;
  icon?: ReactNode;
}

interface Props {
  /** "Time", "Época". */
  label: string;
  tone: 'red' | 'violet';
  /** The strip; the last entry is the result. */
  entries: readonly ReelEntry[];
  /** True while this reel spins (the strip scrolls to the last entry); false = show the result at once. */
  spinning: boolean;
  /** Spin duration, ms. */
  duration: number;
  /** Changes on every roll, so the strip restarts from the top. */
  spinKey: string;
  /** The reel stopped on the result (not called when it is shown without a spin). */
  onLocked?: () => void;
  /** Nothing rolled yet: an idle "?" window. */
  idle?: boolean;
}

/**
 * One slot-machine reel: a framed window over a vertical strip. Spinning scrolls the strip with an ease-out until the
 * last entry (the result, already decided by the engine) sits on the center line, then flashes once. The items above
 * and below the line stay visible, blurred by the window's masks. Presentation only.
 */
export function Reel({ label, tone, entries, spinning, duration, spinKey, onLocked, idle }: Props) {
  const last = entries.length - 1;
  const [phase, setPhase] = useState<'start' | 'moving' | 'locked'>(spinning ? 'start' : 'locked');
  const [flash, setFlash] = useState(false);
  const locked = useRef(onLocked);
  useEffect(() => {
    locked.current = onLocked;
  });

  // New roll: jump to the top without a transition, then (next frame) scroll to the result.
  useLayoutEffect(() => {
    if (!spinning) {
      setPhase('locked');
      return;
    }
    setPhase('start');
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPhase('moving'));
    });
    const t = window.setTimeout(() => {
      setPhase('locked');
      setFlash(true);
      locked.current?.();
    }, duration + 40);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(t);
    };
  }, [spinKey, spinning, duration]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(false), 450);
    return () => window.clearTimeout(t);
  }, [flash]);

  // The center row is the second of three visible rows.
  const index = phase === 'start' ? 0 : last;
  const y = -(index - 1) * REEL_ITEM;
  const result = entries[last];

  return (
    <div className={`reel tone-${tone}${phase === 'moving' ? ' is-spinning' : ''}${flash ? ' is-flash' : ''}${idle ? ' is-idle' : ''}`}>
      <span className="reel-label">{label}</span>
      <div className="reel-window">
        {idle ? (
          <div className="reel-strip" style={{ transform: `translateY(${REEL_ITEM}px)` }}>
            <div className="reel-item idle">?</div>
          </div>
        ) : (
          <div
            className="reel-strip"
            aria-hidden="true"
            style={{
              transform: `translateY(${y}px)`,
              transition: phase === 'moving' ? `transform ${duration}ms cubic-bezier(0.12, 0.72, 0.18, 1)` : 'none',
            }}
          >
            {entries.map((e, i) => (
              <div key={`${e.key}-${i}`} className={`reel-item${i === last && phase === 'locked' ? ' is-result' : ''}`}>
                {e.icon}
                <span className="reel-text">{e.label}</span>
              </div>
            ))}
          </div>
        )}
        <span className="reel-line" aria-hidden="true" />
      </div>
      {!idle && result && <span className="sr-only">{`${label}: ${result.label}`}</span>}
    </div>
  );
}
