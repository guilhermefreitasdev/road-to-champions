import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { findCard } from '../engine/roster';
import type { Card, Lineup, Slot } from '../engine/types';
import { ALL_ROSTERS } from '../data/real';
import { mapMedia, mediaUrl } from '../data/media';
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
import { MODE_LABELS, USER_ID } from '../game/run';
import { ConfirmBar } from './components/ConfirmBar';
import { Emblem } from './components/Emblem';
import { Footer } from './components/Footer';
import { Icon } from './components/Icon';
import { Coach } from './screens/Coach';
import { Draft } from './screens/Draft';
import { End } from './screens/End';
import { Home } from './screens/Home';
import { History } from './screens/History';
import { HowTo } from './screens/HowTo';
import { Hub } from './screens/Hub';
import { Playback } from './screens/Playback';
import { Region } from './screens/Region';
import { SeasonEnd } from './screens/SeasonEnd';
import { SeasonHub } from './screens/SeasonHub';
import { Series } from './screens/Series';
import { Stats } from './screens/Stats';
import { Team } from './screens/Team';
import { Veto } from './screens/Veto';
import { clearHistory, loadHistory, recordEntry, runEntry, seasonEntry, type HistoryEntry } from './history';
import { usePrefersReducedMotion } from './motion';
import { runStats, seasonStats } from './playerStats';
import { clearRun, clearSeason, loadRun, loadSeason, newSeed, saveRun, saveSeason } from './storage';

type SeasonState = season.SeasonState;

/**
 * Transient UI state on top of the saved games: the home page, the run (main mode) or the season (Complete
 * Trials), a hub, or a series being viewed. Everything else derives from the run/season.
 */
type View =
  | { kind: 'home' }
  | { kind: 'history' }
  | { kind: 'howto' }
  | { kind: 'run' }
  | { kind: 'hub' }
  | { kind: 'stats' }
  | { kind: 'series'; matchId: string }
  | { kind: 'playback'; matchId: string }
  | { kind: 'season' }
  | { kind: 'season-hub' }
  | { kind: 'season-stats' }
  | { kind: 'season-series'; key: string }
  | { kind: 'season-playback'; key: string };

type ScreenKey = 'home' | 'history' | 'howto' | 'region' | 'draft' | 'coach' | 'team' | 'hub' | 'stats' | 'veto' | 'playback' | 'series' | 'end';
type Game = 'run' | 'season' | null;

function screenOf(run: RunState | null, s: SeasonState | null, view: View): { screen: ScreenKey; game: Game } {
  if (view.kind === 'home') return { screen: 'home', game: null };
  if (view.kind === 'history') return { screen: 'history', game: null };
  if (view.kind === 'howto') return { screen: 'howto', game: null };
  if (view.kind.startsWith('season')) {
    if (!s) return { screen: 'home', game: null };
    const game: Game = 'season';
    if (view.kind === 'season-series' && s.userSeries[view.key]) return { screen: 'series', game };
    if (view.kind === 'season-playback' && s.userSeries[view.key]) return { screen: 'playback', game };
    if (view.kind === 'season-stats' && (season.isCompStage(s.stage) || s.stage === 'done')) return { screen: 'stats', game };
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
  if (view.kind === 'playback' && run.userSeries[view.matchId]) return { screen: 'playback', game };
  if (view.kind === 'stats' && run.tournament) return { screen: 'stats', game };
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

/** Card lookup across every pool (main mode and regional), for the real agent pools on the stats screens. */
function cardById(id: string): Card | undefined {
  return findCard(ALL_ROSTERS, id.replace(/#.*$/, ''));
}

function cardsOf(lineup: Lineup): Map<string, Card> {
  return new Map(lineup.players.map((p) => [p.card.id, p.card]));
}

function Game() {
  const [run, setRun] = useState<RunState | null>(() => loadRun());
  const [s, setSeason] = useState<SeasonState | null>(() => loadSeason());
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [view, setViewState] = useState<View>({ kind: 'home' });
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const { screen, game } = screenOf(run, s, view);
  const headingRef = useRef<HTMLDivElement>(null);

  // New screen: back to the top, and move focus there for keyboard and screen-reader users.
  const viewKey =
    view.kind === 'series' || view.kind === 'playback' ? `${view.kind}:${view.matchId}`
    : view.kind === 'season-series' || view.kind === 'season-playback' ? `${view.kind}:${view.key}`
    : `${game}:${screen}`;
  useEffect(() => {
    window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, [viewKey]);

  // Escape closes the mobile menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  /** Changing screens dismisses the error of a previous action and any open confirmation. */
  const setView = (next: View) => {
    setError(null);
    setConfirmReset(false);
    setViewState(next);
  };

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  /** Applies an action to the run and saves it (and records it in the history when it ends). False when it throws. */
  const act = (fn: (r: RunState) => RunState): boolean => {
    if (!run) return false;
    try {
      const next = fn(run);
      setRun(next);
      saveRun(next);
      if (next.phase === 'done' && run.phase !== 'done') setHistory(recordEntry(runEntry(next, new Date())));
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
      if (next.stage === 'done' && s.stage !== 'done') setHistory(recordEntry(seasonEntry(next, new Date())));
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

  const startNewSeason = (field?: season.FieldMode) => {
    const next = season.createSeason(newSeed(), field);
    setSeason(next);
    saveSeason(next);
    setView({ kind: 'season' });
  };

  /** "Recomeçar": a fresh game of the same mode, from its first screen (the old save is replaced). */
  const restart = () => {
    if (game === 'run' && run) startNew(run.mode);
    else if (game === 'season' && s) startNewSeason(s.field);
  };

  const viewSeries = (matchId: string) => setView({ kind: 'series', matchId });
  const viewSeasonSeries = (key: string) => setView({ kind: 'season-series', key });
  // A series just played: watch it "ao vivo", unless the OS asks for less motion (then straight to the result).
  const watchSeries = (matchId: string) => setView(reducedMotion ? { kind: 'series', matchId } : { kind: 'playback', matchId });
  const watchSeasonSeries = (key: string) => setView(reducedMotion ? { kind: 'season-series', key } : { kind: 'season-playback', key });

  // Stats of the game in progress (main nav): only once its competition has started.
  const statsTarget: View | null =
    game === 'run' && run?.tournament ? { kind: 'stats' }
    : game === 'season' && s && (season.isCompStage(s.stage) || s.stage === 'done') ? { kind: 'season-stats' }
    : null;
  const nav: { key: string; label: string; to: View | null; active: boolean }[] = [
    { key: 'home', label: 'Início', to: { kind: 'home' }, active: screen === 'home' },
    { key: 'stats', label: 'Estatísticas', to: statsTarget, active: screen === 'stats' },
    { key: 'history', label: 'Histórico', to: { kind: 'history' }, active: screen === 'history' },
    { key: 'howto', label: 'Como jogar', to: { kind: 'howto' }, active: screen === 'howto' },
  ];
  const go = (to: View) => {
    setMenuOpen(false);
    setView(to);
  };
  const resetLabel = game === 'season' ? 'Recomeçar temporada' : 'Recomeçar run';
  const askReset = () => {
    setMenuOpen(false);
    setConfirmReset(true);
  };

  return (
    <div className="app">
      <Backdrop strong={screen === 'home'} />
      <a className="skip-link" href="#main">
        Pular para o conteúdo
      </a>
      <header className="topbar">
        <button type="button" className="brand" translate="no" onClick={() => go({ kind: 'home' })} aria-label="Road to Champions: início">
          <Emblem size={26} />
          <span className="brand-name">Road to Champions</span>
        </button>
        <nav className={`nav${menuOpen ? ' open' : ''}`} id="main-nav" aria-label="Principal">
          <ul>
            {nav
              .filter((n) => n.to)
              .map((n) => (
                <li key={n.key}>
                  <button type="button" className="nav-link" aria-current={n.active ? 'page' : undefined} onClick={() => go(n.to!)}>
                    {n.label}
                  </button>
                </li>
              ))}
            {game !== null && (
              <li className="nav-reset-item">
                <button type="button" className="nav-link reset" onClick={askReset}>
                  <Icon name="reset" /> {resetLabel}
                </button>
              </li>
            )}
          </ul>
        </nav>
        <span className="topbar-actions">
          {game !== null && (
            <button type="button" className="reset-btn" onClick={askReset} aria-expanded={confirmReset}>
              <Icon name="reset" /> {resetLabel}
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

      <main ref={headingRef} id="main" tabIndex={-1} className="main" data-screen={screen} data-game={game ?? undefined}>
        {confirmReset && game !== null && (
          <ConfirmBar
            title={game === 'season' ? 'Recomeçar a temporada?' : 'Recomeçar a run?'}
            text={
              game === 'season'
                ? 'A temporada salva é apagada e você volta à escolha do servidor. Não dá para desfazer.'
                : `A run salva é apagada e um novo ${run ? MODE_LABELS[run.mode] : 'draft'} começa do zero. Não dá para desfazer.`
            }
            confirmLabel={game === 'season' ? 'Recomeçar temporada' : 'Recomeçar run'}
            onConfirm={restart}
            onCancel={() => setConfirmReset(false)}
          />
        )}
        {error && (
          <p className="error" role="alert">
            Algo deu errado: {error}
          </p>
        )}
        {screen === 'home' && (
          <Home
            saved={run}
            savedSeason={s}
            historyCount={history.length}
            onNew={startNew}
            onContinue={() => setView({ kind: 'run' })}
            onNewSeason={() => startNewSeason()}
            onContinueSeason={() => setView({ kind: 'season' })}
            onHistory={() => setView({ kind: 'history' })}
            onHowTo={() => setView({ kind: 'howto' })}
          />
        )}
        {screen === 'howto' && <HowTo onBack={() => setView({ kind: 'home' })} />}
        {screen === 'history' && (
          <History
            entries={history}
            cardOf={cardById}
            onClear={() => {
              clearHistory();
              setHistory([]);
            }}
            onBack={() => setView({ kind: 'home' })}
          />
        )}

        {game === 'run' && run && (
          <RunScreens run={run} screen={screen} view={view} act={act} setView={setView} viewSeries={viewSeries} watchSeries={watchSeries} />
        )}
        {game === 'season' && s && (
          <SeasonScreens
            s={s}
            screen={screen}
            view={view}
            act={actSeason}
            setView={setView}
            viewSeries={viewSeasonSeries}
            watchSeries={watchSeasonSeries}
          />
        )}
      </main>

      <Footer onHowTo={() => go({ kind: 'howto' })} />
    </div>
  );
}

const BACKDROP_MAP = mapMedia('Lotus') ?? mapMedia('Ascent');

/**
 * The arena behind every screen: stage lights, beams, floor vignette and grain in CSS. On the home page, a darkened,
 * blurred map splash sits under the hero. Fixed and decorative: never scrolls, never overflows, hidden from AT.
 */
function Backdrop({ strong }: { strong: boolean }) {
  return (
    <div className={`backdrop${strong ? ' strong' : ''}`} aria-hidden="true">
      {strong && BACKDROP_MAP && <img className="backdrop-map" src={mediaUrl(BACKDROP_MAP.image)} alt="" width={1920} height={1080} decoding="async" />}
      <span className="backdrop-beams" />
      <span className="backdrop-grain" />
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
  watchSeries: (matchId: string) => void;
}

/** The main mode: draft → coach → team → Champions. */
function RunScreens({ run, screen, view, act, setView, viewSeries, watchSeries }: RunScreensProps) {
  if (screen === 'draft') {
    return (
      <Draft
        draft={run.draft}
        pool={RUN_POOL}
        context={run.mode === 'classic' ? 'Clássico' : 'Ultimate'}
        onBack={() => setView({ kind: 'home' })}
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
        onStats={() => setView({ kind: 'stats' })}
      />
    );
  }
  if (screen === 'stats') {
    return (
      <Stats
        teamName={teamInfo(run, USER_ID).name}
        context={`Champions · ${MODE_LABELS[run.mode]}`}
        rows={runStats(run)}
        cards={cardsOf(userLineup(run))}
        onBack={() => setView(run.phase === 'done' ? { kind: 'run' } : { kind: 'hub' })}
        backLabel={run.phase === 'done' ? 'Voltar ao resultado' : 'Voltar ao torneio'}
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
          if (act(playUserMatch)) watchSeries(matchId);
        }}
        onBack={() => setView({ kind: 'hub' })}
      />
    );
  }
  if ((screen === 'series' || screen === 'playback') && (view.kind === 'series' || view.kind === 'playback')) {
    const match = run.tournament!.matches.find((m) => m.id === view.matchId)!;
    const props = {
      label: match.label,
      bestOf: match.bestOf,
      series: run.userSeries[view.matchId]!,
      side: (match.a === USER_ID ? 0 : 1) as 0 | 1,
      names: [teamInfo(run, match.a).name, teamInfo(run, match.b).name] as [string, string],
    };
    if (screen === 'playback') return <Playback key={view.matchId} {...props} onDone={() => viewSeries(view.matchId)} />;
    return (
      <Series
        {...props}
        onContinue={() => setView(run.phase === 'done' ? { kind: 'run' } : { kind: 'hub' })}
        onReplay={() => setView({ kind: 'playback', matchId: view.matchId })}
      />
    );
  }
  if (screen === 'end') {
    return <End run={run} onNewRun={() => setView({ kind: 'home' })} onViewSeries={viewSeries} onStats={() => setView({ kind: 'stats' })} />;
  }
  return null;
}

interface SeasonScreensProps {
  s: SeasonState;
  screen: ScreenKey;
  view: View;
  act: (fn: (x: SeasonState) => SeasonState) => boolean;
  setView: (v: View) => void;
  viewSeries: (key: string) => void;
  watchSeries: (key: string) => void;
}

/** Complete Trials: region → draft → coach → team → league → Masters → Champions. */
function SeasonScreens({ s, screen, view, act, setView, viewSeries, watchSeries }: SeasonScreensProps) {
  const context = `Complete Trials · ${season.REGION_LABELS[s.region ?? 'americas']}`;
  if (screen === 'region') return <Region field={s.field} onChoose={(region, field) => act((x) => season.chooseRegion(x, region, field))} />;
  const pool = s.region ? season.seasonPool(s) : [];
  if (screen === 'draft') {
    return (
      <Draft
        draft={s.draft!}
        pool={pool}
        context={`Trials · ${season.REGION_LABELS[s.region ?? 'americas']}`}
        onBack={() => setView({ kind: 'home' })}
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
        onStats={() => setView({ kind: 'season-stats' })}
      />
    );
  }
  if (screen === 'stats') {
    return (
      <Stats
        teamName={season.seasonTeamInfo(s, season.USER_ID).name}
        context={context}
        rows={seasonStats(s)}
        cards={cardsOf(season.userLineup(s))}
        onBack={() => setView(s.stage === 'done' ? { kind: 'season' } : { kind: 'season-hub' })}
        backLabel={s.stage === 'done' ? 'Voltar ao resultado' : 'Voltar à temporada'}
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
          if (act(season.playUserMatch)) watchSeries(key);
        }}
        onBack={() => setView({ kind: 'season-hub' })}
        backLabel="Voltar à temporada"
      />
    );
  }
  if ((screen === 'series' || screen === 'playback') && (view.kind === 'season-series' || view.kind === 'season-playback')) {
    const { match, stage } = season.findSeasonMatch(s, view.key)!;
    const props = {
      label: `${season.STAGE_LABELS[stage]} · ${match.label}`,
      bestOf: match.bestOf,
      series: s.userSeries[view.key]!,
      side: (match.a === season.USER_ID ? 0 : 1) as 0 | 1,
      names: [season.seasonTeamInfo(s, match.a).name, season.seasonTeamInfo(s, match.b).name] as [string, string],
    };
    if (screen === 'playback') return <Playback key={view.key} {...props} onDone={() => viewSeries(view.key)} />;
    return (
      <Series
        {...props}
        onContinue={() => setView(s.stage === 'done' ? { kind: 'season' } : { kind: 'season-hub' })}
        onReplay={() => setView({ kind: 'season-playback', key: view.key })}
      />
    );
  }
  if (screen === 'end') {
    return (
      <SeasonEnd season={s} onNewRun={() => setView({ kind: 'home' })} onViewSeries={viewSeries} onStats={() => setView({ kind: 'season-stats' })} />
    );
  }
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
