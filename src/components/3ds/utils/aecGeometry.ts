// AEC (Architecture/Engineering/Construction) parametric objects.
// Fase 1: Wall. Fases seguintes: Door, Window, Stairs, Railing, Foliage.
//
// A Wall is defined by a polyline (path) on the XZ plane plus width/height and
// justification. Corners are computed as miter joints between adjacent offset
// polylines, so paths auto-thicken without booleans and rebuild cheaply on any
// parameter change.
//
// path vertices are stored in the object's LOCAL coordinate system (relative to
// its `position`). Y in the path is ignored — the wall grows from y=0 to y=height.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type WallJustification = 'left' | 'center' | 'right';

export interface WallGeom {
  path?: [number, number, number][];
  width?: number;
  height?: number;
  justification?: WallJustification;
  closed?: boolean;
  // Reserved for Fase 3 — non-destructive openings created by doors/windows.
  // openings?: WallOpening[];
}

export const WALL_DEFAULTS: Required<Pick<WallGeom, 'width' | 'height' | 'justification' | 'closed'>> = {
  width: 0.2,
  height: 2.7,
  justification: 'center',
  closed: false,
};

/**
 * Build a solid wall mesh from a polyline path. Corners use miter joints so
 * segments blend without overlap. Extremities and (when open) the two ends
 * are capped. The mesh is centered on the wall path in XZ; Y goes from 0 to
 * `height`.
 */
export function buildWall(geom: WallGeom): THREE.BufferGeometry {
  const path = geom.path || [];
  const g = new THREE.BufferGeometry();
  if (path.length < 2) return g;

  const width = Math.max(0.001, geom.width ?? WALL_DEFAULTS.width);
  const height = Math.max(0.001, geom.height ?? WALL_DEFAULTS.height);
  const just = geom.justification ?? WALL_DEFAULTS.justification;
  const closed = !!geom.closed && path.length >= 3;

  // Work in the XZ plane (u = x, v = z).
  const pts = path.map((p) => new THREE.Vector2(p[0], p[2]));
  const n = pts.length;

  // Offset amounts to the "left" and "right" side of the path direction.
  let offL: number, offR: number;
  if (just === 'center') { offL = -width / 2; offR = width / 2; }
  else if (just === 'left') { offL = -width; offR = 0; }
  else { offL = 0; offR = width; }

  // Segment normals (rotated 90° from tangent).
  const segCount = closed ? n : n - 1;
  const segNrm: THREE.Vector2[] = [];
  for (let i = 0; i < segCount; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dir = b.clone().sub(a);
    if (dir.lengthSq() < 1e-10) {
      segNrm.push(new THREE.Vector2(0, 1));
    } else {
      dir.normalize();
      // "Left" normal (rotate +90°): (-dy, dx). In XZ, this is a consistent side.
      segNrm.push(new THREE.Vector2(-dir.y, dir.x));
    }
  }

  // For each vertex compute the miter offset toward the "left" side; the right
  // side is just its negation. This produces a clean joint at every corner and
  // matches the standard 3ds Max wall behaviour.
  const leftPts: THREE.Vector2[] = [];
  const rightPts: THREE.Vector2[] = [];
  const miter = (v: THREE.Vector2, prev: THREE.Vector2 | null, next: THREE.Vector2 | null, off: number): THREE.Vector2 => {
    if (!prev && !next) return v.clone();
    if (!prev) return v.clone().add(next!.clone().multiplyScalar(off));
    if (!next) return v.clone().add(prev.clone().multiplyScalar(off));
    const bis = prev.clone().add(next);
    if (bis.lengthSq() < 1e-8) {
      // 180° reversal — fall back to segment normal
      return v.clone().add(next.clone().multiplyScalar(off));
    }
    bis.normalize();
    // Miter length = off / cos(half-angle). cos(half-angle) = bis · prev
    const cosHalf = bis.dot(prev);
    const clamp = Math.max(0.25, Math.abs(cosHalf)) * Math.sign(cosHalf || 1);
    return v.clone().add(bis.multiplyScalar(off / clamp));
  };

  for (let i = 0; i < n; i++) {
    const prev = i === 0 ? (closed ? segNrm[n - 1] : null) : segNrm[i - 1];
    const next = i === n - 1 ? (closed ? segNrm[0] : null) : segNrm[i];
    const p = pts[i];
    leftPts.push(miter(p, prev, next, offL));
    rightPts.push(miter(p, prev, next, offR));
  }

  // Build faces segment-by-segment. Each segment is a rectangular prism between
  // (leftPts[i], leftPts[i+1]) and (rightPts[i], rightPts[i+1]) with the wall
  // height on Y.
  const positions: number[] = [];
  const indices: number[] = [];
  let vi = 0;
  const pushV = (x: number, y: number, z: number) => { positions.push(x, y, z); return vi++; };
  const pushTri = (a: number, b: number, c: number) => { indices.push(a, b, c); };
  const pushQuad = (a: number, b: number, c: number, d: number) => { pushTri(a, b, c); pushTri(a, c, d); };

  for (let i = 0; i < segCount; i++) {
    const j = (i + 1) % n;
    const l0 = leftPts[i], l1 = leftPts[j];
    const r0 = rightPts[i], r1 = rightPts[j];

    const bl0 = pushV(l0.x, 0, l0.y);
    const bl1 = pushV(l1.x, 0, l1.y);
    const br0 = pushV(r0.x, 0, r0.y);
    const br1 = pushV(r1.x, 0, r1.y);
    const tl0 = pushV(l0.x, height, l0.y);
    const tl1 = pushV(l1.x, height, l1.y);
    const tr0 = pushV(r0.x, height, r0.y);
    const tr1 = pushV(r1.x, height, r1.y);

    // Top (Y = height): looking down +Y → CCW is tl0 → tr0 → tr1 → tl1
    pushQuad(tl0, tr0, tr1, tl1);
    // Bottom (Y = 0): CCW when viewed from -Y is reversed
    pushQuad(bl0, bl1, br1, br0);
    // Left side wall (outer face, y stacks)
    pushQuad(bl0, tl0, tl1, bl1);
    // Right side wall
    pushQuad(br0, br1, tr1, tr0);
    // End caps for open walls
    if (!closed) {
      if (i === 0)              pushQuad(bl0, br0, tr0, tl0);
      if (i === segCount - 1)   pushQuad(bl1, tl1, tr1, br1);
    }
  }

  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// -------------------------------------------------------------------------
// Doors and Windows (Fase 2)
// -------------------------------------------------------------------------
//
// Local coordinate convention for both door and window:
//   +X = width  (opening extends from -W/2 to +W/2)
//   +Y = height (bottom sits at Y=0, top at Y=H)
//   +Z = depth  (frame is centered on Z=0, extends ±frameDepth/2)
//
// The pivot is at the CENTER OF BASE (Y=0, X=0, Z=0), matching 3ds Max's
// R3 convention for architectural objects — makes them snap-to-floor when
// dropped and easy to align with wall segments.

export type DoorSubtype = 'pivot' | 'bifold' | 'sliding' | 'pocket';
export type WindowSubtype = 'casement' | 'sliding' | 'awning' | 'fixed' | 'pivot';

export interface DoorGeom {
  subtype?: DoorSubtype;
  width?: number;
  height?: number;
  thickness?: number;   // leaf thickness
  frameDepth?: number;  // how deep the frame sits along Z (matches wall width)
  frameSize?: number;   // jamb / head width around the opening
  openPercentage?: number; // 0..1
  parentWallId?: string;   // filled by Fase 3 (wall attachment)
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
}

export const DOOR_DEFAULTS: Required<Omit<DoorGeom, 'parentWallId'>> = {
  subtype: 'pivot',
  width: 0.9,
  height: 2.1,
  thickness: 0.04,
  frameDepth: 0.2,
  frameSize: 0.05,
  openPercentage: 0,
};

export const WINDOW_DEFAULTS: Required<Omit<WindowGeom, 'parentWallId'>> = {
  subtype: 'casement',
  width: 1.2,
  height: 1.2,
  frameThickness: 0.05,
  glassThickness: 0.01,
  frameDepth: 0.2,
  sillHeight: 1.0,
  openPercentage: 0,
};

// Helper: create a translated (+ optionally rotated) box and return its geometry.
function box(w: number, h: number, d: number, tx: number, ty: number, tz: number, rotY = 0, hingeX = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(Math.max(0.001, w), Math.max(0.001, h), Math.max(0.001, d));
  const m = new THREE.Matrix4();
  if (rotY) {
    // Rotate around a vertical axis passing through hingeX, then translate.
    const t1 = new THREE.Matrix4().makeTranslation(-hingeX, 0, 0);
    const r  = new THREE.Matrix4().makeRotationY(rotY);
    const t2 = new THREE.Matrix4().makeTranslation(hingeX + tx, ty, tz);
    m.multiplyMatrices(t2, r).multiply(t1);
  } else {
    m.makeTranslation(tx, ty, tz);
  }
  g.applyMatrix4(m);
  return g;
}

// Build 3-sided frame (left jamb, right jamb, top head). Bottom is skipped so
// the door meets the floor. For a window, we add a sill at Y=0 too.
function buildFrame(W: number, H: number, D: number, JAMB: number, withSill: boolean): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  // Left jamb
  parts.push(box(JAMB, H + JAMB, D, -W / 2 - JAMB / 2, (H + JAMB) / 2 - JAMB / 2, 0));
  // Right jamb
  parts.push(box(JAMB, H + JAMB, D, W / 2 + JAMB / 2, (H + JAMB) / 2 - JAMB / 2, 0));
  // Head
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

  // Leaf(s). All leaves have Y=H/2 (vertical center), and Z=0 (centered).
  if (sub === 'pivot') {
    const ang = -O * (Math.PI / 2); // open into +Z (toward viewer)
    // Hinge at -W/2. Leaf spans from -W/2 to +W/2 in X when closed.
    parts.push(box(W, H, T, 0, H / 2, 0, ang, -W / 2));
  } else if (sub === 'bifold') {
    // Two half-width leaves. Left hinge at -W/2, right hinge at +W/2.
    const hw = W / 2;
    const ang = O * (Math.PI / 2);
    parts.push(box(hw, H, T,  -hw / 2, H / 2, 0,  ang, -W / 2));
    parts.push(box(hw, H, T,   hw / 2, H / 2, 0, -ang,  W / 2));
  } else if (sub === 'sliding') {
    // Slide along +X, offset in Z so it doesn't clip the frame.
    parts.push(box(W, H, T, O * W, H / 2, D / 2 - T / 2));
  } else /* pocket */ {
    // Slide into the wall (offset behind the frame in Z=0 line).
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

  // Window frames have a sill so buildFrame withSill=true. Frame uses FT as
  // the jamb width (thinner than door jambs typically).
  const parts = buildFrame(W, H, D, FT, true);

  // Inner glass panel dimensions (opening minus a small reveal so glass reads).
  const gw = Math.max(0.02, W - 2 * FT * 0.4);
  const gh = Math.max(0.02, H - 2 * FT * 0.4);

  if (sub === 'casement') {
    // Vertical hinge on the left, opens outward in +Z.
    const ang = -O * (Math.PI / 2);
    parts.push(box(gw, gh, GT, 0, H / 2, 0, ang, -W / 2));
  } else if (sub === 'sliding') {
    // Two panes, half-width each; right one slides.
    const hw = gw / 2;
    parts.push(box(hw, gh, GT, -hw / 2, H / 2, -GT));
    parts.push(box(hw, gh, GT,  hw / 2 + O * hw, H / 2, GT));
  } else if (sub === 'awning') {
    // Horizontal hinge on the top edge; opens outward at bottom.
    // We can't rotate around X easily with our helper — inline the transform.
    const gg = new THREE.BoxGeometry(gw, gh, GT);
    const hingeY = H;
    const ang = O * (Math.PI / 3); // up to 60°
    const m = new THREE.Matrix4();
    const t1 = new THREE.Matrix4().makeTranslation(0, -hingeY, 0);
    const r  = new THREE.Matrix4().makeRotationX(ang);
    const t2 = new THREE.Matrix4().makeTranslation(0, hingeY - gh / 2 + H / 2 + gh / 2, 0); // place glass then move up
    // Simpler: create glass centered at (0, H/2, 0) and rotate around (0, H, 0).
    const place = new THREE.Matrix4().makeTranslation(0, H / 2, 0);
    const hinge1 = new THREE.Matrix4().makeTranslation(0, -H, 0);
    const rot = new THREE.Matrix4().makeRotationX(ang);
    const hinge2 = new THREE.Matrix4().makeTranslation(0, H, 0);
    m.multiplyMatrices(hinge2, rot).multiply(hinge1).multiply(place);
    gg.applyMatrix4(m);
    parts.push(gg);
  } else if (sub === 'pivot') {
    // Horizontal center axis: rotate glass around (Y = H/2, Z = 0) by openPct.
    const gg = new THREE.BoxGeometry(gw, gh, GT);
    const ang = O * (Math.PI / 2);
    const m = new THREE.Matrix4();
    const place = new THREE.Matrix4().makeTranslation(0, H / 2, 0);
    const rot = new THREE.Matrix4().makeRotationX(ang);
    m.multiplyMatrices(rot, place);
    // Move up to Y=H/2 relative to origin
    const finalT = new THREE.Matrix4().makeTranslation(0, 0, 0);
    finalT.multiply(m);
    gg.applyMatrix4(finalT);
    parts.push(gg);
  } else {
    // fixed
    parts.push(box(gw, gh, GT, 0, H / 2, 0));
  }

  const merged = mergeGeometries(parts, false) || parts[0];
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
