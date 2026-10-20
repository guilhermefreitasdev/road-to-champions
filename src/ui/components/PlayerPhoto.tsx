import { useState } from 'react';
import { mediaUrl, playerMedia } from '../../data/media';

/**
 * Player photo in a fixed square (taken at the event when Liquipedia has one, else the current photo).
 * Without a photo, or while it fails to load, the box shows the handle's initials and the flag instead.
 */
export function PlayerPhoto({
  playerId,
  eventId,
  handle,
  country,
  size = 48,
}: {
  playerId: string;
  eventId?: string;
  handle: string;
  country?: string;
  size?: number;
}) {
  const media = playerMedia(playerId, eventId);
  const [failed, setFailed] = useState(false);
  const show = media && !failed;
  return (
    <span
      className={`player-photo${show ? ' has-image' : ''}`}
      role="img"
      aria-label={media ? `${handle} (foto: ${media.eraSpecific ? 'no evento' : 'atual'}, Liquipedia)` : handle}
      title={media ? `Foto: Liquipedia (${media.eraSpecific ? 'neste evento' : 'atual'})` : undefined}
      style={{ width: size, height: size }}
    >
      <span className="player-photo-fallback" aria-hidden="true">
        <span>{handle.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase()}</span>
        {country && <span className="player-photo-flag">{country}</span>}
      </span>
      {show && (
        <img src={mediaUrl(media.photo)} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      )}
    </span>
  );
}
