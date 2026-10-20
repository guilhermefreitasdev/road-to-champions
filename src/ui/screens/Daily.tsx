import { useEffect, useMemo, useRef, useState } from 'react';
import { dailyData, dailyPuzzle } from '../../game/daily';
import {
  DAILY_LAUNCH,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
  addDays,
  dayKeyAt,
  dayNumber,
  formatCountdown,
  formatDayKey,
  msUntilNextDay,
  puzzleNumber,
  weekdayIndex,
} from '../../game/daily/calendar';
import { CHALLENGES, CHALLENGE_LABELS, type ChallengeId } from '../../game/daily/challenges';
import type { DailyPuzzle } from '../../game/daily/generate';
import {
  DAY_MAX_POINTS,
  LINHAS_MAX_MISSES,
  PRO_MAX_TRIES,
  dailyStats,
  dayResult,
  emptyProgress,
  formatPoints,
  impostorResult,
  linhasResult,
  placarResult,
  proResult,
  settleDay,
  shareText,
  type DailyStore,
  type DayProgress,
} from '../../game/daily/play';
import { loadDailyStore, saveDailyStore } from '../dailyStorage';
import { Icon, type IconName } from '../components/Icon';
import { SharePanel } from '../components/SharePanel';
import { DailyImpostor } from './DailyImpostor';
import { DailyLinhas } from './DailyLinhas';
import { DailyPlacar } from './DailyPlacar';
import { DailyPro } from './DailyPro';

/**
 * "Diário": four challenges a day, the same for everyone, from the real data (docs/design.md, "Modo Diário").
 * Hub (the four cards, the day's result and share text, personal stats), one screen per challenge and the archive
 * of past days (replayable, not counted in the streak). Progress is saved per day in localStorage.
 */

type View = 'hub' | 'archive' | ChallengeId;

export const CHALLENGE_ICONS: Record<ChallengeId, IconName> = { linhas: 'cards', pro: 'search', impostor: 'mask', placar: 'trophy' };

const CHALLENGE_BLURBS: Record<ChallengeId, string> = {
  linhas: 'Time e evento: escreva os cinco titulares.',
  pro: 'Adivinhe o jogador com dicas que abrem a cada erro.',
  impostor: 'Cinco jogadores, um nunca jogou pelo time.',
  placar: 'Uma série real: quem venceu e por quanto?',
};

/** The current time, ticking every second (the countdown and the day change). */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function Daily({ onExit }: { onExit: () => void }) {
  const now = useNow();
  const today = dayKeyAt(now);
  const [date, setDate] = useState(today);
  const [view, setViewState] = useState<View>('hub');
  const [store, setStore] = useState<DailyStore>(loadDailyStore);
  const topRef = useRef<HTMLDivElement>(null);
  const puzzle = useMemo(() => dailyPuzzle(date), [date]);
  const data = useMemo(dailyData, []);
  const progress = store.days[date] ?? emptyProgress();
  const archive = date !== today;

  const setView = (v: View) => {
    setViewState(v);
    window.scrollTo(0, 0);
    topRef.current?.focus({ preventScroll: true });
  };

  /** Applies a move to the open day, settles it (finish day + result) and saves. */
  const update = (fn: (p: DayProgress) => DayProgress) => {
    setStore((prev) => {
      const current = prev.days[date] ?? emptyProgress();
      const next = settleDay(fn(current), puzzle, dayKeyAt(new Date()));
      const out: DailyStore = { ...prev, days: { ...prev.days, [date]: next } };
      saveDailyStore(out);
      return out;
    });
  };

  const openDay = (d: string) => {
    setDate(d);
    setView('hub');
  };

  const done = {
    linhas: progress.linhas.done,
    pro: progress.pro.done,
    impostor: progress.impostor.pick !== null,
    placar: progress.placar.done,
  };
  const nextOpen = CHALLENGES.find((c) => !done[c]);
  const goNext = () => setView(nextOpen ?? 'hub');

  return (
    <div className="screen daily" ref={topRef} tabIndex={-1}>
      <header className="screen-head daily-head">
        <p className="daily-kicker">
          <Icon name="calendar" /> Diário · {WEEKDAY_LABELS[weekdayIndex(date)]}, {formatDayKey(date)}
        </p>
        <h1>
          Diário <span className="daily-number">#{puzzleNumber(date)}</span>
        </h1>
        <p className="context">
          Quatro desafios da cena pro, iguais para todos.{' '}
          <span className="daily-level" title="Segunda é o dia mais fácil; domingo, o mais difícil.">
            Nível {puzzle.level + 1}/7
          </span>
        </p>
        <p className="daily-countdown" aria-live="off">
          <Icon name="history" /> Próximo desafio em <strong>{formatCountdown(msUntilNextDay(now))}</strong>
        </p>
      </header>

      {archive && (
        <div className="daily-archive-banner" role="note">
          <Icon name="history" />
          <span>
            Arquivo: dia {formatDayKey(date)}. Jogar um dia passado não conta para a sequência.
          </span>
          <button type="button" className="secondary" onClick={() => openDay(today)}>
            Ir para hoje
          </button>
        </div>
      )}

      {view === 'hub' && (
        <DailyHub
          puzzle={puzzle}
          progress={progress}
          store={store}
          today={today}
          onOpen={setView}
          onArchive={() => setView('archive')}
          onExit={onExit}
        />
      )}
      {view === 'archive' && <DailyArchive store={store} today={today} current={date} onOpen={openDay} onBack={() => setView('hub')} />}
      {view !== 'hub' && view !== 'archive' && (
        <section className="daily-challenge" aria-labelledby="daily-challenge-title">
          <div className="daily-challenge-top">
            <button type="button" className="ghost daily-back" onClick={() => setView('hub')}>
              <Icon name="back" /> Desafios
            </button>
            <ol className="daily-steps" aria-label="Desafios do dia">
              {CHALLENGES.map((c) => (
                <li key={c}>
                  <button
                    type="button"
                    className={`daily-step${c === view ? ' current' : ''}${done[c] ? ' done' : ''}`}
                    aria-current={c === view ? 'step' : undefined}
                    aria-label={`${CHALLENGE_LABELS[c]}${done[c] ? ' (concluído)' : ''}`}
                    onClick={() => setView(c)}
                  >
                    <Icon name={done[c] ? 'check' : CHALLENGE_ICONS[c]} />
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <h2 id="daily-challenge-title" className="daily-challenge-title">
            <Icon name={CHALLENGE_ICONS[view]} /> {CHALLENGE_LABELS[view]}
          </h2>
          {view === 'linhas' && (
            <DailyLinhas puzzle={puzzle.linhas} state={progress.linhas} players={data.playerList} onChange={(fn) => update((p) => ({ ...p, linhas: fn(p.linhas) }))} />
          )}
          {view === 'pro' && (
            <DailyPro
              puzzle={puzzle.pro}
              state={progress.pro}
              players={data.playerList}
              playerById={data.players}
              onChange={(fn) => update((p) => ({ ...p, pro: fn(p.pro) }))}
            />
          )}
          {view === 'impostor' && (
            <DailyImpostor puzzle={puzzle.impostor} state={progress.impostor} onChange={(fn) => update((p) => ({ ...p, impostor: fn(p.impostor) }))} />
          )}
          {view === 'placar' && (
            <DailyPlacar puzzle={puzzle.placar} state={progress.placar} onChange={(fn) => update((p) => ({ ...p, placar: fn(p.placar) }))} />
          )}
          {done[view] && (
            <button type="button" className="primary wide daily-next" onClick={goNext}>
              {nextOpen ? (
                <>
                  Próximo: {CHALLENGE_LABELS[nextOpen]} <Icon name="chevron" />
                </>
              ) : (
                <>
                  Ver o resultado do dia <Icon name="chevron" />
                </>
              )}
            </button>
          )}
        </section>
      )}
    </div>
  );
}

/** One line of status per challenge, for the hub cards. */
function challengeStatus(c: ChallengeId, puzzle: DailyPuzzle, p: DayProgress): { label: string; state: 'new' | 'playing' | 'won' | 'lost' } {
  switch (c) {
    case 'linhas': {
      const r = linhasResult(p.linhas, puzzle.linhas);
      if (r.done) return { label: `${r.names}/5 nomes · ${formatPoints(r.points)} pts`, state: r.won ? 'won' : 'lost' };
      if (!p.linhas.found.length && !p.linhas.misses.length) return { label: 'Novo', state: 'new' };
      return { label: `${r.names}/5 nomes · ${LINHAS_MAX_MISSES - p.linhas.misses.length} erros restantes`, state: 'playing' };
    }
    case 'pro': {
      const r = proResult(p.pro, puzzle.pro);
      if (r.done) return r.won ? { label: `Acertou na ${r.tries}ª · ${r.points} pts`, state: 'won' } : { label: 'Não acertou · 0 pts', state: 'lost' };
      if (!p.pro.guesses.length) return { label: 'Novo', state: 'new' };
      return { label: `Tentativa ${p.pro.guesses.length + 1}/${PRO_MAX_TRIES}`, state: 'playing' };
    }
    case 'impostor': {
      const r = impostorResult(p.impostor, puzzle.impostor);
      if (!r.done) return { label: 'Novo · uma chance', state: 'new' };
      return r.won ? { label: 'Certo · 5 pts', state: 'won' } : { label: 'Errou · 0 pts', state: 'lost' };
    }
    case 'placar': {
      const r = placarResult(p.placar, puzzle.placar);
      if (!r.done) return { label: 'Novo', state: 'new' };
      const what = r.scoreOk ? 'Placar certo' : r.winnerOk ? 'Só o vencedor' : 'Errou';
      return { label: `${what} · ${r.points} pts`, state: r.won ? 'won' : 'lost' };
    }
  }
}

function DailyHub({
  puzzle,
  progress,
  store,
  today,
  onOpen,
  onArchive,
  onExit,
}: {
  puzzle: DailyPuzzle;
  progress: DayProgress;
  store: DailyStore;
  today: string;
  onOpen: (c: ChallengeId) => void;
  onArchive: () => void;
  onExit: () => void;
}) {
  const result = progress.result;
  const stats = dailyStats(store, today);
  const live = dayResult(progress, puzzle);
  return (
    <>
      {result && (
        <section className="panel daily-result" aria-labelledby="daily-result-title">
          <h2 id="daily-result-title">Resultado do dia</h2>
          <p className="daily-result-big">
            <span>
              <strong>{result.wins}</strong>/4 <span className="small muted">desafios</span>
            </span>
            <span>
              <strong>{formatPoints(result.points)}</strong>/{DAY_MAX_POINTS} <span className="small muted">pontos</span>
            </span>
          </p>
          <ul className="daily-result-lines">
            {CHALLENGES.map((c) => (
              <li key={c} className={result.challenges[c].won ? 'won' : 'lost'}>
                <Icon name={result.challenges[c].won ? 'check' : 'close'} />
                <span>{CHALLENGE_LABELS[c]}</span>
                <span className="daily-result-points">{formatPoints(result.challenges[c].points)} pts</span>
              </li>
            ))}
          </ul>
          {progress.finishedOn !== puzzle.date && <p className="small muted">Jogado pelo arquivo: não conta para a sequência.</p>}
        </section>
      )}
      {result && (
        <SharePanel
          text={shareText(puzzle, progress)}
          title="Compartilhe o Diário"
          note="Sem spoiler: só os acertos, sem nomes de time ou jogador."
        />
      )}

      <ul className="daily-cards">
        {CHALLENGES.map((c, i) => {
          const status = challengeStatus(c, puzzle, progress);
          return (
            <li key={c}>
              <button type="button" className={`daily-card ${status.state}`} onClick={() => onOpen(c)}>
                <span className="daily-card-icon" aria-hidden="true">
                  <Icon name={CHALLENGE_ICONS[c]} />
                  <span className="daily-card-num">{i + 1}</span>
                </span>
                <span className="daily-card-text">
                  <strong>{CHALLENGE_LABELS[c]}</strong>
                  <span className="small muted">{CHALLENGE_BLURBS[c]}</span>
                  <span className={`daily-card-status ${status.state}`}>
                    {status.state === 'won' && <Icon name="check" />}
                    {status.state === 'lost' && <Icon name="close" />}
                    {status.label}
                  </span>
                </span>
                <span className="daily-card-go" aria-hidden="true">
                  {status.state === 'new' ? 'Jogar' : status.state === 'playing' ? 'Continuar' : 'Ver'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {!result && live.points > 0 && (
        <p className="small muted daily-partial">
          Até agora: {formatPoints(live.points)}/{DAY_MAX_POINTS} pontos. O resultado e o texto para compartilhar aparecem quando os quatro terminarem.
        </p>
      )}

      <section className="panel daily-stats" aria-labelledby="daily-stats-title">
        <h2 id="daily-stats-title">Suas estatísticas</h2>
        <dl className="daily-stat-grid">
          <div>
            <dt>Jogados</dt>
            <dd>{stats.played}</dd>
          </div>
          <div>
            <dt>Média</dt>
            <dd>{stats.played ? formatPoints(Math.round(stats.average * 10) / 10) : '—'}</dd>
          </div>
          <div>
            <dt>Melhor</dt>
            <dd>{stats.played ? formatPoints(stats.best) : '—'}</dd>
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
        </dl>
        {stats.played > 0 && (
          <div className="daily-dist" role="img" aria-label={`Dias por desafios vencidos: ${stats.wins.map((n, w) => `${w} de 4: ${n}`).join(', ')}`}>
            {stats.wins.map((n, w) => (
              <span key={w} className="daily-dist-row" aria-hidden="true">
                <span className="daily-dist-label">{w}/4</span>
                <span className="daily-dist-bar" style={{ width: `${Math.max(4, (n / Math.max(1, ...stats.wins)) * 100)}%` }}>
                  {n}
                </span>
              </span>
            ))}
          </div>
        )}
        <p className="small muted">
          Pontos por dia: até {DAY_MAX_POINTS} (5 por desafio). A sequência conta os dias terminados no próprio dia (meia-noite de Brasília). Tudo fica salvo
          só neste navegador.
        </p>
      </section>

      <div className="daily-actions">
        <button type="button" className="secondary" onClick={onArchive}>
          <Icon name="calendar" /> Arquivo de dias
        </button>
        <button type="button" className="ghost" onClick={onExit}>
          <Icon name="back" /> Voltar ao início
        </button>
      </div>
      <p className="small muted daily-source">
        Todos os desafios saem dos dados reais da base do jogo: eventos internacionais do VCT desde 2021 e ligas regionais desde 2023 (VLR.gg), elencos da
        Liquipedia. Nada é inventado.
      </p>
    </>
  );
}

const ARCHIVE_PAGE = 30;

function DailyArchive({
  store,
  today,
  current,
  onOpen,
  onBack,
}: {
  store: DailyStore;
  today: string;
  current: string;
  onOpen: (date: string) => void;
  onBack: () => void;
}) {
  const [shown, setShown] = useState(ARCHIVE_PAGE);
  const total = Math.max(0, dayNumber(today) - dayNumber(DAILY_LAUNCH) + 1);
  const days = Array.from({ length: Math.min(shown, total) }, (_, i) => addDays(today, -i));
  return (
    <section className="panel daily-archive" aria-labelledby="daily-archive-title">
      <h2 id="daily-archive-title">Arquivo</h2>
      <p className="small muted">Jogue qualquer dia desde o #1. Dias passados não contam para a sequência.</p>
      <ul className="daily-archive-list">
        {days.map((d) => {
          const p = store.days[d];
          const status = p?.result
            ? `${p.result.wins}/4 · ${formatPoints(p.result.points)} pts`
            : p && (p.linhas.found.length || p.linhas.done || p.pro.guesses.length || p.impostor.pick || p.placar.done)
              ? 'Em andamento'
              : 'Não jogado';
          return (
            <li key={d}>
              <button type="button" className={`daily-archive-item${d === current ? ' current' : ''}`} onClick={() => onOpen(d)}>
                <span className="daily-archive-num">#{puzzleNumber(d)}</span>
                <span className="daily-archive-date">
                  {d === today ? 'Hoje' : WEEKDAY_SHORT[weekdayIndex(d)]} · {formatDayKey(d)}
                </span>
                <span className={`daily-archive-status${p?.result ? ' done' : ''}`}>{status}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {shown < total && (
        <button type="button" className="secondary wide" onClick={() => setShown((n) => n + ARCHIVE_PAGE)}>
          Mostrar mais dias
        </button>
      )}
      <button type="button" className="ghost" onClick={onBack}>
        <Icon name="back" /> Voltar aos desafios
      </button>
    </section>
  );
}
