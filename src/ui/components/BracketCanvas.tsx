import type { ReactNode } from 'react';
import type { BestOf } from '../../engine/types';
import { USER_ID } from '../../game/run';
import { Icon, YouTag } from './Icon';
import { TeamLogo } from './TeamLogo';

/**
 * Liquipedia-style bracket drawing: match boxes on a fixed grid of columns, joined by SVG connector lines.
 * The geometry is plain numbers (px), so the lines always meet the boxes exactly; colors come from CSS
 * (see "Brackets" in styles.css). The boxes are also a real list for screen readers: every match has a
 * spoken summary, and the drawing (lines, headers, visual rows) is hidden from assistive tech.
 */

/** Height of one team row; a match box is two rows plus borders. Even numbers keep the lines crisp. */
export const ROW_H = 31;
export const BOX_H = 2 * ROW_H + 2;
/** Caption line above a match box (best-of, "Sua partida", "Ver série"). */
export const CAP_H = 24;
/** Single-row box (a qualified slot). */
export const SLOT_H = ROW_H + 3;
/** Vertical distance between two stacked matches. */
export const PITCH = CAP_H + BOX_H + 12;
/** Height of a row of column headers. */
export const HEAD_H = 26;

export interface TeamRef {
  teamId: string;
  eventId?: string;
  name: string;
}

export interface MatchSide {
  /** Entrant id, once known. */
  id?: string;
  /** Text when the team is not known yet ("A definir", "Vencedor Quartas 1"…). */
  placeholder: string;
  score?: number;
  won?: boolean;
}

export type CanvasNode =
  | {
      kind: 'match';
      key: string;
      col: number;
      /** Vertical center of the box, px from the canvas top. */
      cy: number;
      label: string;
      bestOf: BestOf;
      sides: [MatchSide, MatchSide];
      played: boolean;
    }
  | {
      kind: 'slot';
      key: string;
      col: number;
      cy: number;
      label: string;
      id?: string;
      placeholder: string;
    };

export interface CanvasEdge {
  from: string;
  to: string;
  /** Drawn in the accent color: the user's path through the bracket. */
  user?: boolean;
  /** Lands on this row of the target match (0 = top team, 1 = bottom) instead of the box center. */
  toSide?: 0 | 1;
}

export interface CanvasHeader {
  col: number;
  /** Top of the header, px. */
  y: number;
  text: string;
}

interface Props {
  /** Accessible name of the bracket region ("Chave do Grupo A"). */
  label: string;
  colWidths: number[];
  gap: number;
  height: number;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  headers: CanvasHeader[];
  team: (id: string) => TeamRef;
  /** Opens the user's played series. */
  onView?: (matchId: string) => void;
  className?: string;
}

export function BracketCanvas({ label, colWidths, gap, height, nodes, edges, headers, team, onView, className }: Props) {
  const colX = (col: number) => colWidths.slice(0, col).reduce((s, w) => s + w + gap, 0);
  const width = colX(colWidths.length - 1) + (colWidths[colWidths.length - 1] ?? 0);
  const byKey = new Map(nodes.map((n) => [n.key, n]));

  const paths = edges.flatMap((e) => {
    const a = byKey.get(e.from);
    const b = byKey.get(e.to);
    if (!a || !b) return [];
    const x1 = colX(a.col) + (colWidths[a.col] ?? 0);
    const x2 = colX(b.col);
    const xm = x2 - Math.round(gap / 2);
    const y2 = e.toSide === undefined ? b.cy : b.cy + (e.toSide === 0 ? -1 : 1) * Math.round(ROW_H / 2);
    return [{ key: `${e.from}>${e.to}`, d: `M${x1} ${a.cy}H${xm}V${y2}H${x2}`, user: !!e.user }];
  });

  return (
    <div className={`bk-scroll${className ? ` ${className}` : ''}`} role="region" aria-label={label} tabIndex={0}>
      <div className="bk-canvas" style={{ width, height }}>
        <svg className="bk-lines" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
          {/* User path last, so it is drawn on top. */}
          {[...paths.filter((p) => !p.user), ...paths.filter((p) => p.user)].map((p) => (
            <path key={p.key} d={p.d} className={p.user ? 'is-user' : undefined} />
          ))}
        </svg>
        <div aria-hidden="true">
          {headers.map((h) => (
            <span
              key={`${h.col}-${h.y}`}
              className="bk-head"
              style={{ left: colX(h.col), top: h.y, width: colWidths[h.col], height: HEAD_H }}
            >
              {h.text}
            </span>
          ))}
        </div>
        <ol className="bk-list">
          {nodes.map((n) =>
            n.kind === 'match' ? (
              <MatchNode key={n.key} node={n} left={colX(n.col)} width={colWidths[n.col] ?? 0} team={team} onView={onView} />
            ) : (
              <SlotNode key={n.key} node={n} left={colX(n.col)} width={colWidths[n.col] ?? 0} team={team} />
            ),
          )}
        </ol>
      </div>
    </div>
  );
}

function spokenSide(side: MatchSide, team: (id: string) => TeamRef): string {
  const name = side.id ? team(side.id).name : side.placeholder;
  return side.id === USER_ID ? `${name} (você)` : name;
}

function MatchNode({
  node,
  left,
  width,
  team,
  onView,
}: {
  node: Extract<CanvasNode, { kind: 'match' }>;
  left: number;
  width: number;
  team: (id: string) => TeamRef;
  onView?: (matchId: string) => void;
}) {
  const [a, b] = node.sides;
  const hasUser = a.id === USER_ID || b.id === USER_ID;
  const winner = a.won ? a : b.won ? b : undefined;
  const spoken = node.played
    ? `${node.label}, melhor de ${node.bestOf}: ${spokenSide(a, team)} ${a.score ?? 0}, ${spokenSide(b, team)} ${b.score ?? 0}. Vitória de ${winner ? spokenSide(winner, team) : '—'}.`
    : `${node.label}, melhor de ${node.bestOf}: ${spokenSide(a, team)} contra ${spokenSide(b, team)}${hasUser ? '. Sua partida' : ''}${a.id && b.id ? ', a jogar' : ''}.`;
  const opponent = a.id === USER_ID ? b : a;

  return (
    <li
      className={`bk-node bk-match${hasUser ? ' has-user' : ''}${node.played ? ' is-played' : ''}`}
      style={{ left, top: node.cy - BOX_H / 2 - CAP_H, width }}
    >
      <span className="sr-only">{spoken}</span>
      <div className="bk-cap">
        <span className="bk-bo" aria-hidden="true">
          MD{node.bestOf}
        </span>
        {hasUser && (
          <span className="bk-yours" aria-hidden="true">
            Sua partida
          </span>
        )}
        {hasUser && node.played && onView && (
          <button
            type="button"
            className="bk-view"
            onClick={() => onView(node.key)}
            aria-label={`Ver série contra ${opponent.id ? team(opponent.id).name : opponent.placeholder}`}
          >
            Ver série
          </button>
        )}
      </div>
      <div className="bk-box" aria-hidden="true">
        {node.sides.map((side, i) => (
          <TeamRow key={i} side={side} played={node.played} team={team} />
        ))}
      </div>
    </li>
  );
}

function TeamRow({ side, played, team }: { side: MatchSide; played: boolean; team: (id: string) => TeamRef }) {
  if (!side.id) {
    return (
      <div className="bk-row is-tbd">
        <span className="bk-name">{side.placeholder}</span>
      </div>
    );
  }
  const t = team(side.id);
  const isUser = side.id === USER_ID;
  const state = played ? (side.won ? ' is-win' : ' is-loss') : '';
  return (
    <div className={`bk-row${state}${isUser ? ' is-user' : ''}`} title={t.name}>
      {/* The user's row is marked by the "você" tag instead of a logo: it keeps room for the name. */}
      {!isUser && <TeamLogo teamId={t.teamId} eventId={t.eventId} name={t.name} size={18} />}
      <span className="bk-name">{t.name}</span>
      {isUser && <YouTag />}
      <span className="bk-score">{played ? side.score : ''}</span>
    </div>
  );
}

function SlotNode({
  node,
  left,
  width,
  team,
}: {
  node: Extract<CanvasNode, { kind: 'slot' }>;
  left: number;
  width: number;
  team: (id: string) => TeamRef;
}) {
  const t: ReactNode = node.id ? team(node.id).name : node.placeholder;
  const isUser = node.id === USER_ID;
  return (
    <li
      className={`bk-node bk-slot${node.id ? ' is-filled' : ''}${isUser ? ' has-user' : ''}`}
      style={{ left, top: node.cy - SLOT_H / 2, width }}
    >
      <span className="sr-only">
        {node.label}: {node.id ? spokenSide({ id: node.id, placeholder: '' }, team) : node.placeholder}.
      </span>
      <div className={`bk-row${node.id ? '' : ' is-tbd'}${isUser ? ' is-user' : ''}`} aria-hidden="true">
        {node.id && !isUser && (
          <TeamLogo teamId={team(node.id).teamId} eventId={team(node.id).eventId} name={team(node.id).name} size={18} />
        )}
        <span className="bk-name">{t}</span>
        {isUser && <YouTag />}
        {node.id && (
          <span className="bk-check" title="Classificado">
            <Icon name="check" />
          </span>
        )}
      </div>
    </li>
  );
}
