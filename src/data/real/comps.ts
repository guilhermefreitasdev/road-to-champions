/**
 * Agent compositions per map of the real series (VLR.gg match pages), for "Outros modos" (Valdle, "Comp
 * Misteriosa"): comps.json, written by scripts/vlr/comps.mjs from the cached pages behind series.json (see
 * docs/data.md, "Composições por mapa"). Each map keeps the five agents of each team, in the order of
 * `SeriesResult.teams`; a map whose scoreboard was incomplete has no comp (null).
 */
import compsJson from './comps.json';

interface CompsJson {
  agents: string[];
  comps: [number, string[]][];
}

/** The five agents of each team on one map (sorted by name), in series team order. */
export type MapComps = [readonly string[], readonly string[]];

/** Decodes the compact rows (pure; exported for the tests). */
export function decodeComps(json: CompsJson): ReadonlyMap<number, readonly (MapComps | null)[]> {
  const CODES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const agentOf = (ch: string) => {
    const name = json.agents[CODES.indexOf(ch)];
    if (!name) throw new Error(`comps.json: unknown agent code ${ch}`);
    return name;
  };
  const out = new Map<number, (MapComps | null)[]>();
  for (const [id, maps] of json.comps) {
    out.set(
      id,
      maps.map((s) => (s.length === 10 ? [[...s.slice(0, 5)].map(agentOf), [...s.slice(5)].map(agentOf)] : null)),
    );
  }
  return out;
}

let decoded: ReadonlyMap<number, readonly (MapComps | null)[]> | null = null;

/** Comps of every series with a parsed scoreboard, by VLR series id (decoded on first use). */
export function seriesComps(): ReadonlyMap<number, readonly (MapComps | null)[]> {
  return (decoded ??= decodeComps(compsJson as unknown as CompsJson));
}
