/**
 * BoneChainGizmo — renders a 3ds Max-style bone chain.
 *
 * Each joint is a nested <group> carrying that joint's local rotation, and
 * the segment (from that joint to the next) is drawn as an elongated
 * "pyramid+cap" pointing along local +X. Nested grouping gives free FK: a
 * rotation on joint N automatically drags joint N+1 and beyond.
 *
 * Each joint sphere is clickable to sub-select the joint — the parent
 * Studio3D then attaches TransformControls (rotate) to that specific joint,
 * so rotating one joint moves only its children (FK).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { BoneChainGeom } from '../rig/bones';
import {
  BoneJointSelection,
  setJointObject,
  setSelectedJoint,
  getSelectedJoint,
  subscribeSelectedJoint,
} from '../rig/boneJointRegistry';

interface Props {
  data: BoneChainGeom | undefined | null;
  selected?: boolean;
  ghost?: boolean;
  objectId?: string;
}

const YELLOW = '#f2c744';
const SEL = '#ffffff';
const GHOST = '#f5a742';
const JOINT_SEL = '#c72c2c';

/** Build the classic 3ds Max bone shape: an elongated bipyramid along +X. */
function makeBoneGeom(length: number, width: number, height: number, taper: number): THREE.BufferGeometry {
  const w = width / 2;
  const h = height / 2;
  const b = Math.max(0.02, Math.min(length * 0.15, length * 0.5));

  const verts = new Float32Array([
    0, 0, 0,
    b,  h,  w,
    b,  h, -w,
    b, -h, -w,
    b, -h,  w,
    length, 0, 0,
  ]);

  const idx = new Uint16Array([
    0, 2, 1,  0, 3, 2,  0, 4, 3,  0, 1, 4,
    5, 1, 2,  5, 2, 3,  5, 3, 4,  5, 4, 1,
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
  objectId?: string;
  selectedJointIndex: number | null;
  ghost?: boolean;
}

/** Recursive nested group — each joint carries its rotation, and children of
 *  that <group> are the next joint. This is what gives us FK for free. */
const JointNode = ({ joints, index, data, color, objectId, selectedJointIndex, ghost }: JointNodeProps) => {
  const j = joints[index];
  const next = joints[index + 1];
  const segLen = next ? Math.hypot(next.pos[0], next.pos[1], next.pos[2]) : 0;
  const groupRef = useRef<THREE.Group>(null);

  const geom = useMemo(() => {
    if (!next || segLen < 1e-4) return null;
    return makeBoneGeom(segLen, data.width, data.height, data.taper);
  }, [next, segLen, data.width, data.height, data.taper]);

  // Register this joint's <group> in the module registry so Scene3D can attach
  // TransformControls to it when the user sub-selects a joint.
  useEffect(() => {
    if (!objectId || ghost) return;
    const key = `${objectId}:${index}`;
    setJointObject(key, groupRef.current);
    return () => { setJointObject(key, null); };
  }, [objectId, index, ghost]);

  const isSelectedJoint = !ghost && selectedJointIndex === index;
  const boneColor = isSelectedJoint ? JOINT_SEL : color;
  const jointColor = isSelectedJoint ? JOINT_SEL : color;

  const onBonePartPick = (e: any) => {
    if (ghost || !objectId) return;
    e.stopPropagation();
    const cur = getSelectedJoint();
    // Always ensure the parent chain object itself is selected — otherwise
    // Scene3D would keep the gizmo attached to the chain root and moving one
    // joint would look like moving the whole chain.
    window.dispatchEvent(new CustomEvent('r3-bone-joint-pick', {
      detail: { objectId, jointIndex: index },
    }));
    if (cur && cur.objectId === objectId && cur.jointIndex === index) {
      setSelectedJoint(null);
    } else {
      setSelectedJoint({ objectId, jointIndex: index });
    }
  };

  return (
    <group ref={groupRef} position={j.pos} rotation={j.rot}>
      {geom && (
        <>
          <mesh geometry={geom} onClick={onBonePartPick}>
            <meshBasicMaterial color={boneColor} transparent opacity={isSelectedJoint ? 0.72 : 0.35} />
          </mesh>
          <lineSegments onClick={onBonePartPick}>
            <edgesGeometry args={[geom]} />
            <lineBasicMaterial color={boneColor} />
          </lineSegments>
        </>
      )}
      {/* Joint dot (pivot marker) — clickable to sub-select the joint. */}
      <mesh onClick={onBonePartPick}>
        <sphereGeometry args={[Math.max(data.width, data.height) * (isSelectedJoint ? 0.55 : 0.4), 12, 8]} />
        <meshBasicMaterial color={jointColor} />
      </mesh>
      {next && (
        <JointNode
          joints={joints}
          index={index + 1}
          data={data}
          color={color}
          objectId={objectId}
          selectedJointIndex={selectedJointIndex}
          ghost={ghost}
        />
      )}
    </group>
  );
};

export const BoneChainGizmo = ({ data, selected, ghost, objectId }: Props) => {
  // Live selection so the red-wine highlight updates the instant the user
  // clicks a joint — without this, only Scene3D re-rendered on subscription.
  const [sel, setSel] = useState<BoneJointSelection | null>(getSelectedJoint());
  useEffect(() => subscribeSelectedJoint(setSel), []);

  if (!data || !data.joints || data.joints.length === 0) return null;
  const color = ghost ? GHOST : selected ? SEL : YELLOW;
  const selectedJointIndex = sel && sel.objectId === objectId ? sel.jointIndex : null;
  return (
    <JointNode
      joints={data.joints}
      index={0}
      data={data}
      color={color}
      objectId={objectId}
      selectedJointIndex={selectedJointIndex}
      ghost={ghost}
    />
  );
};
