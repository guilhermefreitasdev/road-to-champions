import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { agentByName } from '../../../data/game';
import {
  HINT_AFTER,
  HINT_KINDS,
  MAX_TRIES,
  TRY_POINTS,
  acesDailyPuzzle,
  acesStats,
  emptyAceProgress,
  eventHintText,
  feedback,
  freeAcePuzzle,
  giveUp,
  guess,
  hints,
  playableAces,
  progressFor,
  puzzleOf,
  recordFree,
  result,
  reveal,
  settle,
  share,
  type AceProgress,
  type AcePuzzle,
  type AceReveal,
  type AcesStats,
  type Comparison,
  type FreeFilter,
  type GuessFeedback,
  type HintKind,
} from '../../../game/aces';
import { dailyData } from '../../../game/daily';
import { DAILY_LAUNCH, dayKeyAt, formatCountdown, msUntilNextDay } from '../../../game/daily/calendar';
import type { DailyPlayer } from '../../../game/daily/data';
import { REGION_NAMES } from '../../../game/daily/labels';
import { ROLE_LABELS } from '../../../game/explain';
import { CountryChip, countryName } from '../../components/CountryChip';
import { AgentIcon, mapLabel } from '../../components/GameImage';
import { Icon } from '../../components/Icon';
import { PlayerCard } from '../../components/PlayerCard';
import { PlayerPhoto } from '../../components/PlayerPhoto';
import { PlayerSearch } from '../../components/PlayerSearch';
import { SharePanel } from '../../components/SharePanel';
import { TeamLogo } from '../../components/TeamLogo';
import { loadAcesStore, saveAcesStore, type AcesStore } from '../../acesStorage';
import { GiveUp, TryCounter } from '../valdle/parts';
import { AcePlayer } from './AcePlayer';

/**
 * "Acerte o ace" (Outros modos, docs/aces.md): the player watches a real pro ace in a click-to-load YouTube embed
 * (./AcePlayer.tsx) and guesses whose it is, up to 5 tries. The screen only ever holds the puzzle (a neutral id and
 * the embed); every fact that names the pro (title, channel, team, event, description) comes from the game API's
 * `reveal`, `hints` and `feedback`, which give nothing away before the rules allow it. Daily (#N, the same for
 * everyone) and free mode; progress, streak and the free round are saved in rtc:aces:v1 (../../acesStorage.ts).
 */

type Mode = 'daily' | 'free';

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** A free-mode seed (UI only: the pick itself is the seeded engine's). */
const randomSeed = () => Math.random().toString(36).slice(2, 10);

type TierFilter = 'all' | 'masters' | 'champions';

function freeFilter(tier: TierFilter, neutralOnly: boolean): FreeFilter {
  return { ...(tier === 'all' ? {} : { tier }), ...(neutralOnly ? { neutralOnly: true } : {}) };
}

/** The saved free round, if its ace still exists and is playable. */
function freeRound(store: AcesStore): { puzzle: AcePuzzle; progress: AceProgress } | null {
  const cur = store.save.free.current;
  if (!cur || !playableAces().some((a) => a.id === cur.aceId)) return null;
  return { puzzle: puzzleOf(cur.aceId), progress: progressFor(cur.progress, cur.aceId) };
}

export function Ace({ onBack }: { onBack: () => void }) {
  const now = useNow();
  const today = dayKeyAt(now);
  const date = today < DAILY_LAUNCH ? DAILY_LAUNCH : today;
  const [store, setStore] = useState<AcesStore>(loadAcesStore);
  const [mode, setMode] = useState<Mode>('daily');
  const [tier, setTier] = useState<TierFilter>('all');
  const [neutralOnly, setNeutralOnly] = useState(false);
  const [empty, setEmpty] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const commit = (fn: (s: AcesStore) => AcesStore) =>
    setStore((prev) => {
      const next = fn(prev);
      if (next !== prev) saveAcesStore(next);
      return next;
    });

  const daily = useMemo(() => acesDailyPuzzle(date), [date]);
  const dailyProgress = progressFor(store.save.days[date], daily.aceId);
  const free = useMemo(() => freeRound(store), [store]);

  /** Draws a new free ace (skipping the recent ones, the unavailable ones and `skip`), replacing the current round. */
  const drawFree = (skip?: string) => {
    const exclude = [...store.save.free.recent, ...Object.keys(store.unavailable), ...(skip ? [skip] : [])];
    const pick = freeAcePuzzle(randomSeed(), { ...freeFilter(tier, neutralOnly), exclude });
    setEmpty(!pick);
    if (!pick) return;
    commit((s) => ({ ...s, save: { ...s.save, free: { ...s.save.free, current: { aceId: pick.aceId, progress: emptyAceProgress(pick.aceId) } } } }));
  };

  // Free mode: a round is always open (a new draw the first time, or when the saved ace left the data).
  useEffect(() => {
    if (mode === 'free' && !free) drawFree();
  }, [mode, free]);

  const switchMode = (m: Mode) => {
    setMode(m);
    window.scrollTo(0, 0);
    topRef.current?.focus({ preventScroll: true });
  };

  const onMove = (fn: (p: AceProgress) => AceProgress) => {
    const stamp = dayKeyAt(new Date());
    if (mode === 'daily') {
      commit((s) => {
        const prev = progressFor(s.save.days[date], daily.aceId);
        const next = settle(daily.aceId, fn(prev), stamp);
        return { ...s, save: { ...s.save, days: { ...s.save.days, [date]: next } } };
      });
      return;
    }
    commit((s) => {
      const cur = s.save.free.current;
      if (!cur) return s;
      const prev = progressFor(cur.progress, cur.aceId);
      const next = settle(cur.aceId, fn(prev), stamp);
      // Counted once, when the round ends; the finished round stays open (reveal) until the next draw.
      const save = next.done && !prev.done ? recordFree(s.save, cur.aceId, next.result!) : s.save;
      return { ...s, save: { ...save, free: { ...save.free, current: { aceId: cur.aceId, progress: next } } } };
    });
  };

  const markUnavailable = (aceId: string) =>
    commit((s) => (s.unavailable[aceId] ? s : { ...s, unavailable: { ...s.unavailable, [aceId]: dayKeyAt(new Date()) } }));

  const round = mode === 'daily' ? { puzzle: daily as AcePuzzle, progress: dailyProgress } : free;
  const stats = acesStats(store.save, date);

  return (
    <div className="screen daily valdle ace" ref={topRef} tabIndex={-1}>
      <header className="screen-head daily-head">
        <p className="daily-kicker">
          <Icon name="puzzle" /> Outros modos · Acerte o ace
        </p>
        <h1>Acerte o ace</h1>
        <p className="context">Assista a um ace real de um pro e descubra de quem é. Cinco tentativas; cada erro compara o seu palpite com a resposta.</p>
        <p className="daily-countdown" aria-live="off">
          <Icon name="history" /> Novo ace diário em <strong>{formatCountdown(msUntilNextDay(now))}</strong>
        </p>
      </header>

      <section className="daily-challenge vd-challenge ace-challenge" aria-label="Desafio">
        <div className="daily-challenge-top">
          <button type="button" className="ghost daily-back" onClick={onBack}>
            <Icon name="back" /> Outros modos
          </button>
          <div className="vd-modes" role="tablist" aria-label="Modo">
            <button type="button" role="tab" aria-selected={mode === 'daily'} className={`vd-mode${mode === 'daily' ? ' on' : ''}`} onClick={() => switchMode('daily')}>
              <Icon name="calendar" /> Diário #{daily.number}
            </button>
            <button type="button" role="tab" aria-selected={mode === 'free'} className={`vd-mode${mode === 'free' ? ' on' : ''}`} onClick={() => switchMode('free')}>
              <Icon name="dice" /> Modo livre
            </button>
          </div>
        </div>

        {mode === 'free' && (
          <FreeControls
            tier={tier}
            neutralOnly={neutralOnly}
            onTier={setTier}
            onNeutral={setNeutralOnly}
            empty={empty}
            canSkip={!!free && !free.progress.done}
            onSkip={() => drawFree(free?.puzzle.aceId)}
          />
        )}

        {round && (
          <AceRound
            key={`${mode}:${round.puzzle.aceId}`}
            mode={mode}
            puzzle={round.puzzle}
            number={mode === 'daily' ? daily.number : null}
            progress={round.progress}
            onMove={onMove}
            onUnavailable={() => markUnavailable(round.puzzle.aceId)}
            onNewFree={() => drawFree(round.puzzle.aceId)}
            onFree={() => switchMode('free')}
            shareText={mode === 'daily' && dailyProgress.done ? share(daily, dailyProgress) : null}
          />
        )}
      </section>

      <AceStats stats={stats} free={store.save.free} />

      <p className="small muted daily-source">
        Aces conferidos na aba Performance das partidas do VLR.gg (round, vítimas, agente); vídeos do YouTube embutidos só depois do clique, pelo
        youtube-nocookie.com, com crédito ao canal na revelação. Um ace diário igual para todos (meia-noite de Brasília); o modo livre não conta para a
        sequência. Direitos dos vídeos: canais e Riot Games. Projeto de fã, sem afiliação com a Riot Games.
      </p>
    </div>
  );
}

function FreeControls({
  tier,
  neutralOnly,
  onTier,
  onNeutral,
  empty,
  canSkip,
  onSkip,
}: {
  tier: TierFilter;
  neutralOnly: boolean;
  onTier: (t: TierFilter) => void;
  onNeutral: (v: boolean) => void;
  empty: boolean;
  canSkip: boolean;
  onSkip: () => void;
}) {
  return (
    <div className="ace-free-controls">
      <label className="ace-filter">
        <span className="small muted">Eventos</span>
        <select value={tier} onChange={(e) => onTier(e.target.value as TierFilter)}>
          <option value="all">Todos</option>
          <option value="masters">Masters e LOCK//IN</option>
          <option value="champions">Champions</option>
        </select>
      </label>
      <label className="ace-filter ace-filter-check">
        <input type="checkbox" checked={neutralOnly} onChange={(e) => onNeutral(e.target.checked)} />
        <span className="small">Só vídeos cujo título não diz o nome</span>
      </label>
      {canSkip && (
        <button type="button" className="ghost" onClick={onSkip}>
          <Icon name="dice" /> Sortear outro ace
        </button>
      )}
      <p className="small muted ace-free-note">
        {empty ? 'Nenhum ace com esses filtros. Mude os filtros e sorteie de novo.' : 'Os filtros valem para o próximo sorteio. O modo livre evita os últimos 30 aces vistos.'}
      </p>
    </div>
  );
}

function AceRound({
  mode,
  puzzle,
  number,
  progress,
  onMove,
  onUnavailable,
  onNewFree,
  onFree,
  shareText,
}: {
  mode: Mode;
  puzzle: AcePuzzle;
  number: number | null;
  progress: AceProgress;
  onMove: (fn: (p: AceProgress) => AceProgress) => void;
  onUnavailable: () => void;
  onNewFree: () => void;
  onFree: () => void;
  shareText: string | null;
}) {
  const [note, setNote] = useState<string | null>(null);
  const data = dailyData();
  const id = puzzle.aceId;
  const done = progress.done;
  const fb = feedback(id, progress);
  const open = new Map(hints(id, progress).map((h) => [h.kind, h]));
  const misses = fb.filter((f) => !f.correct).length;
  const res = done ? result(id, progress) : null;
  const rev = done ? reveal(id, progress) : null;

  const pick = (p: DailyPlayer) => {
    const r = guess(id, progress, { playerId: p.playerId, handle: p.handle });
    setNote(r.outcome === 'repeat' ? `Você já tentou ${p.handle}.` : r.outcome === 'miss' ? `Não é ${p.handle}.` : null);
    if (r.outcome === 'hit' || r.outcome === 'miss') onMove(() => r.state);
  };

  return (
    <div className="vd-game ace-round">
      <AcePlayer
        embed={puzzle.embed}
        kicker={number !== null ? `Acerte o ace · Diário #${number}` : 'Acerte o ace · Modo livre'}
        onUnavailable={onUnavailable}
        extra={
          mode === 'free' && !done ? (
            <button type="button" className="secondary" onClick={onNewFree}>
              <Icon name="dice" /> Sortear outro ace
            </button>
          ) : null
        }
      />
      <p className="small muted ace-honesty">
        <Icon name="help" /> O YouTube pode mostrar o título do vídeo por alguns segundos ao começar ou ao passar o mouse; vale a honestidade.
      </p>

      {!done && <p className="daily-rule">De quem é este ace? Cada erro compara o seu palpite com a resposta. Depois de 2 erros abre o evento; depois de 4, o time.</p>}

      <ol className="daily-clues vd-clues ace-hints" aria-label="Dicas">
        {HINT_KINDS.map((k) => (
          <HintSlot key={k} kind={k} text={open.get(k)?.text ?? null} misses={misses} />
        ))}
      </ol>

      {fb.length > 0 && (
        <ol className="vd-rows" aria-label="Seus palpites">
          {fb.map((f, i) => (
            <GuessRow key={f.guess.playerId ?? f.guess.handle} n={i + 1} f={f} player={f.guess.playerId ? data.players.get(f.guess.playerId) : undefined} />
          ))}
        </ol>
      )}

      {!done && (
        <>
          <TryCounter used={progress.guesses.length} max={MAX_TRIES} />
          <PlayerSearch players={data.playerList} onPick={pick} label="De quem é o ace?" placeholder="Digite o nome do pro" />
          {note && (
            <p className="daily-feedback info" role="status">
              <Icon name="warning" /> {note}
            </p>
          )}
          <GiveUp onGiveUp={() => onMove(giveUp)} />
        </>
      )}

      {done && res && (
        <p className={`daily-feedback ${res.solved ? 'hit' : 'miss'} ace-result`} role="status">
          <Icon name={res.solved ? 'check' : 'close'} />{' '}
          {res.solved
            ? `Acertou na ${res.tries}ª tentativa: ${res.points}/${TRY_POINTS[0]} pts.`
            : progress.gaveUp
              ? `Você desistiu: 0/${TRY_POINTS[0]} pts.`
              : `Não foi desta vez: 0/${TRY_POINTS[0]} pts.`}
        </p>
      )}

      {done && rev && <RevealPanel rev={rev} solved={!!res?.solved} />}

      {done && shareText && <SharePanel text={shareText} title="Compartilhe o resultado" note="Sem spoiler: só os pontos e os acertos de cada palpite, sem nomes." />}

      {done && (
        <div className="vd-next">
          {mode === 'free' ? (
            <button type="button" className="primary wide" onClick={onNewFree}>
              <Icon name="dice" /> Novo ace livre
            </button>
          ) : (
            <button type="button" className="secondary wide" onClick={onFree}>
              <Icon name="dice" /> Jogar mais no modo livre
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const HINT_TITLES: Record<HintKind, string> = { event: 'Evento', team: 'Time do pro' };

function HintSlot({ kind, text, misses }: { kind: HintKind; text: string | null; misses: number }) {
  const left = HINT_AFTER[kind] - misses;
  return (
    <li className={`daily-clue${text !== null ? ' open' : ''}`}>
      <span className="daily-clue-head">{HINT_TITLES[kind]}</span>
      <span className="daily-clue-body">
        {text !== null ? (
          <span translate="no">{text}</span>
        ) : (
          <span className="muted small">
            <Icon name="lock" /> Abre após o {HINT_AFTER[kind]}º erro{left > 0 && left < HINT_AFTER[kind] ? ` (falta${left > 1 ? 'm' : ''} ${left})` : ''}
          </span>
        )}
      </span>
    </li>
  );
}

type CellMark = 'hit' | 'miss' | 'unknown';
const MARK_TEXT: Record<CellMark, string> = { hit: 'igual à resposta', miss: 'diferente da resposta', unknown: 'sem dado' };

function Cell({ label, value, mark, arrow }: { label: string; value: ReactNode; mark: CellMark; arrow?: 'up' | 'down' }) {
  return (
    <span className={`vd-cell ${mark === 'unknown' ? 'ace-unknown' : mark}`}>
      <span className="vd-cell-label">{label}</span>
      <span className="vd-cell-value">
        {value}
        {arrow && <Icon name={arrow} className="vd-cell-arrow" />}
      </span>
      <span className="sr-only">
        {MARK_TEXT[mark]}
        {arrow ? `, a resposta estreou ${arrow === 'up' ? 'depois' : 'antes'}` : ''}
      </span>
    </span>
  );
}

const m3 = (m: Comparison['country']): CellMark => (m === 'same' ? 'hit' : m === 'diff' ? 'miss' : 'unknown');

function GuessRow({ n, f, player }: { n: number; f: GuessFeedback; player: DailyPlayer | undefined }) {
  const c = f.comparison;
  return (
    <li className={`vd-row${f.correct ? ' hit' : ''}`}>
      <span className="vd-row-head">
        <span className="vd-row-n">{n}</span>
        <strong translate="no">{f.guess.handle}</strong>
        {player?.country && <CountryChip code={player.country} />}
        {f.correct ? <Icon name="check" className="vd-row-check" /> : <Icon name="close" className="vd-row-check ace-miss-icon" />}
      </span>
      {c && (
        <span className="vd-cells">
          <Cell label="País" value={player?.country ? countryName(player.country) : '—'} mark={m3(c.country)} />
          <Cell label="Região" value={player?.region ? REGION_NAMES[player.region] : '—'} mark={m3(c.region)} />
          <Cell label="Função" value={player ? ROLE_LABELS[player.role] : '—'} mark={m3(c.role)} />
          <Cell
            label="Estreia"
            value={player?.firstYear ?? '—'}
            mark={c.debut === 'same' ? 'hit' : c.debut === 'unknown' ? 'unknown' : 'miss'}
            arrow={c.debut === 'earlier' ? 'down' : c.debut === 'later' ? 'up' : undefined}
          />
          <Cell label="Mesmo time" value={c.teammate === null ? '—' : c.teammate ? 'Sim' : 'Não'} mark={c.teammate === null ? 'unknown' : c.teammate ? 'hit' : 'miss'} />
        </span>
      )}
    </li>
  );
}

const SIDE_LABELS = { atk: 'ataque', def: 'defesa' } as const;
const agentLabel = (a: string) => agentByName(a)?.displayName ?? a;

function RevealPanel({ rev, solved }: { rev: AceReveal; solved: boolean }) {
  const { ace, video } = rev;
  const data = dailyData();
  const player = ace.playerId ? data.players.get(ace.playerId) : undefined;
  const card =
    player?.cards.find((c) => c.card.eventId === ace.event.eventId && c.card.teamId === ace.team.teamId)?.card ??
    player?.cards.find((c) => c.card.eventId === ace.event.eventId)?.card;
  const eventId = ace.event.eventId ?? undefined;
  const sources = rev.sources.filter((s) => s !== rev.vlrUrl && s !== video.url);
  return (
    <section className={`panel daily-reveal ace-reveal ${solved ? 'won' : 'lost'}`} aria-labelledby="ace-reveal-title">
      <p className="daily-reveal-kicker" id="ace-reveal-title">
        {solved ? 'Acertou! O ace era de' : 'O ace era de'}
      </p>
      <div className="ace-reveal-who">
        {card ? (
          <PlayerCard card={card} />
        ) : (
          <span className="ace-reveal-name">
            {ace.playerId && <PlayerPhoto playerId={ace.playerId} eventId={eventId} handle={ace.handle} country={player?.country} size={72} />}
            <span className="daily-reveal-name" translate="no">
              {ace.handle}
            </span>
          </span>
        )}
      </div>
      <dl className="ace-facts">
        <div>
          <dt>Evento</dt>
          <dd translate="no">{eventHintText(ace)}</dd>
        </div>
        <div>
          <dt>Partida</dt>
          <dd className="ace-match">
            {ace.team.teamId && <TeamLogo teamId={ace.team.teamId} eventId={eventId} name={ace.team.name} size={20} />}
            <span translate="no">{ace.team.name}</span> <span className="muted">x</span>
            {ace.opponent.teamId && <TeamLogo teamId={ace.opponent.teamId} eventId={eventId} name={ace.opponent.name} size={20} />}
            <span translate="no">{ace.opponent.name}</span>
            {ace.date && <span className="small muted"> · {ace.date.split('-').reverse().join('/')}</span>}
          </dd>
        </div>
        <div>
          <dt>Mapa</dt>
          <dd>
            {ace.map ? mapLabel(ace.map) : '—'}
            {ace.match.bestOf && ace.match.bestOf > 1 ? ` (mapa ${ace.match.mapNumber} de uma MD${ace.match.bestOf})` : ''}
            {ace.mapScore ? ` · terminou ${ace.mapScore[0]}–${ace.mapScore[1]}` : ''}
          </dd>
        </div>
        <div>
          <dt>Round</dt>
          <dd>
            {ace.round}
            {ace.side ? ` · no ${SIDE_LABELS[ace.side]}` : ''}
            {ace.scoreBefore ? ` · placar antes: ${ace.scoreBefore[0]}–${ace.scoreBefore[1]}` : ''}
            {ace.clutch ? ` · clutch ${ace.clutch}` : ''}
          </dd>
        </div>
        <div>
          <dt>Agente</dt>
          <dd className="ace-agent">
            {ace.agent ? (
              <>
                <AgentIcon name={ace.agent} /> {agentLabel(ace.agent)}
              </>
            ) : (
              '—'
            )}
            {ace.weapon ? ` · ${ace.weapon}` : ''}
          </dd>
        </div>
        {ace.victims.length > 0 && (
          <div>
            <dt>Vítimas</dt>
            <dd translate="no">{ace.victims.map((v) => (v.agent ? `${v.handle ?? '?'} (${agentLabel(v.agent)})` : (v.handle ?? '?'))).join(', ')}</dd>
          </div>
        )}
      </dl>
      {rev.description && <p className="ace-description">{rev.description}</p>}
      <p className="small ace-video-credit">
        Vídeo: <q translate="no">{video.title}</q>
        {video.channel && (
          <>
            {' '}
            · canal{' '}
            {video.channelUrl ? (
              <a href={video.channelUrl} target="_blank" rel="noopener noreferrer" translate="no">
                {video.channel}
              </a>
            ) : (
              <span translate="no">{video.channel}</span>
            )}
          </>
        )}
      </p>
      <div className="ace-links">
        <a className="ace-link main" href={video.url} target="_blank" rel="noopener noreferrer">
          <Icon name="play" /> Ver no YouTube
        </a>
        <a className="ace-link" href={rev.vlrUrl} target="_blank" rel="noopener noreferrer">
          <Icon name="link" /> Partida no VLR.gg
        </a>
      </div>
      {sources.length > 0 && (
        <ul className="small ace-sources" aria-label="Outras fontes">
          {sources.map((s) => (
            <li key={s}>
              <a href={s} target="_blank" rel="noopener noreferrer">
                {s.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="small muted ace-credits">
        Ace, round, vítimas e agente: aba Performance do VLR.gg. Vídeo: {video.channel ? `canal ${video.channel}` : 'canal no YouTube'} (direitos do canal e da
        Riot Games), embutido pelo player oficial do YouTube.
      </p>
    </section>
  );
}

function AceStats({ stats, free }: { stats: AcesStats; free: { played: number; solved: number; points: number } }) {
  const max = Math.max(1, ...stats.byTry);
  const label = (i: number) => (i < MAX_TRIES ? `${i + 1}ª` : 'X');
  return (
    <section className="panel daily-stats" aria-labelledby="ace-stats-title">
      <h2 id="ace-stats-title">Suas estatísticas · Acerte o ace</h2>
      <dl className="daily-stat-grid">
        <div>
          <dt>Diários</dt>
          <dd>{stats.played}</dd>
        </div>
        <div>
          <dt>Acertos</dt>
          <dd>{stats.played ? `${Math.round((stats.solved / stats.played) * 100)}%` : '—'}</dd>
        </div>
        <div>
          <dt>Média</dt>
          <dd>{stats.played ? stats.average.toFixed(1).replace('.', ',') : '—'}</dd>
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
        <div>
          <dt>Livres</dt>
          <dd>
            {free.solved}/{free.played}
          </dd>
        </div>
      </dl>
      {stats.played > 0 && (
        <div className="daily-dist" role="img" aria-label={`Distribuição: ${stats.byTry.map((n, i) => `${label(i)}: ${n}`).join(', ')}`}>
          {stats.byTry.map((n, i) => (
            <span key={i} className="daily-dist-row" aria-hidden="true">
              <span className="daily-dist-label vd-dist-label">{label(i)}</span>
              <span className="daily-dist-bar" style={{ width: `${Math.max(4, (n / max) * 100)}%` }}>
                {n}
              </span>
            </span>
          ))}
        </div>
      )}
      <p className="small muted">
        Pontos: 5, 4, 3, 2 ou 1 conforme a tentativa; 0 se errar as cinco ou desistir. Distribuição: diários por tentativa que acertou (X = não acertou). A
        sequência conta os diários acertados no próprio dia. &quot;Livres&quot;: acertos/jogos no modo livre ({free.points} pts). Tudo fica salvo só neste
        navegador.
      </p>
    </section>
  );
}
