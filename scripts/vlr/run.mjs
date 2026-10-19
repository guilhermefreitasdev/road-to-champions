#!/usr/bin/env node
// Scrapes completed VCT events from vlr.gg and writes deterministic JSON to src/data/real/vlr/:
// international events (Masters + Champions, 2021 onwards) and the regional league stages of the
// franchising era (Americas/EMEA/Pacific/China: 2023 League, then Kickoff/Stage 1/Stage 2).
// Node 22+, ESM, depends only on cheerio.
//
// Usage:
//   npm run data:vlr                      # discover + scrape everything (uses .cache/vlr when present)
//   npm run data:vlr -- --event 1015      # only this event id (repeatable or comma-separated)
//   npm run data:vlr -- --tier regional   # only regional league stages (or: international, all)
//   npm run data:vlr -- --offline         # rebuild JSON from the cache only, no network
//   npm run data:vlr -- --refresh         # re-fetch pages even if cached
//   npm run data:vlr -- --max-matches 12  # cap of match pages per event (default 12)

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, VlrClient, cachePathFor, proxyHint } from './fetch.mjs';
import {
  agentSlug,
  classifyEvent,
  parseAgentsPageMaps,
  parseDateRange,
  parseEventListing,
  parseEventPage,
  parseMatchList,
  parseMatchPage,
  parseStatsPage,
  parseStatsStageGroups,
  isShowmatch,
  shortEventName,
  slimEvent,
  slugify,
} from './parse.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, 'src', 'data', 'real', 'vlr');
const EVENTS_DIR = join(OUT_DIR, 'events');
const LISTING = '/events/?tier=60';
const MAX_LISTING_PAGES = 20;

/** International events we expect to exist (by short-name slug), used only to report gaps. */
const EXPECTED = [
  'masters-reykjavik-2021',
  'masters-berlin-2021',
  'champions-2021',
  'masters-reykjavik-2022',
  'masters-copenhagen-2022',
  'champions-2022',
  'lock-in-sao-paulo-2023',
  'masters-tokyo-2023',
  'champions-2023',
  'masters-madrid-2024',
  'masters-shanghai-2024',
  'champions-2024',
  'masters-bangkok-2025',
  'masters-toronto-2025',
  'champions-2025',
];

/** Regional league stages we expect (2023: one league per region, no China league; 2024+: 3 stages × 4 regions). */
const EXPECTED_REGIONAL = [
  ...['americas', 'emea', 'pacific'].map((r) => `${r}-league-2023`),
  ...[2024, 2025].flatMap((y) =>
    ['americas', 'emea', 'pacific', 'china'].flatMap((r) => ['kickoff', 'stage-1', 'stage-2'].map((s) => `${r}-${s}-${y}`)),
  ),
];

function parseArgs(argv) {
  const args = { events: [], offline: false, refresh: false, maxMatches: 12, tier: 'all' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--offline') args.offline = true;
    else if (a === '--refresh') args.refresh = true;
    else if (a === '--event') args.events.push(...argv[++i].split(',').map(Number));
    else if (a === '--max-matches') args.maxMatches = Number(argv[++i]);
    else if (a === '--tier') args.tier = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  if (!['all', 'international', 'regional'].includes(args.tier)) throw new Error(`--tier must be all, international or regional`);
  return args;
}

const byKey = (...keys) => (a, b) => {
  for (const k of keys) {
    const x = typeof k === 'function' ? k(a) : a[k];
    const y = typeof k === 'function' ? k(b) : b[k];
    if (x === y) continue;
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    return x < y ? -1 : 1;
  }
  return 0;
};

async function loadAgentSlugs() {
  const agents = JSON.parse(await readFile(join(ROOT, 'src', 'data', 'game', 'agents.json'), 'utf8'));
  return Object.fromEntries(agents.map((a) => [agentSlug(a.name), a.name]));
}

async function fetchedDate(path) {
  try {
    return (await stat(cachePathFor(path))).mtime.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

async function discoverEvents(client) {
  const first = parseEventListing(await client.get(LISTING));
  const all = [...first.events];
  const seen = new Set([1]);
  const queue = first.pages.filter((p) => !seen.has(p));
  while (queue.length && seen.size < MAX_LISTING_PAGES) {
    const page = queue.shift();
    if (seen.has(page)) continue;
    seen.add(page);
    const res = parseEventListing(await client.get(`${LISTING}&page=${page}`));
    all.push(...res.events);
    for (const p of res.pages) if (!seen.has(p) && !queue.includes(p)) queue.push(p);
  }
  const unique = new Map();
  for (const e of all) if (!unique.has(e.id)) unique.set(e.id, e);
  const vct = [...unique.values()]
    .map((e) => ({ ...e, ...(classifyEvent(e.title) ?? { tier: null }) }))
    .filter((e) => e.tier);
  return { listingPages: seen.size, vct };
}

/** Selects match pages newest-first until the union of maps covers the event's pool (or the cap). */
async function collectMatches(client, matchList, poolNames, eventTeamIds, maxMatches, log) {
  const completed = matchList.filter((m) => /completed/i.test(m.status ?? '')).reverse();
  const union = new Set();
  const matches = [];
  let idle = 0;
  for (const m of completed) {
    if (matches.length >= maxMatches) break;
    if (poolNames.size && [...poolNames].every((p) => union.has(p))) break;
    if (!poolNames.size && idle >= 4) break;
    const parsed = parseMatchPage(await client.get(m.path));
    for (const t of parsed.teams) delete t.players; // resolved above; not stored
    if (parsed.teams.some((t) => !eventTeamIds.has(t.id))) {
      log(`    skip match ${m.id} (${parsed.teams.map((t) => t.name).join(' vs ')}): not between event teams`);
      continue;
    }
    const before = union.size;
    for (const g of parsed.maps) if (g.map) union.add(g.map);
    idle = union.size > before ? 0 : idle + 1;
    matches.push({ id: m.id, url: `${BASE}${m.path}`, series: m.series, ...parsed });
  }
  log(`    ${matches.length} match pages, maps seen: ${[...union].sort().join(', ')}`);
  return matches;
}

async function scrapeEvent(client, listed, agentBySlug, opts, log) {
  const urls = [];
  const get = async (path) => {
    urls.push(`${BASE}${path}`);
    return client.get(path);
  };

  // 1. Event pages: overview (= active stage) + the other stage tabs, for meta, standings and rosters.
  //    Showmatch tabs (celebrity/all-star teams) are not part of the competition and are skipped.
  //    Placements: the overview (VLR's default tab, the final stage) ranks the whole event; an earlier
  //    stage (group stage, play-ins, regular season) ranks only itself, so from those we keep just the
  //    teams it eliminated, i.e. ranks that start below everything already placed ("7th–9th" after a
  //    "1st…4th" playoffs, never a play-in "2nd"). Teams VLR does not rank that way stay unplaced.
  const overview = parseEventPage(await get(listed.path));
  const activeStage = overview.stages.find((s) => s.active);
  const standings = activeStage && isShowmatch(activeStage.title) ? [] : [...overview.standings];
  const rosters = activeStage && isShowmatch(activeStage.title) ? [] : [...overview.rosters];
  const standingRows = [...standings]; // every ranked row, for team names/countries (not placements)
  const placedMax = () => Math.max(0, ...standings.map((s) => s.place?.max ?? 0));
  for (const stage of overview.stages) {
    if (stage.active || !stage.path || stage.path === listed.path || isShowmatch(stage.title)) continue;
    const page = parseEventPage(await get(stage.path));
    const floor = placedMax();
    const placed = new Set(standings.map((s) => s.teamId));
    const accepted = page.standings.filter((s) => !placed.has(s.teamId) && (floor === 0 || (s.place?.min ?? 0) > floor));
    const dropped = page.standings.filter((s) => !accepted.includes(s) && !placed.has(s.teamId));
    if (dropped.length) log(`    ${stage.title}: ignoring stage-only ranks of ${dropped.map((s) => `${s.name} (${s.placeText})`).join(', ')}`);
    standings.push(...accepted);
    standingRows.push(...page.standings);
    rosters.push(...page.rosters);
  }

  // 2. Player stats (all stages, all maps, no minimum rounds). If the stats include a showmatch
  //    stage, re-request with VLR's own `exclude` filter so those rounds are left out.
  let statsPath = `/event/stats/${listed.id}?min_rounds=0`;
  let statsHtml = await get(statsPath);
  const showmatchStages = parseStatsStageGroups(statsHtml)
    .filter((g) => isShowmatch(g.label))
    .flatMap((g) => g.values);
  if (showmatchStages.length) {
    statsPath = `/event/stats/${listed.id}?exclude=${showmatchStages.join('.')}&min_rounds=0`;
    log(`    stats include a showmatch stage; using ${statsPath}`);
    statsHtml = await get(statsPath);
  }
  const rows = parseStatsPage(statsHtml, agentBySlug);

  // 3. Map pool from the event agents page (lists every map played and how often).
  //    The agents page takes the same `exclude` filter as the stats page.
  const agentsPath = showmatchStages.length
    ? `/event/agents/${listed.id}?exclude=${showmatchStages.join('.')}`
    : `/event/agents/${listed.id}`;
  const mapPool = parseAgentsPageMaps(await get(agentsPath)).sort(byKey('map'));

  // Team resolution: roster cards give player -> team; tags then cover substitutes/stand-ins.
  const teamByPlayer = new Map();
  const teamInfo = new Map();
  for (const r of rosters) {
    if (!r.teamId) continue;
    if (!teamInfo.has(r.teamId)) teamInfo.set(r.teamId, { id: r.teamId, slug: r.teamSlug, name: r.name });
    for (const p of r.players) if (!teamByPlayer.has(p.id)) teamByPlayer.set(p.id, r.teamId);
  }
  // Some stage pages list a team with an empty roster card (e.g. group stages of the 2024 China Kickoff).
  // For such a team, one of its match pages (the series scoreboard) says exactly who played for it.
  const matchList = parseMatchList(await get(`/event/matches/${listed.id}/?series_id=all`)).filter(
    (m) => !isShowmatch(m.series),
  );
  const matchPages = new Map();
  const rosterless = () => [...teamInfo.values()].filter((t) => ![...teamByPlayer.values()].includes(t.id));
  const registerScoreboard = (parsed) => {
    for (const t of parsed.teams) {
      if (!t.id || !teamInfo.has(t.id)) continue;
      for (const p of t.players) if (!teamByPlayer.has(p.id)) teamByPlayer.set(p.id, t.id);
    }
  };
  const completedMatches = matchList.filter((x) => /completed/i.test(x.status ?? ''));
  // The standings may use a sponsored name ("JD Mall JDG Esports") where the match list says "JD Gaming":
  // the team's VLR slug ("jd-gaming") is the stable form, so names are also compared slug-wise.
  const slugish = (name) => (name ?? '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
  const sameTeam = (name, team) => name === team.name || slugish(name) === slugish(team.slug);
  for (const team of rosterless()) {
    const m = completedMatches.find((x) => x.teams.some((n) => sameTeam(n, team)));
    if (!m) continue; // handled below by team id
    const parsed = parseMatchPage(await get(m.path));
    matchPages.set(m.id, parsed);
    registerScoreboard(parsed);
    log(`    ${team.name}: roster taken from the scoreboard of match ${m.id}`);
  }
  // Still unresolved (the standings name is not the match-list name, e.g. "JD Mall JDG Esports" vs
  // "JD Gaming"): walk the oldest matches (group stage first), which name teams by id, up to a few pages.
  for (let i = completedMatches.length - 1, tries = 0; i >= 0 && rosterless().length && tries < 8; i--) {
    const m = completedMatches[i];
    if (matchPages.has(m.id)) continue;
    tries++;
    const parsed = parseMatchPage(await get(m.path));
    matchPages.set(m.id, parsed);
    const before = rosterless().map((t) => t.name);
    registerScoreboard(parsed);
    const solved = before.filter((n) => !rosterless().some((t) => t.name === n));
    if (solved.length) log(`    ${solved.join(', ')}: roster taken from the scoreboard of match ${m.id} (found by team id)`);
  }
  for (const team of rosterless()) log(`    WARN ${team.name} has no roster card and no match page naming it`);
  const placementByTeam = new Map();
  for (const s of standingRows) {
    if (!teamInfo.has(s.teamId)) teamInfo.set(s.teamId, { id: s.teamId, slug: s.teamSlug, name: s.name });
    else teamInfo.get(s.teamId).name = s.name;
    teamInfo.get(s.teamId).countryName = s.country;
  }
  for (const s of standings) {
    if (!placementByTeam.has(s.teamId)) placementByTeam.set(s.teamId, { text: s.placeText, ...s.place });
  }
  const teamByTag = new Map();
  for (const row of rows) {
    const t = teamByPlayer.get(row.playerId);
    if (t && row.teamTag && !teamByTag.has(row.teamTag)) teamByTag.set(row.teamTag, t);
  }
  const players = [];
  const excludedPlayers = [];
  for (const row of rows) {
    const teamId = teamByPlayer.get(row.playerId) ?? (row.teamTag ? teamByTag.get(row.teamTag) : undefined) ?? null;
    if (teamId === null) {
      excludedPlayers.push({
        playerId: row.playerId,
        handle: row.handle,
        teamTag: row.teamTag,
        rounds: row.rounds,
        reason: 'team not in the event standings/rosters',
      });
    } else players.push({ ...row, teamId });
  }
  if (excludedPlayers.length) {
    log(`    WARN excluded (no event team): ${excludedPlayers.map((p) => `${p.handle} (${p.teamTag})`).join(', ')}`);
  }

  // 4. Match pages for vetoes (and to confirm maps). Showmatches are skipped.
  const eventTeamIds = new Set(teamInfo.keys());
  const matches = await collectMatches(
    client,
    matchList,
    new Set(mapPool.map((m) => m.map)),
    eventTeamIds,
    opts.maxMatches,
    log,
  );
  for (const m of matches) urls.push(m.url);

  const teamsById = new Map();
  for (const p of players) {
    if (!teamsById.has(p.teamId)) teamsById.set(p.teamId, []);
    teamsById.get(p.teamId).push(p);
  }
  const teams = [...teamsById.entries()].map(([id, ps]) => {
    const info = teamInfo.get(id) ?? { id, slug: null, name: null };
    const tags = [...new Set(ps.map((p) => p.teamTag).filter(Boolean))].sort();
    const ordered = [...ps].sort(byKey((p) => -(p.rounds ?? 0), (p) => -(p.maps ?? 0), 'playerId'));
    return {
      id,
      slug: info.slug ?? null,
      name: info.name ?? null,
      tag: tags[0] ?? null,
      countryName: info.countryName ?? null,
      placement: placementByTeam.get(id) ?? null,
      played: true,
      players: ordered.map((p, i) => ({
        playerId: p.playerId,
        handle: p.handle,
        rounds: p.rounds,
        main: i < 5,
      })),
    };
  });
  // Teams in the standings with no stats rows (e.g. withdrew) are kept, flagged played: false.
  for (const [id, placement] of placementByTeam) {
    if (teamsById.has(id)) continue;
    const info = teamInfo.get(id);
    log(`    note: ${info.name} (${placement.text}) has no stats rows; kept with played: false`);
    teams.push({
      id,
      slug: info.slug,
      name: info.name,
      tag: null,
      countryName: info.countryName ?? null,
      placement,
      played: false,
      players: [],
    });
  }
  teams.sort(byKey((t) => t.placement?.min ?? 999, (t) => (t.name ?? '').toLowerCase(), 'id'));

  const dates = parseDateRange(overview.datesText);
  const year = Number((dates.end ?? dates.start ?? '').slice(0, 4)) || Number(listed.title.match(/\d{4}/)?.[0]) || null;
  const regional = listed.tier === 'regional' ? { region: listed.region, stage: listed.stage } : null;
  const shortName = shortEventName(listed.title, listed.tier, year, regional);
  const slug = slugify(shortName);
  const fetchedAt = await fetchedDate(statsPath);

  return {
    id: listed.id,
    slug,
    name: overview.title ?? listed.title,
    shortName,
    year,
    tier: listed.tier,
    // Regional league stages only: the league's region and the stage within the season.
    region: regional?.region ?? null,
    stage: regional?.stage ?? null,
    startDate: dates.start,
    endDate: dates.end,
    datesText: overview.datesText,
    location: overview.location,
    locationCountry: overview.locationCountry,
    prize: overview.prize,
    source: {
      site: 'VLR.gg',
      credit: 'Dados de VLR.gg (vlr.gg). Sem API oficial; exibidos com atribuição.',
      eventUrl: `${BASE}${listed.path}`,
      urls: [...new Set(urls)].sort(),
      fetchedAt,
    },
    mapPool,
    teams,
    excludedPlayers: excludedPlayers.sort(byKey('playerId')),
    players: players
      .map(({ teamTag, ...p }) => ({ ...p, teamTag }))
      .sort(byKey((p) => (p.handle ?? '').toLowerCase(), 'playerId')),
    matches: matches.sort(byKey('id')),
  };
}

async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function writeIndex(log) {
  const files = (await readdir(EVENTS_DIR)).filter((f) => f.endsWith('.json'));
  const events = [];
  const slim = [];
  for (const f of files) {
    const e = JSON.parse(await readFile(join(EVENTS_DIR, f), 'utf8'));
    slim.push(slimEvent(e));
    events.push({
      id: e.id,
      slug: e.slug,
      name: e.name,
      shortName: e.shortName,
      tier: e.tier,
      region: e.region ?? null,
      stage: e.stage ?? null,
      year: e.year,
      startDate: e.startDate,
      endDate: e.endDate,
      location: e.location,
      teams: e.teams.length,
      players: e.players.length,
      maps: e.mapPool.map((m) => m.map),
      file: `events/${f}`,
      url: e.source.eventUrl,
      fetchedAt: e.source.fetchedAt,
    });
  }
  events.sort(byKey('startDate', 'id'));
  slim.sort(byKey('startDate', 'slug'));
  await writeJson(join(OUT_DIR, 'slim.json'), slim);
  log(`wrote ${join(OUT_DIR, 'slim.json')} (${slim.length} events, ${JSON.stringify(slim).length} bytes compact)`);
  await writeJson(join(OUT_DIR, 'events.json'), {
    source: {
      site: 'VLR.gg',
      credit: 'Dados de VLR.gg (vlr.gg). Sem API oficial; exibidos com atribuição.',
      generator: 'scripts/vlr/run.mjs',
    },
    events,
  });
  log(`wrote ${join(OUT_DIR, 'events.json')} (${events.length} events)`);
  return events;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  const log = (...m) => console.log(...m);
  const client = new VlrClient({ offline: args.offline, refresh: args.refresh, log });
  await client.init();
  const agentBySlug = await loadAgentSlugs();

  const { listingPages, vct } = await discoverEvents(client);
  const wanted = vct.filter(
    (e) => args.tier === 'all' || (args.tier === 'regional') === (e.tier === 'regional'),
  );
  log(
    `listing: ${listingPages} pages, ${vct.filter((e) => e.tier !== 'regional').length} international events, ${vct.filter((e) => e.tier === 'regional').length} regional league stages`,
  );
  const completed = wanted.filter((e) => /completed/i.test(e.status ?? ''));
  for (const e of wanted.filter((x) => !completed.includes(x))) log(`  skip (${e.status}): ${e.title} [${e.id}]`);
  completed.sort(byKey('id'));

  const targets = args.events.length ? completed.filter((e) => args.events.includes(e.id)) : completed;
  for (const id of args.events) if (!targets.some((e) => e.id === id)) log(`WARN event ${id} is not a completed VCT event of the requested tier`);

  const written = [];
  for (const [i, listed] of targets.entries()) {
    log(`[${i + 1}/${targets.length}] ${listed.title} (${listed.id}, ${listed.tier})`);
    const event = await scrapeEvent(client, listed, agentBySlug, args, log);
    await writeJson(join(EVENTS_DIR, `${event.slug}.json`), event);
    written.push(event);
    log(
      `    -> ${event.slug}.json: ${event.teams.length} teams, ${event.players.length} players, maps ${event.mapPool.map((m) => m.map).join('/')}`,
    );
  }

  const index = await writeIndex(log);
  const slugs = new Set(index.map((e) => e.slug));
  const expected = args.tier === 'international' ? EXPECTED : args.tier === 'regional' ? EXPECTED_REGIONAL : [...EXPECTED, ...EXPECTED_REGIONAL];
  const missing = args.events.length ? [] : expected.filter((s) => !slugs.has(s));
  if (missing.length) log(`WARN expected events not found: ${missing.join(', ')}`);
  log(
    `done: ${written.length} events scraped, ${client.requests} network requests, ${client.cacheHits} cache hits, ${Math.round((Date.now() - t0) / 1000)} s`,
  );
}

main().catch((err) => {
  console.error(`data:vlr: ${err.message}${err.cause ? ` (${err.cause.message ?? err.cause})` : ''}`);
  const hint = proxyHint();
  if (hint) console.error(hint);
  process.exit(1);
});
