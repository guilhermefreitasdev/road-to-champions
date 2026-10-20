/**
 * "Valdle — Cena pro": the facts of each pro over the real pool (the Diário's index, ../daily/data.ts) and the four
 * games over them (Pro Clássico, Grade 3x3, Conexões, Comp Misteriosa). Pure: built from the data passed in.
 * Nothing is invented: every fact is a field of the pool (cards, VLR memberships, series, comps); "na base" means
 * the events of our data (internationals since 2021, regional leagues since 2023).
 */
import type { Region, Role } from '../../engine/types';
import type { SeriesResult } from '../../data/real/series';
import type { MapComps } from '../../data/real/comps';
import { placementRank, type DailyData } from '../daily/data';
import { seriesMemorability } from '../daily/generate';
import { exact, exactOr, numeric, type Column } from './feedback';
import { pickBand, shuffle, type Maker } from './planner';
import type { Rng } from '../../engine/rng';

// --- Facts -----------------------------------------------------------------------------------------------------------

export interface ProFacts {
  id: string;
  handle: string;
  norm: string;
  country: string;
  region: Region | null;
  role: Role;
  /** Every role the player has genuinely played (card flex roles + the main role). */
  roles: ReadonlySet<Role>;
  /** Team of the most recent card. */
  lastTeam: string;
  lastTeamId: string;
  lastTeamName: string;
  /** Event of the most recent card (photo). */
  lastEventId: string;
  /** Team families played for (main player at an event, or a card). */
  teams: ReadonlySet<string>;
  /** Events played as a main player. */
  events: ReadonlySet<string>;
  /** Events won (a card on the 1st-place roster). */
  wins: ReadonlySet<string>;
  intlFirstYear: number | null;
  intlEvents: number;
  intlTitles: number;
  /** Most played agent over the career (VLR map scoreboards), with at least MIN_AGENT_MAPS maps. */
  topAgent: string | null;
  fame: number;
}

export interface TeamFamily {
  /** Smallest team id of the family (team ids sharing a name across the snapshot). */
  key: string;
  name: string;
  ids: ReadonlySet<string>;
  region: Region | null;
  fame: number;
}

export interface ProIndex {
  data: DailyData;
  facts: ReadonlyMap<string, ProFacts>;
  /** Players whose handle is unique (answers and generated groups use only these). */
  usable: readonly ProFacts[];
  families: ReadonlyMap<string, TeamFamily>;
  familyOf(teamId: string): string;
  /** Agent → its role (valorant-api.com), for the Pro Clássico's partial hit. */
  agentRole(agent: string): Role | null;
}

export const MIN_AGENT_MAPS = 10;

export function buildProIndex(data: DailyData, agentRoles: Readonly<Record<string, Role>>, series: readonly SeriesResult[]): ProIndex {
  const familyKey = new Map<string, string>();
  const familyOf = (teamId: string): string => {
    let k = familyKey.get(teamId);
    if (!k) {
      k = [...data.teamFamily(teamId)].sort()[0] ?? teamId;
      familyKey.set(teamId, k);
    }
    return k;
  };
  const families = new Map<string, { key: string; ids: Set<string>; name: string; region: Region | null; fame: number; nameFame: number }>();
  const addTeam = (teamId: string) => {
    const key = familyOf(teamId);
    const fam = families.get(key) ?? { key, ids: new Set<string>(), name: data.teamName(teamId), region: null, fame: 0, nameFame: -1 };
    fam.ids.add(teamId);
    const t = data.teams.get(teamId);
    if (t) {
      fam.fame += t.fame;
      if (t.fame > fam.nameFame) {
        fam.nameFame = t.fame;
        fam.name = t.name;
        fam.region = t.region ?? fam.region;
      }
    }
    families.set(key, fam);
  };
  for (const t of data.teams.keys()) addTeam(t);
  for (const s of series) for (const t of s.teams) addTeam(t.teamId);

  const facts = new Map<string, ProFacts>();
  for (const p of data.playerList) {
    const teams = new Set<string>();
    const events = new Set<string>();
    for (const m of data.byPlayer.get(p.playerId) ?? []) {
      if (!m.main) continue;
      teams.add(familyOf(m.teamId));
      events.add(m.eventId);
    }
    const wins = new Set<string>();
    const roles = new Set<Role>([p.role]);
    let intlFirstYear: number | null = null;
    for (const { card, entry } of p.cards) {
      teams.add(familyOf(entry.teamId));
      events.add(entry.eventId);
      if (placementRank(entry.placement) === 1) wins.add(entry.eventId);
      for (const r of card.flexRoles ?? []) roles.add(r);
      if ((entry.tier ?? 'international') === 'international') intlFirstYear = Math.min(intlFirstYear ?? 9999, entry.year);
    }
    const last = p.cards[p.cards.length - 1]!;
    const top = data.topAgents(p.playerId, 1)[0];
    facts.set(p.playerId, {
      id: p.playerId,
      handle: p.handle,
      norm: p.norm,
      country: p.country,
      region: p.region ?? null,
      role: p.role,
      roles,
      lastTeam: familyOf(last.entry.teamId),
      lastTeamId: last.entry.teamId,
      lastTeamName: last.entry.teamName,
      lastEventId: last.entry.eventId,
      teams,
      events,
      wins,
      intlFirstYear,
      intlEvents: p.intlEvents,
      intlTitles: p.intlTitles,
      topAgent: top && top.maps >= MIN_AGENT_MAPS ? top.agent : null,
      fame: p.fame,
    });
  }
  const usable = [...facts.values()].filter((f) => !data.dupNorms.has(f.norm)).sort((a, b) => b.fame - a.fame || a.id.localeCompare(b.id));
  return {
    data,
    facts,
    usable,
    families: new Map([...families].map(([k, f]) => [k, { key: f.key, name: f.name, ids: f.ids, region: f.region, fame: f.fame }])),
    familyOf,
    agentRole: (agent) => agentRoles[agent] ?? null,
  };
}

// --- Criteria (Grade 3x3, Conexões) ------------------------------------------------------------------------------------

export type Criterion =
  | { kind: 'team'; team: string }
  | { kind: 'country'; country: string }
  | { kind: 'role'; role: Role }
  | { kind: 'event'; event: string }
  | { kind: 'won'; event: string }
  | { kind: 'title' }
  | { kind: 'agent'; agent: string };

export function criterionKey(c: Criterion): string {
  switch (c.kind) {
    case 'team':
      return `team:${c.team}`;
    case 'country':
      return `country:${c.country}`;
    case 'role':
      return `role:${c.role}`;
    case 'event':
      return `event:${c.event}`;
    case 'won':
      return `won:${c.event}`;
    case 'title':
      return 'title';
    case 'agent':
      return `agent:${c.agent}`;
  }
}

export function matches(f: ProFacts, c: Criterion): boolean {
  switch (c.kind) {
    case 'team':
      return f.teams.has(c.team);
    case 'country':
      return f.country === c.country;
    case 'role':
      return f.role === c.role;
    case 'event':
      return f.events.has(c.event);
    case 'won':
      return f.wins.has(c.event);
    case 'title':
      return f.intlTitles > 0;
    case 'agent':
      return f.topAgent === c.agent;
  }
}

// --- Pro Clássico ----------------------------------------------------------------------------------------------------

export function proColumns(index: Pick<ProIndex, 'agentRole'>): Column<ProFacts>[] {
  return [
    { key: 'team', label: 'Último time', compare: (g, a) => exactOr(g.lastTeam, a.lastTeam, (gt) => a.teams.has(gt)) },
    { key: 'country', label: 'País', compare: (g, a) => exact(g.country || null, a.country || null) },
    { key: 'region', label: 'Região', compare: (g, a) => exact(g.region, a.region) },
    { key: 'role', label: 'Função', compare: (g, a) => exactOr(g.role, a.role, (gr) => a.roles.has(gr)) },
    { key: 'debut', label: 'Estreia int.', compare: (g, a) => numeric(g.intlFirstYear, a.intlFirstYear, 1) },
    { key: 'titles', label: 'Títulos int.', compare: (g, a) => numeric(g.intlTitles, a.intlTitles) },
    { key: 'events', label: 'Eventos int.', compare: (g, a) => numeric(g.intlEvents, a.intlEvents, 1) },
    {
      key: 'agent',
      label: 'Agente nº 1',
      compare: (g, a) => exactOr(g.topAgent, a.topAgent, (ga, aa) => index.agentRole(ga) !== null && index.agentRole(ga) === index.agentRole(aa)),
    },
  ];
}

export interface ProPuzzle {
  answer: string;
}

// --- Grade 3x3 -------------------------------------------------------------------------------------------------------

export interface GradePuzzle {
  rows: Criterion[];
  cols: Criterion[];
  /** Valid answers of each cell (row-major), every one with at least GRADE_MIN_ANSWERS. */
  answers: string[][];
}

export const GRADE_MIN_ANSWERS = 2;

// --- Conexões --------------------------------------------------------------------------------------------------------

export interface ConexoesGroup {
  criterion: Criterion;
  players: string[];
}

export interface ConexoesPuzzle {
  groups: ConexoesGroup[];
  /** The 16 players in display order. */
  order: string[];
}

/** Kinds a Conexões group can hide (and the kinds the uniqueness check covers). */
export const CONEXOES_KINDS = ['team', 'country', 'won', 'agent'] as const;

/**
 * Ways to split `players` into groups of four that each share a fact of `criteria` (counted up to `limit`). The
 * puzzle is accepted only when this is 1: no other split works with the kinds of facts the game uses.
 */
export function countPartitions(players: readonly string[], sets: readonly (readonly string[])[], limit = 2): number {
  const unique = new Map<string, readonly string[]>();
  for (const s of sets) for (const four of combinations(s, 4)) unique.set([...four].sort().join(','), four);
  const quads = [...unique.values()];
  const byPlayer = new Map<string, (readonly string[])[]>();
  for (const q of quads) for (const p of q) byPlayer.set(p, [...(byPlayer.get(p) ?? []), q]);
  let count = 0;
  const used = new Set<string>();
  const solve = (): void => {
    if (count >= limit) return;
    const next = players.find((p) => !used.has(p));
    if (next === undefined) {
      count++;
      return;
    }
    for (const q of byPlayer.get(next) ?? []) {
      if (q.some((p) => used.has(p))) continue;
      for (const p of q) used.add(p);
      solve();
      for (const p of q) used.delete(p);
    }
  };
  solve();
  return count;
}

function combinations<T>(xs: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const pick = (start: number, acc: T[]) => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i <= xs.length - (k - acc.length); i++) pick(i + 1, [...acc, xs[i]!]);
  };
  pick(0, []);
  return out;
}

// --- Comp Misteriosa -------------------------------------------------------------------------------------------------

export interface CompPuzzle {
  seriesId: number;
  mapIndex: number;
  map: string;
  /** The team's five agents. */
  agents: string[];
  opponentAgents: string[];
  eventId: string;
  eventName: string;
  tier: string;
  year: number;
  stage: string | null;
  round: string | null;
  /** Rounds on the map: the team's, then the opponent's. */
  score: [number, number];
  team: { key: string; teamId: string; name: string; region: Region | null };
  opponent: { key: string; teamId: string; name: string };
}

/** What a wrong team guess tells: same region as the answer, and whether it played that event. */
export function compGuessHints(index: ProIndex, puzzle: CompPuzzle, familyKey: string): { sameRegion: boolean | null; atEvent: boolean } {
  const fam = index.families.get(familyKey);
  const atEvent = index.data.memberships.some((m) => m.eventId === puzzle.eventId && fam?.ids.has(m.teamId));
  const sameRegion = fam?.region && puzzle.team.region ? fam.region === puzzle.team.region : null;
  return { sameRegion, atEvent };
}

// --- Makers ----------------------------------------------------------------------------------------------------------

export const PRO_GAPS = { pro: 180, gradeTeam: 6, grade: 365, conexoes: 365, conexoesTeam: 5, compSeries: 365, compTeam: 7 } as const;

function weightedTake<T>(rng: Rng, xs: readonly T[], n: number, weight: (t: T) => number): T[] {
  const pool = [...xs];
  const out: T[] = [];
  while (out.length < n && pool.length) {
    const i = rng.weightedIndex(pool.map(weight));
    out.push(pool.splice(i, 1)[0]!);
  }
  return out;
}

export function proMakers(index: ProIndex, series: readonly SeriesResult[], comps: ReadonlyMap<number, readonly (MapComps | null)[]>) {
  const { data } = index;
  const facts = [...index.facts.values()];
  const satisfying = (c: Criterion) => facts.filter((f) => matches(f, c));

  // Pro Clássico: famous players with an international career and every column known.
  const proPool = index.usable.filter((f) => f.intlEvents > 0 && f.country && f.topAgent && f.region);
  const pro: Maker<ProPuzzle> = ({ rng, level, recent }) => {
    const p = pickBand(rng, proPool, level, (f, g) => !recent(PRO_GAPS.pro * g).has(`player:${f.id}`), 0.5) ?? proPool[0]!;
    return { puzzle: { answer: p.id }, keys: [`player:${p.id}`] };
  };

  // Grade 3x3.
  const teamCount = new Map<string, number>();
  for (const f of facts) for (const t of f.teams) teamCount.set(t, (teamCount.get(t) ?? 0) + 1);
  const gradeTeams = [...index.families.values()]
    .filter((t) => (teamCount.get(t.key) ?? 0) >= 10)
    .sort((a, b) => b.fame - a.fame || a.key.localeCompare(b.key))
    .slice(0, 48)
    .map((t) => t.key);
  const countryCount = new Map<string, number>();
  for (const f of facts) if (f.country) countryCount.set(f.country, (countryCount.get(f.country) ?? 0) + 1);
  const countries = [...countryCount].filter(([, n]) => n >= 12).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
  const intlEvents = [...data.events.values()].filter((e) => e.tier !== 'regional').map((e) => e.id);
  const roles: Role[] = ['duelist', 'initiator', 'controller', 'sentinel'];
  const COL_PATTERNS: Criterion['kind'][][] = [
    ['country', 'role', 'event'],
    ['country', 'title', 'team'],
    ['team', 'country', 'role'],
    ['event', 'country', 'title'],
    ['team', 'team', 'country'],
    ['role', 'event', 'team'],
    ['country', 'country', 'event'],
  ];
  const optionsOf = (kind: Criterion['kind'], rows: readonly string[]): Criterion[] => {
    switch (kind) {
      case 'team':
        return gradeTeams.filter((t) => !rows.includes(t)).map((team) => ({ kind: 'team', team }));
      case 'country':
        return countries.map((country) => ({ kind: 'country', country }));
      case 'role':
        return roles.map((role) => ({ kind: 'role', role }));
      case 'event':
        return intlEvents.map((event) => ({ kind: 'event', event }));
      case 'title':
        return [{ kind: 'title' }];
      default:
        return [];
    }
  };
  const answersMemo = new Map<string, string[]>();
  const answersFor = (r: Criterion, c: Criterion): string[] => {
    const key = `${criterionKey(r)}&${criterionKey(c)}`;
    let out = answersMemo.get(key);
    if (!out) answersMemo.set(key, (out = facts.filter((f) => matches(f, r) && matches(f, c)).map((f) => f.id)));
    return out;
  };
  const teamRows = gradeTeams.map((team): Criterion => ({ kind: 'team', team }));
  /** Teams that give every column at least GRADE_MIN_ANSWERS answers. */
  const rowsFitting = (cols: readonly Criterion[]) =>
    teamRows.filter((r) => !cols.some((c) => criterionKey(c) === criterionKey(r)) && cols.every((c) => answersFor(r, c).length >= GRADE_MIN_ANSWERS));
  const grade: Maker<GradePuzzle> = ({ rng, level, recent }) => {
    for (let attempt = 0; attempt < 400; attempt++) {
      const relax = attempt >= 300 ? 0 : attempt >= 150 ? 0.5 : 1;
      const usedTeams = recent(PRO_GAPS.gradeTeam * relax);
      const pattern = COL_PATTERNS[rng.int(0, COL_PATTERNS.length - 1)]!;
      const cols: Criterion[] = [];
      for (const kind of shuffle(rng, pattern)) {
        const opts = optionsOf(kind, []).filter((o) => !cols.some((c) => criterionKey(c) === criterionKey(o)) && rowsFitting([...cols, o]).length >= 4);
        const pick = weightedTake(rng, opts, 1, (o) => Math.sqrt(rowsFitting([...cols, o]).length))[0];
        if (!pick) break;
        cols.push(pick);
      }
      if (cols.length < 3) continue;
      const fitting = rowsFitting(cols).filter((r) => !usedTeams.has(criterionKey(r)));
      const rows: Criterion[] = [];
      while (rows.length < 3) {
        const r = pickBand(rng, fitting, level, (x) => !rows.includes(x), 0.7);
        if (!r) break;
        rows.push(r);
      }
      if (rows.length < 3) continue;
      const gridKey = `grade:${[...rows, ...cols].map(criterionKey).sort().join('|')}`;
      if (recent(PRO_GAPS.grade * relax).has(gridKey)) continue;
      const answers = rows.flatMap((r) => cols.map((c) => answersFor(r, c)));
      return { puzzle: { rows, cols, answers }, keys: [gridKey, ...rows.map(criterionKey)] };
    }
    throw new Error('grade: no grid');
  };

  // Conexões.
  const conexoesPool = index.usable.slice(0, 600);
  const conexoesSet = new Set(conexoesPool.map((f) => f.id));
  const catalog = (players: readonly ProFacts[]): Criterion[] => {
    const out = new Map<string, Criterion>();
    for (const f of players) {
      for (const team of f.teams) out.set(`team:${team}`, { kind: 'team', team });
      if (f.country) out.set(`country:${f.country}`, { kind: 'country', country: f.country });
      for (const event of f.wins) out.set(`won:${event}`, { kind: 'won', event });
      if (f.topAgent) out.set(`agent:${f.topAgent}`, { kind: 'agent', agent: f.topAgent });
    }
    return [...out.values()];
  };
  const fullCatalog = catalog(conexoesPool).filter((c) => conexoesPool.filter((f) => matches(f, c)).length >= (c.kind === 'won' ? 4 : 6));
  const byKind = (kind: Criterion['kind']) => fullCatalog.filter((c) => c.kind === kind);
  const CONEXOES_PATTERNS: Criterion['kind'][][] = [
    ['won', 'team', 'country', 'agent'],
    ['team', 'team', 'country', 'won'],
    ['team', 'country', 'agent', 'team'],
    ['won', 'won', 'team', 'country'],
    ['team', 'team', 'agent', 'country'],
  ];
  const fameWeight = (level: number) => (f: ProFacts) => (level <= 2 ? 1 + f.fame : level <= 4 ? 1 + Math.sqrt(Math.max(0, f.fame)) * 3 : 4);
  const conexoes: Maker<ConexoesPuzzle> = ({ rng, level, recent }) => {
    for (let attempt = 0; attempt < 500; attempt++) {
      const relax = attempt >= 400 ? 0 : attempt >= 200 ? 0.5 : 1;
      const used = recent(PRO_GAPS.conexoesTeam * relax);
      const pattern = CONEXOES_PATTERNS[rng.int(0, CONEXOES_PATTERNS.length - 1)]!;
      const crit: Criterion[] = [];
      for (const kind of pattern) {
        const opts = byKind(kind).filter((c) => !crit.some((x) => criterionKey(x) === criterionKey(c)) && !used.has(criterionKey(c)));
        const c = weightedTake(rng, opts, 1, (o) => 1 + Math.sqrt(satisfying(o).filter((f) => conexoesSet.has(f.id)).length))[0];
        if (!c) break;
        crit.push(c);
      }
      if (crit.length < 4) continue;
      const groups: ConexoesGroup[] = [];
      const taken = new Set<string>();
      for (const c of crit) {
        const only = conexoesPool.filter((f) => !taken.has(f.id) && matches(f, c) && crit.every((o) => o === c || !matches(f, o)));
        if (only.length < 4) break;
        const four = weightedTake(rng, only, 4, fameWeight(level));
        for (const f of four) taken.add(f.id);
        groups.push({ criterion: c, players: four.map((f) => f.id).sort() });
      }
      if (groups.length < 4) continue;
      const ids = groups.flatMap((g) => g.players);
      const chosen = ids.map((id) => index.facts.get(id)!);
      const sets = catalog(chosen)
        .map((c) => chosen.filter((f) => matches(f, c)).map((f) => f.id))
        .filter((s) => s.length >= 4);
      if (countPartitions(ids, sets) !== 1) continue;
      const key = `conexoes:${groups.map((g) => g.players.join(',')).sort().join('|')}`;
      if (recent(PRO_GAPS.conexoes).has(key)) continue;
      return { puzzle: { groups, order: shuffle(rng, ids) }, keys: [key, ...crit.map(criterionKey)] };
    }
    throw new Error('conexoes: no puzzle');
  };

  // Comp Misteriosa: a comp of one team on one map, unique at its event (no other team played those five there).
  const compOwners = new Map<string, Set<string>>();
  const compKeyOf = (eventId: string, map: string, agents: readonly string[]) => `${eventId}|${map}|${[...agents].sort().join(',')}`;
  for (const s of series) {
    const cs = comps.get(s.id);
    if (!cs) continue;
    s.maps.forEach((m, i) => {
      const c = cs[i];
      if (!c) return;
      for (const side of [0, 1] as const) {
        const k = compKeyOf(s.eventId, m.map, c[side]);
        compOwners.set(k, (compOwners.get(k) ?? new Set()).add(index.familyOf(s.teams[side].teamId)));
      }
    });
  }
  const memo = new Map(series.map((s) => [s.id, seriesMemorability(s, data)]));
  const compPool: { s: SeriesResult; i: number; side: 0 | 1; weight: number }[] = [];
  for (const s of series) {
    const cs = comps.get(s.id);
    if (!cs || s.teams[0].teamId === s.teams[1].teamId) continue;
    if (s.tier === 'regional' && (memo.get(s.id) ?? 0) < 2) continue;
    s.maps.forEach((m, i) => {
      const c = cs[i];
      if (!c) return;
      for (const side of [0, 1] as const) {
        const owners = compOwners.get(compKeyOf(s.eventId, m.map, c[side]));
        const fam = index.families.get(index.familyOf(s.teams[side].teamId));
        if (owners?.size !== 1 || !fam) continue;
        compPool.push({ s, i, side, weight: (memo.get(s.id) ?? 0) + Math.sqrt(fam.fame) });
      }
    });
  }
  compPool.sort((a, b) => b.weight - a.weight || a.s.id - b.s.id || a.i - b.i || a.side - b.side);
  const comp: Maker<CompPuzzle> = ({ rng, level, recent }) => {
    const pick =
      pickBand(rng, compPool, level, (x, g) => {
        if (recent(PRO_GAPS.compSeries * g).has(`series:${x.s.id}`)) return false;
        return !recent(PRO_GAPS.compTeam * g).has(`team:${index.familyOf(x.s.teams[x.side].teamId)}`);
      }) ?? compPool[0]!;
    const { s, i, side } = pick;
    const other = side === 0 ? 1 : 0;
    const c = comps.get(s.id)![i]!;
    const m = s.maps[i]!;
    const team = s.teams[side];
    const opp = s.teams[other];
    const fam = index.families.get(index.familyOf(team.teamId))!;
    const roster = data.rosters.get(`${team.teamId}@${s.eventId}`);
    const puzzle: CompPuzzle = {
      seriesId: s.id,
      mapIndex: i,
      map: m.map,
      agents: [...c[side]],
      opponentAgents: [...c[other]],
      eventId: s.eventId,
      eventName: s.eventName,
      tier: s.tier,
      year: s.year,
      stage: s.stage,
      round: s.round,
      score: [m.score[side], m.score[other]],
      team: { key: fam.key, teamId: team.teamId, name: team.name, region: roster?.region ?? fam.region },
      opponent: { key: index.familyOf(opp.teamId), teamId: opp.teamId, name: opp.name },
    };
    return { puzzle, keys: [`series:${s.id}`, `team:${fam.key}`] };
  };

  return { pro, grade, conexoes, comp, proPool, compPool: compPool.length };
}
