/**
 * EditableMesh — half-edge-ish structure used by Edit Poly / Edit Mesh modifiers.
 *
 * Design goals:
 *  - Preserve n-gons for Edit Poly.
 *  - Support triangulated view for Edit Mesh (`triangulate()`).
 *  - Every element has a stable numeric id, so selections survive topology edits.
 *  - Cheap to convert to/from THREE.BufferGeometry.
 *
 * This is deliberately minimal in Phase 1: enough surface area for later ops
 * (extrude, bevel, weld, ...) to be added without touching consumers.
 */
import * as THREE from 'three';

export type VertexId = number;
export type EdgeId = number;
export type FaceId = number;

export interface EMVertex {
  id: VertexId;
  position: THREE.Vector3;
  /** Per-vertex normal (recomputed on demand). */
  normal?: THREE.Vector3;
  /** True if vertex is currently "hidden" via Hide operation. */
  hidden?: boolean;
}

export interface EMEdge {
  id: EdgeId;
  a: VertexId;
  b: VertexId;
  /** Faces that share this edge (1 = border, 2 = interior, >2 = non-manifold). */
  faces: FaceId[];
}

export interface EMFace {
  id: FaceId;
  /** CCW vertex ring. Length 3 = triangle, 4 = quad, >4 = n-gon. */
  verts: VertexId[];
  /** Material ID for the polygon (default 1). */
  materialId: number;
  /** 32-bit smoothing-group mask (bit i = group i+1). */
  smoothingGroup: number;
  /** True if face is currently "hidden" via Hide operation. */
  hidden?: boolean;
}

export type SubObjectLevel = 'vertex' | 'edge' | 'border' | 'face' | 'polygon' | 'element';

export class EditableMesh {
  vertices = new Map<VertexId, EMVertex>();
  edges = new Map<EdgeId, EMEdge>();
  faces = new Map<FaceId, EMFace>();

  private nextVid = 1;
  private nextEid = 1;
  private nextFid = 1;

  addVertex(p: THREE.Vector3): VertexId {
    const id = this.nextVid++;
    this.vertices.set(id, { id, position: p.clone() });
    return id;
  }

  addFace(verts: VertexId[], materialId = 1, smoothingGroup = 1): FaceId {
    const id = this.nextFid++;
    this.faces.set(id, { id, verts: verts.slice(), materialId, smoothingGroup });
    // register edges
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      let edge = this.edgeByKey.get(key);
      if (!edge) {
        const eid = this.nextEid++;
        edge = { id: eid, a: Math.min(a, b), b: Math.max(a, b), faces: [] };
        this.edges.set(eid, edge);
        this.edgeByKey.set(key, edge);
      }
      edge.faces.push(id);
    }
    return id;
  }

  private edgeByKey = new Map<string, EMEdge>();

  /** Get all face ids that contain a given vertex. */
  facesOfVertex(vid: VertexId): FaceId[] {
    const out: FaceId[] = [];
    this.faces.forEach((f) => { if (f.verts.includes(vid)) out.push(f.id); });
    return out;
  }

  /** Get all edges that touch a vertex. */
  edgesOfVertex(vid: VertexId): EdgeId[] {
    const out: EdgeId[] = [];
    this.edges.forEach((e) => { if (e.a === vid || e.b === vid) out.push(e.id); });
    return out;
  }

  /** Border edges (used only by 1 face). */
  borderEdges(): EdgeId[] {
    const out: EdgeId[] = [];
    this.edges.forEach((e) => { if (e.faces.length === 1) out.push(e.id); });
    return out;
  }

  /** Compute connected components ("elements"), one Set<FaceId> each. */
  elements(): Set<FaceId>[] {
    const visited = new Set<FaceId>();
    const result: Set<FaceId>[] = [];
    const faceIds = Array.from(this.faces.keys());
    for (const fid of faceIds) {
      if (visited.has(fid)) continue;
      const stack = [fid];
      const comp = new Set<FaceId>();
      while (stack.length) {
        const cur = stack.pop()!;
        if (visited.has(cur)) continue;
        visited.add(cur);
        comp.add(cur);
        const f = this.faces.get(cur);
        if (!f) continue;
        // neighbors via shared edges
        for (let i = 0; i < f.verts.length; i++) {
          const a = f.verts[i];
          const b = f.verts[(i + 1) % f.verts.length];
          const key = a < b ? `${a}_${b}` : `${b}_${a}`;
          const e = this.edgeByKey.get(key);
          if (!e) continue;
          for (const nfid of e.faces) if (!visited.has(nfid)) stack.push(nfid);
        }
      }
      result.push(comp);
    }
    return result;
  }

  /** Triangulate all n-gons in place (needed by Edit Mesh). Simple fan tri. */
  triangulate(): void {
    const newFaces = new Map<FaceId, EMFace>();
    this.faces.forEach((f) => {
      if (f.verts.length <= 3) {
        newFaces.set(f.id, f);
        return;
      }
      const [v0, ...rest] = f.verts;
      for (let i = 0; i < rest.length - 1; i++) {
        const id = this.nextFid++;
        newFaces.set(id, {
          id,
          verts: [v0, rest[i], rest[i + 1]],
          materialId: f.materialId,
          smoothingGroup: f.smoothingGroup,
          hidden: f.hidden,
        });
      }
    });
    this.faces = newFaces;
    // rebuild edges from scratch
    this.edges = new Map();
    this.edgeByKey = new Map();
    this.nextEid = 1;
    this.faces.forEach((f) => {
      for (let i = 0; i < f.verts.length; i++) {
        const a = f.verts[i];
        const b = f.verts[(i + 1) % f.verts.length];
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        let edge = this.edgeByKey.get(key);
        if (!edge) {
          const eid = this.nextEid++;
          edge = { id: eid, a: Math.min(a, b), b: Math.max(a, b), faces: [] };
          this.edges.set(eid, edge);
          this.edgeByKey.set(key, edge);
        }
        edge.faces.push(f.id);
      }
    });
  }

  clone(): EditableMesh {
    const m = new EditableMesh();
    this.vertices.forEach((v) => m.vertices.set(v.id, {
      id: v.id, position: v.position.clone(), hidden: v.hidden,
      normal: v.normal?.clone(),
    }));
    this.faces.forEach((f) => m.faces.set(f.id, { ...f, verts: f.verts.slice() }));
    this.edges.forEach((e) => m.edges.set(e.id, { ...e, faces: e.faces.slice() }));
    this.edgeByKey.forEach((e, k) => m.edgeByKey.set(k, m.edges.get(e.id)!));
    m.nextVid = this.nextVid;
    m.nextEid = this.nextEid;
    m.nextFid = this.nextFid;
    return m;
  }
}
