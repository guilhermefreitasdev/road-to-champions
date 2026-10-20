import type { Card } from '../../engine/types';
import { Icon } from '../components/Icon';
import { PlayerStatsTable } from '../components/PlayerStatsTable';
import type { PlayerStatsRow } from '../playerStats';

interface Props {
  teamName: string;
  /** "Champions · Draft clássico", "Complete Trials · EMEA". */
  context: string;
  rows: readonly PlayerStatsRow[];
  cards: ReadonlyMap<string, Card>;
  onBack: () => void;
  backLabel: string;
}

/** "Estatísticas": the user's five over the whole run so far, from the hub or the end screen. */
export function Stats({ teamName, context, rows, cards, onBack, backLabel }: Props) {
  const maps = Math.max(0, ...rows.map((r) => r.maps));
  return (
    <div className="screen stats-screen">
      <header className="screen-head">
        <h1>Estatísticas</h1>
        <p className="context">
          {teamName} · {context}
        </p>
        {rows.length > 0 && (
          <p className="small muted">
            {maps} mapa{maps === 1 ? '' : 's'} jogado{maps === 1 ? '' : 's'}. Números estimados pelo simulador; clique num jogador para ver os
            agentes que ele jogou aqui e o pool real dele.
          </p>
        )}
      </header>
      <section className="panel stats-panel" aria-label="Estatísticas dos jogadores">
        <PlayerStatsTable rows={rows} cards={cards} caption={`Estatísticas de ${teamName}`} idPrefix="stats" />
      </section>
      <button type="button" className="secondary wide" onClick={onBack}>
        <Icon name="back" /> {backLabel}
      </button>
    </div>
  );
}
