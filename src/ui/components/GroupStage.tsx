import { useState } from 'react';
import { matchWinner, type GroupKey } from '../../engine/tournament';
import { USER_ID, type GroupView } from '../../game/run';
import { sidesOf } from './Bracket';
import {
  BOX_H,
  BracketCanvas,
  CAP_H,
  HEAD_H,
  PITCH,
  type CanvasEdge,
  type CanvasHeader,
  type CanvasNode,
  type TeamRef,
} from './BracketCanvas';
import { Icon, YouTag } from './Icon';
import { GroupTable } from './Standings';
import { useWide } from './useWide';

interface Props {
  views: GroupView[];
  team: (id: string) => TeamRef;
  onView?: (matchId: string) => void;
}

/**
 * Groups A–D, each drawn as a GSL bracket with its table. Desktop: every group in a 2×2 grid (the user's group
 * first). Phones: one group at a time with a group switcher, starting on the user's group.
 */
export function GroupStage({ views, team, onView }: Props) {
  const [selected, setSelected] = useState<GroupKey>(views[0]?.group ?? 'A');
  const ordered = [...views].sort((x, y) => (x.group < y.group ? -1 : 1));
  return (
    <div className="group-stage">
      <div className="group-switch" role="group" aria-label="Escolher grupo">
        {ordered.map((v) => (
          <button
            key={v.group}
            type="button"
            className="group-switch-btn"
            aria-pressed={selected === v.group}
            onClick={() => setSelected(v.group)}
          >
            Grupo {v.group}
            {v.hasUser && <Icon name="you" label="seu grupo" />}
          </button>
        ))}
      </div>
      <p className="bk-hint small muted">Deslize o grupo para o lado para ver os classificados.</p>
      <div className="groups-grid">
        {views.map((v) => (
          <GroupCard key={v.group} view={v} team={team} onView={onView} selected={selected === v.group} />
        ))}
      </div>
    </div>
  );
}

const UPPER_HEADS = ['Abertura', 'Vencedores', 'Classificado'];
const LOWER_HEADS = ['Eliminação', 'Decisiva', 'Classificado'];

function GroupCard({
  view,
  team,
  onView,
  selected,
}: {
  view: GroupView;
  team: (id: string) => TeamRef;
  onView?: (matchId: string) => void;
  selected: boolean;
}) {
  const wide = useWide();
  const colWidths = wide ? [170, 170, 150] : [164, 164, 144];
  const gap = wide ? 28 : 22;
  const g = view.group;

  const top = HEAD_H + 6;
  const rowCy = (base: number, row: number) => base + CAP_H + BOX_H / 2 + row * PITCH;
  const lowerHead = rowCy(top, 1) + BOX_H / 2 + 16;
  const lowerTop = lowerHead + HEAD_H + 6;
  const height = rowCy(lowerTop, 0) + BOX_H / 2 + 8;

  const place: Record<string, { col: number; cy: number }> = {
    [`${g}-opening-1`]: { col: 0, cy: rowCy(top, 0) },
    [`${g}-opening-2`]: { col: 0, cy: rowCy(top, 1) },
    [`${g}-winners`]: { col: 1, cy: rowCy(top, 0.5) },
    [`${g}-elimination`]: { col: 0, cy: rowCy(lowerTop, 0) },
    [`${g}-decider`]: { col: 1, cy: rowCy(lowerTop, 0) },
  };
  const matchOf = (round: string) => view.cells.find((c) => c.slot.round === round)?.match;
  const winners = matchOf('winners');
  const decider = matchOf('decider');
  const first = winners && matchWinner(winners);
  const second = decider && matchWinner(decider);

  const nodes: CanvasNode[] = [
    ...view.cells.map(({ slot, match }): CanvasNode => ({
      kind: 'match',
      key: slot.id,
      col: place[slot.id]!.col,
      cy: place[slot.id]!.cy,
      label: slot.label,
      bestOf: slot.bestOf,
      sides: sidesOf(match, slot.a, slot.b, () => 'A definir'),
      played: !!match?.result,
    })),
    {
      kind: 'slot',
      key: `${g}-first`,
      col: 2,
      cy: rowCy(top, 0.5),
      label: `Grupo ${g}, 1º lugar, classificado`,
      ...(first ? { id: first } : {}),
      placeholder: 'A definir',
    },
    {
      kind: 'slot',
      key: `${g}-second`,
      col: 2,
      cy: rowCy(lowerTop, 0),
      label: `Grupo ${g}, 2º lugar, classificado`,
      ...(second ? { id: second } : {}),
      placeholder: 'A definir',
    },
  ];
  const won = (id: string) => {
    const m = view.cells.find((c) => c.slot.id === id)?.match;
    return !!m && matchWinner(m) === USER_ID;
  };
  const edges: CanvasEdge[] = [
    { from: `${g}-opening-1`, to: `${g}-winners`, user: won(`${g}-opening-1`) },
    { from: `${g}-opening-2`, to: `${g}-winners`, user: won(`${g}-opening-2`) },
    { from: `${g}-winners`, to: `${g}-first`, user: won(`${g}-winners`) },
    // The elimination winner is the decider's bottom team (the top one drops from the winners' match).
    { from: `${g}-elimination`, to: `${g}-decider`, user: won(`${g}-elimination`), toSide: 1 },
    { from: `${g}-decider`, to: `${g}-second`, user: won(`${g}-decider`) },
  ];
  const headers: CanvasHeader[] = [
    ...UPPER_HEADS.map((text, col) => ({ col, y: 0, text })),
    ...LOWER_HEADS.map((text, col) => ({ col, y: lowerHead, text })),
  ];

  return (
    <section
      className={`group-card${view.hasUser ? ' has-user' : ''}${selected ? ' is-selected' : ''}`}
      aria-labelledby={`group-${g}-title`}
    >
      <h3 id={`group-${g}-title`} className="group-title">
        Grupo {g}
        {view.hasUser && <YouTag />}
      </h3>
      <BracketCanvas
        label={`Chave do Grupo ${g}`}
        colWidths={colWidths}
        gap={gap}
        height={height}
        nodes={nodes}
        edges={edges}
        headers={headers}
        team={team}
        onView={onView}
      />
      <GroupTable group={g} rows={view.rows} team={team} />
    </section>
  );
}
