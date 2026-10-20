import { useState } from 'react';
import { ROLE_LABELS, formatStat } from '../../game/explain';
import type { DailyPlayer } from '../../game/daily/data';
import type { ProPuzzle } from '../../game/daily/generate';
import { placementWords, yearsLabel } from '../../game/daily/labels';
import { PRO_MAX_TRIES, guessPro, proCluesShown, proResult, type ProState } from '../../game/daily/play';
import { agentByName } from '../../data/game';
import { AgentIcon } from '../components/GameImage';
import { CountryChip, countryName } from '../components/CountryChip';
import { Icon, type IconName } from '../components/Icon';
import { PlayerPhoto } from '../components/PlayerPhoto';
import { PlayerSearch } from '../components/PlayerSearch';
import { TeamLogo } from '../components/TeamLogo';

const CLUE_TITLES: { title: string; icon: IconName }[] = [
  { title: 'Função', icon: 'role-flex' },
  { title: 'País', icon: 'globe' },
  { title: 'Agentes mais jogados', icon: 'cards' },
  { title: 'Uma linha de stats', icon: 'stats' },
  { title: 'Times', icon: 'history' },
  { title: 'Evento', icon: 'trophy' },
];

/** Quem é o Pro: six clues, one more after each wrong guess. */
export function DailyPro({
  puzzle,
  state,
  players,
  playerById,
  onChange,
}: {
  puzzle: ProPuzzle;
  state: ProState;
  players: readonly DailyPlayer[];
  playerById: ReadonlyMap<string, DailyPlayer>;
  onChange: (fn: (s: ProState) => ProState) => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const shown = proCluesShown(state, puzzle);
  const result = proResult(state, puzzle);
  const c = puzzle.clues;
  const a = puzzle.answer;

  const guess = (p: DailyPlayer) => {
    const r = guessPro(state, puzzle, p.playerId);
    if (r.outcome === 'repeat') setNote(`Você já tentou ${p.handle}.`);
    else setNote(null);
    if (r.outcome === 'hit' || r.outcome === 'miss') onChange(() => r.state);
  };

  const clueBody = (i: number) => {
    switch (i) {
      case 0:
        return (
          <span className={`daily-hint-tag role-${c.role}`}>
            <Icon name={`role-${c.role}`} /> {ROLE_LABELS[c.role]}
          </span>
        );
      case 1:
        return (
          <span className="daily-hint-tag">
            <CountryChip code={c.country} /> {countryName(c.country)}
          </span>
        );
      case 2:
        return (
          <span className="daily-agents">
            {c.agents.map((ag) => (
              <span key={ag.agent} className="daily-agent">
                <AgentIcon name={ag.agent} />
                <span>
                  {agentByName(ag.agent)?.displayName ?? ag.agent} <span className="small muted">{ag.maps} mapas</span>
                </span>
              </span>
            ))}
          </span>
        );
      case 3:
        return (
          <span>
            Rating <strong>{formatStat(c.stat.rating, 2)}</strong> · ACS <strong>{formatStat(c.stat.acs)}</strong> · KAST{' '}
            <strong>{formatStat(c.stat.kast)}%</strong> <span className="small muted">em {c.stat.rounds} rounds num evento de {c.stat.year}</span>
          </span>
        );
      case 4:
        return (
          <span className="daily-team-list">
            {c.teams.map((t) => (
              <span key={t.teamId} className="daily-team-tag">
                <TeamLogo teamId={t.teamId} name={t.name} size={20} />
                <span translate="no">{t.name}</span> <span className="small muted">{yearsLabel(t.years)}</span>
              </span>
            ))}
          </span>
        );
      default:
        return (
          <span className="daily-team-tag">
            <TeamLogo teamId={c.event.teamId} eventId={c.event.eventId} name={c.event.teamName} size={20} />
            <span>
              {c.event.eventName} com <span translate="no">{c.event.teamName}</span>
              {placementWords(c.event.placement) ? ` · ${placementWords(c.event.placement)}` : ''}
            </span>
          </span>
        );
    }
  };

  return (
    <div className="daily-pro">
      <p className="daily-rule">
        Quem é o jogador? A primeira dica já está aberta; cada erro abre mais uma. {PRO_MAX_TRIES} tentativas: acertar na 1ª vale 5 pontos, na 2ª 4, e assim por diante.
      </p>
      <ol className="daily-clues">
        {CLUE_TITLES.map((t, i) => (
          <li key={t.title} className={`daily-clue${i < shown ? ' open' : ''}`}>
            <span className="daily-clue-head">
              <Icon name={t.icon} /> <span className="daily-clue-num">{i + 1}</span> {t.title}
            </span>
            <span className="daily-clue-body">
              {i < shown ? (
                clueBody(i)
              ) : (
                <span className="muted small">
                  <Icon name="lock" /> Abre após o {i}º erro
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>

      {state.guesses.length > 0 && (
        <ul className="daily-guesses" aria-label="Seus palpites">
          {state.guesses.map((id, i) => {
            const p = playerById.get(id);
            const hit = id === a.playerId;
            const sameCountry = p?.country === c.country;
            const sameRole = p?.role === c.role;
            return (
              <li key={id} className={hit ? 'hit' : 'miss'}>
                <span className="daily-guess-n">{i + 1}</span>
                <Icon name={hit ? 'check' : 'close'} />
                <strong translate="no">{p?.handle ?? id}</strong>
                {!hit && p && (
                  <span className="daily-compare">
                    <span className={sameCountry ? 'same' : 'diff'}>{sameCountry ? 'mesmo país' : 'outro país'}</span>
                    <span className={sameRole ? 'same' : 'diff'}>{sameRole ? 'mesma função' : 'outra função'}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!state.done && (
        <>
          <p className="daily-tally">
            <span>
              Tentativa{' '}
              <strong>
                {state.guesses.length + 1}/{PRO_MAX_TRIES}
              </strong>
            </span>
          </p>
          <PlayerSearch players={players} onPick={guess} label="Quem é o pro?" placeholder="Quem é o pro?" />
          {note && (
            <p className="daily-feedback info" role="status">
              <Icon name="warning" /> {note}
            </p>
          )}
        </>
      )}

      {state.done && (
        <div className={`panel daily-reveal ${result.won ? 'won' : 'lost'}`}>
          <PlayerPhoto playerId={a.playerId} eventId={a.photoEventId} handle={a.handle} country={a.country} size={72} />
          <div>
            <p className="daily-reveal-kicker">{result.won ? `Acertou na ${result.tries}ª tentativa` : 'Era'}</p>
            <p className="daily-reveal-name" translate="no">
              {a.handle}
            </p>
            <p className="small muted">
              {result.points} de 5 pontos · {ROLE_LABELS[c.role]} · {countryName(c.country)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
