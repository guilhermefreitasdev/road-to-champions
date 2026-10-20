import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { calloutLabel, type ClassicCallout, type ClassicMap } from '../../../game/valdle/classic';
import { centroid, voronoiCells, type Pt } from '../../../game/valdle/geometry';
import { useMinimap } from './media';

/** Side of the board's square viewBox: callout positions are minimap fractions, so x * S is a board coordinate. */
const S = 1000;

const SUPER_CLASS: Record<string, string> = { A: 'a', B: 'b', C: 'c', Mid: 'mid' };

const pathOf = (poly: readonly Pt[]) => `M${poly.map((p) => `${(p.x * S).toFixed(1)},${(p.y * S).toFixed(1)}`).join('L')}Z`;

export interface CalloutBoardProps {
  map: ClassicMap;
  /** The callout asked (Callout) or shown in the screenshot (Mapa, "Onde é?"). */
  answer: ClassicCallout;
  /** Whether the answer's area is filled and pinned (Callout: always; "Onde é?": only at the end). */
  showAnswer: boolean;
  /** Whether the answer is named on the board: only at the end, and never any other area. */
  labelAnswer: boolean;
  /** "Onde é?": the area picked and not yet confirmed, the wrong confirmed picks and the area numbers. */
  selected?: string | null;
  missed?: readonly string[];
  numbers?: ReadonlyMap<string, number>;
  /** Clicks and keys pick areas ("Onde é?"); absent on the Callout game, whose board is only a picture. */
  onChoose?: (id: string) => void;
  onKeyDown?: (e: KeyboardEvent<SVGSVGElement>) => void;
  ariaLabel: string;
  className?: string;
}

/**
 * The map of the Callout game and of the Mapa game's "Onde é?" step. With the real minimap (valorant-api.com
 * `displayIcon`, local copy first; see ./media.ts) the image IS the map: each callout's area is its Voronoi cell
 * (geometry.ts) clipped to the minimap's walkable part through an SVG mask built from the image's alpha, invisible
 * except when hovered, picked, missed or revealed. Without the minimap (no local copy and the CDN unreachable) it falls
 * back to the schema: the colored cells and the region letters. Only the answer is ever named, and only at the end.
 */
export function CalloutBoard(props: CalloutBoardProps) {
  const minimap = useMinimap(props.map.minimap);
  const cells = useMemo(() => voronoiCells(props.map.callouts), [props.map]);
  if (minimap.status === 'loading') {
    return (
      <div className={`vd-callout-stage vd-mm-stage ${props.className ?? ''}`} aria-busy="true">
        <div className="vd-mm-loading small muted">Carregando o minimapa…</div>
      </div>
    );
  }
  return minimap.status === 'ready' ? <MinimapBoard {...props} cells={cells} src={minimap.src} /> : <SchemaBoard {...props} cells={cells} />;
}

function AnswerPin({ answer, label }: { answer: ClassicCallout; label: boolean }) {
  return (
    <g className="vd-cc-label answer">
      <circle cx={answer.x * S} cy={answer.y * S} r={16} className="vd-cc-pin" />
      {label && (
        <text
          x={Math.min(0.86, Math.max(0.14, answer.x)) * S}
          y={Math.min(0.96, Math.max(0.04, answer.y + 0.044)) * S}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {calloutLabel(answer)}
        </text>
      )}
    </g>
  );
}

function svgProps(props: CalloutBoardProps) {
  const live = !!props.onChoose;
  return {
    viewBox: `0 0 ${S} ${S}`,
    role: live ? 'group' : 'img',
    'aria-label': props.ariaLabel,
    tabIndex: live ? 0 : undefined,
    onKeyDown: props.onKeyDown,
    className: live ? 'vd-where-live' : undefined,
  } as const;
}

/** The real minimap with invisible areas clipped to its walkable part. */
function MinimapBoard(props: CalloutBoardProps & { cells: Pt[][]; src: string }) {
  const { map, answer, cells, src, selected, missed = [], numbers, onChoose } = props;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [hover, setHover] = useState<string | null>(null);
  const id = (name: string) => `vd-mm-${name}-${uid}`;
  const url = (name: string) => `url(#${id(name)})`;
  const index = useMemo(() => new Map(map.callouts.map((c, i) => [c.id, i])), [map]);
  const byId = useMemo(() => new Map(map.callouts.map((c) => [c.id, c])), [map]);
  /** One area clipped to the walkable part, inside a group whose filter draws the clipped shape's outline. */
  const area = (cid: string, cls: string, ring: string | null) => {
    const i = index.get(cid);
    if (i === undefined) return null;
    return (
      <g key={`${cls}-${cid}`} filter={ring ? url(ring) : undefined} className={`vd-mm-area ${cls}`}>
        <path d={pathOf(cells[i]!)} mask={url('walk')} />
      </g>
    );
  };
  const ring = (name: string, color: string, radius: number) => (
    <filter id={id(name)} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
      {/* The fill is translucent: make its alpha solid, grow it, and keep only the growth (a ring around the shape). */}
      <feComponentTransfer in="SourceAlpha" result="solid">
        <feFuncA type="linear" slope={40} />
      </feComponentTransfer>
      <feMorphology in="solid" operator="dilate" radius={radius} result="grown" />
      <feComposite in="grown" in2="solid" operator="out" result="ring" />
      <feFlood floodColor={color} />
      <feComposite in2="ring" operator="in" result="stroke" />
      <feMerge>
        <feMergeNode in="SourceGraphic" />
        <feMergeNode in="stroke" />
      </feMerge>
    </filter>
  );
  const sel = selected ? byId.get(selected) : undefined;
  const live = !!onChoose;
  return (
    <div className={`vd-callout-stage vd-mm-stage ${props.className ?? ''}`}>
      <svg {...svgProps(props)} onPointerLeave={() => setHover(null)}>
        <defs>
          {/* Luminance mask from the image's alpha: every visible pixel of the minimap becomes white. */}
          <filter id={id('alpha')} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.6 -0.3" />
          </filter>
          <mask id={id('walk')} maskUnits="userSpaceOnUse" x={0} y={0} width={S} height={S}>
            <image href={src} x={0} y={0} width={S} height={S} preserveAspectRatio="none" filter={url('alpha')} />
          </mask>
          {/* A slight cool tint so the grey minimap sits in the theme. */}
          <filter id={id('tint')} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="0.9 0 0 0 0.01  0 0.97 0 0 0.02  0 0 1.06 0 0.04  0 0 0 1 0" />
          </filter>
          {ring('ring', '#ffffff', 5)}
          {ring('ring-answer', '#ff4655', 7)}
        </defs>
        <image href={src} x={0} y={0} width={S} height={S} preserveAspectRatio="none" filter={url('tint')} className="vd-mm-img" />
        {missed.map((m) => area(m, 'missed', null))}
        {props.showAnswer && area(answer.id, 'answer', 'ring-answer')}
        {live && hover && hover !== selected && area(hover, 'hover', 'ring')}
        {live && sel && area(sel.id, 'selected', 'ring')}
        {missed.map((m) => {
          const c = byId.get(m);
          if (!c || (props.showAnswer && m === answer.id)) return null;
          const d = 11;
          return (
            <path
              key={`x-${m}`}
              className="vd-mm-miss"
              d={`M${c.x * S - d},${c.y * S - d}L${c.x * S + d},${c.y * S + d}M${c.x * S + d},${c.y * S - d}L${c.x * S - d},${c.y * S + d}`}
            />
          );
        })}
        {live && sel && numbers && (
          <text x={sel.x * S} y={sel.y * S} className="vd-where-n" textAnchor="middle" dominantBaseline="middle">
            {numbers.get(sel.id)}
          </text>
        )}
        {props.showAnswer && <AnswerPin answer={answer} label={props.labelAnswer} />}
        {/* Hit areas: the whole Voronoi cells, invisible (a tap near a corridor still picks it). */}
        {live &&
          map.callouts.map((c, i) => (
            <path
              key={`hit-${c.id}`}
              d={pathOf(cells[i]!)}
              className="vd-mm-hit"
              onClick={() => onChoose(c.id)}
              onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(c.id)}
            />
          ))}
      </svg>
    </div>
  );
}

/** Fallback without the minimap: the schema of colored Voronoi cells with the region letters. */
function SchemaBoard(props: CalloutBoardProps & { cells: Pt[][] }) {
  const { map, answer, cells, selected, missed = [], numbers, onChoose } = props;
  const supers = [...new Set(map.callouts.map((c) => c.superRegionEn))].filter((s) => SUPER_CLASS[s]);
  const live = !!onChoose;
  const selIndex = selected ? map.callouts.findIndex((c) => c.id === selected) : -1;
  const selCell = selIndex >= 0 ? cells[selIndex] : undefined;
  const selCenter = selCell ? centroid(selCell) : null;
  return (
    <div className={`vd-callout-stage ${props.className ?? ''}`}>
      <svg {...svgProps(props)}>
        {map.callouts.map((c, i) => {
          const isAnswer = props.showAnswer && c.id === answer.id;
          const miss = missed.includes(c.id) && c.id !== answer.id;
          const cls = `vd-cc ${SUPER_CLASS[c.superRegionEn] ?? 'spawn'}${isAnswer ? ' answer' : ''}${miss ? ' missed' : ''}${live && c.id === selected ? ' selected' : ''}`;
          return <path key={c.id} d={pathOf(cells[i]!)} className={cls} onClick={onChoose ? () => onChoose(c.id) : undefined} />;
        })}
        {supers.map((s) => {
          const pts = map.callouts.filter((c) => c.superRegionEn === s);
          const cx = pts.reduce((t, c) => t + c.x, 0) / pts.length;
          const cy = pts.reduce((t, c) => t + c.y, 0) / pts.length;
          return (
            <text key={s} x={cx * S} y={cy * S} className="vd-cc-super" textAnchor="middle" dominantBaseline="middle">
              {s === 'Mid' ? 'MEIO' : s}
            </text>
          );
        })}
        {live && selCell && <path d={pathOf(selCell)} className="vd-where-outline" />}
        {live && selCenter && numbers && (
          <text x={selCenter.x * S} y={selCenter.y * S} className="vd-where-n" textAnchor="middle" dominantBaseline="middle">
            {numbers.get(selected!)}
          </text>
        )}
        {props.showAnswer && <AnswerPin answer={answer} label={props.labelAnswer} />}
      </svg>
    </div>
  );
}
