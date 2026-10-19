import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function matches(): boolean {
  try {
    return window.matchMedia(QUERY).matches;
  } catch {
    return false;
  }
}

/** True when the user asked the OS for less motion; reveals and celebrations are skipped then. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(matches);
  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia(QUERY);
    } catch {
      return;
    }
    const onChange = () => setReduced(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
