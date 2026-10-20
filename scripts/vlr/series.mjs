#!/usr/bin/env node
// Series results for the Daily mode ("Placar Clássico"): every cached, completed series of the events in
// src/data/real/vlr/events.json, parsed from its VLR match page into src/data/real/series.json (one compact row
// per series: event, stage/round label, date, best-of, teams, score, maps with scores and who picked them).
// Node 22+, ESM, depends only on cheerio (through parse.mjs).
//
// Usage:
//   npm run data:vlr-series                          # build the JSON from the cache only (no network)
//   npm run data:vlr-series -- --plan                # print what --fetch would download (no network), then build
//   npm run data:vlr-series -- --fetch               # first download the missing bracket series of the regional
//                                                    # stages (polite client, cap --max-new, default 250), then build
//
// The international events are fully cached already (data:vlr-agents). Of the regional stages only the bracket
// (playoff) series are worth fetching for the Daily: regular-season weeks stay as cached.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VlrClient, cachePathFor, proxyHint } from './fetch.mjs';
import { compactSeries, isShowmatch, parseMatchList, parseSeriesPage, seriesProblem } from './parse.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VLR_DIR = join(ROOT, 'src', 'data', 'real', 'vlr');
const OUT = join(ROOT, 'src', 'data', 'real', 'series.json');

/** Round labels of a bracket (playoff) series in the match lists. */
export const BRACKET_ROUND = /Upper|Lower|Grand Final|Semifinals|Quarterfinals|Middle|Final|Knockout/i;

function parseArgs(argv) {
  const args = { fetch: false, plan: false, maxNew: 250 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fetch') args.fetch = true;
    else if (a === '--plan') args.plan = true;
    else if (a === '--max-new') args.maxNew = Number(argv[++i]);
    else throw new Error(`unknown argument ${a}`);
  }
  return args;
}

/** Completed, non-showmatch series of every event in the snapshot (event order by start date). */
async function loadSeries() {
  const { events } = JSON.parse(await readFile(join(VLR_DIR, 'events.json'), 'utf8'));
  const out = [];
  for (const e of [...events].sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? '') || a.id - b.id)) {
    const file = cachePathFor(`/event/matches/${e.id}/?series_id=all`);
    if (!existsSync(file)) throw new Error(`match list of ${e.slug} is not cached (run npm run data:vlr first)`);
    const list = parseMatchList(await readFile(file, 'utf8')).filter((m) => !isShowmatch(m.series) && /completed/i.test(m.status ?? ''));
    for (const m of list) out.push({ ...m, eventId: e.id, eventSlug: e.slug, tier: e.tier });
  }
  return out;
}

const isCached = (m) => existsSync(cachePathFor(m.path));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = (...m) => console.log(...m);
  const t0 = Date.now();
  const series = await loadSeries();
  log(`${series.length} completed series, ${series.filter(isCached).length} cached`);

  if (args.plan || args.fetch) {
    const plan = series.filter((m) => !isCached(m) && (m.tier !== 'regional' || BRACKET_ROUND.test(m.series ?? ''))).slice(0, args.maxNew);
    log(`plan: ${plan.length} new match pages (cap ${args.maxNew})`);
    if (args.fetch) {
      const client = new VlrClient({ log: () => {} });
      await client.init();
      for (const [i, m] of plan.entries()) {
        await client.get(m.path);
        if ((i + 1) % 25 === 0 || i + 1 === plan.length) {
          log(`  [${i + 1}/${plan.length}] ${m.eventSlug} ${m.path} (${client.requests} requests, ${Math.round((Date.now() - t0) / 1000)} s)`);
        }
      }
    }
  }

  const rows = [];
  const skipped = {};
  const wrongEvent = [];
  for (const m of series.filter(isCached)) {
    const page = parseSeriesPage(await readFile(cachePathFor(m.path), 'utf8'));
    if (page.eventId !== m.eventId) wrongEvent.push(m.path);
    const problem = seriesProblem(page);
    if (problem) {
      skipped[problem] = (skipped[problem] ?? 0) + 1;
      continue;
    }
    rows.push(compactSeries(m.id, m.eventSlug, page));
  }
  rows.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.id - b.id);
  const source = {
    site: 'VLR.gg',
    credit: 'Dados de VLR.gg (vlr.gg). Sem API oficial; exibidos com atribuição.',
    generator: 'scripts/vlr/series.mjs',
    note: 'Completed series of the events in vlr/events.json whose match page is cached: event slug, stage and round as VLR labels them, UTC date, best-of, teams [vlrId, slug, name] in header order, series score, maps [name, score1, score2, pickedBy (1, 2 or null)].',
    series: rows.length,
  };
  const text = `{"source":${JSON.stringify(source, null, 2)},\n"series":[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`;
  if (JSON.stringify(JSON.parse(text).series) !== JSON.stringify(rows)) throw new Error('series.json does not round-trip');
  await writeFile(OUT, text, 'utf8');
  log(`wrote ${OUT}: ${rows.length} series, ${text.length} bytes; skipped ${JSON.stringify(skipped)}`);
  if (wrongEvent.length) log(`WARN ${wrongEvent.length} match pages name another event: ${wrongEvent.slice(0, 5).join(', ')}`);
}

main().catch((err) => {
  console.error(`data:vlr-series: ${err.message}${err.cause ? ` (${err.cause.message ?? err.cause})` : ''}`);
  const hint = proxyHint();
  if (hint) console.error(hint);
  process.exit(1);
});
