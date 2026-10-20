/**
 * Agent meta per map and year: share (%) of the 10 agent slots of a map taken by each agent, top 6 per map,
 * measured on 1,549 maps of VLR.gg match pages (docs/pesquisa-variancia.md §9.2, 2026-10-19). The game uses
 * the year of the veto pool. A missing map or year has no meta (no bonus for anyone). Transcribed from the
 * research table; regenerate from the match pages when the pipeline stores agents per map.
 */
import type { MetaTable } from '../../engine/form';

export const MAP_META: Readonly<Record<number, MetaTable>> = {
  2025: {
    Abyss: { Sova: 19, Astra: 12, Omen: 11, Jett: 10, Cypher: 10, Yoru: 9 },
    Ascent: { Omen: 20, Sova: 14, Yoru: 10, 'KAY/O': 9, Jett: 9, Vyse: 9 },
    Bind: { Brimstone: 16, Viper: 16, Raze: 13, Fade: 10, Yoru: 9, Tejo: 6 },
    Corrode: { Omen: 18, Viper: 14, Fade: 12, Yoru: 8, Waylay: 8, Vyse: 8 },
    Fracture: { Brimstone: 19, Breach: 19, Tejo: 18, Cypher: 12, Neon: 9, Raze: 9 },
    Haven: { Omen: 18, Sova: 15, Cypher: 12, Yoru: 11, Neon: 8, Breach: 6 },
    Icebox: { Viper: 20, Killjoy: 19, Jett: 14, Sova: 13, Gekko: 7, Omen: 6 },
    Lotus: { Omen: 19, Fade: 14, Viper: 12, Raze: 12, Vyse: 8, Yoru: 7 },
    Pearl: { Astra: 20, Yoru: 18, Vyse: 14, Fade: 10, Tejo: 9, Sova: 8 },
    Split: { Viper: 17, Omen: 15, Yoru: 12, Raze: 12, Fade: 11, Breach: 9 },
    Sunset: { Omen: 20, Cypher: 16, Neon: 14, Sova: 14, Breach: 7, Viper: 6 },
  },
  2026: {
    Abyss: { Sova: 19, Waylay: 15, Yoru: 12, Astra: 12, Omen: 11, Harbor: 8 },
    Ascent: { Sova: 20, Omen: 19, Phoenix: 11, Cypher: 10, Jett: 9, Neon: 8 },
    Bind: { Viper: 19, Brimstone: 17, Fade: 11, Yoru: 11, Waylay: 10, Skye: 9 },
    Breeze: { Sova: 19, Viper: 18, Jett: 12, Neon: 11, Harbor: 8, Omen: 7 },
    Corrode: { Viper: 14, Waylay: 12, Omen: 12, Fade: 11, Yoru: 8, Astra: 7 },
    Fracture: { Brimstone: 18, Cypher: 14, Neon: 13, Fade: 10, Raze: 9, Skye: 6 },
    Haven: { Omen: 17, Sova: 16, Neon: 15, Cypher: 10, Phoenix: 8, Chamber: 6 },
    Lotus: { Omen: 20, Fade: 15, Raze: 12, Vyse: 10, Neon: 9, Viper: 9 },
    Pearl: { Astra: 20, Neon: 13, Fade: 11, Phoenix: 9, Killjoy: 7, Sova: 7 },
    Split: { Viper: 18, Omen: 17, Fade: 12, Raze: 11, Neon: 10, Skye: 8 },
    Summit: { Fade: 15, Neon: 14, Omen: 10, Chamber: 9, Cypher: 7, Sage: 7 },
    Sunset: { Omen: 20, Neon: 17, Chamber: 10, Fade: 10, Sova: 9, Cypher: 9 },
  },
};

/** Meta of the year, or the latest year at or before it (undefined before the first measured year). */
export function metaForYear(year: number): MetaTable | undefined {
  const years = Object.keys(MAP_META)
    .map(Number)
    .filter((y) => y <= year)
    .sort((a, b) => b - a);
  return years.length ? MAP_META[years[0]!] : undefined;
}
