import type { DraftState } from '../../engine/draft';
import { findCoach } from '../../engine/roster';
import type { Coach as CoachType, RosterEntry } from '../../engine/types';
import { placementLabel } from '../../game/explain';
import { TeamLogo } from '../components/TeamLogo';

const SCOUT_TEXT = [
  'não revela nada do adversário no veto',
  'revela o mapa mais forte do adversário no veto',
  'revela o mapa mais forte e o mais fraco do adversário no veto',
  'revela o conforto do adversário em todos os mapas do veto',
];

interface Props {
  draft: DraftState;
  pool: readonly RosterEntry[];
  onPick: (coachId: string) => void;
}

export function Coach({ draft, pool, onPick }: Props) {
  const options = (draft.coachOptions ?? []).map((id) => findCoach(pool, id)).filter((c): c is CoachType => !!c);
  return (
    <div className="screen coach">
      <header className="screen-head">
        <h1>Escolha o coach</h1>
        <p className="context">Último pick</p>
        <p className="muted measure">
          O coach não joga, mas soma força em todo mapa e ajuda você a ler o veto. A tática vem da colocação do time
          dele naquele evento; o veto, da experiência em eventos internacionais.
        </p>
      </header>
      <div className="coach-list">
        {options.map((c) => {
          const roster = pool.find((e) => e.teamId === c.teamId && e.eventId === c.eventId);
          return (
            <button key={c.id} type="button" className="coach-card" onClick={() => onPick(c.id)}>
              <strong className="coach-name">{c.name}</strong>
              <span className="small muted coach-team">
                <TeamLogo teamId={c.teamId} eventId={c.eventId} name={roster?.teamName ?? c.teamId} size={18} />
                {roster ? `${roster.teamName} · ${roster.eventName}` : c.eventId}
                {roster?.placement && ` (${placementLabel(roster.placement)})`}
              </span>
              <span className="coach-stat">
                <span className="badge">Tática +{c.tacticBonus}</span>
                <span className="small">
                  soma {c.tacticBonus} ponto{c.tacticBonus === 1 ? '' : 's'} de força em todo mapa
                </span>
              </span>
              <span className="coach-stat">
                <span className="badge">Veto +{c.vetoBonus}</span>
                <span className="small">{SCOUT_TEXT[Math.max(0, Math.min(3, c.vetoBonus))]}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
