import { matchWinner, type BracketSource, type TMatch } from '../../engine/tournament';
import { USER_ID, type BracketCell } from '../../game/run';
import {
  BOX_H,
  BracketCanvas,
  CAP_H,
  HEAD_H,
  PITCH,
  type CanvasEdge,
  type CanvasHeader,
  type CanvasNode,
  type MatchSide,
  type TeamRef,
} from './BracketCanvas';
import { useWide } from './useWide';

/** Short name of a bracket slot id ('ub-qf-1' → 'Quartas 1'). */
function shortSlot(id: string): string {
  const named: Record<string, string> = { 'ub-final': 'Final sup.', 'lb-r3': 'Inferior R3', 'lb-final': 'Final inf.' };
  if (named[id]) return named[id];
  const [, kind, n] = id.split('-');
  if (id.startsWith('ub-qf')) return `Quartas ${n}`;
  if (id.startsWith('ub-sf')) return `Semi ${n}`;
  return `Inferior ${kind?.toUpperCase()}·${n}`;
}

export function sourceLabel(src: BracketSource): string {
  if ('place' in src) return `${src.place}º Grupo ${src.group}`;
  if ('groupSeed' in src) return 'A definir';
  if ('winnerOf' in src) return `Vencedor ${shortSlot(src.winnerOf)}`;
  return `Perdedor ${shortSlot(src.loserOf)}`;
}

/** Sides of a slot: the match's teams once known, else the placeholders of its sources. */
export function sidesOf(match: TMatch | undefined, a: BracketSource, b: BracketSource, label = sourceLabel): [MatchSide, MatchSide] {
  return ([0, 1] as const).map((i): MatchSide => {
    if (!match) return { placeholder: label(i === 0 ? a : b) };
    const side: MatchSide = { id: i === 0 ? match.a : match.b, placeholder: '' };
    if (match.result) {
      side.score = match.result.score[i];
      side.won = match.result.winner === i;
    }
    return side;
  }) as [MatchSide, MatchSide];
}

/** Where each slot sits: column and row (in PITCH units) inside its half of the drawing. */
const LAYOUT: Record<string, { col: number; row: number; lower?: boolean }> = {
  'ub-qf-1': { col: 0, row: 0 },
  'ub-qf-2': { col: 0, row: 1 },
  'ub-qf-3': { col: 0, row: 2 },
  'ub-qf-4': { col: 0, row: 3 },
  'ub-sf-1': { col: 1, row: 0.5 },
  'ub-sf-2': { col: 1, row: 2.5 },
  'ub-final': { col: 2, row: 1.5 },
  'lb-r1-1': { col: 0, row: 0, lower: true },
  'lb-r1-2': { col: 0, row: 1, lower: true },
  'lb-r2-1': { col: 1, row: 0, lower: true },
  'lb-r2-2': { col: 1, row: 1, lower: true },
  'lb-r3': { col: 2, row: 0.5, lower: true },
  'lb-final': { col: 3, row: 0.5, lower: true },
};

/**
 * Lines between slots (a winner moving on), as [from, to, row of the target it lands on]. Two feeds merge at
 * the box center; a single feed lands on its own row. Losers dropping to the lower bracket are named, not drawn.
 */
const EDGES: [string, string, (0 | 1)?][] = [
  ['ub-qf-1', 'ub-sf-1'],
  ['ub-qf-2', 'ub-sf-1'],
  ['ub-qf-3', 'ub-sf-2'],
  ['ub-qf-4', 'ub-sf-2'],
  ['ub-sf-1', 'ub-final'],
  ['ub-sf-2', 'ub-final'],
  ['ub-final', 'gf', 0],
  ['lb-r1-1', 'lb-r2-1', 1],
  ['lb-r1-2', 'lb-r2-2', 1],
  ['lb-r2-1', 'lb-r3'],
  ['lb-r2-2', 'lb-r3'],
  ['lb-r3', 'lb-final', 1],
  ['lb-final', 'gf', 1],
];

const UPPER_HEADS = ['Quartas sup.', 'Semis sup.', 'Final sup.'];
const LOWER_HEADS = ['Inferior R1', 'Inferior R2', 'Inferior R3', 'Final inf.'];

interface Props {
  cells: BracketCell[];
  team: (id: string) => TeamRef;
  onView?: (matchId: string) => void;
}

/** The 8-team double-elimination playoff bracket, drawn like Liquipedia: upper bracket on top, lower below, grand final on the right. */
export function Bracket({ cells, team, onView }: Props) {
  const wide = useWide();
  const colW = wide ? 196 : 172;
  const gap = wide ? 40 : 28;

  const top = HEAD_H + 6;
  const rowCy = (base: number, row: number) => base + CAP_H + BOX_H / 2 + row * PITCH;
  const upperBottom = rowCy(top, 3) + BOX_H / 2;
  const lowerHead = upperBottom + 24;
  const lowerTop = lowerHead + HEAD_H + 6;
  const cyOf = (id: string) => {
    const l = LAYOUT[id]!;
    return rowCy(l.lower ? lowerTop : top, l.row);
  };
  const gfCy = Math.round((cyOf('ub-final') + cyOf('lb-final')) / 2);
  const height = rowCy(lowerTop, 1) + BOX_H / 2 + 8;

  const byId = new Map(cells.map((c) => [c.slot.id, c]));
  const nodes: CanvasNode[] = cells.map(({ slot, match }) => ({
    kind: 'match',
    key: slot.id,
    col: slot.id === 'gf' ? 4 : LAYOUT[slot.id]!.col,
    cy: slot.id === 'gf' ? gfCy : cyOf(slot.id),
    label: slot.label,
    bestOf: slot.bestOf,
    sides: sidesOf(match, slot.a, slot.b),
    played: !!match?.result,
  }));
  const edges: CanvasEdge[] = EDGES.map(([from, to, toSide]) => {
    const m = byId.get(from)?.match;
    const edge: CanvasEdge = { from, to, user: !!m && matchWinner(m) === USER_ID };
    if (toSide !== undefined) edge.toSide = toSide;
    return edge;
  });
  const headers: CanvasHeader[] = [
    ...UPPER_HEADS.map((text, col) => ({ col, y: 0, text })),
    ...LOWER_HEADS.map((text, col) => ({ col, y: lowerHead, text })),
    { col: 4, y: gfCy - BOX_H / 2 - CAP_H - HEAD_H - 4, text: 'Grande final' },
  ];

  return (
    <div className="playoff-bracket">
      <p className="bk-hint small muted">Deslize para o lado para ver a chave inteira.</p>
      <BracketCanvas
        label="Chave dos playoffs"
        colWidths={[colW, colW, colW, colW, colW]}
        gap={gap}
        height={height}
        nodes={nodes}
        edges={edges}
        headers={headers}
        team={team}
        onView={onView}
      />
    </div>
  );
}
