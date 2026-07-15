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
  const groups: { start: number; count: number; materialIndex: number }[] = [];

  // Sort faces by material ID so we can build BufferGeometry groups directly.
  const faces = Array.from(mesh.faces.values())
    .filter((f) => !(respectHidden && f.hidden))
    .sort((a, b) => a.materialId - b.materialId);

  // Precompute per-face normals + accumulate smooth-group weighted vertex normals.
  const faceNormals = new Map<number, THREE.Vector3>();
  for (const f of faces) {
    const v0 = mesh.vertices.get(f.verts[0])!.position;
    const v1 = mesh.vertices.get(f.verts[1])!.position;
    const v2 = mesh.vertices.get(f.verts[2])!.position;
    const n = new THREE.Vector3().subVectors(v1, v0).cross(new THREE.Vector3().subVectors(v2, v0));
    if (n.lengthSq() > 0) n.normalize();
    faceNormals.set(f.id, n);
  }

  // Per (vertex, smoothingGroup) normal accumulator.
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
    if (count > 0 && curMat >= 0) {
      groups.push({ start: curStart, count, materialIndex: curMat });
    }
  };

  for (const f of faces) {
    if (f.materialId !== curMat) {
      flushGroup();
      curMat = f.materialId;
      curStart = cursor;
    }
    const fn = faceNormals.get(f.id)!;
    // Fan-triangulate n-gon.
    for (let i = 1; i < f.verts.length - 1; i++) {
      const trio = [f.verts[0], f.verts[i], f.verts[i + 1]];
      for (const vid of trio) {
        const v = mesh.vertices.get(vid)!;
        positions.push(v.position.x, v.position.y, v.position.z);
        const smoothN = f.smoothingGroup !== 0 ? smoothAcc.get(`${vid}_${f.smoothingGroup}`) : null;
        const n = smoothN && smoothN.lengthSq() > 0 ? smoothN : fn;
        normals.push(n.x, n.y, n.z);
        cursor++;
      }
    }
  }
  flushGroup();

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  for (const g of groups) geom.addGroup(g.start, g.count, g.materialIndex - 1);
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  return geom;
}
