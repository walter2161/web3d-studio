/**
 * Registry of active sub-object region pickers.
 *
 * Sub-object overlays (Editable Mesh vertices/edges/faces, Editable Spline
 * knots/segments) call `registerSubObjRegionPicker` while they are mounted.
 * The scene-level `SelectionRegionOverlay` invokes every registered picker
 * when the user completes a marquee (rect/circle/lasso/fence/paint) so that
 * multiple vertices/edges/faces get selected in one gesture, matching
 * 3ds Max sub-object region selection.
 *
 * A picker owns its own selection application (calls setSplineSel, dispatches
 * `r3-subobj-select`, etc.) so this file has no knowledge of specific
 * modifier types.
 */
import * as THREE from 'three';

export interface RegionShape {
  /** Test whether a screen-space point (in canvas-local pixels) lies inside
   *  the marquee region. */
  contains: (x: number, y: number) => boolean;
  /** Screen-space bounding box of the region, for early-outs. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** 'add' = ctrl/shift, 'remove' = alt, otherwise replace. */
  mode: 'replace' | 'add' | 'remove';
}

export interface RegionPickContext {
  camera: THREE.Camera;
  canvasRect: DOMRect;
  vkey: string;
  shape: RegionShape;
}

export type SubObjRegionPicker = (ctx: RegionPickContext) => boolean;

const pickers = new Set<SubObjRegionPicker>();

export function registerSubObjRegionPicker(fn: SubObjRegionPicker) {
  pickers.add(fn);
  return () => { pickers.delete(fn); };
}

export function unregisterSubObjRegionPicker(fn: SubObjRegionPicker) {
  pickers.delete(fn);
}

/** Runs every registered picker. Returns true if any of them handled it,
 *  which tells the caller to skip scene-object region selection. */
export function runSubObjRegionPickers(ctx: RegionPickContext): boolean {
  let handled = false;
  pickers.forEach((fn) => {
    try { if (fn(ctx)) handled = true; } catch (err) { console.error(err); }
  });
  return handled;
}

export function hasActiveSubObjRegionPickers(): boolean {
  return pickers.size > 0;
}
