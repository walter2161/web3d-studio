import * as THREE from 'three';
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';
// Bundled Three.js fonts (vectorised TTF → typeface JSON) so text can be
// rasterised into splines immediately, without an async fetch.
import helvetikerRegular from 'three/examples/fonts/helvetiker_regular.typeface.json';
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json';
import gentilisRegular from 'three/examples/fonts/gentilis_regular.typeface.json';
import gentilisBold from 'three/examples/fonts/gentilis_bold.typeface.json';
import optimerRegular from 'three/examples/fonts/optimer_regular.typeface.json';
import optimerBold from 'three/examples/fonts/optimer_bold.typeface.json';

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
  | 'helix'
  | 'text';

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

// Shape defaults mirror 3ds Max R3 Shapes rollout. Every shape carries the
// common "Rendering" (renderable / thickness / sides / angle / rectangular
// section) and "Interpolation" (steps / adaptive / optimize) blocks, plus its
// own parametric fields exposed in the command panel.
const COMMON_SHAPE_DEFAULTS = {
  // Rendering
  renderableViewport: true,   // Enable In Viewport
  renderableRender:   true,   // Enable In Renderer
  renderRectangular:  false,  // false = radial (round tube), true = rectangular bar
  thickness:  0.02,           // tube radius (or rect width)
  sides:      6,              // radial sides
  angle:      0,              // section rotation, radians
  rectLength: 0.04,           // rect section length (when renderRectangular)
  rectWidth:  0.02,           // rect section width
  // Interpolation
  interpolationSteps: 6,
  adaptive: true,
  optimize: false,
};
export const SHAPE_DEFAULTS: Record<ShapeType, any> = {
  line:      { ...COMMON_SHAPE_DEFAULTS, length: 1 },
  rectangle: { ...COMMON_SHAPE_DEFAULTS, width: 1, height: 0.7, cornerRadius: 0, fillet: 0 },
  circle:    { ...COMMON_SHAPE_DEFAULTS, radius: 0.5, pieSlice: false, startAngle: 0, endAngle: 360, reverse: false },
  ellipse:   { ...COMMON_SHAPE_DEFAULTS, radiusX: 0.7, radiusY: 0.4, pieSlice: false, startAngle: 0, endAngle: 360 },
  arc:       { ...COMMON_SHAPE_DEFAULTS, radius: 0.5, from: 0, to: 180, pie: false, reverse: false },
  donut:     { ...COMMON_SHAPE_DEFAULTS, radius1: 0.6, radius2: 0.35, pieSlice: false, startAngle: 0, endAngle: 360 },
  ngon:      { ...COMMON_SHAPE_DEFAULTS, radius: 0.5, sides: 6, circular: false, fillet: 0, inscribed: true },
  star:      { ...COMMON_SHAPE_DEFAULTS, radius1: 0.5, radius2: 0.22, points: 5, distortion: 0, filletRadius1: 0, filletRadius2: 0, twist: 0 },
  helix:     { ...COMMON_SHAPE_DEFAULTS, radius1: 0.4, radius2: 0.4, height: 1, turns: 3, bias: 0, clockwise: true },
  text:      { ...COMMON_SHAPE_DEFAULTS, text: 'LEDMKT', font: 'helvetiker', bold: false, italic: false, underline: false, size: 1, kerning: 0, tracking: 0, leading: 1.2, alignment: 'left', reverse: false, autoUpdate: true, curveSegments: 6 },
};

// ---------------- Fonts ----------------

export const AVAILABLE_FONTS = ['helvetiker', 'gentilis', 'optimer'] as const;
export type FontName = typeof AVAILABLE_FONTS[number];

const FONT_CACHE = new Map<string, Font>();
export function getFont(name: FontName | string = 'helvetiker', bold = false): Font {
  const key = `${name}_${bold ? 'bold' : 'regular'}`;
  const cached = FONT_CACHE.get(key);
  if (cached) return cached;
  let data: any;
  switch (name) {
    case 'gentilis': data = bold ? gentilisBold : gentilisRegular; break;
    case 'optimer':  data = bold ? optimerBold  : optimerRegular;  break;
    default:         data = bold ? helvetikerBold : helvetikerRegular; break;
  }
  const font = new Font(data as any);
  FONT_CACHE.set(key, font);
  return font;
}

/**
 * Vectorise the input text into an array of `THREE.Shape` — one per glyph,
 * with holes populated for letters like O, B, D, e, o, a, etc. Kerning
 * shifts each glyph outward from its natural position. Returned shapes lie
 * on the XY plane; use them directly with `THREE.ExtrudeGeometry` or copy
 * their points to draw the vector outline.
 */
export function buildTextShapes(
  text: string,
  fontName: FontName | string = 'helvetiker',
  bold = false,
  size = 1,
  kerning = 0,
  curveSegments = 6
): THREE.Shape[] {
  if (!text) return [];
  const font = getFont(fontName, bold);
  const base = font.generateShapes(text, size);
  if (!kerning || base.length <= 1) return base;
  // Font.generateShapes already advances glyphs left→right; apply an extra
  // per-character kerning offset by measuring cumulative widths of each
  // character in isolation and re-positioning shapes accordingly.
  let offset = 0;
  const shifted: THREE.Shape[] = [];
  let charIdx = 0;
  for (const ch of Array.from(text)) {
    if (ch === '\n' || ch === '\r') { charIdx += 1; continue; }
    const glyphShapes = font.generateShapes(ch, size);
    for (const s of glyphShapes) {
      const clone = new THREE.Shape();
      clone.curves = s.curves.map((c) => c.clone());
      clone.holes = s.holes.map((h) => {
        const p = new THREE.Path();
        p.curves = h.curves.map((c) => c.clone());
        return p;
      });
      // Shift by the kerning offset (positive kerning = wider spacing).
      const shift = offset + kerning * charIdx;
      const applyShift = (path: any) => {
        for (const c of path.curves) {
          if (c.v0) c.v0.x += shift;
          if (c.v1) c.v1.x += shift;
          if (c.v2) c.v2.x += shift;
          if (c.v3) c.v3.x += shift;
          if (c.aX !== undefined) c.aX += shift;
        }
      };
      applyShift(clone);
      clone.holes.forEach(applyShift);
      shifted.push(clone);
    }
    // Measure natural advance of this char via a bounding box of its shapes.
    if (glyphShapes.length) {
      let maxX = -Infinity;
      for (const s of glyphShapes) {
        const pts = s.getPoints(4);
        for (const p of pts) if (p.x > maxX) maxX = p.x;
      }
      if (Number.isFinite(maxX)) offset = Math.max(offset, maxX);
    }
    charIdx += 1;
    // Advance in font's own coordinate system for spaces (font shapes for ' '
    // are empty). Approximate space width as 0.35 * size.
    if (glyphShapes.length === 0) offset += size * 0.35;
  }
  return shifted.length ? shifted : base;
}


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
      // Line: prefer explicit `knots` (Bezier), fall back to plain `points`, then to a segment.
      const knots: Array<{ pos: number[]; inH: number[]; outH: number[] }> | undefined = p.knots;
      const closed = !!p.closed;
      let sampled: THREE.Vector3[] | null = null;
      if (knots && knots.length >= 2) {
        const list = closed ? [...knots, knots[0]] : knots;
        sampled = [];
        for (let i = 0; i < list.length - 1; i++) {
          const k0 = list[i], k1 = list[i + 1];
          const p0 = new THREE.Vector3(k0.pos[0], k0.pos[1], k0.pos[2]);
          const p3 = new THREE.Vector3(k1.pos[0], k1.pos[1], k1.pos[2]);
          const p1 = p0.clone().add(new THREE.Vector3(k0.outH[0], k0.outH[1], k0.outH[2]));
          const p2 = p3.clone().add(new THREE.Vector3(k1.inH[0], k1.inH[1], k1.inH[2]));
          const curve = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
          const seg = curve.getPoints(24);
          if (i > 0) seg.shift();
          sampled.push(...seg);
        }
      } else if (p.points && p.points.length >= 2) {
        sampled = (p.points as number[][]).map((v) => new THREE.Vector3(v[0], v[1], v[2]));
      }
      if (sampled && sampled.length >= 2) {
        const curve = new THREE.CatmullRomCurve3(sampled, closed, 'catmullrom', 0);
        const segs = Math.max(32, sampled.length * 8);
        return new THREE.TubeGeometry(curve, segs, TUBE_RADIUS, TUBE_RADIAL_SEG, closed);
      }
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
      // Donut = torus with tiny minor radius so it renders as two concentric rings.
      const majorR = (p.radius1 + p.radius2) / 2;
      const minorR = Math.max(0.001, Math.abs(p.radius1 - p.radius2) / 2);
      return new THREE.TorusGeometry(majorR, minorR, 12, 64);
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
    case 'text': {
      // Vectorise glyphs → flat, filled letters on the XZ ground plane. When
      // the user adds an Extrude modifier, applyExtrude re-generates a proper
      // ExtrudeGeometry (with letter holes) from the same font+text+size.
      const shapes = buildTextShapes(
        p.text ?? 'Text',
        p.font ?? 'helvetiker',
        !!p.bold,
        p.size ?? 1,
        p.kerning ?? 0,
        p.curveSegments ?? 6,
      );
      if (!shapes.length) return new THREE.BufferGeometry();
      const flat = new THREE.ShapeGeometry(shapes, p.curveSegments ?? 6);
      // Lay the text flat on XZ (three's ShapeGeometry lives on XY, Y up).
      flat.rotateX(-Math.PI / 2);
      // Centre horizontally so the object's origin sits at the middle of the
      // text baseline, matching how the other shapes are pivoted.
      flat.computeBoundingBox();
      const bb = flat.boundingBox!;
      const cx = (bb.min.x + bb.max.x) / 2;
      const cz = (bb.min.z + bb.max.z) / 2;
      flat.translate(-cx, 0, -cz);
      return flat;
    }
  }
}

