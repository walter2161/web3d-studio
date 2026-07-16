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
  onKnotHandleMove?: (id: number, which: 'in' | 'out', localOffset: THREE.Vector3) => void;
}

const KNOT_SIZE = 0.06;
const HANDLE_SIZE = 0.045;

function pointsGeometry(points: THREE.Vector3[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap((p) => [p.x, p.y, p.z]), 3));
  return g;
}

function OverlayLine({
  points, color, opacity = 1, onPointerDown,
}: {
  points: THREE.Vector3[];
  color: string;
  opacity?: number;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
}) {
  const geometry = useMemo(() => pointsGeometry(points), [points.map((p) => `${p.x},${p.y},${p.z}`).join('|')]);
  const line = useMemo(() => {
    const material = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity });
    const obj = new THREE.Line(geometry, material);
    obj.renderOrder = 998;
    return obj;
  }, [geometry, color, opacity]);
  return (
    <primitive object={line} onPointerDown={onPointerDown} />
  );
}

export function SplineSubObjectOverlay({
  spline, level,
  parentPosition, parentRotation, parentScale,
  selectedKnots, selectedSegments, selectedSplines,
  onSelectKnot, onSelectSegment, onSelectSpline, onKnotMove, onKnotHandleMove,
}: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera, gl } = useThree();

  // Convert client-space drag to a plane offset in world space; the plane is
  // aligned to the view (camera-facing) at the knot's initial position.
  const drag = useRef<{ kid: number; handle?: 'in' | 'out'; plane: THREE.Plane; ptr: number } | null>(null);

  const selectedKey = useMemo(() => Array.from(selectedKnots).sort((a, b) => a - b).join(','), [selectedKnots]);
  const knotArr = useMemo(() => Array.from(spline.knots.values()), [spline, spline.knots.size, level, selectedKey]);
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

  // OrbitControls listens on native DOM events which R3F's stopPropagation
  // does NOT cancel — so we explicitly disable orbit while dragging a
  // knot/handle, and re-enable on pointer up (matches TransformControls).
  const disableOrbit = () => {
    const controls = (window as any).__orbitControls;
    if (controls) controls.enabled = false;
  };
  const enableOrbit = () => {
    const controls = (window as any).__orbitControls;
    if (controls) controls.enabled = true;
  };

  // Drag handlers on a knot mesh.
  const onKnotDown = (e: ThreeEvent<PointerEvent>, kid: number) => {
    e.stopPropagation();
    (e.nativeEvent as any)?.stopImmediatePropagation?.();
    onSelectKnot?.(kid, e.shiftKey || e.ctrlKey || e.metaKey);
    if (level !== 'sknot') return;
    const k = spline.knots.get(kid); if (!k) return;
    const start = worldOf(k.pos);
    const normal = new THREE.Vector3().subVectors(camera.position, start).normalize();
    drag.current = { kid, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, start), ptr: e.pointerId };
    (e.target as any)?.setPointerCapture?.(e.pointerId);
    disableOrbit();
  };

  const onHandleDown = (e: ThreeEvent<PointerEvent>, kid: number, handle: 'in' | 'out') => {
    e.stopPropagation();
    (e.nativeEvent as any)?.stopImmediatePropagation?.();
    onSelectKnot?.(kid, false);
    const k = spline.knots.get(kid); if (!k) return;
    const localHandle = k.pos.clone().add(handle === 'in' ? k.inHandle : k.outHandle);
    const start = worldOf(localHandle);
    const normal = new THREE.Vector3().subVectors(camera.position, start).normalize();
    drag.current = { kid, handle, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, start), ptr: e.pointerId };
    (e.target as any)?.setPointerCapture?.(e.pointerId);
    disableOrbit();
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
      if (drag.current.handle) {
        const k = spline.knots.get(drag.current.kid);
        if (!k) return;
        onKnotHandleMove?.(drag.current.kid, drag.current.handle, local.sub(k.pos));
      } else {
        onKnotMove?.(drag.current.kid, local);
      }
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
        return (
          <group
            key={segId}
          >
            <OverlayLine
              points={pts}
              color={color}
              opacity={1}
              onPointerDown={(e) => {
                if (level !== 'ssegment' && level !== 'sspline') return;
                e.stopPropagation();
                if (level === 'ssegment') onSelectSegment?.(segId, e.shiftKey || e.ctrlKey || e.metaKey);
                else if (seg) onSelectSpline?.(seg.splineId, e.shiftKey || e.ctrlKey || e.metaKey);
              }}
            />
          </group>
        );
      })}

      {/* Bezier handles for selected knots. They are offsets from each knot,
          matching the data model used by trajectory curves. */}
      {level === 'sknot' && knotArr.filter((k) => selectedKnots.has(k.id) && k.type !== 'corner').flatMap((k) => {
        const handles: Array<['in' | 'out', THREE.Vector3]> = [
          ['in', k.inHandle],
          ['out', k.outHandle],
        ];
        return handles.map(([which, offset]) => {
          if (offset.lengthSq() < 1e-8) return null;
          const endpoint = k.pos.clone().add(offset);
          return (
            <group key={`${k.id}-${which}`}>
              <OverlayLine points={[k.pos, endpoint]} color="#ffcc33" opacity={0.95} />
              <mesh
                position={[endpoint.x, endpoint.y, endpoint.z]}
                onPointerDown={(e) => onHandleDown(e, k.id, which)}
                onPointerMove={onKnotMoveEv}
                onPointerUp={onKnotUp}
                renderOrder={1000}
              >
                <boxGeometry args={[HANDLE_SIZE, HANDLE_SIZE, HANDLE_SIZE]} />
                <meshBasicMaterial color="#ffcc33" depthTest={false} transparent />
              </mesh>
            </group>
          );
        });
      })}

      {/* Knots — coloured squares, larger and pulsing red when selected. */}
      {level === 'sknot' && knotArr.map((k) => {
        const isSel = selectedKnots.has(k.id);
        const color = isSel ? '#ff2a2a' : (KNOT_COLORS[k.type] ?? '#00ff33');
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
