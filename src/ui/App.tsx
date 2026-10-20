import { Component, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Footer } from './components/Footer';
import { Frame, type NavItem } from './Frame';
import { lazyScreen } from './lazyScreen';
import { loadDifficulty, saveDifficulty } from './difficulty';
import { Home } from './screens/Home';
import { clearCareer, clearRun, clearSeason, savedSlots } from './saveSlots';

/**
 * The app shell: the first chunk the browser runs. It paints the page and the home page right away, then fetches
 * the game (./Game.tsx: the screens, the engine and the ~3,500 real cards); the mode buttons wait for it. The game
 * chunk is requested only after the shell's first paint: evaluating the pool takes a while on a phone, and doing it
 * before that paint would keep the page blank.
 */
let firstPaint: () => void = () => undefined;
const painted = new Promise<void>((resolve) => {
  firstPaint = () => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  };
});
const Game = lazyScreen(() => painted.then(() => import('./Game')).then((m) => m.Game));

/** The game behind an error boundary: a crash offers a new run (clearing the saves) instead of a blank page. */
export function App() {
  const [generation, setGeneration] = useState(0);
  return (
    <ErrorBoundary
      key={generation}
      onReset={() => {
        clearRun();
        clearSeason();
        clearCareer();
        setGeneration((g) => g + 1);
      }}
    >
      <Suspense fallback={<Boot />}>
        <Game />
      </Suspense>
    </ErrorBoundary>
  );
}

const BOOT_NAV: NavItem[] = [
  { key: 'home', label: 'Início', active: true, disabled: true },
  { key: 'daily', label: 'Diário', active: false, disabled: true },
  { key: 'career', label: 'Carreira', active: false, disabled: true },
  { key: 'ranking', label: 'Ranking', active: false, disabled: true },
  { key: 'history', label: 'Histórico', active: false, disabled: true },
  { key: 'howto', label: 'Como jogar', active: false, disabled: true },
];

const noop = () => undefined;

/** The home page while the game loads: same layout, mode buttons disabled, placeholders where the pool goes. */
function Boot() {
  useEffect(() => {
    firstPaint();
  }, []);
  const [saved] = useState(savedSlots);
  // Picking a difficulty already works: it is saved, and the game reads it when it takes over.
  const [difficulty, setDifficulty] = useState(loadDifficulty);
  return (
    <Frame screen="home" nav={BOOT_NAV}>
      <Home
        ready={false}
        continueCards={null}
        pendingSaves={Number(saved.run) + Number(saved.season) + Number(saved.career)}
        hasRun={saved.run}
        hasSeason={saved.season}
        hasCareer={saved.career}
        fanArt={null}
        historyCount={null}
        onNew={noop}
        onNewSeason={noop}
        onNewCareer={noop}
        onHistory={noop}
        onHowTo={noop}
        onRanking={noop}
        difficulty={difficulty}
        onDifficulty={(d) => {
          setDifficulty(d);
          saveDifficulty(d);
        }}
      />
    </Frame>
  );
}

interface BoundaryProps {
  children: ReactNode;
  onReset: () => void;
}

/** The browser could not fetch a chunk of the app (offline before the first full load, or a stale deploy). */
function isLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to fetch|ChunkLoadError|Unable to preload/i.test(
    message,
  );
}

/** Catches render errors (e.g. a save that passed validation but still breaks a screen) and failed chunk loads. */
class ErrorBoundary extends Component<BoundaryProps, { failed: boolean; loadError: boolean }> {
  state = { failed: false, loadError: false };

  static getDerivedStateFromError(error: unknown): { failed: boolean; loadError: boolean } {
    return { failed: true, loadError: isLoadError(error) };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.state.loadError) {
      // Nothing is wrong with the saves: keep them and just try again.
      return (
        <div className="app">
          <main className="main">
            <section className="panel" role="alert">
              <h1>Não foi possível carregar o jogo</h1>
              <p>Verifique a sua conexão e tente de novo. Suas runs salvas continuam guardadas.</p>
              <button type="button" className="primary wide" onClick={() => window.location.reload()}>
                Tentar de novo
              </button>
            </section>
          </main>
          <Footer />
        </div>
      );
    }
    return (
      <div className="app">
        <main className="main">
          <section className="panel" role="alert">
            <h1>Algo deu errado</h1>
            <p>Não foi possível mostrar esta tela. A run salva pode estar corrompida ou ser de uma versão antiga.</p>
            <p className="small muted">Começar uma nova run apaga as runs, temporadas e carreiras salvas.</p>
            <button type="button" className="primary wide" onClick={this.props.onReset}>
              Nova run
            </button>
          </section>
        </main>
        <Footer />
      </div>
    );
  }
}
