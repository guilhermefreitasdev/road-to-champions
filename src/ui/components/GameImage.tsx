import { useState, type CSSProperties } from 'react';
import { agentByName, mapByName } from '../../data/game';
import { agentMedia, mapMedia, mediaUrl } from '../../data/media';

/**
 * Agent icon over a text chip: the chip (first letters) is always there, so a slow or blocked image
 * still reads as an intentional token, and a loaded image simply covers it.
 * The icon is served locally (public/media/agents, from Liquipedia); the valorant-api.com URL is the fallback.
 */
export function AgentIcon({ name }: { name: string }) {
  const agent = agentByName(name);
  const local = agentMedia(agent?.name ?? name);
  const [src, setSrc] = useState<string | null>(() => (local ? mediaUrl(local.icon) : (agent?.displayIcon ?? null)));
  const label = agent?.displayName ?? name;
  const onError = () => setSrc((cur) => (local && agent && cur !== agent.displayIcon ? agent.displayIcon : null));
  return (
    <span className="agent-icon" role="img" aria-label={label} title={label}>
      <span className="agent-initials" aria-hidden="true">
        {label.slice(0, 3)}
      </span>
      {src && <img src={src} alt="" width={28} height={28} loading="lazy" decoding="async" onError={onError} />}
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
 * Map image in a fixed 16:9 box. Until the image loads (or when it can't), the box shows a tinted
 * placeholder with the map's in-game coordinates, which still looks like a map card.
 * Served locally (public/media/maps, from Liquipedia); the valorant-api.com splash is the fallback.
 */
export function MapSplash({ name }: { name: string }) {
  const map = mapByName(name);
  const local = mapMedia(map?.name ?? name);
  const [src, setSrc] = useState<string | null>(() => (local ? mediaUrl(local.image) : (map?.splash ?? null)));
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const onError = () => {
    if (local && map && src !== map.splash) setSrc(map.splash);
    else setState('failed');
  };
  return (
    <span className={`map-splash ${state}`} style={{ '--map-hue': mapHue(name) } as CSSProperties}>
      {map?.coordinates && (
        <span className="map-coords" aria-hidden="true">
          {map.coordinates}
        </span>
      )}
      {src && state !== 'failed' && (
        <img
          src={src}
          alt=""
          width={320}
          height={180}
          loading="lazy"
          decoding="async"
          onLoad={() => setState('loaded')}
          onError={onError}
        />
      )}
    </span>
  );
}

export function mapLabel(name: string): string {
  return mapByName(name)?.displayName ?? name;
}
