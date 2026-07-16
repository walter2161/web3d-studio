/**
 * Bone joint registry — module-level map that lets Scene3D attach
 * TransformControls to a specific joint <group> inside a BoneChainGizmo
 * without React prop-drilling.
 *
 * Keys are `${chainObjectId}:${jointIndex}`.
 *
 * Also exposes a tiny event bus so components can react to joint selection
 * changes without threading callbacks through every layer.
 */

import type { Group } from 'three';

const map = new Map<string, Group>();

export const setJointObject = (key: string, obj: Group | null) => {
  if (obj) map.set(key, obj);
  else map.delete(key);
};

export const getJointObject = (key: string): Group | undefined => map.get(key);

export interface BoneJointSelection {
  objectId: string;
  jointIndex: number;
}

let current: BoneJointSelection | null = null;
const listeners = new Set<(sel: BoneJointSelection | null) => void>();

export const getSelectedJoint = () => current;

export const setSelectedJoint = (sel: BoneJointSelection | null) => {
  current = sel;
  listeners.forEach((l) => l(sel));
};

export const subscribeSelectedJoint = (fn: (sel: BoneJointSelection | null) => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};
