/**
 * BoneChainGizmo — renders a 3ds Max-style bone chain.
 *
 * Each joint is a nested <group> carrying that joint's local rotation, and
 * the segment (from that joint to the next) is drawn as an elongated
 * "pyramid+cap" pointing along local +X. Nested grouping gives free FK: a
 * rotation on joint N automatically drags joint N+1 and beyond.
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { BoneChainGeom } from '../rig/bones';

interface Props {
  data: BoneChainGeom | undefined | null;
  selected?: boolean;
  ghost?: boolean;
}

const YELLOW = '#f2c744';
const SEL = '#ffffff';
const GHOST = '#f5a742';

/** Build the classic 3ds Max bone shape: an elongated bipyramid along +X. */
function makeBoneGeom(length: number, width: number, height: number, taper: number): THREE.BufferGeometry {
  const w = width / 2;
  const h = height / 2;
  const tw = w * taper;
  const th = h * taper;
  // A double-pyramid (base at ~15% of length, tip at length, back-tip at 0).
  const b = Math.max(0.02, Math.min(length * 0.15, length * 0.5));

  const verts = new Float32Array([
    // back tip
    0, 0, 0,
    // 4 base corners (at x = b)
    b,  h,  w,
    b,  h, -w,
    b, -h, -w,
    b, -h,  w,
    // front tip (at x = length), tapered
    length, 0, 0,
  ]);

  const idx = new Uint16Array([
    // back pyramid (0 -> base)
    0, 2, 1,
    0, 3, 2,
    0, 4, 3,
    0, 1, 4,
    // front pyramid (5 -> base)
    5, 1, 2,
    5, 2, 3,
    5, 3, 4,
    5, 4, 1,
  ]);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

interface JointNodeProps {
  joints: any[];
  index: number;
  data: BoneChainGeom;
  color: string;
}

/** Recursive nested group — each joint carries its rotation, and children of
 *  that <group> are the next joint. This is what gives us FK for free. */
const JointNode = ({ joints, index, data, color }: JointNodeProps) => {
  const j = joints[index];
  const next = joints[index + 1];
  const segLen = next ? Math.hypot(next.pos[0], next.pos[1], next.pos[2]) : 0;

  const geom = useMemo(() => {
    if (!next || segLen < 1e-4) return null;
    return makeBoneGeom(segLen, data.width, data.height, data.taper);
  }, [next, segLen, data.width, data.height, data.taper]);

  return (
    <group position={j.pos} rotation={j.rot}>
      {geom && (
        <>
          <mesh geometry={geom}>
            <meshBasicMaterial color={color} transparent opacity={0.35} />
          </mesh>
          <lineSegments>
            <edgesGeometry args={[geom]} />
            <lineBasicMaterial color={color} />
          </lineSegments>
        </>
      )}
      {/* Joint dot (pivot marker) */}
      <mesh>
        <sphereGeometry args={[Math.max(data.width, data.height) * 0.35, 8, 6]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {next && <JointNode joints={joints} index={index + 1} data={data} color={color} />}
    </group>
  );
};

export const BoneChainGizmo = ({ data, selected, ghost }: Props) => {
  if (!data || !data.joints || data.joints.length === 0) return null;
  const color = ghost ? GHOST : selected ? SEL : YELLOW;
  return <JointNode joints={data.joints} index={0} data={data} color={color} />;
};
