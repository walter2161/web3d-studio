/**
 * Tracks the active Modifier sub-object selection (Gizmo / Center), analogous
 * to `boneJointRegistry` and `splineSelStore` used for other sub-object gizmos.
 *
 * When a user expands a deformation modifier (Bend / Twist / Taper / Noise) in
 * the Modifier Stack and clicks one of its children ("Gizmo" or "Center"),
 * Scene3D reattaches `TransformControls` to a proxy that mirrors that gizmo's
 * TRS. Dragging the proxy dispatches `r3-modifier-gizmo-op`, which Studio3D
 * turns into an undoable `updateModifier` on `params.gizmo` / `params.center`.
 */

export type ModifierSubPart = 'gizmo' | 'center';

export interface ModifierSubSelection {
  objectId: string;
  modifierId: string;
  part: ModifierSubPart;
}

let current: ModifierSubSelection | null = null;
const listeners = new Set<(s: ModifierSubSelection | null) => void>();

export function getModifierSub(): ModifierSubSelection | null {
  return current;
}

export function setModifierSub(sel: ModifierSubSelection | null): void {
  if (
    current === sel ||
    (current && sel &&
      current.objectId === sel.objectId &&
      current.modifierId === sel.modifierId &&
      current.part === sel.part)
  ) return;
  current = sel;
  listeners.forEach((fn) => fn(current));
}

export function subscribeModifierSub(fn: (s: ModifierSubSelection | null) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Reads the gizmo / center TRS stored on a modifier's params, applying
 * safe defaults (identity + zero) so brand-new modifiers behave correctly.
 */
export function readGizmoTRS(params: any): {
  gizmoPos: [number, number, number];
  gizmoRot: [number, number, number];
  gizmoScale: [number, number, number];
  centerPos: [number, number, number];
} {
  const g = params?.gizmo || {};
  const c = params?.center || {};
  return {
    gizmoPos: Array.isArray(g.pos) && g.pos.length === 3 ? g.pos : [0, 0, 0],
    gizmoRot: Array.isArray(g.rot) && g.rot.length === 3 ? g.rot : [0, 0, 0],
    gizmoScale: Array.isArray(g.scale) && g.scale.length === 3 ? g.scale : [1, 1, 1],
    centerPos: Array.isArray(c.pos) && c.pos.length === 3 ? c.pos : [0, 0, 0],
  };
}

/**
 * Type of modifier that exposes Gizmo + Center sub-objects.
 * Kept as a set so SidePanel + Scene3D agree on the same list.
 */
export const GIZMO_MODIFIER_TYPES = new Set(['Bend', 'Twist', 'Taper', 'Noise']);
