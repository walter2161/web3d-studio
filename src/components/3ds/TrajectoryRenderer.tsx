import { useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { Keyframe, AnimationTrack } from './AnimationTimeline';

interface TrajectoryRendererProps {
  tracks: AnimationTrack[];
  selectedKeyframe: Keyframe | null;
  onUpdateKeyframe: (objectId: string, keyframeId: string, updates: Partial<Keyframe>) => void;
}

export const TrajectoryRenderer = ({ tracks, selectedKeyframe, onUpdateKeyframe }: TrajectoryRendererProps) => {
  return (
    <>
      {tracks.filter(t => t.showTrajectory && t.keyframes.length >= 2).map(track => (
        <TrajectoryPath key={track.objectId} track={track} selectedKeyframe={selectedKeyframe} onUpdateKeyframe={onUpdateKeyframe} />
      ))}
    </>
  );
};

function TrajectoryPath({ track, selectedKeyframe, onUpdateKeyframe }: {
  track: AnimationTrack;
  selectedKeyframe: Keyframe | null;
  onUpdateKeyframe: (objectId: string, keyframeId: string, updates: Partial<Keyframe>) => void;
}) {
  const { curvePoints, anchorPoints, handlePoints, handleLines } = useMemo(() => {
    const kfs = track.keyframes;
    if (kfs.length < 2) return { curvePoints: [], anchorPoints: [], handlePoints: [], handleLines: [] };

    const anchors: [number, number, number][] = [];
    const handles: { pos: [number, number, number]; keyframeId: string; type: 'in' | 'out' }[] = [];
    const lines: [number, number, number][][] = [];

    // Build bezier curve points
    const allCurvePoints: THREE.Vector3[] = [];
    
    for (let i = 0; i < kfs.length - 1; i++) {
      const a = kfs[i];
      const b = kfs[i + 1];
      
      const p0 = new THREE.Vector3(...a.position);
      const p1 = new THREE.Vector3(
        a.position[0] + a.outTangent[0],
        a.position[1] + a.outTangent[1],
        a.position[2] + a.outTangent[2]
      );
      const p2 = new THREE.Vector3(
        b.position[0] + b.inTangent[0],
        b.position[1] + b.inTangent[1],
        b.position[2] + b.inTangent[2]
      );
      const p3 = new THREE.Vector3(...b.position);

      const curve = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
      allCurvePoints.push(...curve.getPoints(30));
    }

    // Anchors and handles
    kfs.forEach(kf => {
      anchors.push(kf.position);
      
      const outPos: [number, number, number] = [
        kf.position[0] + kf.outTangent[0],
        kf.position[1] + kf.outTangent[1],
        kf.position[2] + kf.outTangent[2],
      ];
      const inPos: [number, number, number] = [
        kf.position[0] + kf.inTangent[0],
        kf.position[1] + kf.inTangent[1],
        kf.position[2] + kf.inTangent[2],
      ];

      handles.push({ pos: outPos, keyframeId: kf.id, type: 'out' });
      handles.push({ pos: inPos, keyframeId: kf.id, type: 'in' });
      
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

  if (curvePoints.length < 2) return null;

  return (
    <group userData={{ __helper: true }}>

      {/* Bezier curve path */}
      <Line
        points={curvePoints}
        color="hsl(195, 100%, 50%)"
        lineWidth={2}
        transparent
        opacity={0.8}
      />

      {/* Anchor points (keyframe positions) */}
      {anchorPoints.map((pos, i) => (
        <mesh key={`anchor-${i}`} position={pos}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshBasicMaterial color="hsl(195, 100%, 50%)" />
        </mesh>
      ))}

      {/* Handle points */}
      {handlePoints.map((handle, i) => (
        <mesh key={`handle-${i}`} position={handle.pos}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshBasicMaterial color="orange" />
        </mesh>
      ))}

      {/* Handle lines */}
      {handleLines.map((line, i) => (
        <Line
          key={`hline-${i}`}
          points={line}
          color="#888888"
          lineWidth={1}
          transparent
          opacity={0.6}
        />
      ))}
    </group>
  );
}
