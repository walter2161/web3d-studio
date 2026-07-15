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
