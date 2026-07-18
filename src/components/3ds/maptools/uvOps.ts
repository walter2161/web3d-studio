/**
 * MapTools UV operations. Every function accepts a THREE.Mesh (or geometry)
 * and mutates its `uv` attribute in-place. Callers should mark it dirty.
 */
import * as THREE from 'three';

export function ensureUV(geo: THREE.BufferGeometry): THREE.BufferAttribute {
  let uv = geo.getAttribute('uv') as THREE.BufferAttribute | undefined;
  if (!uv) {
    const count = geo.getAttribute('position').count;
    uv = new THREE.BufferAttribute(new Float32Array(count * 2), 2);
    geo.setAttribute('uv', uv);
  }
  return uv;
}

export function forEachMesh(root: THREE.Object3D, cb: (m: THREE.Mesh) => void) {
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) cb(o as THREE.Mesh); });
}

/** Compute texel density in pixels/unit, given a texture resolution. */
export function getTexelDensity(mesh: THREE.Mesh, texSize = 1024): number {
  const geo = mesh.geometry as THREE.BufferGeometry;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute | undefined;
  if (!uv) return 0;
  const idx = geo.getIndex();
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  let uvArea = 0, worldArea = 0;
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  const ua = new THREE.Vector2(), ub = new THREE.Vector2(), uc = new THREE.Vector2();
  const scale = mesh.getWorldScale(new THREE.Vector3());
  for (let t = 0; t < triCount; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3;
    const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    va.fromBufferAttribute(pos, i0).multiply(scale);
    vb.fromBufferAttribute(pos, i1).multiply(scale);
    vc.fromBufferAttribute(pos, i2).multiply(scale);
    ua.fromBufferAttribute(uv, i0); ub.fromBufferAttribute(uv, i1); uc.fromBufferAttribute(uv, i2);
    worldArea += new THREE.Vector3().subVectors(vb, va).cross(new THREE.Vector3().subVectors(vc, va)).length() * 0.5;
    uvArea += Math.abs((ub.x - ua.x) * (uc.y - ua.y) - (uc.x - ua.x) * (ub.y - ua.y)) * 0.5;
  }
  if (worldArea === 0) return 0;
  return Math.sqrt(uvArea / worldArea) * texSize;
}

/** Uniformly scale UVs around 0.5,0.5 so density matches target px/unit. */
export function setTexelDensity(mesh: THREE.Mesh, target: number, texSize = 1024) {
  const cur = getTexelDensity(mesh, texSize);
  if (!cur) return;
  scaleUV(mesh, target / cur);
}

export function getUVBounds(geo: THREE.BufferGeometry) {
  const uv = ensureUV(geo);
  let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    if (u < minU) minU = u; if (v < minV) minV = v;
    if (u > maxU) maxU = u; if (v > maxV) maxV = v;
  }
  return { minU, minV, maxU, maxV, w: maxU - minU, h: maxV - minV };
}

export function scaleUV(mesh: THREE.Mesh, s: number) {
  const uv = ensureUV(mesh.geometry as THREE.BufferGeometry);
  const b = getUVBounds(mesh.geometry as THREE.BufferGeometry);
  const cx = (b.minU + b.maxU) / 2, cy = (b.minV + b.maxV) / 2;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) - cx) * s + cx, (uv.getY(i) - cy) * s + cy);
  }
  uv.needsUpdate = true;
}

export function rotateUV(mesh: THREE.Mesh, deg: number) {
  const uv = ensureUV(mesh.geometry as THREE.BufferGeometry);
  const b = getUVBounds(mesh.geometry as THREE.BufferGeometry);
  const cx = (b.minU + b.maxU) / 2, cy = (b.minV + b.maxV) / 2;
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  for (let i = 0; i < uv.count; i++) {
    const dx = uv.getX(i) - cx, dy = uv.getY(i) - cy;
    uv.setXY(i, cx + dx * c - dy * s, cy + dx * s + dy * c);
  }
  uv.needsUpdate = true;
}

export function translateUV(mesh: THREE.Mesh, dx: number, dy: number) {
  const uv = ensureUV(mesh.geometry as THREE.BufferGeometry);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + dx, uv.getY(i) + dy);
  uv.needsUpdate = true;
}

/** Pack: fit UVs into [padding, 1-padding] preserving aspect. */
export function packUV(mesh: THREE.Mesh, padding = 0.02) {
  const geo = mesh.geometry as THREE.BufferGeometry;
  const uv = ensureUV(geo);
  const b = getUVBounds(geo);
  const size = 1 - padding * 2;
  const scale = Math.min(size / (b.w || 1), size / (b.h || 1));
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) - b.minU) * scale + padding, (uv.getY(i) - b.minV) * scale + padding);
  }
  uv.needsUpdate = true;
}

/** Align: min/max/center on U or V. */
export function alignUV(mesh: THREE.Mesh, mode: 'left' | 'right' | 'top' | 'bottom' | 'centerH' | 'centerV') {
  const geo = mesh.geometry as THREE.BufferGeometry;
  const uv = ensureUV(geo);
  const b = getUVBounds(geo);
  const targets: Record<string, (u: number, v: number) => [number, number]> = {
    left: (u, v) => [b.minU, v],
    right: (u, v) => [b.maxU, v],
    bottom: (u, v) => [u, b.minV],
    top: (u, v) => [u, b.maxV],
    centerH: (u, v) => [u, (b.minV + b.maxV) / 2],
    centerV: (u, v) => [(b.minU + b.maxU) / 2, v],
  };
  const f = targets[mode];
  for (let i = 0; i < uv.count; i++) {
    const [nu, nv] = f(uv.getX(i), uv.getY(i)); uv.setXY(i, nu, nv);
  }
  uv.needsUpdate = true;
}

/** Straighten: snap UVs onto a horizontal/vertical bar at their centroid. */
export function straightenUV(mesh: THREE.Mesh, axis: 'h' | 'v') {
  const geo = mesh.geometry as THREE.BufferGeometry;
  const uv = ensureUV(geo);
  let mid = 0;
  for (let i = 0; i < uv.count; i++) mid += axis === 'h' ? uv.getY(i) : uv.getX(i);
  mid /= uv.count;
  for (let i = 0; i < uv.count; i++) {
    if (axis === 'h') uv.setY(i, mid); else uv.setX(i, mid);
  }
  uv.needsUpdate = true;
}

/** Space Evenly: distribute unique U/V coordinates evenly across the bounds. */
export function spaceEvenly(mesh: THREE.Mesh, axis: 'u' | 'v') {
  const geo = mesh.geometry as THREE.BufferGeometry;
  const uv = ensureUV(geo);
  const arr: { i: number; k: number }[] = [];
  for (let i = 0; i < uv.count; i++) arr.push({ i, k: axis === 'u' ? uv.getX(i) : uv.getY(i) });
  arr.sort((a, b) => a.k - b.k);
  const min = arr[0].k, max = arr[arr.length - 1].k, range = max - min || 1;
  arr.forEach((entry, ord) => {
    const nk = min + (range * ord) / (arr.length - 1);
    if (axis === 'u') uv.setX(entry.i, nk); else uv.setY(entry.i, nk);
  });
  uv.needsUpdate = true;
}

/** Planar project ("Iron") from the mesh's dominant axis. */
export function planarProject(mesh: THREE.Mesh, axis: 'auto' | 'x' | 'y' | 'z' = 'auto') {
  const geo = mesh.geometry as THREE.BufferGeometry;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const uv = ensureUV(geo);
  let chosen: 'x' | 'y' | 'z' = axis === 'auto' ? 'y' : axis;
  if (axis === 'auto') {
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const dx = bb.max.x - bb.min.x, dy = bb.max.y - bb.min.y, dz = bb.max.z - bb.min.z;
    const min = Math.min(dx, dy, dz);
    chosen = min === dx ? 'x' : min === dy ? 'y' : 'z';
  }
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const project = (i: number): [number, number] => {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (chosen === 'y') return [(x - bb.min.x) / (bb.max.x - bb.min.x || 1), (z - bb.min.z) / (bb.max.z - bb.min.z || 1)];
    if (chosen === 'x') return [(z - bb.min.z) / (bb.max.z - bb.min.z || 1), (y - bb.min.y) / (bb.max.y - bb.min.y || 1)];
    return [(x - bb.min.x) / (bb.max.x - bb.min.x || 1), (y - bb.min.y) / (bb.max.y - bb.min.y || 1)];
  };
  for (let i = 0; i < pos.count; i++) {
    const [u, v] = project(i); uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

/** Laplacian UV relax across shared indices. */
export function relaxUV(mesh: THREE.Mesh, iterations = 8, weight = 0.5) {
  const geo = mesh.geometry as THREE.BufferGeometry;
  const uv = ensureUV(geo);
  const idx = geo.getIndex();
  if (!idx) return;
  const n = uv.count;
  const neighbors: Set<number>[] = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
    neighbors[a].add(b); neighbors[a].add(c);
    neighbors[b].add(a); neighbors[b].add(c);
    neighbors[c].add(a); neighbors[c].add(b);
  }
  for (let it = 0; it < iterations; it++) {
    const nu = new Float32Array(n), nv = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let su = 0, sv = 0, cnt = 0;
      neighbors[i].forEach((j) => { su += uv.getX(j); sv += uv.getY(j); cnt++; });
      if (!cnt) { nu[i] = uv.getX(i); nv[i] = uv.getY(i); continue; }
      nu[i] = uv.getX(i) * (1 - weight) + (su / cnt) * weight;
      nv[i] = uv.getY(i) * (1 - weight) + (sv / cnt) * weight;
    }
    for (let i = 0; i < n; i++) uv.setXY(i, nu[i], nv[i]);
  }
  uv.needsUpdate = true;
}

/** Render UV wireframe to a canvas / PNG data URL. */
export function renderUVToPNG(mesh: THREE.Mesh, size = 1024, bg = '#111', line = '#8cf'): string {
  const geo = mesh.geometry as THREE.BufferGeometry;
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute | undefined;
  const idx = geo.getIndex();
  const cvs = document.createElement('canvas'); cvs.width = cvs.height = size;
  const g = cvs.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, size, size);
  if (!uv) return cvs.toDataURL('image/png');
  g.strokeStyle = line; g.lineWidth = 1;
  const P = (i: number) => [uv.getX(i) * size, (1 - uv.getY(i)) * size] as const;
  const drawTri = (a: number, b: number, c: number) => {
    const A = P(a), B = P(b), C = P(c);
    g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.lineTo(C[0], C[1]); g.closePath(); g.stroke();
  };
  if (idx) for (let t = 0; t < idx.count; t += 3) drawTri(idx.getX(t), idx.getX(t + 1), idx.getX(t + 2));
  else for (let t = 0; t < uv.count; t += 3) drawTri(t, t + 1, t + 2);
  return cvs.toDataURL('image/png');
}

/** Assign a random material index per element (color-ID style). */
export function randomizeMaterialIDs(mesh: THREE.Mesh, count = 8) {
  const geo = mesh.geometry as THREE.BufferGeometry;
  geo.clearGroups();
  const idx = geo.getIndex();
  const total = idx ? idx.count : geo.getAttribute('position').count;
  const chunk = Math.max(3, Math.floor(total / count / 3) * 3);
  for (let s = 0; s < total; s += chunk) {
    geo.addGroup(s, Math.min(chunk, total - s), Math.floor(Math.random() * count));
  }
}

/** Copy vertex colors from source to target via nearest world-space match. */
export function transferVertexColors(source: THREE.Mesh, target: THREE.Mesh) {
  const sPos = source.geometry.getAttribute('position') as THREE.BufferAttribute;
  const sCol = source.geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
  if (!sCol) return;
  const tPos = target.geometry.getAttribute('position') as THREE.BufferAttribute;
  const out = new Float32Array(tPos.count * 3);
  const sp = new THREE.Vector3(), tp = new THREE.Vector3();
  for (let i = 0; i < tPos.count; i++) {
    tp.fromBufferAttribute(tPos, i).applyMatrix4(target.matrixWorld);
    let best = -1, bd = Infinity;
    for (let j = 0; j < sPos.count; j++) {
      sp.fromBufferAttribute(sPos, j).applyMatrix4(source.matrixWorld);
      const d = sp.distanceToSquared(tp);
      if (d < bd) { bd = d; best = j; }
    }
    out[i * 3] = sCol.getX(best); out[i * 3 + 1] = sCol.getY(best); out[i * 3 + 2] = sCol.getZ(best);
  }
  target.geometry.setAttribute('color', new THREE.BufferAttribute(out, 3));
}
