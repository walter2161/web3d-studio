/**
 * WaltSculpt — global store for brush state, symmetry, mask, layers.
 * Vanilla store with subscribe/getState pattern, mirrors the app's other
 * micro-stores (splineSelStore, modifierSubStore).
 */

export type BrushKind =
  | 'move' | 'clay' | 'clayBuildup' | 'smooth' | 'inflate' | 'pinch'
  | 'crease' | 'flatten' | 'polish' | 'trim' | 'mask';

export type StrokeKind = 'freehand' | 'dots' | 'drag' | 'spray';

export interface SculptState {
  active: boolean;
  targetId: string | null; // scene object id to sculpt
  brush: BrushKind;
  radius: number;      // world units
  strength: number;    // 0..1
  falloff: number;     // 0..1 (curve shape)
  symmetry: { x: boolean; y: boolean; z: boolean };
  stroke: StrokeKind;
  lazyMouse: boolean;
  invert: boolean;     // subtract instead of add
  // Mask: 0..1 per vertex. 1 = blocked, 0 = editable. Keyed by targetId.
  masks: Map<string, Float32Array>;
  // Layers: { id, name, enabled, deltas: Float32Array (xyz per vertex) }
  layers: Map<string, SculptLayer[]>;
  activeLayer: Map<string, string>;
}

export interface SculptLayer {
  id: string;
  name: string;
  enabled: boolean;
  strength: number;
  deltas: Float32Array | null; // null = not yet baked (direct-to-mesh)
}

let state: SculptState = {
  active: false,
  targetId: null,
  brush: 'move',
  radius: 0.4,
  strength: 0.5,
  falloff: 0.5,
  symmetry: { x: false, y: false, z: false },
  stroke: 'freehand',
  lazyMouse: false,
  invert: false,
  masks: new Map(),
  layers: new Map(),
  activeLayer: new Map(),
};

const listeners = new Set<() => void>();

export const sculptStore = {
  getState: () => state,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
  set: (patch: Partial<SculptState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  setSym: (axis: 'x' | 'y' | 'z', v: boolean) => {
    state = { ...state, symmetry: { ...state.symmetry, [axis]: v } };
    listeners.forEach((l) => l());
  },
  ensureMask: (id: string, count: number): Float32Array => {
    let m = state.masks.get(id);
    if (!m || m.length !== count) {
      m = new Float32Array(count);
      state.masks.set(id, m);
    }
    return m;
  },
  addLayer: (id: string, name: string) => {
    const list = state.layers.get(id) ?? [];
    const layer: SculptLayer = { id: `L${Date.now()}`, name, enabled: true, strength: 1, deltas: null };
    list.push(layer);
    state.layers.set(id, list);
    state.activeLayer.set(id, layer.id);
    listeners.forEach((l) => l());
  },
  removeLayer: (targetId: string, layerId: string) => {
    const list = (state.layers.get(targetId) ?? []).filter((l) => l.id !== layerId);
    state.layers.set(targetId, list);
    listeners.forEach((l) => l());
  },
};
