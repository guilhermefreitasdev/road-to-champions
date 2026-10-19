/** Small stroke icon set (24px grid, 2px stroke, currentColor). Decorative unless a label is given. */
export type IconName = 'ban' | 'pick' | 'decider' | 'trophy' | 'check' | 'you' | 'copy' | 'share' | 'skip' | 'dice';

const PATHS: Record<IconName, string> = {
  ban: 'M6 6l12 12M18 6L6 18',
  pick: 'M5 12.5l4.5 4.5L19 7.5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  decider: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
  trophy:
    'M8 4h8v5a4 4 0 01-8 0zM8 6H4.5v1.5A3.5 3.5 0 008 11M16 6h3.5v1.5A3.5 3.5 0 0116 11M12 13v4M8.5 20h7M9.5 17h5v3h-5z',
  you: 'M12 3l7 4v5c0 4.2-3 7.6-7 9-4-1.4-7-4.8-7-9V7z',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  share: 'M12 3v12M7.5 7.5L12 3l4.5 4.5M5 13v7h14v-7',
  skip: 'M5 5l8 7-8 7zM16 5v14',
  dice: 'M5 5h14v14H5zM9 9h.01M15 9h.01M12 12h.01M9 15h.01M15 15h.01',
};

export function Icon({ name, label, className }: { name: IconName; label?: string; className?: string }) {
  return (
    <svg
      className={`icon icon-${name}${className ? ` ${className}` : ''}`}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** "Você" tag that marks the user's team everywhere (text + shape, never color alone). */
export function YouTag() {
  return (
    <span className="you-tag">
      <Icon name="you" />
      você
    </span>
  );
}
