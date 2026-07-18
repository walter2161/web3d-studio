/**
 * Selection Region store — mirrors 3ds Max's Selection Region system.
 * Controls which shape the marquee uses (Rectangle, Circle, Fence, Lasso,
 * Paint) and toggles for Window vs Crossing and Ignore Backfacing.
 *
 * Simple pub/sub store consumed by the SelectionRegionOverlay and the
 * ToolbarStrip UI. Also mirrored on `window.__r3Region` so raycasters in
 * Object3D can consult Ignore Backfacing without importing this file.
 */
export type RegionMode = 'rectangle' | 'circle' | 'fence' | 'lasso' | 'paint';
export type WindowCrossing = 'window' | 'crossing';

export interface RegionState {
  regionMode: RegionMode;
  windowCrossing: WindowCrossing;
  ignoreBackfacing: boolean;
  paintRadius: number; // px
}

const state: RegionState = {
  regionMode: 'rectangle',
  windowCrossing: 'crossing',
  ignoreBackfacing: false,
  paintRadius: 20,
};

const subs = new Set<() => void>();

const publishWindow = () => {
  if (typeof window === 'undefined') return;
  (window as any).__r3Region = { ...state };
};
publishWindow();

export const getRegionState = (): RegionState => state;

export const setRegionState = (patch: Partial<RegionState>) => {
  Object.assign(state, patch);
  publishWindow();
  subs.forEach((s) => s());
};

export const subscribeRegion = (cb: () => void): (() => void) => {
  subs.add(cb);
  return () => { subs.delete(cb); };
};
