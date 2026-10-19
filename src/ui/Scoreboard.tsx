import type { MapResult, PlayerLine } from '../engine/match';

interface Props {
  result: MapResult;
  teamNames: [string, string];
}

function TeamTable({ name, won, lines, strength }: { name: string; won: boolean; lines: PlayerLine[]; strength: number }) {
  const sorted = [...lines].sort((a, b) => b.acs - a.acs);
  return (
    <div className="team">
      <h3 className={won ? 'won' : undefined}>
        {name} <span className="muted">· força {strength.toFixed(1)}</span>
      </h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Jogador</th>
              <th title="ACS estimado">ACS</th>
              <th>K</th>
              <th>D</th>
              <th>A</th>
              <th>+/–</th>
              <th>KAST</th>
              <th>FK</th>
              <th>FD</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.cardId}>
                <td>{p.handle}</td>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Scoreboard({ result, teamNames }: Props) {
  const [a, b] = result.score;
  return (
    <section className="scoreboard">
      <h2>
        {result.map} · {teamNames[0]} {a} – {b} {teamNames[1]}
      </h2>
      <ol className="rounds" aria-label="Rounds">
        {result.rounds.map((r) => (
          <li key={r.number} className={r.winner === 0 ? 'a' : 'b'} title={`Round ${r.number}`} />
        ))}
      </ol>
      {([0, 1] as const).map((i) => (
        <TeamTable
          key={i}
          name={teamNames[i]}
          won={result.winner === i}
          lines={result.players[i]}
          strength={result.strength[i].total}
        />
      ))}
    </section>
  );
}
