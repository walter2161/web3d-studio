/**
 * Bones — 3ds Max-style Systems → Bones.
 *
 * A "bone chain" is stored as a single Object3DData of type 'bone_chain'. Its
 * geometry carries an ordered list of joints, each with a local rotation. The
 * renderer nests <group>s so rotating joint N automatically drags joint N+1
 * and everything beyond it — that's native Forward Kinematics.
 *
 * Individual joint editing is planned; for Fase 1 the chain is selected as a
 * whole and animated via joint rotations set programmatically or by IK.
 */

export interface BoneJoint {
  /** Local offset from previous joint (in metres). joints[0].pos is the
   *  chain's own pivot at the origin. */
  pos: [number, number, number];
  /** Local rotation (radians, XYZ Euler). Drives FK. */
  rot: [number, number, number];
  /** Optional display width override for this segment. */
  width?: number;
}

export interface BoneChainGeom {
  boneKind: 'chain';
  joints: BoneJoint[];
  /** Default segment width — used when joint.width is undefined. */
  width: number;
  /** Segment height (thickness perpendicular to length). */
  height: number;
  /** Tip taper factor 0..1. 1 = no taper, 0.2 = sharp point. */
  taper: number;
  /** Show fins (side flanges). */
  fins: boolean;
  /** IK target — optional world-space position that pulls the tip. */
  ikTarget?: [number, number, number];
  ikEnabled?: boolean;
  /** Which joint indices are the IK chain (defaults to entire chain). */
  ikChain?: [number, number]; // [startIdx, endIdx]
  /** IK/FK blend 0..1. 0 = FK only, 1 = IK only. */
  ikBlend?: number;
}

export const BONE_DEFAULTS: BoneChainGeom = {
  boneKind: 'chain',
  joints: [],
  width: 0.08,
  height: 0.08,
  taper: 0.5,
  fins: false,
  ikEnabled: false,
  ikBlend: 1,
};

/**
 * Build a bone chain geometry from an ordered list of world-space points.
 * The first point becomes the chain pivot; subsequent points become joints
 * whose `pos` is the delta from the previous joint after aligning each
 * segment along its own +X axis (3ds Max bone convention).
 *
 * The resulting rotations point each parent joint toward its child so the
 * bone visuals extend along +X locally.
 */
export function buildBoneChainFromPoints(points: [number, number, number][]): {
  position: [number, number, number];
  geometry: BoneChainGeom;
} {
  if (points.length < 2) {
    return {
      position: points[0] ?? [0, 0, 0],
      geometry: { ...BONE_DEFAULTS, joints: [{ pos: [0, 0, 0], rot: [0, 0, 0] }] },
    };
  }

  const [x0, y0, z0] = points[0];
  const joints: BoneJoint[] = [];

  // Compute per-segment yaw/pitch so bone renders extend along local +X. We
  // encode each joint's rotation relative to its parent so rotating joint i
  // affects everything from i onward.
  let prevYaw = 0;
  let prevPitch = 0;

  for (let i = 0; i < points.length; i++) {
    if (i === 0) {
      // Root joint — its rotation aims at joint 1.
      if (points.length > 1) {
        const dx = points[1][0] - points[0][0];
        const dy = points[1][1] - points[0][1];
        const dz = points[1][2] - points[0][2];
        const len = Math.hypot(dx, dy, dz) || 1;
        const yaw = Math.atan2(-dz, dx); // rotation about Y
        const pitch = Math.asin(Math.max(-1, Math.min(1, dy / len))); // rotation about Z
        joints.push({ pos: [0, 0, 0], rot: [0, yaw, pitch] });
        prevYaw = yaw;
        prevPitch = pitch;
      } else {
        joints.push({ pos: [0, 0, 0], rot: [0, 0, 0] });
      }
    } else {
      const dx = points[i][0] - points[i - 1][0];
      const dy = points[i][1] - points[i - 1][1];
      const dz = points[i][2] - points[i - 1][2];
      const len = Math.hypot(dx, dy, dz) || 0.001;

      if (i < points.length - 1) {
        // This joint aims at the NEXT point. Compute its world yaw/pitch,
        // then encode it relative to the parent's world orientation.
        const dxN = points[i + 1][0] - points[i][0];
        const dyN = points[i + 1][1] - points[i][1];
        const dzN = points[i + 1][2] - points[i][2];
        const lenN = Math.hypot(dxN, dyN, dzN) || 1;
        const yawW = Math.atan2(-dzN, dxN);
        const pitchW = Math.asin(Math.max(-1, Math.min(1, dyN / lenN)));
        const relYaw = yawW - prevYaw;
        const relPitch = pitchW - prevPitch;
        joints.push({ pos: [len, 0, 0], rot: [0, relYaw, relPitch] });
        prevYaw = yawW;
        prevPitch = pitchW;
      } else {
        // Tip — no further child. Just extend along parent's +X.
        joints.push({ pos: [len, 0, 0], rot: [0, 0, 0] });
      }
    }
  }

  return {
    position: [x0, y0, z0],
    geometry: { ...BONE_DEFAULTS, joints },
  };
}

/** True if the given Object3DData is a bone-chain. */
export const isBoneType = (t: string) => t === 'bone_chain';
