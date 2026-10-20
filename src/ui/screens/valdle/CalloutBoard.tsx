import { useId, useMemo } from 'react';
import { calloutLabel, type ClassicCallout, type ClassicMap } from '../../../game/valdle/classic';
import { voronoiCells, type Pt } from '../../../game/valdle/geometry';
import { useMinimap } from './media';

/** Side of the board's square viewBox: callout positions are minimap fractions, so x * S is a board coordinate. */
const S = 1000;

const SUPER_CLASS: Record<string, string> = { A: 'a', B: 'b', C: 'c', Mid: 'mid' };

const pathOf = (poly: readonly Pt[]) => `M${poly.map((p) => `${(p.x * S).toFixed(1)},${(p.y * S).toFixed(1)}`).join('L')}Z`;

export interface CalloutBoardProps {
  map: ClassicMap;
  /** The callout asked. */
  answer: ClassicCallout;
  /** Whether the answer's area is filled and pinned. */
  showAnswer: boolean;
  /** Whether the answer is named on the board: only at the end, and never any other area. */
  labelAnswer: boolean;
  ariaLabel: string;
  className?: string;
}

/**
 * The map of the Callout game (a picture: no area is clickable or named, except the answer at the end). With the real minimap (valorant-api.com
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
  return { viewBox: `0 0 ${S} ${S}`, role: 'img', 'aria-label': props.ariaLabel } as const;
}

/** The real minimap with invisible areas clipped to its walkable part (only the answer's is drawn). */
function MinimapBoard(props: CalloutBoardProps & { cells: Pt[][]; src: string }) {
  const { map, answer, cells, src } = props;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const id = (name: string) => `vd-mm-${name}-${uid}`;
  const url = (name: string) => `url(#${id(name)})`;
  const i = useMemo(() => map.callouts.findIndex((c) => c.id === answer.id), [map, answer]);
  return (
    <div className={`vd-callout-stage vd-mm-stage ${props.className ?? ''}`}>
      <svg {...svgProps(props)}>
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
          <filter id={id('ring')} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
            {/* The fill is translucent: make its alpha solid, grow it, and keep only the growth (a ring around the shape). */}
            <feComponentTransfer in="SourceAlpha" result="solid">
              <feFuncA type="linear" slope={40} />
            </feComponentTransfer>
            <feMorphology in="solid" operator="dilate" radius={7} result="grown" />
            <feComposite in="grown" in2="solid" operator="out" result="ring" />
            <feFlood floodColor="#ff4655" />
            <feComposite in2="ring" operator="in" result="stroke" />
            <feMerge>
              <feMergeNode in="SourceGraphic" />
              <feMergeNode in="stroke" />
            </feMerge>
          </filter>
        </defs>
        <image href={src} x={0} y={0} width={S} height={S} preserveAspectRatio="none" filter={url('tint')} className="vd-mm-img" />
        {props.showAnswer && i >= 0 && (
          <g filter={url('ring')} className="vd-mm-area answer">
            <path d={pathOf(cells[i]!)} mask={url('walk')} />
          </g>
        )}
        {props.showAnswer && <AnswerPin answer={answer} label={props.labelAnswer} />}
      </svg>
    </div>
  );
}

/** Fallback without the minimap: the schema of colored Voronoi cells with the region letters. */
function SchemaBoard(props: CalloutBoardProps & { cells: Pt[][] }) {
  const { map, answer, cells } = props;
  const supers = [...new Set(map.callouts.map((c) => c.superRegionEn))].filter((s) => SUPER_CLASS[s]);
  return (
    <div className={`vd-callout-stage ${props.className ?? ''}`}>
      <svg {...svgProps(props)}>
        {map.callouts.map((c, i) => {
          const isAnswer = props.showAnswer && c.id === answer.id;
          return <path key={c.id} d={pathOf(cells[i]!)} className={`vd-cc ${SUPER_CLASS[c.superRegionEn] ?? 'spawn'}${isAnswer ? ' answer' : ''}`} />;
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
        {props.showAnswer && <AnswerPin answer={answer} label={props.labelAnswer} />}
      </svg>
    </div>
  );
}
