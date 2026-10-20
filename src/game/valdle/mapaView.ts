/**
 * What the Mapa game may show at each moment, as plain data (the screen renders only this). It is the no-spoiler
 * guarantee in one place: before the map is known (step 1, "Que mapa é?") the view carries no map name, no minimap and
 * no callout (only the zoomed screenshot under its hashed file name, a neutral alt and the map buttons); the callouts
 * appear as answer chips in step 2 ("Onde é?"); the place's name and the wiki file page only at the very end. Pure.
 */
import { calloutLabel, calloutLabelEn, mapaMaps, type ClassicCallout, type ClassicData, type ClassicMap } from './classic';
import { VALDLE_GAMES } from './games';
import { isDone, mapaStepOneDone, misses, type ValdleProgress, type ValdlePuzzle } from './play';

/** Zoom of the screenshot in step 1, by misses (it backs away at every wrong map). */
export const MAPA_ZOOM = [3.6, 2.8, 2.1, 1.6, 1.25] as const;

/** Mid-range of the distance feedback of "Onde é?" (minimap fractions), as in the Callout game. */
export const MAPA_NEAR = 0.18;

export type MapaStep = 'map' | 'where' | 'done';

export interface MapaChoice {
  id: string;
  name: string;
  state: 'open' | 'miss';
}

export interface MapaChip {
  /** Callout id. */
  id: string;
  /** Full names (aria-label, title, the guesses list) and the compact ones drawn on narrow stages. */
  pt: string;
  en: string;
  ptShort: string;
  enShort: string;
  /** Position on the minimap (fractions). */
  x: number;
  y: number;
  /** open: can be picked; miss / hit: picked; answer: revealed at the end without having been found. */
  state: 'open' | 'miss' | 'hit' | 'answer';
}

export interface MapaSpot {
  id: string;
  pt: string;
  en: string;
  hit: boolean;
  sameRegion: boolean;
  near: boolean;
}

export interface MapaView {
  step: MapaStep;
  image: { file: string | null; alt: string; zoom: number; focus: { x: number; y: number }; grayscale: boolean };
  /** Step 1: the maps that have screenshots, as buttons (empty once the map is known). */
  choices: MapaChoice[];
  /** Maps guessed in step 1, in order. */
  mapGuesses: { id: string; name: string; hit: boolean }[];
  mapTries: { used: number; max: number };
  /** The map, once step 1 is over (null before: nothing may name or draw it). */
  map: { id: string; name: string; minimap: string; won: boolean } | null;
  /** Step 2 and the end: one chip per callout of the map, in reading order (top to bottom, left to right). */
  chips: MapaChip[];
  spots: MapaSpot[];
  /** The end: the place's names and the wiki file page (its name says the place). */
  answer: { pt: string; en: string } | null;
  source: string | null;
}

const SITES = ['A', 'B', 'C'];

/**
 * Compact chip names for narrow stages (the full name stays in the aria-label): "Principal A" for "Principal do A",
 * "Pátio" for "Pátio (meio)", "Surg. atacante" for the spawns ("Caverna" for another place on a side); English
 * "Atk Spawn" / "Def Cave". A compact name that
 * would repeat within the map falls back to the full one.
 */
export function chipShortLabels(map: ClassicMap): Map<string, { pt: string; en: string }> {
  const raw = map.callouts.map((c) => {
    const side = /Side$/.test(c.superRegionEn);
    const attacker = /^Attacker/.test(c.superRegionEn);
    const pt = SITES.includes(c.superRegionEn) ? `${c.region} ${c.superRegion}` : side && c.regionEn === 'Spawn' ? `Surg. ${attacker ? 'atacante' : 'defensor'}` : c.region;
    const en = side ? `${attacker ? 'Atk' : 'Def'} ${c.regionEn}` : calloutLabelEn(c);
    return { c, pt, en };
  });
  const count = (key: 'pt' | 'en', v: string) => raw.filter((r) => r[key] === v).length;
  return new Map(
    raw.map((r) => [r.c.id, { pt: count('pt', r.pt) > 1 ? calloutLabel(r.c) : r.pt, en: count('en', r.en) > 1 ? calloutLabelEn(r.c) : r.en }]),
  );
}

/** Callouts in reading order: rows of 1/12 of the map, left to right within a row (the chips' tab order). */
export function readingOrder(callouts: readonly ClassicCallout[]): ClassicCallout[] {
  return [...callouts].sort((a, b) => Math.round(a.y * 12) - Math.round(b.y * 12) || a.x - b.x);
}

export function mapaView(data: ClassicData, puzzle: ValdlePuzzle<'mapa'>, progress: ValdleProgress): MapaView {
  const stepOne = mapaStepOneDone(puzzle, progress);
  const done = isDone('mapa', puzzle, progress);
  const step: MapaStep = done ? 'done' : stepOne ? 'where' : 'map';
  const place = data.placeById.get(`${puzzle.map}:${puzzle.place}`);
  const m = data.mapById.get(puzzle.map)!;
  const answer = m.callouts.find((c) => c.id === puzzle.place);
  const miss = misses(puzzle, progress);
  const name = (id: string) => data.mapById.get(id)?.name ?? id;
  const mapGuesses = progress.guesses.map((id) => ({ id, name: name(id), hit: id === puzzle.map }));
  const tried = new Set(progress.guesses);
  const choices: MapaChoice[] = stepOne ? [] : mapaMaps(data).map((x) => ({ id: x.id, name: x.name, state: tried.has(x.id) ? 'miss' : 'open' }));
  const spotsIds = progress.spots ?? [];
  const short = stepOne ? chipShortLabels(m) : new Map<string, { pt: string; en: string }>();
  const chips: MapaChip[] = stepOne
    ? readingOrder(m.callouts).map((c) => ({
        id: c.id,
        pt: calloutLabel(c),
        en: calloutLabelEn(c),
        ptShort: short.get(c.id)!.pt,
        enShort: short.get(c.id)!.en,
        x: c.x,
        y: c.y,
        state: spotsIds.includes(c.id) ? (c.id === puzzle.place ? 'hit' : 'miss') : done && c.id === puzzle.place ? 'answer' : 'open',
      }))
    : [];
  const spots: MapaSpot[] = !stepOne || !answer
    ? []
    : spotsIds.flatMap((id) => {
        const c = m.callouts.find((x) => x.id === id);
        return c
          ? [
              {
                id,
                pt: calloutLabel(c),
                en: calloutLabelEn(c),
                hit: id === answer.id,
                sameRegion: c.superRegionEn === answer.superRegionEn,
                near: Math.hypot(c.x - answer.x, c.y - answer.y) < MAPA_NEAR,
              },
            ]
          : [];
      });
  return {
    step,
    image: {
      file: place?.file ?? null,
      // Names only as each step ends: the map after step 1, the callout at the very end.
      alt: done && answer ? `${calloutLabel(answer)}, em ${m.name}` : stepOne ? `Lugar de ${m.name}` : 'Lugar de um mapa',
      zoom: stepOne ? 1 : MAPA_ZOOM[Math.min(miss, MAPA_ZOOM.length - 1)]!,
      focus: puzzle.focus,
      grayscale: !stepOne && miss === 0,
    },
    choices,
    mapGuesses,
    mapTries: { used: progress.guesses.length, max: VALDLE_GAMES.mapa.maxTries },
    map: stepOne ? { id: m.id, name: m.name, minimap: m.minimap, won: tried.has(puzzle.map) } : null,
    chips,
    spots,
    answer: done && answer ? { pt: calloutLabel(answer), en: calloutLabelEn(answer) } : null,
    source: done ? (place?.source ?? null) : null,
  };
}
