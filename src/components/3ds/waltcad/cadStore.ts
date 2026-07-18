/**
 * WaltCad — CAD module state.
 *
 * Holds layer stack, snap modes, active tool, and parameter defaults for every
 * WaltCad edit operation (offset, fillet, chamfer, array, mirror, hatch,
 * dimension, wall/door/window generators). Kept lean and framework-agnostic —
 * the sidebar panel and the operations controller both read the same store.
 */
import { create } from 'zustand';

export type CadTool =
  | null
  | 'line' | 'polyline' | 'arc' | 'circle' | 'rectangle'
  | 'offset' | 'trim' | 'extend' | 'fillet' | 'chamfer'
  | 'mirror' | 'array' | 'explode' | 'join' | 'break'
  | 'divide' | 'measure' | 'stretch' | 'scale_ref' | 'align'
  | 'hatch' | 'dimension' | 'match_props'
  | 'wall' | 'door' | 'window' | 'column' | 'stairs' | 'roof' | 'room'
  | 'generate_3d';

export type SnapMode =
  | 'endpoint' | 'midpoint' | 'center' | 'intersection'
  | 'perpendicular' | 'tangent' | 'quadrant' | 'nearest' | 'grid' | 'vertex';

export interface CadLayer {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
  frozen: boolean;
  lineWeight: number;
}

export type ArrayMode = 'linear' | 'radial' | 'path';
export type MirrorAxis = 'x' | 'y' | 'z';
export type HatchPattern = 'concrete' | 'brick' | 'wood' | 'grass' | 'earth' | 'steel' | 'tile' | 'lines' | 'grid';
export type DimensionKind = 'linear' | 'aligned' | 'angular' | 'radius' | 'diameter' | 'arc_length';

interface State {
  activeTool: CadTool;

  // Layers
  layers: CadLayer[];
  currentLayerId: string;

  // Snap
  snap: Record<SnapMode, boolean>;
  gridSize: number;
  orthoMode: boolean;
  smartGuides: boolean;

  // Tool parameters
  offsetDistance: number;
  offsetBothSides: boolean;
  offsetMultiple: number;

  filletRadius: number;
  filletTrim: boolean;

  chamferA: number;
  chamferB: number;

  arrayMode: ArrayMode;
  arrayCount: number;
  arrayDX: number;
  arrayDY: number;
  arrayDZ: number;
  arrayCenterSweep: number;   // degrees, radial

  mirrorAxis: MirrorAxis;
  mirrorCopy: boolean;

  divideCount: number;
  measureSpacing: number;

  hatchPattern: HatchPattern;
  hatchSpacing: number;
  hatchAngle: number;
  hatchColor: string;

  dimensionKind: DimensionKind;
  dimensionPrecision: number;
  dimensionTextHeight: number;

  wallHeight: number;
  wallThickness: number;
  doorWidth: number;
  doorHeight: number;
  windowWidth: number;
  windowHeight: number;
  windowSill: number;

  breakPointT: number;  // 0..1 along selected spline

  // actions
  setTool: (t: CadTool) => void;
  set: (patch: Partial<State>) => void;
  addLayer: (name: string) => void;
  removeLayer: (id: string) => void;
  updateLayer: (id: string, patch: Partial<CadLayer>) => void;
  setCurrentLayer: (id: string) => void;
  toggleSnap: (mode: SnapMode) => void;
}

const defaultLayer = (id: string, name: string, color: string): CadLayer => ({
  id, name, color, visible: true, locked: false, frozen: false, lineWeight: 1,
});

export const useCadStore = create<State>((set) => ({
  activeTool: null,

  layers: [
    defaultLayer('l0', '0 Default',  '#dddddd'),
    defaultLayer('l1', 'Walls',      '#ff5555'),
    defaultLayer('l2', 'Doors',      '#5599ff'),
    defaultLayer('l3', 'Windows',    '#55ff99'),
    defaultLayer('l4', 'Furniture',  '#ffcc55'),
    defaultLayer('l5', 'Electrical', '#ff55ff'),
    defaultLayer('l6', 'Hydraulic',  '#55ffff'),
    defaultLayer('l7', 'Dimensions', '#ffff55'),
  ],
  currentLayerId: 'l0',

  snap: {
    endpoint: true, midpoint: true, center: true, intersection: true,
    perpendicular: false, tangent: false, quadrant: false, nearest: false,
    grid: true, vertex: true,
  },
  gridSize: 0.1,
  orthoMode: false,
  smartGuides: true,

  offsetDistance: 0.15, offsetBothSides: false, offsetMultiple: 1,
  filletRadius: 0.1, filletTrim: true,
  chamferA: 0.1, chamferB: 0.1,

  arrayMode: 'linear',
  arrayCount: 5,
  arrayDX: 1, arrayDY: 0, arrayDZ: 0,
  arrayCenterSweep: 360,

  mirrorAxis: 'x', mirrorCopy: true,

  divideCount: 10,
  measureSpacing: 0.5,

  hatchPattern: 'concrete', hatchSpacing: 0.1, hatchAngle: 45, hatchColor: '#888888',

  dimensionKind: 'linear', dimensionPrecision: 2, dimensionTextHeight: 0.1,

  wallHeight: 2.8, wallThickness: 0.15,
  doorWidth: 0.9, doorHeight: 2.1,
  windowWidth: 1.2, windowHeight: 1.2, windowSill: 0.9,

  breakPointT: 0.5,

  setTool: (activeTool) => set({ activeTool }),
  set: (patch) => set(patch as any),

  addLayer: (name) => set((s) => ({
    layers: [...s.layers, defaultLayer(`l${Date.now()}`, name, `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`)],
  })),
  removeLayer: (id) => set((s) => ({
    layers: s.layers.filter((l) => l.id !== id),
    currentLayerId: s.currentLayerId === id ? s.layers[0]?.id ?? 'l0' : s.currentLayerId,
  })),
  updateLayer: (id, patch) => set((s) => ({
    layers: s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
  })),
  setCurrentLayer: (currentLayerId) => set({ currentLayerId }),

  toggleSnap: (mode) => set((s) => ({ snap: { ...s.snap, [mode]: !s.snap[mode] } })),
}));
