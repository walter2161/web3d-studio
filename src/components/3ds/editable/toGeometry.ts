/**
 * EditableMesh -> THREE.BufferGeometry.
 *
 * n-gons are fan-triangulated on write. `geometry.groups` are populated per
 * material ID so multi-material rendering works out of the box. Normals are
 * computed respecting smoothing groups: two triangles sharing a vertex only
 * average their normals if their smoothing-group masks overlap.
 */
import * as THREE from 'three';
import { EditableMesh } from './EditableMesh';

export interface ToGeometryOptions {
  /** If true, ignore hidden faces / vertices in the output. */
  respectHidden?: boolean;
}

export function toGeometry(mesh: EditableMesh, opts: ToGeometryOptions = {}): THREE.BufferGeometry {
  const respectHidden = opts.respectHidden !== false;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const groups: { start: number; count: number; materialIndex: number }[] = [];

  const faces = Array.from(mesh.faces.values())
    .filter((f) => !(respectHidden && f.hidden))
    .sort((a, b) => a.materialId - b.materialId);

  // Any vertex without UV — fabricate a planar UV so ops that never had
  // source UVs still get a stable mapping.
  let bbMin = new THREE.Vector3(Infinity, Infinity, Infinity);
  let bbMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  mesh.vertices.forEach((v) => { bbMin.min(v.position); bbMax.max(v.position); });
  const size = new THREE.Vector3().subVectors(bbMax, bbMin);
  const safeUV = (v: THREE.Vector3) => new THREE.Vector2(
    size.x > 0 ? (v.x - bbMin.x) / size.x : 0,
    size.z > 0 ? (v.z - bbMin.z) / size.z : (size.y > 0 ? (v.y - bbMin.y) / size.y : 0),
  );

  const faceNormals = new Map<number, THREE.Vector3>();
  for (const f of faces) {
    const v0 = mesh.vertices.get(f.verts[0])!.position;
    const v1 = mesh.vertices.get(f.verts[1])!.position;
    const v2 = mesh.vertices.get(f.verts[2])!.position;
    const n = new THREE.Vector3().subVectors(v1, v0).cross(new THREE.Vector3().subVectors(v2, v0));
    if (n.lengthSq() > 0) n.normalize();
    faceNormals.set(f.id, n);
  }

  const smoothAcc = new Map<string, THREE.Vector3>();
  for (const f of faces) {
    const fn = faceNormals.get(f.id)!;
    for (const vid of f.verts) {
      const key = `${vid}_${f.smoothingGroup}`;
      let acc = smoothAcc.get(key);
      if (!acc) { acc = new THREE.Vector3(); smoothAcc.set(key, acc); }
      acc.add(fn);
    }
  }
  smoothAcc.forEach((v) => { if (v.lengthSq() > 0) v.normalize(); });

  let cursor = 0;
  let curMat = -1;
  let curStart = 0;
  const flushGroup = () => {
    const count = cursor - curStart;
    if (count > 0 && curMat >= 0) groups.push({ start: curStart, count, materialIndex: curMat });
  };

  for (const f of faces) {
    if (f.materialId !== curMat) { flushGroup(); curMat = f.materialId; curStart = cursor; }
    const fn = faceNormals.get(f.id)!;
    for (let i = 1; i < f.verts.length - 1; i++) {
      const trio = [f.verts[0], f.verts[i], f.verts[i + 1]];
      for (const vid of trio) {
        const v = mesh.vertices.get(vid)!;
        positions.push(v.position.x, v.position.y, v.position.z);
        const smoothN = f.smoothingGroup !== 0 ? smoothAcc.get(`${vid}_${f.smoothingGroup}`) : null;
        const n = smoothN && smoothN.lengthSq() > 0 ? smoothN : fn;
        normals.push(n.x, n.y, n.z);
        const uv = v.uv ?? safeUV(v.position);
        uvs.push(uv.x, uv.y);
        cursor++;
      }
    }
  }
  flushGroup();

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  for (const g of groups) geom.addGroup(g.start, g.count, g.materialIndex - 1);
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  return geom;
}
