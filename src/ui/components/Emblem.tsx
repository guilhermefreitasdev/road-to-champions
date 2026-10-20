/**
 * Road to Champions emblem: a shield with an inner chevron "road" and the RTC monogram. Pure SVG in the palette's
 * currentColor/accent, so it scales from the topbar (24px) to the hero (~96px).
 */
export function Emblem({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={`emblem${className ? ` ${className}` : ''}`}
      width={size}
      height={Math.round(size * 1.125)}
      viewBox="0 0 64 72"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M32 3l26 9v22c0 18-12 29-26 35C18 63 6 52 6 34V12z" fill="rgba(15,25,35,0.85)" stroke="var(--accent)" strokeWidth="3" />
      <path d="M32 10l19 6.6V34c0 13.6-8.6 22.4-19 27.4C21.6 56.4 13 47.6 13 34V16.6z" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <path d="M20 52l12-8 12 8" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round" />
      <text
        x="32"
        y="38"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="'Barlow Condensed', 'Arial Narrow', sans-serif"
        fontStyle="italic"
        fontWeight="900"
        fontSize="19"
        letterSpacing="0.5"
      >
        RTC
      </text>
    </svg>
  );
}
