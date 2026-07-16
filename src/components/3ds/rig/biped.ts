/**
 * Biped — simplified 3ds Max Character Studio Biped builder.
 *
 * Given a target height, produces a set of pre-connected `bone_chain`
 * geometries covering the classic Bip01 skeleton:
 *
 *   Pelvis → Spine01 → Spine02 → Neck → Head
 *   Clavicle L/R → UpperArm → Forearm → Hand
 *   Thigh L/R → Calf → Foot
 *
 * Each returned entry is ready to be dropped into the scene as its own
 * Object3DData of type 'bone_chain'. This is intentionally a *set of chains*,
 * not one giant chain — that matches how Max structures the Biped and lets us
 * add IK per limb in a later phase.
 */

import { buildBoneChainFromPoints } from './bones';

export interface BipedPart {
  name: string;
  position: [number, number, number];
  geometry: any;
}

/**
 * Build the biped from a total height. Proportions are the classic 7½-head
 * canon: pelvis at ~54% of height, spine two-thirds up to shoulders at ~82%,
 * neck to top-of-head over the remaining 18%, arms hang to mid-thigh, legs
 * span from pelvis down to the floor.
 */
export function buildBiped(height: number, origin: [number, number, number] = [0, 0, 0]): BipedPart[] {
  const H = Math.max(0.5, height);
  const [ox, oy, oz] = origin;

  // Vertical landmarks (Y up, floor at oy = 0).
  const yFloor = oy;
  const yPelvis = oy + H * 0.54;
  const ySpine1 = oy + H * 0.62;
  const ySpine2 = oy + H * 0.72;
  const yShoulder = oy + H * 0.82;
  const yNeck = oy + H * 0.87;
  const yHead = oy + H * 0.93;
  const yHeadTop = oy + H * 1.0;
  const yKnee = oy + H * 0.27;
  const yElbow = oy + H * 0.62;
  const yWrist = oy + H * 0.42;

  // Horizontal offsets.
  const shoulderX = H * 0.11;
  const hipX = H * 0.06;

  const parts: BipedPart[] = [];

  const pushChain = (name: string, pts: [number, number, number][]) => {
    const worldPts = pts.map((p) => [p[0] + ox, p[1], p[2] + oz] as [number, number, number]);
    const { position, geometry } = buildBoneChainFromPoints(worldPts);
    parts.push({ name, position, geometry: { ...geometry, width: H * 0.03, height: H * 0.03 } });
  };

  // Spine + head.
  pushChain('Bip01_Spine', [
    [0, yPelvis, 0],
    [0, ySpine1, 0],
    [0, ySpine2, 0],
    [0, yShoulder, 0],
    [0, yNeck, 0],
    [0, yHead, 0],
    [0, yHeadTop, 0],
  ]);

  // Arms.
  for (const side of [-1, 1] as const) {
    const s = side; // -1 left (from viewer), +1 right
    pushChain(s < 0 ? 'Bip01_L_Arm' : 'Bip01_R_Arm', [
      [0, yShoulder, 0],
      [s * shoulderX, yShoulder, 0],       // clavicle → shoulder
      [s * (shoulderX + H * 0.15), yElbow, 0], // upper arm → elbow
      [s * (shoulderX + H * 0.20), yWrist, 0], // forearm → wrist
      [s * (shoulderX + H * 0.24), yWrist - H * 0.05, 0], // hand tip
    ]);
  }

  // Legs.
  for (const side of [-1, 1] as const) {
    const s = side;
    pushChain(s < 0 ? 'Bip01_L_Leg' : 'Bip01_R_Leg', [
      [s * hipX, yPelvis, 0],       // hip
      [s * hipX, yKnee, 0],         // knee
      [s * hipX, yFloor + H * 0.02, 0], // ankle
      [s * hipX, yFloor + H * 0.01, H * 0.08], // toe
    ]);
  }

  return parts;
}
