import { useSyncExternalStore } from 'react';

const QUERY = '(min-width: 1024px)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

const snapshot = () => typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches;

/** True on desktop widths (≥ 1024px, the same breakpoint as the CSS): brackets get roomier columns. */
export function useWide(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
