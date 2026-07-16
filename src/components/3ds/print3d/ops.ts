import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { bedSizeUnits, PrintBedGeom } from './PrintBedObject';

export interface PrintObject {
  id: string;
  type: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  geometry?: any;
  ref?: any;
}

/** Returns the world AABB of a scene object (via its live three.js node). */
export const worldBox = (obj: PrintObject): THREE.Box3 | null => {
  const node = obj.ref?.current as THREE.Object3D | undefined;
  if (!node) return null;
  const b = new THREE.Box3().setFromObject(node);
  return b.isEmpty() ? null : b;
};

/**
 * Center the object on the bed in X/Z (world axes), keeping Y unchanged.
 * Returns the new [x,y,z] position.
 */
export const centerOnPlate = (obj: PrintObject, bed: PrintObject): [number, number, number] => {
  const b = worldBox(obj);
  if (!b) return obj.position;
  const c = new THREE.Vector3();
  b.getCenter(c);
  const dx = bed.position[0] - c.x;
  const dz = bed.position[2] - c.z;
  return [obj.position[0] + dx, obj.position[1], obj.position[2] + dz];
};

/**
 * Drop the object down until its bounding-box floor rests on the bed's base
 * plate (world Y = bed.position[1]).
 */
export const dropToBed = (obj: PrintObject, bed: PrintObject): [number, number, number] => {
  const b = worldBox(obj);
  if (!b) return obj.position;
  const floor = bed.position[1];
  const dy = floor - b.min.y;
  return [obj.position[0], obj.position[1] + dy, obj.position[2]];
};

/**
 * Scale the object uniformly by `factor` (relative to its current scale).
 * Used by "Scale for Print" (e.g. 1:100 → factor = 0.01).
 */
export const scaleForPrint = (obj: PrintObject, factor: number): [number, number, number] => {
  const f = Number.isFinite(factor) && factor > 0 ? factor : 1;
  return [obj.scale[0] * f, obj.scale[1] * f, obj.scale[2] * f];
};

/** How many objects fall outside the given bed's build volume. */
export const countOutOfBounds = (objs: PrintObject[], bed: PrintObject | null): number => {
  if (!bed) return 0;
  const [w, h, d] = bedSizeUnits(bed.geometry as PrintBedGeom);
  const bedNode = bed.ref?.current as THREE.Object3D | undefined;
  const local = new THREE.Box3(
    new THREE.Vector3(-w / 2, 0, -d / 2),
    new THREE.Vector3(w / 2, h, d / 2),
  );
  const bedBox = bedNode
    ? local.clone().applyMatrix4(bedNode.matrixWorld)
    : local.translate(new THREE.Vector3(...bed.position));
  let n = 0;
  for (const o of objs) {
    if (o.type === 'print_bed') continue;
    const b = worldBox(o);
    if (!b) continue;
    if (!bedBox.containsBox(b)) n++;
  }
  return n;
};

const download = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
};

/** Export the selected object (or the whole scene when null) as ASCII STL. */
export const exportSTL = (obj: PrintObject | null, all: PrintObject[]): boolean => {
  const exporter = new STLExporter();
  const root = new THREE.Group();
  const sources = obj ? [obj] : all.filter((o) => o.type !== 'print_bed' && o.ref?.current);
  sources.forEach((o) => {
    const node = o.ref?.current as THREE.Object3D | undefined;
    if (node) root.add(node.clone(true));
  });
  if (root.children.length === 0) return false;
  const data = exporter.parse(root, { binary: false }) as string;
  download(new Blob([data], { type: 'model/stl' }), `${obj?.id ?? 'scene'}.stl`);
  return true;
};

export const exportOBJ = (obj: PrintObject | null, all: PrintObject[]): boolean => {
  const exporter = new OBJExporter();
  const root = new THREE.Group();
  const sources = obj ? [obj] : all.filter((o) => o.type !== 'print_bed' && o.ref?.current);
  sources.forEach((o) => {
    const node = o.ref?.current as THREE.Object3D | undefined;
    if (node) root.add(node.clone(true));
  });
  if (root.children.length === 0) return false;
  const data = exporter.parse(root);
  download(new Blob([data], { type: 'text/plain' }), `${obj?.id ?? 'scene'}.obj`);
  return true;
};
