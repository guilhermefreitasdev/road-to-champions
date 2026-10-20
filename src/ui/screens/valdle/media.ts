import { useEffect, useState } from 'react';
import { gameMediaCandidates, gameMediaCandidatesNow, type GameMediaKind } from '../../../data/gameMedia';

/** The URLs to try for a remote image (local copy first, src/data/gameMedia.ts), loading the inline chunk if needed. */
function useCandidates(kind: GameMediaKind, remote: string | null): string[] | null {
  const now = gameMediaCandidatesNow(kind, remote);
  const [loaded, setLoaded] = useState<{ remote: string | null; list: string[] } | null>(null);
  useEffect(() => {
    if (now) return;
    let live = true;
    void gameMediaCandidates(kind, remote).then((list) => live && setLoaded({ remote, list }));
    return () => {
      live = false;
    };
  }, [kind, remote, now]);
  return now ?? (loaded?.remote === remote ? loaded.list : null);
}

/**
 * An image of the Valdle with fallbacks: `src` is the best candidate not yet failed (local copy, then remote); call
 * `onError` when it fails to move to the next one. `failed` once none is left; `src` null while loading the list.
 */
export function useGameMedia(kind: GameMediaKind, remote: string | null): { src: string | null; failed: boolean; onError: () => void } {
  const list = useCandidates(kind, remote);
  const [miss, setMiss] = useState<{ key: string | null; n: number }>({ key: remote, n: 0 });
  const n = miss.key === remote ? miss.n : 0;
  const failed = list !== null && n >= list.length;
  return {
    src: list && !failed ? list[n]! : null,
    failed,
    onError: () => setMiss({ key: remote, n: n + 1 }),
  };
}

/** How long a minimap may take before the game gives up on it and draws the schema instead. */
const MINIMAP_TIMEOUT_MS = 6000;

export type MinimapState = { status: 'loading' } | { status: 'ready'; src: string } | { status: 'failed' };

/**
 * The real minimap of a map (valorant-api.com `displayIcon`): the local copy when there is one, else the remote URL.
 * Each candidate is decoded before it is shown, so the board knows whether to draw the minimap or fall back to the
 * schema; a candidate that errors or takes longer than MINIMAP_TIMEOUT_MS is skipped.
 */
export function useMinimap(remote: string): MinimapState {
  const media = useGameMedia('minimaps', remote);
  const [ready, setReady] = useState<string | null>(null);
  const { src, onError } = media;
  useEffect(() => {
    if (!src) return;
    let live = true;
    const img = new Image();
    const timer = window.setTimeout(() => live && onError(), MINIMAP_TIMEOUT_MS);
    img.onload = () => {
      window.clearTimeout(timer);
      if (live) setReady(src);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      if (live) onError();
    };
    img.src = src;
    return () => {
      live = false;
      window.clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
    };
    // onError changes identity every render; the effect only depends on the candidate being tried.
  }, [src]);
  if (media.failed) return { status: 'failed' };
  if (src && ready === src) return { status: 'ready', src };
  return { status: 'loading' };
}

/** How long a hidden photo may take before the game plays on without it. */
const PHOTO_TIMEOUT_MS = 8000;

export interface DecodedPhoto {
  source: CanvasImageSource;
  width: number;
  height: number;
}

export type HiddenPhotoState = { status: 'loading' } | { status: 'ready'; image: DecodedPhoto } | { status: 'failed' };

/**
 * A photo the page must not name before the end ("Pelo cabelo"): fetched (from public/, or the inlined data URL of
 * the preview build) into a blob and decoded off-DOM (an ImageBitmap; else an Image on a blob URL revoked at once). The caller draws only part of it
 * on a canvas, so no element of the page carries its file name (which names the player) or its hidden part.
 */
export function useHiddenPhoto(url: string | null): HiddenPhotoState {
  const [state, setState] = useState<{ url: string | null; s: HiddenPhotoState }>({ url, s: { status: 'loading' } });
  useEffect(() => {
    if (!url) return;
    let live = true;
    const timer = window.setTimeout(() => live && setState({ url, s: { status: 'failed' } }), PHOTO_TIMEOUT_MS);
    const done = (s: HiddenPhotoState) => {
      window.clearTimeout(timer);
      if (live) setState({ url, s });
    };
    void (async () => {
      let objectUrl: string | null = null;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (typeof createImageBitmap === 'function') {
          const bmp = await createImageBitmap(blob);
          done({ status: 'ready', image: { source: bmp, width: bmp.width, height: bmp.height } });
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.src = objectUrl;
        await img.decode();
        done({ status: 'ready', image: { source: img, width: img.naturalWidth, height: img.naturalHeight } });
      } catch {
        done({ status: 'failed' });
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      }
    })();
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [url]);
  if (!url) return { status: 'failed' };
  return state.url === url ? state.s : { status: 'loading' };
}
