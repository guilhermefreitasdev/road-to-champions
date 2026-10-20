/**
 * What a wrong guess tells (video-first "Acerte o ace"): the guessed pro compared with the answer on facts the video
 * does not show (country, region, main role, debut year in the data, and whether the guessed pro was on the ace's
 * team at that event). Pure: the facts come from a lookup passed in (the Daily's player index over the real pool in
 * ./index.ts, small fixtures in tests); nothing is inferred beyond those fields.
 */
import type { Region, Role } from '../../engine/types';
import type { Ace } from '../../data/real/aces';

export interface PlayerFacts {
  playerId: string;
  handle: string;
  /** ISO code ('' when the data has none). */
  country: string;
  region: Region | undefined;
  role: Role;
  /** Year of the player's first card in the data (VCT 2021+). */
  firstYear: number;
  /** Teams (pool team ids) the player was listed on, per event id. */
  teamsAt(eventId: string): readonly string[];
}

export type FactsLookup = (playerId: string) => PlayerFacts | undefined;

/** 'same' / 'diff' / 'unknown' (one side lacks the fact). */
export type Match3 = 'same' | 'diff' | 'unknown';
/** Answer's debut compared with the guess's: 'earlier' = the answer debuted before the guessed pro. */
export type DebutCmp = 'same' | 'earlier' | 'later' | 'unknown';

export interface Comparison {
  country: Match3;
  region: Match3;
  role: Match3;
  debut: DebutCmp;
  /** The guessed pro was on the ace's team at the ace's event (null when the event or team is not in the pool). */
  teammate: boolean | null;
}

const cmp = <T>(a: T | undefined | '', b: T | undefined | ''): Match3 => (!a || !b ? 'unknown' : a === b ? 'same' : 'diff');

export function compareGuess(ace: Ace, guess: PlayerFacts | undefined, answer: PlayerFacts | undefined): Comparison {
  const eventId = ace.event.eventId;
  const teamId = ace.team.teamId;
  return {
    country: cmp(guess?.country, answer?.country),
    region: cmp(guess?.region, answer?.region),
    role: cmp(guess?.role, answer?.role),
    debut:
      !guess || !answer
        ? 'unknown'
        : answer.firstYear === guess.firstYear
          ? 'same'
          : answer.firstYear < guess.firstYear
            ? 'earlier'
            : 'later',
    teammate: guess && eventId && teamId ? guess.teamsAt(eventId).includes(teamId) : null,
  };
}
