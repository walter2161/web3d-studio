/**
 * Minimal shared store for Editable Spline sub-object state.
 *
 * Multiple components (SidePanel command panel, Scene3D overlay) need to see
 * and mutate the same "which knots/segments are selected on which object"
 * blob. To keep the codebase free of another context, we expose a tiny
 * pub/sub store keyed by objectId.
 */
import { SplineSubLevel } from './EditableSpline';

export interface SplineSelState {
  level: SplineSubLevel | null;
  knots: Set<number>;
  segments: Set<number>;
  splines: Set<number>;
}

const empty = (): SplineSelState => ({ level: null, knots: new Set(), segments: new Set(), splines: new Set() });

const state = new Map<string, SplineSelState>();
const listeners = new Set<() => void>();

export function getSplineSel(objectId: string): SplineSelState {
  let s = state.get(objectId);
  if (!s) {
    // Cache the empty state so useSyncExternalStore sees a stable reference
    // between renders (React error #185 otherwise).
    s = empty();
    state.set(objectId, s);
  }
  return s;
}

export function setSplineSel(objectId: string, patch: Partial<SplineSelState>) {
  const cur = state.get(objectId) ?? empty();
  const next: SplineSelState = {
    level: patch.level !== undefined ? patch.level : cur.level,
    knots: patch.knots ?? cur.knots,
    segments: patch.segments ?? cur.segments,
    splines: patch.splines ?? cur.splines,
  };
  state.set(objectId, next);
  listeners.forEach((l) => l());
}

export function clearSplineSel(objectId: string) {
  state.delete(objectId);
  listeners.forEach((l) => l());
}

export function subscribeSplineSel(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
