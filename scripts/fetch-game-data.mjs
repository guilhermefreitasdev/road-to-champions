#!/usr/bin/env node
// Fetches a reproducible snapshot of Valorant game data (agents, abilities, maps, callouts, weapons)
// from valorant-api.com (unofficial community API, no key) and writes trimmed, deterministically
// ordered JSON to src/data/game/. Node 22+, no dependencies.
// agents.json and maps.json feed the whole game; agent-details.json (English bio, codename, starter flag,
// ability descriptions) and weapons.json (shop data and stats) only feed "Outros modos" (Valdle, jogo clássico).
// The images of those modes are a separate step: scripts/media/valdle.mjs (npm run data:game-media).
//
// Usage: npm run data:game   (or: node scripts/fetch-game-data.mjs)

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://valorant-api.com/v1';
const USER_AGENT =
  'road-to-champions-data-snapshot/1.0 (fan project; offline snapshot script; https://valorant-api.com)';
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'game');

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

async function main() {
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
}

main().catch((err) => {
  console.error(`fetch-game-data: ${err.message}${err.cause ? ` (${err.cause.message ?? err.cause})` : ''}`);
  if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {
    console.error('hint: behind a proxy, run with NODE_USE_ENV_PROXY=1 (Node >= 22.21) so fetch honors HTTPS_PROXY');
  }
  process.exit(1);
});
