import { useEffect, useRef, useState } from 'react';
import type { Slot } from '../engine/types';
import {
  applyUserVeto,
  beginUserVeto,
  createRun,
  pickDraftCoach,
  pickDraftPlayer,
  playUserMatch,
  rerollDraft,
  rollDraft,
  startTournament,
  userPendingMatch,
  type DraftMode,
  type RunState,
} from '../game/run';
import { Footer } from './components/Footer';
import { Coach } from './screens/Coach';
import { Draft } from './screens/Draft';
import { End } from './screens/End';
import { Home } from './screens/Home';
import { Hub } from './screens/Hub';
import { Series } from './screens/Series';
import { Team } from './screens/Team';
import { Veto } from './screens/Veto';
import { loadRun, newSeed, saveRun } from './storage';

/** Transient UI state on top of the run: the home page, or a series being viewed. Everything else derives from the run. */
type View = { kind: 'home' } | { kind: 'run' } | { kind: 'hub' } | { kind: 'series'; matchId: string };

type ScreenKey = 'home' | 'draft' | 'coach' | 'team' | 'hub' | 'veto' | 'series' | 'end';

function screenOf(run: RunState | null, view: View): ScreenKey {
  if (!run || view.kind === 'home') return 'home';
  if (view.kind === 'series' && run.userSeries[view.matchId]) return 'series';
  switch (run.phase) {
    case 'draft':
      return run.draft.phase === 'coach' ? 'coach' : 'draft';
    case 'team':
      return 'team';
    case 'tournament':
      if (view.kind === 'hub') return 'hub';
      return run.veto && userPendingMatch(run)?.match.id === run.veto.matchId ? 'veto' : 'hub';
    case 'done':
      return 'end';
  }
}

export function App() {
  const [run, setRun] = useState<RunState | null>(() => loadRun());
  const [view, setView] = useState<View>({ kind: 'home' });
  const [error, setError] = useState<string | null>(null);
  const screen = screenOf(run, view);
  const headingRef = useRef<HTMLDivElement>(null);

  // New screen: back to the top, and move focus there for keyboard and screen-reader users.
  const viewKey = view.kind === 'series' ? `series:${view.matchId}` : screen;
  useEffect(() => {
    window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, [viewKey]);

  /** Applies an action to the run and saves it. */
  const act = (fn: (r: RunState) => RunState) => {
    if (!run) return;
    try {
      const next = fn(run);
      setRun(next);
      saveRun(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const startNew = (mode: DraftMode) => {
    const next = createRun(mode, newSeed());
    setRun(next);
    saveRun(next);
    setView({ kind: 'run' });
  };

  const viewSeries = (matchId: string) => setView({ kind: 'series', matchId });

  return (
    <div className="app">
      <nav className="topbar" aria-label="Navegação">
        <span className="brand">Road to Champions</span>
        {screen !== 'home' && (
          <button type="button" className="ghost" onClick={() => setView({ kind: 'home' })}>
            Início
          </button>
        )}
      </nav>

      <main ref={headingRef} tabIndex={-1} className="main" data-screen={screen}>
        {error && (
          <p className="error" role="alert">
            Algo deu errado: {error}
          </p>
        )}
        {screen === 'home' && <Home saved={run} onNew={startNew} onContinue={() => setView({ kind: 'run' })} />}
        {run && screen === 'draft' && (
          <Draft
            run={run}
            onRoll={() => act(rollDraft)}
            onReroll={() => act(rerollDraft)}
            onPick={(cardId: string, slot: Slot) => act((r) => pickDraftPlayer(r, cardId, slot))}
          />
        )}
        {run && screen === 'coach' && <Coach run={run} onPick={(id) => act((r) => pickDraftCoach(r, id))} />}
        {run && screen === 'team' && <Team run={run} onStart={(name) => act((r) => startTournament(r, name))} />}
        {run && screen === 'hub' && <Hub run={run} onVeto={() => {
              act(beginUserVeto);
              setView({ kind: 'run' });
            }} onViewSeries={viewSeries} />}
        {run && screen === 'veto' && (
          <Veto
            run={run}
            onChoose={(map) => act((r) => applyUserVeto(r, map))}
            onPlay={() => {
              const matchId = run.veto!.matchId;
              act(playUserMatch);
              viewSeries(matchId);
            }}
            onBack={() => setView({ kind: 'hub' })}
          />
        )}
        {run && screen === 'series' && view.kind === 'series' && (
          <Series run={run} matchId={view.matchId} onContinue={() => setView({ kind: 'hub' })} />
        )}
        {run && screen === 'end' && <End run={run} onNewRun={() => setView({ kind: 'home' })} onViewSeries={viewSeries} />}
      </main>

      <Footer />
    </div>
  );
}
