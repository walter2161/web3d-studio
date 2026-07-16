import { useMemo } from 'react';
import * as THREE from 'three';
import { bedSizeUnits, PrintBedGeom } from './PrintBedObject';

interface Props {
  objects: Array<{ id: string; type: string; ref?: any; position: [number, number, number] }>;
}

/**
 * Draws a red bounding box around any scene object that pokes outside the
 * currently-active print bed's build volume. Silent no-op when no bed exists.
 */
export const PrintBoundsOverlay = ({ objects }: Props) => {
  const bed = objects.find((o) => o.type === 'print_bed') as any;
  const bedObj = bed?.ref?.current as THREE.Object3D | undefined;

  // World AABB of the bed's build volume
  const bedBox = useMemo(() => {
    if (!bed) return null;
    const [w, h, d] = bedSizeUnits(bed.geometry as PrintBedGeom);
    const local = new THREE.Box3(
      new THREE.Vector3(-w / 2, 0, -d / 2),
      new THREE.Vector3(w / 2, h, d / 2),
    );
    if (bedObj) {
      const box = local.clone();
      box.applyMatrix4(bedObj.matrixWorld);
      return box;
    }
    // Fallback: local box centered at bed.position
    return local.translate(new THREE.Vector3(bed.position[0], bed.position[1], bed.position[2]));
  }, [bed?.id, bed?.position, bed?.geometry, bedObj]);

  if (!bedBox) return null;

  return (
    <>
      {objects.map((o) => {
        if (o.type === 'print_bed') return null;
        const node = o.ref?.current as THREE.Object3D | undefined;
        if (!node) return null;
        try {
          const b = new THREE.Box3().setFromObject(node);
          if (b.isEmpty()) return null;
          if (bedBox.containsBox(b)) return null;
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          b.getSize(size);
          b.getCenter(center);
          return (
            <lineSegments key={`bnd_${o.id}`} position={center.toArray()}>
              <edgesGeometry args={[new THREE.BoxGeometry(size.x, size.y, size.z)]} />
              <lineBasicMaterial color="#ff3355" />
            </lineSegments>
          );
        } catch { return null; }
      })}
    </>
  );
};
