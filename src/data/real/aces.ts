/**
 * Real aces (5Ks) for the "Acerte o ace" mode: aces.json, written by scripts/aces/build.mjs (see docs/aces.md).
 * Every fact comes from VLR.gg match pages (Performance tab: the 5K, its round, the victims and the agent; overview:
 * map, teams, event, side and score before the round). Curated rows add a YouTube video (embedded only after the
 * player's click, credited in the reveal), a pt-BR description and, when a cited source names it, the weapon. Here
 * each row is resolved to the pool's team ids (same resolver as the cards and the series, ./regions.ts).
 */
import type { VlrEventData } from './cards';
import { teamIdResolver } from './regions';
import acesJson from './aces.json';
import slimJson from './vlr/slim.json';

export type AceSide = 'atk' | 'def';

/** How a field was checked (docs/aces.md, "Verificação"). */
export type AceCheck = 'vlr-performance' | 'vlr-overview' | 'vlr-rounds' | 'youtube-oembed' | 'web-search' | (string & {});

export interface RawAceTeam {
  vlrId: number | null;
  slug: string | null;
  name: string | null;
  tag?: string | null;
}

export interface AceVideo {
  /** https://www.youtube.com/watch?v=<11 chars>: the original video, linked in the reveal (never downloaded). */
  url: string;
  /** The 11-character YouTube id, for the click-to-load youtube-nocookie embed. */
  videoId: string;
  title: string;
  /** Channel name and URL when the check saw them (oEmbed always does; a web search may not). */
  channel: string | null;
  channelUrl: string | null;
  /** Seconds into the video where the ace starts / ends, only when a cited source states them (embed start/end). */
  start: number | null;
  end: number | null;
  /** Embedding allowed, per YouTube's oEmbed (it refuses non-embeddable videos); null = not checked yet. */
  embeddable: boolean | null;
  /** The title names the player (handle or alias): the Daily prefers clips where it does not. */
  titleRevealsPlayer: boolean;
  /** How the link was tied to its title: YouTube oEmbed, or a web search index result (docs/aces.md). */
  check: 'youtube-oembed' | 'web-search';
  checkedAt: string;
}

/** One row of aces.json. */
export interface RawAce {
  id: string;
  video: boolean;
  vlrPlayerId: number;
  /** Pool player id (String(vlrPlayerId)) when the player is in src/data/real/vlr; null otherwise. */
  playerId: string | null;
  handle: string;
  /** Other names the answer accepts (e.g. "Forsaken" for f0rsakeN); also used by titleRevealsPlayer. */
  aliases: string[];
  team: RawAceTeam;
  opponent: RawAceTeam;
  event: { vlrId: number | null; eventId: string | null; name: string | null; tier: string | null; year: number | null };
  stage: string | null;
  seriesRound: string | null;
  date: string | null;
  match: { vlrId: number; url: string; bestOf: number | null; mapNumber: number; gameId: number };
  map: string | null;
  round: number;
  side: AceSide | null;
  /** Score before the round, the ace's team first. */
  scoreBefore: [number, number] | null;
  roundWon: boolean | null;
  /** A clutch the player won in that round, as VLR's Performance tab lists it ('1v1' … '1v5'); null when none. */
  clutch: string | null;
  /** Final map score, the ace's team first. */
  mapScore: [number, number] | null;
  agent: string | null;
  victims: { handle: string | null; agent: string | null }[];
  /** Only when a cited source names it (verified.weapon holds that source). */
  weapon: string | null;
  /** pt-BR, factual, written by the curator (docs/aces.md). Reveal only: it names the player. */
  description: string;
  youtube: AceVideo | null;
  sources: string[];
  verified: Record<string, AceCheck | null | undefined>;
}

export interface AceTeam {
  vlrId: number | null;
  /** Pool team id (as Card.teamId), for logos; null when VLR gave no slug. */
  teamId: string | null;
  name: string;
  tag: string | null;
}

export interface Ace extends Omit<RawAce, 'team' | 'opponent'> {
  team: AceTeam;
  opponent: AceTeam;
}

/** Resolves raw rows (pure; rows without a handle, map or team names are dropped). */
export function buildAces(rows: readonly RawAce[], events: readonly VlrEventData[]): Ace[] {
  const resolve = teamIdResolver(events);
  const team = (t: RawAceTeam): AceTeam | null =>
    t.name
      ? {
          vlrId: t.vlrId,
          teamId: t.slug && t.vlrId !== null ? resolve({ id: t.vlrId, slug: t.slug }) : null,
          name: t.name,
          tag: t.tag ?? null,
        }
      : null;
  const out: Ace[] = [];
  for (const r of rows) {
    const a = team(r.team);
    const b = team(r.opponent);
    if (!a || !b || !r.handle || !r.map) continue;
    out.push({ ...r, team: a, opponent: b });
  }
  return out;
}

export interface AcesSource {
  sites: string[];
  credit: string;
  matches: number;
  entries: number;
  withVideo: number;
}

const data = acesJson as unknown as { source: AcesSource; aces: RawAce[] };

export const ACES_SOURCE: AcesSource = data.source;
export const RAW_ACES: readonly RawAce[] = data.aces;
/** Every ace of the snapshot, oldest first. */
export const ACES: readonly Ace[] = buildAces(data.aces, slimJson as VlrEventData[]);
