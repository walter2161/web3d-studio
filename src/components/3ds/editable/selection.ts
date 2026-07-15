/**
 * Selection utilities for EditableMesh: grow/shrink/ring/loop and
 * cross-level conversions (e.g. face selection -> vertex selection).
 */
import { EditableMesh, EdgeId, FaceId, SubObjectLevel, VertexId } from './EditableMesh';
import * as THREE from 'three';

export interface Selection {
  level: SubObjectLevel;
  ids: Set<number>;
}

export const emptySelection = (level: SubObjectLevel): Selection => ({ level, ids: new Set() });

export function faceNormal(mesh: EditableMesh, fid: FaceId): THREE.Vector3 | null {
  const f = mesh.faces.get(fid);
  if (!f || f.verts.length < 3) return null;
  const p0 = mesh.vertices.get(f.verts[0])?.position;
  const p1 = mesh.vertices.get(f.verts[1])?.position;
  const p2 = mesh.vertices.get(f.verts[2])?.position;
  if (!p0 || !p1 || !p2) return null;
  const n = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0));
  if (n.lengthSq() <= 1e-12) return null;
  return n.normalize();
}

function edgeKey(a: VertexId, b: VertexId) {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

function faceEdgeKeys(mesh: EditableMesh, fid: FaceId): string[] {
  const f = mesh.faces.get(fid);
  if (!f) return [];
  const keys: string[] = [];
  for (let i = 0; i < f.verts.length; i++) {
    keys.push(edgeKey(f.verts[i], f.verts[(i + 1) % f.verts.length]));
  }
  return keys;
}

function edgeFaceMap(mesh: EditableMesh): Map<string, FaceId[]> {
  const map = new Map<string, FaceId[]>();
  mesh.faces.forEach((f) => {
    for (let i = 0; i < f.verts.length; i++) {
      const k = edgeKey(f.verts[i], f.verts[(i + 1) % f.verts.length]);
      const list = map.get(k) ?? [];
      list.push(f.id);
      map.set(k, list);
    }
  });
  return map;
}

/**
 * Edit Poly "Polygon" selection: expand one triangle/face to the full
 * connected coplanar island. This makes Box sides, caps, and planar n-gon
 * surfaces select as one polygon, while Edit Mesh Face can still pick a single
 * triangular face.
 */
export function coplanarPolygonFaceIds(mesh: EditableMesh, seed: FaceId): Set<FaceId> {
  const seedFace = mesh.faces.get(seed);
  const seedNormal = faceNormal(mesh, seed);
  if (!seedFace || !seedNormal) return new Set(seedFace ? [seed] : []);

  const p0 = mesh.vertices.get(seedFace.verts[0])!.position;
  const edgeFaces = edgeFaceMap(mesh);
  const out = new Set<FaceId>();
  const stack: FaceId[] = [seed];

  while (stack.length) {
    const fid = stack.pop()!;
    if (out.has(fid)) continue;
    const f = mesh.faces.get(fid);
    const n = faceNormal(mesh, fid);
    if (!f || !n) continue;

    const normalDot = Math.abs(n.dot(seedNormal));
    const samePlane = f.verts.every((vid) => {
      const p = mesh.vertices.get(vid)?.position;
      return !!p && Math.abs(seedNormal.dot(new THREE.Vector3().subVectors(p, p0))) <= 1e-4;
    });
    if (normalDot < 0.999 || !samePlane) continue;

    out.add(fid);
    for (const k of faceEdgeKeys(mesh, fid)) {
      const nbrs = edgeFaces.get(k) ?? [];
      nbrs.forEach((nfid) => { if (!out.has(nfid)) stack.push(nfid); });
    }
  }

  return out.size ? out : new Set([seed]);
}

export function faceIdsForSelection(mesh: EditableMesh, sel: Selection): Set<FaceId> {
  const out = new Set<FaceId>();
  if (sel.level === 'face') {
    sel.ids.forEach((id) => { if (mesh.faces.has(id as FaceId)) out.add(id as FaceId); });
  } else if (sel.level === 'polygon') {
    sel.ids.forEach((id) => coplanarPolygonFaceIds(mesh, id as FaceId).forEach((fid) => out.add(fid)));
  } else if (sel.level === 'element') {
    const elements = mesh.elements();
    elements.forEach((comp) => {
      const hit = Array.from(comp).some((fid) => sel.ids.has(fid));
      if (hit) comp.forEach((fid) => out.add(fid));
    });
  }
  return out;
}

/** Grow: add any element adjacent to the current selection. */
export function grow(mesh: EditableMesh, sel: Selection): Selection {
  const out = new Set(sel.ids);
  if (sel.level === 'vertex') {
    sel.ids.forEach((vid) => {
      mesh.edges.forEach((e) => {
        if (e.a === vid) out.add(e.b);
        else if (e.b === vid) out.add(e.a);
      });
    });
  } else if (sel.level === 'face' || sel.level === 'polygon' || sel.level === 'element') {
    sel.ids.forEach((fid) => {
      const f = mesh.faces.get(fid as FaceId);
      if (!f) return;
      for (let i = 0; i < f.verts.length; i++) {
        const a = f.verts[i]; const b = f.verts[(i + 1) % f.verts.length];
        mesh.edges.forEach((e) => {
          if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) {
            e.faces.forEach((nf) => out.add(nf));
          }
        });
      }
    });
  } else if (sel.level === 'edge' || sel.level === 'border') {
    sel.ids.forEach((eid) => {
      const e = mesh.edges.get(eid as EdgeId);
      if (!e) return;
      mesh.edges.forEach((oe) => {
        if (oe.a === e.a || oe.a === e.b || oe.b === e.a || oe.b === e.b) out.add(oe.id);
      });
    });
  }
  return { level: sel.level, ids: out };
}

/** Shrink: remove elements on the boundary of the selection. */
export function shrink(mesh: EditableMesh, sel: Selection): Selection {
  const boundary = new Set<number>();
  const grown = grow(mesh, { level: sel.level, ids: new Set([...sel.ids]) });
  const complement = new Set<number>();
  grown.ids.forEach((id) => { if (!sel.ids.has(id)) complement.add(id); });
  // Any selected id adjacent to complement is on the boundary -> drop it.
  const outerLayer = grow(mesh, { level: sel.level, ids: complement });
  outerLayer.ids.forEach((id) => { if (sel.ids.has(id)) boundary.add(id); });
  const out = new Set<number>();
  sel.ids.forEach((id) => { if (!boundary.has(id)) out.add(id); });
  return { level: sel.level, ids: out };
}

/** Edge Ring: parallel edges on opposite side of each quad. */
export function ring(mesh: EditableMesh, sel: Selection): Selection {
  if (sel.level !== 'edge' && sel.level !== 'border') return sel;
  const out = new Set<number>(sel.ids);
  sel.ids.forEach((eid) => {
    const e = mesh.edges.get(eid as EdgeId);
    if (!e) return;
    e.faces.forEach((fid) => {
      const f = mesh.faces.get(fid);
      if (!f || f.verts.length !== 4) return;
      // In a quad, opposite edge shares no vertex with e.
      for (let i = 0; i < 4; i++) {
        const a = f.verts[i]; const b = f.verts[(i + 1) % 4];
        if (a !== e.a && a !== e.b && b !== e.a && b !== e.b) {
          mesh.edges.forEach((oe) => {
            if ((oe.a === a && oe.b === b) || (oe.a === b && oe.b === a)) out.add(oe.id);
          });
        }
      }
    });
  });
  return { level: sel.level, ids: out };
}

/** Edge Loop: extend the selection along a continuous chain of edges. */
export function loop(mesh: EditableMesh, sel: Selection): Selection {
  if (sel.level !== 'edge' && sel.level !== 'border') return sel;
  const out = new Set<number>(sel.ids);
  const stack = Array.from(sel.ids);
  while (stack.length) {
    const eid = stack.pop()!;
    const e = mesh.edges.get(eid as EdgeId);
    if (!e) continue;
    for (const vid of [e.a, e.b]) {
      // Continue along edges that share exactly one vertex with `e` and are
      // roughly collinear (valence-4 vertex heuristic).
      const incident = Array.from(mesh.edges.values()).filter((oe) => oe.a === vid || oe.b === vid);
      if (incident.length !== 4) continue;
      // Pick the opposite edge: the one not sharing a face with `e`.
      for (const oe of incident) {
        if (oe.id === eid) continue;
        const shares = oe.faces.some((f) => e.faces.includes(f));
        if (!shares && !out.has(oe.id)) {
          out.add(oe.id);
          stack.push(oe.id);
        }
      }
    }
  }
  return { level: sel.level, ids: out };
}

/** Convert selection to vertex ids (useful for soft-selection / transform). */
export function selectionToVertexIds(mesh: EditableMesh, sel: Selection): Set<VertexId> {
  const out = new Set<VertexId>();
  if (sel.level === 'vertex') {
    sel.ids.forEach((id) => out.add(id));
  } else if (sel.level === 'edge' || sel.level === 'border') {
    sel.ids.forEach((eid) => {
      const e = mesh.edges.get(eid as EdgeId);
      if (e) { out.add(e.a); out.add(e.b); }
    });
  } else {
    faceIdsForSelection(mesh, sel).forEach((fid) => {
      const f = mesh.faces.get(fid);
      if (f) f.verts.forEach((v) => out.add(v));
    });
  }
  return out;
}
