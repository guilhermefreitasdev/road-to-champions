import type { OrgEmblem as OrgEmblemValue } from '../../game/career';

/**
 * The career org's emblem: a shield shape × an accent color, with the org's tag inside. Pure SVG (no uploads); the
 * choice is stored in the career (`org.emblem`), and an old or unknown key falls back to the default.
 */

export const EMBLEM_SHAPES = [
  { key: 'classic', label: 'Clássico', path: 'M32 3 58 11v23c0 18-12 29-26 35C18 63 6 52 6 34V11z' },
  { key: 'crest', label: 'Brasão', path: 'M6 5h15l11 8 11-8h15v29c0 18-12 29-26 35C18 63 6 52 6 34z' },
  { key: 'kite', label: 'Pipa', path: 'M32 3 58 14l-8 32-18 23-18-23-8-32z' },
  { key: 'hex', label: 'Hexágono', path: 'M32 3 58 17v34L32 67 6 51V17z' },
  { key: 'round', label: 'Arredondado', path: 'M7 5h50v30c0 19-11 31-25 34C18 66 7 54 7 35z' },
] as const;

export const EMBLEM_COLORS = [
  { key: 'red', label: 'Vermelho', value: '#ff4655' },
  { key: 'gold', label: 'Dourado', value: '#f4c66a' },
  { key: 'teal', label: 'Verde-água', value: '#3ec9a7' },
  { key: 'blue', label: 'Azul', value: '#7cc4ff' },
  { key: 'violet', label: 'Violeta', value: '#b49cff' },
  { key: 'orange', label: 'Laranja', value: '#ff8a65' },
] as const;

export type EmblemShape = (typeof EMBLEM_SHAPES)[number]['key'];
export type EmblemColor = (typeof EMBLEM_COLORS)[number]['key'];

export const DEFAULT_EMBLEM: OrgEmblemValue = { shape: 'classic', color: 'red' };

const shapeOf = (key: string | undefined) => EMBLEM_SHAPES.find((s) => s.key === key) ?? EMBLEM_SHAPES[0];
const colorOf = (key: string | undefined) => EMBLEM_COLORS.find((c) => c.key === key) ?? EMBLEM_COLORS[0];

interface Props {
  emblem?: OrgEmblemValue | undefined;
  tag: string;
  size?: number;
  /** Spoken name ("Escudo da Furia Azul"); absent = decorative (the name is next to it). */
  label?: string;
  className?: string;
}

export function OrgEmblem({ emblem, tag, size = 40, label, className }: Props) {
  const shape = shapeOf(emblem?.shape);
  const color = colorOf(emblem?.color).value;
  const text = tag.slice(0, 4).toUpperCase();
  const fontSize = text.length >= 4 ? 14 : text.length === 3 ? 17 : 21;
  return (
    <svg
      className={`org-emblem${className ? ` ${className}` : ''}`}
      viewBox="0 0 64 72"
      width={size}
      height={(size * 72) / 64}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={shape.path} fill="#16212c" stroke={color} strokeWidth="3" strokeLinejoin="round" />
      <path d={shape.path} fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="1.5" strokeLinejoin="round" transform="translate(32 36) scale(0.78) translate(-32 -36)" />
      <path d="M18 17h28" stroke={color} strokeWidth="3" strokeLinecap="round" />
      <text
        x="32"
        y="44"
        textAnchor="middle"
        fill="#ece8e1"
        fontSize={fontSize}
        fontWeight="900"
        fontStyle="italic"
        fontFamily="'Barlow Condensed', 'Arial Narrow', sans-serif"
        letterSpacing="0.5"
      >
        {text}
      </text>
    </svg>
  );
}
