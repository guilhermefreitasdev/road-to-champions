/**
 * Team logo for a team at a given event (the logo the team used at that time, when known).
 * Shared contract: the media pipeline fills in the image source; until then (or when the image is missing
 * or fails to load) it renders the team's initials as an intentional badge.
 */
export function TeamLogo({ name, size = 24 }: { teamId: string; eventId?: string; name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <span className="team-logo" role="img" aria-label={name} title={name} style={{ width: size, height: size }}>
      <span className="team-logo-initials" aria-hidden="true">
        {initials}
      </span>
    </span>
  );
}
