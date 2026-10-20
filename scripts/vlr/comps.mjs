#!/usr/bin/env node
// Agent compositions per map of the real series, for "Outros modos" (Valdle, "Comp Misteriosa"): for every series of
// src/data/real/series.json, its cached VLR match page (data:vlr / data:vlr-agents already fetched them) is parsed per
// map with parseMatchMapStats, and the five agents of each team are kept when the scoreboard is complete (5 players
// per side, one known agent each, five distinct agents). Cache only: no network. Node 22+, ESM, cheerio via parse.mjs.
//
// Usage: npm run data:vlr-comps
//
// Checks: the map order must match series.json, and each side's players must be listed for that side's team at the
// event (slim.json), so a comp is never attributed to the wrong team.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cachePathFor } from './fetch.mjs';
import { agentSlug, parseMatchList, parseMatchMapStats } from './parse.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VLR_DIR = join(ROOT, 'src', 'data', 'real', 'vlr');
const OUT = join(ROOT, 'src', 'data', 'real', 'comps.json');

async function main() {
  const agents = JSON.parse(await readFile(join(ROOT, 'src', 'data', 'game', 'agents.json'), 'utf8'));
  const agentBySlug = Object.fromEntries(agents.map((a) => [agentSlug(a.name), a.name]));
  const names = agents.map((a) => a.name).sort();
  if (names.length > 52) throw new Error('more agents than one-letter codes');
  const CODES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const code = Object.fromEntries(names.map((n, i) => [n, CODES[i]]));

  const { series } = JSON.parse(await readFile(join(ROOT, 'src', 'data', 'real', 'series.json'), 'utf8'));
  const { events } = JSON.parse(await readFile(join(VLR_DIR, 'events.json'), 'utf8'));
  const slim = JSON.parse(await readFile(join(VLR_DIR, 'slim.json'), 'utf8'));
  // VLR team id → player ids listed for it, per event slug.
  const listed = new Map();
  for (const e of slim) for (const t of e.teams) listed.set(`${e.slug}|${t.id}`, new Set(t.players.map((p) => String(p.playerId))));

  // Match page path of every series id, from the cached match lists.
  const pathOf = new Map();
  for (const e of events) {
    const file = cachePathFor(`/event/matches/${e.id}/?series_id=all`);
    if (!existsSync(file)) continue;
    for (const m of parseMatchList(await readFile(file, 'utf8'))) pathOf.set(m.id, m.path);
  }

  const rows = [];
  const skipped = { noPage: 0, mapOrder: 0, incomplete: 0, wrongTeam: 0 };
  let maps = 0;
  for (const s of series) {
    const path = pathOf.get(s.id);
    if (!path || !existsSync(cachePathFor(path))) {
      skipped.noPage++;
      continue;
    }
    const page = parseMatchMapStats(await readFile(cachePathFor(path), 'utf8'), agentBySlug);
    const played = page.maps.filter((g) => g.players.length > 0);
    if (played.length !== s.maps.length || played.some((g, i) => g.map !== s.maps[i][0])) {
      skipped.mapOrder++;
      continue;
    }
    const comps = played.map((g) => {
      const sides = [1, 2].map((side) => g.players.filter((p) => p.side === side));
      const complete = sides.every((ps) => ps.length === 5 && ps.every((p) => p.agent && code[p.agent]) && new Set(ps.map((p) => p.agent)).size === 5);
      if (!complete) {
        skipped.incomplete++;
        return null;
      }
      const ok = sides.every((ps, i) => {
        const set = listed.get(`${s.event}|${s.teams[i][0]}`);
        return !set || ps.filter((p) => set.has(String(p.playerId))).length >= 3;
      });
      if (!ok) {
        skipped.wrongTeam++;
        return null;
      }
      maps++;
      return sides.map((ps) => ps.map((p) => code[p.agent]).sort().join('')).join('');
    });
    if (comps.some(Boolean)) rows.push([s.id, comps.map((c) => c ?? '')]);
  }
  rows.sort((a, b) => a[0] - b[0]);
  const source = {
    site: 'VLR.gg',
    credit: 'Dados de VLR.gg (vlr.gg). Sem API oficial; exibidos com atribuição.',
    generator: 'scripts/vlr/comps.mjs',
    note: 'Agents of each team per map of the series in series.json (cached VLR match pages). Row: [series id, one string per map in series order: 10 letters, the 5 agents of team 1 then of team 2 (header order), each a code into "agents"; "" when the scoreboard is incomplete].',
    series: rows.length,
    maps,
  };
  const text = `{"source":${JSON.stringify(source, null, 2)},\n"agents":${JSON.stringify(names)},\n"comps":[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`;
  JSON.parse(text);
  await writeFile(OUT, text, 'utf8');
  console.log(`wrote ${OUT}: ${rows.length} series, ${maps} maps, ${text.length} bytes; skipped ${JSON.stringify(skipped)}`);
}

main().catch((err) => {
  console.error(`data:vlr-comps: ${err.message}`);
  process.exit(1);
});
