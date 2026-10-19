import { useState } from 'react';
import { mediaUrl, teamMedia } from '../../data/media';

/**
 * Team logo for a team at a given event (the logo the team used at that time, when Liquipedia has it;
 * otherwise the team's current logo). The initials badge is always rendered underneath, so a missing or
 * blocked image still reads as an intentional token; a loaded image simply covers it.
 */
export function TeamLogo({ teamId, eventId, name, size = 24 }: { teamId: string; eventId?: string; name: string; size?: number }) {
  const media = teamMedia(teamId, eventId);
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <span
      className={`team-logo${media && !failed ? ' has-image' : ''}`}
      role="img"
      aria-label={name}
      title={media ? `${name} (logo: ${media.eraSpecific ? 'da época' : 'atual'}, ${media.source === 'liquipedia' ? 'Liquipedia' : media.source})` : name}
      style={{ width: size, height: size }}
    >
      <span className="team-logo-initials" aria-hidden="true">
        {initials}
      </span>
      {media && !failed && (
        <img src={mediaUrl(media.logo)} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      )}
    </span>
  );
}
