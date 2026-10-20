import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { findCard } from '../engine/roster';
import type { Card, Slot } from '../engine/types';
import { ALL_ROSTERS } from '../data/real';
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
import { Frame, ScreenLoading, type NavItem } from './Frame';
import { Home } from './screens/Home';
import { ContinueCards, FanArt, featuredCards } from './screens/HomeExtras';
import type { BoardStage } from './screens/Stats';
import { lazyScreen } from './lazyScreen';
import { clearHistory, loadHistory, recordEntry, runEntry, seasonEntry, type HistoryEntry } from './history';
import type { Difficulty } from '../game/difficulty';
import { runAllPlayerStats, seasonAllPlayerStats } from '../game/stats';
import { difficultyOf, loadDifficulty, saveDifficulty } from './difficulty';
import { usePrefersReducedMotion } from './motion';
import { runStats, seasonStats } from './playerStats';
import { loadRun, loadSeason, newSeed, saveRun, saveSeason } from './storage';

/**
 * The game: the saved run (main mode) and season (Complete Trials), and the screen machine of both modes. Loaded
 * on demand by the shell (./App.tsx) together with the card pool; every screen but the home page is a chunk of its
 * own, prefetched once the game is up so later screens open instantly (and work offline with the service worker).
 */

const Coach = lazyScreen(() => import('./screens/Coach').then((m) => m.Coach));
const Draft = lazyScreen(() => import('./screens/Draft').then((m) => m.Draft));
const End = lazyScreen(() => import('./screens/End').then((m) => m.End));
const History = lazyScreen(() => import('./screens/History').then((m) => m.History));
const HowTo = lazyScreen(() => import('./screens/HowTo').then((m) => m.HowTo));
const Hub = lazyScreen(() => import('./screens/Hub').then((m) => m.Hub));
const Market = lazyScreen(() => import('./screens/Market').then((m) => m.Market));
const Playback = lazyScreen(() => import('./screens/Playback').then((m) => m.Playback));
const Ranking = lazyScreen(() => import('./screens/Ranking').then((m) => m.Ranking));
const Region = lazyScreen(() => import('./screens/Region').then((m) => m.Region));
const SeasonEnd = lazyScreen(() => import('./screens/SeasonEnd').then((m) => m.SeasonEnd));
const SeasonHub = lazyScreen(() => import('./screens/SeasonHub').then((m) => m.SeasonHub));
const Series = lazyScreen(() => import('./screens/Series').then((m) => m.Series));
const Stats = lazyScreen(() => import('./screens/Stats').then((m) => m.Stats));
const Team = lazyScreen(() => import('./screens/Team').then((m) => m.Team));
const Veto = lazyScreen(() => import('./screens/Veto').then((m) => m.Veto));

/** Most likely next screens first. */
const PREFETCH = [Draft, Coach, Team, Hub, Veto, Playback, Series, End, Region, SeasonHub, Market, SeasonEnd, Stats, HowTo, Ranking, History];

/** Fetches every screen's chunk once the browser is idle (each is small; failures are retried when shown). */
function prefetchScreens(): () => void {
  const run = () => {
    for (const screen of PREFETCH) screen.preload().catch(() => undefined);
  };
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: 3000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, 1000);
  return () => window.clearTimeout(id);
}

type SeasonState = season.SeasonState;

/**
 * Transient UI state on top of the saved games: the home page, the run (main mode) or the season (Complete
 * Trials), a hub, or a series being viewed. Everything else derives from the run/season.
 */
type View =
  | { kind: 'home' }
  | { kind: 'history' }
  | { kind: 'howto' }
  | { kind: 'ranking' }
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

type ScreenKey = 'home' | 'history' | 'howto' | 'ranking' | 'region' | 'market' | 'draft' | 'coach' | 'team' | 'hub' | 'stats' | 'veto' | 'playback' | 'series' | 'end';
type Game = 'run' | 'season' | null;

function screenOf(run: RunState | null, s: SeasonState | null, view: View): { screen: ScreenKey; game: Game } {
  if (view.kind === 'home') return { screen: 'home', game: null };
  if (view.kind === 'history') return { screen: 'history', game: null };
  if (view.kind === 'howto') return { screen: 'howto', game: null };
  if (view.kind === 'ranking') return { screen: 'ranking', game: null };
  if (view.kind.startsWith('season')) {
    if (!s) return { screen: 'home', game: null };
    const game: Game = 'season';
    if (view.kind === 'season-series' && s.userSeries[view.key]) return { screen: 'series', game };
    if (view.kind === 'season-playback' && s.userSeries[view.key]) return { screen: 'playback', game };
    if (view.kind === 'season-stats' && seasonHasStats(s)) return { screen: 'stats', game };
    if (s.stage === 'market') return { screen: 'market', game };
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

/** The season's stats exist once its first competition started (also during a transfer window). */
function seasonHasStats(s: SeasonState): boolean {
  return season.isCompStage(s.stage) || s.stage === 'done' || s.stage === 'market';
}

/** Card lookup across every pool (main mode and regional), for the real agent pools on the stats screens. */
function cardById(id: string): Card | undefined {
  return findCard(ALL_ROSTERS, id.replace(/#.*$/, ''));
}

/** Base cards behind stats rows (the user's ids carry a "#user" suffix in the sim). */
function cardsOfRows(rows: readonly { cardId: string }[]): Map<string, Card> {
  const out = new Map<string, Card>();
  for (const r of rows) {
    const card = cardById(r.cardId);
    if (card) out.set(r.cardId, card);
  }
  return out;
}

/** The game, mounted by the shell once its chunk and the pool have loaded. */
export function Game() {
  const [run, setRun] = useState<RunState | null>(() => loadRun());
  const [s, setSeason] = useState<SeasonState | null>(() => loadSeason());
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [difficulty, setDifficultyState] = useState<Difficulty>(() => loadDifficulty());
  const [view, setViewState] = useState<View>({ kind: 'home' });
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const { screen, game } = screenOf(run, s, view);
  const headingRef = useRef<HTMLElement>(null);
  const mounted = useRef(false);
  const featured = useMemo(featuredCards, []);

  // New screen: back to the top, and move focus there for keyboard and screen-reader users.
  const viewKey =
    view.kind === 'series' || view.kind === 'playback' ? `${view.kind}:${view.matchId}`
    : view.kind === 'season-series' || view.kind === 'season-playback' ? `${view.kind}:${view.key}`
    : `${game}:${screen}`;
  // Not on mount: the game takes over from the shell's home page, where the user may already be scrolling.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, [viewKey]);

  useEffect(prefetchScreens, []);

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

  const setDifficulty = (d: Difficulty) => {
    setDifficultyState(d);
    saveDifficulty(d);
  };

  const startNew = (mode: DraftMode, d: Difficulty = difficulty) => {
    const next = createRun(mode, newSeed(), d);
    setRun(next);
    saveRun(next);
    setView({ kind: 'run' });
  };

  const startNewSeason = (d: Difficulty = difficulty, field?: season.FieldMode) => {
    const next = season.createSeason(newSeed(), d, field);
    setSeason(next);
    saveSeason(next);
    setView({ kind: 'season' });
  };

  /** "Recomeçar": a fresh game of the same mode, from its first screen (the old save is replaced). */
  const restart = () => {
    if (game === 'run' && run) startNew(run.mode, difficultyOf(run));
    else if (game === 'season' && s) startNewSeason(difficultyOf(s), s.field);
  };

  const viewSeries = (matchId: string) => setView({ kind: 'series', matchId });
  const viewSeasonSeries = (key: string) => setView({ kind: 'season-series', key });
  // A series just played: watch it "ao vivo", unless the OS asks for less motion (then straight to the result).
  const watchSeries = (matchId: string) => setView(reducedMotion ? { kind: 'series', matchId } : { kind: 'playback', matchId });
  const watchSeasonSeries = (key: string) => setView(reducedMotion ? { kind: 'season-series', key } : { kind: 'season-playback', key });

  // Stats of the game in progress (main nav): only once its competition has started.
  const statsTarget: View | null =
    game === 'run' && run?.tournament ? { kind: 'stats' }
    : game === 'season' && s && seasonHasStats(s) ? { kind: 'season-stats' }
    : null;
  const item = (key: string, label: string, to: View | null, active: boolean): NavItem =>
    to ? { key, label, active, onSelect: () => setView(to) } : { key, label, active };
  const nav: NavItem[] = [
    item('home', 'Início', { kind: 'home' }, screen === 'home'),
    item('stats', 'Estatísticas', statsTarget, screen === 'stats'),
    item('ranking', 'Ranking', { kind: 'ranking' }, screen === 'ranking'),
    item('history', 'Histórico', { kind: 'history' }, screen === 'history'),
    item('howto', 'Como jogar', { kind: 'howto' }, screen === 'howto'),
  ];
  const resetLabel = game === 'season' ? 'Recomeçar temporada' : 'Recomeçar run';
  const hasSaves = !!(run || s);

  return (
    <Frame
      screen={screen}
      game={game}
      nav={nav}
      onHome={() => setView({ kind: 'home' })}
      onHowTo={() => setView({ kind: 'howto' })}
      {...(game !== null ? { reset: { label: resetLabel, expanded: confirmReset, onAsk: () => setConfirmReset(true) } } : {})}
      mainRef={headingRef}
    >
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
          ready
          continueCards={
            hasSaves ? (
              <ContinueCards
                saved={run}
                savedSeason={s}
                onContinue={() => setView({ kind: 'run' })}
                onContinueSeason={() => setView({ kind: 'season' })}
              />
            ) : null
          }
          pendingSaves={0}
          hasRun={!!run}
          hasSeason={!!s}
          fanArt={<FanArt cards={featured} />}
          historyCount={history.length}
          onNew={startNew}
          onNewSeason={() => startNewSeason()}
          difficulty={difficulty}
          onDifficulty={setDifficulty}
          onHistory={() => setView({ kind: 'history' })}
          onHowTo={() => setView({ kind: 'howto' })}
          onRanking={() => setView({ kind: 'ranking' })}
        />
      )}
      <Suspense fallback={<ScreenLoading />}>
        {screen === 'howto' && <HowTo onBack={() => setView({ kind: 'home' })} />}
        {screen === 'ranking' && <Ranking onBack={() => setView({ kind: 'home' })} />}
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
      </Suspense>
    </Frame>
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
  const boardRows = useCallback(() => runAllPlayerStats(run), [run]);
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
    const rows = runStats(run);
    return (
      <Stats
        teamName={teamInfo(run, USER_ID).name}
        context={`Champions · ${MODE_LABELS[run.mode]}`}
        difficulty={difficultyOf(run)}
        rows={rows}
        cards={cardsOfRows(rows)}
        boardRows={boardRows}
        cardOf={cardById}
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
  const boardRows = useCallback((stage?: string) => seasonAllPlayerStats(s, stage as season.CompStage | undefined), [s]);
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
    const rows = seasonStats(s);
    const stages: BoardStage[] = season.COMP_STAGES.map((st) => ({
      key: st,
      label: season.STAGE_LABELS[st],
      locked: season.stageOutcome(s, st).status === 'pending',
    }));
    const lastReached = [...stages].reverse().find((st) => !st.locked)?.key ?? 'league';
    return (
      <Stats
        teamName={season.seasonTeamInfo(s, season.USER_ID).name}
        context={context}
        difficulty={difficultyOf(s)}
        rows={rows}
        cards={cardsOfRows(rows)}
        boardRows={boardRows}
        stages={stages}
        defaultStage={lastReached}
        cardOf={cardById}
        onBack={() => setView(s.stage === 'done' || s.stage === 'market' ? { kind: 'season' } : { kind: 'season-hub' })}
        backLabel={s.stage === 'done' ? 'Voltar ao resultado' : s.stage === 'market' ? 'Voltar à janela de transferências' : 'Voltar à temporada'}
      />
    );
  }
  if (screen === 'market') {
    return (
      <Market
        season={s}
        cardOf={cardById}
        onSign={(cardId, outId) => act((x) => season.signFreeAgent(x, cardId, outId))}
        onClose={() => {
          if (act(season.closeMarket)) setView({ kind: 'season-hub' });
        }}
        onStats={() => setView({ kind: 'season-stats' })}
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

