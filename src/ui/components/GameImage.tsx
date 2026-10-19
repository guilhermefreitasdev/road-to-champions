import { useState, type CSSProperties } from 'react';
import { agentByName, mapByName } from '../../data/game';

/**
 * Agent icon over a text chip: the chip (first letters) is always there, so a slow or blocked image
 * still reads as an intentional token, and a loaded image simply covers it.
 */
export function AgentIcon({ name }: { name: string }) {
  const agent = agentByName(name);
  const [failed, setFailed] = useState(false);
  const label = agent?.displayName ?? name;
  return (
    <span className="agent-icon" role="img" aria-label={label} title={label}>
      <span className="agent-initials" aria-hidden="true">
        {label.slice(0, 3)}
      </span>
      {agent && !failed && (
        <img src={agent.displayIcon} alt="" width={28} height={28} loading="lazy" onError={() => setFailed(true)} />
      )}
    </span>
  );
}

/** Stable hue per map name, so each placeholder tile is distinct without the splash art. Display only. */
function mapHue(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/**
 * Map splash in a fixed 16:9 box. Until the image loads (or when it can't), the box shows a tinted
 * placeholder with the map's in-game coordinates, which still looks like a map card.
 */
export function MapSplash({ name }: { name: string }) {
  const map = mapByName(name);
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  return (
    <span className={`map-splash ${state}`} style={{ '--map-hue': mapHue(name) } as CSSProperties}>
      {map?.coordinates && (
        <span className="map-coords" aria-hidden="true">
          {map.coordinates}
        </span>
      )}
      {map && state !== 'failed' && (
        <img
          src={map.splash}
          alt=""
          width={320}
          height={180}
          loading="lazy"
          onLoad={() => setState('loaded')}
          onError={() => setState('failed')}
        />
      )}
    </span>
  );
}

export function mapLabel(name: string): string {
  return mapByName(name)?.displayName ?? name;
}
