/**
 * History of finished runs (both modes) in localStorage: pure helpers to build, merge and validate entries, and a
 * thin storage layer that never throws. Entries are snapshots: they do not depend on the run format or the pool,
 * so RUN_VERSION / SEASON_VERSION bumps leave the history intact.
 */
import { DEFAULT_TEAM_NAME, MODE_LABELS, runSummary, type RunState } from '../game/run';
import { FIELD_MODE_LABELS, REGION_LABELS, STAGE_LABELS, seasonSummary, type SeasonState } from '../game/season';
import type { Difficulty } from '../game/difficulty';
import { difficultyOf, isDifficulty } from './difficulty';
import { runStats, seasonStats, type PlayerStatsRow } from './playerStats';

export const HISTORY_KEY = 'rtc:history:v1';
export const HISTORY_MAX = 30;

export type HistoryMode = 'classic' | 'ultimate' | 'trials';

export interface HistoryEntry {
  /** `run:<seed>` or `season:<seed>`: a finished run is recorded once. */
  id: string;
  /** ISO date-time the run finished. */
  date: string;
  mode: HistoryMode;
  /** "Draft clássico", "Complete Trials · Americas · campo Atual". */
  modeLabel: string;
  teamName: string;
  /** "Campeão", "Vice-campeão", "Eliminado no Grupo A (1-2)", "11º–12º na Liga Americas"… */
  result: string;
  /** "1º", "5º–6º"… ('—' when unknown). */
  place: string;
  champion: boolean;
  /** "Grupos 2-1 · Playoffs 1-1" or "Liga 4-1 · Masters 2-2". */
  record: string;
  mapsWon: number;
  mapsLost: number;
  strength: number;
  /** Absent in entries recorded before difficulties existed (those played as Normal). */
  difficulty?: Difficulty;
  players: PlayerStatsRow[];
}

/** Snapshot of a finished main-mode run. */
export function runEntry(run: RunState, date: Date): HistoryEntry {
  const s = runSummary(run);
  const g = s.record.groups;
  const playoffs = s.record.playoffs.wins + s.record.playoffs.losses > 0 ? ` · Playoffs ${s.record.playoffs.wins}-${s.record.playoffs.losses}` : '';
  return {
    id: `run:${run.seed}`,
    date: date.toISOString(),
    mode: run.mode,
    modeLabel: MODE_LABELS[run.mode],
    teamName: s.teamName,
    result: s.finish?.label ?? 'Encerrado',
    place: s.finish?.place ?? '—',
    champion: !!s.finish?.champion,
    record: `Grupos ${g.wins}-${g.losses}${playoffs}`,
    mapsWon: s.record.mapsWon,
    mapsLost: s.record.mapsLost,
    strength: s.strength,
    difficulty: difficultyOf(run),
    players: runStats(run),
  };
}

/** Snapshot of a finished Complete Trials season. */
export function seasonEntry(season: SeasonState, date: Date): HistoryEntry {
  const s = seasonSummary(season);
  const last = s.outcomes[s.outcomes.length - 1];
  const result = s.champion
    ? 'Campeão'
    : season.eliminatedAt === 'league'
      ? `${last?.place ?? '—'} na Liga ${REGION_LABELS[s.region]}`
      : last?.rank === 2
        ? `Vice-campeão do ${STAGE_LABELS[s.reached]}`
        : `${last?.place ?? '—'} no ${STAGE_LABELS[s.reached]}`;
  return {
    id: `season:${season.seed}`,
    date: date.toISOString(),
    mode: 'trials',
    modeLabel: `Complete Trials · ${REGION_LABELS[s.region]} · campo ${FIELD_MODE_LABELS[s.field]}`,
    teamName: s.teamName || DEFAULT_TEAM_NAME,
    result,
    place: last?.place ?? '—',
    champion: s.champion,
    record: s.outcomes.map((o) => `${STAGE_LABELS[o.stage]} ${o.wins}-${o.losses}`).join(' · '),
    mapsWon: s.mapsWon,
    mapsLost: s.mapsLost,
    strength: s.strength,
    difficulty: difficultyOf(season),
    players: seasonStats(season),
  };
}

/** Newest first; an entry with the same id replaces the old one; at most HISTORY_MAX entries. */
export function addEntry(list: readonly HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [entry, ...list.filter((e) => e.id !== entry.id)].slice(0, HISTORY_MAX);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const MODES: readonly HistoryMode[] = ['classic', 'ultimate', 'trials'];

function isAgent(a: unknown): boolean {
  return isObj(a) && isStr(a.agent) && isNum(a.maps) && isNum(a.kills) && isNum(a.deaths) && isNum(a.rating);
}

const PLAYER_NUMS = ['maps', 'rounds', 'kills', 'deaths', 'assists', 'kd', 'acs', 'rating', 'kast', 'fk', 'fd', 'k3', 'k4', 'aces', 'mvps'] as const;

function isPlayer(p: unknown): p is PlayerStatsRow {
  return isObj(p) && isStr(p.cardId) && isStr(p.handle) && PLAYER_NUMS.every((k) => isNum(p[k])) && (p.ovr === undefined || isNum(p.ovr)) && Array.isArray(p.agents) && p.agents.every(isAgent);
}

function isEntry(e: unknown): e is HistoryEntry {
  return (
    isObj(e) &&
    isStr(e.id) &&
    isStr(e.date) &&
    MODES.includes(e.mode as HistoryMode) &&
    isStr(e.modeLabel) &&
    isStr(e.teamName) &&
    isStr(e.result) &&
    isStr(e.place) &&
    typeof e.champion === 'boolean' &&
    isStr(e.record) &&
    isNum(e.mapsWon) &&
    isNum(e.mapsLost) &&
    isNum(e.strength) &&
    Array.isArray(e.players) &&
    e.players.every(isPlayer)
  );
}

/** An unknown difficulty (a newer or corrupted entry) is dropped from the entry, not the entry itself. */
function cleanEntry(e: HistoryEntry): HistoryEntry {
  if (e.difficulty === undefined || isDifficulty(e.difficulty)) return e;
  const { difficulty: _drop, ...rest } = e;
  return rest;
}

/** Valid entries of a stored value (anything malformed is dropped, never thrown). */
export function parseHistory(data: unknown): HistoryEntry[] {
  if (!Array.isArray(data)) return [];
  return data.filter(isEntry).map(cleanEntry).slice(0, HISTORY_MAX);
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    return raw ? parseHistory(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function saveHistory(list: readonly HistoryEntry[]): void {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    // Storage full or blocked: the history just won't survive a reload.
  }
}

/** Adds a finished run to the stored history; returns the new list. */
export function recordEntry(entry: HistoryEntry): HistoryEntry[] {
  const next = addEntry(loadHistory(), entry);
  saveHistory(next);
  return next;
}

export function clearHistory(): void {
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    // Ignore: nothing to clear.
  }
}
