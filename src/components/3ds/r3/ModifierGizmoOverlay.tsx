/**
 * Renders a THREE proxy for the currently-active Modifier gizmo (Bend / Twist /
 * Taper / Noise). The proxy is parented under the selected object's local
 * transform, so its `position/rotation/scale` live in the object's local space
 * — which is exactly the space the deformation runs in.
 *
 * Scene3D reads `getProxyObject()` (exposed via ref) and attaches
 * `TransformControls` to it, mirroring the pattern used by sub-object editing.
 *
 * Visual: yellow wireframe box that hugs the object's bounding box, plus a
 * small blue disc for the Center part. Both are non-raycastable so they never
 * steal picking from the underlying mesh.
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { readGizmoTRS } from './modifierSubStore';

interface Props {
  object: any;
  modifier: any;
  part: 'gizmo' | 'center';
  onProxyReady: (obj: THREE.Object3D | null) => void;
}

/** Very rough local-space bbox for the display cage. Uses the object's own
 * geometry params when available, otherwise falls back to a unit cube. */
function estimateLocalHalfExtents(object: any): [number, number, number] {
  const g = object?.geometry || {};
  const w = Math.max(0.1, Number(g.width ?? g.radius ?? g.length ?? 1));
  const h = Math.max(0.1, Number(g.height ?? g.radius ?? 1));
  const d = Math.max(0.1, Number(g.depth ?? g.length ?? g.radius ?? 1));
  return [w * 0.6, h * 0.6, d * 0.6];
}

export function ModifierGizmoOverlay({ object, modifier, part, onProxyReady }: Props) {
  const proxyRef = useRef<THREE.Object3D>(null);
  const { gizmoPos, gizmoRot, gizmoScale, centerPos } = readGizmoTRS(modifier?.params);

  // Push the proxy up to Scene3D whenever it mounts / changes.
  useEffect(() => {
    onProxyReady(proxyRef.current ?? null);
    return () => onProxyReady(null);
  }, [part, modifier?.id, object?.id, onProxyReady]);

  // Sync proxy TRS from stored params whenever they change (undo, panel edit).
  useEffect(() => {
    const p = proxyRef.current;
    if (!p) return;
    if (part === 'gizmo') {
      p.position.set(gizmoPos[0], gizmoPos[1], gizmoPos[2]);
      p.rotation.set(gizmoRot[0], gizmoRot[1], gizmoRot[2]);
      p.scale.set(gizmoScale[0], gizmoScale[1], gizmoScale[2]);
    } else {
      p.position.set(centerPos[0], centerPos[1], centerPos[2]);
      p.rotation.set(0, 0, 0);
      p.scale.set(1, 1, 1);
    }
  }, [part, gizmoPos, gizmoRot, gizmoScale, centerPos]);

  const [hx, hy, hz] = estimateLocalHalfExtents(object);

  return (
    <group
      position={object.position as any}
      rotation={object.rotation as any}
      scale={object.scale as any}
    >
      <object3D ref={proxyRef as any}>
        {part === 'gizmo' ? (
          // Yellow wireframe cage that shows current gizmo TRS.
          <lineSegments raycast={() => null}>
            <edgesGeometry args={[new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2)]} />
            <lineBasicMaterial color="#f5c518" depthTest={false} transparent opacity={0.9} />
          </lineSegments>
        ) : (
          // Small blue pivot marker for Center.
          <mesh raycast={() => null}>
            <sphereGeometry args={[Math.max(hx, hy, hz) * 0.06, 12, 12]} />
            <meshBasicMaterial color="#4aa3ff" depthTest={false} transparent opacity={0.9} />
          </mesh>
        )}
      </object3D>
    </group>
  );
}
