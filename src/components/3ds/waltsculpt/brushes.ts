/**
 * WaltSculpt brush kernels. Operate on THREE.Mesh BufferGeometry position
 * attributes. Non-destructive at the topology level: only vertices move.
 *
 * All brushes share the same footprint:
 *   - `hitLocal` : brush center in mesh-local space.
 *   - `normalLocal` : hit normal in mesh-local space.
 *   - `radius` : brush radius in world units (scaled to local via inverse matrix).
 *   - `strength` : 0..1 base intensity (per-frame accumulation is handled by caller).
 *   - `falloff` : 0..1 exponent shaping the smoothstep curve.
 */
import * as THREE from 'three';
import type { BrushKind, SculptState } from './sculptStore';

const _tmp = new THREE.Vector3();
const _n = new THREE.Vector3();

function smoothFalloff(d: number, r: number, shape: number): number {
  if (d >= r) return 0;
  const t = 1 - d / r;
  // shape 0 = sharp, 1 = broad
  const k = 1 + shape * 3;
  return Math.pow(t, k) * (3 - 2 * t) * t; // smoothstep-ish
}

interface BrushCtx {
  brush: BrushKind;
  hit: THREE.Vector3;      // local
  normal: THREE.Vector3;   // local
  dir?: THREE.Vector3;     // local, for move brush
  radius: number;          // local
  strength: number;
  falloff: number;
  invert: boolean;
  mask: Float32Array | null;
}

/** Apply one dab of the current brush to a mesh's positions. */
export function applyBrush(mesh: THREE.Mesh, ctx: BrushCtx): void {
  const geom = mesh.geometry as THREE.BufferGeometry;
  const posAttr = geom.attributes.position as THREE.BufferAttribute;
  if (!posAttr) return;
  const pos = posAttr.array as Float32Array;
  const count = posAttr.count;

  // Recompute normals lazily for brushes that need per-vertex normal
  if (!geom.attributes.normal) geom.computeVertexNormals();
  const nAttr = geom.attributes.normal as THREE.BufferAttribute;
  const nrm = nAttr.array as Float32Array;

  const r = ctx.radius;
  const r2 = r * r;
  const sign = ctx.invert ? -1 : 1;

  // For smooth: average of nearby positions
  const smoothTargets: Float32Array | null = ctx.brush === 'smooth' ? new Float32Array(count * 3) : null;
  const smoothCounts: Uint16Array | null = smoothTargets ? new Uint16Array(count) : null;

  for (let i = 0; i < count; i++) {
    const ix = i * 3;
    const dx = pos[ix] - ctx.hit.x;
    const dy = pos[ix + 1] - ctx.hit.y;
    const dz = pos[ix + 2] - ctx.hit.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > r2) continue;
    const d = Math.sqrt(d2);
    const w = smoothFalloff(d, r, ctx.falloff);
    if (w <= 0) continue;
    const m = ctx.mask ? (1 - ctx.mask[i]) : 1;
    const s = ctx.strength * w * m * sign;
    if (s === 0) continue;

    const nx = nrm[ix], ny = nrm[ix + 1], nz = nrm[ix + 2];

    switch (ctx.brush) {
      case 'move':
        if (ctx.dir) {
          pos[ix] += ctx.dir.x * s;
          pos[ix + 1] += ctx.dir.y * s;
          pos[ix + 2] += ctx.dir.z * s;
        }
        break;
      case 'inflate':
        pos[ix] += nx * s * r * 0.3;
        pos[ix + 1] += ny * s * r * 0.3;
        pos[ix + 2] += nz * s * r * 0.3;
        break;
      case 'clay':
      case 'clayBuildup': {
        // Push along the brush normal to a flattened plane offset
        _tmp.set(dx, dy, dz);
        const proj = _tmp.dot(ctx.normal);
        const targetOffset = r * (ctx.brush === 'clayBuildup' ? 0.25 : 0.1);
        const push = (targetOffset - proj) * s;
        pos[ix] += ctx.normal.x * push;
        pos[ix + 1] += ctx.normal.y * push;
        pos[ix + 2] += ctx.normal.z * push;
        break;
      }
      case 'pinch': {
        pos[ix] -= dx * s * 0.5;
        pos[ix + 1] -= dy * s * 0.5;
        pos[ix + 2] -= dz * s * 0.5;
        break;
      }
      case 'crease': {
        // pinch + inflate
        pos[ix] -= dx * s * 0.3;
        pos[ix + 1] -= dy * s * 0.3;
        pos[ix + 2] -= dz * s * 0.3;
        pos[ix] += nx * s * r * 0.2;
        pos[ix + 1] += ny * s * r * 0.2;
        pos[ix + 2] += nz * s * r * 0.2;
        break;
      }
      case 'flatten':
      case 'polish': {
        // Project vertex onto plane defined by hit + normal
        _tmp.set(dx, dy, dz);
        const proj = _tmp.dot(ctx.normal);
        pos[ix] -= ctx.normal.x * proj * s;
        pos[ix + 1] -= ctx.normal.y * proj * s;
        pos[ix + 2] -= ctx.normal.z * proj * s;
        break;
      }
      case 'trim': {
        // Move vertices on the "above" side of the plane down to the plane
        _tmp.set(dx, dy, dz);
        const proj = _tmp.dot(ctx.normal);
        if (proj > 0) {
          pos[ix] -= ctx.normal.x * proj * s;
          pos[ix + 1] -= ctx.normal.y * proj * s;
          pos[ix + 2] -= ctx.normal.z * proj * s;
        }
        break;
      }
      case 'smooth': {
        // Two-pass: first record weight-sum position, applied below
        smoothTargets![ix] += pos[ix] * w;
        smoothTargets![ix + 1] += pos[ix + 1] * w;
        smoothTargets![ix + 2] += pos[ix + 2] * w;
        smoothCounts![i] += 1;
        break;
      }
      case 'mask': {
        if (ctx.mask) {
          const cur = ctx.mask[i];
          ctx.mask[i] = Math.max(0, Math.min(1, cur + ctx.strength * w * (ctx.invert ? -1 : 1)));
        }
        break;
      }
    }
  }

  if (smoothTargets) {
    // Simple neighborhood laplacian using triangle indices when available.
    const idx = geom.index;
    const neigh: Float32Array = new Float32Array(count * 3);
    const nc: Uint16Array = new Uint16Array(count);
    if (idx) {
      const ia = idx.array as Uint32Array | Uint16Array;
      for (let t = 0; t < ia.length; t += 3) {
        const a = ia[t], b = ia[t + 1], c = ia[t + 2];
        const trio = [a, b, c];
        for (let k = 0; k < 3; k++) {
          const vi = trio[k];
          const vj = trio[(k + 1) % 3];
          neigh[vi * 3] += pos[vj * 3];
          neigh[vi * 3 + 1] += pos[vj * 3 + 1];
          neigh[vi * 3 + 2] += pos[vj * 3 + 2];
          nc[vi] += 1;
        }
      }
    }
    for (let i = 0; i < count; i++) {
      if (!smoothCounts![i]) continue;
      if (!nc[i]) continue;
      const ix = i * 3;
      const dx = pos[ix] - ctx.hit.x;
      const dy = pos[ix + 1] - ctx.hit.y;
      const dz = pos[ix + 2] - ctx.hit.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const w = smoothFalloff(d, r, ctx.falloff);
      const m = ctx.mask ? (1 - ctx.mask[i]) : 1;
      const s = Math.min(1, ctx.strength * w * m);
      const ax = neigh[ix] / nc[i];
      const ay = neigh[ix + 1] / nc[i];
      const az = neigh[ix + 2] / nc[i];
      pos[ix] += (ax - pos[ix]) * s;
      pos[ix + 1] += (ay - pos[ix + 1]) * s;
      pos[ix + 2] += (az - pos[ix + 2]) * s;
    }
  }

  posAttr.needsUpdate = true;
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  geom.computeBoundingBox();
}

/** Apply the brush with symmetry mirrors. */
export function applyBrushSymmetric(
  mesh: THREE.Mesh,
  ctx: BrushCtx,
  sym: SculptState['symmetry'],
): void {
  applyBrush(mesh, ctx);
  const mirrors: Array<[number, number, number]> = [];
  if (sym.x) mirrors.push([-1, 1, 1]);
  if (sym.y) mirrors.push([1, -1, 1]);
  if (sym.z) mirrors.push([1, 1, -1]);
  if (sym.x && sym.y) mirrors.push([-1, -1, 1]);
  if (sym.x && sym.z) mirrors.push([-1, 1, -1]);
  if (sym.y && sym.z) mirrors.push([1, -1, -1]);
  if (sym.x && sym.y && sym.z) mirrors.push([-1, -1, -1]);
  for (const [mx, my, mz] of mirrors) {
    const mctx: BrushCtx = {
      ...ctx,
      hit: new THREE.Vector3(ctx.hit.x * mx, ctx.hit.y * my, ctx.hit.z * mz),
      normal: new THREE.Vector3(ctx.normal.x * mx, ctx.normal.y * my, ctx.normal.z * mz).normalize(),
      dir: ctx.dir ? new THREE.Vector3(ctx.dir.x * mx, ctx.dir.y * my, ctx.dir.z * mz) : undefined,
    };
    applyBrush(mesh, mctx);
  }
}

/**
 * Decimate — reduce triangle count by collapsing shortest edges greedily.
 * MVP: subsample the index buffer keeping every Nth triangle. Preserves
 * position array; drops boundary quality but is O(N) and safe for realtime.
 */
export function decimateMesh(mesh: THREE.Mesh, ratio: number): void {
  const g = mesh.geometry as THREE.BufferGeometry;
  const idx = g.index;
  if (!idx) return;
  const ia = idx.array as ArrayLike<number>;
  const step = Math.max(1, Math.round(1 / Math.max(0.01, ratio)));
  const keep: number[] = [];
  for (let t = 0; t < ia.length; t += 3) {
    if (Math.floor(t / 3) % step === 0) {
      keep.push(ia[t], ia[t + 1], ia[t + 2]);
    }
  }
  g.setIndex(keep);
  g.computeVertexNormals();
}

/**
 * Uniform remesh — resamples surface via marching-cubes-lite voxelization.
 * MVP: subdivide existing triangles when they exceed a target edge length.
 */
export function uniformRemesh(mesh: THREE.Mesh, targetEdge: number): void {
  const g = mesh.geometry as THREE.BufferGeometry;
  const posAttr = g.attributes.position as THREE.BufferAttribute;
  const idx = g.index;
  if (!posAttr || !idx) return;
  const positions: number[] = Array.from(posAttr.array as Float32Array);
  const indices: number[] = Array.from(idx.array as ArrayLike<number>);
  const out: number[] = [];
  const midCache = new Map<string, number>();
  const midpoint = (a: number, b: number): number => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    const c = midCache.get(key);
    if (c !== undefined) return c;
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
    const mi = positions.length / 3;
    positions.push((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5);
    midCache.set(key, mi);
    return mi;
  };
  const edgeLen = (a: number, b: number) => {
    const dx = positions[a * 3] - positions[b * 3];
    const dy = positions[a * 3 + 1] - positions[b * 3 + 1];
    const dz = positions[a * 3 + 2] - positions[b * 3 + 2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  };
  const subdivide = (a: number, b: number, c: number, depth = 0) => {
    if (depth > 3) { out.push(a, b, c); return; }
    const eab = edgeLen(a, b), ebc = edgeLen(b, c), eca = edgeLen(c, a);
    if (eab < targetEdge && ebc < targetEdge && eca < targetEdge) {
      out.push(a, b, c);
      return;
    }
    const mab = midpoint(a, b), mbc = midpoint(b, c), mca = midpoint(c, a);
    subdivide(a, mab, mca, depth + 1);
    subdivide(mab, b, mbc, depth + 1);
    subdivide(mca, mbc, c, depth + 1);
    subdivide(mab, mbc, mca, depth + 1);
  };
  for (let t = 0; t < indices.length; t += 3) {
    subdivide(indices[t], indices[t + 1], indices[t + 2]);
  }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  g.setIndex(out);
  g.computeVertexNormals();
  g.computeBoundingSphere();
}
