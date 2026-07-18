import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModifierControls } from './ModifierControls';
import { cn } from '@/lib/utils';
import { EXT_PRIM_DEFAULTS, SHAPE_DEFAULTS, FOLIAGE_SPECIES } from './utils/extendedGeometry';
import { MaxRollout, MaxSpinner, MaxCheck, MaxSelect } from './r3/MaxParamPanel';
import { PrintToolsPanel } from './print3d/PrintToolsPanel';
import { EditableSplinePanel } from './r3/EditableSplinePanel';
import { RigHierarchyPanel } from './r3/RigHierarchyPanel';
import { setSplineSel, getSplineSel, subscribeSplineSel } from './editable/splineSelStore';
import type { SplineSubLevel } from './editable/EditableSpline';
import { setModifierSub, GIZMO_MODIFIER_TYPES } from './r3/modifierSubStore';

// -------- Geometry parameter schema (drives the Base object panel) --------
type ParamKind = 'float' | 'int';
interface ParamDef { key: string; label: string; kind: ParamKind; default: number; min?: number; step?: number; }

const GEOM_SCHEMA: Record<string, ParamDef[]> = {
  // Standard primitives
  box: [
    { key: 'width',  label: 'Width',  kind: 'float', default: 1, min: 0.001, step: 0.1 },
    { key: 'height', label: 'Height', kind: 'float', default: 1, min: 0.001, step: 0.1 },
    { key: 'depth',  label: 'Depth',  kind: 'float', default: 1, min: 0.001, step: 0.1 },
    { key: 'widthSegments',  label: 'W Segs', kind: 'int', default: 1, min: 1 },
    { key: 'heightSegments', label: 'H Segs', kind: 'int', default: 1, min: 1 },
    { key: 'depthSegments',  label: 'D Segs', kind: 'int', default: 1, min: 1 },
  ],
  sphere: [
    { key: 'radius', label: 'Radius', kind: 'float', default: 0.5, min: 0.001, step: 0.1 },
    { key: 'widthSegments',  label: 'W Segs', kind: 'int', default: 32, min: 3 },
    { key: 'heightSegments', label: 'H Segs', kind: 'int', default: 32, min: 2 },
  ],
  cylinder: [
    { key: 'radiusTop',    label: 'Top R',    kind: 'float', default: 0.5, min: 0, step: 0.1 },
    { key: 'radiusBottom', label: 'Bottom R', kind: 'float', default: 0.5, min: 0, step: 0.1 },
    { key: 'height',       label: 'Height',   kind: 'float', default: 1,   min: 0.001, step: 0.1 },
    { key: 'radialSegments', label: 'Radial Segs', kind: 'int', default: 32, min: 3 },
    { key: 'heightSegments', label: 'Height Segs', kind: 'int', default: 1,  min: 1 },
  ],
  cone: [
    { key: 'radius', label: 'Radius', kind: 'float', default: 0.5, min: 0.001, step: 0.1 },
    { key: 'height', label: 'Height', kind: 'float', default: 1,   min: 0.001, step: 0.1 },
    { key: 'radialSegments', label: 'Radial Segs', kind: 'int', default: 32, min: 3 },
    { key: 'heightSegments', label: 'Height Segs', kind: 'int', default: 1,  min: 1 },
  ],
  torus: [
    { key: 'radius', label: 'Radius',    kind: 'float', default: 0.5,  min: 0.001, step: 0.1 },
    { key: 'tube',   label: 'Tube',      kind: 'float', default: 0.15, min: 0.001, step: 0.05 },
    { key: 'radialSegments',   label: 'Radial Segs',   kind: 'int', default: 16, min: 3 },
    { key: 'tubularSegments',  label: 'Tubular Segs',  kind: 'int', default: 48, min: 3 },
  ],
  plane: [
    { key: 'width',  label: 'Width',  kind: 'float', default: 1, min: 0.001, step: 0.1 },
    { key: 'height', label: 'Height', kind: 'float', default: 1, min: 0.001, step: 0.1 },
    { key: 'widthSegments',  label: 'W Segs', kind: 'int', default: 1, min: 1 },
    { key: 'heightSegments', label: 'H Segs', kind: 'int', default: 1, min: 1 },
  ],
  // Extended primitives — derived from EXT_PRIM_DEFAULTS
  hedra: [
    { key: 'radius', label: 'Radius', kind: 'float', default: EXT_PRIM_DEFAULTS.hedra.radius, min: 0.001, step: 0.1 },
    { key: 'family', label: 'Family (0-4)', kind: 'int', default: EXT_PRIM_DEFAULTS.hedra.family, min: 0 },
  ],
  chamferBox: [
    { key: 'width',  label: 'Width',  kind: 'float', default: EXT_PRIM_DEFAULTS.chamferBox.width, min: 0.001, step: 0.1 },
    { key: 'height', label: 'Height', kind: 'float', default: EXT_PRIM_DEFAULTS.chamferBox.height, min: 0.001, step: 0.1 },
    { key: 'depth',  label: 'Depth',  kind: 'float', default: EXT_PRIM_DEFAULTS.chamferBox.depth, min: 0.001, step: 0.1 },
    { key: 'fillet', label: 'Fillet', kind: 'float', default: EXT_PRIM_DEFAULTS.chamferBox.fillet, min: 0, step: 0.01 },
    { key: 'segments', label: 'Fillet Segs', kind: 'int', default: EXT_PRIM_DEFAULTS.chamferBox.segments, min: 1 },
  ],
  chamferCyl: [
    { key: 'radius', label: 'Radius', kind: 'float', default: EXT_PRIM_DEFAULTS.chamferCyl.radius, min: 0.001, step: 0.1 },
    { key: 'height', label: 'Height', kind: 'float', default: EXT_PRIM_DEFAULTS.chamferCyl.height, min: 0.001, step: 0.1 },
    { key: 'fillet', label: 'Fillet', kind: 'float', default: EXT_PRIM_DEFAULTS.chamferCyl.fillet, min: 0, step: 0.01 },
    { key: 'sides',    label: 'Sides',      kind: 'int', default: EXT_PRIM_DEFAULTS.chamferCyl.sides, min: 3 },
    { key: 'segments', label: 'Fillet Segs', kind: 'int', default: EXT_PRIM_DEFAULTS.chamferCyl.segments, min: 1 },
  ],
  oilTank: [
    { key: 'radius', label: 'Radius', kind: 'float', default: EXT_PRIM_DEFAULTS.oilTank.radius, min: 0.001, step: 0.1 },
    { key: 'height', label: 'Height', kind: 'float', default: EXT_PRIM_DEFAULTS.oilTank.height, min: 0.001, step: 0.1 },
    { key: 'capHeight', label: 'Cap Height', kind: 'float', default: EXT_PRIM_DEFAULTS.oilTank.capHeight, min: 0.001, step: 0.05 },
    { key: 'sides', label: 'Sides', kind: 'int', default: EXT_PRIM_DEFAULTS.oilTank.sides, min: 3 },
  ],
  spindle: [
    { key: 'radius', label: 'Radius', kind: 'float', default: EXT_PRIM_DEFAULTS.spindle.radius, min: 0.001, step: 0.1 },
    { key: 'height', label: 'Height', kind: 'float', default: EXT_PRIM_DEFAULTS.spindle.height, min: 0.001, step: 0.1 },
    { key: 'capHeight', label: 'Cap Height', kind: 'float', default: EXT_PRIM_DEFAULTS.spindle.capHeight, min: 0.001, step: 0.05 },
    { key: 'sides', label: 'Sides', kind: 'int', default: EXT_PRIM_DEFAULTS.spindle.sides, min: 3 },
  ],
  gengon: [
    { key: 'radius', label: 'Radius', kind: 'float', default: EXT_PRIM_DEFAULTS.gengon.radius, min: 0.001, step: 0.1 },
    { key: 'height', label: 'Height', kind: 'float', default: EXT_PRIM_DEFAULTS.gengon.height, min: 0.001, step: 0.1 },
    { key: 'sides',  label: 'Sides',  kind: 'int',   default: EXT_PRIM_DEFAULTS.gengon.sides,  min: 3 },
    { key: 'fillet', label: 'Fillet', kind: 'float', default: EXT_PRIM_DEFAULTS.gengon.fillet, min: 0, step: 0.01 },
  ],
  torusKnot: [
    { key: 'radius', label: 'Radius', kind: 'float', default: EXT_PRIM_DEFAULTS.torusKnot.radius, min: 0.001, step: 0.1 },
    { key: 'tube',   label: 'Tube',   kind: 'float', default: EXT_PRIM_DEFAULTS.torusKnot.tube,   min: 0.001, step: 0.05 },
    { key: 'tubularSegments', label: 'Tubular Segs', kind: 'int', default: EXT_PRIM_DEFAULTS.torusKnot.tubularSegments, min: 3 },
    { key: 'radialSegments',  label: 'Radial Segs',  kind: 'int', default: EXT_PRIM_DEFAULTS.torusKnot.radialSegments,  min: 3 },
    { key: 'p', label: 'P', kind: 'int', default: EXT_PRIM_DEFAULTS.torusKnot.p, min: 1 },
    { key: 'q', label: 'Q', kind: 'int', default: EXT_PRIM_DEFAULTS.torusKnot.q, min: 1 },
  ],
  ringWave: [
    { key: 'outerRadius', label: 'Outer R', kind: 'float', default: EXT_PRIM_DEFAULTS.ringWave.outerRadius, min: 0.001, step: 0.1 },
    { key: 'innerRadius', label: 'Inner R', kind: 'float', default: EXT_PRIM_DEFAULTS.ringWave.innerRadius, min: 0,     step: 0.1 },
    { key: 'sides',       label: 'Sides',   kind: 'int',   default: EXT_PRIM_DEFAULTS.ringWave.sides, min: 3 },
    { key: 'height',      label: 'Height',  kind: 'float', default: EXT_PRIM_DEFAULTS.ringWave.height, min: 0, step: 0.05 },
  ],
  prism: [
    { key: 'side1',  label: 'Side 1', kind: 'float', default: EXT_PRIM_DEFAULTS.prism.side1, min: 0.001, step: 0.1 },
    { key: 'side2',  label: 'Side 2', kind: 'float', default: EXT_PRIM_DEFAULTS.prism.side2, min: 0.001, step: 0.1 },
    { key: 'side3',  label: 'Side 3', kind: 'float', default: EXT_PRIM_DEFAULTS.prism.side3, min: 0.001, step: 0.1 },
    { key: 'height', label: 'Height', kind: 'float', default: EXT_PRIM_DEFAULTS.prism.height, min: 0.001, step: 0.1 },
  ],
  // Standard extras
  teapot: [
    { key: 'radius',   label: 'Radius',   kind: 'float', default: EXT_PRIM_DEFAULTS.teapot.radius, min: 0.001, step: 0.1 },
    { key: 'segments', label: 'Segments', kind: 'int',   default: EXT_PRIM_DEFAULTS.teapot.segments, min: 2 },
  ],
  tube: [
    { key: 'radius1', label: 'Outer R', kind: 'float', default: EXT_PRIM_DEFAULTS.tube.radius1, min: 0.001, step: 0.1 },
    { key: 'radius2', label: 'Inner R', kind: 'float', default: EXT_PRIM_DEFAULTS.tube.radius2, min: 0,     step: 0.1 },
    { key: 'height',  label: 'Height',  kind: 'float', default: EXT_PRIM_DEFAULTS.tube.height,  min: 0.001, step: 0.1 },
    { key: 'sides',   label: 'Sides',   kind: 'int',   default: EXT_PRIM_DEFAULTS.tube.sides,   min: 3 },
  ],
  pyramid: [
    { key: 'width',  label: 'Width',  kind: 'float', default: EXT_PRIM_DEFAULTS.pyramid.width,  min: 0.001, step: 0.1 },
    { key: 'depth',  label: 'Depth',  kind: 'float', default: EXT_PRIM_DEFAULTS.pyramid.depth,  min: 0.001, step: 0.1 },
    { key: 'height', label: 'Height', kind: 'float', default: EXT_PRIM_DEFAULTS.pyramid.height, min: 0.001, step: 0.1 },
  ],
  geoSphere: [
    { key: 'radius',   label: 'Radius',       kind: 'float', default: EXT_PRIM_DEFAULTS.geoSphere.radius, min: 0.001, step: 0.1 },
    { key: 'segments', label: 'Subdivisions', kind: 'int',   default: EXT_PRIM_DEFAULTS.geoSphere.segments, min: 0 },
    { key: 'family',   label: 'Base (0-2)',   kind: 'int',   default: EXT_PRIM_DEFAULTS.geoSphere.family, min: 0 },
  ],
  // Extended extras
  capsule: [
    { key: 'radius',     label: 'Radius',     kind: 'float', default: EXT_PRIM_DEFAULTS.capsule.radius, min: 0.001, step: 0.1 },
    { key: 'height',     label: 'Height',     kind: 'float', default: EXT_PRIM_DEFAULTS.capsule.height, min: 0.001, step: 0.1 },
    { key: 'sides',      label: 'Sides',      kind: 'int',   default: EXT_PRIM_DEFAULTS.capsule.sides, min: 3 },
    { key: 'heightSegs', label: 'Cap Segs',   kind: 'int',   default: EXT_PRIM_DEFAULTS.capsule.heightSegs, min: 1 },
  ],
  lExt: [
    { key: 'frontLen',   label: 'Front Len',   kind: 'float', default: EXT_PRIM_DEFAULTS.lExt.frontLen,   min: 0.001, step: 0.1 },
    { key: 'sideLen',    label: 'Side Len',    kind: 'float', default: EXT_PRIM_DEFAULTS.lExt.sideLen,    min: 0.001, step: 0.1 },
    { key: 'frontWidth', label: 'Front Width', kind: 'float', default: EXT_PRIM_DEFAULTS.lExt.frontWidth, min: 0.001, step: 0.05 },
    { key: 'sideWidth',  label: 'Side Width',  kind: 'float', default: EXT_PRIM_DEFAULTS.lExt.sideWidth,  min: 0.001, step: 0.05 },
    { key: 'height',     label: 'Height',      kind: 'float', default: EXT_PRIM_DEFAULTS.lExt.height,     min: 0.001, step: 0.1 },
  ],
  cExt: [
    { key: 'backLen',    label: 'Back Len',    kind: 'float', default: EXT_PRIM_DEFAULTS.cExt.backLen,    min: 0.001, step: 0.1 },
    { key: 'sideLen',    label: 'Side Len',    kind: 'float', default: EXT_PRIM_DEFAULTS.cExt.sideLen,    min: 0.001, step: 0.1 },
    { key: 'frontLen',   label: 'Front Len',   kind: 'float', default: EXT_PRIM_DEFAULTS.cExt.frontLen,   min: 0.001, step: 0.1 },
    { key: 'backWidth',  label: 'Back Width',  kind: 'float', default: EXT_PRIM_DEFAULTS.cExt.backWidth,  min: 0.001, step: 0.05 },
    { key: 'sideWidth',  label: 'Side Width',  kind: 'float', default: EXT_PRIM_DEFAULTS.cExt.sideWidth,  min: 0.001, step: 0.05 },
    { key: 'frontWidth', label: 'Front Width', kind: 'float', default: EXT_PRIM_DEFAULTS.cExt.frontWidth, min: 0.001, step: 0.05 },
    { key: 'height',     label: 'Height',      kind: 'float', default: EXT_PRIM_DEFAULTS.cExt.height,     min: 0.001, step: 0.1 },
  ],
  hose: [
    { key: 'radius',    label: 'Radius',     kind: 'float', default: EXT_PRIM_DEFAULTS.hose.radius,    min: 0.001, step: 0.05 },
    { key: 'height',    label: 'Height',     kind: 'float', default: EXT_PRIM_DEFAULTS.hose.height,    min: 0.001, step: 0.1 },
    { key: 'sides',     label: 'Sides',      kind: 'int',   default: EXT_PRIM_DEFAULTS.hose.sides,     min: 3 },
    { key: 'segments',  label: 'Segments',   kind: 'int',   default: EXT_PRIM_DEFAULTS.hose.segments,  min: 4 },
    { key: 'bumps',     label: 'Bumps',      kind: 'int',   default: EXT_PRIM_DEFAULTS.hose.bumps,     min: 0 },
    { key: 'bumpDepth', label: 'Bump Depth', kind: 'float', default: EXT_PRIM_DEFAULTS.hose.bumpDepth, min: 0,   step: 0.01 },
  ],
  // AEC — Foliage (procedural tree)
  foliage: [
    { key: 'height',         label: 'Height',        kind: 'float', default: EXT_PRIM_DEFAULTS.foliage.height,        min: 0.1,  step: 0.5 },
    { key: 'crownRadius',    label: 'Crown Radius',  kind: 'float', default: EXT_PRIM_DEFAULTS.foliage.crownRadius,   min: 0.1,  step: 0.25 },
    { key: 'species',        label: 'Species (0-7)', kind: 'int',   default: EXT_PRIM_DEFAULTS.foliage.species,       min: 0 },
    { key: 'seed',           label: 'Seed',          kind: 'int',   default: EXT_PRIM_DEFAULTS.foliage.seed,          min: 1 },
    { key: 'density',        label: 'Density',       kind: 'float', default: EXT_PRIM_DEFAULTS.foliage.density,       min: 0.1,  step: 0.1 },
    { key: 'branchDensity',  label: 'Branch Dens.',  kind: 'float', default: EXT_PRIM_DEFAULTS.foliage.branchDensity, min: 0.1,  step: 0.1 },
    { key: 'leafSize',       label: 'Leaf Size',     kind: 'float', default: EXT_PRIM_DEFAULTS.foliage.leafSize,      min: 0.02, step: 0.05 },
    { key: 'age',            label: 'Age',           kind: 'float', default: EXT_PRIM_DEFAULTS.foliage.age,           min: 0.1,  step: 0.1 },
  ],
  // Shapes
  rectangle: [
    { key: 'width',  label: 'Width',  kind: 'float', default: SHAPE_DEFAULTS.rectangle.width,  min: 0.001, step: 0.1 },
    { key: 'height', label: 'Height', kind: 'float', default: SHAPE_DEFAULTS.rectangle.height, min: 0.001, step: 0.1 },
    { key: 'cornerRadius', label: 'Corner R', kind: 'float', default: SHAPE_DEFAULTS.rectangle.cornerRadius, min: 0, step: 0.01 },
  ],
  circle:  [{ key: 'radius', label: 'Radius', kind: 'float', default: SHAPE_DEFAULTS.circle.radius, min: 0.001, step: 0.1 }],
  ellipse: [
    { key: 'radiusX', label: 'Radius X', kind: 'float', default: SHAPE_DEFAULTS.ellipse.radiusX, min: 0.001, step: 0.1 },
    { key: 'radiusY', label: 'Radius Y', kind: 'float', default: SHAPE_DEFAULTS.ellipse.radiusY, min: 0.001, step: 0.1 },
  ],
  arc: [
    { key: 'radius', label: 'Radius', kind: 'float', default: SHAPE_DEFAULTS.arc.radius, min: 0.001, step: 0.1 },
    { key: 'from',   label: 'From °', kind: 'float', default: SHAPE_DEFAULTS.arc.from, step: 1 },
    { key: 'to',     label: 'To °',   kind: 'float', default: SHAPE_DEFAULTS.arc.to,   step: 1 },
  ],
  donut: [
    { key: 'radius1', label: 'Radius 1', kind: 'float', default: SHAPE_DEFAULTS.donut.radius1, min: 0.001, step: 0.1 },
    { key: 'radius2', label: 'Radius 2', kind: 'float', default: SHAPE_DEFAULTS.donut.radius2, min: 0.001, step: 0.1 },
  ],
  ngon: [
    { key: 'radius', label: 'Radius', kind: 'float', default: SHAPE_DEFAULTS.ngon.radius, min: 0.001, step: 0.1 },
    { key: 'sides',  label: 'Sides',  kind: 'int',   default: SHAPE_DEFAULTS.ngon.sides,  min: 3 },
  ],
  star: [
    { key: 'radius1', label: 'Radius 1', kind: 'float', default: SHAPE_DEFAULTS.star.radius1, min: 0.001, step: 0.1 },
    { key: 'radius2', label: 'Radius 2', kind: 'float', default: SHAPE_DEFAULTS.star.radius2, min: 0.001, step: 0.1 },
    { key: 'points',  label: 'Points',   kind: 'int',   default: SHAPE_DEFAULTS.star.points,  min: 3 },
  ],
  helix: [
    { key: 'radius1', label: 'Radius 1', kind: 'float', default: SHAPE_DEFAULTS.helix.radius1, min: 0.001, step: 0.1 },
    { key: 'radius2', label: 'Radius 2', kind: 'float', default: SHAPE_DEFAULTS.helix.radius2, min: 0.001, step: 0.1 },
    { key: 'height',  label: 'Height',   kind: 'float', default: SHAPE_DEFAULTS.helix.height,  min: 0.001, step: 0.1 },
    { key: 'turns',   label: 'Turns',    kind: 'int',   default: SHAPE_DEFAULTS.helix.turns,   min: 1 },
  ],
  line: [
    { key: '__knotCount', label: 'Vertices (read-only)', kind: 'int', default: 0 },
  ],
  text: [
    { key: 'size',    label: 'Size',    kind: 'float', default: SHAPE_DEFAULTS.text.size,    min: 0.01, step: 0.1 },
    { key: 'kerning', label: 'Kerning', kind: 'float', default: SHAPE_DEFAULTS.text.kerning, step: 0.05 },
    { key: 'curveSegments', label: 'Curve Seg', kind: 'int', default: SHAPE_DEFAULTS.text.curveSegments, min: 1 },
  ],
  // AEC Extended
  wall: [
    { key: 'width',  label: 'Width',  kind: 'float', default: 0.2, min: 0.01, step: 0.05 },
    { key: 'height', label: 'Height', kind: 'float', default: 2.7, min: 0.01, step: 0.1 },
  ],
  door: [
    { key: 'width',       label: 'Width',       kind: 'float', default: 0.9, min: 0.1, step: 0.05 },
    { key: 'height',      label: 'Height',      kind: 'float', default: 2.1, min: 0.1, step: 0.05 },
    { key: 'frameDepth',  label: 'Frame Depth', kind: 'float', default: 0.2, min: 0.02, step: 0.02 },
    { key: 'thickness',   label: 'Leaf Thick.', kind: 'float', default: 0.04, min: 0.005, step: 0.01 },
    { key: 'frameSize',   label: 'Frame Size',  kind: 'float', default: 0.05, min: 0.01, step: 0.01 },
    { key: 'openPercentage', label: 'Open %',   kind: 'float', default: 0, min: 0, step: 0.05 },
  ],
  window: [
    { key: 'width',           label: 'Width',        kind: 'float', default: 1.2, min: 0.1, step: 0.05 },
    { key: 'height',          label: 'Height',       kind: 'float', default: 1.2, min: 0.1, step: 0.05 },
    { key: 'frameDepth',      label: 'Frame Depth',  kind: 'float', default: 0.2, min: 0.02, step: 0.02 },
    { key: 'frameThickness',  label: 'Frame Thick.', kind: 'float', default: 0.05, min: 0.005, step: 0.01 },
    { key: 'glassThickness',  label: 'Glass Thick.', kind: 'float', default: 0.01, min: 0.002, step: 0.005 },
    { key: 'sillHeight',      label: 'Sill Height',  kind: 'float', default: 1.0, min: 0, step: 0.05 },
    { key: 'openPercentage',  label: 'Open %',       kind: 'float', default: 0, min: 0, step: 0.05 },
  ],
};

import {
  Box,
  Circle,
  Cylinder,
  Triangle,
  Torus,
  Square,
  Lightbulb,
  Camera,
  Settings,
  Palette,
  Wrench,
  Move3d,
  Eye,
  GitBranch,
  Spline,
  Waves,
  Sparkles,
} from 'lucide-react';

interface SidePanelProps {
  onCreateObject: (type: string) => void;
  onArmTool?: (type: string) => void;
  armedTool?: string | null;
  activeTab?: string;
  onActiveTabChange?: (tab: string) => void;
  selectedObject: any;
  onOpenMaterialEditor?: () => void;
  onAddModifier: (objectId: string, modifierType: string) => void;
  onUpdateModifier: (objectId: string, modifierId: string, params: any) => void;
  onRemoveModifier: (objectId: string, modifierId: string) => void;
  onToggleModifier?: (objectId: string, modifierId: string) => void;
  onReorderModifier?: (objectId: string, modifierId: string, direction: -1 | 1) => void;
  onRenameObject?: (objectId: string, name: string) => void;
  onUpdateObjectGeometry: (objectId: string, params: any) => void;
  onUpdateObjectLightData?: (objectId: string, params: any) => void;
  onUpdateObjectCameraData?: (objectId: string, params: any) => void;
  onUpdateObjectColor?: (objectId: string, color: string) => void;

  // Compound Objects (Boolean / ProBoolean / Loft / Scatter)
  compoundState?: {
    tool: 'boolean' | 'proboolean' | 'loft' | 'scatter' | null;
    op: 'union' | 'subtract' | 'intersect';
    picking: boolean;
  };
  onArmCompound?: (tool: 'boolean' | 'proboolean' | 'loft' | 'scatter' | null) => void;
  onSetCompoundOp?: (op: 'union' | 'subtract' | 'intersect') => void;
  onStartPickOperandB?: () => void;
  onCancelCompound?: () => void;

  // Print3D toolkit (Utilities tab)
  allObjects?: any[];
  onCreatePrintBed?: () => void;
  onUpdatePrintBed?: (bedId: string, patch: any) => void;
  onTransformObject?: (id: string, patch: any) => void;

  // Rig sub-object selection (imported models with bones)
  selectedSubUuid?: string | null;
  onSelectSubObject?: (objectId: string, uuid: string | null) => void;
}

export const SidePanel = ({
  onCreateObject,
  onArmTool,
  armedTool,
  activeTab: activeTabProp,
  onActiveTabChange,
  selectedObject,
  onOpenMaterialEditor,
  onAddModifier,
  onUpdateModifier,
  onRemoveModifier,
  onToggleModifier,
  onReorderModifier,
  onRenameObject,
  onUpdateObjectGeometry,
  onUpdateObjectLightData,
  onUpdateObjectCameraData,
  onUpdateObjectColor,
  compoundState,
  onArmCompound,
  onSetCompoundOp,
  onStartPickOperandB,
  onCancelCompound,
  allObjects,
  onCreatePrintBed,
  onUpdatePrintBed,
  onTransformObject,
  selectedSubUuid,
  onSelectSubObject,
}: SidePanelProps) => {
  const [internalTab, setInternalTab] = useState('create');
  const activeTab = activeTabProp ?? internalTab;
  const setActiveTab = (t: string) => { onActiveTabChange ? onActiveTabChange(t) : setInternalTab(t); };
  const [createCat, setCreateCat] = useState<'geometry' | 'shapes' | 'lights' | 'cameras' | 'helpers' | 'warps' | 'systems'>('geometry');
  const [createCategory, setCreateCategory] = useState<'standard' | 'extended' | 'aec' | 'foliage' | 'compound' | 'particles' | 'shapes' | 'lights' | 'cameras'>('standard');
  // 'base' selects the base object parameters; a modifier id selects that modifier.
  const [selectedStackItem, setSelectedStackItem] = useState<string>('base');
  const [expandedStackItems, setExpandedStackItems] = useState<Record<string, boolean>>({});
  const [showEndResult, setShowEndResult] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  // Re-render whenever the shared spline sub-object store changes so the
  // Modifier-Stack tree highlights the currently active level.
  useSyncExternalStore(
    subscribeSplineSel,
    () => getSplineSel(selectedObject?.id ?? '__none__').level ?? '',
  );

  // Auto-select newly added modifier in the stack (3ds Max behavior).
  const prevModsRef = useRef<{ objectId: string | null; ids: string[] }>({ objectId: null, ids: [] });
  useEffect(() => {
    const objId = selectedObject?.id ?? null;
    const currentIds: string[] = (selectedObject?.modifiers ?? []).map((m: any) => m.id);
    const prev = prevModsRef.current;
    if (objId && objId === prev.objectId && currentIds.length > prev.ids.length) {
      const added = currentIds.find((id) => !prev.ids.includes(id));
      if (added) setSelectedStackItem(added);
    } else if (objId !== prev.objectId) {
      // Switched object → default back to base
      setSelectedStackItem('base');
    }
    prevModsRef.current = { objectId: objId, ids: currentIds };
  }, [selectedObject?.id, selectedObject?.modifiers]);

  // Menu → SidePanel bridge: MenuBar dispatches r3-sidepanel-set-category to
  // switch the Create-tab category (Standard / Extended / AEC / Compound / …)
  // exactly like clicking the icons in the panel header.
  useEffect(() => {
    const onSetCat = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        tab?: string;
        createCat?: typeof createCat;
        createCategory?: typeof createCategory;
      };
      if (detail?.tab) setActiveTab(detail.tab);
      if (detail?.createCat) setCreateCat(detail.createCat);
      if (detail?.createCategory) setCreateCategory(detail.createCategory);
    };
    window.addEventListener('r3-sidepanel-set-category', onSetCat as any);
    return () => window.removeEventListener('r3-sidepanel-set-category', onSetCat as any);
  }, []);

  const standardPrimitives = [
    { type: 'box', icon: Box, label: 'Box' },
    { type: 'sphere', icon: Circle, label: 'Sphere' },
    { type: 'cylinder', icon: Cylinder, label: 'Cylinder' },
    { type: 'cone', icon: Triangle, label: 'Cone' },
    { type: 'torus', icon: Torus, label: 'Torus' },
    { type: 'plane', icon: Square, label: 'Plane' },
    { type: 'teapot', icon: Circle, label: 'Teapot' },
    { type: 'tube', icon: Cylinder, label: 'Tube' },
    { type: 'pyramid', icon: Triangle, label: 'Pyramid' },
    { type: 'geoSphere', icon: Circle, label: 'GeoSphere' },
  ];

  const extendedPrimitives = [
    { type: 'hedra',      label: 'Hedra' },
    { type: 'chamferBox', label: 'ChamferBox' },
    { type: 'chamferCyl', label: 'ChamferCyl' },
    { type: 'oilTank',    label: 'OilTank' },
    { type: 'spindle',    label: 'Spindle' },
    { type: 'gengon',     label: 'Gengon' },
    { type: 'torusKnot',  label: 'Torus Knot' },
    { type: 'ringWave',   label: 'RingWave' },
    { type: 'prism',      label: 'Prism' },
    { type: 'capsule',    label: 'Capsule' },
    { type: 'lExt',       label: 'L-Ext' },
    { type: 'cExt',       label: 'C-Ext' },
    { type: 'hose',       label: 'Hose' },
  ];

  const shapes = [
    { type: 'line',      label: 'Line' },
    { type: 'rectangle', label: 'Rectangle' },
    { type: 'circle',    label: 'Circle' },
    { type: 'ellipse',   label: 'Ellipse' },
    { type: 'arc',       label: 'Arc' },
    { type: 'donut',     label: 'Donut' },
    { type: 'ngon',      label: 'NGon' },
    { type: 'star',      label: 'Star' },
    { type: 'text',      label: 'Text' },
    { type: 'helix',     label: 'Helix' },
  ];

  // AEC Extended (Architecture / Engineering / Construction). Só Wall está
  // implementado hoje; os demais ficam listados como "em breve".
  // AEC Extended — apenas objetos arquitetônicos (Wall, Doors, Windows, Stairs, Railings).
  const aecPrimitives: Array<{ type: string; label: string; disabled?: boolean; foliageSpecies?: number }> = [
    { type: 'wall',     label: 'Wall' },
    { type: 'door',     label: 'Doors' },
    { type: 'window',   label: 'Windows' },
    { type: 'stairs',   label: 'Stairs',   disabled: true },
    { type: 'railing',  label: 'Railings', disabled: true },
  ];

  // Foliage — categoria separada, uma espécie por botão (paleta do 3ds Max).
  const foliagePrimitives: Array<{ type: string; label: string; disabled?: boolean; foliageSpecies?: number }> =
    FOLIAGE_SPECIES.map((sp) => ({
      type: 'foliage',
      label: sp.label,
      foliageSpecies: sp.id,
    }));

  // Compound Objects — combine 2+ existing meshes via CSG (Boolean/ProBoolean),
  // 2D-path sweeping (Loft) or surface distribution (Scatter). Loft & Scatter
  // are stubbed as "em breve"; Boolean and ProBoolean are fully wired.
  const compoundTools: Array<{ id: 'boolean' | 'proboolean' | 'loft' | 'scatter'; label: string; disabled?: boolean }> = [
    { id: 'boolean',    label: 'Boolean' },
    { id: 'proboolean', label: 'ProBoolean' },
    { id: 'loft',       label: 'Loft',    disabled: true },
    { id: 'scatter',    label: 'Scatter', disabled: true },
  ];

  // Helpers — non-renderable viewport aids (see utils/helpers.ts).
  const helperPrimitives: Array<{ type: string; label: string; disabled?: boolean }> = [
    { type: 'helper_point',   label: 'Point' },
    { type: 'helper_dummy',   label: 'Dummy' },
    { type: 'helper_tape',    label: 'Tape' },
    { type: 'helper_grid',    label: 'Grid' },
    { type: 'helper_compass', label: 'Compass' },
    { type: 'helper_protractor', label: 'Protractor', disabled: true },
  ];

  // Space Warps — Fase 2, ainda não implementados.
  const warpPrimitives: Array<{ type: string; label: string; disabled?: boolean }> = [
    { type: 'warp_gravity',   label: 'Gravity',   disabled: true },
    { type: 'warp_wind',      label: 'Wind',      disabled: true },
    { type: 'warp_ripple',    label: 'Ripple',    disabled: true },
    { type: 'warp_wave',      label: 'Wave',      disabled: true },
    { type: 'warp_bomb',      label: 'Bomb',      disabled: true },
    { type: 'warp_ffd',       label: 'FFD',       disabled: true },
    { type: 'warp_deflector', label: 'Deflector', disabled: true },
    { type: 'warp_vortex',    label: 'Vortex',    disabled: true },
  ];

  // Systems — Bones, Biped e Print3D habilitados. Demais em desenvolvimento.
  const systemPrimitives: Array<{ type: string; label: string; disabled?: boolean }> = [
    { type: 'sys_bones',     label: 'Bones' },
    { type: 'sys_biped',     label: 'Biped' },
    { type: 'sys_print_bed', label: 'Print3D' },
    { type: 'sys_ring',      label: 'Ring Array', disabled: true },
    { type: 'sys_sunlight',  label: 'Sunlight',   disabled: true },
    { type: 'sys_daylight',  label: 'Daylight',   disabled: true },
  ];




  // category: 'shape' → apply only to SplineShape; 'mesh' → apply only to Mesh/Poly;
  // 'universal' → apply to anything geometric. 'converts' marks modifiers that
  // change the current pipeline class (e.g. Extrude turns a shape into a mesh).
  const modifiers: Array<{ name: string; description: string; category: 'shape' | 'mesh' | 'universal'; converts?: 'mesh' }> = [
    { name: 'Bend', description: 'Entorta o objeto em torno de um eixo', category: 'universal' },
    { name: 'Twist', description: 'Torce o objeto em torno de um eixo', category: 'universal' },
    { name: 'Taper', description: 'Afunila a forma, estreitando ou expandindo', category: 'universal' },
    { name: 'Stretch', description: 'Estica ou comprime o objeto', category: 'universal' },
    { name: 'Skew', description: 'Inclina a geometria', category: 'universal' },
    { name: 'Noise', description: 'Adiciona irregularidades aleatórias na malha', category: 'universal' },
    { name: 'FFD', description: 'Deforma o objeto usando caixas de controle', category: 'universal' },
    { name: 'Shell', description: 'Adiciona espessura a superfícies planas', category: 'mesh' },
    { name: 'Edit Poly', description: 'Permite editar vértices, arestas, polígonos', category: 'mesh' },
    { name: 'Edit Mesh', description: 'Edição direta de malhas triangulares', category: 'mesh' },
    { name: 'TurboSmooth', description: 'Suaviza e aumenta o número de polígonos', category: 'mesh' },
    { name: 'MeshSmooth', description: 'Subdivide suavizando a malha', category: 'mesh' },
    { name: 'Symmetry', description: 'Espelha o objeto em um eixo', category: 'mesh' },
    { name: 'Mirror', description: 'Reflete a geometria', category: 'universal' },
    { name: 'UVW Map', description: 'Mapeamento simples de coordenadas de textura', category: 'mesh' },
    { name: 'Unwrap UVW', description: 'Controle avançado de mapeamento UV', category: 'mesh' },
    { name: 'Lathe', description: 'Revolve uma spline para criar formas cilíndricas', category: 'shape', converts: 'mesh' },
    { name: 'Extrude', description: 'Extruda uma spline para gerar volume', category: 'shape', converts: 'mesh' },
    { name: 'Bevel', description: 'Extrusão com controle de perfis chanfrados', category: 'shape', converts: 'mesh' },
    { name: 'Slice', description: 'Corta o objeto em partes', category: 'universal' },
    { name: 'Skin', description: 'Deforma a malha seguindo uma cadeia de Bones (rigging)', category: 'mesh' },
  ];

  // Base-object class. Shapes (Line/Rectangle/Circle/...) are SplineShape until
  // Extrude/Lathe/Bevel turns them into a Mesh. Lights/cameras/helpers → none.
  const SHAPE_TYPES = new Set(['line', 'rectangle', 'circle', 'ellipse', 'arc', 'donut', 'ngon', 'star', 'helix', 'text', 'editable_spline']);
  const NON_GEOM_PREFIXES = ['light_', 'camera_', 'helper_'];
  const classifyBase = (t: string): 'shape' | 'mesh' | 'none' => {
    if (!t) return 'none';
    if (NON_GEOM_PREFIXES.some((p) => t.startsWith(p))) return 'none';
    if (SHAPE_TYPES.has(t)) return 'shape';
    return 'mesh';
  };

  // Walks the stack (evaluation order = array order) to find the current pipeline
  // class, exactly like the 3ds Max stack (Shape → Extrude → Mesh → Edit Poly → Poly).
  const currentObjectClass = (obj: any): 'shape' | 'mesh' | 'none' => {
    let cls = classifyBase(obj?.type);
    const stack: any[] = obj?.modifiers || [];
    for (const m of stack) {
      if (m?.active === false) continue;
      const def = modifiers.find((x) => x.name === m.type);
      if (def?.converts) cls = def.converts;
    }
    return cls;
  };

  const availableModifiers = selectedObject
    ? (() => {
        const cls = currentObjectClass(selectedObject);
        if (cls === 'none') return [] as typeof modifiers;
        return modifiers.filter((m) => m.category === 'universal' || m.category === cls);
      })()
    : modifiers;

  const lightSubtypes = [
    { type: 'light_omni',        label: 'Omni' },
    { type: 'light_spot',        label: 'Target Spot' },
    { type: 'light_spot_free',   label: 'Free Spot' },
    { type: 'light_direct',      label: 'Target Direct' },
    { type: 'light_direct_free', label: 'Free Direct' },
    { type: 'light_skylight',    label: 'Skylight' },
    { type: 'light_ambient',     label: 'Ambient' },
  ];
  const cameraSubtypes = [
    { type: 'camera_target', label: 'Target Camera' },
    { type: 'camera_free',   label: 'Free Camera' },
  ];

  // R3 command-panel top tabs (icon buttons)
  const panelTabs = [
    { id: 'create', label: 'Create', icon: Sparkles },
    { id: 'modify', label: 'Modify', icon: Wrench },
    { id: 'hierarchy', label: 'Hierarchy', icon: GitBranch },
    { id: 'motion', label: 'Motion', icon: Move3d },
    { id: 'display', label: 'Display', icon: Eye },
    { id: 'utilities', label: 'Utilities', icon: Settings },
  ] as const;

  const createCats = [
    { id: 'geometry', label: 'Geometry',    icon: Box },
    { id: 'shapes',   label: 'Shapes',      icon: Spline },
    { id: 'lights',   label: 'Lights',      icon: Lightbulb },
    { id: 'cameras',  label: 'Cameras',     icon: Camera },
    { id: 'helpers',  label: 'Helpers',     icon: Triangle },
    { id: 'warps',    label: 'Space Warps', icon: Waves },
    { id: 'systems',  label: 'Systems',     icon: Settings },
  ] as const;


  const R3TabBtn = ({ active, onClick, title, children }: any) => (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        'flex-1 min-w-0 h-[26px] flex items-center justify-center gap-1 text-[11px] text-win-text',
        active ? 'bevel-sunken' : 'bevel-raised hover:brightness-105'
      )}
    >
      {children}
    </button>
  );

  return (
    <div className="w-full h-full bg-panel border-l border-panel-border overflow-y-auto">
      {/* R3-style command panel tab row */}
      <div className="bevel-raised p-[2px] flex gap-[2px]">
        {panelTabs.map((t) => {
          const Icon = t.icon;
          return (
            <R3TabBtn
              key={t.id}
              active={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
              title={t.label}
            >
              <Icon size={13} />
            </R3TabBtn>
          );
        })}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">

        <div className="p-2 space-y-2">
          <TabsContent value="create" className="mt-0 space-y-2">
            {/* Category icon row (Geometry / Shapes / Lights / Cameras / Helpers / Warps / Systems) */}
            <div className="bevel-raised p-[2px] flex gap-[2px]">
              {createCats.map((c) => {
                const Icon = c.icon;
                const active = createCat === c.id;
                return (
                  <R3TabBtn
                    key={c.id}
                    active={active}
                    onClick={() => {
                      setCreateCat(c.id as any);
                      if (c.id === 'geometry') setCreateCategory('standard');
                      if (c.id === 'shapes')   setCreateCategory('shapes');
                      if (c.id === 'lights')   setCreateCategory('lights');
                      if (c.id === 'cameras')  setCreateCategory('cameras');
                    }}
                    title={c.label}
                  >
                    <Icon size={13} />
                  </R3TabBtn>
                );
              })}
            </div>

            {/* Sub-category dropdown (Standard / Extended Primitives, etc.) */}
            {createCat === 'geometry' && (
              <select
                value={createCategory === 'extended' ? 'extended'
                      : createCategory === 'aec' ? 'aec'
                      : createCategory === 'foliage' ? 'foliage'
                      : createCategory === 'compound' ? 'compound'
                      : createCategory === 'particles' ? 'particles'
                      : 'standard'}
                onChange={(e) => {
                  setCreateCategory(e.target.value as any);
                  if (e.target.value !== 'compound') onCancelCompound?.();
                }}
                className="w-full h-[22px] text-[11px] bevel-sunken bg-win-face px-1 text-win-text"
              >
                <option value="standard">Standard Primitives</option>
                <option value="extended">Extended Primitives</option>
                <option value="aec">AEC Extended</option>
                <option value="foliage">AEC Foliage</option>
                <option value="compound">Compound Objects</option>
                <option value="particles">Particle Systems</option>
              </select>
            )}

            {/* Object Type rollout — R3-style beveled 2-column button grid */}
            <div className="bevel-raised">
              <div className="bg-win-face-shadow/40 text-[11px] font-semibold px-2 py-[2px] text-win-text border-b border-win-shadow">
                Object Type
              </div>
              <div className="p-1 grid grid-cols-2 gap-[3px]">
                {createCat === 'geometry' && createCategory === 'standard' && standardPrimitives.map((p) => {
                  const pressed = armedTool === p.type;
                  return (
                    <button
                      key={p.type}
                      onClick={() => (onArmTool ? onArmTool(p.type) : onCreateObject(p.type))}
                      title={pressed ? 'Armed — click & drag in the viewport (ESC)' : `Create ${p.label}`}
                      className={cn(
                        'h-[22px] text-[11px] text-win-text px-1 truncate',
                        pressed ? 'bevel-sunken bg-yellow-200' : 'bevel-raised hover:brightness-105'
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
                {createCat === 'geometry' && createCategory === 'extended' && extendedPrimitives.map((p) => {
                  const pressed = armedTool === p.type;
                  return (
                    <button
                      key={p.type}
                      onClick={() => (onArmTool ? onArmTool(p.type) : onCreateObject(p.type))}
                      className={cn(
                        'h-[22px] text-[11px] text-win-text px-1 truncate',
                        pressed ? 'bevel-sunken bg-yellow-200' : 'bevel-raised hover:brightness-105'
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
                {createCat === 'geometry' && createCategory === 'aec' && aecPrimitives.map((p, idx) => {
                  const armedFol = (window as any).__foliageSpecies;
                  const pressed = armedTool === p.type
                    && (p.foliageSpecies === undefined || armedFol === p.foliageSpecies);
                  return (
                    <button
                      key={`${p.type}-${p.foliageSpecies ?? idx}`}
                      disabled={p.disabled}
                      onClick={() => {
                        if (p.disabled) return;
                        if (p.foliageSpecies !== undefined) {
                          // Store species preset so CreationController seeds
                          // the correct defaults when it builds the ghost.
                          (window as any).__foliageSpecies = p.foliageSpecies;
                        } else {
                          delete (window as any).__foliageSpecies;
                        }
                        onArmTool ? onArmTool(p.type) : onCreateObject(p.type);
                      }}
                      title={p.disabled ? `${p.label} — em breve` : `Create ${p.label}`}
                      className={cn(
                        'h-[22px] text-[11px] text-win-text px-1 truncate',
                        p.disabled
                          ? 'bevel-raised opacity-40 cursor-not-allowed'
                          : pressed ? 'bevel-sunken bg-yellow-200' : 'bevel-raised hover:brightness-105'
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
                {createCat === 'geometry' && createCategory === 'foliage' && foliagePrimitives.map((p, idx) => {
                  const armedFol = (window as any).__foliageSpecies;
                  const pressed = armedTool === p.type && armedFol === p.foliageSpecies;
                  return (
                    <button
                      key={`${p.type}-${p.foliageSpecies ?? idx}`}
                      onClick={() => {
                        (window as any).__foliageSpecies = p.foliageSpecies;
                        // Expõe o dicionário de presets para o CreationController
                        // usar os defaults de crownRadius/height ao construir o ghost.
                        (window as any).__foliageSpeciesPreset = Object.fromEntries(
                          FOLIAGE_SPECIES.map((s) => [s.id, s])
                        );
                        onArmTool ? onArmTool(p.type) : onCreateObject(p.type);
                      }}
                      title={`Create ${p.label}`}
                      className={cn(
                        'h-[22px] text-[11px] text-win-text px-1 truncate',
                        pressed ? 'bevel-sunken bg-yellow-200' : 'bevel-raised hover:brightness-105'
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
                {createCat === 'geometry' && createCategory === 'compound' && compoundTools.map((t) => {
                  const pressed = compoundState?.tool === t.id;
                  return (
                    <button
                      key={t.id}
                      disabled={t.disabled}
                      onClick={() => {
                        if (t.disabled) return;
                        onArmCompound?.(pressed ? null : t.id);
                      }}
                      title={t.disabled
                        ? `${t.label} — em breve`
                        : `${t.label} — selecione o Operando A e clique aqui`}
                      className={cn(
                        'h-[22px] text-[11px] text-win-text px-1 truncate',
                        t.disabled
                          ? 'bevel-raised opacity-40 cursor-not-allowed'
                          : pressed ? 'bevel-sunken bg-yellow-200' : 'bevel-raised hover:brightness-105'
                      )}
                    >
                      {t.label}
                    </button>
                  );
                })}
                {createCat === 'shapes' && shapes.map((s) => {
                  const pressed = armedTool === s.type;
                  return (
                    <button
                      key={s.type}
                      onClick={() => (onArmTool ? onArmTool(s.type) : onCreateObject(s.type))}
                      className={cn(
                        'h-[22px] text-[11px] text-win-text px-1 truncate',
                        pressed ? 'bevel-sunken bg-yellow-200' : 'bevel-raised hover:brightness-105'
                      )}
                    >
                      {s.label}
                    </button>
                  );
                })}
                {createCat === 'lights' && lightSubtypes.map((l) => (
                  <button
                    key={l.type}
                    onClick={() => onCreateObject(l.type)}
                    title={`Create ${l.label}`}
                    className="h-[22px] text-[11px] text-win-text px-1 truncate bevel-raised hover:brightness-105"
                  >
                    {l.label}
                  </button>
                ))}
                {createCat === 'cameras' && cameraSubtypes.map((c) => (
                  <button
                    key={c.type}
                    onClick={() => onCreateObject(c.type)}
                    title={`Create ${c.label}`}
                    className="h-[22px] text-[11px] text-win-text px-1 truncate bevel-raised hover:brightness-105"
                  >
                    {c.label}
                  </button>
                ))}
                {createCat === 'helpers' && helperPrimitives.map((p) => {
                  const pressed = armedTool === p.type;
                  return (
                    <button
                      key={p.type}
                      disabled={p.disabled}
                      onClick={() => {
                        if (p.disabled) return;
                        onArmTool ? onArmTool(p.type) : onCreateObject(p.type);
                      }}
                      title={p.disabled ? `${p.label} — em breve` : `Create ${p.label} helper`}
                      className={cn(
                        'h-[22px] text-[11px] text-win-text px-1 truncate',
                        p.disabled
                          ? 'bevel-raised opacity-40 cursor-not-allowed'
                          : pressed ? 'bevel-sunken bg-yellow-200' : 'bevel-raised hover:brightness-105'
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
                {createCat === 'warps' && warpPrimitives.map((p) => (
                  <button
                    key={p.type}
                    disabled
                    title={`${p.label} — Fase 2 (Space Warps ainda em desenvolvimento)`}
                    className="h-[22px] text-[11px] text-win-text px-1 truncate bevel-raised opacity-40 cursor-not-allowed"
                  >
                    {p.label}
                  </button>
                ))}
                {createCat === 'systems' && systemPrimitives.map((p) => {
                  const pressed = armedTool === p.type;
                  return (
                    <button
                      key={p.type}
                      disabled={p.disabled}
                      onClick={() => {
                        if (p.disabled) return;
                        onArmTool ? onArmTool(p.type) : onCreateObject(p.type);
                      }}
                      title={p.disabled
                        ? `${p.label} — em desenvolvimento`
                        : p.type === 'sys_print_bed'
                          ? 'Print3D Toolkit — clique no viewport para posicionar a mesa de impressão virtual.'
                          : `Create ${p.label}: clique para iniciar a cadeia, clique novamente para adicionar juntas, RMB/ESC para finalizar.`}
                      className={cn(
                        'h-[22px] text-[11px] text-win-text px-1 truncate',
                        p.disabled
                          ? 'bevel-raised opacity-40 cursor-not-allowed'
                          : pressed ? 'bevel-sunken bg-yellow-200' : 'bevel-raised hover:brightness-105'
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
                {createCat === 'warps' && (
                  <div className="col-span-2 text-[10px] text-win-text-disabled px-1 pt-1 text-center italic">
                    Space Warps — Fase 2 (em breve)
                  </div>
                )}

              </div>
            </div>

            {/* Boolean / ProBoolean rollout — visible only when a compound tool is armed. */}
            {createCat === 'geometry' && createCategory === 'compound' && compoundState?.tool && (compoundState.tool === 'boolean' || compoundState.tool === 'proboolean') && (
              <div className="bevel-raised">
                <div className="bg-win-face-shadow/40 text-[11px] font-semibold px-2 py-[2px] text-win-text border-b border-win-shadow">
                  {compoundState.tool === 'boolean' ? 'Boolean' : 'ProBoolean'} Parameters
                </div>
                <div className="p-1 space-y-1">
                  <div className="text-[10px] text-win-text px-1">
                    Operando A: <span className="font-semibold">{selectedObject?.name || selectedObject?.type || '— selecione —'}</span>
                  </div>
                  <div className="bevel-inset p-1 space-y-[2px]">
                    <div className="text-[10px] font-semibold text-win-text px-1">Operation</div>
                    {([
                      { id: 'union',     label: 'Union (A + B)' },
                      { id: 'subtract',  label: 'Subtraction (A - B)' },
                      { id: 'intersect', label: 'Intersection (A ∩ B)' },
                    ] as const).map((o) => (
                      <label key={o.id} className="flex items-center gap-1 text-[11px] text-win-text cursor-pointer px-1">
                        <input
                          type="radio"
                          name="bool-op"
                          checked={compoundState.op === o.id}
                          onChange={() => onSetCompoundOp?.(o.id)}
                        />
                        {o.label}
                      </label>
                    ))}
                  </div>
                  <button
                    disabled={!selectedObject}
                    onClick={() => onStartPickOperandB?.()}
                    className={cn(
                      'w-full h-[22px] text-[11px] text-win-text px-1',
                      !selectedObject
                        ? 'bevel-raised opacity-40 cursor-not-allowed'
                        : compoundState.picking
                          ? 'bevel-sunken bg-yellow-200'
                          : 'bevel-raised hover:brightness-105'
                    )}
                    title={selectedObject
                      ? 'Clique aqui e depois clique no Operando B na viewport'
                      : 'Selecione o Operando A primeiro'}
                  >
                    {compoundState.picking
                      ? (compoundState.tool === 'proboolean' ? 'Clique nos Operandos B (ESC para finalizar)' : 'Clique no Operando B na viewport…')
                      : (compoundState.tool === 'proboolean' ? 'Pick Operands B (múltiplos)' : 'Pick Operand B')}
                  </button>
                  {compoundState.picking && (
                    <button
                      onClick={() => onCancelCompound?.()}
                      className="w-full h-[20px] text-[11px] bevel-raised text-win-text hover:brightness-105"
                    >
                      Cancel
                    </button>
                  )}
                  <div className="text-[10px] text-win-text-disabled px-1 pt-1 italic leading-tight">
                    {compoundState.tool === 'proboolean'
                      ? 'ProBoolean: aplica a mesma operação para vários operandos B em sequência, mantendo a malha limpa.'
                      : 'Boolean clássico: A ± B → gera nova malha e remove os originais.'}
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="modify" className="mt-0 space-y-2">
            {!selectedObject && (
              <div className="bevel-inset bg-win-face-shadow/40 text-[11px] text-win-text-disabled px-2 py-3 text-center">
                No object selected
              </div>
            )}

            {selectedObject && (() => {
              const objName = selectedObject.name || `${selectedObject.type}_${(selectedObject.id || '').slice(0, 6)}`;
              const mods: any[] = selectedObject.modifiers || [];
              // Display stack top-first (last modifier appears on top), like 3ds Max.
              const stackDisplay = [...mods].reverse();
              const baseLabel = String(selectedObject.type || 'Object').replace(/^./, (c) => c.toUpperCase());
              const activeModifier = mods.find((m) => m.id === selectedStackItem);

              return (
                <>
                  {/* Object name */}
                  <div className="bevel-inset px-1 py-[2px]">
                    <input
                      className="w-full h-[20px] text-[11px] bg-white border border-win-shadow px-1 text-win-text"
                      value={objName}
                      onChange={(e) => onRenameObject?.(selectedObject.id, e.target.value)}
                    />
                  </div>

                  {/* Modifier List — classic R3 combobox (native select) */}
                  <select
                    value=""
                    onChange={(e) => {
                      const name = e.target.value;
                      if (name) onAddModifier(selectedObject.id, name);
                      e.target.value = '';
                    }}
                    className="w-full h-[22px] text-[11px] bevel-sunken bg-white px-1 text-win-text border border-win-shadow"
                    disabled={availableModifiers.length === 0}
                    title={availableModifiers.length === 0
                      ? 'No modifiers available for this object class'
                      : 'Modifier List — pick to add on top of the stack'}
                  >
                    <option value="">
                      {availableModifiers.length === 0 ? '— No modifiers available —' : 'Modifier List'}
                    </option>
                    {(() => {
                      const cls = currentObjectClass(selectedObject);
                      const groups: Array<{ label: string; items: typeof modifiers }> = [];
                      if (cls === 'shape') {
                        groups.push({ label: 'SELECTION MODIFIERS', items: [] });
                        groups.push({ label: 'OBJECT-SPACE MODIFIERS', items: availableModifiers.filter((m) => m.category === 'shape' || m.category === 'universal') });
                      } else {
                        groups.push({ label: 'OBJECT-SPACE MODIFIERS', items: availableModifiers });
                      }
                      return groups.filter((g) => g.items.length > 0).map((g) => (
                        <optgroup key={g.label} label={g.label}>
                          {g.items.map((m) => (
                            <option key={m.name} value={m.name} title={m.description}>{m.name}</option>
                          ))}
                        </optgroup>
                      ));
                    })()}
                  </select>

                  {/* Modifier Stack — 3ds Max style: eye toggle + expand arrow + name + drag&drop + inline delete */}
                  <div
                    className="bevel-inset bg-white select-none"
                    onDragOver={(e) => { if (dragId) e.preventDefault(); }}
                    onDrop={(e) => {
                      if (!dragId) return;
                      e.preventDefault();
                      const fromIdx = mods.findIndex((m) => m.id === dragId);
                      // dropped on empty area → move to base (bottom of visual stack = index 0)
                      const toIdx = 0;
                      const delta = toIdx - fromIdx;
                      const dir: -1 | 1 = delta < 0 ? -1 : 1;
                      for (let i = 0; i < Math.abs(delta); i++) onReorderModifier?.(selectedObject.id, dragId, dir);
                      setDragId(null); setDragOverId(null);
                    }}
                  >
                    {stackDisplay.map((m: any, visualIdx: number) => {
                      const selected = selectedStackItem === m.id;
                      const enabled = m.active !== false;
                      const expanded = !!expandedStackItems[m.id];
                      const isDragOver = dragOverId === m.id && dragId && dragId !== m.id;
                      const realIdx = mods.findIndex((x) => x.id === m.id);
                      return (
                        <div
                          key={m.id}
                          draggable
                          onDragStart={(e) => { setDragId(m.id); e.dataTransfer.effectAllowed = 'move'; }}
                          onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (dragId && dragId !== m.id) setDragOverId(m.id); }}
                          onDragLeave={() => { if (dragOverId === m.id) setDragOverId(null); }}
                          onDrop={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            if (!dragId || dragId === m.id) { setDragId(null); setDragOverId(null); return; }
                            const fromIdx = mods.findIndex((x) => x.id === dragId);
                            // dropping on m.id → put dragged item at m's real index
                            const toIdx = realIdx;
                            const delta = toIdx - fromIdx;
                            const dir: -1 | 1 = delta < 0 ? -1 : 1;
                            for (let i = 0; i < Math.abs(delta); i++) onReorderModifier?.(selectedObject.id, dragId, dir);
                            setDragId(null); setDragOverId(null);
                          }}
                          className={cn(
                            'relative group',
                            isDragOver && 'before:absolute before:left-0 before:right-0 before:-top-[1px] before:h-[2px] before:bg-win-highlight',
                            dragId === m.id && 'opacity-60',
                          )}
                        >
                        <div
                          className={cn(
                            'flex items-center gap-[3px] h-[20px] px-[3px] text-[11px] cursor-pointer',
                            selected ? 'bg-[#7a1f2b] text-white font-semibold' : 'text-black hover:bg-win-face-shadow/40',
                            !enabled && !selected && 'italic text-win-text-disabled',
                          )}
                          onClick={() => setSelectedStackItem(m.id)}
                          title={`${m.type} — drag to reorder`}
                        >
                          {/* Drag grip */}
                          <span
                            className={cn(
                              'w-[8px] h-[14px] flex flex-col justify-center gap-[1px] cursor-grab',
                              selected ? 'text-white/70' : 'text-win-text-disabled',
                            )}
                            aria-hidden
                          >
                            <span className="block w-[6px] h-[1px] bg-current" />
                            <span className="block w-[6px] h-[1px] bg-current" />
                            <span className="block w-[6px] h-[1px] bg-current" />
                          </span>
                          {/* Eye icon toggle (visibility / enable) */}
                          <button
                            type="button"
                            className={cn(
                              'w-[14px] h-[14px] flex items-center justify-center leading-none',
                              selected ? 'text-white' : 'text-win-text',
                            )}
                            onClick={(e) => { e.stopPropagation(); onToggleModifier?.(selectedObject.id, m.id); }}
                            title={enabled ? 'Modifier enabled (click to disable)' : 'Modifier disabled (click to enable)'}
                          >
                            {enabled ? (
                              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                                <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8Z" />
                                <circle cx="8" cy="8" r="1.8" fill="currentColor" stroke="none" />
                              </svg>
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                                <path d="M2 12 14 4" />
                                <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8Z" opacity="0.55" />
                              </svg>
                            )}
                          </button>
                          {/* Expand arrow ▶ / ▼ */}
                          <button
                            type="button"
                            className={cn(
                              'w-[10px] h-[14px] flex items-center justify-center text-[9px] leading-none',
                              selected ? 'text-white' : 'text-win-text',
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedStackItems((prev) => ({ ...prev, [m.id]: !prev[m.id] }));
                            }}
                            title={expanded ? 'Collapse' : 'Expand'}
                          >
                            {expanded ? '▼' : '▶'}
                          </button>
                          <span className="flex-1 truncate">{m.type}</span>
                          {/* Inline delete (hover) */}
                          <button
                            type="button"
                            className={cn(
                              'w-[14px] h-[14px] items-center justify-center leading-none opacity-0 group-hover:opacity-100 focus:opacity-100 hidden group-hover:flex',
                              selected ? 'text-white hover:text-red-200' : 'text-win-text hover:text-red-600',
                            )}
                            title="Remove this modifier"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveModifier(selectedObject.id, m.id);
                              if (selectedStackItem === m.id) setSelectedStackItem('base');
                            }}
                          >
                            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                              <path d="M3 4h10M6 4V2.5h4V4M4.5 4l.7 9.5h5.6L11.5 4" />
                            </svg>
                          </button>
                        </div>
                        {/* Sub-object children (3ds Max hierarchy under Edit Poly / Edit Mesh) */}
                        {expanded && (m.type === 'Edit Poly' || m.type === 'Edit Mesh') && (
                          <div className="border-l border-dashed border-win-shadow ml-[14px]">
                            {(m.type === 'Edit Poly'
                              ? ['Vertex', 'Edge', 'Border', 'Face', 'Polygon', 'Element']
                              : ['Vertex', 'Edge', 'Face', 'Polygon', 'Element']
                            ).map((lvl) => {
                              const childId = `${m.id}:${lvl.toLowerCase()}`;
                              const childSelected = selectedStackItem === childId;
                              const activeLvl = (m.params?.selectionLevel || '').toLowerCase() === lvl.toLowerCase();
                              return (
                                <div
                                  key={childId}
                                  className={cn(
                                    'flex items-center gap-[4px] h-[16px] pl-[16px] pr-[2px] text-[11px] cursor-pointer',
                                    childSelected ? 'bg-[#7a1f2b] text-white font-semibold' : 'text-black hover:bg-win-face-shadow/40',
                                  )}
                                  onClick={() => {
                                    setSelectedStackItem(childId);
                                    onUpdateModifier(selectedObject.id, m.id, { ...(m.params || {}), selectionLevel: lvl.toLowerCase(), selectedIds: [] });
                                  }}
                                >
                                  <span className={cn('w-[8px] h-[8px] inline-block', activeLvl ? 'bg-win-highlight border border-white' : 'border border-win-shadow')} />
                                  <span className="flex-1 truncate">{lvl}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {/* Deformation-modifier sub-objects: Gizmo + Center (3ds Max style).
                            Clicking sets modifierSubStore so Scene3D reattaches
                            TransformControls to the gizmo/center proxy. */}
                        {expanded && GIZMO_MODIFIER_TYPES.has(m.type) && (
                          <div className="border-l border-dashed border-win-shadow ml-[14px]">
                            {(['Gizmo', 'Center'] as const).map((lbl) => {
                              const part = lbl.toLowerCase() as 'gizmo' | 'center';
                              const childId = `${m.id}:${part}`;
                              const childSelected = selectedStackItem === childId;
                              return (
                                <div
                                  key={childId}
                                  className={cn(
                                    'flex items-center gap-[4px] h-[16px] pl-[16px] pr-[2px] text-[11px] cursor-pointer',
                                    childSelected ? 'bg-[#7a1f2b] text-white font-semibold' : 'text-black hover:bg-win-face-shadow/40',
                                  )}
                                  onClick={() => {
                                    setSelectedStackItem(childId);
                                    setModifierSub({ objectId: selectedObject.id, modifierId: m.id, part });
                                  }}
                                >
                                  <span
                                    className={cn(
                                      'w-[8px] h-[8px] inline-block',
                                      part === 'gizmo'
                                        ? 'bg-[#f5c518] border border-win-shadow'
                                        : 'bg-[#4aa3ff] rounded-full border border-win-shadow',
                                    )}
                                  />
                                  <span className="flex-1 truncate">{lbl}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        </div>
                      );
                    })}
                    {/* Base object row — expandable to show Editable Spline
                        sub-object levels (Vertex/Segment/Spline) exactly like
                        the Edit Poly / Edit Mesh hierarchy above it. */}
                    {(() => {
                      const isShapeBase = SHAPE_TYPES.has(String(selectedObject.type));
                      const isEditableSpline = selectedObject.type === 'editable_spline';
                      const canShowSplineLevels = isShapeBase || isEditableSpline;
                      const baseExpanded = !!expandedStackItems['__base'];
                      const currentLvl = getSplineSel(selectedObject.id).level;
                      return (
                        <>
                          <div
                            className={cn(
                              'flex items-center gap-[3px] h-[20px] px-[3px] text-[11px] cursor-pointer border-t border-win-shadow/50',
                              selectedStackItem === 'base'
                                ? 'bg-[#7a1f2b] text-white font-semibold'
                                : 'text-black hover:bg-win-face-shadow/40 bg-win-face-2/40',
                            )}
                            onClick={() => setSelectedStackItem('base')}
                          >
                            <span className="w-[8px]" />
                            {canShowSplineLevels ? (
                              <button
                                type="button"
                                className="w-[14px] h-[14px] flex items-center justify-center text-[9px] opacity-80 hover:opacity-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedStackItems((p) => ({ ...p, __base: !p.__base }));
                                }}
                                title={baseExpanded ? 'Collapse' : 'Expand'}
                              >
                                {baseExpanded ? '▼' : '▶'}
                              </button>
                            ) : (
                              <span className="w-[14px] flex items-center justify-center text-[9px] opacity-60">■</span>
                            )}
                            <span className="w-[10px]" />
                            <span className="flex-1 truncate font-semibold">
                              {isShapeBase && !isEditableSpline ? `${baseLabel}  (Spline)` : isEditableSpline ? 'Editable Spline' : baseLabel}
                            </span>
                          </div>
                          {canShowSplineLevels && baseExpanded && (
                            <div className="border-l border-dashed border-win-shadow ml-[14px]">
                              {(['Vertex', 'Segment', 'Spline'] as const).map((lvl) => {
                                const key: SplineSubLevel =
                                  lvl === 'Vertex' ? 'sknot' :
                                  lvl === 'Segment' ? 'ssegment' : 'sspline';
                                const activeLvl = currentLvl === key;
                                return (
                                  <div
                                    key={lvl}
                                    className={cn(
                                      'flex items-center gap-[4px] h-[16px] pl-[16px] pr-[2px] text-[11px] cursor-pointer',
                                      activeLvl
                                        ? 'bg-[#7a1f2b] text-white font-semibold'
                                        : 'text-black hover:bg-win-face-shadow/40',
                                    )}
                                    onClick={() => {
                                      setSelectedStackItem('base');
                                      // Auto-convert parametric shape → Editable Spline on first entry.
                                      if (!isEditableSpline) {
                                        onUpdateObjectGeometry(selectedObject.id, { __convertToEditableSpline: true });
                                      }
                                      const next = activeLvl ? null : key;
                                      // Deferred so the conversion state update lands first.
                                      setTimeout(() => {
                                        setSplineSel(selectedObject.id, {
                                          level: next,
                                          knots: new Set(),
                                          segments: new Set(),
                                          splines: new Set(),
                                        });
                                      }, 0);
                                    }}
                                  >
                                    <span className={cn(
                                      'w-[8px] h-[8px] inline-block',
                                      activeLvl ? 'bg-win-highlight border border-white' : 'border border-win-shadow',
                                    )} />
                                    <span className="flex-1 truncate">{lvl}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>


                  {/* Stack icon strip — 3ds Max style: pin stack, show end result, make unique, delete, config */}
                  <div className="flex items-center gap-[3px] px-[2px] py-[2px] bevel-group bg-win-face-2/60">
                    <button
                      type="button"
                      className="w-[22px] h-[20px] bevel-raised flex items-center justify-center text-win-text disabled:opacity-40"
                      title="Pin Stack"
                      disabled
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M8 2v6M4 8h8M6 8v5l2-1 2 1V8" /></svg>
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'w-[22px] h-[20px] flex items-center justify-center text-win-text',
                        showEndResult ? 'bevel-sunken bg-win-highlight/25' : 'bevel-raised',
                      )}
                      title={showEndResult ? 'Show End Result: ON (viewport shows final result even while editing lower modifiers)' : 'Show End Result: OFF (viewport reflects only up to the selected modifier)'}
                      onClick={() => setShowEndResult((v) => !v)}
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2.5" y="4" width="11" height="8" /><path d="M2.5 8h11" /></svg>
                    </button>
                    <button
                      type="button"
                      className="w-[22px] h-[20px] bevel-raised flex items-center justify-center text-win-text disabled:opacity-40"
                      title="Make Unique"
                      disabled
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2" y="2" width="8" height="8" /><rect x="6" y="6" width="8" height="8" /></svg>
                    </button>
                    <button
                      type="button"
                      className="w-[22px] h-[20px] bevel-raised flex items-center justify-center text-win-text disabled:opacity-50"
                      disabled={!activeModifier}
                      title="Remove modifier from the stack"
                      onClick={() => {
                        if (!activeModifier) return;
                        onRemoveModifier(selectedObject.id, activeModifier.id);
                        setSelectedStackItem('base');
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 4h10M6 4V2.5h4V4M4.5 4l.7 9.5h5.6L11.5 4" /></svg>
                    </button>
                    <button
                      type="button"
                      className="w-[22px] h-[20px] bevel-raised flex items-center justify-center text-win-text disabled:opacity-40"
                      title="Configure Modifier Sets"
                      disabled
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2.5" y="2.5" width="4" height="4" /><rect x="9.5" y="2.5" width="4" height="4" /><rect x="2.5" y="9.5" width="4" height="4" /><rect x="9.5" y="9.5" width="4" height="4" /></svg>
                    </button>
                    <div className="flex-1" />
                    <button
                      type="button"
                      className="w-[22px] h-[20px] bevel-raised flex items-center justify-center text-win-text disabled:opacity-50"
                      disabled={!activeModifier}
                      title="Move modifier up (later in evaluation)"
                      onClick={() => activeModifier && onReorderModifier?.(selectedObject.id, activeModifier.id, 1)}
                    >▲</button>
                    <button
                      type="button"
                      className="w-[22px] h-[20px] bevel-raised flex items-center justify-center text-win-text disabled:opacity-50"
                      disabled={!activeModifier}
                      title="Move modifier down (earlier in evaluation)"
                      onClick={() => activeModifier && onReorderModifier?.(selectedObject.id, activeModifier.id, -1)}
                    >▼</button>
                  </div>

                  {/* Selected modifier parameters */}
                  {activeModifier && (
                    <ModifierControls
                      key={activeModifier.id}
                      modifier={activeModifier}
                      objectId={selectedObject.id}
                      onUpdateModifier={(params) => onUpdateModifier(selectedObject.id, activeModifier.id, params)}
                      onRemoveModifier={() => {
                        onRemoveModifier(selectedObject.id, activeModifier.id);
                        setSelectedStackItem('base');
                      }}
                    />

                  )}
                </>
              );
            })()}

            {/* Base object parameters — visible only when the base is selected in the stack */}
            {selectedObject && selectedStackItem === 'base' && (
              <>
                {/* Light Parameters — R3-style General / Intensity/Color / Attenuation / Spot / Shadows */}
                {String(selectedObject.type || '').startsWith('light_') && (
                  <LightParameters
                    object={selectedObject}
                    onUpdateColor={(c) => onUpdateObjectColor?.(selectedObject.id, c)}
                    onUpdateLightData={(patch) => onUpdateObjectLightData?.(selectedObject.id, patch)}
                  />
                )}

                {/* Camera Parameters — R3-style panel for Target / Free cameras */}
                {String(selectedObject.type || '').startsWith('camera_') && (
                  <CameraParameters
                    object={selectedObject}
                    onUpdateCameraData={(patch) => onUpdateObjectCameraData?.(selectedObject.id, patch)}
                  />
                )}





                {/* 3ds Max-style Parameters rollout — right-aligned labels,
                    spinner inputs, collapsible header. Wall / Door / Window
                    render extra selectors above the numeric block. */}
                {(() => {
                  const schema = GEOM_SCHEMA[selectedObject.type];
                  const geom = selectedObject.geometry || {};

                  // Split schema into main dims vs segment counts (mimics 3ds Max
                  // which stacks Length/Width/Height on top and *Segs below).
                  const isSegKey = (k: string) =>
                    k.toLowerCase().includes('seg') || k.toLowerCase().includes('sides');
                  const mainParams = schema ? schema.filter((p) => !isSegKey(p.key)) : [];
                  const segParams = schema ? schema.filter((p) => isSegKey(p.key)) : [];

                  const renderSpinner = (p: ParamDef) => {
                    const rawVal = geom[p.key];
                    const val = rawVal !== undefined && rawVal !== null ? Number(rawVal) : p.default;
                    return (
                      <MaxSpinner
                        key={p.key}
                        label={p.label}
                        value={val}
                        isInt={p.kind === 'int'}
                        step={p.step ?? (p.kind === 'int' ? 1 : 0.1)}
                        min={p.min}
                        onChange={(v) => onUpdateObjectGeometry(selectedObject.id, { [p.key]: v })}
                      />
                    );
                  };

                  // ---- Editable Spline (post-conversion) ----
                  if (selectedObject.type === 'editable_spline') {
                    return (
                      <EditableSplinePanel
                        object={selectedObject}
                        onUpdate={(patch) => onUpdateObjectGeometry(selectedObject.id, patch)}
                      />
                    );
                  }
                  // ---- Shapes (Line/Rectangle/Circle/Ellipse/Arc/Donut/NGon/Star/Helix/Text)
                  // Parametric editor mirroring the 3ds Max Shapes rollout —
                  // Parameters + Rendering + Interpolation, no modifier required.
                  if (SHAPE_TYPES.has(selectedObject.type)) {
                    return (
                      <ShapeParametersPanel
                        object={selectedObject}
                        onUpdate={(patch) => onUpdateObjectGeometry(selectedObject.id, patch)}
                        onConvert={() => onUpdateObjectGeometry(selectedObject.id, { __convertToEditableSpline: true })}
                      />
                    );
                  }


                  // ---- Wall ----
                  if (selectedObject.type === 'wall') {
                    const just = (geom.justification ?? 'center') as 'left' | 'center' | 'right';
                    const closed = !!geom.closed;
                    const pathLen = Array.isArray(geom.path) ? geom.path.length : 0;
                    const openings = Array.isArray(geom.openings) ? geom.openings.length : 0;
                    return (
                      <MaxRollout title="Parameters" className="mt-4">
                        <MaxSelect
                          label="Justify"
                          value={just}
                          options={[
                            { value: 'left',   label: 'Left' },
                            { value: 'center', label: 'Center' },
                            { value: 'right',  label: 'Right' },
                          ]}
                          onChange={(v) => onUpdateObjectGeometry(selectedObject.id, { justification: v })}
                        />
                        {mainParams.map(renderSpinner)}
                        <MaxCheck label="Closed" checked={closed} onChange={(v) => onUpdateObjectGeometry(selectedObject.id, { closed: v })} />
                        <div className="text-[10px] text-muted-foreground pt-1 leading-tight">
                          Vertices: <span className="font-mono">{pathLen}</span> · Openings: <span className="font-mono">{openings}</span>
                        </div>
                      </MaxRollout>
                    );
                  }

                  // ---- Door / Window ----
                  const isDoor = selectedObject.type === 'door';
                  const isWindow = selectedObject.type === 'window';
                  if (isDoor || isWindow) {
                    const subtype = geom.subtype ?? (isDoor ? 'pivot' : 'casement');
                    const doorSubs = ['pivot', 'bifold', 'sliding', 'pocket'];
                    const winSubs  = ['casement', 'sliding', 'awning', 'fixed', 'pivot'];
                    const subs = isDoor ? doorSubs : winSubs;
                    const openPct = Math.round((geom.openPercentage ?? 0) * 100);
                    return (
                      <MaxRollout title="Parameters" className="mt-4">
                        <MaxSelect
                          label="Type"
                          value={String(subtype)}
                          options={subs.map((s) => ({ value: s, label: s }))}
                          onChange={(v) => onUpdateObjectGeometry(selectedObject.id, { subtype: v })}
                        />
                        {mainParams.map(renderSpinner)}
                        <div className="flex items-center gap-1 text-[11px] pt-[2px]">
                          <label className="text-right pr-1 text-foreground/85" style={{ width: 74 }}>Open:</label>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={openPct}
                            onChange={(e) => onUpdateObjectGeometry(selectedObject.id, { openPercentage: Number(e.target.value) / 100 })}
                            className="flex-1 h-[19px]"
                          />
                          <span className="w-8 text-right tabular-nums">{openPct}%</span>
                        </div>
                        {geom.parentWallId && (
                          <div className="text-[10px] text-muted-foreground pt-1 leading-tight">
                            Snapped to wall · seg <span className="font-mono">{geom.wallSegmentIndex ?? 0}</span>
                          </div>
                        )}
                      </MaxRollout>
                    );
                  }

                  // ---- Helpers (Point / Dummy / Tape / Grid / Compass) ----
                  if (selectedObject.type === 'helper') {
                    const kind = geom.helperKind as string | undefined;
                    if (kind === 'point') {
                      return (
                        <MaxRollout title="Parameters" className="mt-4">
                          <MaxSpinner label="Size" value={geom.size ?? 0.2} step={0.05} min={0.001}
                            onChange={(v) => onUpdateObjectGeometry(selectedObject.id, { size: v })} />
                          <div className="pt-1 mt-1 border-t border-panel-border/60 space-y-[3px]">
                            <MaxCheck label="Cross"          checked={geom.showCross ?? true}      onChange={(v) => onUpdateObjectGeometry(selectedObject.id, { showCross: v })} />
                            <MaxCheck label="Box"            checked={!!geom.showBox}              onChange={(v) => onUpdateObjectGeometry(selectedObject.id, { showBox: v })} />
                            <MaxCheck label="Axis Tripod"    checked={!!geom.showAxisTripod}       onChange={(v) => onUpdateObjectGeometry(selectedObject.id, { showAxisTripod: v })} />
                            <MaxCheck label="Center Marker"  checked={!!geom.showCenterMarker}     onChange={(v) => onUpdateObjectGeometry(selectedObject.id, { showCenterMarker: v })} />
                            <MaxCheck label="Constant Screen Size" checked={!!geom.constantScreenSize} onChange={(v) => onUpdateObjectGeometry(selectedObject.id, { constantScreenSize: v })} />
                          </div>
                          <div className="text-[10px] text-muted-foreground pt-2 leading-tight">
                            Point helpers do not render — used for pivots, targets and animation refs.
                          </div>
                        </MaxRollout>
                      );
                    }
                    if (kind === 'dummy') {
                      return (
                        <MaxRollout title="Parameters" className="mt-4">
                          <MaxSpinner label="Length" value={geom.length ?? 1} step={0.1} min={0.001}
                            onChange={(v) => onUpdateObjectGeometry(selectedObject.id, { length: v })} />
                          <MaxSpinner label="Width" value={geom.width ?? 1} step={0.1} min={0.001}
                            onChange={(v) => onUpdateObjectGeometry(selectedObject.id, { width: v })} />
                          <MaxSpinner label="Height" value={geom.height ?? 1} step={0.1} min={0.001}
                            onChange={(v) => onUpdateObjectGeometry(selectedObject.id, { height: v })} />
                          <div className="text-[10px] text-muted-foreground pt-2 leading-tight">
                            Dummy: non-rendering box used to group and animate hierarchies.
                          </div>
                        </MaxRollout>
                      );
                    }
                    if (kind === 'tape') {
                      const a = geom.endpointA ?? [0, 0, 0];
                      const b = geom.endpointB ?? [1, 0, 0];
                      const dist = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
                      return (
                        <MaxRollout title="Parameters" className="mt-4">
                          <div className="text-[11px] font-mono py-1">
                            Distance: <span className="text-foreground">{dist.toFixed(3)} m</span>
                          </div>
                          <MaxCheck label="Specify Length" checked={!!geom.specifyLength}
                            onChange={(v) => onUpdateObjectGeometry(selectedObject.id, { specifyLength: v })} />
                          {geom.specifyLength && (
                            <MaxSpinner label="Length" value={geom.targetLength ?? 1} step={0.1} min={0.001}
                              onChange={(v) => {
                                const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
                                const cur = Math.hypot(dx, dy, dz) || 1;
                                const k = v / cur;
                                onUpdateObjectGeometry(selectedObject.id, {
                                  targetLength: v,
                                  endpointB: [a[0] + dx * k, a[1] + dy * k, a[2] + dz * k],
                                });
                              }} />
                          )}
                          <div className="text-[10px] text-muted-foreground pt-2 leading-tight">
                            Two-click distance meter. Endpoint B is stored relative to the pivot.
                          </div>
                        </MaxRollout>
                      );
                    }
                    if (kind === 'grid') {
                      return (
                        <MaxRollout title="Parameters" className="mt-4">
                          <MaxSpinner label="Length" value={geom.gridLength ?? 5} step={0.1} min={0.1}
                            onChange={(v) => onUpdateObjectGeometry(selectedObject.id, { gridLength: v })} />
                          <MaxSpinner label="Width" value={geom.gridWidth ?? 5} step={0.1} min={0.1}
                            onChange={(v) => onUpdateObjectGeometry(selectedObject.id, { gridWidth: v })} />
                          <MaxSpinner label="Spacing" value={geom.gridSpacing ?? 0.5} step={0.05} min={0.01}
                            onChange={(v) => onUpdateObjectGeometry(selectedObject.id, { gridSpacing: v })} />
                          <div className="text-[10px] text-muted-foreground pt-2 leading-tight">
                            Local construction grid. Rotate to align with inclined surfaces.
                          </div>
                        </MaxRollout>
                      );
                    }
                    if (kind === 'compass') {
                      return (
                        <MaxRollout title="Parameters" className="mt-4">
                          <MaxSpinner label="Radius" value={geom.radius ?? 1} step={0.1} min={0.05}
                            onChange={(v) => onUpdateObjectGeometry(selectedObject.id, { radius: v })} />
                          <MaxCheck label="Show N/E/S/W" checked={geom.showTicks ?? true}
                            onChange={(v) => onUpdateObjectGeometry(selectedObject.id, { showTicks: v })} />
                          <div className="text-[10px] text-muted-foreground pt-2 leading-tight">
                            Compass: reference direction for Sunlight / Daylight systems.
                          </div>
                        </MaxRollout>
                      );
                    }
                    return (
                      <MaxRollout title="Parameters" className="mt-4">
                        <div className="text-[11px] text-muted-foreground">Unknown helper kind.</div>
                      </MaxRollout>
                    );
                  }

                  // ---- Standard primitives / shapes ----

                  if (!schema) {
                    return (
                      <MaxRollout title="Parameters" className="mt-4">
                        <div className="text-[11px] text-muted-foreground">
                          No editable parameters for type <span className="font-mono">{selectedObject.type}</span>.
                        </div>
                      </MaxRollout>
                    );
                  }

                  const genMap = geom.generateMappingCoords !== false;
                  return (
                    <MaxRollout title="Parameters" className="mt-4">
                      {mainParams.map(renderSpinner)}
                      {segParams.length > 0 && (
                        <div className="pt-1 mt-1 border-t border-panel-border/60 space-y-[3px]">
                          {segParams.map(renderSpinner)}
                        </div>
                      )}
                      <div className="pt-1 mt-1 border-t border-panel-border/60">
                        <MaxCheck
                          label="Generate Mapping Coords."
                          checked={genMap}
                          onChange={(v) => onUpdateObjectGeometry(selectedObject.id, { generateMappingCoords: v })}
                        />
                      </div>
                    </MaxRollout>
                  );
                })()}

                {/* Rig / Bone hierarchy — for imported models with skeletons */}
                {selectedObject.type === 'imported' && (
                  <MaxRollout title="Hierarchy (Bones / Nodes)" className="mt-4">
                    <RigHierarchyPanel
                      objectId={selectedObject.id}
                      selectedSubUuid={selectedSubUuid}
                      onSelectSubObject={onSelectSubObject}
                    />
                  </MaxRollout>
                )}

                {/* Object Properties */}
                <Card className="bg-card border-panel-border mt-4">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Object Properties</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Name</label>
                      <div className="text-sm font-mono">
                        {selectedObject.name || `${selectedObject.type}_${selectedObject.id.slice(0, 8)}`}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Position</label>
                      <div className="text-xs font-mono space-y-1">
                        <div>X: {selectedObject.position[0].toFixed(2)}</div>
                        <div>Y: {selectedObject.position[1].toFixed(2)}</div>
                        <div>Z: {selectedObject.position[2].toFixed(2)}</div>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Material</label>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-1 gap-2 border-panel-border hover:bg-menu-hover"
                        onClick={onOpenMaterialEditor}
                      >
                        <Palette className="w-4 h-4" />
                        Edit Material
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="hierarchy" className="mt-0 space-y-3">
            <Card className="bg-card border-panel-border">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Pivot</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}
                  onClick={() => onUpdateObjectGeometry(selectedObject?.id, { __pivotMode: 'affectPivot' })}>
                  Affect Pivot Only
                </Button>
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}
                  onClick={() => onUpdateObjectGeometry(selectedObject?.id, { __pivotMode: 'affectObject' })}>
                  Affect Object Only
                </Button>
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}
                  onClick={() => onUpdateObjectGeometry(selectedObject?.id, { __pivotMode: 'affectHierarchy' })}>
                  Affect Hierarchy Only
                </Button>
                <div className="border-t border-panel-border my-1" />
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}>
                  Center to Object
                </Button>
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}>
                  Align to Object
                </Button>
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}>
                  Align to World
                </Button>
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}>
                  Reset Pivot
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-card border-panel-border">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Link Info</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs">
                <div>Parent: <span className="text-muted-foreground">{selectedObject?.groupId || '— none —'}</span></div>
                <div>Locks: Move X ☐ Y ☐ Z ☐</div>
                <div>Locks: Rotate X ☐ Y ☐ Z ☐</div>
                <div>Locks: Scale X ☐ Y ☐ Z ☐</div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="motion" className="mt-0 space-y-3">
            <Card className="bg-card border-panel-border">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Parameters</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="text-xs">Controllers per axis (R3):</div>
                <div className="text-xs pl-2 space-y-1">
                  <div>Position: <span className="font-mono">Bezier</span></div>
                  <div>Rotation: <span className="font-mono">Euler XYZ</span></div>
                  <div>Scale: <span className="font-mono">Bezier</span></div>
                </div>
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}>
                  Assign Controller...
                </Button>
              </CardContent>
            </Card>
            <Card className="bg-card border-panel-border">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Trajectories</CardTitle></CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Enable per-object trajectories from the Animation Timeline panel.
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="display" className="mt-0 space-y-3">
            <Card className="bg-card border-panel-border">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Hide</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}
                  onClick={() => selectedObject && onUpdateObjectGeometry(selectedObject.id, { __display: 'hideSelection' })}>
                  Hide Selection
                </Button>
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}
                  onClick={() => selectedObject && onUpdateObjectGeometry(selectedObject.id, { __display: 'unhideAll' })}>
                  Unhide All
                </Button>
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}
                  onClick={() => selectedObject && onUpdateObjectGeometry(selectedObject.id, { __display: 'hideUnselected' })}>
                  Hide Unselected
                </Button>
              </CardContent>
            </Card>
            <Card className="bg-card border-panel-border">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Freeze</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}
                  onClick={() => selectedObject && onUpdateObjectGeometry(selectedObject.id, { __display: 'freezeSelection' })}>
                  Freeze Selection
                </Button>
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}
                  onClick={() => selectedObject && onUpdateObjectGeometry(selectedObject.id, { __display: 'unfreezeAll' })}>
                  Unfreeze All
                </Button>
              </CardContent>
            </Card>
            <Card className="bg-card border-panel-border">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Display Properties</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs">
                <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> Display as Box</label>
                <label className="flex items-center gap-2"><input type="checkbox" /> Backface Cull</label>
                <label className="flex items-center gap-2"><input type="checkbox" /> Edges Only</label>
                <label className="flex items-center gap-2"><input type="checkbox" /> Vertex Ticks</label>
                <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> Trajectory</label>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="utilities" className="mt-0 space-y-2">
            <div className="bevel-raised">
              <div className="bg-win-face-shadow/40 text-[11px] font-semibold px-2 py-[2px] text-win-text border-b border-win-shadow">
                3D Print Toolkit
              </div>
              <div className="p-1">
                <PrintToolsPanel
                  objects={(allObjects ?? []) as any}
                  selectedObject={selectedObject as any}
                  onCreateBed={() => onCreatePrintBed?.()}
                  onUpdateBedGeometry={(id, patch) => onUpdatePrintBed?.(id, patch)}
                  onTransformObject={(id, patch) => onTransformObject?.(id, patch)}
                />
              </div>
            </div>
          </TabsContent>

        </div>
      </Tabs>
    </div>
  );
};

// ------------------------------------------------------------------
// R3-style Light Parameters rollout — matches the 3ds Max R3 panel layout:
// General Parameters / Intensity / Color / Attenuation / Spot Parameters /
// Shadow Parameters. Applies to Omni, Spot (target & free), Direct (target &
// free), Skylight and Ambient — irrelevant sections are hidden per type.
// ------------------------------------------------------------------
interface LightParamsProps {
  object: any;
  onUpdateColor: (color: string) => void;
  onUpdateLightData: (patch: any) => void;
}

const LightParameters = ({ object, onUpdateColor, onUpdateLightData }: LightParamsProps) => {
  const t: string = object.type;
  const ld = object.lightData || {};
  const isSpot = t === 'light_spot';
  const isDirect = t === 'light_direct';
  const isOmni = t === 'light_omni';
  const isSky = t === 'light_skylight';
  const isAmbient = t === 'light_ambient';
  const hasCone = isSpot;
  const hasAtten = isOmni || isSpot || isDirect;
  const hasShadow = isOmni || isSpot || isDirect;

  const numRow = (label: string, key: string, def: number, min = 0, step = 0.1) => (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-[10px] flex-1">{label}</Label>
      <Input
        type="number"
        value={ld[key] ?? def}
        step={step}
        min={min}
        className="h-6 w-20 text-xs"
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          onUpdateLightData({ [key]: Number.isFinite(v) ? Math.max(min, v) : def });
        }}
      />
    </div>
  );

  return (
    <>
      <Card className="bg-card border-panel-border">
        <CardHeader className="pb-2"><CardTitle className="text-sm">General Parameters</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <label className="flex items-center gap-2 text-[11px]">
            <input
              type="checkbox"
              checked={ld.on !== false}
              onChange={(e) => onUpdateLightData({ on: e.target.checked })}
            />
            On
          </label>
          {hasShadow && (
            <label className="flex items-center gap-2 text-[11px]">
              <input
                type="checkbox"
                checked={!!ld.castShadow}
                onChange={(e) => onUpdateLightData({ castShadow: e.target.checked })}
              />
              Cast Shadows
            </label>
          )}
          <div className="text-[10px] text-muted-foreground font-mono uppercase">Type: {t.replace('light_', '')}</div>
        </CardContent>
      </Card>

      <Card className="bg-card border-panel-border mt-2">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Intensity / Color / Attenuation</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[10px] flex-1">Multiplier</Label>
            <Input
              type="number"
              value={ld.intensity ?? 1}
              step={0.1}
              className="h-6 w-20 text-xs"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                onUpdateLightData({ intensity: Number.isFinite(v) ? v : 1 });
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[10px] flex-1">Color</Label>
            <input
              type="color"
              value={object.color || '#ffffff'}
              onChange={(e) => onUpdateColor(e.target.value)}
              className="h-6 w-12 border border-win-shadow"
            />
          </div>
          {isSky && (
            <>
              <div className="flex items-center justify-between gap-2">
                <Label className="text-[10px] flex-1">Ground Color</Label>
                <input
                  type="color"
                  value={ld.groundColor || '#4a3a2a'}
                  onChange={(e) => onUpdateLightData({ groundColor: e.target.value })}
                  className="h-6 w-12 border border-win-shadow"
                />
              </div>
            </>
          )}
          {hasAtten && (
            <>
              <div className="text-[10px] uppercase text-muted-foreground pt-1">Far Attenuation</div>
              {numRow('Distance', 'distance', 0, 0, 0.5)}
              {numRow('Decay', 'decay', 2, 0, 0.1)}
            </>
          )}
        </CardContent>
      </Card>

      {hasCone && (
        <Card className="bg-card border-panel-border mt-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Spot Parameters</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] flex-1">Hotspot (rad)</Label>
              <Input
                type="number"
                value={ld.hotspot ?? (ld.angle ?? Math.PI / 6) * 0.8}
                step={0.01}
                min={0}
                className="h-6 w-20 text-xs"
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  onUpdateLightData({ hotspot: Number.isFinite(v) ? Math.max(0, v) : 0.4 });
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] flex-1">Falloff (angle)</Label>
              <Input
                type="number"
                value={ld.angle ?? Math.PI / 6}
                step={0.01}
                min={0}
                className="h-6 w-20 text-xs"
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  onUpdateLightData({ angle: Number.isFinite(v) ? Math.max(0.01, v) : Math.PI / 6 });
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] flex-1">Penumbra</Label>
              <Input
                type="number"
                value={ld.penumbra ?? 0.2}
                step={0.05}
                min={0}
                className="h-6 w-20 text-xs"
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  onUpdateLightData({ penumbra: Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.2 });
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {isAmbient && (
        <div className="text-[10px] text-muted-foreground px-1 pt-1">
          Ambient light has no direction — only Color and Multiplier apply.
        </div>
      )}
    </>
  );
};

// ---------------- Camera Parameters (R3-style) ----------------
// Panel matching 3ds Max R3 Modify panel for Target / Free cameras:
// Parameters (Lens, FOV, Show Cone/Horizon), Environment Ranges,
// Clipping Planes, Multi-Pass Depth of Field.
interface CameraParamsProps {
  object: any;
  onUpdateCameraData: (patch: any) => void;
}

// Standard 3ds Max lens<->fov relation (35mm film, ~43.27mm diagonal).
// The Max R3 default is Lens 43.456 mm ≈ FOV 45° (horizontal).
const APERTURE_WIDTH = 36; // mm (horizontal aperture, matches Max defaults)
const lensToFov = (lens: number) =>
  (2 * Math.atan(APERTURE_WIDTH / (2 * lens)) * 180) / Math.PI;
const fovToLens = (fov: number) =>
  APERTURE_WIDTH / (2 * Math.tan((fov * Math.PI) / 180 / 2));

const CameraParameters = ({ object, onUpdateCameraData }: CameraParamsProps) => {
  const t = object.type as string;
  const isTarget = t === 'camera_target';
  const cd = object.cameraData || {};
  const fov = cd.fov ?? 45;
  const lens = cd.lens ?? fovToLens(fov);
  const near = cd.near ?? 0.1;
  const far = cd.far ?? 1000;
  const showCone = cd.showCone !== false;
  const showHorizon = !!cd.showHorizon;
  const manualClip = !!cd.manualClip;
  const nearRange = cd.nearRange ?? 0;
  const farRange = cd.farRange ?? 1000;
  const dof = !!cd.dofEnabled;
  const focus = cd.focusDistance ?? 100;
  const aperture = cd.aperture ?? 2.0;
  const targetDist = cd.targetDistance ?? 100;

  const setFov = (v: number) => {
    if (!Number.isFinite(v)) return;
    const clamped = Math.max(1, Math.min(175, v));
    onUpdateCameraData({ fov: clamped, lens: fovToLens(clamped) });
  };
  const setLens = (v: number) => {
    if (!Number.isFinite(v) || v <= 0) return;
    onUpdateCameraData({ lens: v, fov: lensToFov(v) });
  };

  // Stock 3ds Max R3 "Stock Lenses" buttons.
  const stockLenses = [15, 20, 24, 28, 35, 50, 85, 135, 200];

  return (
    <>
      <Card className="bg-card border-panel-border mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Parameters
            <span className="ml-2 text-[10px] text-muted-foreground font-mono">
              {isTarget ? 'Target Camera' : 'Free Camera'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <Label className="w-16">Lens:</Label>
            <Input
              type="number"
              value={Number(lens.toFixed(3))}
              step={0.5}
              min={1}
              className="h-6 w-24 text-xs"
              onChange={(e) => setLens(parseFloat(e.target.value))}
            />
            <span className="text-[10px] text-muted-foreground">mm</span>
          </div>
          <div className="flex items-center gap-2">
            <Label className="w-16">FOV:</Label>
            <Input
              type="number"
              value={Number(fov.toFixed(2))}
              step={1}
              min={1}
              max={175}
              className="h-6 w-24 text-xs"
              onChange={(e) => setFov(parseFloat(e.target.value))}
            />
            <span className="text-[10px] text-muted-foreground">degrees</span>
          </div>

          <div className="pt-1">
            <div className="text-[10px] text-muted-foreground mb-1">Stock Lenses</div>
            <div className="grid grid-cols-3 gap-1">
              {stockLenses.map((l) => (
                <Button
                  key={l}
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-1 border-panel-border"
                  onClick={() => setLens(l)}
                >
                  {l}mm
                </Button>
              ))}
            </div>
          </div>

          <div className="pt-1 space-y-1">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showCone}
                onChange={(e) => onUpdateCameraData({ showCone: e.target.checked })}
              />
              Show Cone
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showHorizon}
                onChange={(e) => onUpdateCameraData({ showHorizon: e.target.checked })}
              />
              Show Horizon
            </label>
          </div>

          {!isTarget && (
            <div className="flex items-center gap-2 pt-1">
              <Label className="w-24">Target Dist:</Label>
              <Input
                type="number"
                value={targetDist}
                step={1}
                min={0.001}
                className="h-6 w-24 text-xs"
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v) && v > 0) onUpdateCameraData({ targetDistance: v });
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-panel-border mt-2">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Environment Ranges</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <Label className="w-20">Near Range:</Label>
            <Input
              type="number"
              value={nearRange}
              step={1}
              className="h-6 w-24 text-xs"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v)) onUpdateCameraData({ nearRange: v });
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="w-20">Far Range:</Label>
            <Input
              type="number"
              value={farRange}
              step={1}
              className="h-6 w-24 text-xs"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v)) onUpdateCameraData({ farRange: v });
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-panel-border mt-2">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Clipping Planes</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={manualClip}
              onChange={(e) => onUpdateCameraData({ manualClip: e.target.checked })}
            />
            Clip Manually
          </label>
          <div className="flex items-center gap-2">
            <Label className="w-20">Near Clip:</Label>
            <Input
              type="number"
              value={near}
              step={0.1}
              min={0.001}
              disabled={!manualClip}
              className="h-6 w-24 text-xs"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v > 0) onUpdateCameraData({ near: v });
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="w-20">Far Clip:</Label>
            <Input
              type="number"
              value={far}
              step={1}
              min={0.01}
              disabled={!manualClip}
              className="h-6 w-24 text-xs"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v > 0) onUpdateCameraData({ far: v });
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-panel-border mt-2">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Multi-Pass Depth of Field</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={dof}
              onChange={(e) => onUpdateCameraData({ dofEnabled: e.target.checked })}
            />
            Enable
          </label>
          <div className="flex items-center gap-2">
            <Label className="w-24">Focus Dist:</Label>
            <Input
              type="number"
              value={focus}
              step={1}
              min={0.001}
              disabled={!dof}
              className="h-6 w-24 text-xs"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v > 0) onUpdateCameraData({ focusDistance: v });
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="w-24">Aperture:</Label>
            <Input
              type="number"
              value={aperture}
              step={0.1}
              min={0.1}
              disabled={!dof}
              className="h-6 w-24 text-xs"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v > 0) onUpdateCameraData({ aperture: v });
              }}
            />
          </div>
        </CardContent>
      </Card>
    </>
  );
};

// ------------------------------------------------------------------
// Shape Parameters Panel — 3ds Max R3 style, exposes every editable
// parameter of a Shape object (Line / Rectangle / Circle / Ellipse /
// Arc / Donut / NGon / Star / Helix / Text) directly in the command
// panel, plus the common Rendering and Interpolation rollouts.
// No modifier required — geometry is regenerated on every change.
// ------------------------------------------------------------------

// Modifier-stack style sub-object list. Rendered above the parametric
// Parameters rollout so any shape can enter Vertex / Segment / Spline
// mode with a single click (auto-converts to Editable Spline first,
// mirroring 3ds Max R3 behavior when a user expands the "+" of a
// parametric shape in the modifier stack).
const SubObjectStack = ({ objectId, onConvert }: { objectId: string; onConvert: () => void }) => {
  const enter = (level: SplineSubLevel) => {
    onConvert();
    // Deferred so the store update lands after the object type flips to
    // 'editable_spline' — otherwise EditableSplinePanel's own unmount
    // effect on the parametric object could clear the level we just set.
    setTimeout(() => {
      setSplineSel(objectId, {
        level,
        knots: new Set(), segments: new Set(), splines: new Set(),
      });
    }, 0);
  };
  const Row = ({ label, level, glyph }: { label: string; level: SplineSubLevel; glyph: string }) => (
    <button
      type="button"
      onClick={() => enter(level)}
      className="w-full flex items-center gap-2 px-2 h-[20px] text-[11px] font-mono border border-transparent hover:border-panel-border hover:bg-panel/60 rounded-[2px] text-left"
    >
      <span className="w-3 text-muted-foreground">{glyph}</span>
      <span>{label}</span>
    </button>
  );
  return (
    <div className="border border-panel-border rounded-[2px] bg-panel/40 divide-y divide-panel-border/60">
      <div className="px-2 h-[20px] flex items-center text-[11px] font-mono text-foreground bg-panel/60">
        <span className="w-3 text-muted-foreground">−</span>
        <span>Editable Spline</span>
      </div>
      <Row label="Vertex"  level="sknot"    glyph="•" />
      <Row label="Segment" level="ssegment" glyph="—" />
      <Row label="Spline"  level="sspline"  glyph="~" />
    </div>
  );
};


interface ShapeParamsProps {
  object: any;
  onUpdate: (patch: any) => void;
  onConvert?: () => void;
}

const ShapeParametersPanel = ({ object, onUpdate, onConvert }: ShapeParamsProps) => {
  const t: string = object.type;
  const g = object.geometry || {};
  const knots = Array.isArray(g.knots) ? g.knots.length : 0;

  // -- Per-shape parameter block --
  const specific = (() => {
    switch (t) {
      case 'line':
        return (
          <div className="text-[11px] font-mono space-y-[3px] py-1">
            <div>Vertices: <span className="text-foreground">{knots}</span></div>
            <div>Closed: <span className="text-foreground">{g.closed ? 'Yes' : 'No'}</span></div>
            <div className="text-[10px] text-muted-foreground pt-1 font-sans">
              Edit vertices in sub-object mode. Vertex type (Corner / Smooth / Bezier / Bezier Corner) is set per-knot.
            </div>
          </div>
        );
      case 'rectangle':
        return (
          <>
            <MaxSpinner label="Length"    value={g.length ?? g.height ?? 1} step={0.05} min={0.001}
              onChange={(v) => onUpdate({ length: v, height: v })} />
            <MaxSpinner label="Width"     value={g.width ?? 1}          step={0.05} min={0.001}
              onChange={(v) => onUpdate({ width: v })} />
            <MaxSpinner label="Corner R"  value={g.cornerRadius ?? 0}    step={0.01} min={0}
              onChange={(v) => onUpdate({ cornerRadius: v })} />
            <MaxSpinner label="Fillet"    value={g.fillet ?? 0}          step={0.01} min={0}
              onChange={(v) => onUpdate({ fillet: v })} />
          </>
        );
      case 'circle':
        return (
          <>
            <MaxSpinner label="Radius" value={g.radius ?? 0.5} step={0.05} min={0.001}
              onChange={(v) => onUpdate({ radius: v })} />
            <MaxCheck label="Pie Slice" checked={!!g.pieSlice} onChange={(v) => onUpdate({ pieSlice: v })} />
            {g.pieSlice && (
              <>
                <MaxSpinner label="Start °" value={g.startAngle ?? 0}   step={1} onChange={(v) => onUpdate({ startAngle: v })} />
                <MaxSpinner label="End °"   value={g.endAngle ?? 360}   step={1} onChange={(v) => onUpdate({ endAngle: v })} />
              </>
            )}
            <MaxCheck label="Reverse Direction" checked={!!g.reverse} onChange={(v) => onUpdate({ reverse: v })} />
          </>
        );
      case 'ellipse':
        return (
          <>
            <MaxSpinner label="Radius X" value={g.radiusX ?? 0.7} step={0.05} min={0.001}
              onChange={(v) => onUpdate({ radiusX: v })} />
            <MaxSpinner label="Radius Y" value={g.radiusY ?? 0.4} step={0.05} min={0.001}
              onChange={(v) => onUpdate({ radiusY: v })} />
            <MaxCheck label="Pie Slice" checked={!!g.pieSlice} onChange={(v) => onUpdate({ pieSlice: v })} />
            {g.pieSlice && (
              <>
                <MaxSpinner label="Start °" value={g.startAngle ?? 0}   step={1} onChange={(v) => onUpdate({ startAngle: v })} />
                <MaxSpinner label="End °"   value={g.endAngle ?? 360}   step={1} onChange={(v) => onUpdate({ endAngle: v })} />
              </>
            )}
          </>
        );
      case 'arc':
        return (
          <>
            <MaxSpinner label="Radius" value={g.radius ?? 0.5} step={0.05} min={0.001}
              onChange={(v) => onUpdate({ radius: v })} />
            <MaxSpinner label="From °" value={g.from ?? 0}   step={1} onChange={(v) => onUpdate({ from: v })} />
            <MaxSpinner label="To °"   value={g.to ?? 180}   step={1} onChange={(v) => onUpdate({ to: v })} />
            <MaxCheck label="Pie" checked={!!g.pie} onChange={(v) => onUpdate({ pie: v })} />
            <MaxCheck label="Reverse Direction" checked={!!g.reverse} onChange={(v) => onUpdate({ reverse: v })} />
          </>
        );
      case 'donut':
        return (
          <>
            <MaxSpinner label="Radius 1" value={g.radius1 ?? 0.6} step={0.05} min={0.001}
              onChange={(v) => onUpdate({ radius1: v })} />
            <MaxSpinner label="Radius 2" value={g.radius2 ?? 0.35} step={0.05} min={0.001}
              onChange={(v) => onUpdate({ radius2: v })} />
            <MaxCheck label="Pie Slice" checked={!!g.pieSlice} onChange={(v) => onUpdate({ pieSlice: v })} />
            {g.pieSlice && (
              <>
                <MaxSpinner label="Start °" value={g.startAngle ?? 0}   step={1} onChange={(v) => onUpdate({ startAngle: v })} />
                <MaxSpinner label="End °"   value={g.endAngle ?? 360}   step={1} onChange={(v) => onUpdate({ endAngle: v })} />
              </>
            )}
          </>
        );
      case 'ngon':
        return (
          <>
            <MaxSpinner label="Radius" value={g.radius ?? 0.5} step={0.05} min={0.001}
              onChange={(v) => onUpdate({ radius: v })} />
            <MaxSpinner label="Sides"  value={g.sides ?? 6}    step={1} min={3} isInt
              onChange={(v) => onUpdate({ sides: v })} />
            <MaxSpinner label="Fillet" value={g.fillet ?? 0}   step={0.01} min={0}
              onChange={(v) => onUpdate({ fillet: v })} />
            <MaxCheck label="Circular" checked={!!g.circular} onChange={(v) => onUpdate({ circular: v })} />
            <MaxSelect
              label="Radius Mode"
              value={g.inscribed === false ? 'circumscribed' : 'inscribed'}
              options={[
                { value: 'inscribed',     label: 'Inscribed' },
                { value: 'circumscribed', label: 'Circumscribed' },
              ]}
              onChange={(v) => onUpdate({ inscribed: v === 'inscribed' })}
            />
          </>
        );
      case 'star':
        return (
          <>
            <MaxSpinner label="Points"   value={g.points ?? 5}     step={1} min={3} isInt
              onChange={(v) => onUpdate({ points: v })} />
            <MaxSpinner label="Radius 1" value={g.radius1 ?? 0.5}  step={0.05} min={0.001}
              onChange={(v) => onUpdate({ radius1: v })} />
            <MaxSpinner label="Radius 2" value={g.radius2 ?? 0.22} step={0.05} min={0.001}
              onChange={(v) => onUpdate({ radius2: v })} />
            <MaxSpinner label="Distortion" value={g.distortion ?? 0} step={0.01}
              onChange={(v) => onUpdate({ distortion: v })} />
            <MaxSpinner label="Fillet R 1" value={g.filletRadius1 ?? 0} step={0.01} min={0}
              onChange={(v) => onUpdate({ filletRadius1: v })} />
            <MaxSpinner label="Fillet R 2" value={g.filletRadius2 ?? 0} step={0.01} min={0}
              onChange={(v) => onUpdate({ filletRadius2: v })} />
            <MaxSpinner label="Twist °"    value={g.twist ?? 0}       step={1}
              onChange={(v) => onUpdate({ twist: v })} />
          </>
        );
      case 'helix':
        return (
          <>
            <MaxSpinner label="Radius 1" value={g.radius1 ?? 0.4} step={0.05} min={0.001}
              onChange={(v) => onUpdate({ radius1: v })} />
            <MaxSpinner label="Radius 2" value={g.radius2 ?? 0.4} step={0.05} min={0.001}
              onChange={(v) => onUpdate({ radius2: v })} />
            <MaxSpinner label="Height"   value={g.height ?? 1}    step={0.05} min={0.001}
              onChange={(v) => onUpdate({ height: v })} />
            <MaxSpinner label="Turns"    value={g.turns ?? 3}     step={1}    min={1} isInt
              onChange={(v) => onUpdate({ turns: v })} />
            <MaxSpinner label="Bias"     value={g.bias ?? 0}      step={0.05}
              onChange={(v) => onUpdate({ bias: v })} />
            <MaxSelect
              label="Direction"
              value={g.clockwise === false ? 'ccw' : 'cw'}
              options={[
                { value: 'cw',  label: 'Clockwise' },
                { value: 'ccw', label: 'Counterclockwise' },
              ]}
              onChange={(v) => onUpdate({ clockwise: v === 'cw' })}
            />
          </>
        );
      case 'text':
        return (
          <>
            <div>
              <Label className="text-[10px]">Text</Label>
              <textarea
                value={g.text ?? ''}
                onChange={(e) => onUpdate({ text: e.target.value })}
                className="w-full h-14 text-[11px] bg-background border border-panel-border rounded-[2px] px-1 py-1 font-mono resize-none outline-none"
                spellCheck={false}
              />
            </div>
            <MaxSelect
              label="Font"
              value={g.font ?? 'helvetiker'}
              options={[
                { value: 'helvetiker', label: 'Helvetiker' },
                { value: 'gentilis',   label: 'Gentilis' },
                { value: 'optimer',    label: 'Optimer' },
              ]}
              onChange={(v) => onUpdate({ font: v })}
            />
            <div className="flex gap-3 pt-[2px]">
              <MaxCheck label="Bold"      checked={!!g.bold}      onChange={(v) => onUpdate({ bold: v })} />
              <MaxCheck label="Italic"    checked={!!g.italic}    onChange={(v) => onUpdate({ italic: v })} />
              <MaxCheck label="Underline" checked={!!g.underline} onChange={(v) => onUpdate({ underline: v })} />
            </div>
            <MaxSelect
              label="Alignment"
              value={g.alignment ?? 'left'}
              options={[
                { value: 'left',    label: 'Left' },
                { value: 'center',  label: 'Center' },
                { value: 'right',   label: 'Right' },
                { value: 'justify', label: 'Justify' },
              ]}
              onChange={(v) => onUpdate({ alignment: v })}
            />
            <MaxSpinner label="Size"     value={g.size ?? 1}     step={0.05} min={0.01}
              onChange={(v) => onUpdate({ size: v })} />
            <MaxSpinner label="Tracking" value={g.tracking ?? 0} step={0.01}
              onChange={(v) => onUpdate({ tracking: v })} />
            <MaxSpinner label="Kerning"  value={g.kerning ?? 0}  step={0.01}
              onChange={(v) => onUpdate({ kerning: v })} />
            <MaxSpinner label="Leading"  value={g.leading ?? 1.2} step={0.05} min={0.1}
              onChange={(v) => onUpdate({ leading: v })} />
            <MaxSpinner label="Curve Seg" value={g.curveSegments ?? 6} step={1} min={1} isInt
              onChange={(v) => onUpdate({ curveSegments: v })} />
            <MaxCheck label="Reverse"     checked={!!g.reverse}    onChange={(v) => onUpdate({ reverse: v })} />
            <MaxCheck label="Auto Update" checked={g.autoUpdate !== false} onChange={(v) => onUpdate({ autoUpdate: v })} />
            <div className="text-[10px] text-muted-foreground leading-tight pt-1">
              Add an <span className="font-mono">Extrude</span> modifier to give the text volume.
            </div>
          </>
        );
      default:
        return null;
    }
  })();

  return (
    <>
      <MaxRollout title="Parameters" className="mt-4">
        <div className="space-y-[3px]">{specific}</div>
      </MaxRollout>

      {onConvert && (
        <MaxRollout title="Selection" className="mt-2">
          <div className="text-[10px] text-muted-foreground pb-1 font-sans leading-snug">
            Sub-Object Levels — clicking a level converts this shape to Editable Spline and enters that sub-object mode.
          </div>
          <SubObjectStack objectId={object.id} onConvert={onConvert} />
        </MaxRollout>
      )}

      <MaxRollout title="Rendering" className="mt-2">

        <div className="space-y-[3px]">
          <MaxCheck label="Enable In Viewport" checked={!!g.renderableViewport}
            onChange={(v) => onUpdate({ renderableViewport: v })} />
          <MaxCheck label="Enable In Renderer" checked={!!g.renderableRender}
            onChange={(v) => onUpdate({ renderableRender: v })} />
          <MaxSelect
            label="Section"
            value={g.renderRectangular ? 'rect' : 'radial'}
            options={[
              { value: 'radial', label: 'Radial' },
              { value: 'rect',   label: 'Rectangular' },
            ]}
            onChange={(v) => onUpdate({ renderRectangular: v === 'rect' })}
          />
          {!g.renderRectangular && (
            <>
              <MaxSpinner label="Thickness" value={g.thickness ?? 0.02} step={0.005} min={0.001}
                onChange={(v) => onUpdate({ thickness: v })} />
              <MaxSpinner label="Sides"     value={g.sides ?? 6}         step={1} min={3} isInt
                onChange={(v) => onUpdate({ sides: v })} />
              <MaxSpinner label="Angle °"   value={g.angle ?? 0}         step={1}
                onChange={(v) => onUpdate({ angle: v })} />
            </>
          )}
          {g.renderRectangular && (
            <>
              <MaxSpinner label="Length" value={g.rectLength ?? 0.04} step={0.005} min={0.001}
                onChange={(v) => onUpdate({ rectLength: v })} />
              <MaxSpinner label="Width"  value={g.rectWidth  ?? 0.02} step={0.005} min={0.001}
                onChange={(v) => onUpdate({ rectWidth: v })} />
              <MaxSpinner label="Angle °" value={g.angle ?? 0}        step={1}
                onChange={(v) => onUpdate({ angle: v })} />
            </>
          )}
        </div>
      </MaxRollout>

      <MaxRollout title="Interpolation" className="mt-2">
        <div className="space-y-[3px]">
          <MaxSpinner label="Steps" value={g.interpolationSteps ?? 6} step={1} min={0} isInt
            onChange={(v) => onUpdate({ interpolationSteps: v })} />
          <MaxCheck label="Adaptive" checked={g.adaptive !== false}
            onChange={(v) => onUpdate({ adaptive: v })} />
          <MaxCheck label="Optimize" checked={!!g.optimize}
            onChange={(v) => onUpdate({ optimize: v })} />
        </div>
      </MaxRollout>

      {onConvert && (
        <div className="mt-2">
          <button
            type="button"
            onClick={onConvert}
            className="w-full h-[22px] text-[11px] bg-panel/60 border border-panel-border rounded-[2px] hover:bg-panel/90"
          >
            Convert to Editable Spline
          </button>
        </div>
      )}
    </>
  );
};
