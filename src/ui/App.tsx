import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Slot } from '../engine/types';
import {
  RUN_MAP_POOL,
  RUN_POOL,
  applyUserVeto,
  beginUserVeto,
  createRun,
  userLineup,
  pickDraftCoach,
  pickDraftPlayer,
  playUserMatch,
  rerollDraft,
  rollDraft,
  startTournament,
  teamInfo,
  userOpponent,
  userPendingMatch,
  vetoScouting,
  type DraftMode,
  type RunState,
} from '../game/run';
import * as season from '../game/season';
import { MODE_LABELS } from '../game/run';
import { Footer } from './components/Footer';
import { Coach } from './screens/Coach';
import { Draft } from './screens/Draft';
import { End } from './screens/End';
import { Home } from './screens/Home';
import { Hub } from './screens/Hub';
import { Region } from './screens/Region';
import { SeasonEnd } from './screens/SeasonEnd';
import { SeasonHub } from './screens/SeasonHub';
import { Series } from './screens/Series';
import { Team } from './screens/Team';
import { Veto } from './screens/Veto';
import { clearRun, clearSeason, loadRun, loadSeason, newSeed, saveRun, saveSeason } from './storage';

type SeasonState = season.SeasonState;

/**
 * Transient UI state on top of the saved games: the home page, the run (main mode) or the season (Complete
 * Trials), a hub, or a series being viewed. Everything else derives from the run/season.
 */
type View =
  | { kind: 'home' }
  | { kind: 'run' }
  | { kind: 'hub' }
  | { kind: 'series'; matchId: string }
  | { kind: 'season' }
  | { kind: 'season-hub' }
  | { kind: 'season-series'; key: string };

type ScreenKey = 'home' | 'region' | 'draft' | 'coach' | 'team' | 'hub' | 'veto' | 'series' | 'end';
type Game = 'run' | 'season' | null;

function screenOf(run: RunState | null, s: SeasonState | null, view: View): { screen: ScreenKey; game: Game } {
  if (view.kind === 'home') return { screen: 'home', game: null };
  if (view.kind === 'season' || view.kind === 'season-hub' || view.kind === 'season-series') {
    if (!s) return { screen: 'home', game: null };
    const game: Game = 'season';
    if (view.kind === 'season-series' && s.userSeries[view.key]) return { screen: 'series', game };
    switch (s.stage) {
      case 'region':
        return { screen: 'region', game };
      case 'draft':
        return { screen: s.draft?.phase === 'coach' ? 'coach' : 'draft', game };
      case 'team':
        return { screen: 'team', game };
      case 'done':
        return { screen: 'end', game };
      default: {
        if (view.kind === 'season-hub') return { screen: 'hub', game };
        const pending = season.userPendingMatch(s);
        const vetoOpen = !!pending && s.veto?.stage === pending.stage && s.veto.matchId === pending.match.id;
        return { screen: vetoOpen ? 'veto' : 'hub', game };
      }
    }
  }
  if (!run) return { screen: 'home', game: null };
  const game: Game = 'run';
  if (view.kind === 'series' && run.userSeries[view.matchId]) return { screen: 'series', game };
  switch (run.phase) {
    case 'draft':
      return { screen: run.draft.phase === 'coach' ? 'coach' : 'draft', game };
    case 'team':
      return { screen: 'team', game };
    case 'tournament':
      if (view.kind === 'hub') return { screen: 'hub', game };
      return { screen: run.veto && userPendingMatch(run)?.match.id === run.veto.matchId ? 'veto' : 'hub', game };
    case 'done':
      return { screen: 'end', game };
  }
}

/** The game behind an error boundary: a crash offers a new run (clearing the saves) instead of a blank page. */
export function App() {
  const [generation, setGeneration] = useState(0);
  return (
    <ErrorBoundary
      key={generation}
      onReset={() => {
        clearRun();
        clearSeason();
        setGeneration((g) => g + 1);
      }}
    >
      <Game />
    </ErrorBoundary>
  );
}

function Game() {
  const [run, setRun] = useState<RunState | null>(() => loadRun());
  const [s, setSeason] = useState<SeasonState | null>(() => loadSeason());
  const [view, setViewState] = useState<View>({ kind: 'home' });
  const [error, setError] = useState<string | null>(null);
  const { screen, game } = screenOf(run, s, view);
  const headingRef = useRef<HTMLDivElement>(null);

  // New screen: back to the top, and move focus there for keyboard and screen-reader users.
  const viewKey = view.kind === 'series' ? `series:${view.matchId}` : view.kind === 'season-series' ? `season-series:${view.key}` : `${game}:${screen}`;
  useEffect(() => {
    window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, [viewKey]);

  /** Changing screens dismisses the error of a previous action. */
  const setView = (next: View) => {
    setError(null);
    setViewState(next);
  };

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  /** Applies an action to the run and saves it. Returns false (and shows the error) when the action throws. */
  const act = (fn: (r: RunState) => RunState): boolean => {
    if (!run) return false;
    try {
      const next = fn(run);
      setRun(next);
      saveRun(next);
      setError(null);
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  };

  /** Same for the season. */
  const actSeason = (fn: (x: SeasonState) => SeasonState): boolean => {
    if (!s) return false;
    try {
      const next = fn(s);
      setSeason(next);
      saveSeason(next);
      setError(null);
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  };

  const startNew = (mode: DraftMode) => {
    const next = createRun(mode, newSeed());
    setRun(next);
    saveRun(next);
    setView({ kind: 'run' });
  };

  const startNewSeason = () => {
    const next = season.createSeason(newSeed());
    setSeason(next);
    saveSeason(next);
    setView({ kind: 'season' });
  };

  const viewSeries = (matchId: string) => setView({ kind: 'series', matchId });
  const viewSeasonSeries = (key: string) => setView({ kind: 'season-series', key });

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Pular para o conteúdo
      </a>
      <nav className="topbar" aria-label="Navegação">
        <span className="brand" translate="no">
          <span className="brand-mark" aria-hidden="true" />
          Road to Champions
        </span>
        {screen !== 'home' && (
          <button type="button" className="ghost" onClick={() => setView({ kind: 'home' })}>
            Início
          </button>
        )}
      </nav>

      <main ref={headingRef} id="main" tabIndex={-1} className="main" data-screen={screen} data-game={game ?? undefined}>
        {error && (
          <p className="error" role="alert">
            Algo deu errado: {error}
          </p>
        )}
        {screen === 'home' && (
          <Home
            saved={run}
            savedSeason={s}
            onNew={startNew}
            onContinue={() => setView({ kind: 'run' })}
            onNewSeason={startNewSeason}
            onContinueSeason={() => setView({ kind: 'season' })}
          />
        )}

        {game === 'run' && run && <RunScreens run={run} screen={screen} view={view} act={act} setView={setView} viewSeries={viewSeries} />}
        {game === 'season' && s && (
          <SeasonScreens s={s} screen={screen} view={view} act={actSeason} setView={setView} viewSeries={viewSeasonSeries} />
        )}
      </main>

      <Footer />
    </div>
  );
}

interface RunScreensProps {
  run: RunState;
  screen: ScreenKey;
  view: View;
  act: (fn: (r: RunState) => RunState) => boolean;
  setView: (v: View) => void;
  viewSeries: (matchId: string) => void;
}

/** The main mode: draft → coach → team → Champions. */
function RunScreens({ run, screen, view, act, setView, viewSeries }: RunScreensProps) {
  if (screen === 'draft') {
    return (
      <Draft
        draft={run.draft}
        pool={RUN_POOL}
        context={MODE_LABELS[run.mode]}
        onRoll={() => act(rollDraft)}
        onReroll={() => act(rerollDraft)}
        onPick={(cardId: string, slot: Slot) => act((r) => pickDraftPlayer(r, cardId, slot))}
      />
    );
  }
  if (screen === 'coach') return <Coach draft={run.draft} pool={RUN_POOL} onPick={(id) => act((r) => pickDraftCoach(r, id))} />;
  if (screen === 'team') {
    const props = run.teamName === undefined ? {} : { initialName: run.teamName };
    return <Team lineup={userLineup(run)} pool={RUN_POOL} {...props} cta="Começar Champions" onStart={(name) => act((r) => startTournament(r, name))} />;
  }
  if (screen === 'hub') {
    return (
      <Hub
        run={run}
        onVeto={() => {
          if (act(beginUserVeto)) setView({ kind: 'run' });
        }}
        onViewSeries={viewSeries}
      />
    );
  }
  if (screen === 'veto') {
    const pending = userPendingMatch(run)!;
    const oppId = userOpponent(pending.match);
    return (
      <Veto
        match={pending.match}
        side={pending.side}
        veto={run.veto!.state}
        opponentName={teamInfo(run, oppId).name}
        scouting={vetoScouting(run, oppId)}
        mapPool={RUN_MAP_POOL}
        onChoose={(map) => act((r) => applyUserVeto(r, map))}
        onPlay={() => {
          const matchId = run.veto!.matchId;
          if (act(playUserMatch)) viewSeries(matchId);
        }}
        onBack={() => setView({ kind: 'hub' })}
      />
    );
  }
  if (screen === 'series' && view.kind === 'series') {
    const match = run.tournament!.matches.find((m) => m.id === view.matchId)!;
    return (
      <Series
        label={match.label}
        bestOf={match.bestOf}
        series={run.userSeries[view.matchId]!}
        side={match.a === 'user' ? 0 : 1}
        names={[teamInfo(run, match.a).name, teamInfo(run, match.b).name]}
        onContinue={() => setView({ kind: 'hub' })}
      />
    );
  }
  if (screen === 'end') return <End run={run} onNewRun={() => setView({ kind: 'home' })} onViewSeries={viewSeries} />;
  return null;
}

interface SeasonScreensProps {
  s: SeasonState;
  screen: ScreenKey;
  view: View;
  act: (fn: (x: SeasonState) => SeasonState) => boolean;
  setView: (v: View) => void;
  viewSeries: (key: string) => void;
}

/** Complete Trials: region → draft → coach → team → league → Masters → Champions. */
function SeasonScreens({ s, screen, view, act, setView, viewSeries }: SeasonScreensProps) {
  const context = `Complete Trials · ${season.REGION_LABELS[s.region ?? 'americas']}`;
  if (screen === 'region') return <Region field={s.field} onChoose={(region, field) => act((x) => season.chooseRegion(x, region, field))} />;
  const pool = s.region ? season.seasonPool(s) : [];
  if (screen === 'draft') {
    return (
      <Draft
        draft={s.draft!}
        pool={pool}
        context={context}
        onRoll={() => act(season.rollSeasonDraft)}
        onReroll={() => act(season.rerollSeasonDraft)}
        onPick={(cardId: string, slot: Slot) => act((x) => season.pickSeasonPlayer(x, cardId, slot))}
      />
    );
  }
  if (screen === 'coach') return <Coach draft={s.draft!} pool={pool} onPick={(id) => act((x) => season.pickSeasonCoach(x, id))} />;
  if (screen === 'team') {
    const props = s.teamName === undefined ? {} : { initialName: s.teamName };
    return (
      <Team
        lineup={season.userLineup(s)}
        pool={pool}
        {...props}
        context={`${context} · campo ${season.FIELD_MODE_LABELS[s.field]}`}
        cta={`Começar a Liga ${season.REGION_LABELS[s.region ?? 'americas']}`}
        onStart={(name) => act((x) => season.startLeague(x, name))}
      />
    );
  }
  if (screen === 'hub') {
    return (
      <SeasonHub
        season={s}
        onVeto={() => {
          if (act(season.beginUserVeto)) setView({ kind: 'season' });
        }}
        onViewSeries={viewSeries}
      />
    );
  }
  if (screen === 'veto') {
    const pending = season.userPendingMatch(s)!;
    const oppId = season.userOpponent(pending.match);
    return (
      <Veto
        match={{ label: `${season.STAGE_LABELS[pending.stage]} · ${pending.match.label}`, bestOf: pending.match.bestOf }}
        side={pending.side}
        veto={s.veto!.state}
        opponentName={season.seasonTeamInfo(s, oppId).name}
        scouting={season.seasonVetoScouting(s, oppId)}
        mapPool={season.SEASON_MAP_POOL}
        onChoose={(map) => act((x) => season.applyUserVeto(x, map))}
        onPlay={() => {
          const key = season.seriesKey(s.veto!.stage, s.veto!.matchId);
          if (act(season.playUserMatch)) viewSeries(key);
        }}
        onBack={() => setView({ kind: 'season-hub' })}
        backLabel="Voltar à temporada"
      />
    );
  }
  if (screen === 'series' && view.kind === 'season-series') {
    const found = season.findSeasonMatch(s, view.key)!;
    const { match, stage } = found;
    return (
      <Series
        label={`${season.STAGE_LABELS[stage]} · ${match.label}`}
        bestOf={match.bestOf}
        series={s.userSeries[view.key]!}
        side={match.a === season.USER_ID ? 0 : 1}
        names={[season.seasonTeamInfo(s, match.a).name, season.seasonTeamInfo(s, match.b).name]}
        onContinue={() => setView(s.stage === 'done' ? { kind: 'season' } : { kind: 'season-hub' })}
      />
    );
  }
  if (screen === 'end') return <SeasonEnd season={s} onNewRun={() => setView({ kind: 'home' })} onViewSeries={viewSeries} />;
  return null;
}

interface BoundaryProps {
  children: ReactNode;
  onReset: () => void;
}

/** Catches render errors (e.g. a save that passed validation but still breaks a screen). */
class ErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="app">
        <main className="main">
          <section className="panel" role="alert">
            <h1>Algo deu errado</h1>
            <p>Não foi possível mostrar esta tela. A run salva pode estar corrompida ou ser de uma versão antiga.</p>
            <p className="small muted">Começar uma nova run apaga as runs salvas.</p>
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
