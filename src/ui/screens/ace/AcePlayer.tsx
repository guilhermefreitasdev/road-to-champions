import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PLAYER_HOST, embedPlayerVars, embedSrc, type AceEmbed } from '../../../game/aces';
import { Icon } from '../../components/Icon';

/**
 * The click-to-load player of "Acerte o ace" (docs/aces.md, "Player"). Before the click it is only our own neutral
 * poster (no YouTube thumbnail, title or channel, nothing loaded from YouTube). On click it loads the YouTube IFrame
 * Player API and builds the player on youtube-nocookie with `embedPlayerVars` (no native controls, keyboard,
 * fullscreen, annotations or captions) and plays at once; our own control bar sits BELOW the player (never over it).
 *
 * YouTube shows the video title (which may name the pro) mostly while the player is paused, ended or not started.
 * We never cover or mask the player (YouTube's API policies forbid it); instead, whenever it pauses, ends or errors,
 * the player is destroyed and our neutral poster takes its place ("Continuar de m:ss" / "Assistir de novo"), and
 * resuming builds a new player at the saved second. If the browser blocks autoplay with sound, it plays muted and the
 * bar offers "Ativar som". Errors 2/100/101/150 switch to a fallback with a link to YouTube and report the ace as
 * unavailable. If the API cannot load (blocked), the plain iframe from `embedSrc` (native controls) loads after
 * API_WAIT_MS instead.
 */

interface YTPlayer {
  playVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  mute(): void;
  unMute(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getIframe(): HTMLIFrameElement;
  destroy(): void;
}

interface YTPlayerEvent {
  data: number;
}

interface YTPlayerOptions {
  host?: string;
  videoId?: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number>;
  events: {
    onReady?: () => void;
    onStateChange?: (e: YTPlayerEvent) => void;
    onError?: (e: YTPlayerEvent) => void;
    onAutoplayBlocked?: () => void;
  };
}

interface YTNamespace {
  Player: new (el: HTMLElement, opts: YTPlayerOptions) => YTPlayer;
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
/** How long the click waits for the API before loading the plain iframe without it. */
const API_WAIT_MS = 4000;
/** Still not playing this long after onReady: autoplay with sound was blocked, so play muted. */
const AUTOPLAY_WAIT_MS = 2500;
const BACK_SECONDS = 5;
const FRAME_TITLE = 'Vídeo do ace';

/** YT.PlayerState */
const ENDED = 0;
const PLAYING = 1;
const PAUSED = 2;
const BUFFERING = 3;

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

/** 75 → "1:15". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * idle: poster, nothing loaded · loading: waiting for the API · live: the API player exists · paused / ended: the
 * player was destroyed, poster with resume · raw: plain iframe (API unavailable) · error: fallback.
 */
type Phase = 'idle' | 'loading' | 'live' | 'paused' | 'ended' | 'raw' | 'error';

const call = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

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
  const startAt = embed.start ?? 0;
  const [phase, setPhase] = useState<Phase>('idle');
  const [api, setApi] = useState<YTNamespace | null>(null);
  const [resumeAt, setResumeAt] = useState(startAt);
  const [time, setTimeState] = useState(startAt);
  const [duration, setDurationState] = useState(0);
  const [ytState, setYtState] = useState(-1);
  const [muted, setMuted] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);

  const hostRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const resumeRef = useRef(startAt);
  const mutedRef = useRef(false);
  const timeRef = useRef(startAt);
  const durationRef = useRef(0);
  const rawAttached = useRef(false);
  const alive = useRef(true);
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const setTime = (t: number) => {
    timeRef.current = t;
    setTimeState(t);
  };
  const setDuration = (d: number) => {
    if (!(d > 0)) return;
    durationRef.current = d;
    setDurationState(d);
  };

  const end = (d: number): number => (embed.end && (!d || embed.end < d) ? embed.end : d);

  /** Removes the player (not hides it): what stays on screen is our poster. */
  const destroyPlayer = (): number | null => {
    const p = playerRef.current;
    if (!p) return null;
    playerRef.current = null;
    const t = call(() => p.getCurrentTime(), NaN);
    call(() => p.destroy(), undefined);
    hostRef.current?.replaceChildren();
    return Number.isFinite(t) ? t : null;
  };

  const stop = (kind: 'paused' | 'ended') => {
    const t = destroyPlayer() ?? timeRef.current;
    const at = kind === 'ended' ? startAt : Math.max(startAt, t);
    resumeRef.current = at;
    setResumeAt(at);
    setTime(kind === 'ended' ? end(durationRef.current) || t : at);
    setYtState(-1);
    setPhase(kind);
  };

  const fail = (code: number) => {
    destroyPlayer();
    setPhase('error');
    onUnavailableRef.current(code);
  };

  /** Builds (or rebuilds) the player at `from` seconds; the first time it loads the API. */
  const play = (from: number) => {
    resumeRef.current = from;
    setResumeAt(from);
    setTime(from);
    if (api) {
      setPhase('live');
      return;
    }
    setPhase('loading');
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled || !alive.current) return;
      settled = true;
      setPhase('raw');
    }, API_WAIT_MS);
    loadYouTubeApi()
      .then((yt) => {
        if (!alive.current) return;
        window.clearTimeout(timer);
        setApi(yt);
        if (settled) return; // the plain iframe is already up: the API only listens for errors there
        settled = true;
        setPhase('live');
      })
      .catch(() => {
        window.clearTimeout(timer);
        if (settled || !alive.current) return;
        settled = true;
        setPhase('raw');
      });
  };

  // Build the API player when going live; tear it down on leaving (pause/end/error destroy it first).
  useEffect(() => {
    if (phase !== 'live' || !api || !hostRef.current) return;
    const host = hostRef.current;
    const el = document.createElement('div');
    host.replaceChildren(el);
    let player: YTPlayer | null = null;
    let started = false;
    let blockTimer = 0;
    const current = () => player !== null && playerRef.current === player;
    const neutralTitle = () => {
      // The API may name the iframe after the video; keep the accessible name neutral (nothing visual changes).
      const f = player && call(() => player!.getIframe(), null);
      if (f && f.getAttribute('title') !== FRAME_TITLE) f.setAttribute('title', FRAME_TITLE);
    };
    const playMuted = () => {
      if (!current() || mutedRef.current) return;
      call(() => player!.mute(), undefined);
      call(() => player!.playVideo(), undefined);
      mutedRef.current = true;
      setMuted(true);
      setSoundBlocked(true);
    };
    try {
      player = new api.Player(el, {
        host: PLAYER_HOST,
        videoId: embed.videoId,
        width: '100%',
        height: '100%',
        playerVars: { ...embedPlayerVars(embed, resumeRef.current), origin: window.location.origin },
        events: {
          onReady: () => {
            if (!current()) return;
            neutralTitle();
            if (mutedRef.current) call(() => player!.mute(), undefined);
            call(() => player!.playVideo(), undefined);
            setDuration(call(() => player!.getDuration(), 0));
            blockTimer = window.setTimeout(() => {
              const s = current() ? call(() => player!.getPlayerState(), -1) : PLAYING;
              if (!started && s !== PLAYING && s !== BUFFERING) playMuted();
            }, AUTOPLAY_WAIT_MS);
          },
          onAutoplayBlocked: playMuted,
          onStateChange: (e) => {
            if (!current()) return;
            neutralTitle();
            setYtState(e.data);
            if (e.data === PLAYING) started = true;
            else if (e.data === ENDED) stop('ended');
            // A pause before it ever played is the browser refusing autoplay with sound, not the player's pause.
            else if (e.data === PAUSED) {
              if (started) stop('paused');
              else playMuted();
            }
          },
          onError: (e) => {
            if (!current()) return;
            if (FATAL_ERRORS.has(e.data)) fail(e.data);
            else stop('paused');
          },
        },
      });
      playerRef.current = player;
      neutralTitle();
    } catch {
      setPhase('raw');
    }
    return () => {
      window.clearTimeout(blockTimer);
      if (playerRef.current === player) destroyPlayer();
    };
    // Rebuilt only when going live again (resume reads resumeRef); the handlers read refs, not stale state.
  }, [phase, api]);

  // Progress readout while live.
  useEffect(() => {
    if (phase !== 'live') return;
    const id = window.setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      const t = call(() => p.getCurrentTime(), NaN);
      const d = call(() => p.getDuration(), 0);
      if (Number.isFinite(t)) setTime(t);
      setDuration(d);
    }, 250);
    return () => window.clearInterval(id);
  }, [phase]);

  // Plain iframe (API unavailable at first): if the API arrives later, wrap it only to hear fatal errors.
  useEffect(() => {
    if (phase !== 'raw' || !api || !frameRef.current || rawAttached.current) return;
    rawAttached.current = true;
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

  const playing = phase === 'live' && (ytState === PLAYING || ytState === BUFFERING);

  const toggle = () => {
    if (phase === 'live') {
      if (playing) stop('paused');
      else call(() => playerRef.current?.playVideo(), undefined);
    } else if (phase === 'paused') play(resumeAt);
    else if (phase === 'ended') play(startAt);
  };

  const back = () => {
    if (phase === 'live') {
      const p = playerRef.current;
      if (!p) return;
      const t = Math.max(startAt, call(() => p.getCurrentTime(), time) - BACK_SECONDS);
      call(() => p.seekTo(t, true), undefined);
      setTime(t);
    } else if (phase === 'paused' || phase === 'ended') {
      const from = phase === 'ended' ? end(duration) || time : resumeAt;
      const t = Math.max(startAt, from - BACK_SECONDS);
      resumeRef.current = t;
      setResumeAt(t);
      setTime(t);
      setPhase('paused');
    }
  };

  const restart = () => {
    if (phase === 'live') {
      const p = playerRef.current;
      if (!p) return;
      call(() => p.seekTo(startAt, true), undefined);
      call(() => p.playVideo(), undefined);
      setTime(startAt);
    } else if (phase === 'paused' || phase === 'ended') play(startAt);
  };

  const toggleSound = () => {
    const next = !muted;
    mutedRef.current = next;
    setMuted(next);
    setSoundBlocked(false);
    const p = playerRef.current;
    if (p) call(() => (next ? p.mute() : p.unMute()), undefined);
  };

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

  if (phase === 'raw') {
    const origin = `&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;
    return (
      <div className="ace-stage ace-frame">
        <iframe
          ref={frameRef}
          src={`${embedSrc(embed)}${origin}`}
          title={FRAME_TITLE}
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
    );
  }

  const shown = phase === 'paused' ? resumeAt : time;
  const total = end(duration);
  const pct = total > 0 ? Math.min(100, Math.max(0, (shown / total) * 100)) : 0;

  return (
    <div className="ace-player">
      {phase === 'live' ? (
        <div className="ace-stage ace-frame" ref={hostRef} />
      ) : (
        <button type="button" className="ace-stage ace-poster" onClick={phase === 'idle' ? () => play(startAt) : toggle} disabled={phase === 'loading'} aria-busy={phase === 'loading'}>
          <span className="ace-poster-kicker">{kicker}</span>
          <span className="ace-poster-play" aria-hidden="true">
            <Icon name={phase === 'ended' ? 'reset' : 'play'} />
          </span>
          <span className="ace-poster-label">
            {phase === 'loading' ? 'Carregando o player…' : phase === 'paused' ? `Continuar de ${clock(resumeAt)}` : phase === 'ended' ? 'Assistir de novo' : 'Assistir ao ace'}
          </span>
          <span className="ace-poster-note small">
            {phase === 'paused'
              ? 'Pausado: o player sai da tela até você continuar'
              : phase === 'ended'
                ? 'Fim do vídeo'
                : 'Vídeo do YouTube: só carrega depois do clique'}
          </span>
        </button>
      )}
      {phase !== 'idle' && (
        <div className="ace-controls" role="group" aria-label="Controles do vídeo">
          <button type="button" className="secondary ace-ctl" onClick={toggle} disabled={phase === 'loading'} aria-label={playing ? 'Pausar' : 'Tocar'}>
            <Icon name={playing ? 'pause' : 'play'} />
            <span className="ace-ctl-text">{playing ? 'Pausar' : 'Tocar'}</span>
          </button>
          <button type="button" className="secondary ace-ctl" onClick={back} disabled={phase === 'loading'} aria-label="Voltar 5 s">
            <Icon name="rewind" />
            <span>5 s</span>
          </button>
          <button type="button" className="secondary ace-ctl" onClick={restart} disabled={phase === 'loading'} aria-label="Recomeçar">
            <Icon name="reset" />
            <span className="ace-ctl-text">Recomeçar</span>
          </button>
          <button
            type="button"
            className={`secondary ace-ctl${soundBlocked ? ' ace-ctl-alert' : ''}`}
            onClick={toggleSound}
            disabled={phase === 'loading'}
            aria-label={muted ? 'Ativar som' : 'Tirar som'}
          >
            <Icon name={muted ? 'volume-off' : 'volume'} />
            <span className={soundBlocked ? undefined : 'ace-ctl-text'}>{muted ? 'Ativar som' : 'Tirar som'}</span>
          </button>
          <span className="ace-time">
            <span className="ace-time-bar" aria-hidden="true">
              <span style={{ width: `${pct}%` }} />
            </span>
            <span className="ace-time-text">
              {clock(shown)} / {total > 0 ? clock(total) : '–:––'}
            </span>
          </span>
        </div>
      )}
      {soundBlocked && muted && phase === 'live' && <p className="small muted ace-sound-note">O navegador só deixou o vídeo começar sem som: toque em "Ativar som".</p>}
    </div>
  );
}
