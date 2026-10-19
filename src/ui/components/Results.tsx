import type { MatchResult } from '../../engine/tournament';
import { USER_ID, userOpponent, userWon } from '../../game/run';

/** What a result row needs: Champions matches and league matches both fit. */
export interface ResultMatch {
  id: string;
  label: string;
  a: string;
  b: string;
  result?: MatchResult;
}

interface Props {
  matches: ResultMatch[];
  nameOf: (id: string) => string;
  onView: (matchId: string) => void;
}

/** The user's played matches; each row opens the full series. */
export function Results({ matches, nameOf, onView }: Props) {
  return (
    <ul className="results">
      {matches
        .filter((m) => m.result)
        .map((m) => {
          const won = userWon(m);
          const side = m.a === USER_ID ? 0 : 1;
          const score = m.result!.score;
          return (
            <li key={m.id}>
              <button type="button" className="result-row" onClick={() => onView(m.id)}>
                <span className={`wl ${won ? 'w' : 'l'}`} aria-label={won ? 'Vitória' : 'Derrota'}>
                  {won ? 'V' : 'D'}
                </span>
                <span className="result-main">
                  <strong>vs {nameOf(userOpponent(m))}</strong>
                  <span className="small muted">{m.label}</span>
                </span>
                <span className="result-score">
                  {score[side]}-{score[side === 0 ? 1 : 0]}
                </span>
                <span className="result-view small">Ver</span>
              </button>
            </li>
          );
        })}
    </ul>
  );
}
