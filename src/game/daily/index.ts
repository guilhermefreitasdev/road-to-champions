/**
 * The Daily over the real data: the facts index and the generator, built once on first use. Imports the real pool
 * and the series results, so the UI loads it with the Daily screen (its own chunk).
 */
import { ALL_ROSTERS, AGENT_STATS } from '../../data/real';
import type { VlrEventData } from '../../data/real/cards';
import { SERIES } from '../../data/real/series';
import slimJson from '../../data/real/vlr/slim.json';
import { buildDailyData, type DailyData } from './data';
import { createDailyGenerator, type DailyGenerator, type DailyPuzzle } from './generate';

let data: DailyData | null = null;
let generator: DailyGenerator | null = null;

export function dailyData(): DailyData {
  return (data ??= buildDailyData(ALL_ROSTERS, slimJson as VlrEventData[], SERIES, AGENT_STATS));
}

/** The four puzzles of a day (YYYY-MM-DD in São Paulo, launch or later). */
export function dailyPuzzle(date: string): DailyPuzzle {
  generator ??= createDailyGenerator(dailyData());
  return generator.puzzleFor(date);
}
