import type { LeagueGroup, LeagueStatus } from '../../engine/league';
import type { LeagueRow } from '../../game/season';
import type { TeamRef } from './BracketCanvas';
import { Icon, YouTag } from './Icon';
import { TeamLogo } from './TeamLogo';

const STATUS: Record<LeagueStatus, { text: string; icon?: 'check' | 'ban' }> = {
  alive: { text: 'Em disputa' },
  qualified: { text: 'Playoffs', icon: 'check' },
  eliminated: { text: 'Eliminado', icon: 'ban' },
};

const diff = (won: number, lost: number) => {
  const d = won - lost;
  return d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '0';
};

/** One league group: place, team, match record, map and round difference, status. The top 3 go to the playoffs. */
export function LeagueTable({ group, rows, team }: { group: LeagueGroup; rows: LeagueRow[]; team: (id: string) => TeamRef }) {
  return (
    <table className="group-table league-table">
      <caption className="sr-only">Classificação do Grupo {group} da liga</caption>
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Time</th>
          <th scope="col">
            <abbr title="Vitórias-derrotas em séries">V-D</abbr>
          </th>
          <th scope="col">
            <abbr title="Saldo de mapas">Mapas</abbr>
          </th>
          <th scope="col">
            <abbr title="Saldo de rounds">Rounds</abbr>
          </th>
          <th scope="col">
            <span className="status-text">Situação</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const t = team(r.id);
          const status = STATUS[r.status];
          return (
            <tr key={r.id} className={r.isUser ? 'user-row' : undefined}>
              <td>{r.place ? `${r.place}º` : `${i + 1}`}</td>
              <td>
                <span className="team-cell">
                  {!r.isUser && <TeamLogo teamId={t.teamId} eventId={t.eventId} name={t.name} size={18} />}
                  <span className="team-cell-name" title={r.name}>
                    {r.name}
                  </span>
                  {r.isUser && <YouTag />}
                </span>
              </td>
              <td>
                {r.wins}-{r.losses}
              </td>
              <td>{diff(r.mapsWon, r.mapsLost)}</td>
              <td>{diff(r.roundsWon, r.roundsLost)}</td>
              <td className={`status status-${r.status}`}>
                {status.icon && <Icon name={status.icon} />} <span className="status-text">{status.text}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
