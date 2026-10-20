import { useEffect, useState, type ReactNode, type Ref } from 'react';
import gameMediaJson from '../data/game/media.json';
import { publicUrl } from '../data/publicUrl';
import { Emblem } from './components/Emblem';
import { Footer } from './components/Footer';
import { Icon } from './components/Icon';
import { useInstallPrompt } from './install';

/**
 * The page around every screen: arena backdrop, top bar (brand, main nav, "Recomeçar", mobile menu, "Instalar app")
 * and footer. Free of game code, so the shell (src/ui/App.tsx) shows it, with the home page, before the pool loads.
 */

export interface NavItem {
  key: string;
  label: string;
  active: boolean;
  /** Absent: hidden (e.g. "Estatísticas" before a competition starts), unless `disabled`. */
  onSelect?: () => void;
  /** Shown but not usable yet (while the game loads). */
  disabled?: boolean;
}

interface FrameProps {
  /** data-screen / data-game of <main>, for the per-screen CSS. */
  screen: string;
  game?: 'run' | 'season' | null;
  nav: NavItem[];
  onHome?: () => void;
  onHowTo?: () => void;
  /** "Recomeçar run/temporada", while a game is open. */
  reset?: { label: string; expanded: boolean; onAsk: () => void };
  mainRef?: Ref<HTMLElement>;
  children: ReactNode;
}

export function Frame({ screen, game, nav, onHome, onHowTo, reset, mainRef, children }: FrameProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const install = useInstallPrompt();

  // Escape closes the mobile menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const close = (fn?: () => void) => () => {
    setMenuOpen(false);
    fn?.();
  };

  return (
    <div className="app">
      <Backdrop strong={screen === 'home'} />
      <a className="skip-link" href="#main">
        Pular para o conteúdo
      </a>
      <header className="topbar">
        <button type="button" className="brand" translate="no" onClick={close(onHome)} aria-label="Road to Champions: início">
          <Emblem size={26} />
          <span className="brand-name">Road to Champions</span>
        </button>
        <nav className={`nav${menuOpen ? ' open' : ''}`} id="main-nav" aria-label="Principal">
          <ul>
            {nav
              .filter((n) => n.onSelect || n.disabled)
              .map((n) => (
                <li key={n.key}>
                  <button
                    type="button"
                    className="nav-link"
                    aria-current={n.active ? 'page' : undefined}
                    disabled={n.disabled}
                    onClick={close(n.onSelect)}
                  >
                    {n.label}
                  </button>
                </li>
              ))}
            {reset && (
              <li className="nav-reset-item">
                <button type="button" className="nav-link reset" onClick={close(reset.onAsk)}>
                  <Icon name="reset" /> {reset.label}
                </button>
              </li>
            )}
            {install && (
              <li className="nav-install-item">
                <button type="button" className="nav-link install" title="Instalar app" onClick={close(() => void install())}>
                  <Icon name="install" /> <span className="nav-install-label">Instalar app</span>
                </button>
              </li>
            )}
          </ul>
        </nav>
        <span className="topbar-actions">
          {reset && (
            <button type="button" className="reset-btn" onClick={close(reset.onAsk)} aria-expanded={reset.expanded}>
              <Icon name="reset" /> {reset.label}
            </button>
          )}
          <button
            type="button"
            className="menu-btn"
            aria-expanded={menuOpen}
            aria-controls="main-nav"
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Icon name={menuOpen ? 'close' : 'menu'} />
          </button>
        </span>
      </header>

      <main ref={mainRef} id="main" tabIndex={-1} className="main" data-screen={screen} data-game={game ?? undefined}>
        {children}
      </main>

      <Footer {...(onHowTo ? { onHowTo: close(onHowTo) } : {})} />
    </div>
  );
}

const BACKDROP_MAP = (gameMediaJson.maps as Record<string, { image: string } | undefined>)['Lotus'] ?? gameMediaJson.maps.Ascent;

/**
 * The arena behind every screen: stage lights, beams, floor vignette and grain in CSS. On the home page, a darkened,
 * blurred map splash sits under the hero. Fixed and decorative: never scrolls, never overflows, hidden from AT.
 */
function Backdrop({ strong }: { strong: boolean }) {
  return (
    <div className={`backdrop${strong ? ' strong' : ''}`} aria-hidden="true">
      {strong && BACKDROP_MAP && <img className="backdrop-map" src={publicUrl(BACKDROP_MAP.image)} alt="" width={1920} height={1080} decoding="async" />}
      <span className="backdrop-beams" />
      <span className="backdrop-grain" />
    </div>
  );
}

/** Styled placeholder while a screen's code loads (lazy screens; normally instant, the chunks are prefetched). */
export function ScreenLoading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="screen-loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
