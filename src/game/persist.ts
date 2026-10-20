/**
 * Save packing for localStorage, lossless. The user's full series (kept for the replay) are ~90% kill events, each
 * naming three card ids: they become indices into the map's ten players. Player lines become arrays, and every card
 * id (series and box scores) an index into one table of the save. A full season goes from ~1.4 MB to < 400 KB.
 * `serializeRun` / `deserializeRun` (and the season pair) are what storage.ts should call; `deserialize*` also
 * accepts an unpacked save and always validates with parseRun / parseSeason.
 */
import type { KillEvent, MapResult, PlayerLine, RoundResult } from '../engine/match';
import type { CompactSeries } from './boxscore';
import type { SeriesResult } from '../engine/series';
import { parseRun, type RunState } from './run';
import { parseSeason, type SeasonState } from './season';

/** A round as [winner, side of team A (0 attack, 1 defense), then killer, victim, assister (−1 = none) per kill]. */
type PackedRound = number[];

/** A PlayerLine as an array, in LINE_KEYS order (multikills as [2K, 3K, 4K, 5K]; absent optionals as null). */
type PackedLine = unknown[];
const LINE_KEYS = ['cardId', 'handle', 'kills', 'deaths', 'assists', 'firstKills', 'firstDeaths', 'acs', 'kast', 'rating', 'multikills', 'form', 'mvp', 'agent', 'agentEdge'] as const;

interface PackedMap extends Omit<MapResult, 'rounds' | 'players'> {
  /** Card ids (table indices) of side 0 then side 1, the index base of the kills. */
  ids: number[];
  /** Rounds in order (round n is at index n − 1). */
  packed: PackedRound[];
  lines: [PackedLine[], PackedLine[]];
}

interface PackedSeries extends Omit<SeriesResult, 'maps'> {
  maps: PackedMap[];
}

/** Card id ↔ index table of one save. */
class Table {
  readonly list: string[] = [];
  private readonly at = new Map<string, number>();
  id(s: string): number {
    let i = this.at.get(s);
    if (i === undefined) {
      i = this.list.length;
      this.list.push(s);
      this.at.set(s, i);
    }
    return i;
  }
}

function packLine(l: PlayerLine, t: Table): PackedLine {
  return LINE_KEYS.map((k) => {
    if (k === 'cardId') return t.id(l.cardId);
    if (k === 'multikills') return [l.multikills.k2, l.multikills.k3, l.multikills.k4, l.multikills.k5];
    return l[k] ?? null;
  });
}

function unpackLine(p: PackedLine, cards: readonly string[]): PlayerLine {
  const out: Record<string, unknown> = {};
  LINE_KEYS.forEach((k, i) => {
    const v = p[i];
    if (k === 'cardId') out[k] = cards[v as number];
    else if (k === 'multikills') {
      const [k2, k3, k4, k5] = v as number[];
      out[k] = { k2, k3, k4, k5 };
    } else if (v !== null && v !== undefined) out[k] = v;
  });
  return out as unknown as PlayerLine;
}

function packMap(m: MapResult, t: Table): PackedMap {
  const { rounds, players, ...rest } = m;
  const ids = [...players[0], ...players[1]].map((p) => p.cardId);
  const at = new Map(ids.map((id, i) => [id, i]));
  const index = (id: string): number => {
    const i = at.get(id);
    if (i === undefined) throw new Error(`Kill by unknown card "${id}"`);
    return i;
  };
  const packed = rounds.map((r, i): PackedRound => {
    if (r.number !== i + 1) throw new Error('Rounds must be numbered from 1');
    const out = [r.winner, r.teamASide === 'attack' ? 0 : 1];
    for (const k of r.kills) out.push(index(k.killer), index(k.victim), k.assister === undefined ? -1 : index(k.assister));
    return out;
  });
  return { ...rest, ids: ids.map((id) => t.id(id)), packed, lines: [players[0].map((l) => packLine(l, t)), players[1].map((l) => packLine(l, t))] };
}

function unpackMap(p: PackedMap, cards: readonly string[]): MapResult {
  const { ids: idx, packed, lines, ...rest } = p;
  const ids = idx.map((i) => cards[i]!);
  const rounds = packed.map((r, i): RoundResult => {
    const kills: KillEvent[] = [];
    for (let j = 2; j + 2 < r.length; j += 3) {
      const kill: KillEvent = { killer: ids[r[j]!]!, victim: ids[r[j + 1]!]! };
      if (r[j + 2]! >= 0) kill.assister = ids[r[j + 2]!]!;
      kills.push(kill);
    }
    return { number: i + 1, winner: r[0] === 0 ? 0 : 1, teamASide: r[1] === 0 ? 'attack' : 'defense', kills };
  });
  const players: MapResult['players'] = [lines[0].map((l) => unpackLine(l, cards)), lines[1].map((l) => unpackLine(l, cards))];
  return { ...rest, rounds, players } as MapResult;
}

const mapValues = <T, U>(rec: Record<string, T>, f: (x: T) => U): Record<string, U> =>
  Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, f(v)]));

/** Marker of a packed save; its value is the card id table. */
const PACKED = 'packedCards';

type BoxIds = [number[], number[]];

function pack<S extends { userSeries: Record<string, SeriesResult>; boxScores: Record<string, CompactSeries> }>(state: S): string {
  const t = new Table();
  const userSeries = mapValues(state.userSeries, (s): PackedSeries => ({ ...s, maps: s.maps.map((m) => packMap(m, t)) }));
  const boxScores = mapValues(state.boxScores, (b) => ({ ...b, ids: [b.ids[0].map((id) => t.id(id)), b.ids[1].map((id) => t.id(id))] as BoxIds }));
  return JSON.stringify({ ...state, userSeries, boxScores, [PACKED]: t.list });
}

function unpack(text: string): unknown {
  const data = JSON.parse(text) as Record<string, unknown> | null;
  if (!data || typeof data !== 'object' || !Array.isArray(data[PACKED])) return data;
  const { [PACKED]: table, ...rest } = data;
  const cards = table as string[];
  const out: Record<string, unknown> = { ...rest };
  const series = rest.userSeries as Record<string, PackedSeries> | undefined;
  if (series && typeof series === 'object') out.userSeries = mapValues(series, (s) => ({ ...s, maps: s.maps.map((m) => unpackMap(m, cards)) }));
  const boxes = rest.boxScores as Record<string, Omit<CompactSeries, 'ids'> & { ids: BoxIds }> | undefined;
  if (boxes && typeof boxes === 'object') out.boxScores = mapValues(boxes, (b) => ({ ...b, ids: [b.ids[0].map((i) => cards[i]!), b.ids[1].map((i) => cards[i]!)] }));
  return out;
}

export function serializeRun(run: RunState): string {
  return pack(run);
}

/** The saved run, or null when the text is not a usable save (corrupted, outdated, unpackable). */
export function deserializeRun(text: string): RunState | null {
  try {
    return parseRun(unpack(text));
  } catch {
    return null;
  }
}

export function serializeSeason(s: SeasonState): string {
  return pack(s);
}

export function deserializeSeason(text: string): SeasonState | null {
  try {
    return parseSeason(unpack(text));
  } catch {
    return null;
  }
}
