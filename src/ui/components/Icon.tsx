/** Small stroke icon set (24px grid, 2px stroke, currentColor). Decorative unless a label is given. */
export type IconName =
  | 'ban'
  | 'pick'
  | 'decider'
  | 'trophy'
  | 'check'
  | 'you'
  | 'copy'
  | 'share'
  | 'skip'
  | 'dice'
  | 'pause'
  | 'play'
  | 'reset'
  | 'stats'
  | 'history'
  | 'lock'
  | 'mic'
  | 'warning'
  | 'chevron'
  | 'kill'
  | 'swap'
  | 'back'
  | 'flame'
  | 'snow'
  | 'globe'
  | 'menu'
  | 'close'
  | 'help'
  | 'cards'
  | 'search'
  | 'medal'
  | 'podium'
  | 'install'
  | 'calendar'
  | 'mask'
  | 'up'
  | 'down'
  | 'grid'
  | 'link'
  | 'target'
  | 'puzzle'
  | 'tilde'
  | 'volume'
  | 'volume-off'
  | 'rewind'
  | 'role-duelist'
  | 'role-initiator'
  | 'role-controller'
  | 'role-sentinel'
  | 'role-flex';

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
  pause: 'M8 5v14M16 5v14',
  play: 'M7 5l12 7-12 7z',
  reset: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4 4v4h4',
  stats: 'M5 20V11M12 20V4M19 20v-7',
  history: 'M12 7.5V12l3 2M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4 4v4h4',
  lock: 'M8 11V8a4 4 0 018 0v3M6 11h12v9H6z',
  mic: 'M12 3a3 3 0 013 3v5a3 3 0 01-6 0V6a3 3 0 013-3zM6 11a6 6 0 0012 0M12 17v4M9 21h6',
  warning: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  chevron: 'M9 6l6 6-6 6',
  kill: 'M4 12h14M13 7l5 5-5 5',
  swap: 'M7 8h12l-3-3M17 16H5l3 3',
  back: 'M15 6l-6 6 6 6',
  flame: 'M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.3 2.4-5.4 3.8-7.6.4 1.7 1.3 2.8 2.4 3.3C11.6 7.6 12.6 5 15 3c.2 3 1.4 4.6 2.6 6.3 1 1.5 1.9 3 1.9 5.4C19.5 18.4 16 21 12 21z',
  snow: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5',
  globe: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.4 3.8 5.4 3.8 9s-1.3 6.6-3.8 9c-2.5-2.4-3.8-5.4-3.8-9S9.5 5.4 12 3z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  help: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9.3a2.6 2.6 0 015 .9c0 1.7-2.5 2.3-2.5 3.8M12 17h.01',
  cards: 'M4 6.5l9-2.4 3.4 12.6-9 2.4zM14.5 5.2l4.6 1.3-3.3 12.3',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4',
  medal: 'M8 3l3 6.5M16 3l-3 6.5M12 21a5.5 5.5 0 100-11 5.5 5.5 0 000 11zM12 13.2v4.6',
  podium: 'M9 8h6v12H9zM3 13h6v7H3zM15 11h6v9h-6zM12 3l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z',
  install: 'M12 3v11M7.5 9.5L12 14l4.5-4.5M5 15v5h14v-5',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  mask: 'M3 8c3-1.5 6-1.5 9 0 3-1.5 6-1.5 9 0v3c0 3.5-3 5.5-5.5 5.5-1.6 0-2.6-1-3.5-2.5-.9 1.5-1.9 2.5-3.5 2.5C6 16.5 3 14.5 3 11zM7 11.5h2.5M14.5 11.5H17',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  grid: 'M4 4h16v16H4zM4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16',
  link: 'M10 14a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 00-6.4-6.4l-1.2 1.2M14 10a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 006.4 6.4l1.2-1.2',
  target: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8zM12 11.5v1',
  puzzle: 'M4 8h4a2 2 0 114 0h4v4a2 2 0 110 4v4H4v-4a2 2 0 100-4z',
  tilde: 'M5 13.5c1.5-2.5 3.5-3 5.5-1.5s4 1 5.5-1.5',
  volume: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11',
  'volume-off': 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5',
  rewind: 'M11 6l-7 6 7 6zM20 6l-7 6 7 6z',
  'role-duelist': 'M13 2L5 14h6l-1 8 8-12h-6z',
  'role-initiator': 'M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',
  'role-controller': 'M7 18h10a4 4 0 00.6-8A6 6 0 006.3 9 4.5 4.5 0 007 18z',
  'role-sentinel': 'M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6zM9 12l2 2 4-4',
  'role-flex': 'M7 8h12l-3-3M17 16H5l3 3',
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
