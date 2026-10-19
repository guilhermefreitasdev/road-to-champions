import { lmatchWinner, type LMatch, type LeagueSource } from '../../engine/league';
import { USER_ID, type LeagueCell } from '../../game/season';
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

const SHORT: Record<string, string> = { 'qf-1': 'Quartas 1', 'qf-2': 'Quartas 2', 'sf-1': 'Semi 1', 'sf-2': 'Semi 2' };

function sourceLabel(src: LeagueSource): string {
  if ('place' in src) return `${src.place}º Grupo ${src.group}`;
  if ('winnerOf' in src) return `Vencedor ${SHORT[src.winnerOf] ?? src.winnerOf}`;
  return `Perdedor ${SHORT[src.loserOf] ?? src.loserOf}`;
}

function sidesOf(match: LMatch | undefined, a: LeagueSource, b: LeagueSource): [MatchSide, MatchSide] {
  return ([0, 1] as const).map((i): MatchSide => {
    if (!match) return { placeholder: sourceLabel(i === 0 ? a : b) };
    const side: MatchSide = { id: i === 0 ? match.a : match.b, placeholder: '' };
    if (match.result) {
      side.score = match.result.score[i];
      side.won = match.result.winner === i;
    }
    return side;
  }) as [MatchSide, MatchSide];
}

/** Column and row of each playoff slot: quarters on the left, semis, then the final with the 3rd-place match under it. */
const LAYOUT: Record<string, { col: number; row: number }> = {
  'qf-1': { col: 0, row: 0 },
  'qf-2': { col: 0, row: 1 },
  'sf-2': { col: 1, row: 0 },
  'sf-1': { col: 1, row: 1 },
  final: { col: 2, row: 0.5 },
  third: { col: 2, row: 2 },
};

/** Winners moving on: the quarter-final winner is the bottom team of its semi. */
const EDGES: [string, string, (0 | 1)?][] = [
  ['qf-1', 'sf-2', 1],
  ['qf-2', 'sf-1', 1],
  ['sf-1', 'final'],
  ['sf-2', 'final'],
];

const HEADS = ['Quartas', 'Semifinais', 'Final'];

interface Props {
  cells: LeagueCell[];
  team: (id: string) => TeamRef;
  onView?: (matchId: string) => void;
}

/** The 6-team league playoffs: the group winners enter in the semis; the semi losers decide the last Masters slot. */
export function LeagueBracket({ cells, team, onView }: Props) {
  const wide = useWide();
  const colW = wide ? 196 : 172;
  const gap = wide ? 40 : 28;
  const top = HEAD_H + 6;
  const rowCy = (row: number) => top + CAP_H + BOX_H / 2 + row * PITCH;
  const thirdHead = rowCy(2) - BOX_H / 2 - CAP_H - HEAD_H - 4;
  const height = rowCy(2) + BOX_H / 2 + 8;

  const byId = new Map(cells.map((c) => [c.slot.id, c]));
  const nodes: CanvasNode[] = cells.map(({ slot, match }) => ({
    kind: 'match',
    key: slot.id,
    col: LAYOUT[slot.id]!.col,
    cy: rowCy(LAYOUT[slot.id]!.row),
    label: slot.label,
    bestOf: slot.bestOf,
    sides: sidesOf(match, slot.a, slot.b),
    played: !!match?.result,
  }));
  const edges: CanvasEdge[] = EDGES.map(([from, to, toSide]) => {
    const m = byId.get(from)?.match;
    const edge: CanvasEdge = { from, to, user: !!m && lmatchWinner(m) === USER_ID };
    if (toSide !== undefined) edge.toSide = toSide;
    return edge;
  });
  const headers: CanvasHeader[] = [
    ...HEADS.map((text, col) => ({ col, y: 0, text })),
    { col: 2, y: thirdHead, text: '3º lugar · vaga no Masters' },
  ];

  return (
    <div className="playoff-bracket league-bracket">
      <p className="bk-hint small muted">Deslize para o lado para ver a chave inteira.</p>
      <BracketCanvas
        label="Chave dos playoffs da liga"
        colWidths={[colW, colW, colW]}
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
