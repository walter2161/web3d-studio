/**
 * Selection utilities for EditableMesh: grow/shrink/ring/loop and
 * cross-level conversions (e.g. face selection -> vertex selection).
 */
import { EditableMesh, EdgeId, FaceId, SubObjectLevel, VertexId } from './EditableMesh';

export interface Selection {
  level: SubObjectLevel;
  ids: Set<number>;
}

export const emptySelection = (level: SubObjectLevel): Selection => ({ level, ids: new Set() });

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
    sel.ids.forEach((fid) => {
      const f = mesh.faces.get(fid as FaceId);
      if (f) f.verts.forEach((v) => out.add(v));
    });
  }
  return out;
}
