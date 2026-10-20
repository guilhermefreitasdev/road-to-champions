import { isCold, isInspired, type MapResult, type PlayerLine } from '../../engine/match';
import type { TeamIndex } from '../../engine/types';
import { FORM_HELP, formatDecimal } from '../../game/explain';
import { mapLabel } from './GameImage';
import { YouTag } from './Icon';

interface Props {
  result: MapResult;
  teamNames: [string, string];
  /** Side of the user's team, highlighted in the tables. */
  userSide?: TeamIndex;
  /** e.g. "Mapa 1 · escolha de Aurora". */
  caption?: string;
}

function TeamTable({
  name,
  won,
  mine,
  lines,
  strength,
}: {
  name: string;
  won: boolean;
  mine: boolean;
  lines: PlayerLine[];
  strength: number;
}) {
  const sorted = [...lines].sort((a, b) => b.rating - a.rating || b.acs - a.acs);
  return (
    <div className="team">
      <h4 className={won ? 'won' : undefined}>
        {name}
        {mine && <YouTag />} <span className="muted">· força {formatDecimal(strength)}</span>
        {won && <span className="sr-only"> (venceu)</span>}
      </h4>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Jogador</th>
              <th scope="col" title="Rating estimado pelo simulador (1,00 = linha média; não é o Rating 2.0 do VLR)">
                R
              </th>
              <th scope="col" title="ACS estimado">
                ACS
              </th>
              <th scope="col">K</th>
              <th scope="col">D</th>
              <th scope="col">A</th>
              <th scope="col">+/–</th>
              <th scope="col">KAST</th>
              <th scope="col" title="First kills">
                FK
              </th>
              <th scope="col" title="First deaths">
                FD
              </th>
              <th scope="col" title="Rounds com 3 kills">
                3K
              </th>
              <th scope="col" title="Rounds com 4 kills">
                4K
              </th>
              <th scope="col" title="Rounds com 5 kills (ace)">
                ACE
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.cardId} className={p.mvp ? 'mvp-row' : undefined}>
                <td>
                  {p.handle}
                  <span className="line-tags">
                  {p.mvp && (
                    <span className="tag mvp" title="MVP do mapa: melhor rating estimado dos 10">
                      MVP
                    </span>
                  )}
                  {isInspired(p) && (
                    <span className="tag form-hot" title={`Mapa inspirado: rating estimado ${formatDecimal(p.rating, 2)}. ${FORM_HELP}`}>
                      <span aria-hidden="true">🔥</span> Inspirado
                    </span>
                  )}
                  {isCold(p) && (
                    <span className="tag form-cold" title={`Mapa apagado: rating estimado ${formatDecimal(p.rating, 2)}. ${FORM_HELP}`}>
                      <span aria-hidden="true">❄️</span> Apagado
                    </span>
                  )}
                  </span>
                </td>
                <td>{formatDecimal(p.rating, 2)}</td>
                <td>{p.acs}</td>
                <td>{p.kills}</td>
                <td>{p.deaths}</td>
                <td>{p.assists}</td>
                <td className={p.kills - p.deaths >= 0 ? 'pos' : 'neg'}>
                  {p.kills - p.deaths > 0 ? '+' : ''}
                  {p.kills - p.deaths}
                </td>
                <td>{p.kast}%</td>
                <td>{p.firstKills}</td>
                <td>{p.firstDeaths}</td>
                <td>{p.multikills.k3 || '–'}</td>
                <td>{p.multikills.k4 || '–'}</td>
                <td className={p.multikills.k5 ? 'ace' : undefined}>{p.multikills.k5 || '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** One map, VLR style: score, round strip (team colors, gap at the half) and a table per team. */
export function Scoreboard({ result, teamNames, userSide, caption }: Props) {
  const [a, b] = result.score;
  const sides: [TeamIndex, TeamIndex] = userSide === 1 ? [1, 0] : [0, 1];
  // The first listed team (the user's, when known) always gets the "a" color.
  const color = (winner: TeamIndex) => (winner === sides[0] ? 'a' : 'b');
  return (
    <section className="scoreboard">
      <header className="map-head">
        <h3>{mapLabel(result.map)}</h3>
        {caption && <span className="muted small">{caption}</span>}
        <p className="map-score">
          <span className={result.winner === 0 ? 'win' : undefined}>
            {teamNames[0]}
            {userSide === 0 && <YouTag />}
          </span>
          <strong>
            {a} – {b}
          </strong>
          <span className={result.winner === 1 ? 'win' : undefined}>
            {userSide === 1 && <YouTag />}
            {teamNames[1]}
          </span>
        </p>
      </header>
      <ol className="rounds" aria-label={`Rounds: ${teamNames[0]} ${a}, ${teamNames[1]} ${b}`}>
        {result.rounds.map((r) => (
          <li
            key={r.number}
            className={`${color(r.winner)}${r.number === 13 || r.number === 25 ? ' half' : ''}`}
            title={`Round ${r.number}: ${teamNames[r.winner]}`}
          />
        ))}
      </ol>
      <p className="legend small muted">
        <span className="dot a" aria-hidden="true" /> {teamNames[sides[0]]}{' '}
        <span className="dot b" aria-hidden="true" /> {teamNames[sides[1]]}
      </p>
      <div className="team-tables">
        {sides.map((i) => (
          <TeamTable
            key={i}
            name={teamNames[i]}
            won={result.winner === i}
            mine={userSide === i}
            lines={result.players[i]}
            strength={result.strength[i].total}
          />
        ))}
      </div>
    </section>
  );
}
