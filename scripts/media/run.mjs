#!/usr/bin/env node
// Media pipeline: map images, agent icons, team logos (of the event's era when Liquipedia has them) and
// player photos, downloaded through the Liquipedia MediaWiki API (imageinfo URLs, 1 request / 2 s, same
// client and cache as scripts/liquipedia), resized with sharp and committed under public/media/ as WebP.
// Also regenerates src/data/currentMapPool.ts from Liquipedia's "Portal:Maps".
//
// Usage: npm run data:media -- [--offline] [--refresh] [--only=maps,agents,teams,players,pool]
// Offline: only the on-disk cache is used; what is not cached is reported and left out.
// Every image keeps its source (file page URL) in the JSON so credit can be shown and removal honoured.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { expand, getFile, getPages, imageInfo, stats } from '../liquipedia/api.mjs';
import { expansionSource, findTemplates, parseParticipants, parseTemplate, squadImportSource, titleKey } from '../liquipedia/parse.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'public', 'media');
const GAME_DIR = join(ROOT, 'src', 'data', 'game');
const REAL_DIR = join(ROOT, 'src', 'data', 'real');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const opts = { offline: flag('offline'), refresh: flag('refresh') };
const only = new Set((opt('only') ?? 'maps,agents,pool,teams,players').split(','));

const LP = 'https://liquipedia.net';
const CREDIT = 'Liquipedia (liquipedia.net/valorant), CC-BY-SA 3.0';

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const writeJson = async (file, data) => {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`wrote ${file}`);
};
const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
const slug = (s) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const fileTitle = (name) => `File:${name.replace(/_/g, ' ').trim()}`;

/** Infobox param of a page (e.g. `image`), or null. */
function infoboxParam(wikitext, template, key) {
  const raw = findTemplates(wikitext, template)[0];
  if (!raw) return null;
  const v = parseTemplate(raw).params[key]?.trim();
  return v || null;
}

/** Downloads one Liquipedia file (thumbnail of `width` when the server offers one) and writes a WebP. */
async function fetchImage(info, out, { width, height, fit = 'cover', position = 'centre', quality = 80 }) {
  let buf;
  try {
    buf = await getFile(info.thumburl ?? info.url, opts);
  } catch (err) {
    // One bad file (network error after retries, broken image) must not lose the whole run: skip it and go on.
    console.warn(`! ${info.title}: ${err.message}`);
    return false;
  }
  if (!buf) return false;
  await mkdir(dirname(out), { recursive: true });
  await sharp(buf)
    .resize({ width, height, fit, position, withoutEnlargement: !height })
    .webp({ quality, effort: 6 })
    .toFile(out);
  return true;
}

const sourceOf = (info) => ({ source: 'liquipedia', sourceUrl: info.descriptionurl, file: info.title.replace(/^File:/, ''), credit: CREDIT });

// ---------------------------------------------------------------- maps & agents

async function buildMaps(maps) {
  const pages = await getPages(maps.map((m) => m.name), opts);
  const titles = new Map();
  for (const m of maps) {
    const image = infoboxParam(pages.get(m.name)?.content ?? '', 'Infobox map', 'image');
    if (image) titles.set(m.name, fileTitle(image));
    else console.warn(`! map ${m.name}: no infobox image`);
  }
  const infos = await imageInfo([...titles.values()], { ...opts, width: 640 });
  const out = {};
  for (const m of maps) {
    const info = infos.get(titles.get(m.name));
    if (!info?.url) continue;
    const rel = `media/maps/${slug(m.name)}.webp`;
    if (await fetchImage(info, join(ROOT, 'public', rel), { width: 640, height: 360, quality: 78 })) {
      out[m.name] = { image: rel, ...sourceOf(info) };
    }
  }
  return out;
}

/** Current icon file per agent from Module:CharacterIcon/Data (the entry without endDate). */
function parseCharacterIcons(lua) {
  const out = {};
  for (const m of lua.matchAll(/\['([^']+)'\]\s*=\s*\{([\s\S]*?)\n\t\}/g)) {
    const entries = [...m[2].matchAll(/\{([^{}]*)\}/g)].map((e) => ({
      file: e[1].match(/file = '([^']+)'/)?.[1],
      endDate: e[1].match(/endDate = '([^']+)'/)?.[1],
      display: e[1].match(/display = '([^']+)'/)?.[1],
    }));
    const current = entries.find((e) => e.file && !e.endDate) ?? entries[0];
    if (current?.file && current.display) out[current.display] = current.file;
  }
  return out;
}

async function buildAgents(agents) {
  const mod = (await getPages(['Module:CharacterIcon/Data'], opts)).get('Module:CharacterIcon/Data');
  const icons = parseCharacterIcons(mod?.content ?? '');
  const titles = new Map();
  for (const a of agents) {
    if (icons[a.name]) titles.set(a.name, fileTitle(icons[a.name]));
    else console.warn(`! agent ${a.name}: no icon in Module:CharacterIcon/Data`);
  }
  const infos = await imageInfo([...titles.values()], opts);
  const out = {};
  for (const a of agents) {
    const info = infos.get(titles.get(a.name));
    if (!info?.url) continue;
    const rel = `media/agents/${slug(a.name)}.webp`;
    if (await fetchImage(info, join(ROOT, 'public', rel), { width: 64, height: 64, quality: 82 })) {
      out[a.name] = { icon: rel, ...sourceOf(info) };
    }
  }
  return out;
}

// ---------------------------------------------------------------- current map pool

/** The "Current Competitive Map Pool" list of Portal:Maps. */
export function parseCurrentMapPool(wikitext) {
  const i = wikitext.search(/Current Competitive Map Pool/i);
  if (i < 0) return [];
  const block = wikitext.slice(i, wikitext.indexOf('{{box|end}}', i));
  return [...block.matchAll(/^:\*\s*\[\[([^\]|]+)/gm)].map((m) => m[1].trim());
}

async function buildMapPool(knownMaps) {
  const page = (await getPages(['Portal:Maps'], opts)).get('Portal:Maps');
  if (!page?.content) throw new Error('Portal:Maps not available');
  const pool = parseCurrentMapPool(page.content);
  const unknown = pool.filter((m) => !knownMaps.includes(m));
  if (pool.length !== 7 || unknown.length) throw new Error(`unexpected map pool ${JSON.stringify(pool)} (unknown: ${unknown})`);
  const ts = `
/**
 * Current competitive map pool, from Liquipedia's "Portal:Maps" ("Current Competitive Map Pool").
 * Generated by scripts/media/run.mjs — do not edit by hand. See docs/data.md.
 */
import type { MapName } from '../engine/types';

export const CURRENT_MAP_POOL: readonly MapName[] = ${JSON.stringify(pool)};

export const CURRENT_MAP_POOL_SOURCE = {
  site: 'Liquipedia',
  page: 'Portal:Maps',
  url: '${LP}/valorant/Portal:Maps',
  revid: ${page.revid},
  /** Date of the page revision used (ISO 8601). */
  revisionDate: '${page.timestamp.slice(0, 10)}',
  credit: '${CREDIT}',
} as const;
`.trimStart();
  await writeFile(join(ROOT, 'src', 'data', 'currentMapPool.ts'), ts, 'utf8');
  console.log(`map pool: ${pool.join(', ')} (Portal:Maps rev ${page.revid}, ${page.timestamp.slice(0, 10)})`);
}

// ---------------------------------------------------------------- VLR ↔ Liquipedia matching (as cards.ts)

const normHandle = (s) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const samePlayer = (p, vlr) => p.vlrPlayerId === String(vlr.playerId) || normHandle(p.handle) === normHandle(vlr.handle);

function matchTeam(lpEvent, mains) {
  let best = null;
  let shared = 0;
  for (const t of lpEvent?.teams ?? []) {
    const n = mains.filter((m) => t.players.some((p) => samePlayer(p, m))).length;
    if (n > shared) [best, shared] = [t, n];
  }
  return shared >= 3 ? best : null;
}

/** Rosters the game uses: { key, teamId, eventId, vlrTeam, lpTeam, mains }, same ids as cards.ts. */
async function loadRosters() {
  const dir = join(REAL_DIR, 'vlr', 'events');
  const events = await Promise.all((await readdir(dir)).filter((f) => f.endsWith('.json')).map((f) => readJson(join(dir, f))));
  events.sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? '') || a.slug.localeCompare(b.slug));
  const lp = (await readJson(join(REAL_DIR, 'liquipedia', 'events.json'))).events;
  const lpById = new Map(lp.map((e) => [e.id, e]));
  const idsBySlug = new Map();
  for (const e of events) for (const t of e.teams) idsBySlug.set(t.slug, (idsBySlug.get(t.slug) ?? new Set()).add(t.id));
  const teamIdOf = (t) => ((idsBySlug.get(t.slug)?.size ?? 1) > 1 ? `${t.slug}-${t.id}` : t.slug);
  const rosters = [];
  for (const event of events) {
    const byId = new Map(event.players.map((p) => [p.playerId, p]));
    for (const team of event.teams) {
      if (!team.played) continue;
      const mains = team.players.filter((p) => p.main).map((p) => byId.get(p.playerId)).filter(Boolean);
      if (mains.length !== 5 || mains.some((p) => (p.rounds ?? 0) < 30)) continue;
      const lpTeam = matchTeam(lpById.get(event.slug), mains);
      rosters.push({ key: `${teamIdOf(team)}-${event.slug}`, teamId: teamIdOf(team), eventId: event.slug, event, vlrTeam: team, lpTeam, mains });
    }
  }
  return { rosters, lp, events };
}

// ---------------------------------------------------------------- team logos

/** Team icons in an expanded participants block: Map<pageTitleKey, { light, dark, all }>. */
export function parseTeamIcons(html) {
  const out = new Map();
  const re = /<span class="team-template-image-icon( team-template-(?:light|dark)mode)?">\[\[File:([^|\]]+)\|[^\]]*?link=([^|\]]*)/g;
  for (const m of html.matchAll(re)) {
    const key = titleKey(m[3]);
    const entry = out.get(key) ?? {};
    const file = m[2].trim();
    if (/filler|placeholder/i.test(file)) continue;
    if (m[1]?.includes('dark')) entry.dark = file;
    else if (m[1]?.includes('light')) entry.light = file;
    else entry.all = file;
    out.set(key, entry);
  }
  return out;
}

async function buildTeams({ rosters, lp }) {
  const eventPages = await getPages(lp.map((e) => e.liquipedia.title), opts);
  // 1. Era logos: the team icons Liquipedia renders for the event (team templates resolve by date).
  const eraIcons = new Map(); // eventId -> Map<pageKey, icons>
  for (const e of lp) {
    const page = eventPages.get(e.liquipedia.title);
    if (!page?.content) continue;
    const { teams, needsExpansion } = parseParticipants(page.content);
    // Same texts as scripts/liquipedia/run.mjs, so the expansions are already cached; a new event costs one call.
    const hasCaptain = teams.some((t) => t.players.some((p) => p.captain));
    const text = needsExpansion ? expansionSource(page.content) : hasCaptain ? expansionSource(page.content) : squadImportSource(page.content, teams.map((t) => t.link));
    const html = await expand(page.title, page.revid, text, opts);
    if (!html) {
      console.warn(`! ${e.id}: participants expansion not cached (offline); era logos skipped`);
      continue;
    }
    eraIcons.set(e.id, parseTeamIcons(html));
  }
  // 2. Current logos from the team pages' infobox (already cached by the Liquipedia run).
  const teamPages = await getPages([...new Set(rosters.map((r) => r.lpTeam?.liquipediaPage).filter(Boolean))].sort(), opts);
  const pick = (icons) => icons?.dark ?? icons?.all ?? icons?.light ?? null;
  const wanted = new Map(); // key -> { file, eraSpecific }
  for (const r of rosters) {
    if (!r.lpTeam) continue;
    const era = pick(eraIcons.get(r.eventId)?.get(titleKey(r.lpTeam.liquipediaPage)));
    if (era) {
      wanted.set(r.key, { file: era, eraSpecific: true });
      continue;
    }
    const page = teamPages.get(r.lpTeam.liquipediaPage)?.content ?? '';
    const current = infoboxParam(page, 'Infobox team', 'imagedark') ?? infoboxParam(page, 'Infobox team', 'image');
    if (current) wanted.set(r.teamId, { file: current, eraSpecific: false });
  }
  const infos = await imageInfo([...new Set([...wanted.values()].map((w) => fileTitle(w.file)))].sort(), { ...opts, width: 96 });
  const out = {};
  for (const [key, w] of wanted) {
    const info = infos.get(fileTitle(w.file));
    if (!info?.url) {
      console.warn(`! logo ${key}: ${w.file} not found`);
      continue;
    }
    const rel = `media/teams/${slug(`${key}`)}.webp`;
    if (await fetchImage(info, join(ROOT, 'public', rel), { width: 96, height: 96, fit: 'inside', quality: 85 })) {
      out[key] = { logo: rel, eraSpecific: w.eraSpecific, ...sourceOf(info) };
    }
  }
  return out;
}

// ---------------------------------------------------------------- player photos

/** Normalized tokens that identify a photo taken at each event (all must appear; a year in the name must match). */
const EVENT_TOKENS = {
  'masters-reykjavik-2021': [['reykjav', '2021']],
  'masters-berlin-2021': [['masters', 'berlin']],
  'champions-2021': [['champion', '2021']],
  'masters-reykjavik-2022': [['reykjav', '2022']],
  'masters-copenhagen-2022': [['copenhagen']],
  'champions-2022': [['champion', '2022'], ['istanbul']],
  'lock-in-sao-paulo-2023': [['lockin']],
  'masters-tokyo-2023': [['tokyo']],
  'champions-2023': [['champion', '2023']],
  'masters-madrid-2024': [['madrid']],
  'masters-shanghai-2024': [['shanghai', '2024'], ['masters', 'shanghai']],
  'champions-2024': [['champion', '2024'], ['seoul']],
  'masters-bangkok-2025': [['bangkok']],
  'masters-toronto-2025': [['toronto']],
  'champions-2025': [['champion', '2025'], ['paris']],
  'masters-santiago-2026': [['santiago']],
  'masters-london-2026': [['masters', 'london']],
  'champions-2026': [['champion', '2026'], ['shanghai', '2026']],
};

/** Image file names mentioned anywhere on a page (links and <gallery> lines). */
export function pageImageFiles(wikitext) {
  const files = new Set();
  for (const m of wikitext.matchAll(/(?:File|Image):([^|\]\n]+\.(?:jpe?g|png|webp))/gi)) files.add(m[1].trim());
  for (const m of wikitext.matchAll(/^\s*([^|\n:=]+\.(?:jpe?g|png|webp))\s*(?:\||$)/gim)) files.add(m[1].trim());
  return [...files];
}

/** A photo of the player at this event, by file name, or null. */
export function eraPhoto(files, eventId, year) {
  const rules = EVENT_TOKENS[eventId] ?? [];
  for (const f of files) {
    const n = normHandle(f.replace(/\.[a-z]+$/i, ''));
    const years = n.match(/20\d\d/g) ?? [];
    if (years.some((y) => Number(y) !== year)) continue;
    if (rules.some((tokens) => tokens.every((t) => n.includes(t)))) return f;
  }
  return null;
}

async function buildPlayers({ rosters }) {
  // One photo per card player: era-specific when the player's page has one for that event, else the infobox photo.
  const lpIds = new Set();
  const wants = []; // { playerId, lpId, eventId, year }
  const seen = new Set();
  for (const r of rosters) {
    if (!r.lpTeam) continue;
    for (const vlr of r.mains) {
      const lp = r.lpTeam.players.find((p) => p.vlrPlayerId === String(vlr.playerId)) ?? r.lpTeam.players.find((p) => normHandle(p.handle) === normHandle(vlr.handle));
      if (!lp) continue;
      const k = `${vlr.playerId}@${r.eventId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      lpIds.add(lp.liquipediaId);
      wants.push({ playerId: String(vlr.playerId), lpId: lp.liquipediaId, eventId: r.eventId, year: r.event.year, handle: vlr.handle });
    }
  }
  const pages = await getPages([...lpIds].sort(), opts);
  const chosen = new Map(); // key (playerId or playerId@event) -> { file, eraSpecific, lpId }
  for (const w of wants) {
    const content = pages.get(w.lpId)?.content ?? '';
    const era = eraPhoto(pageImageFiles(content), w.eventId, w.year);
    if (era) chosen.set(`${w.playerId}@${w.eventId}`, { file: era, eraSpecific: true, lpId: w.lpId });
    else if (!chosen.has(w.playerId)) {
      const current = infoboxParam(content, 'Infobox player', 'image');
      if (current) chosen.set(w.playerId, { file: current, eraSpecific: false, lpId: w.lpId });
    }
  }
  const infos = await imageInfo([...new Set([...chosen.values()].map((c) => fileTitle(c.file)))].sort(), { ...opts, width: 160 });
  const out = {};
  for (const [key, c] of chosen) {
    const info = infos.get(fileTitle(c.file));
    if (!info?.url) {
      console.warn(`! photo ${key} (${c.lpId}): ${c.file} not found`);
      continue;
    }
    const rel = `media/players/${slug(key)}.webp`;
    if (await fetchImage(info, join(ROOT, 'public', rel), { width: 128, height: 128, position: 'attention', quality: 74 })) {
      out[key] = { photo: rel, eraSpecific: c.eraSpecific, liquipediaId: c.lpId, ...sourceOf(info) };
    }
  }
  return out;
}

// ---------------------------------------------------------------- main

async function main() {
  const maps = await readJson(join(GAME_DIR, 'maps.json'));
  const agents = await readJson(join(GAME_DIR, 'agents.json'));
  const gameMediaFile = join(GAME_DIR, 'media.json');
  const realMediaFile = join(REAL_DIR, 'media.json');
  const gameMedia = (await readJson(gameMediaFile).catch(() => null)) ?? { source: {}, maps: {}, agents: {} };
  const realMedia = (await readJson(realMediaFile).catch(() => null)) ?? { source: {}, teams: {}, players: {} };
  const source = {
    site: 'Liquipedia',
    credit: CREDIT,
    license: 'https://creativecommons.org/licenses/by-sa/3.0/',
    note: 'Imagens baixadas pela API da Liquipedia (imageinfo) e redimensionadas; cada entrada guarda a página do arquivo. Retiramos qualquer imagem a pedido do titular.',
    generator: 'scripts/media/run.mjs',
  };

  if (only.has('maps')) gameMedia.maps = sortKeys(await buildMaps(maps));
  if (only.has('agents')) gameMedia.agents = sortKeys(await buildAgents(agents));
  if (only.has('maps') || only.has('agents')) await writeJson(gameMediaFile, { source, maps: gameMedia.maps, agents: gameMedia.agents });
  if (only.has('pool')) await buildMapPool(maps.map((m) => m.name));

  if (only.has('teams') || only.has('players')) {
    const data = await loadRosters();
    if (only.has('teams')) realMedia.teams = sortKeys(await buildTeams(data));
    await writeJson(realMediaFile, { source, teams: realMedia.teams, players: realMedia.players });
    if (only.has('players')) realMedia.players = sortKeys(await buildPlayers(data));
    await writeJson(realMediaFile, { source, teams: realMedia.teams, players: realMedia.players });
  }

  const count = (o) => Object.keys(o).length;
  const era = (o, k) => Object.values(o).filter((v) => v.eraSpecific).length;
  console.log(
    `maps ${count(gameMedia.maps)}, agents ${count(gameMedia.agents)}, logos ${count(realMedia.teams)} (${era(realMedia.teams)} da época), ` +
      `photos ${count(realMedia.players)} (${era(realMedia.players)} da época); ${stats.requests} requests, ${stats.cacheHits} cache hits`,
  );
}

main().catch((err) => {
  console.error(`media: ${err.stack ?? err.message}`);
  if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
    console.error('hint: behind a proxy, run with NODE_USE_ENV_PROXY=1 (Node >= 22.21) so fetch honors HTTPS_PROXY');
  }
  process.exit(1);
});
