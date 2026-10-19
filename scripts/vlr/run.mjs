#!/usr/bin/env node
// Scrapes completed VCT international events (Masters + Champions, 2021 onwards) from vlr.gg and
// writes deterministic JSON to src/data/real/vlr/. Node 22+, ESM, depends only on cheerio.
//
// Usage:
//   npm run data:vlr                      # discover + scrape everything (uses .cache/vlr when present)
//   npm run data:vlr -- --event 1015      # only this event id (repeatable or comma-separated)
//   npm run data:vlr -- --offline         # rebuild JSON from the cache only, no network
//   npm run data:vlr -- --refresh         # re-fetch pages even if cached
//   npm run data:vlr -- --max-matches 12  # cap of match pages per event (default 12)

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, VlrClient, cachePathFor, proxyHint } from './fetch.mjs';
import {
  agentSlug,
  classifyEventTitle,
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

function parseArgs(argv) {
  const args = { events: [], offline: false, refresh: false, maxMatches: 12 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--offline') args.offline = true;
    else if (a === '--refresh') args.refresh = true;
    else if (a === '--event') args.events.push(...argv[++i].split(',').map(Number));
    else if (a === '--max-matches') args.maxMatches = Number(argv[++i]);
    else throw new Error(`unknown argument ${a}`);
  }
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
  const intl = [...unique.values()]
    .map((e) => ({ ...e, tier: classifyEventTitle(e.title) }))
    .filter((e) => e.tier);
  return { listingPages: seen.size, intl };
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
  const overview = parseEventPage(await get(listed.path));
  const activeStage = overview.stages.find((s) => s.active);
  const standings = activeStage && isShowmatch(activeStage.title) ? [] : [...overview.standings];
  const rosters = activeStage && isShowmatch(activeStage.title) ? [] : [...overview.rosters];
  for (const stage of overview.stages) {
    if (stage.active || !stage.path || stage.path === listed.path || isShowmatch(stage.title)) continue;
    const page = parseEventPage(await get(stage.path));
    standings.push(...page.standings);
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
  const placementByTeam = new Map();
  for (const s of standings) {
    if (!teamInfo.has(s.teamId)) teamInfo.set(s.teamId, { id: s.teamId, slug: s.teamSlug, name: s.name });
    else teamInfo.get(s.teamId).name = s.name;
    teamInfo.get(s.teamId).countryName = s.country;
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
  const matchList = parseMatchList(await get(`/event/matches/${listed.id}/?series_id=all`)).filter(
    (m) => !isShowmatch(m.series),
  );
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
  const shortName = shortEventName(listed.title, listed.tier, year);
  const slug = slugify(shortName);
  const fetchedAt = await fetchedDate(statsPath);

  return {
    id: listed.id,
    slug,
    name: overview.title ?? listed.title,
    shortName,
    year,
    tier: listed.tier,
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
  for (const f of files) {
    const e = JSON.parse(await readFile(join(EVENTS_DIR, f), 'utf8'));
    events.push({
      id: e.id,
      slug: e.slug,
      name: e.name,
      shortName: e.shortName,
      tier: e.tier,
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

  const { listingPages, intl } = await discoverEvents(client);
  log(`listing: ${listingPages} pages, ${intl.length} international events`);
  const completed = intl.filter((e) => /completed/i.test(e.status ?? ''));
  for (const e of intl.filter((x) => !completed.includes(x))) log(`  skip (${e.status}): ${e.title} [${e.id}]`);
  completed.sort(byKey('id'));

  const targets = args.events.length ? completed.filter((e) => args.events.includes(e.id)) : completed;
  for (const id of args.events) if (!targets.some((e) => e.id === id)) log(`WARN event ${id} is not a completed international event`);

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
  const missing = args.events.length ? [] : EXPECTED.filter((s) => !slugs.has(s));
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
