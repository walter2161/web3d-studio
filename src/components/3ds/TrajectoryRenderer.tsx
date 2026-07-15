import { useMemo, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Keyframe, AnimationTrack } from './AnimationTimeline';

interface TrajectoryRendererProps {
  tracks: AnimationTrack[];
  selectedKeyframe: Keyframe | null;
  onUpdateKeyframe: (objectId: string, keyframeId: string, updates: Partial<Keyframe>) => void;
  onSelectKeyframe?: (kf: Keyframe | null) => void;
}

export const TrajectoryRenderer = ({ tracks, selectedKeyframe, onUpdateKeyframe, onSelectKeyframe }: TrajectoryRendererProps) => {
  return (
    <>
      {tracks.filter(t => t.showTrajectory && t.keyframes.length >= 2).map(track => (
        <TrajectoryPath
          key={track.objectId}
          track={track}
          selectedKeyframe={selectedKeyframe}
          onUpdateKeyframe={onUpdateKeyframe}
          onSelectKeyframe={onSelectKeyframe}
        />
      ))}
    </>
  );
};

type DragKind =
  | { kind: 'anchor'; kfId: string }
  | { kind: 'handle'; kfId: string; type: 'in' | 'out' };

function TrajectoryPath({ track, selectedKeyframe, onUpdateKeyframe, onSelectKeyframe }: {
  track: AnimationTrack;
  selectedKeyframe: Keyframe | null;
  onUpdateKeyframe: (objectId: string, keyframeId: string, updates: Partial<Keyframe>) => void;
  onSelectKeyframe?: (kf: Keyframe | null) => void;
}) {
  const { camera, gl } = useThree();
  const [dragging, setDragging] = useState<DragKind | null>(null);
  const dragPlaneRef = useRef(new THREE.Plane());
  const raycasterRef = useRef(new THREE.Raycaster());
  const ndcRef = useRef(new THREE.Vector2());

  const { curvePoints, anchorPoints, handlePoints, handleLines } = useMemo(() => {
    const kfs = track.keyframes;
    if (kfs.length < 2) return { curvePoints: [], anchorPoints: [], handlePoints: [], handleLines: [] };

    const anchors: { pos: [number, number, number]; kfId: string }[] = [];
    const handles: { pos: [number, number, number]; kfId: string; type: 'in' | 'out' }[] = [];
    const lines: [number, number, number][][] = [];

    const allCurvePoints: THREE.Vector3[] = [];
    for (let i = 0; i < kfs.length - 1; i++) {
      const a = kfs[i], b = kfs[i + 1];
      const p0 = new THREE.Vector3(...a.position);
      const p1 = new THREE.Vector3(a.position[0] + a.outTangent[0], a.position[1] + a.outTangent[1], a.position[2] + a.outTangent[2]);
      const p2 = new THREE.Vector3(b.position[0] + b.inTangent[0], b.position[1] + b.inTangent[1], b.position[2] + b.inTangent[2]);
      const p3 = new THREE.Vector3(...b.position);
      const curve = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
      allCurvePoints.push(...curve.getPoints(30));
    }

    kfs.forEach(kf => {
      anchors.push({ pos: kf.position, kfId: kf.id });
      const outPos: [number, number, number] = [
        kf.position[0] + kf.outTangent[0], kf.position[1] + kf.outTangent[1], kf.position[2] + kf.outTangent[2],
      ];
      const inPos: [number, number, number] = [
        kf.position[0] + kf.inTangent[0], kf.position[1] + kf.inTangent[1], kf.position[2] + kf.inTangent[2],
      ];
      handles.push({ pos: outPos, kfId: kf.id, type: 'out' });
      handles.push({ pos: inPos, kfId: kf.id, type: 'in' });
      lines.push([kf.position, outPos]);
      lines.push([kf.position, inPos]);
    });

    return {
      curvePoints: allCurvePoints.map(p => [p.x, p.y, p.z] as [number, number, number]),
      anchorPoints: anchors,
      handlePoints: handles,
      handleLines: lines,
    };
  }, [track.keyframes]);

  const getPointerWorld = useCallback((clientX: number, clientY: number): THREE.Vector3 | null => {
    const rect = gl.domElement.getBoundingClientRect();
    ndcRef.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycasterRef.current.setFromCamera(ndcRef.current, camera);
    const hit = new THREE.Vector3();
    const res = raycasterRef.current.ray.intersectPlane(dragPlaneRef.current, hit);
    return res ? hit : null;
  }, [camera, gl]);

  const startDrag = useCallback((e: any, k: DragKind, anchorWorld: [number, number, number]) => {
    e.stopPropagation();
    (e.target as any)?.setPointerCapture?.(e.pointerId);
    // Drag plane: perpendicular to camera view direction, passing through the point
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    dragPlaneRef.current.setFromNormalAndCoplanarPoint(camDir, new THREE.Vector3(...anchorWorld));
    setDragging(k);
    const kf = track.keyframes.find(k2 => k2.id === (k.kind === 'anchor' ? k.kfId : k.kfId));
    if (onSelectKeyframe && kf) onSelectKeyframe(kf);
  }, [camera, track.keyframes, onSelectKeyframe]);

  const onPointerMove = useCallback((e: any) => {
    if (!dragging) return;
    e.stopPropagation();
    const p = getPointerWorld(e.clientX, e.clientY);
    if (!p) return;
    const kf = track.keyframes.find(k => k.id === dragging.kfId);
    if (!kf) return;

    if (dragging.kind === 'anchor') {
      onUpdateKeyframe(track.objectId, kf.id, { position: [p.x, p.y, p.z] });
    } else {
      const tangent: [number, number, number] = [
        p.x - kf.position[0], p.y - kf.position[1], p.z - kf.position[2],
      ];
      // Mirror the opposite handle unless Alt is held (break)
      const alt = e.altKey;
      if (dragging.type === 'out') {
        const updates: Partial<Keyframe> = { outTangent: tangent };
        if (!alt) updates.inTangent = [-tangent[0], -tangent[1], -tangent[2]];
        onUpdateKeyframe(track.objectId, kf.id, updates);
      } else {
        const updates: Partial<Keyframe> = { inTangent: tangent };
        if (!alt) updates.outTangent = [-tangent[0], -tangent[1], -tangent[2]];
        onUpdateKeyframe(track.objectId, kf.id, updates);
      }
    }
  }, [dragging, getPointerWorld, onUpdateKeyframe, track.keyframes, track.objectId]);

  const endDrag = useCallback((e: any) => {
    if (!dragging) return;
    e.stopPropagation();
    (e.target as any)?.releasePointerCapture?.(e.pointerId);
    setDragging(null);
  }, [dragging]);

  if (curvePoints.length < 2) return null;

  return (
    <group userData={{ __helper: true }}>
      <Line points={curvePoints} color="hsl(195, 100%, 50%)" lineWidth={2} transparent opacity={0.8} />

      {/* Anchors */}
      {anchorPoints.map((a) => {
        const isSel = selectedKeyframe?.id === a.kfId;
        return (
          <mesh
            key={`anchor-${a.kfId}`}
            position={a.pos}
            onPointerDown={(e) => startDrag(e, { kind: 'anchor', kfId: a.kfId }, a.pos)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <sphereGeometry args={[isSel ? 0.11 : 0.09, 12, 12]} />
            <meshBasicMaterial color={isSel ? '#ffe14a' : 'hsl(195, 100%, 55%)'} depthTest={false} transparent />
          </mesh>
        );
      })}

      {/* Handles */}
      {handlePoints.map((h) => {
        const isSel = selectedKeyframe?.id === h.kfId;
        return (
          <mesh
            key={`handle-${h.kfId}-${h.type}`}
            position={h.pos}
            onPointerDown={(e) => startDrag(e, { kind: 'handle', kfId: h.kfId, type: h.type }, h.pos)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <sphereGeometry args={[isSel ? 0.07 : 0.06, 10, 10]} />
            <meshBasicMaterial color={isSel ? '#ffb020' : 'orange'} depthTest={false} transparent />
          </mesh>
        );
      })}

      {/* Handle lines */}
      {handleLines.map((line, i) => (
        <Line key={`hline-${i}`} points={line} color="#888888" lineWidth={1} transparent opacity={0.6} />
      ))}
    </group>
  );
}
