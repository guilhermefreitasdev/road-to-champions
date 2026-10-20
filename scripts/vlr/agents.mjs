#!/usr/bin/env node
// Per-player per-agent stats from the per-map scoreboards of VLR match pages, written to
// src/data/real/vlr/agent-stats.json (playerId → year → agent → {maps, rounds, rating, acs, k, d}).
// Reads the match pages of the events already in src/data/real/vlr/events.json (their match lists are in
// .cache/vlr). Node 22+, ESM, depends only on cheerio (through parse.mjs).
//
// Usage:
//   npm run data:vlr-agents                          # build the JSON from the cache only (no network)
//   npm run data:vlr-agents -- --fetch               # first download missing match pages (polite client), then build
//   npm run data:vlr-agents -- --fetch --max-new 600 # cap of new match pages per run (default 600)
//   npm run data:vlr-agents -- --plan                # print what --fetch would download (no network), then build
//
// What --fetch downloads (in this order, until the cap): every completed series of the international events
// not cached yet; then, for the regional league stages, series chosen so that every team of the stage has at
// least 1, then 2, then 3 series cached (each step over all stages before the next, so the cap spreads evenly).

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VlrClient, cachePathFor, proxyHint } from './fetch.mjs';
import { agentSlug, aggregateAgentStats, isShowmatch, parseMatchList, parseMatchMapStats } from './parse.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, 'src', 'data', 'real', 'vlr');
const OUT = join(OUT_DIR, 'agent-stats.json');
const REGIONAL_LEVELS = 3;

function parseArgs(argv) {
  const args = { fetch: false, plan: false, maxNew: 600 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fetch') args.fetch = true;
    else if (a === '--plan') args.plan = true;
    else if (a === '--max-new') args.maxNew = Number(argv[++i]);
    else throw new Error(`unknown argument ${a}`);
  }
  return args;
}

/** Completed, non-showmatch series of every event in the snapshot, with the event's year and tier. */
async function loadSeries() {
  const { events } = JSON.parse(await readFile(join(OUT_DIR, 'events.json'), 'utf8'));
  const out = [];
  for (const e of [...events].sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? '') || a.id - b.id)) {
    const file = cachePathFor(`/event/matches/${e.id}/?series_id=all`);
    if (!existsSync(file)) throw new Error(`match list of ${e.slug} is not cached (run npm run data:vlr first)`);
    const list = parseMatchList(await readFile(file, 'utf8')).filter(
      (m) => !isShowmatch(m.series) && /completed/i.test(m.status ?? ''),
    );
    for (const m of list) out.push({ ...m, eventId: e.id, eventSlug: e.slug, year: e.year, tier: e.tier });
  }
  return out;
}

const isCached = (m) => existsSync(cachePathFor(m.path));

/** The missing series to download, in priority order (see the header). */
function planFetch(series, cap) {
  const missing = series.filter((m) => !isCached(m));
  const plan = missing.filter((m) => m.tier !== 'regional');
  const byEvent = new Map();
  for (const m of series.filter((x) => x.tier === 'regional')) {
    if (!byEvent.has(m.eventSlug)) byEvent.set(m.eventSlug, []);
    byEvent.get(m.eventSlug).push(m);
  }
  const count = new Map(); // `${event}|${team}` -> cached or planned series
  for (const [slug, list] of byEvent) {
    for (const m of list) for (const t of m.teams) count.set(`${slug}|${t}`, (count.get(`${slug}|${t}`) ?? 0) + (isCached(m) ? 1 : 0));
  }
  const planned = new Set(plan.map((m) => m.id));
  for (let level = 1; level <= REGIONAL_LEVELS; level++) {
    for (const [slug, list] of byEvent) {
      for (;;) {
        const short = (t) => (count.get(`${slug}|${t}`) ?? 0) < level;
        let best = null;
        let bestScore = 0;
        for (const m of list) {
          if (isCached(m) || planned.has(m.id)) continue;
          const score = m.teams.filter(short).length;
          if (score > bestScore) {
            best = m;
            bestScore = score;
          }
        }
        if (!best) break;
        planned.add(best.id);
        plan.push(best);
        for (const t of best.teams) count.set(`${slug}|${t}`, (count.get(`${slug}|${t}`) ?? 0) + 1);
      }
    }
  }
  return plan.slice(0, cap);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = (...m) => console.log(...m);
  const t0 = Date.now();
  const series = await loadSeries();
  log(`${series.length} completed series in ${new Set(series.map((m) => m.eventId)).size} events, ${series.filter(isCached).length} cached`);

  if (args.plan || args.fetch) {
    const plan = planFetch(series, args.maxNew);
    const intl = plan.filter((m) => m.tier !== 'regional').length;
    log(`plan: ${plan.length} new match pages (${intl} international, ${plan.length - intl} regional), cap ${args.maxNew}`);
    if (args.fetch) {
      const client = new VlrClient({ log: () => {} });
      await client.init();
      for (const [i, m] of plan.entries()) {
        await client.get(m.path);
        if ((i + 1) % 25 === 0 || i + 1 === plan.length) {
          log(`  [${i + 1}/${plan.length}] ${m.eventSlug} ${m.path} (${client.requests} requests, ${Math.round((Date.now() - t0) / 1000)} s)`);
        }
      }
      log(`fetched ${plan.length} pages with ${client.requests} network requests (incl. robots.txt)`);
    }
  }

  // Build: every cached series of the snapshot's events, parsed per map.
  const agents = JSON.parse(await readFile(join(ROOT, 'src', 'data', 'game', 'agents.json'), 'utf8'));
  const agentBySlug = Object.fromEntries(agents.map((a) => [agentSlug(a.name), a.name]));
  const slim = JSON.parse(await readFile(join(OUT_DIR, 'slim.json'), 'utf8'));
  const mains = new Set(slim.flatMap((e) => e.players.map((p) => p.playerId)));
  const parsed = [];
  let maps = 0;
  let rows = 0;
  let noAgent = 0;
  const unknown = new Set();
  const wrongEvent = [];
  for (const m of series.filter(isCached)) {
    const page = parseMatchMapStats(await readFile(cachePathFor(m.path), 'utf8'), agentBySlug);
    if (page.eventId !== m.eventId) wrongEvent.push(m.path);
    const played = page.maps.filter((g) => g.players.length > 0);
    maps += played.length;
    for (const g of played) {
      for (const p of g.players) {
        rows++;
        if (!p.agent) noAgent++;
        else if (p.agent.startsWith('unknown:')) unknown.add(p.agent);
      }
    }
    parsed.push({ id: m.id, year: m.year, maps: played });
  }
  parsed.sort((a, b) => a.id - b.id);
  const players = aggregateAgentStats(parsed, (id) => mains.has(id));
  const cells = Object.values(players).reduce(
    (s, years) => s + Object.values(years).reduce((t, ag) => t + Object.keys(ag).length, 0),
    0,
  );
  const data = {
    source: {
      site: 'VLR.gg',
      credit: 'Dados de VLR.gg (vlr.gg). Sem API oficial; exibidos com atribuição.',
      generator: 'scripts/vlr/agents.mjs',
      note: 'Per-map scoreboards of VLR match pages: playerId → year (of the event) → agent → maps, rounds, round-weighted Rating 2.0 and ACS, kills and deaths. Main players of src/data/real/vlr/slim.json only.',
      series: parsed.length,
      maps,
    },
    players,
  };
  // Compact, one line per player (diffs stay readable, the bundle stays small).
  const lines = Object.entries(players).map(([id, years]) => `${JSON.stringify(id)}:${JSON.stringify(years)}`);
  const text = `{"source":${JSON.stringify(data.source, null, 2)},\n"players":{\n${lines.join(',\n')}\n}}\n`;
  if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(data)) throw new Error('agent-stats.json does not round-trip');
  await writeFile(OUT, text, 'utf8');
  log(
    `wrote ${OUT}: ${parsed.length} series, ${maps} maps, ${rows} player-maps (${noAgent} without a single agent), ` +
      `${Object.keys(players).length} players, ${cells} player-year-agent cells, ${text.length} bytes`,
  );
  if (unknown.size) log(`WARN unknown agent slugs: ${[...unknown].join(', ')}`);
  if (wrongEvent.length) log(`WARN ${wrongEvent.length} match pages name another event: ${wrongEvent.slice(0, 5).join(', ')}`);
}

main().catch((err) => {
  console.error(`data:vlr-agents: ${err.message}${err.cause ? ` (${err.cause.message ?? err.cause})` : ''}`);
  const hint = proxyHint();
  if (hint) console.error(hint);
  process.exit(1);
});
