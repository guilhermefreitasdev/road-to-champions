import { coachOptions, rosterOf, type RunState } from '../../game/run';

const SCOUT_TEXT = [
  'não revela nada do adversário no veto',
  'revela o mapa mais forte do adversário no veto',
  'revela o mapa mais forte e o mais fraco do adversário no veto',
  'revela o conforto do adversário em todos os mapas do veto',
];

export function Coach({ run, onPick }: { run: RunState; onPick: (coachId: string) => void }) {
  return (
    <div className="screen coach">
      <header className="screen-head">
        <h1>Escolha o coach</h1>
        <p className="context">Último pick</p>
        <p className="muted measure">O coach não joga, mas soma força em todo mapa e ajuda você a ler o veto.</p>
      </header>
      <div className="coach-list">
        {coachOptions(run).map((c) => {
          const roster = rosterOf(c.teamId, c.eventId);
          return (
            <button key={c.id} type="button" className="coach-card" onClick={() => onPick(c.id)}>
              <strong className="coach-name">{c.name}</strong>
              <span className="small muted">{roster ? `${roster.teamName} · ${roster.eventName}` : c.eventId}</span>
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
