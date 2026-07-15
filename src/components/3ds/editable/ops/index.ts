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
  | 'extrude' | 'extrudeEdge' | 'bevel' | 'inset' | 'outline' | 'bridge' | 'flip' | 'cap' | 'hinge'
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
        // Face centroid UV (for inner ring UV interpolation).
        const cUV = new THREE.Vector2();
        let uvCount = 0;
        f.verts.forEach((vid) => { const u = out.vertices.get(vid)!.uv; if (u) { cUV.add(u); uvCount++; } });
        if (uvCount > 0) cUV.multiplyScalar(1 / uvCount);
        const inner: VertexId[] = f.verts.map((vid) => {
          const src = out.vertices.get(vid)!;
          const p = src.position;
          const dir = new THREE.Vector3().subVectors(c, p);
          const len = dir.length();
          const t = len > 0 ? Math.min(amount, len * 0.95) / len : 0;
          if (t > 0) dir.multiplyScalar(t);
          const newUV = src.uv && uvCount > 0 ? src.uv.clone().lerp(cUV, t) : src.uv?.clone();
          return out.addVertex(p.clone().add(dir), newUV);
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
        const cUV = new THREE.Vector2();
        let uvCount = 0;
        f.verts.forEach((vid) => {
          const v = out.vertices.get(vid)!;
          c.add(v.position);
          if (v.uv) { cUV.add(v.uv); uvCount++; }
        });
        c.multiplyScalar(1 / f.verts.length);
        if (uvCount > 0) cUV.multiplyScalar(1 / uvCount);
        const cid = out.addVertex(c, uvCount > 0 ? cUV : undefined);
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
    case 'connect': {
      // Edge Connect: for each selected edge, insert a midpoint vertex.
      // For each face containing >=2 selected edges, split the face by
      // connecting midpoints. Works cleanly for quads with 2 selected edges.
      if (sel.level !== 'edge' && sel.level !== 'border') return { mesh: out, selection: sel };
      const segments = Math.max(1, Math.floor(op.params?.segments ?? 1));
      // Only 1 segment implemented cleanly for now.
      const _seg = segments; // reserved
      const selEdges = Array.from(sel.ids).map((id) => out.edges.get(id as number)).filter(Boolean) as any[];
      if (!selEdges.length) return { mesh: out, selection: sel };
      // Midpoint per selected edge (shared).
      const midByEdge = new Map<number, VertexId>();
      const midInFace = new Map<FaceId, VertexId[]>();
      for (const e of selEdges) {
        const va = out.vertices.get(e.a)!; const vb = out.vertices.get(e.b)!;
        const mp = va.position.clone().add(vb.position).multiplyScalar(0.5);
        const muv = (va.uv && vb.uv) ? va.uv.clone().add(vb.uv).multiplyScalar(0.5) : undefined;
        const mid = out.addVertex(mp, muv);
        midByEdge.set(e.id, mid);
        for (const fid of e.faces) {
          const arr = midInFace.get(fid) ?? [];
          arr.push(mid);
          midInFace.set(fid, arr);
        }
      }
      // Rebuild each affected face: walk verts, insert midpoint after each selected-edge start vert.
      const newSelIds = new Set<number>();
      midInFace.forEach((_, fid) => {
        const f = out.faces.get(fid); if (!f) return;
        const seq: VertexId[] = [];
        const mids: VertexId[] = [];
        for (let i = 0; i < f.verts.length; i++) {
          const a = f.verts[i]; const b = f.verts[(i + 1) % f.verts.length];
          seq.push(a);
          const eKey = a < b ? `${a}_${b}` : `${b}_${a}`;
          // Find the edge in our selection matching this face-edge.
          let mid: VertexId | undefined;
          for (const e of selEdges) {
            const k = e.a < e.b ? `${e.a}_${e.b}` : `${e.b}_${e.a}`;
            if (k === eKey) { mid = midByEdge.get(e.id); break; }
          }
          if (mid !== undefined) { seq.push(mid); mids.push(mid); }
        }
        // If exactly 2 midpoints -> split face into two along their connector.
        if (mids.length === 2 && f.verts.length === 4) {
          const i0 = seq.indexOf(mids[0]);
          const i1 = seq.indexOf(mids[1]);
          const partA: VertexId[] = [];
          const partB: VertexId[] = [];
          for (let k = 0; k < seq.length; k++) {
            const idx = (i0 + k) % seq.length;
            partA.push(seq[idx]);
            if (seq[idx] === mids[1]) break;
          }
          for (let k = 0; k < seq.length; k++) {
            const idx = (i1 + k) % seq.length;
            partB.push(seq[idx]);
            if (seq[idx] === mids[0]) break;
          }
          const matId = f.materialId; const sg = f.smoothingGroup;
          out.faces.delete(f.id);
          out.addFace(partA, matId, sg);
          out.addFace(partB, matId, sg);
        } else {
          // Fall back: just insert midpoints into the ring (subdivides edges).
          const matId = f.materialId; const sg = f.smoothingGroup;
          out.faces.delete(f.id);
          out.addFace(seq, matId, sg);
        }
      });
      selEdges.forEach((e) => { const m = midByEdge.get(e.id); if (m !== undefined) newSelIds.add(m); });
      return { mesh: out, selection: { level: 'vertex', ids: newSelIds } };
    }
    case 'extrudeEdge': {
      // Extrude selected edges outward along the averaged normal of their
      // adjacent faces. Creates a quad strip per edge. Works for both edge
      // and border levels; border edges use their single face normal.
      if (sel.level !== 'edge' && sel.level !== 'border') return { mesh: out, selection: sel };
      const height = op.params?.height ?? 0.2;
      const width = op.params?.width ?? 0;
      const selEdges = Array.from(sel.ids).map((id) => out.edges.get(id as number)).filter(Boolean) as any[];
      // For each vertex touched by selection, average the normals of its
      // adjacent faces to produce a consistent extrusion direction.
      const vDirs = new Map<VertexId, THREE.Vector3>();
      for (const e of selEdges) {
        for (const vid of [e.a, e.b]) {
          if (vDirs.has(vid)) continue;
          const dir = new THREE.Vector3();
          e.faces.forEach((fid: FaceId) => { const n = faceNormal(out, out.faces.get(fid)!); if (n) dir.add(n); });
          if (dir.lengthSq() > 0) dir.normalize();
          vDirs.set(vid, dir);
        }
      }
      // Duplicate vertices along their direction.
      const vmap = new Map<VertexId, VertexId>();
      vDirs.forEach((dir, vid) => {
        const src = out.vertices.get(vid)!;
        vmap.set(vid, out.addVertex(src.position.clone().add(dir.multiplyScalar(height)), src.uv?.clone()));
      });
      const newSel = new Set<number>();
      // Widen: shift new verts outward in-plane if width != 0 (approximation).
      // Create the extruded quad per edge.
      for (const e of selEdges) {
        const A = vmap.get(e.a)!; const B = vmap.get(e.b)!;
        out.addFace([e.a, e.b, B, A], 1, 1);
        // Track new edge (A,B) — will be re-registered by addFace above.
      }
      // Optional widening (uses e.a->e.b direction rotated by face normal).
      if (width !== 0) {
        // Skipped: precise widening needs full loop analysis; parameter kept for parity.
      }
      // Return new border edges as selection (approximation: pick edges of new verts).
      out.edges.forEach((edge) => {
        const isA = Array.from(vmap.values()).includes(edge.a);
        const isB = Array.from(vmap.values()).includes(edge.b);
        if (isA && isB && edge.faces.length === 1) newSel.add(edge.id);
      });
      return { mesh: out, selection: { level: sel.level, ids: newSel } };
    }
    case 'bridge': {
      // Bridge two selections: connect boundary loops with quad strips.
      // Simple case implemented: exactly 2 faces selected with the same
      // vertex count -> delete both, connect corresponding verts.
      if (sel.level === 'face' || sel.level === 'polygon') {
        const faceIds = Array.from(faceIdsForSelection(out, sel));
        if (faceIds.length !== 2) return { mesh: out, selection: sel };
        const [fa, fb] = faceIds.map((id) => out.faces.get(id)!);
        if (fa.verts.length !== fb.verts.length) return { mesh: out, selection: sel };
        // Find best pairing offset that minimizes total distance (reverse b since it faces the other way).
        const reversed = fb.verts.slice().reverse();
        const N = fa.verts.length;
        let bestOff = 0; let bestD = Infinity;
        for (let off = 0; off < N; off++) {
          let d = 0;
          for (let i = 0; i < N; i++) {
            const pa = out.vertices.get(fa.verts[i])!.position;
            const pb = out.vertices.get(reversed[(i + off) % N])!.position;
            d += pa.distanceToSquared(pb);
          }
          if (d < bestD) { bestD = d; bestOff = off; }
        }
        const matId = fa.materialId; const sg = fa.smoothingGroup;
        out.faces.delete(fa.id); out.faces.delete(fb.id);
        const newFaces = new Set<FaceId>();
        for (let i = 0; i < N; i++) {
          const a1 = fa.verts[i];
          const a2 = fa.verts[(i + 1) % N];
          const b1 = reversed[(i + bestOff) % N];
          const b2 = reversed[(i + 1 + bestOff) % N];
          newFaces.add(out.addFace([a1, a2, b2, b1], matId, sg));
        }
        return { mesh: out, selection: { level: 'face', ids: newFaces } };
      }
      return { mesh: out, selection: sel };
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
