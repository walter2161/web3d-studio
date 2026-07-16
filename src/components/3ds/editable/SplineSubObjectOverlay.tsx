/**
 * SplineSubObjectOverlay
 *
 * Renders knots and segments for an Editable Spline while a sub-object level
 * is active, and handles picking / drag-to-move for knots. Kept intentionally
 * small — heavy transform semantics (soft selection, per-axis constrained
 * drags) live in the main transform gizmo, not here.
 *
 * The overlay talks to the caller through two callbacks:
 *   - onSelect(kind, id, additive): user clicked something in the viewport
 *   - onKnotMove(kid, worldPos): user finished a drag on a selected knot
 */
import { useMemo, useRef } from 'react';
import { ThreeEvent, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EditableSpline, KNOT_COLORS, SplineSubLevel } from './EditableSpline';

interface Props {
  spline: EditableSpline;
  level: SplineSubLevel;
  parentPosition: [number, number, number];
  parentRotation: [number, number, number];
  parentScale: [number, number, number];
  selectedKnots: Set<number>;
  selectedSegments: Set<number>;
  selectedSplines: Set<number>;
  onSelectKnot?: (id: number, additive: boolean) => void;
  onSelectSegment?: (id: number, additive: boolean) => void;
  onSelectSpline?: (id: number, additive: boolean) => void;
  onKnotMove?: (id: number, localPos: THREE.Vector3) => void;
}

const KNOT_SIZE = 0.06;

export function SplineSubObjectOverlay({
  spline, level,
  parentPosition, parentRotation, parentScale,
  selectedKnots, selectedSegments, selectedSplines,
  onSelectKnot, onSelectSegment, onSelectSpline, onKnotMove,
}: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera, gl } = useThree();

  // Convert client-space drag to a plane offset in world space; the plane is
  // aligned to the view (camera-facing) at the knot's initial position.
  const drag = useRef<{ kid: number; startLocal: THREE.Vector3; plane: THREE.Plane; ptr: number } | null>(null);

  const knotArr = useMemo(() => Array.from(spline.knots.values()), [spline, spline.knots.size, level, selectedKnots.size]);
  const segArr  = useMemo(() => spline.sampleSegmentPoints(12), [spline, spline.segments.size, spline.knots.size, level]);

  const parentMatrix = useMemo(() => {
    const m = new THREE.Matrix4();
    m.compose(
      new THREE.Vector3(...parentPosition),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...parentRotation)),
      new THREE.Vector3(...parentScale),
    );
    return m;
  }, [parentPosition[0], parentPosition[1], parentPosition[2],
      parentRotation[0], parentRotation[1], parentRotation[2],
      parentScale[0], parentScale[1], parentScale[2]]);

  const worldOf = (localPos: THREE.Vector3) => localPos.clone().applyMatrix4(parentMatrix);
  const localOf = (worldPos: THREE.Vector3) => worldPos.clone().applyMatrix4(new THREE.Matrix4().copy(parentMatrix).invert());

  // Drag handlers on a knot mesh.
  const onKnotDown = (e: ThreeEvent<PointerEvent>, kid: number) => {
    e.stopPropagation();
    onSelectKnot?.(kid, e.shiftKey || e.ctrlKey || e.metaKey);
    if (level !== 'sknot') return;
    const k = spline.knots.get(kid); if (!k) return;
    const start = worldOf(k.pos);
    const normal = new THREE.Vector3().subVectors(camera.position, start).normalize();
    drag.current = { kid, startLocal: k.pos.clone(), plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, start), ptr: e.pointerId };
    (e.target as any)?.setPointerCapture?.(e.pointerId);
  };
  const onKnotMoveEv = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    const rc = new THREE.Raycaster();
    // Reconstruct NDC ray from the current pointer.
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    rc.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    if (rc.ray.intersectPlane(drag.current.plane, hit)) {
      const local = localOf(hit);
      onKnotMove?.(drag.current.kid, local);
    }
  };
  const onKnotUp = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    (e.target as any)?.releasePointerCapture?.(drag.current.ptr);
    drag.current = null;
  };

  return (
    <group ref={groupRef}
      position={parentPosition}
      rotation={parentRotation}
      scale={parentScale}
    >
      {/* Segments — thin lines coloured red when selected, white otherwise. */}
      {segArr.map(({ segId, pts }) => {
        const isSel = selectedSegments.has(segId);
        const seg = spline.segments.get(segId);
        const inSelSpline = seg ? selectedSplines.has(seg.splineId) : false;
        const color = isSel || inSelSpline ? '#ff2a2a' : '#ffffff';
        const positions = new Float32Array(pts.flatMap((p) => [p.x, p.y, p.z]));
        return (
          <line
            key={segId}
            onPointerDown={(e) => {
              if (level !== 'ssegment' && level !== 'sspline') return;
              e.stopPropagation();
              if (level === 'ssegment') onSelectSegment?.(segId, e.shiftKey || e.ctrlKey || e.metaKey);
              else onSelectSpline?.(seg!.splineId, e.shiftKey || e.ctrlKey || e.metaKey);
            }}
          >
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[positions, 3]} count={pts.length} />
            </bufferGeometry>
            <lineBasicMaterial color={color} depthTest={false} transparent linewidth={2} />
          </line>
        );
      })}

      {/* Knots — coloured squares, larger and pulsing red when selected. */}
      {level === 'sknot' && knotArr.map((k) => {
        const isSel = selectedKnots.has(k.id);
        const color = isSel ? '#ff2a2a' : KNOT_COLORS[k.type];
        return (
          <mesh
            key={k.id}
            position={[k.pos.x, k.pos.y, k.pos.z]}
            onPointerDown={(e) => onKnotDown(e, k.id)}
            onPointerMove={onKnotMoveEv}
            onPointerUp={onKnotUp}
            renderOrder={999}
          >
            <boxGeometry args={[KNOT_SIZE, KNOT_SIZE, KNOT_SIZE]} />
            <meshBasicMaterial color={color} depthTest={false} transparent />
          </mesh>
        );
      })}
    </group>
  );
}
