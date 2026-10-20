#!/usr/bin/env node
// "Acerte o ace" dataset (docs/aces.md): the curated entries of scripts/aces/curated.json (famous pro aces with a
// YouTube video), each checked against the VLR.gg match pages and written to src/data/real/aces.json.
//
// Every fact of an entry comes from the VLR match pages: the 5K itself, its round and the five victims (Performance
// tab popup), the player's agent on that map and a clutch won in that round (Performance row), the map, teams,
// event, series round and date (overview), and the side and score before the round (the overview's round strip).
// The curated file adds only the YouTube video (url, title, how it was checked, embeddable, start/end when a source
// gives them), the pt-BR description, how the video was tied to this 5K, a weapon when a cited source names it, and
// extra source URLs. A curated entry that does not match exactly one 5K in VLR's Performance tab is an error. The
// scraper never calls YouTube: scripts/aces/check-videos.mjs does the oEmbed check.
//
// Usage (node scripts/aces/build.mjs, with NODE_USE_ENV_PROXY=1 behind a proxy):
//   (no flag)      build from the cache only (no network), reading only the curated matches
//   --plan         print what --fetch would download (no network), then build
//   --fetch        first download the missing pages: the overview and Performance tab of every completed series of
//                  the international events of the snapshot (Masters, LOCK//IN, Champions) and of the curated
//                  matches outside them; polite client (scripts/vlr/fetch.mjs), cap --max-new (400)
//   --list         also read every international match and list all its 5Ks in .cache/aces/vlr-5ks.tsv (+ .json),
//                  the curator's index for finding the match of a video

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VlrClient, cachePathFor, proxyHint } from '../vlr/fetch.mjs';
import { agentSlug, isShowmatch, parseMatchList, parseMatchMapStats, parseSeriesPage } from '../vlr/parse.mjs';
import { parseEventTitle, parsePerformance5Ks, parseRoundHistory, roundContext } from './parse.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VLR_DIR = join(ROOT, 'src', 'data', 'real', 'vlr');
const CURATED = join(ROOT, 'scripts', 'aces', 'curated.json');
const OUT = join(ROOT, 'src', 'data', 'real', 'aces.json');
const LIST = join(ROOT, '.cache', 'aces', 'vlr-5ks.tsv');

const perfPath = (path) => `${path}/?game=all&tab=performance`;
const isCached = (p) => existsSync(cachePathFor(p));

function parseArgs(argv) {
  const args = { fetch: false, plan: false, list: false, maxNew: 400 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fetch') args.fetch = true;
    else if (a === '--plan') args.plan = true;
    else if (a === '--list') args.list = true;
    else if (a === '--max-new') args.maxNew = Number(argv[++i]);
    else throw new Error(`unknown argument ${a}`);
  }
  return args;
}

// Neutral id (match, VLR game id, round): it never names the player, since the UI may keep it in the page before the answer.
const aceId = (matchId, gameId, round) => `${matchId}-${gameId}-${round}`;

/** Completed, non-showmatch series of the international events (oldest event first). */
async function internationalSeries(events) {
  const out = [];
  for (const e of [...events].filter((x) => x.tier !== 'regional').sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    const file = cachePathFor(`/event/matches/${e.id}/?series_id=all`);
    if (!existsSync(file)) throw new Error(`match list of ${e.slug} is not cached (run npm run data:vlr first)`);
    for (const m of parseMatchList(await readFile(file, 'utf8'))) {
      if (isShowmatch(m.series) || !/completed/i.test(m.status ?? '')) continue;
      out.push({ id: m.id, path: m.path, eventSlug: e.slug });
    }
  }
  return out;
}

/** Every 5K of one match (needs the overview and the Performance tab cached). */
function matchAces(match, overviewHtml, perfHtml, ctx) {
  const page = parseSeriesPage(overviewHtml);
  const stats = parseMatchMapStats(overviewHtml, ctx.agentBySlug);
  const history = parseRoundHistory(overviewHtml);
  const perf = parsePerformance5Ks(perfHtml);
  const event = ctx.eventsByVlrId.get(page.eventId) ?? null;
  const rows = [];
  const problems = [];
  stats.maps.forEach((m, mapIndex) => {
    const p = perf.maps.find((x) => x.gameId === m.gameId);
    if (!p) return;
    const strip = history.maps.find((x) => x.gameId === m.gameId)?.rounds ?? [];
    const header = page.maps[mapIndex];
    for (const ace of p.aces) {
      const player = m.players.find((x) => x.handle === ace.handle) ?? m.players.find((x) => x.handle?.toLowerCase() === ace.handle?.toLowerCase());
      if (!player) {
        problems.push(`${match.path} ${m.map}: 5K row "${ace.handle}" not on the scoreboard`);
        continue;
      }
      const teamIdx = player.side - 1;
      const team = page.teams[teamIdx];
      const opp = page.teams[1 - teamIdx];
      const agent = ace.agent ? (ctx.agentBySlug[ace.agent] ?? null) : null;
      for (const r of ace.rounds) {
        if (!r.round) {
          problems.push(`${match.path} ${m.map} ${ace.handle}: 5K without a round number`);
          continue;
        }
        const c = roundContext(strip, r.round);
        const clutch = ace.clutches.find((k) => k.round === r.round)?.kind ?? null;
        const flip = (pair) => (pair ? (teamIdx === 0 ? [pair[0], pair[1]] : [pair[1], pair[0]]) : null);
        const finalScore = header?.score ?? null;
        const verified = {
          fiveK: 'vlr-performance',
          round: 'vlr-performance',
          victims: 'vlr-performance',
          agent: agent ? 'vlr-performance' : null,
          clutch: 'vlr-performance',
          map: 'vlr-overview',
          teams: 'vlr-overview',
          event: 'vlr-overview',
        };
        if (c) {
          verified.side = 'vlr-rounds';
          verified.scoreBefore = 'vlr-rounds';
        }
        rows.push({
          id: aceId(match.id, m.gameId, r.round),
          video: false,
          vlrPlayerId: player.playerId,
          playerId: ctx.poolPlayers.has(player.playerId) ? String(player.playerId) : null,
          handle: player.handle,
          team: { vlrId: team.id, slug: team.slug, name: team.name, tag: ace.tag ?? null },
          opponent: { vlrId: opp.id, slug: opp.slug, name: opp.name },
          event: {
            vlrId: page.eventId,
            eventId: event?.slug ?? null,
            name: event?.shortName ?? parseEventTitle(overviewHtml),
            tier: event?.tier ?? null,
            year: event?.year ?? (page.date ? Number(page.date.slice(0, 4)) : null),
          },
          stage: page.stage,
          seriesRound: page.round,
          date: page.date,
          match: {
            vlrId: match.id,
            url: `https://www.vlr.gg${match.path}`,
            bestOf: page.bestOf,
            mapNumber: mapIndex + 1,
            gameId: m.gameId,
          },
          map: m.map,
          round: r.round,
          side: c ? c.sides[teamIdx] : null,
          scoreBefore: c ? flip(c.before) : null,
          roundWon: c ? c.winner === player.side : null,
          clutch,
          mapScore: finalScore ? flip(finalScore) : null,
          agent,
          victims: r.victims.map((v) => ({ handle: v.handle, agent: v.agent ? (ctx.agentBySlug[v.agent] ?? null) : null })),
          weapon: null,
          sources: [`https://www.vlr.gg${perfPath(match.path)}`, `https://www.vlr.gg${match.path}`],
          verified,
        });
      }
    }
  });
  return { rows, problems };
}


/**
 * Does a video title name the player? Same rule as titleNamesPlayer() in src/game/aces/text.ts (the tests check that
 * both agree): a title word equal to the handle or an alias (case/accent-insensitive, leetspeak 0/1/3/4/5 folded), or,
 * for names of 4+ letters, the name inside the title with spaces and punctuation removed.
 */
const fold = (s) =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's');
export function titleNamesPlayer(title, names) {
  const words = fold(title).split(/[^a-z0-9]+/).filter(Boolean);
  const squashed = words.join('');
  return names.some((n) => {
    const f = fold(n).replace(/[^a-z0-9]/g, '');
    return !!f && (words.includes(f) || (f.length >= 4 && squashed.includes(f)));
  });
}

const YT_URL = /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/;
const CHECKS = new Set(['youtube-oembed', 'web-search']);

/** Applies a curated entry (video, description, weapon, sources) to its VLR row; throws when they disagree. */
function applyCurated(row, cur) {
  if (cur.handle.toLowerCase() !== row.handle.toLowerCase()) throw new Error(`${cur.key}: handle ${cur.handle} ≠ VLR ${row.handle}`);
  if (cur.agent && cur.agent !== row.agent) throw new Error(`${cur.key}: agent ${cur.agent} ≠ VLR ${row.agent}`);
  if (!cur.description) throw new Error(`${cur.key}: description missing`);
  const y = cur.youtube;
  if (!y || !YT_URL.test(y.url)) throw new Error(`${cur.key}: bad youtube url`);
  if (!y.title || !CHECKS.has(y.check) || !y.checkedAt) throw new Error(`${cur.key}: youtube check missing (title, check, checkedAt)`);
  if (y.start != null && !(Number.isInteger(y.start) && y.start > 0 && y.startSource)) throw new Error(`${cur.key}: start without a source`);
  if (y.end != null && !(Number.isInteger(y.end) && y.end > (y.start ?? 0) && y.endSource)) throw new Error(`${cur.key}: end without a source (or not after start)`);
  if (y.embeddable !== undefined && y.embeddable !== null && typeof y.embeddable !== 'boolean') throw new Error(`${cur.key}: embeddable must be true, false or null`);
  const names = [row.handle, ...(cur.aliases ?? [])];
  const out = {
    ...row,
    video: true,
    aliases: cur.aliases ?? [],
    description: cur.description,
    youtube: {
      url: y.url,
      videoId: y.url.slice(-11),
      title: y.title,
      channel: y.channel ?? null,
      channelUrl: y.channelUrl ?? null,
      start: y.start ?? null,
      end: y.end ?? null,
      // true/false only from YouTube's oEmbed (scripts/aces/check-videos.mjs); null = not checked yet.
      embeddable: y.embeddable ?? null,
      titleRevealsPlayer: titleNamesPlayer(y.title, names),
      check: y.check,
      checkedAt: y.checkedAt,
    },
    sources: [...new Set([...row.sources, y.url, ...(y.startSource ? [y.startSource] : []), ...(y.endSource ? [y.endSource] : []), ...(cur.sources ?? [])])],
    verified: {
      ...row.verified,
      video: y.check,
      videoMatch: cur.videoMatch,
      ...(y.start ? { start: y.startSource } : {}),
      ...(y.end ? { end: y.endSource } : {}),
      ...(typeof y.embeddable === 'boolean' ? { embeddable: 'youtube-oembed' } : {}),
    },
  };
  if (!cur.videoMatch) throw new Error(`${cur.key}: videoMatch (how the video was tied to this 5K) missing`);
  if (cur.weapon) {
    if (!cur.weapon.source) throw new Error(`${cur.key}: weapon without source`);
    out.weapon = cur.weapon.name;
    out.verified.weapon = cur.weapon.source;
    out.sources = [...new Set([...out.sources, cur.weapon.source])];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = (...m) => console.log(...m);
  const t0 = Date.now();
  const { events } = JSON.parse(await readFile(join(VLR_DIR, 'events.json'), 'utf8'));
  const slim = JSON.parse(await readFile(join(VLR_DIR, 'slim.json'), 'utf8'));
  const agents = JSON.parse(await readFile(join(ROOT, 'src', 'data', 'game', 'agents.json'), 'utf8'));
  const curated = existsSync(CURATED) ? JSON.parse(await readFile(CURATED, 'utf8')).aces : [];
  const ctx = {
    agentBySlug: Object.fromEntries(agents.map((a) => [agentSlug(a.name), a.name])),
    eventsByVlrId: new Map(events.map((e) => [e.id, e])),
    poolPlayers: new Set(slim.flatMap((e) => e.players.map((p) => p.playerId))),
  };
  // KAY/O's icon slug on VLR is "kayo".
  ctx.agentBySlug.kayo ??= 'KAY/O';

  const matches = await internationalSeries(events);
  const known = new Set(matches.map((m) => m.id));
  for (const c of curated) {
    const m = c.match.match(/^https:\/\/www\.vlr\.gg\/(\d+)\/([^/?#]+)/);
    if (!m) throw new Error(`${c.key}: bad VLR match url ${c.match}`);
    if (!known.has(Number(m[1]))) {
      matches.push({ id: Number(m[1]), path: `/${m[1]}/${m[2]}`, eventSlug: null });
      known.add(Number(m[1]));
    }
  }
  const need = matches.flatMap((m) => [m.path, perfPath(m.path)]).filter((p) => !isCached(p));
  log(`${matches.length} matches; ${need.length} pages missing from the cache`);
  if (args.plan || args.fetch) {
    const plan = need.slice(0, args.maxNew);
    log(`plan: ${plan.length} new pages (cap ${args.maxNew})`);
    if (args.fetch && plan.length) {
      const client = new VlrClient({ log: () => {} });
      await client.init();
      for (const [i, p] of plan.entries()) {
        try {
          await client.get(p);
        } catch (err) {
          log(`  skip ${p}: ${err.message}`);
        }
        if ((i + 1) % 25 === 0 || i + 1 === plan.length) log(`  [${i + 1}/${plan.length}] ${p} (${client.requests} requests, ${Math.round((Date.now() - t0) / 1000)} s)`);
      }
    }
  }

  const rows = [];
  const problems = [];
  let parsed = 0;
  // Parsing every page takes a while: without --list only the curated matches are read.
  const curatedMatchIds = new Set(curated.map((c) => Number(c.match.match(/vlr\.gg\/(\d+)/)[1])));
  for (const m of matches) {
    if (!args.list && !curatedMatchIds.has(m.id)) continue;
    if (!isCached(m.path) || !isCached(perfPath(m.path))) continue;
    parsed++;
    const r = matchAces(m, await readFile(cachePathFor(m.path), 'utf8'), await readFile(cachePathFor(perfPath(m.path)), 'utf8'), ctx);
    rows.push(...r.rows);
    problems.push(...r.problems);
  }

  if (args.list) {
    const tsv = rows.map((r) => [r.id, r.event.name, r.seriesRound, r.match.url, r.map, r.round, r.handle, r.team.name, r.opponent.name, r.agent].join('\t'));
    await mkdir(dirname(LIST), { recursive: true });
    await writeFile(LIST, `${tsv.join('\n')}\n`, 'utf8');
    await writeFile(LIST.replace(/\.tsv$/, '.json'), JSON.stringify(rows), 'utf8');
    log(`listed ${rows.length} VLR 5Ks in ${LIST} (+ .json)`);
  }

  // Curated entries: find their VLR row (match + map + player [+ round]); an entry without exactly one is an error.
  const out = [];
  const seen = new Set();
  for (const c of curated) {
    const matchId = Number(c.match.match(/vlr\.gg\/(\d+)/)[1]);
    const hits = rows.filter(
      (r) => r.match.vlrId === matchId && r.map === c.map && r.handle.toLowerCase() === c.handle.toLowerCase() && (c.round === undefined || r.round === c.round),
    );
    if (hits.length !== 1) throw new Error(`${c.key}: ${hits.length} VLR 5Ks match (${c.match} ${c.map} ${c.handle} round ${c.round ?? 'any'})`);
    if (seen.has(hits[0].id)) throw new Error(`${c.key}: duplicate of another curated entry (${hits[0].id})`);
    seen.add(hits[0].id);
    out.push(applyCurated(hits[0], c));
  }
  out.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.match.vlrId - b.match.vlrId || a.match.mapNumber - b.match.mapNumber || a.round - b.round);
  const source = {
    sites: ['VLR.gg', 'YouTube'],
    credit: 'Aces conferidos na aba Performance das partidas do VLR.gg (vlr.gg); vídeos só como link para o YouTube, com crédito ao canal.',
    generator: 'scripts/aces/build.mjs',
    curated: 'scripts/aces/curated.json',
    note: 'One row per curated ace: the 5K, its round, the victims and the agent from the VLR Performance tab; map, teams, event from the overview; side and score before the round from the overview round strip (team of the ace first). youtube.check says how the link was tied to its title (youtube-oembed or web-search). See docs/aces.md.',
    matchesChecked: parsed,
    entries: out.length,
  };
  const text = `{"source":${JSON.stringify(source, null, 2)},\n"aces":[\n${out.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`;
  await writeFile(OUT, text, 'utf8');
  log(`wrote ${OUT}: ${out.length} curated aces (${rows.length} VLR 5Ks in the ${parsed} matches read), ${text.length} bytes`);
  if (problems.length) log(`WARN ${problems.length} problems:\n  ${problems.slice(0, 20).join('\n  ')}`);
}

main().catch((err) => {
  console.error(`data:aces: ${err.message}${err.cause ? ` (${err.cause.message ?? err.cause})` : ''}`);
  const hint = proxyHint();
  if (hint) console.error(hint);
  process.exit(1);
});
