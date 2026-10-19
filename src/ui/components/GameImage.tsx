import { useState } from 'react';
import { agentByName, mapByName } from '../../data/game';

/** Agent icon; falls back to a text chip when the image can't load. */
export function AgentIcon({ name }: { name: string }) {
  const agent = agentByName(name);
  const [failed, setFailed] = useState(false);
  const label = agent?.displayName ?? name;
  if (!agent || failed) {
    return (
      <span className="agent-icon agent-fallback" role="img" aria-label={label} title={label}>
        {label.slice(0, 3)}
      </span>
    );
  }
  return (
    <img
      className="agent-icon"
      src={agent.displayIcon}
      alt={label}
      title={label}
      width={28}
      height={28}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/** Map splash with a fixed 16:9 box; the box keeps its placeholder background if the image fails. */
export function MapSplash({ name }: { name: string }) {
  const map = mapByName(name);
  const [failed, setFailed] = useState(false);
  return (
    <span className="map-splash">
      {map && !failed && (
        <img src={map.splash} alt={`Mapa ${map.displayName}`} loading="lazy" onError={() => setFailed(true)} />
      )}
    </span>
  );
}

export function mapLabel(name: string): string {
  return mapByName(name)?.displayName ?? name;
}
