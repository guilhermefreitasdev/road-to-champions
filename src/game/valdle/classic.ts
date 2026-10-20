/**
 * "Valdle — Jogo clássico": the facts of the game itself, from the valorant-api.com snapshot in src/data/game, and
 * the five games over them (Agente Clássico, Habilidade, Mapa, Callout, Arma). Pure: built from the data passed in
 * (the snapshot in ./index.ts, fixtures in tests). Every attribute shown is a field of the snapshot or a documented
 * derivation of one (docs/design.md, "Outros modos"):
 * - Origem: the country the official English bio names (AGENT_ORIGINS: the keyword is checked against the bio by the
 *   tests; agents whose bio names no country have none). Continent (for the partial hit) by the UN M49 regions.
 * - Estreia no VCT: the first year the agent appears in a pro map scoreboard of our VLR data (2021 onward).
 * - Automática: the API leaves `fireMode` empty for automatic weapons and says "SemiAutomatic" otherwise.
 */
import { createRng } from '../../engine/rng';
import type { Role } from '../../engine/types';
import { exact, exactOr, numeric, type Column } from './feedback';
import { pickBand, pickOne, type Maker } from './planner';

// --- Input (the snapshot's shapes) ----------------------------------------------------------------------------------

export type AbilitySlot = 'Grenade' | 'Ability1' | 'Ability2' | 'Ultimate' | 'Passive';

export interface ClassicInput {
  agents: readonly {
    name: string;
    displayName: string;
    role: Role;
    displayIcon: string;
    abilities: readonly { slot: AbilitySlot; name: string; displayName: string; displayIcon: string | null }[];
  }[];
  details: readonly {
    name: string;
    descriptionEn: string;
    developerName: string;
    isBaseContent: boolean;
    abilities: readonly { slot: string; description: string }[];
  }[];
  maps: readonly {
    name: string;
    displayName: string;
    displayIcon: string;
    xMultiplier: number;
    yMultiplier: number;
    xScalarToAdd: number;
    yScalarToAdd: number;
    callouts: readonly { regionName: string; superRegionName: string; regionNameEn: string; superRegionNameEn: string; location: { x: number; y: number } }[];
  }[];
  /** Wiki screenshots of callouts (src/data/game/places.json), for the Mapa game. Optional: fixtures may skip it. */
  places?: readonly { map: string; superRegionEn: string; regionEn: string; file: string; source: string }[];
  weapons: readonly {
    name: string;
    displayName: string;
    category: string;
    cost: number;
    fireRate: number;
    magazineSize: number;
    wallPenetration: string;
    fireMode: string | null;
    damageRanges: readonly { headDamage: number; bodyDamage: number }[];
    displayIcon: string;
  }[];
  /** Pro agent usage (VLR): playerId → year → agent → cell; only the years and agent names are read. */
  agentStats: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, unknown>>>>>>;
}

// --- Facts -----------------------------------------------------------------------------------------------------------

export type Continent = 'africa' | 'americas' | 'asia' | 'europe' | 'oceania';

/**
 * The country each agent's official English bio names, with the word that names it (checked by the tests: a new
 * snapshot that changes a bio breaks them, so the table is reviewed). null: the bio names no country.
 */
export const AGENT_ORIGINS: Readonly<Record<string, { keyword: string; country: string } | null>> = {
  Astra: { keyword: 'Ghanaian', country: 'GH' },
  Breach: { keyword: 'Swede', country: 'SE' },
  Brimstone: { keyword: 'U.S.A.', country: 'US' },
  Chamber: { keyword: 'French', country: 'FR' },
  Clove: { keyword: 'Scottish', country: 'GB' },
  Cypher: { keyword: 'Moroccan', country: 'MA' },
  Deadlock: { keyword: 'Norwegian', country: 'NO' },
  Fade: { keyword: 'Turkish', country: 'TR' },
  Gekko: { keyword: 'Angeleno', country: 'US' },
  Harbor: { keyword: 'India', country: 'IN' },
  Iso: { keyword: 'Chinese', country: 'CN' },
  Jett: { keyword: 'South Korea', country: 'KR' },
  'KAY/O': null,
  Killjoy: { keyword: 'Germany', country: 'DE' },
  Miks: { keyword: 'Croatia', country: 'HR' },
  Neon: { keyword: 'Filipino', country: 'PH' },
  Omen: null,
  Phoenix: { keyword: 'U.K.', country: 'GB' },
  Raze: { keyword: 'Brazil', country: 'BR' },
  Reyna: { keyword: 'Mexico', country: 'MX' },
  Sage: { keyword: 'China', country: 'CN' },
  Skye: { keyword: 'Australia', country: 'AU' },
  Sova: { keyword: 'Russia', country: 'RU' },
  Tejo: { keyword: 'Colombia', country: 'CO' },
  Veto: { keyword: 'Senegalese', country: 'SN' },
  Viper: { keyword: 'American', country: 'US' },
  Vyse: null,
  Waylay: { keyword: 'Thailand', country: 'TH' },
  Yoru: { keyword: 'Japanese', country: 'JP' },
};

/** UN M49 macro-regions of the origin countries (Turkey is Western Asia there, Russia Eastern Europe). */
export const CONTINENTS: Readonly<Record<string, Continent>> = {
  GH: 'africa', MA: 'africa', SN: 'africa',
  US: 'americas', BR: 'americas', MX: 'americas', CO: 'americas',
  IN: 'asia', CN: 'asia', KR: 'asia', PH: 'asia', JP: 'asia', TH: 'asia', TR: 'asia',
  SE: 'europe', FR: 'europe', GB: 'europe', NO: 'europe', DE: 'europe', HR: 'europe', RU: 'europe',
  AU: 'oceania',
};

export const CONTINENT_LABELS: Record<Continent, string> = { africa: 'África', americas: 'Américas', asia: 'Ásia', europe: 'Europa', oceania: 'Oceania' };

export const SLOT_KEYS: Record<AbilitySlot, string> = { Grenade: 'C', Ability1: 'Q', Ability2: 'E', Ultimate: 'X', Passive: 'Passiva' };

export interface ClassicAbility {
  slot: AbilitySlot;
  /** pt-BR name. */
  name: string;
  nameEn: string;
  /** pt-BR description (API). */
  description: string;
  /** Remote icon (valorant-api.com media); null for some passives. */
  icon: string | null;
}

export interface ClassicAgent {
  /** English name (stable id across the codebase). */
  id: string;
  /** pt-BR name. */
  name: string;
  role: Role;
  origin: string | null;
  continent: Continent | null;
  /** One of the agents every account starts with (API `isBaseContent`). */
  starter: boolean;
  /** Has a passive ability in the API. */
  passive: boolean;
  /** First year in a pro map scoreboard of the VLR data (null: never played there yet). */
  vctYear: number | null;
  codename: string;
  icon: string;
  abilities: ClassicAbility[];
}

export type WeaponCategory = 'Sidearm' | 'SMG' | 'Shotgun' | 'Rifle' | 'Sniper' | 'Heavy';
export const WEAPON_CATEGORY_LABELS: Record<WeaponCategory, string> = {
  Sidearm: 'Pistola',
  SMG: 'Submetralhadora',
  Shotgun: 'Escopeta',
  Rifle: 'Fuzil',
  Sniper: 'Fuzil de precisão',
  Heavy: 'Arma pesada',
};
export const PENETRATION_LABELS = ['', 'Baixa', 'Média', 'Alta'] as const;

export interface ClassicWeapon {
  id: string;
  name: string;
  category: WeaponCategory;
  cost: number;
  /** Shots per second. */
  fireRate: number;
  magazine: number;
  /** Damage of the first range band (closest). */
  headDamage: number;
  bodyDamage: number;
  /** 1 low, 2 medium, 3 high. */
  penetration: 1 | 2 | 3;
  automatic: boolean;
  icon: string;
}

export interface ClassicCallout {
  /** "<super region EN>|<region EN>": unique within a map. */
  id: string;
  region: string;
  regionEn: string;
  superRegion: string;
  superRegionEn: string;
  /** Position on the minimap image, normalized to [0, 1]. */
  x: number;
  y: number;
}

export interface ClassicMap {
  id: string;
  name: string;
  /** Remote minimap (valorant-api.com media), the callouts' coordinate space. */
  minimap: string;
  callouts: ClassicCallout[];
}

/** A wiki screenshot of one callout (VALORANT Wiki, src/data/game/places.json). */
export interface ClassicPlace {
  /** "<map>:<callout id>". */
  id: string;
  map: string;
  /** ClassicCallout id of the place. */
  callout: string;
  /** Path under public/ (a hash: names neither the map nor the callout). */
  file: string;
  /** The wiki's file page (credit; its name says the place, so only shown after the round). */
  source: string;
}

export interface ClassicData {
  agents: readonly ClassicAgent[];
  weapons: readonly ClassicWeapon[];
  maps: readonly ClassicMap[];
  places: readonly ClassicPlace[];
  placeById: ReadonlyMap<string, ClassicPlace>;
  agentById: ReadonlyMap<string, ClassicAgent>;
  weaponById: ReadonlyMap<string, ClassicWeapon>;
  mapById: ReadonlyMap<string, ClassicMap>;
}

const CATEGORIES: readonly WeaponCategory[] = ['Sidearm', 'SMG', 'Shotgun', 'Rifle', 'Sniper', 'Heavy'];
const PENETRATION: Record<string, 1 | 2 | 3> = { Low: 1, Medium: 2, High: 3 };

export function buildClassicData(input: ClassicInput): ClassicData {
  const vctYear = new Map<string, number>();
  for (const years of Object.values(input.agentStats)) {
    for (const [year, agents] of Object.entries(years)) {
      for (const agent of Object.keys(agents)) vctYear.set(agent, Math.min(vctYear.get(agent) ?? 9999, Number(year)));
    }
  }
  const details = new Map(input.details.map((d) => [d.name, d]));
  const agents: ClassicAgent[] = input.agents.map((a) => {
    const d = details.get(a.name);
    const origin = AGENT_ORIGINS[a.name] ?? null;
    return {
      id: a.name,
      name: a.displayName,
      role: a.role,
      origin: origin?.country ?? null,
      continent: origin ? (CONTINENTS[origin.country] ?? null) : null,
      starter: d?.isBaseContent ?? false,
      passive: a.abilities.some((ab) => ab.slot === 'Passive'),
      vctYear: vctYear.get(a.name) ?? null,
      codename: d?.developerName ?? '',
      icon: a.displayIcon,
      abilities: a.abilities.map((ab) => ({
        slot: ab.slot,
        name: ab.displayName,
        nameEn: ab.name,
        description: d?.abilities.find((x) => x.slot === ab.slot)?.description ?? '',
        icon: ab.displayIcon,
      })),
    };
  });
  const weapons: ClassicWeapon[] = input.weapons
    .filter((w) => (CATEGORIES as string[]).includes(w.category) && w.damageRanges.length > 0)
    .map((w) => ({
      id: w.name,
      name: w.displayName,
      category: w.category as WeaponCategory,
      cost: w.cost,
      fireRate: w.fireRate,
      magazine: w.magazineSize,
      headDamage: w.damageRanges[0]!.headDamage,
      bodyDamage: w.damageRanges[0]!.bodyDamage,
      penetration: PENETRATION[w.wallPenetration] ?? 1,
      automatic: w.fireMode === null,
      icon: w.displayIcon,
    }));
  const maps: ClassicMap[] = input.maps.map((m) => ({
    id: m.name,
    name: m.displayName,
    minimap: m.displayIcon,
    callouts: m.callouts.map((c) => ({
      id: `${c.superRegionNameEn}|${c.regionNameEn}`,
      region: c.regionName,
      regionEn: c.regionNameEn,
      superRegion: c.superRegionName,
      superRegionEn: c.superRegionNameEn,
      // valorant-api.com convention: the image's horizontal axis is world Y (see src/data/game/index.ts).
      x: c.location.y * m.xMultiplier + m.xScalarToAdd,
      y: c.location.x * m.yMultiplier + m.yScalarToAdd,
    })),
  }));
  const mapNames = new Map(input.maps.map((m) => [m.name, m.name] as const).concat(input.maps.map((m) => [m.displayName, m.name] as const)));
  const places: ClassicPlace[] = (input.places ?? []).flatMap((p) => {
    const mapId = mapNames.get(p.map);
    const callout = mapId ? maps.find((m) => m.id === mapId)!.callouts.find((c) => c.superRegionEn === p.superRegionEn && c.regionEn === p.regionEn) : undefined;
    return mapId && callout ? [{ id: `${mapId}:${callout.id}`, map: mapId, callout: callout.id, file: p.file, source: p.source }] : [];
  });
  return {
    agents,
    weapons,
    maps,
    places,
    placeById: new Map(places.map((p) => [p.id, p])),
    agentById: new Map(agents.map((a) => [a.id, a])),
    weaponById: new Map(weapons.map((w) => [w.id, w])),
    mapById: new Map(maps.map((m) => [m.id, m])),
  };
}

/** "Principal do A", "Pátio (meio)", "Surgimento (lado atacante)": a callout as the screens name it (pt-BR, API names). */
export function calloutLabel(c: Pick<ClassicCallout, 'region' | 'superRegion' | 'superRegionEn'>): string {
  if (['A', 'B', 'C'].includes(c.superRegionEn)) return `${c.region} do ${c.superRegion}`;
  return `${c.region} (${c.superRegion.replace(/^no /, '').toLowerCase()})`;
}

/** The English call ("A Main", "Mid Courtyard", "Attacker Side Spawn"), which pros use: also accepted by the search. */
export function calloutLabelEn(c: Pick<ClassicCallout, 'regionEn' | 'superRegionEn'>): string {
  return `${c.superRegionEn} ${c.regionEn}`;
}

// --- Columns ---------------------------------------------------------------------------------------------------------

export const AGENT_COLUMNS: readonly Column<ClassicAgent>[] = [
  { key: 'role', label: 'Função', compare: (g, a) => exact(g.role, a.role) },
  { key: 'origin', label: 'Origem', compare: (g, a) => exactOr(g.origin, a.origin, () => g.continent !== null && g.continent === a.continent) },
  { key: 'vct', label: 'Estreia no VCT', compare: (g, a) => numeric(g.vctYear, a.vctYear, 1) },
  { key: 'starter', label: 'Inicial', compare: (g, a) => exact(g.starter, a.starter) },
  { key: 'passive', label: 'Passiva', compare: (g, a) => exact(g.passive, a.passive) },
];

export const WEAPON_COLUMNS: readonly Column<ClassicWeapon>[] = [
  { key: 'category', label: 'Categoria', compare: (g, a) => exact(g.category, a.category) },
  { key: 'cost', label: 'Preço', compare: (g, a) => numeric(g.cost, a.cost, 300) },
  { key: 'head', label: 'Dano na cabeça', compare: (g, a) => numeric(g.headDamage, a.headDamage, 15) },
  { key: 'rate', label: 'Cadência', compare: (g, a) => numeric(g.fireRate, a.fireRate, 1.5) },
  { key: 'mag', label: 'Pente', compare: (g, a) => numeric(g.magazine, a.magazine, 3) },
  { key: 'pen', label: 'Penetração', compare: (g, a) => numeric(g.penetration, a.penetration) },
  { key: 'auto', label: 'Automática', compare: (g, a) => exact(g.automatic, a.automatic) },
];

// --- Puzzles -------------------------------------------------------------------------------------------------------

export interface AgentePuzzle {
  answer: string;
}
export interface HabilidadePuzzle {
  agent: string;
  slot: AbilitySlot;
  /** Starting rotation of the icon (degrees). Kept so the planned puzzles stay the same; the screen no longer turns it. */
  rotation: 0 | 90 | 180 | 270;
}

/** Habilidade: the icon sits under a 4x4 grid of tiles. */
export const ABILITY_TILES = 16;

/** Tiles open by misses (one at the start; all of them once the puzzle ends). */
export const ABILITY_TILES_OPEN = [1, 3, 5, 8, 11, 14] as const;

/**
 * The tiles uncovered so far (indices 0–15, row-major): a seeded order per puzzle (`valdle:tiles:<date>`, so it is the
 * same for everyone), taking the first ABILITY_TILES_OPEN[misses] of it; every tile once it is over.
 */
export function abilityTiles(puzzle: { id: string }, misses: number, done: boolean): Set<number> {
  if (done) return new Set(Array.from({ length: ABILITY_TILES }, (_, i) => i));
  const rng = createRng(`valdle:tiles:${puzzle.id}`);
  const order = Array.from({ length: ABILITY_TILES }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const n = ABILITY_TILES_OPEN[Math.max(0, Math.min(misses, ABILITY_TILES_OPEN.length - 1))]!;
  return new Set(order.slice(0, n));
}
export interface MapaPuzzle {
  map: string;
  /** Step 2 ("Onde é?"): the callout id the screenshot shows (a ClassicPlace of `map`). */
  place: string;
  /** Point the zoom starts on (fractions of the image). */
  focus: { x: number; y: number };
}
export interface CalloutPuzzle {
  map: string;
  callout: string;
}
export interface ArmaPuzzle {
  answer: string;
}

/**
 * Days before an answer can come back (pools: 29 agents, ~115 abilities, 13 maps, ~300 callouts, ~230 wiki
 * screenshots of 12 maps, 20 weapons). Mapa: the map in `mapa`, the screenshot in `mapaPlace`.
 */
export const CLASSIC_GAPS = { agente: 20, habilidade: 90, mapa: 3, mapaPlace: 180, callout: 180, calloutMap: 3, arma: 12 } as const;

/** Callouts closer than this (in minimap fractions) to another one are never asked: the highlight would be ambiguous. */
export const CALLOUT_MIN_DISTANCE = 0.045;

export function calloutNeighborDistance(map: ClassicMap, c: ClassicCallout): number {
  let best = Infinity;
  for (const o of map.callouts) if (o !== c) best = Math.min(best, Math.hypot(o.x - c.x, o.y - c.y));
  return best;
}

/** Callouts that can be asked: inside the image and not crowded by a neighbour. */
export function askableCallouts(map: ClassicMap): ClassicCallout[] {
  return map.callouts.filter((c) => c.x > 0.02 && c.x < 0.98 && c.y > 0.02 && c.y < 0.98 && calloutNeighborDistance(map, c) >= CALLOUT_MIN_DISTANCE);
}

/** Screenshots the Mapa game can ask: the callout is askable (inside the minimap, not crowded), so "Onde é?" is fair. */
export function mapaPlaces(data: ClassicData): ClassicPlace[] {
  return data.places.filter((p) => {
    const m = data.mapById.get(p.map);
    return !!m && askableCallouts(m).some((c) => c.id === p.callout);
  });
}

/** Maps the Mapa game can ask (those with screenshots), by name: the buttons of "Que mapa é?". */
export function mapaMaps(data: ClassicData): ClassicMap[] {
  const ids = new Set(mapaPlaces(data).map((p) => p.map));
  return data.maps.filter((m) => ids.has(m.id)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function classicMakers(data: ClassicData) {
  const agentIds = data.agents.map((a) => a.id);
  const abilities = data.agents.flatMap((a) => a.abilities.filter((ab) => ab.slot !== 'Passive' && ab.icon).map((ab) => ({ agent: a.id, slot: ab.slot })));
  const mapIds = data.maps.map((m) => m.id);
  const weaponIds = data.weapons.map((w) => w.id);
  const fresh = <T>(xs: readonly T[], key: (t: T) => string, used: ReadonlySet<string>) => {
    const ok = xs.filter((x) => !used.has(key(x)));
    return ok.length ? ok : xs;
  };

  const agente: Maker<AgentePuzzle> = ({ rng, recent }) => {
    const answer = pickOne(rng, fresh(agentIds, (id) => `agent:${id}`, recent(CLASSIC_GAPS.agente)))!;
    return { puzzle: { answer }, keys: [`agent:${answer}`] };
  };
  const habilidade: Maker<HabilidadePuzzle> = ({ rng, recent }) => {
    const usedAgents = recent(4);
    const pool = fresh(abilities, (a) => `ability:${a.agent}:${a.slot}`, recent(CLASSIC_GAPS.habilidade));
    const pick = pickOne(rng, fresh(pool, (a) => `agent:${a.agent}`, usedAgents))!;
    const rotation = ([0, 90, 180, 270] as const)[rng.int(1, 3)]!;
    return { puzzle: { agent: pick.agent, slot: pick.slot, rotation }, keys: [`ability:${pick.agent}:${pick.slot}`, `agent:${pick.agent}`] };
  };
  const places = [...mapaPlaces(data)].sort((a, b) => a.id.localeCompare(b.id));
  const mapa: Maker<MapaPuzzle> = ({ rng, recent }) => {
    // A screenshot not shown in a long while, of a map not asked in the last days (each gap relaxed only if empty).
    const unseen = fresh(places, (p) => `place:${p.id}`, recent(CLASSIC_GAPS.mapaPlace));
    const pick = pickOne(rng, fresh(unseen, (p) => `map:${p.map}`, recent(CLASSIC_GAPS.mapa)))!;
    const focus = { x: 0.25 + 0.5 * rng.next(), y: 0.25 + 0.5 * rng.next() };
    return {
      puzzle: { map: pick.map, place: pick.callout, focus: { x: Math.round(focus.x * 1000) / 1000, y: Math.round(focus.y * 1000) / 1000 } },
      keys: [`map:${pick.map}`, `place:${pick.id}`],
    };
  };
  const callout: Maker<CalloutPuzzle> = ({ rng, recent, level }) => {
    const map = pickOne(rng, fresh(mapIds, (id) => `map:${id}`, recent(CLASSIC_GAPS.calloutMap)))!;
    const m = data.mapById.get(map)!;
    // Easy days ask the sites' callouts first (A/B/C), harder days anything askable.
    const askable = askableCallouts(m).sort((a, b) => Number(!['A', 'B', 'C'].includes(a.superRegionEn)) - Number(!['A', 'B', 'C'].includes(b.superRegionEn)) || a.id.localeCompare(b.id));
    const used = recent(CLASSIC_GAPS.callout);
    const c = pickBand(rng, askable, level, (x, g) => g === 0 || !used.has(`callout:${map}:${x.id}`)) ?? askable[0]!;
    return { puzzle: { map, callout: c.id }, keys: [`map:${map}`, `callout:${map}:${c.id}`] };
  };
  const arma: Maker<ArmaPuzzle> = ({ rng, recent }) => {
    const answer = pickOne(rng, fresh(weaponIds, (id) => `weapon:${id}`, recent(CLASSIC_GAPS.arma)))!;
    return { puzzle: { answer }, keys: [`weapon:${answer}`] };
  };
  return { agente, habilidade, mapa, callout, arma };
}
