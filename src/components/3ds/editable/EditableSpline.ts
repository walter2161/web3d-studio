/**
 * EditableSpline — data model for 3ds Max-style Editable Spline objects.
 *
 * Mirrors the mesh-editing pipeline (see EditableMesh.ts) but for 1D splines:
 *   splines  — connected chains of knots, each optionally closed
 *   knots    — vertices carrying position, tangent handles and a KnotType
 *   segments — ordered pairs of knot ids belonging to a single spline
 *
 * The class is *plain data* + a handful of local mutations. Rendering (tube
 * mesh, knot markers) is derived in `toTubeGeometry` and `toCurvePaths`.
 * All ids are numeric and stable across ops; deleting a knot re-links the
 * neighbouring segments so ids referenced by other systems remain valid.
 */
import * as THREE from 'three';
import { SHAPE_DEFAULTS } from '../utils/extendedGeometry';

export type KnotType = 'corner' | 'smooth' | 'bezier' | 'bezierCorner';
export type SplineSubLevel = 'sknot' | 'ssegment' | 'sspline';

export interface Knot {
  id: number;
  pos: THREE.Vector3;
  inHandle: THREE.Vector3;   // world offset FROM pos (matches Max convention)
  outHandle: THREE.Vector3;
  type: KnotType;
}
export interface Segment { id: number; a: number; b: number; splineId: number; }
export interface Spline  { id: number; knots: number[]; closed: boolean; }

export const KNOT_COLORS: Record<KnotType, string> = {
  corner:       '#00ff33',
  smooth:       '#ffdd00',
  bezier:       '#3399ff',
  bezierCorner: '#00e6e6',
};

export class EditableSpline {
  splines = new Map<number, Spline>();
  knots   = new Map<number, Knot>();
  segments= new Map<number, Segment>();
  private nextKnot = 1;
  private nextSeg = 1;
  private nextSpline = 1;

  /** Common rendering/interpolation params, mirrored from parametric shapes. */
  render: {
    renderableViewport: boolean; renderableRender: boolean;
    renderRectangular: boolean;
    thickness: number; sides: number; angle: number;
    rectLength: number; rectWidth: number;
    interpolationSteps: number; adaptive: boolean; optimize: boolean;
  } = {
    renderableViewport: true, renderableRender: true, renderRectangular: false,
    thickness: 0.02, sides: 6, angle: 0, rectLength: 0.04, rectWidth: 0.02,
    interpolationSteps: 8, adaptive: true, optimize: false,
  };

  // --- construction --------------------------------------------------------
  addKnot(pos: THREE.Vector3, type: KnotType = 'corner', inH?: THREE.Vector3, outH?: THREE.Vector3): Knot {
    const k: Knot = {
      id: this.nextKnot++,
      pos: pos.clone(),
      inHandle: inH?.clone() ?? new THREE.Vector3(),
      outHandle: outH?.clone() ?? new THREE.Vector3(),
      type,
    };
    this.knots.set(k.id, k);
    return k;
  }

  addSpline(knotIds: number[], closed: boolean): Spline {
    const s: Spline = { id: this.nextSpline++, knots: [...knotIds], closed };
    this.splines.set(s.id, s);
    this.rebuildSegments(s.id);
    // Auto-derive Bezier tangents for smooth/bezier knots.
    this.recomputeSmoothTangents(s.id);
    return s;
  }

  private rebuildSegments(splineId: number) {
    // Drop existing segments for this spline
    Array.from(this.segments.values()).forEach((seg) => {
      if (seg.splineId === splineId) this.segments.delete(seg.id);
    });
    const s = this.splines.get(splineId);
    if (!s) return;
    const n = s.knots.length;
    for (let i = 0; i < n - 1; i++) {
      const seg: Segment = { id: this.nextSeg++, a: s.knots[i], b: s.knots[i + 1], splineId };
      this.segments.set(seg.id, seg);
    }
    if (s.closed && n >= 2) {
      const seg: Segment = { id: this.nextSeg++, a: s.knots[n - 1], b: s.knots[0], splineId };
      this.segments.set(seg.id, seg);
    }
  }

  /** Given a Catmull-like schema, recompute tangent handles for smooth knots. */
  recomputeSmoothTangents(splineId: number) {
    const s = this.splines.get(splineId);
    if (!s) return;
    const n = s.knots.length;
    for (let i = 0; i < n; i++) {
      const k = this.knots.get(s.knots[i]);
      if (!k || k.type === 'corner' || k.type === 'bezierCorner') continue;
      const prevIdx = i === 0 ? (s.closed ? n - 1 : 0) : i - 1;
      const nextIdx = i === n - 1 ? (s.closed ? 0 : n - 1) : i + 1;
      const p = this.knots.get(s.knots[prevIdx])!.pos;
      const q = this.knots.get(s.knots[nextIdx])!.pos;
      const dir = new THREE.Vector3().subVectors(q, p).multiplyScalar(0.25);
      k.outHandle.copy(dir);
      k.inHandle.copy(dir).multiplyScalar(-1);
    }
  }

  // --- selection helpers ---------------------------------------------------
  splineIdOfKnot(kid: number): number | null {
    for (const s of this.splines.values()) if (s.knots.includes(kid)) return s.id;
    return null;
  }
  splineIdOfSegment(sid: number): number | null {
    return this.segments.get(sid)?.splineId ?? null;
  }

  // --- ops -----------------------------------------------------------------
  setKnotPosition(kid: number, pos: THREE.Vector3) {
    const k = this.knots.get(kid); if (!k) return;
    k.pos.copy(pos);
    const sid = this.splineIdOfKnot(kid);
    if (sid != null && k.type === 'smooth') this.recomputeSmoothTangents(sid);
  }

  setKnotHandle(kid: number, which: 'in' | 'out', offset: THREE.Vector3) {
    const k = this.knots.get(kid); if (!k) return;
    if (k.type === 'corner') k.type = 'bezierCorner';
    const target = which === 'in' ? k.inHandle : k.outHandle;
    const opposite = which === 'in' ? k.outHandle : k.inHandle;
    target.copy(offset);
    if (k.type === 'bezier' || k.type === 'smooth') {
      opposite.copy(offset).multiplyScalar(-1);
    }
  }

  setKnotType(kid: number, type: KnotType) {
    const k = this.knots.get(kid); if (!k) return;
    k.type = type;
    const sid = this.splineIdOfKnot(kid);
    if (sid != null && (type === 'smooth' || (type === 'bezier' && k.inHandle.lengthSq() < 1e-8 && k.outHandle.lengthSq() < 1e-8))) {
      this.recomputeSmoothTangents(sid);
    }
  }

  deleteKnot(kid: number) {
    const sid = this.splineIdOfKnot(kid);
    if (sid == null) return;
    const s = this.splines.get(sid)!;
    s.knots = s.knots.filter((id) => id !== kid);
    this.knots.delete(kid);
    if (s.knots.length < 2) {
      this.splines.delete(sid);
      Array.from(this.segments.values()).forEach((seg) => {
        if (seg.splineId === sid) this.segments.delete(seg.id);
      });
    } else {
      this.rebuildSegments(sid);
      this.recomputeSmoothTangents(sid);
    }
  }

  /** Split a segment: opens a closed spline or breaks a knot into two coincident ones. */
  breakAtKnot(kid: number) {
    const sid = this.splineIdOfKnot(kid);
    if (sid == null) return;
    const s = this.splines.get(sid)!;
    if (s.closed) {
      // Just open at this knot — rotate list so kid is first, then unclose.
      const idx = s.knots.indexOf(kid);
      s.knots = [...s.knots.slice(idx), ...s.knots.slice(0, idx)];
      s.closed = false;
    } else {
      // Duplicate the knot and split into two splines.
      const idx = s.knots.indexOf(kid);
      if (idx <= 0 || idx >= s.knots.length - 1) return; // endpoint has nothing to break
      const original = this.knots.get(kid)!;
      const dup = this.addKnot(original.pos, original.type, original.inHandle, original.outHandle);
      const left = s.knots.slice(0, idx + 1);
      const right = [dup.id, ...s.knots.slice(idx + 1)];
      s.knots = left;
      this.addSpline(right, false);
    }
    this.rebuildSegments(sid);
  }

  /** Weld two coincident (or close) knots into one. */
  weld(threshold = 0.01) {
    const ids = Array.from(this.knots.keys());
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = this.knots.get(ids[i]); const b = this.knots.get(ids[j]);
        if (!a || !b) continue;
        if (a.pos.distanceTo(b.pos) <= threshold) {
          // remap b → a
          this.splines.forEach((s) => {
            s.knots = s.knots.map((k) => k === b.id ? a.id : k);
          });
          this.knots.delete(b.id);
        }
      }
    }
    this.splines.forEach((s) => this.rebuildSegments(s.id));
  }

  /** Insert a new knot at the midpoint of a segment. */
  refineSegment(segId: number, t = 0.5) {
    const seg = this.segments.get(segId); if (!seg) return;
    const a = this.knots.get(seg.a)!; const b = this.knots.get(seg.b)!;
    const p = new THREE.Vector3().lerpVectors(a.pos, b.pos, t);
    const k = this.addKnot(p, 'corner');
    const s = this.splines.get(seg.splineId)!;
    const ia = s.knots.indexOf(seg.a);
    const ib = s.knots.indexOf(seg.b);
    // Insert between ia and ib, taking care of the wrap-around segment.
    if (ib === ia + 1) s.knots.splice(ib, 0, k.id);
    else s.knots.push(k.id); // wrap segment (last→first)
    this.rebuildSegments(seg.splineId);
    this.recomputeSmoothTangents(seg.splineId);
  }

  setClosed(splineId: number, closed: boolean) {
    const s = this.splines.get(splineId); if (!s) return;
    s.closed = closed;
    this.rebuildSegments(splineId);
  }

  reverseSpline(splineId: number) {
    const s = this.splines.get(splineId); if (!s) return;
    s.knots.reverse();
    this.rebuildSegments(splineId);
  }

  // --- geometry output -----------------------------------------------------
  /** Convert one spline to a THREE.Curve suitable for tube extrusion. */
  toCurve(splineId: number): THREE.Curve<THREE.Vector3> | null {
    const s = this.splines.get(splineId); if (!s || s.knots.length < 2) return null;
    const path = new THREE.CurvePath<THREE.Vector3>();
    const n = s.knots.length;
    const last = s.closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = this.knots.get(s.knots[i])!;
      const b = this.knots.get(s.knots[(i + 1) % n])!;
      const aIsBez = a.type === 'bezier' || a.type === 'bezierCorner' || a.type === 'smooth';
      const bIsBez = b.type === 'bezier' || b.type === 'bezierCorner' || b.type === 'smooth';
      if (!aIsBez && !bIsBez) {
        path.add(new THREE.LineCurve3(a.pos.clone(), b.pos.clone()));
      } else {
        const c1 = new THREE.Vector3().addVectors(a.pos, a.outHandle);
        const c2 = new THREE.Vector3().addVectors(b.pos, b.inHandle);
        path.add(new THREE.CubicBezierCurve3(a.pos.clone(), c1, c2, b.pos.clone()));
      }
    }
    return path;
  }

  /** Tube geometry per spline, merged; returns null if the spline has no length. */
  toTubeGeometry(): THREE.BufferGeometry | null {
    const geoms: THREE.BufferGeometry[] = [];
    this.splines.forEach((s) => {
      const c = this.toCurve(s.id); if (!c) return;
      const segCount = Math.max(4, this.render.interpolationSteps * Math.max(1, s.knots.length));
      try {
        const tube = new THREE.TubeGeometry(c, segCount, Math.max(0.001, this.render.thickness), Math.max(3, this.render.sides), s.closed);
        geoms.push(tube);
      } catch { /* degenerate curve */ }
    });
    if (!geoms.length) return null;
    if (geoms.length === 1) return geoms[0];
    // simple merge: concatenate positions
    const merged = new THREE.BufferGeometry();
    let posArr: number[] = []; let normArr: number[] = [];
    geoms.forEach((g) => {
      const p = g.getAttribute('position') as THREE.BufferAttribute;
      const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        posArr.push(p.getX(i), p.getY(i), p.getZ(i));
        normArr.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      }
    });
    merged.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normArr, 3));
    merged.computeBoundingSphere();
    return merged;
  }

  /** Sample world-space points along the currently active curve (for gizmo picking of segments). */
  sampleSegmentPoints(steps = 16): { segId: number; pts: THREE.Vector3[] }[] {
    const out: { segId: number; pts: THREE.Vector3[] }[] = [];
    this.segments.forEach((seg) => {
      const a = this.knots.get(seg.a); const b = this.knots.get(seg.b);
      if (!a || !b) return;
      const aBez = a.type !== 'corner';
      const bBez = b.type !== 'corner';
      const pts: THREE.Vector3[] = [];
      if (!aBez && !bBez) { pts.push(a.pos.clone(), b.pos.clone()); }
      else {
        const c1 = new THREE.Vector3().addVectors(a.pos, a.outHandle);
        const c2 = new THREE.Vector3().addVectors(b.pos, b.inHandle);
        const c = new THREE.CubicBezierCurve3(a.pos.clone(), c1, c2, b.pos.clone());
        for (let i = 0; i <= steps; i++) pts.push(c.getPoint(i / steps));
      }
      out.push({ segId: seg.id, pts });
    });
    return out;
  }

  serialize(): any {
    return {
      splines: Array.from(this.splines.values()),
      knots: Array.from(this.knots.values()).map((k) => ({ ...k, pos: k.pos.toArray(), inHandle: k.inHandle.toArray(), outHandle: k.outHandle.toArray() })),
      segments: Array.from(this.segments.values()),
      render: { ...this.render },
      _next: [this.nextKnot, this.nextSeg, this.nextSpline],
    };
  }
  static deserialize(data: any): EditableSpline {
    const es = new EditableSpline();
    if (!data) return es;
    (data.knots || []).forEach((k: any) => {
      const pos = Array.isArray(k.pos) ? k.pos : [0, 0, 0];
      const inRaw = Array.isArray(k.inHandle) ? k.inHandle : Array.isArray(k.inH) ? k.inH : [0, 0, 0];
      const outRaw = Array.isArray(k.outHandle) ? k.outHandle : Array.isArray(k.outH) ? k.outH : [0, 0, 0];
      const inHandle = new THREE.Vector3().fromArray(inRaw);
      const outHandle = new THREE.Vector3().fromArray(outRaw);
      const inferred: KnotType = inHandle.lengthSq() > 1e-8 || outHandle.lengthSq() > 1e-8 ? 'bezier' : 'corner';
      es.knots.set(k.id, {
        id: k.id,
        type: (k.type === 'corner' || k.type === 'smooth' || k.type === 'bezier' || k.type === 'bezierCorner') ? k.type : inferred,
        pos: new THREE.Vector3().fromArray(pos),
        inHandle,
        outHandle,
      });
    });
    (data.splines || []).forEach((s: any) => es.splines.set(s.id, { ...s, knots: Array.isArray(s.knots) ? [...s.knots] : [] }));
    (data.segments || []).forEach((seg: any) => es.segments.set(seg.id, { ...seg }));
    if (!es.segments.size) es.splines.forEach((s) => es.rebuildSegments(s.id));
    if (data.render) es.render = { ...es.render, ...data.render };
    const [nk, ns, np] = data._next || [];
    const maxK = Math.max(0, ...Array.from(es.knots.keys()));
    const maxS = Math.max(0, ...Array.from(es.segments.keys()));
    const maxP = Math.max(0, ...Array.from(es.splines.keys()));
    es.nextKnot = Math.max(nk || 1, maxK + 1);
    es.nextSeg = Math.max(ns || 1, maxS + 1);
    es.nextSpline = Math.max(np || 1, maxP + 1);
    return es;
  }
}

/**
 * Build an EditableSpline from a parametric shape + its params. Covers all
 * shape kinds by sampling a THREE curve into evenly-spaced knots. Rectangle
 * and NGon keep sharp corners; Circle/Ellipse/Donut/Arc use bezier knots.
 */
export function paramsToEditableSpline(kind: string, params: any): EditableSpline {
  const es = new EditableSpline();
  // Carry over shared render/interpolation params if present.
  const p = { ...(SHAPE_DEFAULTS as any)[kind], ...(params || {}) };
  es.render.renderableViewport = p.renderableViewport ?? true;
  es.render.renderableRender   = p.renderableRender   ?? true;
  es.render.renderRectangular  = p.renderRectangular  ?? false;
  es.render.thickness          = p.thickness          ?? 0.02;
  es.render.sides              = p.sides              ?? 6;
  es.render.angle              = p.angle              ?? 0;
  es.render.rectLength         = p.rectLength         ?? 0.04;
  es.render.rectWidth          = p.rectWidth          ?? 0.02;
  es.render.interpolationSteps = p.interpolationSteps ?? 8;
  es.render.adaptive           = p.adaptive           ?? true;
  es.render.optimize           = p.optimize           ?? false;

  const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

  switch (kind) {
    case 'rectangle': {
      const w = p.width ?? 1, h = p.height ?? 0.7;
      const ids = [
        es.addKnot(V(-w / 2, -h / 2), 'corner').id,
        es.addKnot(V( w / 2, -h / 2), 'corner').id,
        es.addKnot(V( w / 2,  h / 2), 'corner').id,
        es.addKnot(V(-w / 2,  h / 2), 'corner').id,
      ];
      es.addSpline(ids, true);
      break;
    }
    case 'line': {
      const sourceKnots: Array<{ pos: number[]; inH?: number[]; outH?: number[]; inHandle?: number[]; outHandle?: number[]; type?: KnotType }> | undefined = Array.isArray(p.knots) ? p.knots : undefined;
      if (sourceKnots && sourceKnots.length >= 2) {
        const ids = sourceKnots.map((k) => {
          const inRaw = Array.isArray(k.inHandle) ? k.inHandle : Array.isArray(k.inH) ? k.inH : [0, 0, 0];
          const outRaw = Array.isArray(k.outHandle) ? k.outHandle : Array.isArray(k.outH) ? k.outH : [0, 0, 0];
          const inH = new THREE.Vector3().fromArray(inRaw);
          const outH = new THREE.Vector3().fromArray(outRaw);
          const inferred: KnotType = inH.lengthSq() > 1e-8 || outH.lengthSq() > 1e-8 ? 'bezier' : 'corner';
          const type: KnotType = (k.type === 'corner' || k.type === 'smooth' || k.type === 'bezier' || k.type === 'bezierCorner') ? k.type : inferred;
          return es.addKnot(new THREE.Vector3().fromArray(k.pos || [0, 0, 0]), type, inH, outH).id;
        });
        es.addSpline(ids, !!p.closed);
        break;
      }
      if (Array.isArray(p.points) && p.points.length >= 2) {
        const ids = p.points.map((pt: number[]) => es.addKnot(new THREE.Vector3().fromArray(pt || [0, 0, 0]), 'corner').id);
        es.addSpline(ids, !!p.closed);
        break;
      }
      const len = p.length ?? 1;
      const ids = [
        es.addKnot(V(-len / 2, 0, 0), 'corner').id,
        es.addKnot(V( len / 2, 0, 0), 'corner').id,
      ];
      es.addSpline(ids, false);
      break;
    }
    case 'circle': {
      const r = p.radius ?? 0.5;
      const N = 4;
      const ids: number[] = [];
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        ids.push(es.addKnot(V(Math.cos(a) * r, Math.sin(a) * r), 'bezier').id);
      }
      es.addSpline(ids, true);
      break;
    }
    case 'ellipse': {
      const rx = p.radiusX ?? 0.7, ry = p.radiusY ?? 0.4;
      const N = 4;
      const ids: number[] = [];
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        ids.push(es.addKnot(V(Math.cos(a) * rx, Math.sin(a) * ry), 'bezier').id);
      }
      es.addSpline(ids, true);
      break;
    }
    case 'ngon': {
      const r = p.radius ?? 0.5, sides = Math.max(3, p.sides ?? 6);
      const ids: number[] = [];
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
        ids.push(es.addKnot(V(Math.cos(a) * r, Math.sin(a) * r), p.circular ? 'bezier' : 'corner').id);
      }
      es.addSpline(ids, true);
      break;
    }
    case 'star': {
      const r1 = p.radius1 ?? 0.5, r2 = p.radius2 ?? 0.2, pts = Math.max(3, p.points ?? 5);
      const ids: number[] = [];
      for (let i = 0; i < pts * 2; i++) {
        const rr = i % 2 === 0 ? r1 : r2;
        const a = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
        ids.push(es.addKnot(V(Math.cos(a) * rr, Math.sin(a) * rr), 'corner').id);
      }
      es.addSpline(ids, true);
      break;
    }
    case 'arc': {
      const r = p.radius ?? 0.5, from = ((p.from ?? 0) * Math.PI) / 180, to = ((p.to ?? 180) * Math.PI) / 180;
      const N = 8;
      const ids: number[] = [];
      for (let i = 0; i <= N; i++) {
        const a = from + (to - from) * (i / N);
        ids.push(es.addKnot(V(Math.cos(a) * r, Math.sin(a) * r), 'bezier').id);
      }
      es.addSpline(ids, !!p.pie);
      break;
    }
    case 'donut': {
      // Two concentric circles as separate splines.
      const outer = p.radius1 ?? 0.6, inner = p.radius2 ?? 0.35;
      for (const r of [outer, inner]) {
        const N = 4;
        const ids: number[] = [];
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2;
          ids.push(es.addKnot(V(Math.cos(a) * r, Math.sin(a) * r), 'bezier').id);
        }
        es.addSpline(ids, true);
      }
      break;
    }
    default: {
      // Fallback: sample the tube-curve as corner knots by walking a small circle.
      const r = 0.5;
      const N = 8;
      const ids: number[] = [];
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        ids.push(es.addKnot(V(Math.cos(a) * r, Math.sin(a) * r), 'corner').id);
      }
      es.addSpline(ids, true);
    }
  }
  return es;
}
