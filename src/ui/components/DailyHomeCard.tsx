import { useState } from 'react';
import { dayKeyAt, puzzleNumber } from '../../game/daily/calendar';
import { CHALLENGES, CHALLENGE_LABELS } from '../../game/daily/challenges';
import { challengesDone, dailyStats, formatPoints, DAY_MAX_POINTS } from '../../game/daily/play';
import { loadDailyStore } from '../dailyStorage';
import { Icon } from './Icon';

/**
 * The Daily on the home page: today's number, the four challenges done or not, the result once finished and the
 * streak. Reads only localStorage (no card pool), so it shows before the game loads; the button waits for it.
 */
export function DailyHomeCard({ onOpen }: { onOpen?: (() => void) | undefined }) {
  const [now] = useState(() => new Date());
  const [store] = useState(loadDailyStore);
  const today = dayKeyAt(now);
  const progress = store.days[today];
  const done = challengesDone(progress);
  const count = CHALLENGES.filter((c) => done[c]).length;
  const stats = dailyStats(store, today);
  const result = progress?.result;
  const status = result
    ? `Concluído: ${result.wins}/4 · ${formatPoints(result.points)}/${DAY_MAX_POINTS} pts`
    : count > 0
      ? `${count} de 4 desafios feitos`
      : '4 desafios novos: escalação, pro, impostor e placar';
  const ready = !!onOpen;
  return (
    <section className="daily-home" aria-labelledby="daily-home-title">
      <div className="daily-home-card">
        <span className="daily-home-badge" aria-hidden="true">
          <Icon name="calendar" />
          <span>#{puzzleNumber(today)}</span>
        </span>
        <div className="daily-home-text">
          <h2 id="daily-home-title" className="daily-home-title">
            Diário <span className="sr-only">#{puzzleNumber(today)}</span>
          </h2>
          <p className="daily-home-status">{status}</p>
          <ol className="daily-home-dots" aria-label="Desafios de hoje">
            {CHALLENGES.map((c) => (
              <li key={c} className={done[c] ? 'done' : ''}>
                <Icon name={done[c] ? 'check' : 'lock'} />
                <span className="sr-only">
                  {CHALLENGE_LABELS[c]}: {done[c] ? 'feito' : 'a fazer'}
                </span>
                <span aria-hidden="true">{CHALLENGE_LABELS[c]}</span>
              </li>
            ))}
          </ol>
          <p className="small muted">
            {stats.streak > 0 ? (
              <>
                <Icon name="flame" /> Sequência de {stats.streak} dia{stats.streak === 1 ? '' : 's'} ·{' '}
              </>
            ) : null}
            Iguais para todos, novos à meia-noite (Brasília).
          </p>
        </div>
        <button type="button" className="primary daily-home-play" disabled={!ready} onClick={onOpen}>
          {!ready ? (
            <>
              <span className="spinner" aria-hidden="true" /> Carregando
            </>
          ) : result ? (
            'Ver resultado'
          ) : count > 0 ? (
            'Continuar'
          ) : (
            'Jogar o Diário'
          )}
        </button>
      </div>
    </section>
  );
}
