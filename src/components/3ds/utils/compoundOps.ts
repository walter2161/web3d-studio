/**
 * Compound Object operations — Boolean / ProBoolean / Loft / Scatter.
 *
 * Uses three-csg-ts to compute constructive-solid-geometry results between
 * two THREE.Meshes. World transforms of both operands are baked into the
 * output geometry so the resulting compound object can sit at the origin
 * with an identity transform (matches 3ds Max R3 behaviour).
 */
import * as THREE from 'three';
import { CSG } from 'three-csg-ts';

export type BooleanOp = 'union' | 'subtract' | 'intersect';

export interface BakedGeometry {
  positions: number[];
  normals: number[];
  uvs?: number[];
}

/** Serialize a BufferGeometry into arrays we can store on an object.geometry bag. */
export function bakeGeometry(g: THREE.BufferGeometry): BakedGeometry {
  const geom = g.index ? g.toNonIndexed() : g.clone();
  geom.computeVertexNormals();
  const pos = geom.getAttribute('position') as THREE.BufferAttribute;
  const nor = geom.getAttribute('normal') as THREE.BufferAttribute;
  const uv  = geom.getAttribute('uv') as THREE.BufferAttribute | undefined;
  return {
    positions: Array.from(pos.array as Float32Array),
    normals: Array.from(nor.array as Float32Array),
    uvs: uv ? Array.from(uv.array as Float32Array) : undefined,
  };
}

/**
 * Compute a boolean between two meshes. Both meshes must have their
 * world matrices updated (call `updateMatrixWorld()` beforehand).
 * Returns a BakedGeometry ready to be stored on a compound object.
 */
export function computeBoolean(meshA: THREE.Mesh, meshB: THREE.Mesh, op: BooleanOp): BakedGeometry {
  meshA.updateMatrixWorld(true);
  meshB.updateMatrixWorld(true);

  const csgA = CSG.fromMesh(meshA);
  const csgB = CSG.fromMesh(meshB);

  let resultCSG;
  if (op === 'union') resultCSG = csgA.union(csgB);
  else if (op === 'subtract') resultCSG = csgA.subtract(csgB);
  else resultCSG = csgA.intersect(csgB);

  // Result is produced in world space. Bake into local geometry (identity matrix).
  const identity = new THREE.Matrix4();
  const resultMesh = CSG.toMesh(resultCSG, identity, meshA.material as THREE.Material);
  const g = resultMesh.geometry as THREE.BufferGeometry;
  return bakeGeometry(g);
}

/**
 * ProBoolean — apply a single operation between operand A and MANY operand-B
 * meshes sequentially. Matches the 3ds Max ProBoolean behaviour where the
 * user picks multiple cutters/adders at once.
 */
export function computeProBoolean(meshA: THREE.Mesh, meshesB: THREE.Mesh[], op: BooleanOp): BakedGeometry {
  meshA.updateMatrixWorld(true);
  let csg = CSG.fromMesh(meshA);
  for (const mb of meshesB) {
    mb.updateMatrixWorld(true);
    const cb = CSG.fromMesh(mb);
    if (op === 'union') csg = csg.union(cb);
    else if (op === 'subtract') csg = csg.subtract(cb);
    else csg = csg.intersect(cb);
  }
  const identity = new THREE.Matrix4();
  const resultMesh = CSG.toMesh(csg, identity, meshA.material as THREE.Material);
  return bakeGeometry(resultMesh.geometry as THREE.BufferGeometry);
}
