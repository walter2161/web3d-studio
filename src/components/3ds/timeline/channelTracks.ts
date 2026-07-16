/**
 * Track View data model — a per-channel, keyframe-based representation
 * that mirrors 3ds Max's Motion Panel + Track View (Curve/Dope Sheet).
 *
 * Each track drives ONE scalar channel of ONE node:
 *   position.x / position.y / position.z
 *   rotation.x / rotation.y / rotation.z  (Euler XYZ, radians)
 *   scale.x / scale.y / scale.z
 *
 * `nodeUuid` is the uuid of the THREE.Object3D inside an imported model
 * (bone, mesh, group). When null the track drives the object root.
 */
import * as THREE from 'three';

export type TrackChannel = 'pos' | 'rot' | 'scale' | 'morph';
export type TrackAxis = 'x' | 'y' | 'z' | number;
export type TangentKind =
  | 'bezier' | 'linear' | 'step' | 'smooth' | 'fast' | 'slow';
export type OutOfRange =
  | 'constant' | 'loop' | 'cycle' | 'pingpong' | 'relativeRepeat';
export type ControllerKind = 'bezier' | 'linear' | 'tcb' | 'noise';

export interface ChannelKey {
  id: string;
  frame: number;
  value: number;
  inTan: TangentKind;
  outTan: TangentKind;
  /** Bezier handle offsets, in (frame,value) space. Only used for 'bezier'. */
  inHandle?: [number, number];
  outHandle?: [number, number];
}

export interface ChannelTrack {
  id: string;
  objectId: string;
  nodeUuid: string | null;
  nodeName: string;        // human label ("mixamorig:LeftArm")
  parentUuid: string | null; // for hierarchy in the tree
  channel: TrackChannel;
  axis: TrackAxis;
  keys: ChannelKey[];
  controller: ControllerKind;
  outOfRange: OutOfRange;
  muted?: boolean;
  solo?: boolean;
}

/** Baked-clip container attached to an imported Object3DData. */
export interface BakedClipSet {
  clipName: string;
  fps: number;
  frameStart: number;
  frameEnd: number;
  tracks: ChannelTrack[];
  /** Preserves the raw AnimationClip so tools like "reset" can rebake. */
  sourceClipIndex: number;
  /** Ordered node uuids that appear in this clip, for the hierarchy tree. */
  nodeOrder: string[];
  nodeParents: Record<string, string | null>;
  nodeNames: Record<string, string>;
}

// ---------- Bake ----------------------------------------------------------

/**
 * Sample a `THREE.AnimationClip` into per-channel keyframed tracks.
 * Rotations are converted from quaternion to Euler XYZ (radians) so they
 * match 3ds Max's "Rotation X/Y/Z" tracks and can be edited independently.
 */
export function bakeClipToTracks(
  clip: THREE.AnimationClip,
  clipIndex: number,
  root: THREE.Object3D,
  objectId: string,
  fps = 30,
): BakedClipSet {
  const dur = clip.duration;
  const frameEnd = Math.max(1, Math.round(dur * fps));
  const nodeOrder: string[] = [];
  const nodeParents: Record<string, string | null> = {};
  const nodeNames: Record<string, string> = {};
  const rootParent = root.parent;

  // Index nodes by name so we can resolve `TrackName` bindings.
  const byName = new Map<string, THREE.Object3D>();
  root.traverse((n) => {
    if (n.name) byName.set(n.name, n);
  });

  // Group KeyframeTracks by node so we can output cleanly-labeled channels.
  interface NodeBucket {
    node: THREE.Object3D;
    pos?: THREE.VectorKeyframeTrack;
    quat?: THREE.QuaternionKeyframeTrack;
    scale?: THREE.VectorKeyframeTrack;
  }
  const buckets = new Map<string, NodeBucket>();

  for (const t of clip.tracks) {
    const parsed = THREE.PropertyBinding.parseTrackName(t.name);
    // parsed.nodeName may be the mesh/bone name; if empty, target is root.
    const node =
      (parsed.nodeName && byName.get(parsed.nodeName)) || root;
    const key = node.uuid;
    let b = buckets.get(key);
    if (!b) {
      b = { node };
      buckets.set(key, b);
    }
    if (parsed.propertyName === 'position') b.pos = t as THREE.VectorKeyframeTrack;
    else if (parsed.propertyName === 'quaternion') b.quat = t as THREE.QuaternionKeyframeTrack;
    else if (parsed.propertyName === 'scale') b.scale = t as THREE.VectorKeyframeTrack;
  }

  const tracks: ChannelTrack[] = [];
  const stamp = Date.now();
  let seq = 0;

  const registerNode = (node: THREE.Object3D) => {
    if (nodeParents[node.uuid] !== undefined) return;
    nodeOrder.push(node.uuid);
    nodeNames[node.uuid] = node.name || node.type;
    const p = node.parent;
    nodeParents[node.uuid] =
      p && p !== rootParent ? p.uuid : null;
  };

  const sampleVector = (
    tr: THREE.VectorKeyframeTrack | undefined,
    fallback: THREE.Vector3,
  ): Array<[number, [number, number, number]]> => {
    if (!tr || tr.times.length === 0) return [];
    const out: Array<[number, [number, number, number]]> = [];
    for (let i = 0; i < tr.times.length; i++) {
      const time = tr.times[i];
      const frame = Math.round(time * fps);
      const off = i * 3;
      out.push([frame, [tr.values[off], tr.values[off + 1], tr.values[off + 2]]]);
    }
    return dedupeFrames(out);
  };

  const sampleQuaternionAsEuler = (
    tr: THREE.QuaternionKeyframeTrack | undefined,
  ): Array<[number, [number, number, number]]> => {
    if (!tr || tr.times.length === 0) return [];
    const q = new THREE.Quaternion();
    const e = new THREE.Euler(0, 0, 0, 'XYZ');
    let prev: [number, number, number] | null = null;
    const out: Array<[number, [number, number, number]]> = [];
    for (let i = 0; i < tr.times.length; i++) {
      const time = tr.times[i];
      const frame = Math.round(time * fps);
      const off = i * 4;
      q.set(tr.values[off], tr.values[off + 1], tr.values[off + 2], tr.values[off + 3]);
      e.setFromQuaternion(q, 'XYZ');
      // Unwrap Euler so successive frames don't jump ±π (avoids gimbal
      // flips in the Curve Editor). We adjust each axis by ±2π to keep it
      // continuous with the previous sample.
      const cur: [number, number, number] = [e.x, e.y, e.z];
      if (prev) {
        for (let k = 0; k < 3; k++) {
          while (cur[k] - prev[k] > Math.PI) cur[k] -= Math.PI * 2;
          while (cur[k] - prev[k] < -Math.PI) cur[k] += Math.PI * 2;
        }
      }
      prev = cur;
      out.push([frame, cur]);
    }
    return dedupeFrames(out);
  };

  buckets.forEach((b) => {
    registerNode(b.node);
    // register ancestors up to root so parent chain shows in the tree
    let cur: THREE.Object3D | null = b.node.parent;
    while (cur && cur !== rootParent) {
      registerNode(cur);
      cur = cur.parent;
    }

    const pos = sampleVector(b.pos, b.node.position);
    const scale = sampleVector(b.scale, b.node.scale);
    const rot = sampleQuaternionAsEuler(b.quat);

    const makeChan = (
      channel: TrackChannel,
      axis: TrackAxis,
      samples: Array<[number, [number, number, number]]>,
      axisIdx: number,
    ) => {
      if (samples.length === 0) return;
      const controller: ControllerKind = 'bezier';
      const keys: ChannelKey[] = samples.map(([frame, v]) => ({
        id: `k_${stamp}_${seq++}`,
        frame,
        value: v[axisIdx],
        inTan: 'smooth',
        outTan: 'smooth',
      }));
      tracks.push({
        id: `${objectId}:${b.node.uuid}:${channel}:${axis}`,
        objectId,
        nodeUuid: b.node.uuid,
        nodeName: b.node.name || b.node.type,
        parentUuid: nodeParents[b.node.uuid] ?? null,
        channel,
        axis,
        keys,
        controller,
        outOfRange: 'constant',
      });
    };
    (['x','y','z'] as const).forEach((a, i) => {
      makeChan('pos', a, pos, i);
      makeChan('rot', a, rot, i);
      makeChan('scale', a, scale, i);
    });
  });

  return {
    clipName: clip.name || `Clip ${clipIndex + 1}`,
    fps,
    frameStart: 0,
    frameEnd,
    tracks,
    sourceClipIndex: clipIndex,
    nodeOrder,
    nodeParents,
    nodeNames,
  };
}

function dedupeFrames(
  arr: Array<[number, [number, number, number]]>,
): Array<[number, [number, number, number]]> {
  const map = new Map<number, [number, number, number]>();
  for (const [f, v] of arr) map.set(f, v);
  return Array.from(map.entries()).sort((a, b) => a[0] - b[0]) as any;
}

// ---------- Sampler -------------------------------------------------------

/**
 * Evaluate a track at a given frame. Respects out-of-range types and each
 * key's tangent kind (bezier/linear/step/smooth/fast/slow).
 */
export function sampleTrack(track: ChannelTrack, frame: number): number {
  const keys = track.keys;
  if (keys.length === 0) return 0;
  if (keys.length === 1) return keys[0].value;

  const first = keys[0];
  const last = keys[keys.length - 1];
  const range = last.frame - first.frame;

  let f = frame;
  if (frame < first.frame || frame > last.frame) {
    if (range <= 0) return first.value;
    switch (track.outOfRange) {
      case 'constant':
        return frame < first.frame ? first.value : last.value;
      case 'loop':
      case 'cycle': {
        // Repeat identically.
        let n = ((frame - first.frame) % range + range) % range;
        f = first.frame + n;
        break;
      }
      case 'pingpong': {
        const period = range * 2;
        let n = ((frame - first.frame) % period + period) % period;
        if (n > range) n = period - n;
        f = first.frame + n;
        break;
      }
      case 'relativeRepeat': {
        const cycles = Math.floor((frame - first.frame) / range);
        const delta = (last.value - first.value) * cycles;
        let n = ((frame - first.frame) % range + range) % range;
        f = first.frame + n;
        return interpKeys(keys, f) + delta;
      }
    }
  }
  return interpKeys(keys, f);
}

function interpKeys(keys: ChannelKey[], frame: number): number {
  // Binary search for the segment.
  let lo = 0, hi = keys.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].frame <= frame) lo = mid; else hi = mid;
  }
  const a = keys[lo];
  const b = keys[hi];
  if (frame <= a.frame) return a.value;
  if (frame >= b.frame) return b.value;
  const span = b.frame - a.frame;
  const t = span > 0 ? (frame - a.frame) / span : 0;

  // Kind picked by A's outTan (going out) — matches 3ds Max convention.
  const kind = a.outTan;
  switch (kind) {
    case 'step':
      return a.value;
    case 'linear':
      return a.value + (b.value - a.value) * t;
    case 'fast':
      return a.value + (b.value - a.value) * (t * t);
    case 'slow':
      return a.value + (b.value - a.value) * (1 - (1 - t) * (1 - t));
    case 'smooth':
      return a.value + (b.value - a.value) * (t * t * (3 - 2 * t));
    case 'bezier': {
      // Cubic Bezier in value axis with automatic time-preserving handles.
      const h1 = a.outHandle?.[1] ?? (b.value - a.value) * 0.33;
      const h2 = b.inHandle?.[1] ?? (a.value - b.value) * 0.33;
      const p0 = a.value;
      const p1 = a.value + h1;
      const p2 = b.value + h2;
      const p3 = b.value;
      const it = 1 - t;
      return it*it*it*p0 + 3*it*it*t*p1 + 3*it*t*t*p2 + t*t*t*p3;
    }
  }
  return a.value;
}

/**
 * Apply a full BakedClipSet to a scene root at the given frame. Used by
 * Object3D's per-frame driver to override the AnimationMixer once the user
 * has baked a clip into editable tracks.
 */
export function applyBakedSet(
  set: BakedClipSet,
  root: THREE.Object3D,
  frame: number,
) {
  // Group by nodeUuid and channel for one write per node.
  const perNode = new Map<string, {
    node: THREE.Object3D;
    pos: [number, number, number] | null;
    rot: [number, number, number] | null;
    scale: [number, number, number] | null;
    posMask: [boolean, boolean, boolean];
    rotMask: [boolean, boolean, boolean];
    scaleMask: [boolean, boolean, boolean];
  }>();

  // Lookup nodes by uuid once.
  const nodeByUuid = new Map<string, THREE.Object3D>();
  root.traverse((n) => { nodeByUuid.set(n.uuid, n); });

  // Solo check: if any track is soloed, mute all others.
  const anySolo = set.tracks.some((t) => t.solo);

  for (const t of set.tracks) {
    if (t.muted) continue;
    if (anySolo && !t.solo) continue;
    const node = t.nodeUuid ? nodeByUuid.get(t.nodeUuid) : root;
    if (!node) continue;
    let bucket = perNode.get(node.uuid);
    if (!bucket) {
      bucket = {
        node,
        pos: [node.position.x, node.position.y, node.position.z],
        rot: [node.rotation.x, node.rotation.y, node.rotation.z],
        scale: [node.scale.x, node.scale.y, node.scale.z],
        posMask: [false, false, false],
        rotMask: [false, false, false],
        scaleMask: [false, false, false],
      };
      perNode.set(node.uuid, bucket);
    }
    const v = sampleTrack(t, frame);
    const idx = t.axis === 'x' ? 0 : t.axis === 'y' ? 1 : t.axis === 'z' ? 2 : 0;
    if (t.channel === 'pos') { bucket.pos![idx] = v; bucket.posMask[idx] = true; }
    else if (t.channel === 'rot') { bucket.rot![idx] = v; bucket.rotMask[idx] = true; }
    else if (t.channel === 'scale') { bucket.scale![idx] = v; bucket.scaleMask[idx] = true; }
  }

  perNode.forEach((b) => {
    if (b.posMask.some(Boolean)) b.node.position.set(b.pos![0], b.pos![1], b.pos![2]);
    if (b.rotMask.some(Boolean)) b.node.rotation.set(b.rot![0], b.rot![1], b.rot![2]);
    if (b.scaleMask.some(Boolean)) b.node.scale.set(b.scale![0], b.scale![1], b.scale![2]);
  });
  root.updateMatrixWorld(true);
  root.traverse((n: any) => {
    if (n.isSkinnedMesh && n.skeleton) n.skeleton.update();
  });
}

// ---------- Clip tools (Mixamo-friendly) ---------------------------------

/** Mirror Left/Right bones (Mixamo naming) by swapping tracks and negating x. */
export function mirrorLR(set: BakedClipSet): BakedClipSet {
  const swap = (name: string): string | null => {
    const m1 = name.match(/(.*?)(Left|LEFT|_L|\.L)(.*)/);
    const m2 = name.match(/(.*?)(Right|RIGHT|_R|\.R)(.*)/);
    if (m1) return m1[1] + m1[2].replace(/Left|LEFT|_L|\.L/, (s) =>
      s === 'Left' ? 'Right' : s === 'LEFT' ? 'RIGHT' : s === '_L' ? '_R' : '.R'
    ) + m1[3];
    if (m2) return m2[1] + m2[2].replace(/Right|RIGHT|_R|\.R/, (s) =>
      s === 'Right' ? 'Left' : s === 'RIGHT' ? 'LEFT' : s === '_R' ? '_L' : '.L'
    ) + m2[3];
    return null;
  };
  // Group tracks by (nodeName -> channel -> axis)
  const key = (nodeName: string, ch: TrackChannel, ax: TrackAxis) => `${nodeName}|${ch}|${ax}`;
  const byKey = new Map<string, ChannelTrack>();
  for (const t of set.tracks) byKey.set(key(t.nodeName, t.channel, t.axis), t);

  const next: ChannelTrack[] = set.tracks.map((t) => {
    const partner = swap(t.nodeName);
    const src = partner ? (byKey.get(key(partner, t.channel, t.axis)) ?? t) : t;
    // Negate X-axis position and Y/Z rotation to reflect across YZ plane.
    const invert =
      (t.channel === 'pos' && t.axis === 'x') ||
      (t.channel === 'rot' && (t.axis === 'y' || t.axis === 'z'));
    const keys = src.keys.map((k) => ({
      ...k,
      id: `${k.id}_m`,
      value: invert ? -k.value : k.value,
    }));
    return { ...t, keys };
  });
  return { ...set, tracks: next };
}

/** Uniformly scale every keyframe's time by `factor`. */
export function retime(set: BakedClipSet, factor: number): BakedClipSet {
  if (factor <= 0 || factor === 1) return set;
  const tracks = set.tracks.map((t) => ({
    ...t,
    keys: t.keys.map((k) => ({ ...k, frame: Math.round(k.frame * factor) })),
  }));
  return {
    ...set,
    tracks,
    frameEnd: Math.round(set.frameEnd * factor),
  };
}

/** Blend the first and last frame of every track so the loop closes cleanly. */
export function loopCyclic(set: BakedClipSet): BakedClipSet {
  const tracks = set.tracks.map((t) => {
    if (t.keys.length < 2) return t;
    const first = t.keys[0];
    const last = t.keys[t.keys.length - 1];
    const avg = (first.value + last.value) / 2;
    return {
      ...t,
      outOfRange: 'cycle' as const,
      keys: [
        { ...first, value: avg },
        ...t.keys.slice(1, -1),
        { ...last, value: avg },
      ],
    };
  });
  return { ...set, tracks };
}

/** Zero-out root Hips.position tracks so the character stays in place. */
export function toggleInPlace(set: BakedClipSet, rootBoneRegex = /Hips|root|Bip01$/i): BakedClipSet {
  const tracks = set.tracks.map((t) => {
    if (t.channel !== 'pos') return t;
    if (!rootBoneRegex.test(t.nodeName)) return t;
    // Toggle: if all keys are 0, leave alone (already flat); otherwise zero.
    const allZero = t.keys.every((k) => Math.abs(k.value) < 1e-6);
    if (allZero) return t;
    return { ...t, keys: t.keys.map((k) => ({ ...k, value: 0 })) };
  });
  return { ...set, tracks };
}

/** Restrict every track's keys to [start,end] frames, remapping to 0. */
export function trimRange(set: BakedClipSet, start: number, end: number): BakedClipSet {
  if (end <= start) return set;
  const tracks = set.tracks.map((t) => ({
    ...t,
    keys: t.keys
      .filter((k) => k.frame >= start && k.frame <= end)
      .map((k) => ({ ...k, frame: k.frame - start })),
  }));
  return { ...set, tracks, frameStart: 0, frameEnd: end - start };
}

/** Offset every keyframe of a given nodeUuid rotation channel by delta rad. */
export function offsetBoneRotation(
  set: BakedClipSet,
  nodeUuid: string,
  delta: [number, number, number],
): BakedClipSet {
  const tracks = set.tracks.map((t) => {
    if (t.nodeUuid !== nodeUuid || t.channel !== 'rot') return t;
    const idx = t.axis === 'x' ? 0 : t.axis === 'y' ? 1 : 2;
    if (Math.abs(delta[idx]) < 1e-9) return t;
    return { ...t, keys: t.keys.map((k) => ({ ...k, value: k.value + delta[idx] })) };
  });
  return { ...set, tracks };
}
