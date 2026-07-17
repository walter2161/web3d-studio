import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TeapotGeometry } from 'three/examples/jsm/geometries/TeapotGeometry.js';
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
  | 'prism'
  // Standard primitives (missing from three's built-ins in raw form)
  | 'teapot'
  | 'tube'
  | 'pyramid'
  | 'geoSphere'
  // Extended primitives
  | 'capsule'
  | 'lExt'
  | 'cExt'
  | 'hose'
  | 'foliage';

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
  // ---- Standard extras (Utah teapot / tube / pyramid / geosphere) ----
  teapot:     { radius: 0.5, segments: 10, lid: true, body: true, bottom: true, handle: true, spout: true },
  tube:       { radius1: 0.5, radius2: 0.35, height: 1, sides: 24, capSegs: 1, heightSegs: 1 },
  pyramid:    { width: 1, depth: 1, height: 1 },
  geoSphere:  { radius: 0.5, segments: 2, family: 0 }, // 0=icosa 1=octa 2=tetra
  // ---- Extended extras ----
  capsule:    { radius: 0.3, height: 1, sides: 24, heightSegs: 8 },
  lExt:       { frontLen: 1, sideLen: 1, frontWidth: 0.2, sideWidth: 0.2, height: 0.8 },
  cExt:       { backLen: 1, sideLen: 0.6, frontLen: 1, backWidth: 0.2, sideWidth: 0.2, frontWidth: 0.2, height: 0.8 },
  hose:       { radius: 0.15, height: 1, sides: 12, segments: 40, bumps: 4, bumpDepth: 0.05 },
  // ---- AEC Extended: Foliage (procedural tree) ----
  // species: 0=Oak 1=Maple 2=Palm 3=Pine 4=Ash 5=Birch 6=Generic 7=Shrub
  foliage:    { height: 6, crownRadius: 3, density: 1, seed: 1, species: 0, leafSize: 0.35, branchDensity: 1, age: 1, displayAsBox: false },
};

// Shape defaults mirror 3ds Max R3 Shapes rollout. Every shape carries the
// common "Rendering" (renderable / thickness / sides / angle / rectangular
// section) and "Interpolation" (steps / adaptive / optimize) blocks, plus its
// own parametric fields exposed in the command panel.
const COMMON_SHAPE_DEFAULTS = {
  // Rendering
  renderableViewport: false,  // Enable In Viewport
  renderableRender:   false,  // Enable In Renderer
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
    // ---------- Standard extras ----------
    case 'teapot': {
      const g = new TeapotGeometry(
        p.radius, Math.max(2, p.segments | 0),
        !!p.bottom, !!p.lid, !!p.body, false, true
      );
      return g;
    }
    case 'tube': {
      // Two concentric cylinders + top/bottom rings via Lathe.
      const r1 = Math.max(0.001, p.radius1);
      const r2 = Math.max(0, Math.min(p.radius2, r1 - 0.001));
      const h = p.height / 2;
      const pts: THREE.Vector2[] = [
        new THREE.Vector2(r2, -h),
        new THREE.Vector2(r1, -h),
        new THREE.Vector2(r1,  h),
        new THREE.Vector2(r2,  h),
        new THREE.Vector2(r2, -h),
      ];
      return new THREE.LatheGeometry(pts, Math.max(3, p.sides));
    }
    case 'pyramid': {
      // 4-sided pyramid with a rectangular base.
      const w = p.width / 2, d = p.depth / 2, h = p.height;
      const verts = new Float32Array([
        // base (two tris)
        -w, 0, -d,   w, 0, -d,   w, 0,  d,
        -w, 0, -d,   w, 0,  d,  -w, 0,  d,
        // sides
        -w, 0, -d,   0, h, 0,    w, 0, -d,
         w, 0, -d,   0, h, 0,    w, 0,  d,
         w, 0,  d,   0, h, 0,   -w, 0,  d,
        -w, 0,  d,   0, h, 0,   -w, 0, -d,
      ]);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      g.computeVertexNormals();
      return g;
    }
    case 'geoSphere': {
      const r = p.radius, det = Math.max(0, p.segments | 0);
      switch (p.family) {
        case 1: return new THREE.OctahedronGeometry(r, det);
        case 2: return new THREE.TetrahedronGeometry(r);
        default: return new THREE.IcosahedronGeometry(r, det);
      }
    }
    // ---------- Extended extras ----------
    case 'capsule': {
      const r = Math.max(0.001, p.radius);
      const h = Math.max(0.001, p.height);
      return new THREE.CapsuleGeometry(r, h, Math.max(2, p.heightSegs | 0), Math.max(3, p.sides));
    }
    case 'lExt': {
      // Extruded L-shape footprint. Front runs along +X, side along +Z.
      const fl = p.frontLen, sl = p.sideLen, fw = p.frontWidth, sw = p.sideWidth;
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(fl, 0);
      shape.lineTo(fl, fw);
      shape.lineTo(sw, fw);
      shape.lineTo(sw, sl);
      shape.lineTo(0, sl);
      shape.lineTo(0, 0);
      const g = new THREE.ExtrudeGeometry(shape, { depth: p.height, bevelEnabled: false });
      // Extrude is in XY; rotate so extrusion runs up along +Y (like 3ds Max).
      g.rotateX(-Math.PI / 2);
      g.translate(-fl / 2, 0, -sl / 2);
      return g;
    }
    case 'cExt': {
      const bl = p.backLen, sl = p.sideLen, fl = p.frontLen;
      const bw = p.backWidth, sw = p.sideWidth, fw = p.frontWidth;
      const w = Math.max(bl, fl);
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(w, 0);
      shape.lineTo(w, fw);
      shape.lineTo(sw, fw);
      shape.lineTo(sw, sl - bw);
      shape.lineTo(w, sl - bw);
      shape.lineTo(w, sl);
      shape.lineTo(0, sl);
      shape.lineTo(0, 0);
      const g = new THREE.ExtrudeGeometry(shape, { depth: p.height, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      g.translate(-w / 2, 0, -sl / 2);
      return g;
    }
    case 'hose': {
      // Flexible hose approximated as a cylinder with sinusoidal radial ripples.
      const seg = Math.max(4, p.segments | 0);
      const sides = Math.max(3, p.sides | 0);
      const h = p.height, r = p.radius, d = p.bumpDepth, b = Math.max(0, p.bumps);
      const g = new THREE.CylinderGeometry(r, r, h, sides, seg, false);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const t = (y / h + 0.5); // 0..1
        const ripple = 1 + d * Math.sin(t * b * Math.PI * 2);
        pos.setX(i, pos.getX(i) * ripple);
        pos.setZ(i, pos.getZ(i) * ripple);
      }
      g.computeVertexNormals();
      return g;
    }
    case 'foliage': {
      // Procedural parametric tree — trunk (cylinder) + branches (cylinders) +
      // leaf clumps (icosahedra). All merged into one BufferGeometry driven by
      // a seeded PRNG so the same seed always produces the same tree.
      const h = Math.max(0.1, p.height);
      const crown = Math.max(0.1, p.crownRadius);
      const density = Math.max(0.1, p.density);
      const seed = Math.max(1, p.seed | 0);
      const species = p.species | 0;
      const leafSize = Math.max(0.02, p.leafSize);
      const branchDensity = Math.max(0.1, p.branchDensity);
      const age = Math.max(0.1, p.age);

      if (p.displayAsBox) {
        const g = new THREE.BoxGeometry(crown * 2, h, crown * 2);
        g.translate(0, h / 2, 0);
        return g;
      }

      // Mulberry32 PRNG — deterministic from seed.
      let s = seed >>> 0;
      const rand = () => {
        s |= 0; s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const rr = (a: number, b: number) => a + (b - a) * rand();

      // Species-specific traits
      const isPalm    = species === 2;
      const isPine    = species === 3;
      const isShrub   = species === 7;
      const trunkR   = h * (isShrub ? 0.02 : isPalm ? 0.03 : 0.05) * age;
      const trunkH   = isShrub ? h * 0.3 : isPalm ? h * 0.9 : h * 0.55;
      const trunkTopR = trunkR * (isPalm ? 0.7 : 0.55);
      const branchCount = Math.round((isShrub ? 12 : isPalm ? 8 : isPine ? 14 : 10) * branchDensity * density);
      const clumpCount  = Math.round((isShrub ? 8 : isPalm ? 6 : isPine ? 10 : 12) * density);

      const parts: THREE.BufferGeometry[] = [];

      // Trunk
      const trunk = new THREE.CylinderGeometry(trunkTopR, trunkR, trunkH, 10);
      trunk.translate(0, trunkH / 2, 0);
      parts.push(trunk);

      // Branches
      for (let i = 0; i < branchCount; i++) {
        const yStart = isPalm ? trunkH * rr(0.9, 1.0) : trunkH * rr(0.35, 0.95);
        const ang = rr(0, Math.PI * 2);
        const tilt = isPalm ? rr(0.15, 0.55) : isPine ? rr(0.25, 0.7) : rr(0.35, 0.9);
        const len = crown * (isShrub ? rr(0.5, 1.0) : rr(0.6, 1.1));
        const br = trunkR * rr(0.25, 0.5);
        const b = new THREE.CylinderGeometry(br * 0.4, br, len, 6);
        b.translate(0, len / 2, 0);
        // Rotate branch: first tilt around X, then spin around Y.
        const m = new THREE.Matrix4();
        m.makeRotationX(tilt);
        b.applyMatrix4(m);
        m.makeRotationY(ang);
        b.applyMatrix4(m);
        b.translate(0, yStart, 0);
        parts.push(b);
      }

      // Leaf clumps — icosahedra scattered inside the crown volume.
      if (!isPine || clumpCount > 0) {
        for (let i = 0; i < clumpCount; i++) {
          const ang = rr(0, Math.PI * 2);
          const rad = crown * rr(0.3, 1.0);
          const yBase = isPalm
            ? trunkH + rr(0, crown * 0.4)
            : isShrub
              ? rr(trunkH * 0.5, h * 0.9)
              : rr(trunkH * 0.6, h * 0.98);
          const cx = Math.cos(ang) * rad * (isPalm ? 0.9 : 1);
          const cz = Math.sin(ang) * rad * (isPalm ? 0.9 : 1);
          const cy = isPine
            ? yBase + (h - yBase) * rr(0, 0.3)
            : yBase;
          const size = leafSize * (isPine ? rr(0.6, 1.2) : rr(0.8, 1.4));
          const clump = new THREE.IcosahedronGeometry(size, 0);
          if (isPine) clump.scale(1, 1.6, 1);
          clump.translate(cx, cy, cz);
          parts.push(clump);
        }
      }

      // Pine top cone
      if (isPine) {
        const cone = new THREE.ConeGeometry(crown * 0.5, h * 0.4, 10);
        cone.translate(0, h * 0.85, 0);
        parts.push(cone);
      }

      const merged = mergeGeometries(parts, false);
      if (merged) {
        merged.computeVertexNormals();
        return merged;
      }
      return trunk;
    }
  }
}

// ---------------- Shape builders (rendered as thin tubes) ----------------

// Section radius / sides / rectangular tube driven by the shape's Rendering rollout.
function sectionFromParams(p: any) {
  const t = Math.max(0.001, Number(p?.thickness ?? 0.02));
  const s = Math.max(3, Math.floor(p?.sides ?? 6));
  return { t, s };
}

function shapeToTube(curve: THREE.Curve<THREE.Vector3>, segments = 128, params: any = {}): THREE.BufferGeometry {
  const { t, s } = sectionFromParams(params);
  return new THREE.TubeGeometry(curve, segments, t, s, false);
}

function pointsToTube(pts: THREE.Vector2[], closed = true, params: any = {}): THREE.BufferGeometry {
  const pts3 = pts.map((v) => new THREE.Vector3(v.x, 0, v.y));
  const curve = new THREE.CatmullRomCurve3(pts3, closed, 'catmullrom', 0);
  const { t, s } = sectionFromParams(params);
  const seg = Math.max(64, (params?.interpolationSteps ?? 6) * pts.length * 2);
  return new THREE.TubeGeometry(curve, seg, t, s, closed);
}

// Build a rounded rectangle sample point list.
function roundedRectPoints(w: number, h: number, r: number, seg: number): THREE.Vector2[] {
  const hw = w / 2, hh = h / 2;
  const rr = Math.max(0, Math.min(r, hw, hh));
  if (rr <= 1e-4) {
    return [
      new THREE.Vector2(-hw, -hh), new THREE.Vector2(hw, -hh),
      new THREE.Vector2(hw,  hh),  new THREE.Vector2(-hw,  hh),
    ];
  }
  const pts: THREE.Vector2[] = [];
  const n = Math.max(2, seg);
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      pts.push(new THREE.Vector2(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr));
    }
  };
  arc( hw - rr, -hh + rr, -Math.PI / 2, 0);
  arc( hw - rr,  hh - rr, 0, Math.PI / 2);
  arc(-hw + rr,  hh - rr, Math.PI / 2, Math.PI);
  arc(-hw + rr, -hh + rr, Math.PI, Math.PI * 1.5);
  return pts;
}

// Sample an arc/pie between two angles (degrees) around origin at radius r,
// optionally producing a closed "pie slice" by adding the centre point.
function arcPoints(r: number, startDeg: number, endDeg: number, pie: boolean, reverse: boolean, seg: number, ry?: number): THREE.Vector2[] {
  let a0 = (startDeg * Math.PI) / 180;
  let a1 = (endDeg * Math.PI) / 180;
  if (reverse) { const t = a0; a0 = a1; a1 = t; }
  const rY = ry ?? r;
  const n = Math.max(8, seg * 8);
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * rY));
  }
  if (pie) pts.push(new THREE.Vector2(0, 0));
  return pts;
}

export function buildShape(type: ShapeType, params: any = {}): THREE.BufferGeometry {
  const p = { ...SHAPE_DEFAULTS[type], ...params };

  switch (type) {
    case 'line': {
      // Line: prefer explicit `knots` (Bezier), fall back to plain `points`, then to a segment.
      const knots: Array<{ pos: number[]; inH: number[]; outH: number[] }> | undefined = p.knots;
      const closed = !!p.closed;
      let sampled: THREE.Vector3[] | null = null;
      const steps = Math.max(1, Math.floor(p.interpolationSteps ?? 6));
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
          const seg = curve.getPoints(Math.max(4, steps * 4));
          if (i > 0) seg.shift();
          sampled.push(...seg);
        }
      } else if (p.points && p.points.length >= 2) {
        sampled = (p.points as number[][]).map((v) => new THREE.Vector3(v[0], v[1], v[2]));
      }
      if (sampled && sampled.length >= 2) {
        const curve = new THREE.CatmullRomCurve3(sampled, closed, 'catmullrom', 0);
        const { t, s } = sectionFromParams(p);
        const segs = Math.max(32, sampled.length * Math.max(4, steps));
        return new THREE.TubeGeometry(curve, segs, t, s, closed);
      }
      const curve = new THREE.LineCurve3(new THREE.Vector3(-p.length / 2, 0, 0), new THREE.Vector3(p.length / 2, 0, 0));
      return shapeToTube(curve, 8, p);
    }
    case 'rectangle': {
      // Length = Y, Width = X in 3ds Max. Support legacy `height` alias.
      const w = p.width, h = p.length ?? p.height, r = Math.max(0, (p.cornerRadius ?? 0) + (p.fillet ?? 0));
      const seg = Math.max(2, Math.floor(p.interpolationSteps ?? 6));
      return pointsToTube(roundedRectPoints(w, h, r, seg), true, p);
    }
    case 'circle': {
      const seg = Math.max(2, Math.floor(p.interpolationSteps ?? 6));
      if (p.pieSlice) {
        return pointsToTube(arcPoints(p.radius, p.startAngle ?? 0, p.endAngle ?? 360, true, !!p.reverse, seg), true, p);
      }
      return pointsToTube(arcPoints(p.radius, 0, 360, false, !!p.reverse, seg), true, p);
    }
    case 'ellipse': {
      const seg = Math.max(2, Math.floor(p.interpolationSteps ?? 6));
      if (p.pieSlice) {
        return pointsToTube(arcPoints(p.radiusX, p.startAngle ?? 0, p.endAngle ?? 360, true, false, seg, p.radiusY), true, p);
      }
      return pointsToTube(arcPoints(p.radiusX, 0, 360, false, false, seg, p.radiusY), true, p);
    }
    case 'arc': {
      const seg = Math.max(2, Math.floor(p.interpolationSteps ?? 6));
      return pointsToTube(arcPoints(p.radius, p.from ?? 0, p.to ?? 180, !!p.pie, !!p.reverse, seg), !!p.pie, p);
    }
    case 'donut': {
      // Two concentric splines: outer + inner ring. Rendered as a merged tube.
      const seg = Math.max(2, Math.floor(p.interpolationSteps ?? 6));
      const rOut = Math.max(p.radius1, p.radius2);
      const rIn  = Math.min(p.radius1, p.radius2);
      const outer = arcPoints(rOut, 0, 360, false, false, seg);
      const inner = arcPoints(rIn,  0, 360, false, true,  seg);
      const outerGeom = pointsToTube(outer, true, p);
      const innerGeom = pointsToTube(inner, true, p);
      const merged = mergeGeometries([outerGeom, innerGeom]);
      return merged ?? outerGeom;
    }
    case 'ngon': {
      const n = Math.max(3, Math.floor(p.sides));
      const rr = p.inscribed === false
        ? p.radius / Math.cos(Math.PI / n) // circumscribed
        : p.radius;
      const seg = Math.max(2, Math.floor(p.interpolationSteps ?? 6));
      if (p.circular) {
        return pointsToTube(arcPoints(rr, 0, 360, false, false, seg), true, p);
      }
      // Corners with optional fillet.
      const corners: THREE.Vector2[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        corners.push(new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr));
      }
      const f = Math.max(0, Math.min(p.fillet ?? 0, rr * 0.9));
      if (f <= 1e-4) return pointsToTube(corners, true, p);
      // Round each corner with a small arc from midpoint→midpoint.
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i < n; i++) {
        const prev = corners[(i - 1 + n) % n];
        const cur  = corners[i];
        const nxt  = corners[(i + 1) % n];
        const inDir  = new THREE.Vector2().subVectors(cur, prev).normalize();
        const outDir = new THREE.Vector2().subVectors(nxt, cur).normalize();
        const pA = cur.clone().addScaledVector(inDir,  -f);
        const pB = cur.clone().addScaledVector(outDir,  f);
        pts.push(pA);
        // simple quadratic-like arc via 3 samples
        for (let k = 1; k <= 4; k++) {
          const t = k / 5;
          const q0 = pA.clone().lerp(cur, t);
          const q1 = cur.clone().lerp(pB, t);
          pts.push(q0.lerp(q1, t));
        }
        pts.push(pB);
      }
      return pointsToTube(pts, true, p);
    }
    case 'star': {
      const nPts = Math.max(3, Math.floor(p.points));
      const dist = p.distortion ?? 0;
      const twist = ((p.twist ?? 0) * Math.PI) / 180;
      const pts: THREE.Vector2[] = [];
      const n = nPts * 2;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const a = t * Math.PI * 2 - Math.PI / 2 + twist * t;
        const isOuter = i % 2 === 0;
        const r = isOuter ? p.radius1 : (p.radius2 + dist);
        pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
      }
      // Apply fillet: soften every vertex by shrinking towards its neighbours.
      const f1 = Math.max(0, p.filletRadius1 ?? 0);
      const f2 = Math.max(0, p.filletRadius2 ?? 0);
      if (f1 > 1e-4 || f2 > 1e-4) {
        const out: THREE.Vector2[] = [];
        for (let i = 0; i < pts.length; i++) {
          const prev = pts[(i - 1 + pts.length) % pts.length];
          const cur = pts[i];
          const nxt = pts[(i + 1) % pts.length];
          const f = i % 2 === 0 ? f1 : f2;
          if (f <= 1e-4) { out.push(cur); continue; }
          const pA = cur.clone().lerp(prev, Math.min(0.5, f));
          const pB = cur.clone().lerp(nxt,  Math.min(0.5, f));
          out.push(pA, cur.clone().lerp(pA.clone().lerp(pB, 0.5), 0.5), pB);
        }
        return pointsToTube(out, true, p);
      }
      return pointsToTube(pts, true, p);
    }
    case 'helix': {
      const turns = Math.max(0.01, p.turns);
      const bias = THREE.MathUtils.clamp(p.bias ?? 0, -1, 1);
      const cwSign = p.clockwise === false ? -1 : 1;
      const pts3: THREE.Vector3[] = [];
      const steps = Math.max(2, Math.floor(p.interpolationSteps ?? 6));
      const n = 32 * Math.max(1, Math.round(turns * steps));
      for (let i = 0; i <= n; i++) {
        let t = i / n;
        // Bias skews the vertical distribution: negative packs turns at the
        // bottom, positive at the top (Max's "Bias" spinner behaviour).
        if (bias !== 0) t = Math.pow(t, Math.pow(2, -bias));
        const a = t * Math.PI * 2 * turns * cwSign;
        const r = p.radius1 + (p.radius2 - p.radius1) * (i / n);
        pts3.push(new THREE.Vector3(Math.cos(a) * r, t * p.height - p.height / 2, Math.sin(a) * r));
      }
      const curve = new THREE.CatmullRomCurve3(pts3, false);
      const { t: tt, s } = sectionFromParams(p);
      return new THREE.TubeGeometry(curve, Math.max(128, n * 2), tt, s, false);
    }
    case 'text': {
      // Vectorise glyphs → flat, filled letters on the XZ ground plane.
      const raw = String(p.text ?? 'Text');
      const lines = (p.reverse ? raw.split('').reverse().join('') : raw).split(/\r?\n/);
      const size = p.size ?? 1;
      const tracking = p.tracking ?? 0;
      const kerning = (p.kerning ?? 0) + tracking; // tracking widens spacing globally
      const leading = (p.leading ?? 1.2) * size;
      const align = (p.alignment ?? 'left') as 'left' | 'center' | 'right' | 'justify';
      const curveSeg = p.curveSegments ?? 6;

      // Build ShapeGeometry per line, then translate lines vertically and
      // horizontally-align them together.
      const lineGeoms: { geom: THREE.BufferGeometry; width: number; ascent: number }[] = [];
      for (const line of lines) {
        const shapes = buildTextShapes(line, p.font ?? 'helvetiker', !!p.bold, size, kerning, curveSeg);
        if (!shapes.length) { lineGeoms.push({ geom: new THREE.BufferGeometry(), width: 0, ascent: size }); continue; }
        const g = new THREE.ShapeGeometry(shapes, curveSeg);
        g.rotateX(-Math.PI / 2);
        g.computeBoundingBox();
        const bb = g.boundingBox!;
        lineGeoms.push({ geom: g, width: bb.max.x - bb.min.x, ascent: bb.max.z - bb.min.z });
      }

      // Optional italic — skew geometry along X in proportion to Z (baseline).
      if (p.italic) {
        for (const lg of lineGeoms) {
          const pos = lg.geom.attributes.position;
          if (pos) {
            for (let i = 0; i < pos.count; i++) {
              const x = pos.getX(i), z = pos.getZ(i);
              pos.setX(i, x - z * 0.2);
            }
            pos.needsUpdate = true;
          }
        }
      }

      const maxW = lineGeoms.reduce((m, l) => Math.max(m, l.width), 0);
      const parts: THREE.BufferGeometry[] = [];
      let yOffset = 0;
      lineGeoms.forEach((lg, idx) => {
        if (!lg.geom.attributes.position) return;
        let xShift = 0;
        if (align === 'center') xShift = -lg.width / 2;
        else if (align === 'right') xShift = -lg.width;
        else if (align === 'justify' && idx < lineGeoms.length - 1) {
          // stretch to maxW — scale in X.
          const factor = lg.width > 1e-4 ? maxW / lg.width : 1;
          lg.geom.applyMatrix4(new THREE.Matrix4().makeScale(factor, 1, 1));
          lg.geom.computeBoundingBox();
        }
        lg.geom.translate(xShift, 0, -yOffset);
        yOffset += leading;
        parts.push(lg.geom);

        // Underline — thin plate under each line on the XZ plane.
        if (p.underline) {
          const uw = align === 'justify' && idx < lineGeoms.length - 1 ? maxW : lg.width;
          const ug = new THREE.PlaneGeometry(uw, size * 0.06);
          ug.rotateX(-Math.PI / 2);
          const ux = align === 'center' ? 0 : align === 'right' ? -uw / 2 : uw / 2;
          ug.translate(ux + xShift, 0, -yOffset + leading - size * 1.05);
          parts.push(ug);
        }
      });
      const merged = mergeGeometries(parts.filter((g) => g.attributes.position));
      const flat = merged ?? new THREE.BufferGeometry();
      if (flat.attributes.position) {
        flat.computeBoundingBox();
        const bb = flat.boundingBox!;
        const cx = (bb.min.x + bb.max.x) / 2;
        const cz = (bb.min.z + bb.max.z) / 2;
        flat.translate(-cx, 0, -cz);
      }
      return flat;
    }
  }
}

