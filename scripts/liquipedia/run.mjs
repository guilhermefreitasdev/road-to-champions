#!/usr/bin/env node
// Builds src/data/real/liquipedia/events.json from Liquipedia (VALORANT wiki): per international event,
// each team's roster (players + substitutes), coach/staff and in-game leader, with page titles and
// revision ids for CC-BY-SA attribution. Node 22+, no dependencies.
//
// Usage:
//   NODE_USE_ENV_PROXY=1 node scripts/liquipedia/run.mjs              fetch what is not cached, write JSON
//   node scripts/liquipedia/run.mjs --offline                         cache only (no network)
//   node scripts/liquipedia/run.mjs --event champions-2022[,..]       only these events (others kept as-is)
//   node scripts/liquipedia/run.mjs --refresh                         re-download everything it needs
//
// Requests (see api.mjs): 1 for the event pages, 1 expandtemplates per event (imported rosters or
// squad captains; 30 s apart), ~14 for player/coach pages, ~3 for team pages. A cold run takes ~10 min;
// everything is cached in .cache/liquipedia/, so later runs (and --offline) take a second.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expand, getPages, stats } from './api.mjs';
import {
  expansionSource,
  flagToIso,
  parseExpandedParticipants,
  parseLeagueInfobox,
  parseParticipants,
  parsePlayerInfobox,
  parseTeamInfobox,
  pickCoach,
  resolveIgl,
  squadImportSource,
  titleKey,
} from './parse.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_FILE = join(ROOT, 'src', 'data', 'real', 'liquipedia', 'events.json');
const WIKI = 'https://liquipedia.net/valorant/';

/** International VCT events, completed. Slugs match scripts/vlr (src/data/real/vlr/events/<slug>.json). */
export const EVENTS = [
  { id: 'masters-reykjavik-2021', tier: 'masters', year: 2021, title: 'VALORANT Champions Tour/2021/Stage 2/Masters' },
  { id: 'masters-berlin-2021', tier: 'masters', year: 2021, title: 'VALORANT Champions Tour/2021/Stage 3/Masters' },
  { id: 'champions-2021', tier: 'champions', year: 2021, title: 'VCT/2021/Champions' },
  { id: 'masters-reykjavik-2022', tier: 'masters', year: 2022, title: 'VCT/2022/Stage 1/Masters' },
  { id: 'masters-copenhagen-2022', tier: 'masters', year: 2022, title: 'VCT/2022/Stage 2/Masters' },
  { id: 'champions-2022', tier: 'champions', year: 2022, title: 'VCT/2022/Champions' },
  { id: 'lock-in-sao-paulo-2023', tier: 'masters', year: 2023, title: 'VCT/2023/LOCK IN São Paulo' },
  { id: 'masters-tokyo-2023', tier: 'masters', year: 2023, title: 'VCT/2023/Masters' },
  { id: 'champions-2023', tier: 'champions', year: 2023, title: 'VCT/2023/Champions' },
  { id: 'masters-madrid-2024', tier: 'masters', year: 2024, title: 'VCT/2024/Stage 1/Masters' },
  { id: 'masters-shanghai-2024', tier: 'masters', year: 2024, title: 'VCT/2024/Stage 2/Masters' },
  { id: 'champions-2024', tier: 'champions', year: 2024, title: 'VCT/2024/Champions' },
  { id: 'masters-bangkok-2025', tier: 'masters', year: 2025, title: 'VCT/2025/Stage 1/Masters' },
  { id: 'masters-toronto-2025', tier: 'masters', year: 2025, title: 'VCT/2025/Stage 2/Masters' },
  { id: 'champions-2025', tier: 'champions', year: 2025, title: 'VCT/2025/Champions' },
  { id: 'masters-santiago-2026', tier: 'masters', year: 2026, title: 'VCT/2026/Stage 1/Masters' },
  { id: 'masters-london-2026', tier: 'masters', year: 2026, title: 'VCT/2026/Stage 2/Masters' },
  { id: 'champions-2026', tier: 'champions', year: 2026, title: 'VCT/2026/Champions' },
];

function parseArgs(argv) {
  const args = { offline: false, refresh: false, events: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--offline') args.offline = true;
    else if (a === '--refresh') args.refresh = true;
    else if (a === '--event') args.events.push(...(argv[++i] ?? '').split(',').filter(Boolean));
    else throw new Error(`unknown argument ${a}`);
  }
  const unknown = args.events.filter((e) => !EVENTS.some((ev) => ev.id === e));
  if (unknown.length) throw new Error(`unknown event(s): ${unknown.join(', ')}; known: ${EVENTS.map((e) => e.id).join(', ')}`);
  return args;
}

const isDisambiguation = (wikitext) => /\{\{\s*(disambig|disambiguation)\b/i.test(wikitext ?? '');
const pageUrl = (title) => `${WIKI}${encodeURI(title.replace(/ /g, '_'))}`;
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : 'n/a');

async function readExisting() {
  try {
    return JSON.parse(await readFile(OUT_FILE, 'utf8'));
  } catch {
    return undefined;
  }
}

async function main() {
  const started = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const opts = { offline: args.offline, refresh: args.refresh };
  const selected = args.events.length ? EVENTS.filter((e) => args.events.includes(e.id)) : EVENTS;

  // 1. Event pages (one batched request).
  const eventPages = await getPages(selected.map((e) => e.title), opts);
  const parsed = [];
  for (const ev of selected) {
    const page = eventPages.get(ev.title);
    if (!page || page.missing || page.uncached) {
      console.warn(`! ${ev.id}: page "${ev.title}" ${page?.uncached ? 'not cached (offline)' : 'not found'}`);
      continue;
    }
    let { format, teams, withdrawn, needsExpansion } = parseParticipants(page.content);
    let rosterSource = 'wikitext';
    // 2. Rosters imported from Liquipedia's database are not in the wikitext: expand the participants
    //    block server side (one expandtemplates call per event, 30 s apart, cached by revision).
    if (needsExpansion) {
      const html = await expand(page.title, page.revid, expansionSource(page.content), opts);
      if (!html) {
        console.warn(`! ${ev.id}: imported rosters need expandtemplates (not cached; run online)`);
      } else {
        const expanded = parseExpandedParticipants(html);
        if (expanded.length !== teams.length) {
          throw new Error(`${ev.id}: expanded ${expanded.length} teams, wikitext has ${teams.length}`);
        }
        teams = expanded;
        rosterSource = 'expandtemplates';
      }
    }
    // 3. Captain markers from each team's Liquipedia squad at the event date (only when the event page
    //    itself marks no captain). One more expandtemplates call per event; rosters are NOT taken from it.
    let squadCaptains = null;
    if (!teams.some((t) => t.players.some((p) => p.captain))) {
      const html = await expand(page.title, page.revid, squadImportSource(page.content, teams.map((t) => t.link)), opts);
      const squads = html ? parseExpandedParticipants(html) : [];
      if (squads.length === teams.length) {
        squadCaptains = squads.map((sq) => new Set(sq.players.filter((p) => p.captain && !p.isSub).map((p) => titleKey(p.link))));
      } else {
        console.warn(`! ${ev.id}: squad import ${html ? `returned ${squads.length}/${teams.length} teams` : 'not cached (offline)'}`);
      }
    }
    parsed.push({ ev, page, format, teams, withdrawn, rosterSource, squadCaptains, league: parseLeagueInfobox(page.content) });
  }

  // 4. Player, coach and team pages (batched 50 per request): canonical ids, country, IGL role, VLR ids.
  const personLinks = new Set();
  const teamLinks = new Set();
  for (const { teams } of parsed) {
    for (const t of teams) {
      teamLinks.add(t.link);
      for (const p of t.players) personLinks.add(p.link);
      for (const s of t.staff) personLinks.add(s.link);
    }
  }
  const personPages = await getPages([...personLinks].sort(), opts);
  const teamPages = await getPages([...teamLinks].sort(), opts);

  const sources = new Map(); // title -> revid, for attribution
  const person = (link) => {
    const pg = personPages.get(link);
    if (!pg || pg.missing || pg.uncached || isDisambiguation(pg.content)) return { page: null, info: null };
    sources.set(pg.title, pg.revid);
    return { page: pg, info: parsePlayerInfobox(pg.content) };
  };

  const events = [];
  for (const { ev, page, format, teams, withdrawn, rosterSource, squadCaptains, league } of parsed) {
    sources.set(page.title, page.revid);
    const outTeams = teams.map((t, ti) => {
      const tp = teamPages.get(t.link);
      const teamInfo = tp && !tp.missing && !tp.uncached ? parseTeamInfobox(tp.content) : null;
      if (teamInfo) sources.set(tp.title, tp.revid);
      const players = t.players.map((p) => {
        const { page: pg, info } = person(p.link);
        const out = {
          liquipediaId: pg ? pg.title : null,
          handle: p.id,
          flag: flagToIso(p.flag) ?? info?.flag ?? null,
          isSub: p.isSub,
        };
        if (p.dnp) out.dnp = true;
        if (info?.vlrId) out.vlrPlayerId = info.vlrId;
        return out;
      });
      const staff = t.staff.map((s) => {
        const { page: pg } = person(s.link);
        return { name: s.name, liquipediaId: pg ? pg.title : null, role: s.role };
      });
      const coachRaw = pickCoach(t.staff);
      const coach = coachRaw ? staff[t.staff.indexOf(coachRaw)] : null;
      const isSquadCaptain = (link) => {
        const set = squadCaptains?.[ti];
        return !!set && (set.has(titleKey(link)) || set.has(titleKey(person(link).page?.title)));
      };
      const { igl, iglSource, candidates } = resolveIgl(t.players, (link) => person(link).info?.isIGL, isSquadCaptain);
      const team = {
        name: t.name,
        liquipediaPage: tp && !tp.missing && !tp.uncached ? tp.title : null,
        vlrTeamId: teamInfo?.vlrId ?? null,
        players,
        coach: coach ? { name: coach.name, liquipediaId: coach.liquipediaId } : null,
        staff,
        igl,
        iglSource,
      };
      if (candidates.length) team.iglCandidates = candidates;
      return team;
    });
    events.push({
      id: ev.id,
      name: league?.name ?? ev.title,
      tier: ev.tier,
      year: ev.year,
      startDate: league?.startDate ?? null,
      endDate: league?.endDate ?? null,
      vlrEventId: league?.vlrId ?? null,
      liquipedia: { title: page.title, revid: page.revid, url: pageUrl(page.title), format, rosterSource },
      withdrawn,
      teams: outTeams,
    });
  }

  // Keep events not selected this run (with --event) from the previous file.
  const previous = await readExisting();
  const merged = EVENTS.map(
    (e) => events.find((x) => x.id === e.id) ?? previous?.events?.find((x) => x.id === e.id),
  ).filter(Boolean);
  const prevSources = args.events.length ? (previous?.sources ?? []) : [];
  for (const s of prevSources) if (!sources.has(s.title)) sources.set(s.title, s.revid);

  const output = {
    source: {
      site: 'Liquipedia',
      url: WIKI,
      license: 'CC-BY-SA 3.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
      credit:
        'Elencos, técnicos e IGLs: Liquipedia (liquipedia.net/valorant), licença CC-BY-SA 3.0. Lista de páginas e revisões em "sources".',
      api: 'MediaWiki API (action=query prop=revisions; action=expandtemplates para elencos importados e capitães)',
      generator: 'scripts/liquipedia/run.mjs',
      iglSources: {
        'event-captain': 'Marcado como Captain na página do evento (por evento; mais confiável)',
        'squad-captain': 'Marcado como Captain no elenco do time na Liquipedia na data do evento (banco de transferências)',
        'infobox-unique': 'Único titular com a função IGL no infobox do jogador (função de carreira, não por evento)',
        'infobox-ambiguous': 'Dois ou mais titulares com IGL no infobox: igl = null',
        conflict: 'Captain do elenco diferente do único IGL de infobox: igl = null (os dois em iglCandidates)',
        'event-ambiguous': 'Dois ou mais Captains na página do evento: igl = null',
        none: 'Sem informação: igl = null',
      },
    },
    events: merged,
    sources: [...sources].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([title, revid]) => ({ title, revid })),
  };
  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  // Report.
  let teamsN = 0, coachN = 0, iglN = 0, playersN = 0;
  const bySource = {};
  for (const e of merged) {
    const c = e.teams.filter((t) => t.coach).length;
    const i = e.teams.filter((t) => t.igl).length;
    teamsN += e.teams.length;
    coachN += c;
    iglN += i;
    playersN += e.teams.reduce((n, t) => n + t.players.length, 0);
    for (const t of e.teams) bySource[t.iglSource] = (bySource[t.iglSource] ?? 0) + 1;
    console.log(
      `${e.id.padEnd(24)} ${String(e.teams.length).padStart(2)} teams  coach ${pct(c, e.teams.length).padStart(4)}  igl ${pct(i, e.teams.length).padStart(4)}  ${e.liquipedia.title}`,
    );
  }
  console.log(`events ${merged.length}, teams ${teamsN}, player entries ${playersN}, sources ${output.sources.length}`);
  console.log(`coach ${pct(coachN, teamsN)}, igl ${pct(iglN, teamsN)} (${JSON.stringify(bySource)})`);
  console.log(`requests ${stats.requests}, cache hits ${stats.cacheHits}, ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`wrote ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(`liquipedia: ${err.message}${err.cause ? ` (${err.cause.message ?? err.cause})` : ''}`);
  if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {
    console.error('hint: behind a proxy, run with NODE_USE_ENV_PROXY=1 so fetch honors HTTPS_PROXY');
  }
  process.exit(1);
});
