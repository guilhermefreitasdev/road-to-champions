#!/usr/bin/env node
// Fetches a reproducible snapshot of Valorant game data (agents, abilities, maps, callouts, weapons)
// from valorant-api.com (unofficial community API, no key) and writes trimmed, deterministically
// ordered JSON to src/data/game/. Node 22+; the JSON step has no dependencies.
// agents.json and maps.json feed the whole game; agent-details.json (English bio, codename, starter flag,
// ability descriptions) and weapons.json (shop data and stats) only feed "Outros modos" (Valdle, jogo clássico).
//
// Opt-in media step (--media, or --media-only to skip the JSON and work from the committed snapshot): downloads the
// images the Valdle shows from media.valorant-api.com (map minimaps, ability icons, weapon icons), one request at a
// time at least MEDIA_GAP_MS apart, caches the originals in .cache/game-media/ (resumable: a cached file is never
// downloaded again unless --refresh) and writes WebP with alpha (sharp) to public/media/{minimaps,abilities,weapons}/,
// plus the manifest src/data/game/game-media.json (what exists locally + source URL). The game uses a local file
// when the manifest lists it and falls back to the remote URL otherwise (src/data/gameMedia.ts).
//
// Usage: npm run data:game                    snapshot JSON only
//        npm run data:game -- --media         snapshot JSON, then the media step
//        npm run data:game-media              media step only (= --media-only), from the committed JSON
//        media flags: --refresh (download again), --offline (cache only), --only=minimaps,abilities,weapons

import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://valorant-api.com/v1';
const USER_AGENT =
  'road-to-champions-data-snapshot/1.0 (fan project; offline snapshot script; https://valorant-api.com)';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'src', 'data', 'game');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

/** API role assetPath fragment -> our Role. Matching the asset path keeps this language-independent. */
const ROLE_BY_ASSET = {
  Assault: 'duelist',
  Breaker: 'initiator',
  Strategist: 'controller',
  Sentinel: 'sentinel',
};

/** Keybind order: C (Grenade), Q (Ability1), E (Ability2), X (Ultimate), then passive. */
const SLOT_ORDER = ['Grenade', 'Ability1', 'Ability2', 'Ultimate', 'Passive'];

async function getJson(path) {
  const url = `${API}${path}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (res.status !== 200) {
    throw new Error(`GET ${url} failed: HTTP ${res.status} ${res.statusText}`);
  }
  const body = await res.json();
  if (body.status !== 200 || !Array.isArray(body.data)) {
    throw new Error(`GET ${url} returned an unexpected payload (status=${body.status})`);
  }
  return body.data;
}

/** Collapses whitespace (some names contain line breaks, e.g. Astra's ultimate). */
const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : s);
const round2 = (n) => Math.round(n * 100) / 100;
const byString = (key) => (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);

function roleOf(agent) {
  const asset = agent.role?.assetPath ?? '';
  const match = Object.keys(ROLE_BY_ASSET).find((k) => asset.includes(`/${k}_`));
  if (!match) throw new Error(`Unknown role for agent ${agent.displayName}: ${asset}`);
  return ROLE_BY_ASSET[match];
}

function buildAgents(ptAgents, enAgents) {
  const enByUuid = new Map(enAgents.map((a) => [a.uuid, a]));
  const agents = ptAgents.map((pt) => {
    const en = enByUuid.get(pt.uuid);
    if (!en) throw new Error(`Agent ${pt.uuid} missing from English response`);
    const enAbilities = new Map(en.abilities.map((ab) => [ab.slot, ab]));
    const abilities = pt.abilities
      .map((ab) => ({
        slot: ab.slot,
        name: clean(enAbilities.get(ab.slot)?.displayName ?? ab.displayName),
        displayName: clean(ab.displayName),
        displayIcon: ab.displayIcon ?? null,
      }))
      .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || byString('slot')(a, b));
    return {
      uuid: pt.uuid,
      name: clean(en.displayName),
      displayName: clean(pt.displayName),
      role: roleOf(en),
      roleDisplayName: clean(pt.role.displayName),
      description: clean(pt.description),
      displayIcon: pt.displayIcon,
      abilities,
    };
  });
  return agents.sort(byString('name'));
}

/** Standard competitive maps: have a tactical description (sites), minimap transform and callouts. */
function isCompetitive(map) {
  return (
    Boolean(map.tacticalDescription) &&
    map.xMultiplier !== 0 &&
    map.yMultiplier !== 0 &&
    Array.isArray(map.callouts) &&
    map.callouts.length > 0 &&
    Boolean(map.displayIcon)
  );
}

function buildMaps(ptMaps, enMaps) {
  const enByUuid = new Map(enMaps.map((m) => [m.uuid, m]));
  const maps = ptMaps.filter(isCompetitive).map((pt) => {
    const en = enByUuid.get(pt.uuid);
    if (!en) throw new Error(`Map ${pt.uuid} missing from English response`);
    if (en.callouts.length !== pt.callouts.length) {
      throw new Error(`Callout count mismatch between languages for ${en.displayName}`);
    }
    const callouts = pt.callouts.map((c, i) => {
      const e = en.callouts[i];
      if (e.superRegion !== c.superRegion || e.location.x !== c.location.x || e.location.y !== c.location.y) {
        throw new Error(`Callout order differs between languages for ${en.displayName} (index ${i})`);
      }
      return {
        regionName: clean(c.regionName),
        superRegionName: clean(c.superRegionName),
        regionNameEn: clean(e.regionName),
        superRegionNameEn: clean(e.superRegionName),
        location: { x: round2(c.location.x), y: round2(c.location.y) },
      };
    });
    callouts.sort(
      (a, b) => byString('superRegionNameEn')(a, b) || byString('regionNameEn')(a, b) || a.location.x - b.location.x,
    );
    return {
      uuid: pt.uuid,
      name: clean(en.displayName),
      displayName: clean(pt.displayName),
      coordinates: pt.coordinates ?? null,
      displayIcon: pt.displayIcon,
      splash: pt.splash,
      xMultiplier: pt.xMultiplier,
      yMultiplier: pt.yMultiplier,
      xScalarToAdd: pt.xScalarToAdd,
      yScalarToAdd: pt.yScalarToAdd,
      callouts,
    };
  });
  return maps.sort(byString('name'));
}

/** Fields of the agents used only by the Valdle (kept out of agents.json, which the main game bundles). */
function buildAgentDetails(ptAgents, enAgents) {
  const enByUuid = new Map(enAgents.map((a) => [a.uuid, a]));
  const details = ptAgents.map((pt) => {
    const en = enByUuid.get(pt.uuid);
    const enAbilities = new Map(en.abilities.map((ab) => [ab.slot, ab]));
    return {
      name: clean(en.displayName),
      /** Official English bio (the Valdle derives the agent's stated origin from it; see docs/design.md). */
      descriptionEn: clean(en.description),
      /** Riot's internal codename. */
      developerName: clean(en.developerName),
      /** true for the agents every account starts with. */
      isBaseContent: Boolean(en.isBaseContent),
      abilities: pt.abilities
        .map((ab) => ({
          slot: ab.slot,
          name: clean(enAbilities.get(ab.slot)?.displayName ?? ab.displayName),
          displayName: clean(ab.displayName),
          description: clean(ab.description),
        }))
        .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || byString('slot')(a, b)),
    };
  });
  return details.sort(byString('name'));
}

const enumTail = (s) => (typeof s === 'string' && s.includes('::') ? s.split('::').pop() : s || null);

/** Buyable weapons (melee excluded): shop data and the stats the API publishes. */
function buildWeapons(ptWeapons, enWeapons) {
  const enByUuid = new Map(enWeapons.map((w) => [w.uuid, w]));
  const weapons = ptWeapons
    .filter((w) => w.shopData && w.weaponStats)
    .map((pt) => {
      const en = enByUuid.get(pt.uuid);
      const s = pt.weaponStats;
      return {
        uuid: pt.uuid,
        name: clean(en.displayName),
        displayName: clean(pt.displayName),
        /** API category, e.g. "Rifle", "Sidearm" (EEquippableCategory). */
        category: enumTail(pt.category),
        cost: pt.shopData.cost,
        fireRate: round2(s.fireRate),
        magazineSize: s.magazineSize,
        reloadTimeSeconds: round2(s.reloadTimeSeconds),
        equipTimeSeconds: round2(s.equipTimeSeconds),
        /** "Low" | "Medium" | "High". */
        wallPenetration: enumTail(s.wallPenetration),
        /** "SemiAutomatic" or null (the API leaves it empty for automatic weapons). */
        fireMode: enumTail(s.fireMode),
        shotgunPelletCount: s.shotgunPelletCount,
        damageRanges: s.damageRanges.map((r) => ({
          rangeStartMeters: r.rangeStartMeters,
          rangeEndMeters: r.rangeEndMeters,
          headDamage: round2(r.headDamage),
          bodyDamage: round2(r.bodyDamage),
          legDamage: round2(r.legDamage),
        })),
        displayIcon: pt.displayIcon,
      };
    });
  return weapons.sort(byString('name'));
}

async function writeJson(file, data) {
  const path = join(OUT_DIR, file);
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`wrote ${path}`);
}

// ---------------------------------------------------------------- media step (opt-in)

const MEDIA_CACHE = join(ROOT, '.cache', 'game-media');
const MEDIA_MANIFEST = join(OUT_DIR, 'game-media.json');
/** Minimum gap between two image requests (politeness toward a free community CDN). */
const MEDIA_GAP_MS = 1100;
/** Consecutive network-level failures (no HTTP answer) after which the host is taken as unreachable. */
const MEDIA_MAX_NETWORK_FAILURES = 5;
const MEDIA_KINDS = ['minimaps', 'abilities', 'weapons'];

/**
 * Output of each kind. Minimaps keep the 1024 px of the source (the callouts' coordinate space is the whole image,
 * so the framing must never change: resize only, no crop), lossless (flat colors: ~4 KB each). Icons are lossy with
 * full-quality alpha. File names: the map's uuid for minimaps; a short hash of the source URL for icons, so the
 * address of an ability icon never says the agent (the Habilidade game asks exactly that).
 */
const MEDIA_SPECS = {
  minimaps: { size: 1024, webp: { lossless: true, effort: 6 } },
  abilities: { size: 256, webp: { quality: 85, alphaQuality: 100, effort: 6 } },
  weapons: { size: 512, webp: { quality: 85, alphaQuality: 100, effort: 6 } },
};

const sha = (s, n) => createHash('sha256').update(s).digest('hex').slice(0, n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (path) =>
  access(path).then(
    () => true,
    () => false,
  );

/** Every image the Valdle hot-links today, from the snapshot JSON. */
function mediaJobs({ agents, maps, weapons }) {
  const jobs = [];
  for (const m of maps) {
    if (m.displayIcon) jobs.push({ kind: 'minimaps', url: m.displayIcon, label: m.name, file: `media/minimaps/${m.uuid}.webp` });
  }
  for (const a of agents) {
    for (const ab of a.abilities) {
      if (ab.displayIcon) {
        jobs.push({ kind: 'abilities', url: ab.displayIcon, label: `${a.name} ${ab.slot}`, file: `media/abilities/${sha(ab.displayIcon, 12)}.webp` });
      }
    }
  }
  for (const w of weapons) {
    if (w.displayIcon) jobs.push({ kind: 'weapons', url: w.displayIcon, label: w.name, file: `media/weapons/${sha(w.displayIcon, 12)}.webp` });
  }
  return jobs;
}

let lastRequest = 0;
let networkFailures = 0;

const mediaCachePath = (url) => join(MEDIA_CACHE, `${createHash('sha1').update(url).digest('hex')}${url.match(/\.(png|jpe?g|webp)$/i)?.[0] ?? '.bin'}`);

/** The original bytes of `url`: from .cache/game-media/, else one polite GET (retries on 429/5xx/network errors). */
async function mediaOriginal(url, { refresh, offline }) {
  const cached = mediaCachePath(url);
  if (!refresh) {
    try {
      return { buf: await readFile(cached), from: 'cache' };
    } catch {
      // not cached yet
    }
  }
  if (offline) return { error: 'not cached (--offline)' };
  if (networkFailures >= MEDIA_MAX_NETWORK_FAILURES) return { error: 'skipped: host unreachable' };
  for (let attempt = 1; ; attempt++) {
    const wait = lastRequest + MEDIA_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'image/png,image/*' }, signal: AbortSignal.timeout(30_000) });
    } catch (err) {
      if (attempt < 3) {
        await sleep(5_000 * attempt);
        continue;
      }
      networkFailures++;
      return { error: `network: ${err.cause?.message ?? err.message}` };
    }
    networkFailures = 0;
    if (res.status === 200) {
      const buf = Buffer.from(await res.arrayBuffer());
      await mkdir(MEDIA_CACHE, { recursive: true });
      await writeFile(cached, buf);
      return { buf, from: 'download' };
    }
    await res.body?.cancel();
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      const retryAfter = Number(res.headers.get('retry-after')) * 1000 || 0;
      await sleep(Math.max(retryAfter, 15_000 * attempt));
      continue;
    }
    return { error: `HTTP ${res.status}` };
  }
}

async function readSnapshot() {
  const read = async (file) => JSON.parse(await readFile(join(OUT_DIR, file), 'utf8'));
  return { agents: await read('agents.json'), maps: await read('maps.json'), weapons: await read('weapons.json') };
}

async function fetchMedia(snapshot) {
  const sharp = (await import('sharp')).default;
  const opts = { refresh: flag('refresh'), offline: flag('offline') };
  const only = new Set((opt('only') ?? MEDIA_KINDS.join(',')).split(',').filter((k) => MEDIA_KINDS.includes(k)));
  const jobs = mediaJobs(snapshot);
  let previous = {};
  try {
    previous = JSON.parse(await readFile(MEDIA_MANIFEST, 'utf8'));
  } catch {
    // first run
  }
  const manifest = {
    source: {
      site: 'valorant-api.com',
      host: 'media.valorant-api.com',
      credit: 'valorant-api.com (imagens da Riot Games)',
      note: 'Cópias locais (WebP) das imagens que o Valdle mostrava direto da CDN; cada entrada guarda a URL de origem. Sem entrada, o jogo usa a URL remota.',
      generator: 'scripts/fetch-game-data.mjs --media',
    },
    minimaps: {},
    abilities: {},
    weapons: {},
  };
  const summary = Object.fromEntries(MEDIA_KINDS.map((k) => [k, { total: 0, downloaded: 0, cached: 0, kept: 0, failed: [] }]));
  let bytes = 0;
  for (const job of jobs) {
    const sum = summary[job.kind];
    sum.total++;
    const out = join(ROOT, 'public', job.file);
    const old = previous[job.kind]?.[job.url];
    if (!only.has(job.kind)) {
      // Not asked this run: keep what the last run made, if the file is still there.
      if (old && (await exists(join(ROOT, 'public', old.file)))) {
        manifest[job.kind][job.url] = old;
        sum.kept++;
      }
      continue;
    }
    const got = await mediaOriginal(job.url, opts);
    let entry = null;
    if (got.buf) {
      try {
        const spec = MEDIA_SPECS[job.kind];
        await mkdir(dirname(out), { recursive: true });
        const info = await sharp(got.buf)
          .resize({ width: spec.size, height: spec.size, fit: 'inside', withoutEnlargement: true })
          .webp(spec.webp)
          .toFile(out);
        bytes += info.size;
        entry = { file: job.file, label: job.label, width: info.width, height: info.height };
        sum[got.from === 'cache' ? 'cached' : 'downloaded']++;
      } catch (err) {
        got.error = `not an image (${err.message})`;
        await rm(mediaCachePath(job.url), { force: true }); // a broken download is fetched again next run
      }
    }
    if (!entry) {
      // A failure this run never loses a file made before (the host may be down for a while).
      if (old && (await exists(join(ROOT, 'public', old.file)))) {
        entry = old;
        sum.kept++;
      } else {
        sum.failed.push({ label: job.label, error: got.error });
      }
    }
    if (entry) manifest[job.kind][job.url] = entry;
    if (sum.total % 25 === 0) console.log(`  ${job.kind}: ${sum.total} processed`);
  }
  // Files of ours that no entry points to any more (map or ability removed from the game) are deleted.
  const wanted = new Set(MEDIA_KINDS.flatMap((k) => Object.values(manifest[k]).map((e) => e.file)));
  let removed = 0;
  for (const kind of MEDIA_KINDS) {
    const dir = join(ROOT, 'public', 'media', kind);
    for (const name of await readdir(dir).catch(() => [])) {
      if (name.endsWith('.webp') && !wanted.has(`media/${kind}/${name}`)) {
        await rm(join(dir, name));
        removed++;
      }
    }
  }
  for (const kind of MEDIA_KINDS) manifest[kind] = Object.fromEntries(Object.entries(manifest[kind]).sort(([a], [b]) => (a < b ? -1 : 1)));
  await writeJson('game-media.json', manifest);

  console.log('\nmedia summary (media.valorant-api.com -> public/media/):');
  for (const kind of MEDIA_KINDS) {
    const s = summary[kind];
    const local = Object.keys(manifest[kind]).length;
    console.log(
      `  ${kind.padEnd(9)} ${String(local).padStart(3)}/${s.total} local  (downloaded ${s.downloaded}, from cache ${s.cached}, kept from before ${s.kept}, failed ${s.failed.length})`,
    );
    const byError = Map.groupBy(s.failed, (f) => f.error);
    for (const [error, list] of byError) {
      const names = list.slice(0, 4).map((f) => f.label).join(', ');
      console.log(`    ! ${list.length} x ${error} (${names}${list.length > 4 ? ', ...' : ''})`);
    }
  }
  console.log(`  written: ${(bytes / 1024).toFixed(0)} KB of WebP; stale files removed: ${removed}`);
  if (networkFailures >= MEDIA_MAX_NETWORK_FAILURES) {
    console.log('  media.valorant-api.com did not answer: run again later (cached files are kept, nothing is downloaded twice).');
  }
  console.log('  commit: public/media/minimaps public/media/abilities public/media/weapons src/data/game/game-media.json');
  return Object.values(summary).some((s) => s.failed.length > 0) ? 2 : 0;
}

async function main() {
  if (flag('media-only')) {
    process.exitCode = await fetchMedia(await readSnapshot());
    return;
  }
  // Sequential requests on purpose: be polite to a free community API.
  const ptAgents = await getJson('/agents?isPlayableCharacter=true&language=pt-BR');
  const enAgents = await getJson('/agents?isPlayableCharacter=true&language=en-US');
  const ptMaps = await getJson('/maps?language=pt-BR');
  const enMaps = await getJson('/maps?language=en-US');
  const ptWeapons = await getJson('/weapons?language=pt-BR');
  const enWeapons = await getJson('/weapons?language=en-US');

  const agents = buildAgents(ptAgents, enAgents);
  const maps = buildMaps(ptMaps, enMaps);
  const excluded = ptMaps.filter((m) => !isCompetitive(m)).map((m) => enMaps.find((e) => e.uuid === m.uuid)?.displayName);

  await mkdir(OUT_DIR, { recursive: true });
  await writeJson('agents.json', agents);
  await writeJson('maps.json', maps);
  await writeJson('agent-details.json', buildAgentDetails(ptAgents, enAgents));
  const weapons = buildWeapons(ptWeapons, enWeapons);
  await writeJson('weapons.json', weapons);

  const calloutCount = maps.reduce((n, m) => n + m.callouts.length, 0);
  console.log(`${agents.length} agents, ${maps.length} maps, ${calloutCount} callouts, ${weapons.length} weapons`);
  console.log(`maps kept: ${maps.map((m) => m.name).join(', ')}`);
  console.log(`maps excluded: ${excluded.join(', ')}`);
  if (flag('media')) process.exitCode = await fetchMedia({ agents, maps, weapons });
}

main().catch((err) => {
  console.error(`fetch-game-data: ${err.message}${err.cause ? ` (${err.cause.message ?? err.cause})` : ''}`);
  if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {
    console.error('hint: behind a proxy, run with NODE_USE_ENV_PROXY=1 (Node >= 22.21) so fetch honors HTTPS_PROXY');
  }
  process.exit(1);
});
