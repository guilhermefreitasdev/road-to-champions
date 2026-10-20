/**
 * "Valdle — Cena pro" over the real pool (the Diário's facts index, the series and their comps): the index and the
 * daily puzzles, built once on first use.
 */
import { AGENTS } from '../../data/game';
import { seriesComps } from '../../data/real/comps';
import { playerPhotos } from '../../data/media';
import { SERIES } from '../../data/real/series';
import type { Role } from '../../engine/types';
import { dailyData } from '../daily';
import { cabeloMaker, cabeloPool, type CabeloPhoto } from './cabelo';
import { createPlanner, type Planner } from './planner';
import type { ValdlePuzzle } from './play';
import { buildProIndex, proMakers, type ProFacts, type ProIndex } from './pro';

let index: ProIndex | null = null;

export function proIndex(): ProIndex {
  return (index ??= buildProIndex(dailyData(), Object.fromEntries(AGENTS.map((a) => [a.name, a.role])) as Record<string, Role>, SERIES));
}

/**
 * The photo of "Pelo cabelo": the one taken at the player's most recent card's event, else the current one, else the
 * one of the latest event that has a photo.
 */
export function cabeloPhotoOf(f: ProFacts): CabeloPhoto | null {
  const photos = playerPhotos(f.id);
  if (!photos.length) return null;
  const order = (eventId: string | null) => (eventId ? (proIndex().data.events.get(eventId)?.startDate ?? '') : '');
  const pick =
    photos.find((p) => p.eventId === f.lastEventId) ??
    photos.find((p) => p.eventId === null) ??
    [...photos].sort((a, b) => order(b.eventId).localeCompare(order(a.eventId)) || String(a.eventId).localeCompare(String(b.eventId)))[0]!;
  return { path: pick.media.photo, eventId: pick.eventId, sourceUrl: pick.media.sourceUrl };
}

let cabeloAnswers_: ReturnType<typeof cabeloPool> | null = null;

/** The answers of "Pelo cabelo" (players with a local photo), most famous first. */
export function cabeloAnswers(): ReturnType<typeof cabeloPool> {
  return (cabeloAnswers_ ??= cabeloPool(proIndex(), cabeloPhotoOf));
}

type ProGame = 'pro' | 'cabelo' | 'grade' | 'conexoes' | 'comp';
let planners: { [G in ProGame]: Planner<ValdlePuzzle<G>> } | null = null;

function plannersOf() {
  if (!planners) {
    const m = proMakers(proIndex(), SERIES, seriesComps());
    planners = {
      pro: createPlanner('pro', m.pro),
      cabelo: createPlanner('cabelo', cabeloMaker(cabeloAnswers())),
      grade: createPlanner('grade', m.grade),
      conexoes: createPlanner('conexoes', m.conexoes),
      comp: createPlanner('comp', m.comp),
    } as unknown as { [G in ProGame]: Planner<ValdlePuzzle<G>> };
  }
  return planners;
}

export function proDaily<G extends ProGame>(game: G, date: string): ValdlePuzzle<G> {
  return plannersOf()[game].daily(date) as ValdlePuzzle<G>;
}
