import * as THREE from 'three';

/**
 * Sprint C — Extended Primitives + Shapes.
 * Each factory returns a BufferGeometry ready to be used by <mesh>.
 * Shapes are extruded as thin ribbons via TubeGeometry so they cast shadows
 * and pick up materials like their 3ds Max R3 counterparts.
 */

export type ExtPrimType =
  | 'hedra'
  | 'chamferBox'
  | 'chamferCyl'
  | 'oilTank'
  | 'spindle'
  | 'gengon'
  | 'torusKnot'
  | 'ringWave'
  | 'prism';

export type ShapeType =
  | 'line'
  | 'rectangle'
  | 'circle'
  | 'ellipse'
  | 'arc'
  | 'donut'
  | 'ngon'
  | 'star'
  | 'helix';

export const EXT_PRIM_DEFAULTS: Record<ExtPrimType, any> = {
  hedra:      { radius: 0.6, family: 0 },                              // 0=tetra 1=cube 2=octa 3=dodec 4=icosa
  chamferBox: { width: 1, height: 1, depth: 1, fillet: 0.1, segments: 3 },
  chamferCyl: { radius: 0.5, height: 1, fillet: 0.1, sides: 24, segments: 3 },
  oilTank:    { radius: 0.5, height: 1, capHeight: 0.15, sides: 24 },
  spindle:    { radius: 0.5, height: 1, capHeight: 0.25, sides: 24 },
  gengon:     { radius: 0.5, height: 1, sides: 5, fillet: 0.05 },
  torusKnot:  { radius: 0.5, tube: 0.15, tubularSegments: 100, radialSegments: 16, p: 2, q: 3 },
  ringWave:   { outerRadius: 0.8, innerRadius: 0.5, sides: 32, height: 0.1 },
  prism:      { side1: 1, side2: 1, side3: 1, height: 1 },
};

export const SHAPE_DEFAULTS: Record<ShapeType, any> = {
  line:      { length: 1 },
  rectangle: { width: 1, height: 0.7, cornerRadius: 0 },
  circle:    { radius: 0.5 },
  ellipse:   { radiusX: 0.7, radiusY: 0.4 },
  arc:       { radius: 0.5, from: 0, to: 180 },
  donut:     { radius1: 0.6, radius2: 0.35 },
  ngon:      { radius: 0.5, sides: 6, circular: false },
  star:      { radius1: 0.5, radius2: 0.22, points: 5 },
  helix:     { radius1: 0.4, radius2: 0.4, height: 1, turns: 3, biasFactor: 0 },
};

// ---------------- Extended Primitive builders ----------------

export function buildExtendedPrimitive(type: ExtPrimType, params: any = {}): THREE.BufferGeometry {
  const p = { ...EXT_PRIM_DEFAULTS[type], ...params };

  switch (type) {
    case 'hedra': {
      const r = p.radius;
      switch (p.family) {
        case 0: return new THREE.TetrahedronGeometry(r);
        case 1: return new THREE.BoxGeometry(r * 1.4, r * 1.4, r * 1.4);
        case 2: return new THREE.OctahedronGeometry(r);
        case 3: return new THREE.DodecahedronGeometry(r);
        default: return new THREE.IcosahedronGeometry(r);
      }
    }
    case 'chamferBox': {
      // Approximation: BoxGeometry with fillet approximated via corner-shrunk hull.
      const g = new THREE.BoxGeometry(p.width, p.height, p.depth, p.segments, p.segments, p.segments);
      const pos = g.attributes.position;
      const half = { x: p.width / 2, y: p.height / 2, z: p.depth / 2 };
      const f = Math.min(p.fillet, half.x, half.y, half.z);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const nx = Math.max(0, Math.abs(x) - (half.x - f));
        const ny = Math.max(0, Math.abs(y) - (half.y - f));
        const nz = Math.max(0, Math.abs(z) - (half.z - f));
        const d = Math.hypot(nx, ny, nz);
        if (d > f) {
          const k = f / d;
          const sx = Math.sign(x), sy = Math.sign(y), sz = Math.sign(z);
          pos.setXYZ(i, sx * (half.x - f + nx * k), sy * (half.y - f + ny * k), sz * (half.z - f + nz * k));
        }
      }
      g.computeVertexNormals();
      return g;
    }
    case 'chamferCyl': {
      // Lathe profile with rounded top/bottom edges.
      const r = p.radius, h = p.height / 2, f = Math.min(p.fillet, r, h);
      const pts: THREE.Vector2[] = [];
      pts.push(new THREE.Vector2(0, -h));
      pts.push(new THREE.Vector2(r - f, -h));
      const steps = Math.max(2, p.segments);
      for (let i = 1; i <= steps; i++) {
        const a = -Math.PI / 2 + (Math.PI / 2) * (i / steps);
        pts.push(new THREE.Vector2(r - f + Math.cos(a) * f, -h + f + Math.sin(a) * f));
      }
      for (let i = 1; i <= steps; i++) {
        const a = 0 + (Math.PI / 2) * (i / steps);
        pts.push(new THREE.Vector2(r - f + Math.cos(a) * f, h - f + Math.sin(a) * f));
      }
      pts.push(new THREE.Vector2(0, h));
      return new THREE.LatheGeometry(pts, p.sides);
    }
    case 'oilTank': {
      const r = p.radius, h = p.height / 2, cap = p.capHeight;
      const pts: THREE.Vector2[] = [];
      pts.push(new THREE.Vector2(0, -h - cap));
      const steps = 10;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, a = -Math.PI / 2 + (Math.PI / 2) * t;
        pts.push(new THREE.Vector2(Math.cos(a) * r, -h + Math.sin(a) * cap));
      }
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, a = 0 + (Math.PI / 2) * t;
        pts.push(new THREE.Vector2(Math.cos(a) * r, h + Math.sin(a) * cap));
      }
      pts.push(new THREE.Vector2(0, h + cap));
      return new THREE.LatheGeometry(pts, p.sides);
    }
    case 'spindle': {
      const r = p.radius, h = p.height / 2, cap = p.capHeight;
      const pts: THREE.Vector2[] = [];
      pts.push(new THREE.Vector2(0, -h - cap));
      pts.push(new THREE.Vector2(r, -h));
      pts.push(new THREE.Vector2(r, h));
      pts.push(new THREE.Vector2(0, h + cap));
      return new THREE.LatheGeometry(pts, p.sides);
    }
    case 'gengon': {
      return new THREE.CylinderGeometry(p.radius, p.radius, p.height, Math.max(3, p.sides));
    }
    case 'torusKnot': {
      return new THREE.TorusKnotGeometry(p.radius, p.tube, p.tubularSegments, p.radialSegments, p.p, p.q);
    }
    case 'ringWave': {
      const g = new THREE.RingGeometry(p.innerRadius, p.outerRadius, p.sides);
      g.rotateX(-Math.PI / 2);
      return g;
    }
    case 'prism': {
      // Triangular prism approximated as 3-sided cylinder.
      return new THREE.CylinderGeometry(p.side1 / 2, p.side1 / 2, p.height, 3);
    }
  }
}

// ---------------- Shape builders (rendered as thin tubes) ----------------

const TUBE_RADIUS = 0.02;
const TUBE_RADIAL_SEG = 6;

function shapeToTube(curve: THREE.Curve<THREE.Vector3>, segments = 128): THREE.BufferGeometry {
  return new THREE.TubeGeometry(curve, segments, TUBE_RADIUS, TUBE_RADIAL_SEG, false);
}

function pointsToTube(pts: THREE.Vector2[], closed = true): THREE.BufferGeometry {
  const pts3 = pts.map((v) => new THREE.Vector3(v.x, 0, v.y));
  const curve = new THREE.CatmullRomCurve3(pts3, closed, 'catmullrom', 0);
  return new THREE.TubeGeometry(curve, 256, TUBE_RADIUS, TUBE_RADIAL_SEG, closed);
}

export function buildShape(type: ShapeType, params: any = {}): THREE.BufferGeometry {
  const p = { ...SHAPE_DEFAULTS[type], ...params };

  switch (type) {
    case 'line': {
      const curve = new THREE.LineCurve3(new THREE.Vector3(-p.length / 2, 0, 0), new THREE.Vector3(p.length / 2, 0, 0));
      return shapeToTube(curve, 8);
    }
    case 'rectangle': {
      const w = p.width / 2, h = p.height / 2;
      return pointsToTube([
        new THREE.Vector2(-w, -h), new THREE.Vector2(w, -h),
        new THREE.Vector2(w, h),   new THREE.Vector2(-w, h),
      ], true);
    }
    case 'circle': {
      const pts: THREE.Vector2[] = [];
      const n = 64;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push(new THREE.Vector2(Math.cos(a) * p.radius, Math.sin(a) * p.radius));
      }
      return pointsToTube(pts, true);
    }
    case 'ellipse': {
      const pts: THREE.Vector2[] = [];
      const n = 64;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push(new THREE.Vector2(Math.cos(a) * p.radiusX, Math.sin(a) * p.radiusY));
      }
      return pointsToTube(pts, true);
    }
    case 'arc': {
      const pts: THREE.Vector2[] = [];
      const from = (p.from * Math.PI) / 180, to = (p.to * Math.PI) / 180;
      const n = 48;
      for (let i = 0; i <= n; i++) {
        const a = from + (to - from) * (i / n);
        pts.push(new THREE.Vector2(Math.cos(a) * p.radius, Math.sin(a) * p.radius));
      }
      return pointsToTube(pts, false);
    }
    case 'donut': {
      // Two concentric circles → merge as two tube geometries
      const g1 = buildShape('circle', { radius: p.radius1 });
      const g2 = buildShape('circle', { radius: p.radius2 });
      return THREE.BufferGeometryUtils
        ? (THREE as any).BufferGeometryUtils.mergeGeometries([g1, g2])
        : g1;
    }
    case 'ngon': {
      const pts: THREE.Vector2[] = [];
      const n = Math.max(3, p.sides);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push(new THREE.Vector2(Math.cos(a) * p.radius, Math.sin(a) * p.radius));
      }
      return pointsToTube(pts, true);
    }
    case 'star': {
      const pts: THREE.Vector2[] = [];
      const n = Math.max(3, p.points) * 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? p.radius1 : p.radius2;
        pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
      }
      return pointsToTube(pts, true);
    }
    case 'helix': {
      const pts3: THREE.Vector3[] = [];
      const n = 128 * Math.max(1, p.turns);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const a = t * Math.PI * 2 * p.turns;
        const r = p.radius1 + (p.radius2 - p.radius1) * t;
        pts3.push(new THREE.Vector3(Math.cos(a) * r, t * p.height - p.height / 2, Math.sin(a) * r));
      }
      const curve = new THREE.CatmullRomCurve3(pts3, false);
      return shapeToTube(curve, 512);
    }
  }
}
