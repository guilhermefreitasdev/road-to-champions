/**
 * The Callout game's schematic map: the Voronoi cell of every callout point (valorant-api.com positions on the
 * minimap), clipped to the points' convex hull pushed out by a margin. Each cell is "the part of the map closest to
 * that callout": a drawing derived only from the API's points, so it works without the minimap image. Pure.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Convex hull (Andrew's monotone chain), counter-clockwise. */
export function convexHull(points: readonly Pt[]): Pt[] {
  const ps = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (ps.length < 3) return ps;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of ps) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (const p of [...ps].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Keeps the part of `poly` on the side of the bisector of a–b that holds a (Sutherland–Hodgman, one edge). */
function clipToward(poly: readonly Pt[], a: Pt, b: Pt): Pt[] {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const nx = b.x - a.x;
  const ny = b.y - a.y;
  const side = (p: Pt) => (p.x - mx) * nx + (p.y - my) * ny; // < 0: a's side
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const sp = side(p);
    const sq = side(q);
    if (sp <= 0) out.push(p);
    if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
      const t = sp / (sp - sq);
      out.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) });
    }
  }
  return out;
}

/** One polygon per point (same order), inside the hull grown by `margin` (in the points' units). */
export function voronoiCells(points: readonly Pt[], margin = 0.06): Pt[][] {
  const hull = convexHull(points);
  const cx = hull.reduce((s, p) => s + p.x, 0) / Math.max(1, hull.length);
  const cy = hull.reduce((s, p) => s + p.y, 0) / Math.max(1, hull.length);
  const grown = hull.map((p) => {
    const d = Math.hypot(p.x - cx, p.y - cy) || 1;
    return { x: p.x + ((p.x - cx) / d) * margin, y: p.y + ((p.y - cy) / d) * margin };
  });
  return points.map((p, i) => {
    let cell: Pt[] = grown;
    for (let j = 0; j < points.length; j++) if (j !== i) cell = clipToward(cell, p, points[j]!);
    return cell;
  });
}

/** Centroid of a polygon (area-weighted; falls back to the vertex mean). */
export function centroid(poly: readonly Pt[]): Pt {
  let a = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const f = p.x * q.y - q.x * p.y;
    a += f;
    x += (p.x + q.x) * f;
    y += (p.y + q.y) * f;
  }
  if (Math.abs(a) < 1e-12) return { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length };
  return { x: x / (3 * a), y: y / (3 * a) };
}

/** Point-in-polygon (ray casting). */
export function contains(poly: readonly Pt[], p: Pt): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
