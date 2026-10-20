import { useEffect, useRef, useState, type ReactNode } from 'react';
import { embedSrc, type AceEmbed } from '../../../game/aces';
import { Icon } from '../../components/Icon';

/**
 * The click-to-load player of "Acerte o ace" (docs/aces.md, "Player"). Before the click it is only our own neutral
 * poster (no YouTube thumbnail, title or channel, nothing loaded from YouTube). On click it loads the YouTube IFrame
 * Player API, then the youtube-nocookie iframe from `embedSrc` (+ enablejsapi so the API can listen), and wraps it
 * to hear `onError`: 100 (removed or private), 101/150 (the owner does not allow embedding) and 2 (bad id) switch to
 * a fallback with a link to YouTube and report the ace as unavailable. YouTube's player UI is never covered.
 * If the API script cannot load (blocked), the iframe still loads after API_WAIT_MS, just without the listener.
 */

interface YTPlayerEvent {
  data: number;
}

interface YTNamespace {
  Player: new (el: HTMLIFrameElement, opts: { events: { onError?: (e: YTPlayerEvent) => void } }) => unknown;
}

declare global {
  interface Window {
    YT?: Partial<YTNamespace>;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export const IFRAME_API_SRC = 'https://www.youtube.com/iframe_api';
/** Errors after which the video cannot play here (YouTube IFrame API `onError` codes). */
export const FATAL_ERRORS: ReadonlySet<number> = new Set([2, 100, 101, 150]);
/** How long the iframe waits for the API before loading without it. */
const API_WAIT_MS = 4000;

let apiPromise: Promise<YTNamespace> | null = null;

function loadYouTubeApi(): Promise<YTNamespace> {
  const ready = (): YTNamespace | null => (window.YT && typeof window.YT.Player === 'function' ? (window.YT as YTNamespace) : null);
  const now = ready();
  if (now) return Promise.resolve(now);
  apiPromise ??= new Promise<YTNamespace>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      const yt = ready();
      if (yt) resolve(yt);
    };
    const s = document.createElement('script');
    s.src = IFRAME_API_SRC;
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      s.remove();
      reject(new Error('YouTube IFrame API unavailable'));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

/** The video on YouTube (for the fallback): only the id and the verified start, never the title. */
export function youtubeWatchUrl(e: AceEmbed): string {
  return `https://www.youtube.com/watch?v=${e.videoId}${e.start ? `&t=${e.start}s` : ''}`;
}

type Phase = 'idle' | 'loading' | 'on' | 'error';

export function AcePlayer({
  embed,
  kicker,
  onUnavailable,
  extra,
}: {
  embed: AceEmbed;
  /** "Diário #20" / "Modo livre": the poster's only text besides the button. */
  kicker: string;
  /** The player refused the video (fatal error): the screen marks the ace unavailable. */
  onUnavailable: (code: number) => void;
  /** Shown under the fallback (e.g. "Sortear outro ace" in free mode). */
  extra?: ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [api, setApi] = useState<YTNamespace | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const attached = useRef(false);
  const alive = useRef(true);
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const start = () => {
    if (phase !== 'idle') return;
    setPhase('loading');
    const show = () => alive.current && setPhase((p) => (p === 'loading' ? 'on' : p));
    const timer = window.setTimeout(show, API_WAIT_MS);
    loadYouTubeApi()
      .then((yt) => {
        if (!alive.current) return;
        setApi(yt);
        window.clearTimeout(timer);
        show();
      })
      .catch(() => {
        window.clearTimeout(timer);
        show();
      });
  };

  // Wrap our own iframe once both exist (the API may arrive after the timeout: it still attaches then).
  useEffect(() => {
    if (phase !== 'on' || !api || !frameRef.current || attached.current) return;
    attached.current = true;
    try {
      new api.Player(frameRef.current, {
        events: {
          onError: (e) => {
            if (!alive.current || !FATAL_ERRORS.has(e.data)) return;
            setPhase('error');
            onUnavailableRef.current(e.data);
          },
        },
      });
    } catch {
      // The video still plays; only the error listener is missing.
    }
  }, [phase, api]);

  if (phase === 'error') {
    return (
      <div className="ace-stage ace-fallback" role="alert">
        <Icon name="warning" />
        <p>
          Este vídeo não pode ser exibido aqui —{' '}
          <a href={youtubeWatchUrl(embed)} target="_blank" rel="noopener noreferrer">
            Abrir no YouTube
          </a>
        </p>
        <p className="small muted">O dono do vídeo não permite que ele seja embutido (ou o vídeo saiu do ar). Assista no YouTube e volte para chutar.</p>
        {extra}
      </div>
    );
  }

  if (phase === 'on') {
    const origin = typeof window !== 'undefined' ? `&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}` : '';
    return (
      <div className="ace-stage ace-frame">
        <iframe
          ref={frameRef}
          src={`${embedSrc(embed)}${origin}`}
          title="Vídeo do ace"
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <button type="button" className="ace-stage ace-poster" onClick={start} disabled={phase === 'loading'} aria-busy={phase === 'loading'}>
      <span className="ace-poster-kicker">{kicker}</span>
      <span className="ace-poster-play" aria-hidden="true">
        <Icon name="play" />
      </span>
      <span className="ace-poster-label">{phase === 'loading' ? 'Carregando o player…' : 'Assistir ao ace'}</span>
      <span className="ace-poster-note small">Vídeo do YouTube: só carrega depois do clique</span>
    </button>
  );
}
