/**
 * Op registry for Edit Poly / Edit Mesh. Each op is a pure function that
 * takes an EditableMesh + current selection + params and returns updated
 * mesh + selection. Ops are recorded in the modifier's `ops[]` so the
 * modifier stack stays non-destructive.
 */
import { EditableMesh, EMFace, FaceId, VertexId } from '../EditableMesh';
import { Selection, selectionToVertexIds, faceIdsForSelection, grow, shrink, ring, loop } from '../selection';
import * as THREE from 'three';

export type OpKind =
  | 'move' | 'rotate' | 'scale'
  | 'delete' | 'detach' | 'attach'
  | 'weld' | 'targetWeld' | 'break' | 'chamfer' | 'chamferEdge' | 'removeEdge' | 'splitEdge'
  | 'extrude' | 'bevel' | 'inset' | 'outline' | 'bridge' | 'flip' | 'cap' | 'hinge'
  | 'connect' | 'tessellate' | 'msmooth' | 'divide' | 'slice' | 'cut' | 'quickSlice'
  | 'hide' | 'unhide' | 'hideUnselected'
  | 'setMaterialId' | 'selectByMaterialId' | 'createShapeFromEdges'
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
      faceIdsForSelection(out, sel).forEach((fid) => {
        const f = out.faces.get(fid);
        if (f) f.verts.reverse();
      });
      return { mesh: out, selection: sel };
    }
    case 'hide': {
      if (sel.level === 'vertex') sel.ids.forEach((id) => { const v = out.vertices.get(id as number); if (v) v.hidden = true; });
      else if (sel.level === 'face' || sel.level === 'polygon' || sel.level === 'element')
        faceIdsForSelection(out, sel).forEach((id) => { const f = out.faces.get(id); if (f) f.hidden = true; });
      return { mesh: out, selection: sel };
    }
    case 'unhide': {
      out.vertices.forEach((v) => { v.hidden = false; });
      out.faces.forEach((f) => { f.hidden = false; });
      return { mesh: out, selection: sel };
    }
    case 'hideUnselected': {
      if (sel.level === 'face' || sel.level === 'polygon' || sel.level === 'element') {
        const keep = faceIdsForSelection(out, sel);
        out.faces.forEach((f) => { f.hidden = !keep.has(f.id); });
      }
      return { mesh: out, selection: sel };
    }
    case 'delete': {
      if (sel.level === 'face' || sel.level === 'polygon' || sel.level === 'element') {
        faceIdsForSelection(out, sel).forEach((fid) => out.faces.delete(fid));
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
      faceIdsForSelection(out, sel).forEach((fid) => { const f = out.faces.get(fid); if (f) f.materialId = id; });
      return { mesh: out, selection: sel };
    }
    case 'setSmoothingGroup': {
      const mask = op.params?.mask | 0;
      faceIdsForSelection(out, sel).forEach((fid) => { const f = out.faces.get(fid); if (f) f.smoothingGroup = mask; });
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
      // type: 'group' (single averaged normal), 'local' (per-vertex avg normal),
      // 'byPolygon' (each face independently). Default = local.
      if (sel.level !== 'face' && sel.level !== 'polygon' && sel.level !== 'element') {
        return { mesh: out, selection: sel };
      }
      const amount = op.params?.amount ?? 0.2;
      const type: 'group' | 'local' | 'byPolygon' = op.params?.type ?? 'local';
      const selFaces = Array.from(faceIdsForSelection(out, sel)).map((fid) => out.faces.get(fid)).filter(Boolean) as EMFace[];
      if (!selFaces.length) return { mesh: out, selection: sel };
      const newFaceIds = new Set<FaceId>();
      const doExtrude = (faces: EMFace[], forceDir?: THREE.Vector3) => {
        const vmap = new Map<VertexId, VertexId>();
        const vNormals = new Map<VertexId, THREE.Vector3>();
        for (const f of faces) {
          const n = forceDir ? forceDir.clone() : faceNormal(out, f);
          for (const vid of f.verts) {
            const acc = vNormals.get(vid) ?? new THREE.Vector3();
            acc.add(n);
            vNormals.set(vid, acc);
          }
        }
        vNormals.forEach((n, vid) => {
          if (n.lengthSq() > 0) n.normalize();
          const srcV = out.vertices.get(vid)!;
          const p = srcV.position;
          vmap.set(vid, out.addVertex(p.clone().add(n.clone().multiplyScalar(amount)), srcV.uv?.clone()));
        });
        const edgeUse = new Map<string, { a: VertexId; b: VertexId; count: number }>();
        for (const f of faces) {
          for (let i = 0; i < f.verts.length; i++) {
            const a = f.verts[i]; const b = f.verts[(i + 1) % f.verts.length];
            const k = a < b ? `${a}_${b}` : `${b}_${a}`;
            const rec = edgeUse.get(k);
            if (rec) rec.count++; else edgeUse.set(k, { a, b, count: 1 });
          }
        }
        for (const f of faces) {
          const matId = f.materialId; const sg = f.smoothingGroup;
          out.faces.delete(f.id);
          const topVerts = f.verts.map((v) => vmap.get(v)!);
          newFaceIds.add(out.addFace(topVerts, matId, sg));
        }
        edgeUse.forEach((rec) => {
          if (rec.count !== 1) return;
          const A = vmap.get(rec.a)!, B = vmap.get(rec.b)!;
          out.addFace([rec.a, rec.b, B, A], 1, 1);
        });
      };
      if (type === 'byPolygon') {
        for (const f of selFaces) doExtrude([f]);
      } else if (type === 'group') {
        // Single averaged normal for the whole selection.
        const dir = new THREE.Vector3();
        for (const f of selFaces) { const n = faceNormal(out, f); if (n) dir.add(n); }
        if (dir.lengthSq() > 0) dir.normalize();
        doExtrude(selFaces, dir);
      } else {
        doExtrude(selFaces);
      }
      return { mesh: out, selection: { level: sel.level, ids: newFaceIds } };
    }
    case 'bevel': {
      // Extrude then inset the top: shrink top-face verts toward each face centroid.
      if (sel.level !== 'face' && sel.level !== 'polygon' && sel.level !== 'element') return { mesh: out, selection: sel };
      const height = op.params?.height ?? 0.2;
      const outline = op.params?.outline ?? -0.05;
      const type: 'group' | 'local' | 'byPolygon' = op.params?.type ?? 'local';
      const extr = applyOp(out, sel, { kind: 'extrude', params: { amount: height, type } });
      const m = extr.mesh;
      const topFaces = Array.from(extr.selection.ids).map((id) => m.faces.get(id as FaceId)).filter(Boolean) as EMFace[];
      // Per-face centroid inset (outline offset in the plane of each face).
      const moved = new Set<VertexId>();
      for (const f of topFaces) {
        const c = new THREE.Vector3();
        f.verts.forEach((vid) => c.add(m.vertices.get(vid)!.position));
        c.multiplyScalar(1 / f.verts.length);
        for (const vid of f.verts) {
          if (moved.has(vid)) continue;
          const v = m.vertices.get(vid)!;
          const dir = new THREE.Vector3().subVectors(c, v.position);
          if (dir.lengthSq() > 0) dir.normalize();
          v.position.add(dir.multiplyScalar(-outline));
          moved.add(vid);
        }
      }
      return { mesh: m, selection: extr.selection };
    }
    case 'inset': {
      // Insert an inner ring inside each selected polygon and cap with a smaller face.
      if (sel.level !== 'face' && sel.level !== 'polygon' && sel.level !== 'element') return { mesh: out, selection: sel };
      const amount = op.params?.amount ?? 0.1;
      const byPolygon = op.params?.byPolygon !== false;
      const selFaces = Array.from(faceIdsForSelection(out, sel)).map((fid) => out.faces.get(fid)).filter(Boolean) as EMFace[];
      const newFaces = new Set<FaceId>();
      const doInsetFace = (f: EMFace) => {
        const c = new THREE.Vector3();
        f.verts.forEach((vid) => c.add(out.vertices.get(vid)!.position));
        c.multiplyScalar(1 / f.verts.length);
        const inner: VertexId[] = f.verts.map((vid) => {
          const p = out.vertices.get(vid)!.position;
          const dir = new THREE.Vector3().subVectors(c, p);
          const len = dir.length();
          if (len > 0) dir.multiplyScalar(Math.min(amount, len * 0.95) / len);
          return out.addVertex(p.clone().add(dir));
        });
        const matId = f.materialId; const sg = f.smoothingGroup;
        out.faces.delete(f.id);
        // Ring quads (outer -> inner).
        for (let i = 0; i < f.verts.length; i++) {
          const a = f.verts[i]; const b = f.verts[(i + 1) % f.verts.length];
          const A = inner[i]; const B = inner[(i + 1) % f.verts.length];
          out.addFace([a, b, B, A], matId, sg);
        }
        newFaces.add(out.addFace(inner, matId, sg));
      };
      if (byPolygon) {
        selFaces.forEach(doInsetFace);
      } else {
        // Group mode: inset boundary only (interior verts shared with other selected faces stay).
        const edgeUse = new Map<string, { a: VertexId; b: VertexId; count: number }>();
        for (const f of selFaces) for (let i = 0; i < f.verts.length; i++) {
          const a = f.verts[i]; const b = f.verts[(i + 1) % f.verts.length];
          const k = a < b ? `${a}_${b}` : `${b}_${a}`;
          const rec = edgeUse.get(k);
          if (rec) rec.count++; else edgeUse.set(k, { a, b, count: 1 });
        }
        const boundaryV = new Set<VertexId>();
        edgeUse.forEach((r) => { if (r.count === 1) { boundaryV.add(r.a); boundaryV.add(r.b); } });
        // Group centroid.
        const c = new THREE.Vector3();
        boundaryV.forEach((v) => c.add(out.vertices.get(v)!.position));
        c.multiplyScalar(1 / Math.max(1, boundaryV.size));
        boundaryV.forEach((vid) => {
          const p = out.vertices.get(vid)!.position;
          const dir = new THREE.Vector3().subVectors(c, p);
          if (dir.lengthSq() > 0) dir.normalize();
          p.add(dir.multiplyScalar(amount));
        });
        selFaces.forEach((f) => newFaces.add(f.id));
      }
      return { mesh: out, selection: { level: sel.level, ids: newFaces } };
    }
    case 'outline': {
      // Move the boundary of the selected polygon(s) outward in-plane by `amount`.
      if (sel.level !== 'face' && sel.level !== 'polygon' && sel.level !== 'element') return { mesh: out, selection: sel };
      const amount = op.params?.amount ?? 0.1;
      const selFaces = Array.from(faceIdsForSelection(out, sel)).map((fid) => out.faces.get(fid)).filter(Boolean) as EMFace[];
      const edgeUse = new Map<string, { a: VertexId; b: VertexId; count: number }>();
      for (const f of selFaces) for (let i = 0; i < f.verts.length; i++) {
        const a = f.verts[i]; const b = f.verts[(i + 1) % f.verts.length];
        const k = a < b ? `${a}_${b}` : `${b}_${a}`;
        const rec = edgeUse.get(k);
        if (rec) rec.count++; else edgeUse.set(k, { a, b, count: 1 });
      }
      const boundaryV = new Set<VertexId>();
      edgeUse.forEach((r) => { if (r.count === 1) { boundaryV.add(r.a); boundaryV.add(r.b); } });
      const c = new THREE.Vector3();
      boundaryV.forEach((v) => c.add(out.vertices.get(v)!.position));
      c.multiplyScalar(1 / Math.max(1, boundaryV.size));
      boundaryV.forEach((vid) => {
        const p = out.vertices.get(vid)!.position;
        const dir = new THREE.Vector3().subVectors(p, c);
        if (dir.lengthSq() > 0) dir.normalize();
        p.add(dir.multiplyScalar(amount));
      });
      return { mesh: out, selection: sel };
    }
    case 'cap': {
      // Cap all open borders (border edges = edges used by exactly one face).
      // If selection is at border level, restrict to that border only.
      const borderEdges: { a: VertexId; b: VertexId }[] = [];
      out.edges.forEach((e) => { if (e.faces.length === 1) borderEdges.push({ a: e.a, b: e.b }); });
      if (!borderEdges.length) return { mesh: out, selection: sel };
      // Group edges into closed loops via a vertex adjacency map.
      const adj = new Map<VertexId, VertexId[]>();
      for (const e of borderEdges) {
        (adj.get(e.a) ?? adj.set(e.a, []).get(e.a)!).push(e.b);
        (adj.get(e.b) ?? adj.set(e.b, []).get(e.b)!).push(e.a);
      }
      const visited = new Set<VertexId>();
      const newFaces = new Set<FaceId>();
      adj.forEach((_, start) => {
        if (visited.has(start)) return;
        const loop: VertexId[] = [];
        let cur: VertexId | undefined = start;
        let prev: VertexId | null = null;
        while (cur !== undefined && !visited.has(cur)) {
          visited.add(cur);
          loop.push(cur);
          const next = (adj.get(cur) ?? []).find((v) => v !== prev && !visited.has(v));
          prev = cur;
          cur = next;
        }
        if (loop.length >= 3) newFaces.add(out.addFace(loop, 1, 1));
      });
      return { mesh: out, selection: { level: 'face', ids: newFaces } };
    }
    case 'makePlanar': {
      const axis: 'X' | 'Y' | 'Z' | 'auto' = op.params?.axis ?? 'auto';
      const vids = selectionToVertexIds(out, sel);
      if (!vids.size) return { mesh: out, selection: sel };
      if (axis === 'X' || axis === 'Y' || axis === 'Z') {
        const k = axis === 'X' ? 'x' : axis === 'Y' ? 'y' : 'z';
        let m = 0;
        vids.forEach((v) => { m += (out.vertices.get(v)!.position as any)[k]; });
        m /= vids.size;
        vids.forEach((v) => { (out.vertices.get(v)!.position as any)[k] = m; });
      } else {
        // Fit best-plane by centroid + averaged normal, then project.
        const c = new THREE.Vector3();
        vids.forEach((v) => c.add(out.vertices.get(v)!.position));
        c.multiplyScalar(1 / vids.size);
        const n = new THREE.Vector3();
        faceIdsForSelection(out, sel).forEach((fid) => { const fn = faceNormal(out, out.faces.get(fid)!); n.add(fn); });
        if (n.lengthSq() <= 0) n.set(0, 1, 0);
        n.normalize();
        vids.forEach((v) => {
          const p = out.vertices.get(v)!.position;
          const d = new THREE.Vector3().subVectors(p, c).dot(n);
          p.add(n.clone().multiplyScalar(-d));
        });
      }
      return { mesh: out, selection: sel };
    }
    case 'relax': {
      const iter = Math.max(1, Math.floor(op.params?.iterations ?? 1));
      const amount = op.params?.amount ?? 0.5;
      const keepBoundary = op.params?.keepBoundary !== false;
      const targetV = selectionToVertexIds(out, sel);
      // Border verts.
      const borderVerts = new Set<VertexId>();
      out.edges.forEach((e) => { if (e.faces.length === 1) { borderVerts.add(e.a); borderVerts.add(e.b); } });
      // Vertex neighbors via edges.
      const nbrs = new Map<VertexId, Set<VertexId>>();
      out.edges.forEach((e) => {
        (nbrs.get(e.a) ?? nbrs.set(e.a, new Set()).get(e.a)!).add(e.b);
        (nbrs.get(e.b) ?? nbrs.set(e.b, new Set()).get(e.b)!).add(e.a);
      });
      for (let i = 0; i < iter; i++) {
        const updates = new Map<VertexId, THREE.Vector3>();
        targetV.forEach((vid) => {
          if (keepBoundary && borderVerts.has(vid)) return;
          const set = nbrs.get(vid); if (!set || !set.size) return;
          const avg = new THREE.Vector3();
          set.forEach((n) => avg.add(out.vertices.get(n)!.position));
          avg.multiplyScalar(1 / set.size);
          updates.set(vid, avg);
        });
        updates.forEach((avg, vid) => {
          const p = out.vertices.get(vid)!.position;
          p.lerp(avg, amount);
        });
      }
      return { mesh: out, selection: sel };
    }
    case 'tessellate': {
      // Face-center tessellation: each selected face -> N triangles fanning
      // out from the face centroid.
      if (sel.level !== 'face' && sel.level !== 'polygon' && sel.level !== 'element') return { mesh: out, selection: sel };
      const selFaces = Array.from(faceIdsForSelection(out, sel)).map((fid) => out.faces.get(fid)).filter(Boolean) as EMFace[];
      const newFaces = new Set<FaceId>();
      for (const f of selFaces) {
        const c = new THREE.Vector3();
        f.verts.forEach((vid) => c.add(out.vertices.get(vid)!.position));
        c.multiplyScalar(1 / f.verts.length);
        const cid = out.addVertex(c);
        const matId = f.materialId; const sg = f.smoothingGroup;
        const verts = f.verts.slice();
        out.faces.delete(f.id);
        for (let i = 0; i < verts.length; i++) {
          const a = verts[i]; const b = verts[(i + 1) % verts.length];
          newFaces.add(out.addFace([a, b, cid], matId, sg));
        }
      }
      return { mesh: out, selection: { level: sel.level, ids: newFaces } };
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
      out.faces.forEach((f) => { f.verts = f.verts.map((v) => remap.get(v) ?? v); });
      remap.forEach((_, v) => out.vertices.delete(v));
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
