import { useState } from 'react';
import { ROLE_LABELS } from '../../game/explain';
import type { DailyPlayer } from '../../game/daily/data';
import type { LinhasPuzzle } from '../../game/daily/generate';
import { REGION_NAMES, placementWords } from '../../game/daily/labels';
import {
  HINT_COST,
  HINT_KINDS,
  LINHAS_MAX_MISSES,
  formatPoints,
  guessLinhas,
  hintLinhas,
  linhasResult,
  linhasSlotPoints,
  revealLinhas,
  type HintKind,
  type LinhasState,
} from '../../game/daily/play';
import { CountryChip, countryName } from '../components/CountryChip';
import { Icon } from '../components/Icon';
import { PlayerPhoto } from '../components/PlayerPhoto';
import { PlayerSearch } from '../components/PlayerSearch';
import { TeamLogo } from '../components/TeamLogo';

const HINT_LABELS: Record<HintKind, string> = { country: 'País', role: 'Função', initial: 'Inicial' };

/** Linhas Históricas: a team at an event; name its five starters. */
export function DailyLinhas({
  puzzle,
  state,
  players,
  onChange,
}: {
  puzzle: LinhasPuzzle;
  state: LinhasState;
  players: readonly DailyPlayer[];
  onChange: (fn: (s: LinhasState) => LinhasState) => void;
}) {
  const [feedback, setFeedback] = useState<{ tone: 'hit' | 'miss' | 'info'; text: string } | null>(null);
  const [openHints, setOpenHints] = useState<string | null>(null);
  const result = linhasResult(state, puzzle);
  const placement = placementWords(puzzle.placement);

  const guess = (p: DailyPlayer) => {
    const r = guessLinhas(state, puzzle, { playerId: p.playerId, handle: p.handle });
    if (r.outcome === 'hit') setFeedback({ tone: 'hit', text: `Acertou: ${p.handle} era titular.` });
    else if (r.outcome === 'miss') setFeedback({ tone: 'miss', text: `${p.handle} não estava entre os titulares.` });
    else if (r.outcome === 'repeat') setFeedback({ tone: 'info', text: `Você já tentou ${p.handle}.` });
    if (r.outcome === 'hit' || r.outcome === 'miss') onChange(() => r.state);
  };

  return (
    <div className="daily-linhas">
      <div className="panel daily-team-card">
        <TeamLogo teamId={puzzle.teamId} eventId={puzzle.eventId} name={puzzle.teamName} size={72} />
        <div className="daily-team-text">
          <p className="daily-team-name" translate="no">
            {puzzle.teamName}
          </p>
          <p className="daily-team-event">{puzzle.eventName}</p>
          <p className="daily-team-meta">
            {placement && <span className={`daily-chip${placement === 'Campeão' ? ' gold' : ''}`}>{placement}</span>}
            {puzzle.region && <span className="daily-chip">{REGION_NAMES[puzzle.region]}</span>}
            <span className="daily-chip">{puzzle.tier === 'regional' ? 'Liga regional' : 'Internacional'}</span>
          </p>
        </div>
      </div>
      <p className="daily-rule">
        Escreva os <strong>cinco titulares</strong> deste time nesse evento, em qualquer ordem. Cada nome vale 1 ponto; dicas custam pontos daquele jogador.
        Até {LINHAS_MAX_MISSES} erros.
      </p>

      <ol className="daily-slots">
        {puzzle.slots.map((slot, i) => {
          const found = state.found.includes(slot.playerId);
          const hints = state.hints[slot.playerId] ?? [];
          const shown = found || state.done;
          return (
            <li key={slot.playerId} className={`daily-slot${found ? ' found' : state.done ? ' missed' : ''}`}>
              {shown ? (
                <PlayerPhoto playerId={slot.playerId} eventId={slot.photoEventId} handle={slot.handle} country={slot.country} size={48} />
              ) : (
                <span className="daily-slot-mystery" aria-hidden="true">
                  ?
                </span>
              )}
              <span className="daily-slot-body">
                <span className="daily-slot-name">
                  {shown ? (
                    <strong translate="no">{slot.handle}</strong>
                  ) : (
                    <span className="muted">Titular {i + 1}</span>
                  )}
                  {found && <span className="daily-slot-points">+{formatPoints(linhasSlotPoints(state, slot.playerId))}</span>}
                  {!found && state.done && <span className="small muted"> não citado</span>}
                </span>
                <span className="daily-slot-hints">
                  {(shown || hints.includes('country')) && slot.country && (
                    <span className="daily-hint-tag">
                      <CountryChip code={slot.country} /> {countryName(slot.country)}
                    </span>
                  )}
                  {(shown || hints.includes('role')) && (
                    <span className={`daily-hint-tag role-${slot.role}`}>
                      <Icon name={`role-${slot.role}`} /> {ROLE_LABELS[slot.role]}
                    </span>
                  )}
                  {!shown && hints.includes('initial') && (
                    <span className="daily-hint-tag">
                      Começa com <strong translate="no">{slot.handle.slice(0, 1).toUpperCase()}</strong>
                    </span>
                  )}
                </span>
              </span>
              {!shown && (
                <span className="daily-slot-actions">
                  <button
                    type="button"
                    className="ghost daily-hint-toggle"
                    aria-expanded={openHints === slot.playerId}
                    onClick={() => setOpenHints((o) => (o === slot.playerId ? null : slot.playerId))}
                  >
                    Dica
                  </button>
                </span>
              )}
              {!shown && openHints === slot.playerId && (
                <span className="daily-hint-menu" role="group" aria-label={`Dicas do titular ${i + 1}`}>
                  {HINT_KINDS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      className="secondary"
                      disabled={hints.includes(k)}
                      onClick={() => onChange((s) => hintLinhas(s, slot.playerId, k))}
                    >
                      {HINT_LABELS[k]} <span className="daily-cost">−{formatPoints(HINT_COST[k])}</span>
                    </button>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {!state.done && (
        <>
          <PlayerSearch players={players} onPick={guess} label="Nome de um titular" placeholder="Nome de um titular" />
          {feedback && (
            <p className={`daily-feedback ${feedback.tone}`} role="status">
              <Icon name={feedback.tone === 'hit' ? 'check' : feedback.tone === 'miss' ? 'close' : 'warning'} /> {feedback.text}
            </p>
          )}
        </>
      )}

      <div className="daily-tally">
        <span>
          Nomes <strong>{result.names}/5</strong>
        </span>
        <span>
          Erros{' '}
          <strong>
            {state.misses.length}/{LINHAS_MAX_MISSES}
          </strong>
        </span>
        <span>
          Pontos <strong>{formatPoints(result.points)}</strong>
        </span>
      </div>
      {state.misses.length > 0 && (
        <p className="daily-misses small">
          Errados:{' '}
          {state.misses.map((m) => (
            <span key={m} className="daily-miss" translate="no">
              {m}
            </span>
          ))}
        </p>
      )}
      {!state.done && (
        <button type="button" className="ghost" onClick={() => onChange(revealLinhas)}>
          <Icon name="skip" /> Revelar e encerrar
        </button>
      )}
      {state.done && (
        <p className={`daily-verdict ${result.won ? 'won' : 'lost'}`}>
          <Icon name={result.won ? 'check' : 'close'} />
          {result.names === 5 ? 'Escalação completa!' : `${result.names} de 5 titulares.`} {formatPoints(result.points)} de 5 pontos.
        </p>
      )}
    </div>
  );
}
