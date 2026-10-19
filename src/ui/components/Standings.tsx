import type { StandingRow } from '../../game/run';

const STATUS_LABELS = { alive: 'Vivo', advanced: 'Classificado', eliminated: 'Eliminado' } as const;

export function Standings({ rows }: { rows: StandingRow[] }) {
  return (
    <div className="table-wrap">
      <table className="standings">
        <caption className="sr-only">Classificação da fase suíça</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Time</th>
            <th scope="col">V-D</th>
            <th scope="col">
              <abbr title="Buchholz: soma do saldo dos adversários já enfrentados">BH</abbr>
            </th>
            <th scope="col">Situação</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className={r.isUser ? 'user-row' : undefined}>
              <td>{i + 1}</td>
              <td>
                {r.name}
                {r.isUser && <span className="badge you">você</span>}
              </td>
              <td>
                {r.wins}-{r.losses}
              </td>
              <td>{r.buchholz}</td>
              <td className={`status-${r.status}`}>{STATUS_LABELS[r.status]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
