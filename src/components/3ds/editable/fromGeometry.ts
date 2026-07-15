/**
 * BufferGeometry -> EditableMesh.
 *
 * Vertices with identical positions (within `weldEpsilon`) are merged so that
 * indexed and non-indexed geometries produce a topologically-clean mesh.
 * n-gons are not reconstructed here (we accept the triangulation of the input);
 * Edit Poly operations can later merge coplanar tris into polygons if needed.
 */
import * as THREE from 'three';
import { EditableMesh } from './EditableMesh';

export function fromGeometry(geometry: THREE.BufferGeometry, weldEpsilon = 1e-5): EditableMesh {
  const mesh = new EditableMesh();
  const pos = geometry.getAttribute('position');
  if (!pos) return mesh;
  const uvAttr = geometry.getAttribute('uv');

  const key = (x: number, y: number, z: number) => {
    const q = 1 / weldEpsilon;
    return `${Math.round(x * q)}_${Math.round(y * q)}_${Math.round(z * q)}`;
  };

  const lookup = new Map<string, number>();
  const remap: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = key(x, y, z);
    let vid = lookup.get(k);
    if (vid === undefined) {
      const uv = uvAttr ? new THREE.Vector2(uvAttr.getX(i), uvAttr.getY(i)) : undefined;
      vid = mesh.addVertex(new THREE.Vector3(x, y, z), uv);
      lookup.set(k, vid);
    }
    remap.push(vid);
  }

  const idx = geometry.getIndex();
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  for (let t = 0; t < triCount; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3;
    const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    const a = remap[i0], b = remap[i1], c = remap[i2];
    if (a === b || b === c || a === c) continue;
    mesh.addFace([a, b, c], 1, 1);
  }
  return mesh;
}
