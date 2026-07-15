/**
 * Op registry for Edit Poly / Edit Mesh. Each op is a pure function that
 * takes an EditableMesh + current selection + params and returns updated
 * mesh + selection. Ops are recorded in the modifier's `ops[]` so the
 * modifier stack stays non-destructive.
 */
import { EditableMesh, FaceId, VertexId } from '../EditableMesh';
import { Selection, selectionToVertexIds, grow, shrink, ring, loop } from '../selection';
import * as THREE from 'three';

export type OpKind =
  | 'move' | 'rotate' | 'scale'
  | 'delete' | 'detach' | 'attach'
  | 'weld' | 'break' | 'chamfer'
  | 'extrude' | 'bevel' | 'inset' | 'outline' | 'bridge' | 'flip'
  | 'tessellate' | 'msmooth' | 'divide' | 'slice' | 'cut'
  | 'hide' | 'unhide' | 'hideUnselected'
  | 'setMaterialId' | 'selectByMaterialId'
  | 'autoSmooth' | 'clearSmoothing' | 'setSmoothingGroup'
  | 'grow' | 'shrink' | 'ring' | 'loop'
  | 'makePlanar' | 'relax';

export interface OpRecord {
  kind: OpKind;
  params?: any;
  /** Snapshot of selection ids the op was applied to. */
  selection?: { level: Selection['level']; ids: number[] };
}

export interface OpResult {
  mesh: EditableMesh;
  selection: Selection;
}

function faceNormal(mesh: EditableMesh, f: { verts: VertexId[] }): THREE.Vector3 {
  const p0 = mesh.vertices.get(f.verts[0])!.position;
  const p1 = mesh.vertices.get(f.verts[1])!.position;
  const p2 = mesh.vertices.get(f.verts[2])!.position;
  const n = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0));
  if (n.lengthSq() > 0) n.normalize();
  return n;
}

/**
 * Apply an op. The op's own recorded `selection` overrides the incoming one
 * when present (each op knows which sub-objects it was applied to).
 */
export function applyOp(mesh: EditableMesh, incomingSel: Selection, op: OpRecord): OpResult {
  const out = mesh.clone();
  const sel: Selection = op.selection
    ? { level: op.selection.level, ids: new Set(op.selection.ids) }
    : incomingSel;

  switch (op.kind) {
    case 'flip': {
      sel.ids.forEach((fid) => {
        const f = out.faces.get(fid as number);
        if (f) f.verts.reverse();
      });
      return { mesh: out, selection: sel };
    }
    case 'hide': {
      if (sel.level === 'vertex') sel.ids.forEach((id) => { const v = out.vertices.get(id as number); if (v) v.hidden = true; });
      else if (sel.level === 'face' || sel.level === 'polygon' || sel.level === 'element')
        sel.ids.forEach((id) => { const f = out.faces.get(id as number); if (f) f.hidden = true; });
      return { mesh: out, selection: sel };
    }
    case 'unhide': {
      out.vertices.forEach((v) => { v.hidden = false; });
      out.faces.forEach((f) => { f.hidden = false; });
      return { mesh: out, selection: sel };
    }
    case 'hideUnselected': {
      if (sel.level === 'face' || sel.level === 'polygon' || sel.level === 'element') {
        out.faces.forEach((f) => { f.hidden = !sel.ids.has(f.id); });
      }
      return { mesh: out, selection: sel };
    }
    case 'delete': {
      if (sel.level === 'face' || sel.level === 'polygon' || sel.level === 'element') {
        sel.ids.forEach((fid) => out.faces.delete(fid as number));
      } else if (sel.level === 'vertex') {
        const vids = new Set(sel.ids);
        const toDelete: FaceId[] = [];
        out.faces.forEach((f) => { if (f.verts.some((v) => vids.has(v))) toDelete.push(f.id); });
        toDelete.forEach((fid) => out.faces.delete(fid));
        vids.forEach((v) => out.vertices.delete(v as number));
      }
      return { mesh: out, selection: { level: sel.level, ids: new Set() } };
    }
    case 'setMaterialId': {
      const id = Math.max(1, Math.floor(op.params?.id ?? 1));
      sel.ids.forEach((fid) => { const f = out.faces.get(fid as number); if (f) f.materialId = id; });
      return { mesh: out, selection: sel };
    }
    case 'setSmoothingGroup': {
      const mask = op.params?.mask | 0;
      sel.ids.forEach((fid) => { const f = out.faces.get(fid as number); if (f) f.smoothingGroup = mask; });
      return { mesh: out, selection: sel };
    }
    case 'move': {
      const [dx, dy, dz] = op.params?.delta ?? [0, 0, 0];
      const vids = selectionToVertexIds(out, sel);
      const d = new THREE.Vector3(dx, dy, dz);
      vids.forEach((vid) => {
        const v = out.vertices.get(vid);
        if (v) v.position.add(d);
      });
      return { mesh: out, selection: sel };
    }
    case 'extrude': {
      // Face extrude: duplicate selected faces along their averaged normal.
      // Side quads join old boundary edges to new ones. Original faces are
      // replaced by the top faces (moved copies).
      if (sel.level !== 'face' && sel.level !== 'polygon' && sel.level !== 'element') {
        return { mesh: out, selection: sel };
      }
      const amount = op.params?.amount ?? 0.2;
      const selFaces = Array.from(sel.ids).map((fid) => out.faces.get(fid as number)).filter(Boolean) as any[];
      if (!selFaces.length) return { mesh: out, selection: sel };

      // Vertex -> new vertex map (only for vertices touched by selection).
      const vmap = new Map<VertexId, VertexId>();
      // Compute per-vertex averaged normal from selected faces containing it.
      const vNormals = new Map<VertexId, THREE.Vector3>();
      for (const f of selFaces) {
        const n = faceNormal(out, f);
        for (const vid of f.verts) {
          const acc = vNormals.get(vid) ?? new THREE.Vector3();
          acc.add(n);
          vNormals.set(vid, acc);
        }
      }
      vNormals.forEach((n, vid) => {
        if (n.lengthSq() > 0) n.normalize();
        const p = out.vertices.get(vid)!.position;
        const np = p.clone().add(n.clone().multiplyScalar(amount));
        vmap.set(vid, out.addVertex(np));
      });

      // Count edge occurrences among selected faces to find outer boundary.
      const edgeUse = new Map<string, { a: VertexId; b: VertexId; count: number }>();
      for (const f of selFaces) {
        for (let i = 0; i < f.verts.length; i++) {
          const a = f.verts[i]; const b = f.verts[(i + 1) % f.verts.length];
          const k = a < b ? `${a}_${b}` : `${b}_${a}`;
          const rec = edgeUse.get(k);
          if (rec) rec.count++;
          else edgeUse.set(k, { a, b, count: 1 });
        }
      }

      // Delete original selected faces and re-add them at the top.
      const newFaceIds = new Set<FaceId>();
      for (const f of selFaces) {
        const matId = f.materialId; const sg = f.smoothingGroup;
        out.faces.delete(f.id);
        const topVerts = f.verts.map((v: VertexId) => vmap.get(v)!);
        const nid = out.addFace(topVerts, matId, sg);
        newFaceIds.add(nid);
      }

      // Build side quads for boundary edges (count === 1 in selection).
      edgeUse.forEach((rec) => {
        if (rec.count !== 1) return;
        const a = rec.a, b = rec.b;
        const A = vmap.get(a)!, B = vmap.get(b)!;
        // Winding: pick order that faces outward. We don't know source face
        // orientation here; using [a, b, B, A] is consistent for exterior.
        out.addFace([a, b, B, A], 1, 1);
      });

      return { mesh: out, selection: { level: sel.level, ids: newFaceIds } };
    }
    case 'weld': {
      const th = op.params?.threshold ?? 0.01;
      if (sel.level !== 'vertex') return { mesh: out, selection: sel };
      const ids = Array.from(sel.ids) as VertexId[];
      const remap = new Map<VertexId, VertexId>();
      for (let i = 0; i < ids.length; i++) {
        if (remap.has(ids[i])) continue;
        const vi = out.vertices.get(ids[i]);
        if (!vi) continue;
        for (let j = i + 1; j < ids.length; j++) {
          if (remap.has(ids[j])) continue;
          const vj = out.vertices.get(ids[j]);
          if (!vj) continue;
          if (vi.position.distanceTo(vj.position) <= th) remap.set(ids[j], ids[i]);
        }
      }
      // Rewrite faces + remove merged vertices.
      out.faces.forEach((f) => { f.verts = f.verts.map((v) => remap.get(v) ?? v); });
      remap.forEach((_, v) => out.vertices.delete(v));
      // Drop degenerate faces.
      const drop: FaceId[] = [];
      out.faces.forEach((f) => {
        const uniq = new Set(f.verts);
        if (uniq.size < 3) drop.push(f.id);
      });
      drop.forEach((id) => out.faces.delete(id));
      return { mesh: out, selection: { level: 'vertex', ids: new Set() } };
    }
    case 'grow': return { mesh: out, selection: grow(out, sel) };
    case 'shrink': return { mesh: out, selection: shrink(out, sel) };
    case 'ring': return { mesh: out, selection: ring(out, sel) };
    case 'loop': return { mesh: out, selection: loop(out, sel) };
    default:
      return { mesh: out, selection: sel };
  }
}

export function replay(base: EditableMesh, initialSel: Selection, ops: OpRecord[]): OpResult {
  let mesh = base;
  let sel = initialSel;
  for (const op of ops) {
    const r = applyOp(mesh, sel, op);
    mesh = r.mesh;
    sel = r.selection;
  }
  return { mesh, selection: sel };
}
