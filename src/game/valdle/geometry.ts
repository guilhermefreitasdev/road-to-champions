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

/**
 * Places labels (boxes of `sizes`, centered on `anchors`) inside a width × height box with light collision nudging:
 * each overlapping pair is pushed apart along the axis where they overlap least, and every box is kept inside the
 * frame. Returns the centers. Deterministic; used for the "Onde é?" chips (pixels in, pixels out).
 */
export function spreadLabels(anchors: readonly Pt[], sizes: readonly { w: number; h: number }[], width: number, height: number, gap = 2, iterations = 120): Pt[] {
  const clampTo = (p: Pt, i: number): Pt => {
    const { w, h } = sizes[i]!;
    return {
      x: w >= width ? width / 2 : Math.min(width - w / 2, Math.max(w / 2, p.x)),
      y: h >= height ? height / 2 : Math.min(height - h / 2, Math.max(h / 2, p.y)),
    };
  };
  const pos = anchors.map((a, i) => clampTo(a, i));
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const a = pos[i]!;
        const b = pos[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const ox = (sizes[i]!.w + sizes[j]!.w) / 2 + gap - Math.abs(dx);
        const oy = (sizes[i]!.h + sizes[j]!.h) / 2 + gap - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        // Push along the cheaper axis (ties and coincident centers split by index, so the result is deterministic).
        if (oy <= ox) {
          const s = dy === 0 ? 1 : Math.sign(dy);
          pos[i] = clampTo({ x: a.x, y: a.y - (s * oy) / 2 }, i);
          pos[j] = clampTo({ x: b.x, y: b.y + (s * oy) / 2 }, j);
        } else {
          const s = dx === 0 ? 1 : Math.sign(dx);
          pos[i] = clampTo({ x: a.x - (s * ox) / 2, y: a.y }, i);
          pos[j] = clampTo({ x: b.x + (s * ox) / 2, y: b.y }, j);
        }
      }
    }
    if (!moved) break;
  }
  return pos;
}

/** Total area where two of the boxes overlap (0 = clean layout); for tests and tuning. */
export function labelOverlap(centers: readonly Pt[], sizes: readonly { w: number; h: number }[]): number {
  let area = 0;
  for (let i = 0; i < centers.length; i++) {
    for (let j = i + 1; j < centers.length; j++) {
      const ox = (sizes[i]!.w + sizes[j]!.w) / 2 - Math.abs(centers[j]!.x - centers[i]!.x);
      const oy = (sizes[i]!.h + sizes[j]!.h) / 2 - Math.abs(centers[j]!.y - centers[i]!.y);
      if (ox > 0 && oy > 0) area += ox * oy;
    }
  }
  return area;
}
