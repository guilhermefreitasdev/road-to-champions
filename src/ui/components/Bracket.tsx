import type { BracketSource } from '../../engine/tournament';
import { USER_ID, type BracketCell } from '../../game/run';

const GROUPS: { title: string; prefix: string }[] = [
  { title: 'Chave superior', prefix: 'ub-' },
  { title: 'Chave inferior', prefix: 'lb-' },
  { title: 'Grande final', prefix: 'gf' },
];

/** Short name of a bracket slot id ('ub-qf-1' → 'Quartas 1'). */
function shortSlot(id: string): string {
  const named: Record<string, string> = { 'ub-final': 'Final sup.', 'lb-r3': 'Inferior R3', 'lb-final': 'Final inf.' };
  if (named[id]) return named[id];
  const [, kind, n] = id.split('-');
  if (id.startsWith('ub-qf')) return `Quartas ${n}`;
  if (id.startsWith('ub-sf')) return `Semi ${n}`;
  return `Inferior ${kind?.toUpperCase()}·${n}`;
}

function sourceLabel(src: BracketSource): string {
  if ('seed' in src) return `Seed ${src.seed} da Suíça`;
  if ('winnerOf' in src) return `Vencedor ${shortSlot(src.winnerOf)}`;
  return `Perdedor ${shortSlot(src.loserOf)}`;
}

interface Props {
  cells: BracketCell[];
  nameOf: (id: string) => string;
}

/** Double-elimination bracket as stacked groups (fits a phone screen without horizontal scrolling). */
export function Bracket({ cells, nameOf }: Props) {
  return (
    <div className="bracket">
      {GROUPS.map((g) => (
        <section key={g.title} className="bracket-group">
          <h3>{g.title}</h3>
          <ul className="bracket-list">
            {cells
              .filter((c) => c.slot.round.startsWith(g.prefix))
              .map(({ slot, match }) => {
                const teams = match ? [match.a, match.b] : [];
                return (
                  <li key={slot.id} className={`bracket-match${teams.includes(USER_ID) ? ' has-user' : ''}`}>
                    <span className="small muted">
                      {slot.label} · MD{slot.bestOf}
                    </span>
                    {([0, 1] as const).map((i) => {
                      const id = teams[i];
                      const won = match?.result && match.result.winner === i;
                      return (
                        <span key={i} className={`bracket-team${won ? ' win' : ''}${id === USER_ID ? ' user' : ''}`}>
                          <span>{id ? nameOf(id) : sourceLabel(i === 0 ? slot.a : slot.b)}</span>
                          <span className="bracket-score">{match?.result ? match.result.score[i] : ''}</span>
                        </span>
                      );
                    })}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
