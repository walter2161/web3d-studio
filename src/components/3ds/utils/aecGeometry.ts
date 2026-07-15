// AEC (Architecture/Engineering/Construction) parametric objects.
//
// A Wall is defined by a polyline (path) on the XZ plane plus width/height and
// justification. Corners are computed as miter joints between adjacent offset
// polylines. Doors and windows attached to the wall register non-destructive
// **openings** — rectangular cutouts in the segment's face plane — that the
// wall builder subtracts by splitting each segment into sub-prisms around the
// opening, generating the interior "reveal" faces of the hole so it looks like
// a real cut.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type WallJustification = 'left' | 'center' | 'right';

// Non-destructive opening in a wall face. Coords are within a specific
// segment's local frame: `tStart/tEnd` are distances along the segment
// centerline from vertex i toward vertex i+1; Y is world/wall Y (0 at floor).
export interface WallOpening {
  id: string;             // matches the door/window object id
  segmentIndex: number;
  tStart: number;
  tEnd: number;
  yBottom: number;
  yTop: number;
}

export interface WallGeom {
  path?: [number, number, number][];
  width?: number;
  height?: number;
  justification?: WallJustification;
  closed?: boolean;
  openings?: WallOpening[];
}

export const WALL_DEFAULTS: Required<Pick<WallGeom, 'width' | 'height' | 'justification' | 'closed'>> = {
  width: 0.2,
  height: 2.7,
  justification: 'center',
  closed: false,
};

// -----------------------------------------------------------------------------
// Wall builder
// -----------------------------------------------------------------------------

interface SegInfo {
  a: THREE.Vector2;      // start centerline (x,z)
  b: THREE.Vector2;      // end centerline
  u: THREE.Vector2;      // unit dir a→b
  n: THREE.Vector2;      // unit normal (rotate +90°): (-uz, ux)
  len: number;
  // Miter'd top-view corners in world XZ (Vector2 = x,z).
  L0: THREE.Vector2; R0: THREE.Vector2;
  L1: THREE.Vector2; R1: THREE.Vector2;
}

export function buildWall(geom: WallGeom): THREE.BufferGeometry {
  const path = geom.path || [];
  const g = new THREE.BufferGeometry();
  if (path.length < 2) return g;

  const width = Math.max(0.001, geom.width ?? WALL_DEFAULTS.width);
  const height = Math.max(0.001, geom.height ?? WALL_DEFAULTS.height);
  const just = geom.justification ?? WALL_DEFAULTS.justification;
  const closed = !!geom.closed && path.length >= 3;
  const openings = geom.openings || [];

  const pts = path.map((p) => new THREE.Vector2(p[0], p[2]));
  const n = pts.length;

  let offL: number, offR: number;
  if (just === 'center') { offL = -width / 2; offR = width / 2; }
  else if (just === 'left') { offL = -width; offR = 0; }
  else { offL = 0; offR = width; }

  // Segment normals.
  const segCount = closed ? n : n - 1;
  const segNrm: THREE.Vector2[] = [];
  const segDir: THREE.Vector2[] = [];
  const segLen: number[] = [];
  for (let i = 0; i < segCount; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const d = b.clone().sub(a);
    const L = d.length();
    if (L < 1e-8) {
      segDir.push(new THREE.Vector2(1, 0));
      segNrm.push(new THREE.Vector2(0, 1));
      segLen.push(0);
    } else {
      d.multiplyScalar(1 / L);
      segDir.push(d);
      segNrm.push(new THREE.Vector2(-d.y, d.x));
      segLen.push(L);
    }
  }

  // Per-vertex miter offsets. Returns the offset VECTOR to apply to pts[i].
  //
  // For a vertex with segments in (prev, next) both non-null, the exact
  // miter that keeps both offset lines matching is:
  //   offset = (offN * prev + offN * next) / (1 + prev·next)    when |prev+next|>eps
  // (bisector formulation, but scaled by 1/(1+dot) — this is stable and gives
  //  the correct miter length for any interior angle > ~10°).
  //
  // For extreme sharp angles we clamp using a bevel fallback (perpendicular
  // extension of the last segment only) so the mesh never balloons.
  const miterOffset = (
    prev: THREE.Vector2 | null,
    next: THREE.Vector2 | null,
    off: number
  ): THREE.Vector2 => {
    if (!prev && !next) return new THREE.Vector2();
    if (!prev)  return next!.clone().multiplyScalar(off);
    if (!next)  return prev.clone().multiplyScalar(off);
    const dot = THREE.MathUtils.clamp(prev.dot(next), -0.999, 0.999);
    // Miter blows up at dot ≈ -1 (180° reversal). Clamp bevel.
    const denom = 1 + dot;
    if (denom < 0.15) {
      // Fallback: use the average of the two perpendicular normals but cap length.
      const avg = prev.clone().add(next).multiplyScalar(0.5);
      const l = avg.length();
      if (l < 1e-6) return prev.clone().multiplyScalar(off);
      return avg.multiplyScalar(off / Math.max(0.15, l));
    }
    return prev.clone().add(next).multiplyScalar(off / denom);
  };

  const seg: SegInfo[] = [];
  for (let i = 0; i < segCount; i++) {
    const j = (i + 1) % n;
    const a = pts[i];
    const b = pts[j];
    // Miter for vertex i (start of this segment): uses prevSeg normal & this seg normal.
    const prevIdx = i === 0 ? (closed ? segCount - 1 : -1) : i - 1;
    const nextIdxStart = i;                                   // this segment
    const prevIdxEnd = i;                                     // this segment (into vertex j)
    const nextIdxEnd = j === n - 1 && !closed ? -1 : j % segCount; // outgoing at vertex j

    const prevNrmStart = prevIdx >= 0 ? segNrm[prevIdx] : null;
    const nextNrmStart = segNrm[nextIdxStart];
    const prevNrmEnd = segNrm[prevIdxEnd];
    const nextNrmEnd = nextIdxEnd >= 0 ? segNrm[nextIdxEnd] : null;

    const oL0 = miterOffset(prevNrmStart, nextNrmStart, offL);
    const oR0 = miterOffset(prevNrmStart, nextNrmStart, offR);
    const oL1 = miterOffset(prevNrmEnd, nextNrmEnd, offL);
    const oR1 = miterOffset(prevNrmEnd, nextNrmEnd, offR);

    seg.push({
      a, b,
      u: segDir[i],
      n: segNrm[i],
      len: segLen[i],
      L0: a.clone().add(oL0), R0: a.clone().add(oR0),
      L1: b.clone().add(oL1), R1: b.clone().add(oR1),
    });
  }

  // ---------------- Emit geometry -----------------
  const positions: number[] = [];
  const indices: number[] = [];
  let vi = 0;
  const pushV = (x: number, y: number, z: number) => { positions.push(x, y, z); return vi++; };
  const pushTri = (a: number, b: number, c: number) => { indices.push(a, b, c); };
  const pushQuad = (a: number, b: number, c: number, d: number) => { pushTri(a, b, c); pushTri(a, c, d); };

  // Interpolate a top-view corner along a segment at parameter t∈[0..segLen].
  // At interior t (not endpoint) we use the centerline + offset — no miter —
  // because miter only affects the two ends of a segment.
  const cornerAt = (s: SegInfo, t: number, side: 'L' | 'R'): THREE.Vector2 => {
    const eps = 1e-5;
    if (t <= eps) return side === 'L' ? s.L0.clone() : s.R0.clone();
    if (t >= s.len - eps) return side === 'L' ? s.L1.clone() : s.R1.clone();
    const mid = s.a.clone().add(s.u.clone().multiplyScalar(t));
    const off = side === 'L' ? offL : offR;
    return mid.add(s.n.clone().multiplyScalar(off));
  };

  // Emit a single "block" prism inside a segment covering
  //   t ∈ [tA..tB]  ×  Y ∈ [yA..yB]
  // Faces are only rendered when they border AIR (not another neighboring block).
  //
  //   renderCapStart / renderCapEnd  — vertical faces at t=tA / t=tB
  //   renderTop / renderBottom       — horizontal faces at Y=yB / Y=yA
  //   The two side faces (left/right of wall) are ALWAYS rendered because
  //   they are the wall's outer skin.
  const emitBlock = (
    s: SegInfo,
    tA: number, tB: number,
    yA: number, yB: number,
    renderCapStart: boolean, renderCapEnd: boolean,
    renderTop: boolean, renderBottom: boolean,
  ) => {
    if (tB - tA < 1e-5 || yB - yA < 1e-5) return;
    const LA = cornerAt(s, tA, 'L');
    const RA = cornerAt(s, tA, 'R');
    const LB = cornerAt(s, tB, 'L');
    const RB = cornerAt(s, tB, 'R');

    // 8 vertices of the prism (b* = bottom Y=yA, t* = top Y=yB).
    const bLA = pushV(LA.x, yA, LA.y);
    const bRA = pushV(RA.x, yA, RA.y);
    const bLB = pushV(LB.x, yA, LB.y);
    const bRB = pushV(RB.x, yA, RB.y);
    const tLA = pushV(LA.x, yB, LA.y);
    const tRA = pushV(RA.x, yB, RA.y);
    const tLB = pushV(LB.x, yB, LB.y);
    const tRB = pushV(RB.x, yB, RB.y);

    // Determine which "side" is outward (+N side). offR > offL, and normal n
    // points to the RIGHT side. So the "right" points (R*) are on the +N side.
    // We wind so triangle normal points away from wall interior.
    //
    // Left face (side with L vertices): outward normal ≈ -N. CCW seen from -N.
    //   b: bLA → bLB → tLB → tLA
    pushQuad(bLA, bLB, tLB, tLA);
    // Right face (R vertices): outward normal ≈ +N.
    //   CCW seen from +N: bRB → bRA → tRA → tRB
    pushQuad(bRB, bRA, tRA, tRB);

    if (renderTop) {
      // top face Y=yB, normal +Y. CCW seen from +Y (looking down at it from above).
      pushQuad(tLA, tRA, tRB, tLB);
    }
    if (renderBottom) {
      // bottom face Y=yA, normal -Y.
      pushQuad(bLA, bLB, bRB, bRA);
    }
    if (renderCapStart) {
      // face at t=tA (start-cap), outward normal ≈ -U.
      pushQuad(bRA, bLA, tLA, tRA);
    }
    if (renderCapEnd) {
      // face at t=tB (end-cap), outward normal ≈ +U.
      pushQuad(bLB, bRB, tRB, tLB);
    }
  };

  // Segment loop with opening subdivision.
  for (let i = 0; i < segCount; i++) {
    const s = seg[i];
    if (s.len < 1e-6) continue;

    const isFirst = i === 0;
    const isLast = i === segCount - 1;
    const openHere = openings
      .filter((op) => op.segmentIndex === i && op.tEnd > 0 && op.tStart < s.len)
      .map((op) => ({
        t0: Math.max(0, Math.min(s.len, op.tStart)),
        t1: Math.max(0, Math.min(s.len, op.tEnd)),
        y0: Math.max(0, Math.min(height, op.yBottom)),
        y1: Math.max(0, Math.min(height, op.yTop)),
      }))
      .filter((op) => op.t1 - op.t0 > 1e-4 && op.y1 - op.y0 > 1e-4)
      .sort((a, b) => a.t0 - b.t0);

    if (openHere.length === 0) {
      emitBlock(s,
        0, s.len, 0, height,
        !closed && isFirst, !closed && isLast,
        true, true);
      continue;
    }

    // Merge overlapping openings so we always get a clean cursor sweep.
    const merged: typeof openHere = [];
    for (const op of openHere) {
      const last = merged[merged.length - 1];
      if (last && op.t0 <= last.t1 + 1e-4) {
        last.t1 = Math.max(last.t1, op.t1);
        // vertical extent: take union
        last.y0 = Math.min(last.y0, op.y0);
        last.y1 = Math.max(last.y1, op.y1);
      } else {
        merged.push({ ...op });
      }
    }

    // Sweep along t. Between openings we emit a full-height block; at each
    // opening we emit a below-hole strip and an above-hole strip.
    let cursor = 0;
    for (let k = 0; k < merged.length; k++) {
      const op = merged[k];
      // Full-height block before the opening.
      if (op.t0 > cursor + 1e-5) {
        const isStartCap = !closed && isFirst && cursor <= 1e-5;
        emitBlock(s,
          cursor, op.t0, 0, height,
          isStartCap, true /* end-cap borders hole side */,
          true, true);
      }
      // Below-hole strip.
      if (op.y0 > 1e-5) {
        emitBlock(s, op.t0, op.t1, 0, op.y0,
          true /* start-cap = hole left reveal */,
          true /* end-cap  = hole right reveal */,
          true /* TOP face = hole floor (visible from inside hole) */,
          true);
      }
      // Above-hole strip.
      if (op.y1 < height - 1e-5) {
        emitBlock(s, op.t0, op.t1, op.y1, height,
          true, true,
          true,
          true /* BOTTOM = hole ceiling (visible from inside hole) */);
      }
      cursor = op.t1;
    }
    // Trailing full-height block after last opening.
    if (cursor < s.len - 1e-5) {
      const isEndCap = !closed && isLast;
      emitBlock(s,
        cursor, s.len, 0, height,
        true /* start-cap borders previous hole */,
        isEndCap,
        true, true);
    }
  }

  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// -----------------------------------------------------------------------------
// Wall snap: find the closest wall segment to a world-space point.
//
// Returns snap info suitable for placing a door/window: the position on the
// wall centerline, the rotation.Y that aligns local +X with the segment's
// direction, and the parametric distance along the segment (t) — used later to
// register the opening.
// -----------------------------------------------------------------------------

export interface WallLike {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
  geometry?: WallGeom | null;
}

export interface WallSnap {
  wallId: string;
  segmentIndex: number;
  t: number;         // distance from segment start along centerline (world units)
  position: THREE.Vector3;
  rotationY: number;
  segmentLength: number;
  wallWidth: number;
  wallHeight: number;
  distance: number;  // how far the query point was from the segment
}

export function snapDoorWindowToWall(
  worldPos: THREE.Vector3,
  walls: WallLike[],
  maxDistance = 0.6
): WallSnap | null {
  let best: WallSnap | null = null;

  for (const w of walls) {
    const geom = w.geometry;
    if (!geom || !geom.path || geom.path.length < 2) continue;
    const path = geom.path;
    const closed = !!geom.closed && path.length >= 3;
    const segCount = closed ? path.length : path.length - 1;
    const wallH = geom.height ?? WALL_DEFAULTS.height;
    const wallW = geom.width ?? WALL_DEFAULTS.width;

    // World transform: only Y-rotation is supported for AEC walls in practice.
    const cosR = Math.cos(w.rotation[1] || 0);
    const sinR = Math.sin(w.rotation[1] || 0);
    const toWorld = (px: number, pz: number) => new THREE.Vector2(
      w.position[0] + cosR * px + sinR * pz,
      w.position[2] - sinR * px + cosR * pz,
    );

    for (let i = 0; i < segCount; i++) {
      const j = (i + 1) % path.length;
      const a = toWorld(path[i][0], path[i][2]);
      const b = toWorld(path[j][0], path[j][2]);
      const d = b.clone().sub(a);
      const L = d.length();
      if (L < 1e-4) continue;
      const u = d.clone().multiplyScalar(1 / L);

      const q = new THREE.Vector2(worldPos.x, worldPos.z);
      const t = THREE.MathUtils.clamp(q.clone().sub(a).dot(u), 0, L);
      const closest = a.clone().add(u.clone().multiplyScalar(t));
      const dist = q.distanceTo(closest);

      if (dist < maxDistance && (!best || dist < best.distance)) {
        best = {
          wallId: w.id,
          segmentIndex: i,
          t,
          position: new THREE.Vector3(closest.x, w.position[1], closest.y),
          rotationY: Math.atan2(u.y, u.x) * -1, // XZ atan2: rotate so local +X → segment dir
          segmentLength: L,
          wallWidth: wallW,
          wallHeight: wallH,
          distance: dist,
        };
      }
    }
  }
  return best;
}

// -----------------------------------------------------------------------------
// Doors and Windows (Fase 2 — unchanged public API)
// -----------------------------------------------------------------------------

export type DoorSubtype = 'pivot' | 'bifold' | 'sliding' | 'pocket';
export type WindowSubtype = 'casement' | 'sliding' | 'awning' | 'fixed' | 'pivot';

export interface DoorGeom {
  subtype?: DoorSubtype;
  width?: number;
  height?: number;
  thickness?: number;
  frameDepth?: number;
  frameSize?: number;
  openPercentage?: number;
  parentWallId?: string;
  wallSegmentIndex?: number;
  wallT?: number;
}

export interface WindowGeom {
  subtype?: WindowSubtype;
  width?: number;
  height?: number;
  frameThickness?: number;
  glassThickness?: number;
  frameDepth?: number;
  sillHeight?: number;
  openPercentage?: number;
  parentWallId?: string;
  wallSegmentIndex?: number;
  wallT?: number;
}

export const DOOR_DEFAULTS: Required<Omit<DoorGeom, 'parentWallId' | 'wallSegmentIndex' | 'wallT'>> = {
  subtype: 'pivot',
  width: 0.9,
  height: 2.1,
  thickness: 0.04,
  frameDepth: 0.2,
  frameSize: 0.05,
  openPercentage: 0,
};

export const WINDOW_DEFAULTS: Required<Omit<WindowGeom, 'parentWallId' | 'wallSegmentIndex' | 'wallT'>> = {
  subtype: 'casement',
  width: 1.2,
  height: 1.2,
  frameThickness: 0.05,
  glassThickness: 0.01,
  frameDepth: 0.2,
  sillHeight: 1.0,
  openPercentage: 0,
};

function box(w: number, h: number, d: number, tx: number, ty: number, tz: number, rotY = 0, hingeX = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(Math.max(0.001, w), Math.max(0.001, h), Math.max(0.001, d));
  const m = new THREE.Matrix4();
  if (rotY) {
    const t1 = new THREE.Matrix4().makeTranslation(-hingeX, 0, 0);
    const r = new THREE.Matrix4().makeRotationY(rotY);
    const t2 = new THREE.Matrix4().makeTranslation(hingeX + tx, ty, tz);
    m.multiplyMatrices(t2, r).multiply(t1);
  } else {
    m.makeTranslation(tx, ty, tz);
  }
  g.applyMatrix4(m);
  return g;
}

function buildFrame(W: number, H: number, D: number, JAMB: number, withSill: boolean): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(JAMB, H + JAMB, D, -W / 2 - JAMB / 2, (H + JAMB) / 2 - JAMB / 2, 0));
  parts.push(box(JAMB, H + JAMB, D, W / 2 + JAMB / 2, (H + JAMB) / 2 - JAMB / 2, 0));
  parts.push(box(W + 2 * JAMB, JAMB, D, 0, H + JAMB / 2, 0));
  if (withSill) parts.push(box(W + 2 * JAMB, JAMB, D, 0, -JAMB / 2, 0));
  return parts;
}

export function buildDoor(geom: DoorGeom): THREE.BufferGeometry {
  const g = geom || {};
  const W = Math.max(0.1, g.width ?? DOOR_DEFAULTS.width);
  const H = Math.max(0.1, g.height ?? DOOR_DEFAULTS.height);
  const T = Math.max(0.005, g.thickness ?? DOOR_DEFAULTS.thickness);
  const D = Math.max(0.02, g.frameDepth ?? DOOR_DEFAULTS.frameDepth);
  const J = Math.max(0.01, g.frameSize ?? DOOR_DEFAULTS.frameSize);
  const O = Math.max(0, Math.min(1, g.openPercentage ?? 0));
  const sub: DoorSubtype = g.subtype ?? 'pivot';

  const parts = buildFrame(W, H, D, J, false);

  if (sub === 'pivot') {
    const ang = -O * (Math.PI / 2);
    parts.push(box(W, H, T, 0, H / 2, 0, ang, -W / 2));
  } else if (sub === 'bifold') {
    const hw = W / 2;
    const ang = O * (Math.PI / 2);
    parts.push(box(hw, H, T, -hw / 2, H / 2, 0, ang, -W / 2));
    parts.push(box(hw, H, T, hw / 2, H / 2, 0, -ang, W / 2));
  } else if (sub === 'sliding') {
    parts.push(box(W, H, T, O * W, H / 2, D / 2 - T / 2));
  } else {
    parts.push(box(W, H, T, O * W, H / 2, 0));
  }

  const merged = mergeGeometries(parts, false) || parts[0];
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function buildWindow(geom: WindowGeom): THREE.BufferGeometry {
  const g = geom || {};
  const W = Math.max(0.1, g.width ?? WINDOW_DEFAULTS.width);
  const H = Math.max(0.1, g.height ?? WINDOW_DEFAULTS.height);
  const D = Math.max(0.02, g.frameDepth ?? WINDOW_DEFAULTS.frameDepth);
  const FT = Math.max(0.01, g.frameThickness ?? WINDOW_DEFAULTS.frameThickness);
  const GT = Math.max(0.002, g.glassThickness ?? WINDOW_DEFAULTS.glassThickness);
  const O = Math.max(0, Math.min(1, g.openPercentage ?? 0));
  const sub: WindowSubtype = g.subtype ?? 'casement';

  const parts = buildFrame(W, H, D, FT, true);
  const gw = Math.max(0.02, W - 2 * FT * 0.4);
  const gh = Math.max(0.02, H - 2 * FT * 0.4);

  if (sub === 'casement') {
    const ang = -O * (Math.PI / 2);
    parts.push(box(gw, gh, GT, 0, H / 2, 0, ang, -W / 2));
  } else if (sub === 'sliding') {
    const hw = gw / 2;
    parts.push(box(hw, gh, GT, -hw / 2, H / 2, -GT));
    parts.push(box(hw, gh, GT, hw / 2 + O * hw, H / 2, GT));
  } else if (sub === 'awning') {
    const gg = new THREE.BoxGeometry(gw, gh, GT);
    const ang = O * (Math.PI / 3);
    const place = new THREE.Matrix4().makeTranslation(0, H / 2, 0);
    const hinge1 = new THREE.Matrix4().makeTranslation(0, -H, 0);
    const rot = new THREE.Matrix4().makeRotationX(ang);
    const hinge2 = new THREE.Matrix4().makeTranslation(0, H, 0);
    const m = new THREE.Matrix4().multiplyMatrices(hinge2, rot).multiply(hinge1).multiply(place);
    gg.applyMatrix4(m);
    parts.push(gg);
  } else if (sub === 'pivot') {
    const gg = new THREE.BoxGeometry(gw, gh, GT);
    const ang = O * (Math.PI / 2);
    const place = new THREE.Matrix4().makeTranslation(0, H / 2, 0);
    const rot = new THREE.Matrix4().makeRotationX(ang);
    const m = new THREE.Matrix4().multiplyMatrices(rot, place);
    gg.applyMatrix4(m);
    parts.push(gg);
  } else {
    parts.push(box(gw, gh, GT, 0, H / 2, 0));
  }

  const merged = mergeGeometries(parts, false) || parts[0];
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
