/**
 * WaltCad — Geometry operations.
 *
 * Pure functions that transform polylines (arrays of [x,y,z] triples) and
 * produce the results consumed by WaltCadController when it materialises new
 * objects in the scene. All ops treat splines as 2D on the XY plane (Z=0)
 * unless noted; this matches WaltCad's 2D-first workflow.
 */
import * as THREE from 'three';

export type Pt = [number, number, number];

/** Extract the first spline of a serialized editable_spline as a Pt[]. */
export function extractPolyline(serialized: any): { points: Pt[]; closed: boolean } {
  if (!serialized) return { points: [], closed: false };
  const knots: any[] = serialized.knots || [];
  const splines: any[] = serialized.splines || [];
  const first = splines[0];
  if (!first) return { points: [], closed: false };
  const byId = new Map<number, any>(knots.map((k) => [k.id, k]));
  const points: Pt[] = first.knots.map((kid: number) => {
    const k = byId.get(kid);
    const p = Array.isArray(k?.pos) ? k.pos : [0, 0, 0];
    return [p[0], p[1], p[2] ?? 0] as Pt;
  });
  return { points, closed: !!first.closed };
}

/** Rebuild a serialized editable_spline from a polyline (all corner knots). */
export function polylineToSerialized(points: Pt[], closed: boolean): any {
  const knots = points.map((p, i) => ({
    id: i + 1, type: 'corner',
    pos: [p[0], p[1], p[2] || 0],
    inHandle: [0, 0, 0], outHandle: [0, 0, 0],
  }));
  const splines = [{ id: 1, closed, knots: knots.map((k) => k.id) }];
  return { splines, knots, segments: [], _next: [knots.length + 1, 1, 2] };
}

/** Total length in world units (sum of segment lengths). */
export function polylineLength(points: Pt[], closed: boolean): number {
  let L = 0;
  for (let i = 0; i < points.length - 1; i++) L += dist(points[i], points[i + 1]);
  if (closed && points.length > 2) L += dist(points[points.length - 1], points[0]);
  return L;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * OFFSET — parallel copy at signed distance `d`. Positive = to the left of
 * travel direction (Y-axis-up normal in XY plane). For a closed polygon we
 * treat the interior as "left" so positive offsets shrink the shape.
 */
export function offsetPolyline(points: Pt[], d: number, closed: boolean): Pt[] {
  if (points.length < 2) return points.slice();
  const n = points.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const prev = i === 0 ? (closed ? points[n - 1] : points[i]) : points[i - 1];
    const next = i === n - 1 ? (closed ? points[0] : points[i]) : points[i + 1];

    const t1x = p[0] - prev[0], t1y = p[1] - prev[1];
    const t2x = next[0] - p[0], t2y = next[1] - p[1];
    const l1 = Math.hypot(t1x, t1y) || 1;
    const l2 = Math.hypot(t2x, t2y) || 1;
    // Segment normals (left side).
    const n1x = -t1y / l1, n1y = t1x / l1;
    const n2x = -t2y / l2, n2y = t2x / l2;

    // Endpoints of an open polyline use single-segment normal.
    if (!closed && i === 0) { out.push([p[0] + n2x * d, p[1] + n2y * d, p[2]]); continue; }
    if (!closed && i === n - 1) { out.push([p[0] + n1x * d, p[1] + n1y * d, p[2]]); continue; }

    // Interior — bisector, scaled so the offset lands exactly at distance d
    // along both incident segments.
    const bx = n1x + n2x, by = n1y + n2y;
    const bl = Math.hypot(bx, by) || 1;
    const cosHalf = Math.max(0.2, (n1x * bx + n1y * by) / bl);
    const k = d / cosHalf;
    out.push([p[0] + (bx / bl) * k, p[1] + (by / bl) * k, p[2]]);
  }
  return out;
}

/** MIRROR across an axis passing through pivot (XY plane operations). */
export function mirrorPolyline(points: Pt[], axis: 'x' | 'y' | 'z', pivot: Pt): Pt[] {
  return points.map((p) => {
    const [x, y, z] = p;
    const [px, py, pz] = pivot;
    if (axis === 'x') return [x, 2 * py - y, z] as Pt;
    if (axis === 'y') return [2 * px - x, y, z] as Pt;
    return [x, y, 2 * pz - z] as Pt;
  });
}

/** ARRAY (linear) — N copies each translated by (dx, dy, dz). */
export function arrayLinear(points: Pt[], count: number, dx: number, dy: number, dz: number): Pt[][] {
  const out: Pt[][] = [];
  for (let i = 1; i <= count; i++) {
    out.push(points.map((p) => [p[0] + dx * i, p[1] + dy * i, p[2] + dz * i] as Pt));
  }
  return out;
}

/** ARRAY (radial) — N copies rotated about the polyline centroid on XY. */
export function arrayRadial(points: Pt[], count: number, sweepDeg: number): Pt[][] {
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  const step = (sweepDeg / count) * Math.PI / 180;
  const out: Pt[][] = [];
  for (let i = 1; i <= count; i++) {
    const a = step * i;
    const cos = Math.cos(a), sin = Math.sin(a);
    out.push(points.map((p) => {
      const dx = p[0] - cx, dy = p[1] - cy;
      return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos, p[2]] as Pt;
    }));
  }
  return out;
}

/** EXPLODE — one straight two-vertex polyline per segment. */
export function explodeToSegments(points: Pt[], closed: boolean): Array<{ points: Pt[]; closed: false }> {
  const out: Array<{ points: Pt[]; closed: false }> = [];
  for (let i = 0; i < points.length - 1; i++) {
    out.push({ points: [points[i], points[i + 1]], closed: false });
  }
  if (closed && points.length > 2) out.push({ points: [points[points.length - 1], points[0]], closed: false });
  return out;
}

/** JOIN — concatenate B to A (nearest endpoint match within tolerance). */
export function joinPolylines(a: Pt[], b: Pt[], tol: number): Pt[] | null {
  const endA = a[a.length - 1], startA = a[0];
  const endB = b[b.length - 1], startB = b[0];
  if (dist(endA, startB) <= tol) return [...a, ...b.slice(1)];
  if (dist(endA, endB)   <= tol) return [...a, ...b.slice(0, -1).reverse()];
  if (dist(startA, startB) <= tol) return [...a.slice().reverse(), ...b.slice(1)];
  if (dist(startA, endB) <= tol) return [...b, ...a.slice(1)];
  return null;
}

/** FILLET — replace each interior corner with a two-knot chamfered arc of `r`. */
export function filletCorners(points: Pt[], r: number, closed: boolean): Pt[] {
  if (points.length < 3 || r <= 0) return points.slice();
  const n = points.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const isEndpoint = !closed && (i === 0 || i === n - 1);
    if (isEndpoint) { out.push(points[i]); continue; }
    const prev = points[(i - 1 + n) % n];
    const cur  = points[i];
    const next = points[(i + 1) % n];
    const v1x = prev[0] - cur[0], v1y = prev[1] - cur[1];
    const v2x = next[0] - cur[0], v2y = next[1] - cur[1];
    const l1 = Math.hypot(v1x, v1y) || 1;
    const l2 = Math.hypot(v2x, v2y) || 1;
    const t = Math.min(r, l1 * 0.49, l2 * 0.49);
    out.push([cur[0] + (v1x / l1) * t, cur[1] + (v1y / l1) * t, cur[2]]);
    out.push([cur[0] + (v2x / l2) * t, cur[1] + (v2y / l2) * t, cur[2]]);
  }
  return out;
}

/** CHAMFER — asymmetric per-segment cut. */
export function chamferCorners(points: Pt[], a: number, b: number, closed: boolean): Pt[] {
  if (points.length < 3) return points.slice();
  const n = points.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const isEndpoint = !closed && (i === 0 || i === n - 1);
    if (isEndpoint) { out.push(points[i]); continue; }
    const prev = points[(i - 1 + n) % n];
    const cur  = points[i];
    const next = points[(i + 1) % n];
    const v1x = prev[0] - cur[0], v1y = prev[1] - cur[1];
    const v2x = next[0] - cur[0], v2y = next[1] - cur[1];
    const l1 = Math.hypot(v1x, v1y) || 1;
    const l2 = Math.hypot(v2x, v2y) || 1;
    const ta = Math.min(a, l1 * 0.49);
    const tb = Math.min(b, l2 * 0.49);
    out.push([cur[0] + (v1x / l1) * ta, cur[1] + (v1y / l1) * ta, cur[2]]);
    out.push([cur[0] + (v2x / l2) * tb, cur[1] + (v2y / l2) * tb, cur[2]]);
  }
  return out;
}

/** DIVIDE — N equally spaced points along the polyline. */
export function dividePolyline(points: Pt[], n: number, closed: boolean): Pt[] {
  const L = polylineLength(points, closed);
  if (L <= 0 || n < 1) return [];
  const step = L / (closed ? n : (n - 1));
  return samplePolyline(points, step, closed);
}

/** MEASURE — points at fixed distance `spacing` along the polyline. */
export function measurePolyline(points: Pt[], spacing: number, closed: boolean): Pt[] {
  if (spacing <= 0) return [];
  return samplePolyline(points, spacing, closed);
}

function samplePolyline(points: Pt[], step: number, closed: boolean): Pt[] {
  const out: Pt[] = [points[0]];
  let carry = 0;
  const walk = (from: Pt, to: Pt) => {
    let remaining = dist(from, to);
    let cx = from[0], cy = from[1], cz = from[2];
    while (carry + remaining >= step - 1e-9) {
      const need = step - carry;
      const rx = to[0] - cx, ry = to[1] - cy, rz = to[2] - cz;
      const rl = Math.hypot(rx, ry, rz) || 1;
      cx += (rx / rl) * need; cy += (ry / rl) * need; cz += (rz / rl) * need;
      out.push([cx, cy, cz]);
      remaining -= need; carry = 0;
    }
    carry += remaining;
  };
  for (let i = 0; i < points.length - 1; i++) walk(points[i], points[i + 1]);
  if (closed && points.length > 2) walk(points[points.length - 1], points[0]);
  return out;
}

/** BREAK — split polyline at param t in [0..1] measured by cumulative length. */
export function breakPolyline(points: Pt[], t: number): [Pt[], Pt[]] {
  const L = polylineLength(points, false);
  const target = THREE.MathUtils.clamp(t, 0.001, 0.999) * L;
  let acc = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const seg = dist(points[i], points[i + 1]);
    if (acc + seg >= target) {
      const u = (target - acc) / seg;
      const cut: Pt = [
        points[i][0] + (points[i + 1][0] - points[i][0]) * u,
        points[i][1] + (points[i + 1][1] - points[i][1]) * u,
        points[i][2] + (points[i + 1][2] - points[i][2]) * u,
      ];
      return [[...points.slice(0, i + 1), cut], [cut, ...points.slice(i + 1)]];
    }
    acc += seg;
  }
  return [points.slice(), []];
}

/** Simple hatch — generates parallel lines clipped to bounding box of the shape. */
export function hatchLines(points: Pt[], spacing: number, angleDeg: number): Array<{ points: Pt[] }> {
  if (points.length < 3 || spacing <= 0) return [];
  const angle = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const p of points) {
    const u = p[0] * cos + p[1] * sin;
    const v = -p[0] * sin + p[1] * cos;
    if (u < minU) minU = u; if (u > maxU) maxU = u;
    if (v < minV) minV = v; if (v > maxV) maxV = v;
  }
  const lines: Array<{ points: Pt[] }> = [];
  for (let v = minV; v <= maxV; v += spacing) {
    const a: Pt = [minU * cos - v * sin, minU * sin + v * cos, 0];
    const b: Pt = [maxU * cos - v * sin, maxU * sin + v * cos, 0];
    lines.push({ points: [a, b] });
  }
  return lines;
}
