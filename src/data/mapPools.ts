import type { MapName } from '../engine/types';

/**
 * Example 7-map competitive pool for the engine's unit tests (the game vetoes on REAL_MAP_POOL, src/data/real).
 * Map names are real Valorant maps; the combination is not tied to any specific event.
 */
export const SAMPLE_MAP_POOL: readonly MapName[] = ['Ascent', 'Bind', 'Haven', 'Icebox', 'Lotus', 'Split', 'Sunset'];
