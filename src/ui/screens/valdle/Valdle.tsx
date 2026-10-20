import { useEffect, useMemo, useRef, useState } from 'react';
import { dayKeyAt, formatCountdown, msUntilNextDay } from '../../../game/daily/calendar';
import { AGENT_COLUMNS, WEAPON_COLUMNS } from '../../../game/valdle/classic';
import { classicData, classicDaily } from '../../../game/valdle/classicIndex';
import { compareAll, type Mark } from '../../../game/valdle/feedback';
import { GROUP_GAMES, VALDLE_GAMES, VALDLE_LAUNCH, valdleNumber, type ValdleGameId, type ValdleGroup } from '../../../game/valdle/games';
import {
  emptyProgress,
  gameStats,
  isDone,
  mapaSummary,
  resultOf,
  shareText,
  updateDaily,
  type ValdleProgress,
  type ValdlePuzzle,
  type ValdleStore,
} from '../../../game/valdle/play';
import { proColumns } from '../../../game/valdle/pro';
import { proDaily, proIndex } from '../../../game/valdle/proIndex';
import { Icon, type IconName } from '../../components/Icon';
import { SharePanel } from '../../components/SharePanel';
import { loadValdleStore, saveValdleStore } from '../../valdleStorage';
import { AgenteGame, ArmaGame, CalloutGame, HabilidadeGame, MapaGame } from './classicGames';
import { CabeloGame, CompGame, ConexoesGame, GradeGame, ProGame } from './proGames';

/**
 * "Valdle" (Outros modos), in two versions: "Cena pro" (the real pool) and "Jogo clássico" (the game itself). Each
 * game has a daily puzzle (the same for everyone, #N since the launch, new at midnight in São Paulo); there is no free
 * mode. Progress and streaks are saved in rtc:valdle:v1.
 */

export const GAME_ICONS: Record<ValdleGameId, IconName> = {
  agente: 'you',
  habilidade: 'flame',
  mapa: 'globe',
  callout: 'target',
  arma: 'kill',
  pro: 'search',
  cabelo: 'portrait',
  grade: 'grid',
  conexoes: 'link',
  comp: 'cards',
};

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function puzzleFor(game: ValdleGameId, date: string): ValdlePuzzle {
  const classic = VALDLE_GAMES[game].group === 'classico';
  return (classic ? classicDaily(game as 'agente', date) : proDaily(game as 'pro', date)) as ValdlePuzzle;
}

/** Per-guess marks of the games with columns (for the share text). */
function marksOf(puzzle: ValdlePuzzle, progress: ValdleProgress): Mark[][] | undefined {
  if (puzzle.game === 'agente' || puzzle.game === 'arma') {
    const data = classicData();
    if (puzzle.game === 'agente') {
      const a = data.agentById.get((puzzle as ValdlePuzzle<'agente'>).answer)!;
      return progress.guesses.flatMap((id) => {
        const g = data.agentById.get(id);
        return g ? [compareAll(AGENT_COLUMNS, g, a).map((f) => f.mark)] : [];
      });
    }
    const a = data.weaponById.get((puzzle as ValdlePuzzle<'arma'>).answer)!;
    return progress.guesses.flatMap((id) => {
      const g = data.weaponById.get(id);
      return g ? [compareAll(WEAPON_COLUMNS, g, a).map((f) => f.mark)] : [];
    });
  }
  if (puzzle.game === 'pro') {
    const idx = proIndex();
    const cols = proColumns(idx);
    const a = idx.facts.get((puzzle as ValdlePuzzle<'pro'>).answer)!;
    return progress.guesses.flatMap((id) => {
      const g = idx.facts.get(id);
      return g ? [compareAll(cols, g, a).map((f) => f.mark)] : [];
    });
  }
  return undefined;
}

export function ValdleCena({ onBack }: { onBack: () => void }) {
  return <Valdle group="cena" onBack={onBack} />;
}

export function ValdleClassico({ onBack }: { onBack: () => void }) {
  return <Valdle group="classico" onBack={onBack} />;
}

function Valdle({ group, onBack }: { group: ValdleGroup; onBack: () => void }) {
  const now = useNow();
  const today = dayKeyAt(now);
  const date = today < VALDLE_LAUNCH ? VALDLE_LAUNCH : today;
  const [store, setStore] = useState<ValdleStore>(loadValdleStore);
  const [game, setGameState] = useState<ValdleGameId | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const focusTop = () => {
    window.scrollTo(0, 0);
    topRef.current?.focus({ preventScroll: true });
  };
  const openGame = (g: ValdleGameId | null) => {
    setGameState(g);
    focusTop();
  };

  const commit = (fn: (s: ValdleStore) => ValdleStore) =>
    setStore((prev) => {
      const next = fn(prev);
      saveValdleStore(next);
      return next;
    });

  const puzzle = useMemo(() => (game ? puzzleFor(game, date) : null), [game, date]);
  const progress: ValdleProgress = game ? (store.daily[game]?.[date] ?? emptyProgress()) : emptyProgress();

  const onMove = (fn: (p: ValdleProgress) => ValdleProgress) => {
    if (!puzzle) return;
    commit((s) => updateDaily(s, puzzle, fn, dayKeyAt(new Date())));
  };

  const games = GROUP_GAMES[group];
  return (
    <div className="screen daily valdle" ref={topRef} tabIndex={-1}>
      <header className="screen-head daily-head">
        <p className="daily-kicker">
          <Icon name="puzzle" /> Outros modos · Valdle
        </p>
        <h1>{group === 'cena' ? 'Cena pro' : 'Jogo clássico'}</h1>
        <p className="context">
          {group === 'cena'
            ? 'Desafios sobre os pros, os times e as séries reais da nossa base.'
            : 'Desafios só sobre o Valorant: agentes, habilidades, mapas, callouts e armas.'}
        </p>
        <p className="daily-countdown" aria-live="off">
          <Icon name="history" /> Novos desafios em <strong>{formatCountdown(msUntilNextDay(now))}</strong>
        </p>
      </header>

      {!game && <GameList group={group} store={store} date={date} onOpen={openGame} onBack={onBack} />}

      {game && (
        <section className="daily-challenge vd-challenge" aria-labelledby="vd-title">
          <div className="daily-challenge-top">
            <button type="button" className="ghost daily-back" onClick={() => openGame(null)}>
              <Icon name="back" /> Jogos
            </button>
            <ol className="daily-steps" aria-label="Jogos">
              {games.map((g) => (
                <li key={g}>
                  <button
                    type="button"
                    className={`daily-step${g === game ? ' current' : ''}${store.daily[g]?.[date]?.result ? ' done' : ''}`}
                    aria-current={g === game ? 'step' : undefined}
                    aria-label={VALDLE_GAMES[g].label}
                    title={VALDLE_GAMES[g].label}
                    onClick={() => openGame(g)}
                  >
                    <Icon name={GAME_ICONS[g]} />
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <h2 id="vd-title" className="daily-challenge-title">
            <Icon name={GAME_ICONS[game]} /> {VALDLE_GAMES[game].label}
          </h2>
          <p className="vd-daily-tag">
            <Icon name="calendar" /> Diário #{valdleNumber(date)}
          </p>
          {puzzle && (
            <GameView
              key={`${game}:${puzzle.id}`}
              puzzle={puzzle}
              progress={progress}
              onMove={onMove}
              store={store}
              today={date}
            />
          )}
        </section>
      )}
    </div>
  );
}

function GameList({
  group,
  store,
  date,
  onOpen,
  onBack,
}: {
  group: ValdleGroup;
  store: ValdleStore;
  date: string;
  onOpen: (g: ValdleGameId) => void;
  onBack: () => void;
}) {
  return (
    <>
      <ul className="daily-cards vd-cards">
        {GROUP_GAMES[group].map((g) => {
          const p = store.daily[g]?.[date];
          const r = p?.result;
          const stats = gameStats(store, g, date);
          const state = r ? (r.won ? 'won' : 'lost') : p?.guesses.length ? 'playing' : 'new';
          const label = r
            ? g === 'mapa'
              ? mapaSummary(r, false)
              : r.won
                ? g === 'grade' || g === 'conexoes'
                  ? `Completo · ${r.score}/${r.max}`
                  : `Acertou em ${r.tries}`
                : g === 'grade' || g === 'conexoes'
                  ? `${r.score}/${r.max}`
                  : 'Não acertou'
            : p?.guesses.length
              ? 'Em andamento'
              : `Novo · #${valdleNumber(date)}`;
          return (
            <li key={g}>
              <button type="button" className={`daily-card ${state}`} onClick={() => onOpen(g)}>
                <span className="daily-card-icon" aria-hidden="true">
                  <Icon name={GAME_ICONS[g]} />
                </span>
                <span className="daily-card-text">
                  <strong>{VALDLE_GAMES[g].label}</strong>
                  <span className="small muted">{VALDLE_GAMES[g].blurb}</span>
                  <span className={`daily-card-status ${state}`}>
                    {state === 'won' && <Icon name="check" />}
                    {state === 'lost' && <Icon name="close" />}
                    {label}
                    {stats.streak > 0 && (
                      <span className="vd-streak">
                        <Icon name="flame" /> {stats.streak}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="daily-actions">
        <button type="button" className="ghost" onClick={onBack}>
          <Icon name="back" /> Outros modos
        </button>
      </div>
      <p className="small muted daily-source">
        {group === 'cena'
          ? 'Tudo sai dos dados reais da base: eventos internacionais do VCT desde 2021 e ligas regionais desde 2023 (VLR.gg), elencos da Liquipedia. Nada é inventado.'
          : 'Agentes, habilidades, mapas, callouts e armas do snapshot do valorant-api.com (dados da Riot Games); imagens do Mapa: VALORANT Wiki. Nada é inventado.'}{' '}
        Um desafio por jogo e por dia, igual para todos.
      </p>
    </>
  );
}

function GameView({
  puzzle,
  progress,
  onMove,
  store,
  today,
}: {
  puzzle: ValdlePuzzle;
  progress: ValdleProgress;
  onMove: (fn: (p: ValdleProgress) => ValdleProgress) => void;
  store: ValdleStore;
  today: string;
}) {
  const done = isDone(puzzle.game, puzzle, progress);
  const common = { progress, done, onMove };
  const body = (() => {
    switch (puzzle.game) {
      case 'agente':
        return <AgenteGame {...common} puzzle={puzzle as ValdlePuzzle<'agente'>} data={classicData()} />;
      case 'habilidade':
        return <HabilidadeGame {...common} puzzle={puzzle as ValdlePuzzle<'habilidade'>} data={classicData()} />;
      case 'mapa':
        return <MapaGame {...common} puzzle={puzzle as ValdlePuzzle<'mapa'>} data={classicData()} />;
      case 'callout':
        return <CalloutGame {...common} puzzle={puzzle as ValdlePuzzle<'callout'>} data={classicData()} />;
      case 'arma':
        return <ArmaGame {...common} puzzle={puzzle as ValdlePuzzle<'arma'>} data={classicData()} />;
      case 'pro':
        return <ProGame {...common} puzzle={puzzle as ValdlePuzzle<'pro'>} index={proIndex()} />;
      case 'cabelo':
        return <CabeloGame {...common} puzzle={puzzle as ValdlePuzzle<'cabelo'>} index={proIndex()} />;
      case 'grade':
        return <GradeGame {...common} puzzle={puzzle as ValdlePuzzle<'grade'>} index={proIndex()} />;
      case 'conexoes':
        return <ConexoesGame {...common} puzzle={puzzle as ValdlePuzzle<'conexoes'>} index={proIndex()} />;
      case 'comp':
        return <CompGame {...common} puzzle={puzzle as ValdlePuzzle<'comp'>} index={proIndex()} />;
    }
  })();
  const stats = gameStats(store, puzzle.game, today);
  const result = done ? resultOf(puzzle, progress) : null;
  return (
    <>
      {body}
      {done && result && (
        <SharePanel
          text={shareText(puzzle, progress, marksOf(puzzle, progress))}
          title="Compartilhe o resultado"
          note="Sem spoiler: só os acertos de cada palpite, sem nomes."
        />
      )}
      <Stats game={puzzle.game} stats={stats} />
    </>
  );
}

function Stats({ game, stats }: { game: ValdleGameId; stats: ReturnType<typeof gameStats> }) {
  const max = Math.max(1, ...stats.dist);
  const distLabel = (i: number) => (game === 'grade' ? `${i}/9` : game === 'conexoes' ? `${i} err.` : `${i + 1}ª`);
  return (
    <section className="panel daily-stats" aria-labelledby="vd-stats-title">
      <h2 id="vd-stats-title">Suas estatísticas · {VALDLE_GAMES[game].label}</h2>
      <dl className="daily-stat-grid">
        <div>
          <dt>Diários</dt>
          <dd>{stats.played}</dd>
        </div>
        <div>
          <dt>Vitórias</dt>
          <dd>{stats.played ? `${Math.round((stats.won / stats.played) * 100)}%` : '—'}</dd>
        </div>
        <div>
          <dt>
            <Icon name="flame" /> Sequência
          </dt>
          <dd>{stats.streak}</dd>
        </div>
        <div>
          <dt>Recorde</dt>
          <dd>{stats.bestStreak}</dd>
        </div>
        {game === 'mapa' && (
          <div>
            <dt>Lugar certo</dt>
            <dd>{stats.played ? `${Math.round(((stats.placeFound ?? 0) / stats.played) * 100)}%` : '—'}</dd>
          </div>
        )}
      </dl>
      {stats.played > 0 && (
        <div className="daily-dist" role="img" aria-label={`Distribuição: ${stats.dist.map((n, i) => `${distLabel(i)}: ${n}`).join(', ')}`}>
          {stats.dist.map((n, i) => (
            <span key={i} className="daily-dist-row" aria-hidden="true">
              <span className="daily-dist-label vd-dist-label">{distLabel(i)}</span>
              <span className="daily-dist-bar" style={{ width: `${Math.max(4, (n / max) * 100)}%` }}>
                {n}
              </span>
            </span>
          ))}
        </div>
      )}
      <p className="small muted">
        {game === 'grade'
          ? 'Distribuição: grades por casas preenchidas.'
          : game === 'conexoes'
            ? 'Distribuição: vitórias por número de erros.'
            : game === 'mapa'
              ? 'Distribuição: mapas acertados por tentativa; "Lugar certo": diários em que achou o lugar no Onde é?.'
              : 'Distribuição: vitórias por tentativa.'}{' '}
        A sequência conta os diários vencidos no próprio dia (meia-noite de Brasília). Tudo fica salvo só neste navegador.
      </p>
    </section>
  );
}
