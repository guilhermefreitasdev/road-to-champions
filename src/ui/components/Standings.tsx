import type { GroupKey, GroupStatus } from '../../engine/tournament';
import type { StandingRow } from '../../game/run';
import type { TeamRef } from './BracketCanvas';
import { Icon, YouTag } from './Icon';
import { TeamLogo } from './TeamLogo';

const STATUS: Record<GroupStatus, { text: string; icon?: 'check' | 'ban' }> = {
  alive: { text: 'Em disputa' },
  qualified: { text: 'Classificado', icon: 'check' },
  eliminated: { text: 'Eliminado', icon: 'ban' },
};

/** Compact table of one group: place (1º–4º once decided), team, group record and status (icon + word). */
export function GroupTable({ group, rows, team }: { group: GroupKey; rows: StandingRow[]; team: (id: string) => TeamRef }) {
  return (
    <table className="group-table">
      <caption className="sr-only">Classificação do Grupo {group}</caption>
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Time</th>
          <th scope="col">
            <abbr title="Vitórias-derrotas no grupo">V-D</abbr>
          </th>
          <th scope="col">
            <span className="status-text">Situação</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const t = team(r.id);
          const status = STATUS[r.status];
          return (
            <tr key={r.id} className={r.isUser ? 'user-row' : undefined}>
              <td>{r.place ? `${r.place}º` : '–'}</td>
              <td>
                <span className="team-cell">
                  {!r.isUser && <TeamLogo teamId={t.teamId} eventId={t.eventId} name={t.name} size={18} />}
                  <span className="team-cell-name">{r.name}</span>
                  {r.isUser && <YouTag />}
                </span>
              </td>
              <td>
                {r.wins}-{r.losses}
              </td>
              {/* Phones show only the icon; the word stays for screen readers. */}
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
