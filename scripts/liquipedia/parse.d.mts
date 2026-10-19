// Types for parse.mjs (pure Liquipedia wikitext parsers), so Vitest tests under src/ can import them.

export interface ParsedPlayer {
  id: string;
  link: string;
  flag: string | null;
  isSub: boolean;
  dnp: boolean;
  captain: boolean;
}

export interface ParsedStaff {
  name: string;
  link: string;
  flag: string | null;
  role: string;
}

export interface ParsedTeam {
  name: string;
  link: string;
  players: ParsedPlayer[];
  staff: ParsedStaff[];
  imported: boolean;
}

export interface ParsedTemplate {
  name: string;
  args: string[];
  params: Record<string, string>;
}

export type IglSource =
  | 'event-captain'
  | 'squad-captain'
  | 'infobox-unique'
  | 'event-ambiguous'
  | 'infobox-ambiguous'
  | 'conflict'
  | 'none';

export function stripComments(s: string): string;
export function findTemplates(text: string, name: string): string[];
export function parseTemplate(raw: string): ParsedTemplate;
export function cleanText(s: string | null | undefined): string;
export function countryToIso(name: string | null | undefined): string | null;
export function flagToIso(flag: string | null | undefined): string | null;
export function normRole(r: string | null | undefined): string;
export function pickCoach(staff: ParsedStaff[]): ParsedStaff | null;
export function parseTeamCard(raw: string): ParsedTeam;
export function parseOpponent(raw: string): ParsedTeam;
export function parseTeamParticipants(raw: string): ParsedTeam[];
export function parseParticipants(wikitext: string): {
  format: 'TeamCard' | 'TeamParticipants';
  teams: ParsedTeam[];
  withdrawn: string[];
  needsExpansion: boolean;
};
export function expansionSource(wikitext: string): string;
export function squadImportSource(wikitext: string, teamLinks: string[]): string;
export function titleKey(t: string | null | undefined): string;
export function parseExpandedParticipants(html: string): ParsedTeam[];
export function parsePlayerInfobox(wikitext: string): {
  id: string | null;
  country: string | null;
  flag: string | null;
  roles: string[];
  isIGL: boolean;
  vlrId: string | null;
  status: string | null;
} | null;
export function parseTeamInfobox(wikitext: string): { name: string | null; vlrId: string | null } | null;
export function parseLeagueInfobox(wikitext: string): {
  name: string | null;
  startDate: string | null;
  endDate: string | null;
  vlrId: string | null;
  teamNumber: number | null;
} | null;
export function resolveIgl(
  players: ParsedPlayer[],
  isIGLByLink: (link: string) => boolean | undefined,
  isSquadCaptain?: (link: string) => boolean | undefined,
): { igl: string | null; iglSource: IglSource; candidates: string[] };
