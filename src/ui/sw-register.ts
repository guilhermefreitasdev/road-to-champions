/**
 * Registers the service worker (public sw.js, generated at build time by the `pwa` plugin in vite.config.ts) for
 * the offline, installable app. Only in production builds, and never in the claude.ai preview build
 * (VITE_INLINE_PLAYER_PHOTOS=1): the artifact sandbox does not allow service workers, and that build ships no sw.js.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || import.meta.env.VITE_INLINE_PLAYER_PHOTOS === '1') return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {
      // Blocked (private mode, sandboxed frame, file://): the game works the same, just not offline.
    });
  };
  // After the page has loaded, so the precache never competes with the first render.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
