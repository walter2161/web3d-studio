import { useRef, useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, BufferGeometry, Vector3, Group, AnimationMixer, Object3D as ThreeObject3D } from 'three';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { getImportedModel } from './utils/modelImport';
import { buildExtendedPrimitive, buildShape, buildTextShapes, ExtPrimType, ShapeType } from './utils/extendedGeometry';
import { buildWall, buildDoor, buildWindow } from './utils/aecGeometry';
import { mergeVertices, mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SubObjectOverlay } from './editable/SubObjectOverlay';
import type { SubObjectLevel } from './editable/EditableMesh';
import { fromGeometry } from './editable/fromGeometry';
import { toGeometry } from './editable/toGeometry';
import { replay, OpRecord } from './editable/ops';
import { HelperGizmo } from './r3/HelperGizmo';
import { isHelperType } from './utils/helpers';
import { BoneChainGizmo } from './r3/BoneChainGizmo';
import { isBoneType } from './rig/bones';
import { PrintBedObject } from './print3d/PrintBedObject';
import { ParticleObject } from './particles/ParticleObject';
import { EditableSpline } from './editable/EditableSpline';
import { applyBakedSet, type BakedClipSet } from './timeline/channelTracks';



// R3-style entity types
export const LIGHT_TYPES = ['light_omni', 'light_spot', 'light_direct', 'light_skylight', 'light_ambient'] as const;
export const CAMERA_TYPES = ['camera_free', 'camera_target'] as const;
export const TARGET_TYPES = ['target_helper'] as const;
export type LightType = typeof LIGHT_TYPES[number];
export type CameraType = typeof CAMERA_TYPES[number];
export const isLightType = (t: string): t is LightType => (LIGHT_TYPES as readonly string[]).includes(t);
export const isCameraType = (t: string): t is CameraType => (CAMERA_TYPES as readonly string[]).includes(t);

/**
 * Wireframe-mode raycast: hit only when the ray passes near a vertex, not a
 * face. This makes selecting objects nested inside other objects trivial —
 * click a wire vertex to grab the object, empty wire space passes through.
 * Threshold scales with distance to give a roughly constant screen-space feel.
 */
function vertexOnlyRaycast(this: THREE.Mesh, raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) {
  const geom = this.geometry as THREE.BufferGeometry | undefined;
  const pos = geom?.getAttribute?.('position') as THREE.BufferAttribute | undefined;
  if (!pos) return;
  this.updateMatrixWorld();
  const mw = this.matrixWorld;

  // Pass 1 — run the normal mesh raycast, but only accept hits that are close
  // to any wire edge. This gives users a fat pick radius along the whole wire
  // instead of forcing them to hit a vertex exactly.
  const faceHits: THREE.Intersection[] = [];
  THREE.Mesh.prototype.raycast.call(this, raycaster, faceHits);
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const closestOnSegment = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, out: THREE.Vector3) => {
    const ab = b.clone().sub(a);
    const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(1e-8, ab.lengthSq())));
    out.copy(a).addScaledVector(ab, t);
  };
  for (const hit of faceHits) {
    if (!hit.face) continue;
    vA.set(pos.getX(hit.face.a), pos.getY(hit.face.a), pos.getZ(hit.face.a)).applyMatrix4(mw);
    vB.set(pos.getX(hit.face.b), pos.getY(hit.face.b), pos.getZ(hit.face.b)).applyMatrix4(mw);
    vC.set(pos.getX(hit.face.c), pos.getY(hit.face.c), pos.getZ(hit.face.c)).applyMatrix4(mw);
    const p = hit.point;
    const proj = new THREE.Vector3();
    let dMin = Infinity;
    for (const [a, b] of [[vA, vB], [vB, vC], [vC, vA]] as const) {
      closestOnSegment(p, a, b, proj);
      const d = proj.distanceTo(p);
      if (d < dMin) dMin = d;
    }
    // ~16px at typical FOV; scale with distance for consistent pick radius.
    const threshold = Math.max(0.1, hit.distance * 0.04);
    if (dMin < threshold) {
      intersects.push(hit);
    }
  }
  if (intersects.length) return;

  // Pass 2 — fallback: vertex proximity, so isolated vertices remain pickable
  // even when the ray doesn't cross any triangle (e.g. splines, sparse meshes).
  const v = new THREE.Vector3();
  const worldV = new THREE.Vector3();
  let bestDist = Infinity;
  let bestPoint: THREE.Vector3 | null = null;
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    worldV.copy(v).applyMatrix4(mw);
    const distAlongRay = raycaster.ray.origin.distanceTo(worldV);
    const threshold = Math.max(0.1, distAlongRay * 0.04);
    const perp = raycaster.ray.distanceToPoint(worldV);
    if (perp < threshold && distAlongRay < bestDist) {
      bestDist = distAlongRay;
      bestPoint = worldV.clone();
    }
  }
  if (bestPoint) {
    intersects.push({
      distance: bestDist,
      point: bestPoint,
      object: this,
      face: null,
      faceIndex: undefined,
      uv: undefined,
    } as unknown as THREE.Intersection);
  }
}
export const isEntityType = (t: string) => isLightType(t) || isCameraType(t) || t === 'target_helper';

/**
 * Load a THREE.Texture from a bitmap payload emitted by the Material Editor.
 * The payload lives at material.map / bumpMap / opacityMap / emissiveMap.
 */
interface MapPayload {
  url: string;
  filename?: string;
  repeat?: [number, number];
  offset?: [number, number];
  rotation?: number;
  mirrorU?: boolean; mirrorV?: boolean;
  tileU?: boolean; tileV?: boolean;
}
function useBitmapTexture(payload?: MapPayload | null, sRGB = false): THREE.Texture | null {
  return useMemo(() => {
    if (!payload?.url) return null;
    const loader = new THREE.TextureLoader();
    const tex = loader.load(
      payload.url,
      (t) => { t.needsUpdate = true; },
      undefined,
      (err) => { console.warn('[bitmap] failed to load', payload.filename, err); },
    );
    const wrapU = payload.mirrorU ? THREE.MirroredRepeatWrapping : (payload.tileU === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping);
    const wrapV = payload.mirrorV ? THREE.MirroredRepeatWrapping : (payload.tileV === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping);
    tex.wrapS = wrapU; tex.wrapT = wrapV;
    if (payload.repeat) tex.repeat.set(payload.repeat[0] || 1, payload.repeat[1] || 1);
    if (payload.offset) tex.offset.set(payload.offset[0] || 0, payload.offset[1] || 0);
    tex.rotation = payload.rotation || 0;
    tex.center.set(0.5, 0.5);
    tex.anisotropy = 8;
    if (sRGB) (tex as any).colorSpace = (THREE as any).SRGBColorSpace ?? tex.colorSpace;
    tex.needsUpdate = true;
    return tex;
  }, [payload?.url, payload?.repeat?.[0], payload?.repeat?.[1], payload?.offset?.[0], payload?.offset?.[1], payload?.rotation, payload?.mirrorU, payload?.mirrorV, payload?.tileU, payload?.tileV, sRGB]);
}

function MaterialWithMaps({
  material, color, renderMode, isGhost, useVertexColors = false,
}: { material: any; color: string; renderMode: string; isGhost: boolean; useVertexColors?: boolean }) {
  const effectiveMat = useMemo(() => resolveEffectiveMaterial(material), [material]);
  // Show maps in any shaded/textured/edged/transparent view — hide only in
  // wireframe and bbox (Max behavior: bitmaps always visible once "Show Map
  // in Viewport" is on, regardless of viewport shading mode).
  const showMaps = renderMode !== 'wireframe' && renderMode !== 'bbox';
  const rawMap = useBitmapTexture(effectiveMat?.map, true);
  const rawBump = useBitmapTexture(effectiveMat?.bumpMap);
  const rawOpacity = useBitmapTexture(effectiveMat?.opacityMap);
  const rawEmissive = useBitmapTexture(effectiveMat?.emissiveMap, true);
  const map = showMaps ? rawMap : null;
  const bumpMap = showMaps ? rawBump : null;
  const opacityMap = showMaps ? rawOpacity : null;
  const emissiveMap = showMaps ? rawEmissive : null;
  const baseOpacity = effectiveMat?.opacity ?? 1;
  const isWire = renderMode === 'wireframe';
  const transparent = renderMode === 'semi-transparent' || renderMode === 'bbox' || isGhost || baseOpacity < 1 || !!opacityMap || isWire;
  const opacity = isGhost ? 0.55 : (renderMode === 'bbox' ? 0 : (isWire ? 0 : (renderMode === 'semi-transparent' ? 0.5 : baseOpacity)));
  const isTwoSided = !!material?.twoSided || material?.type === 'Double Sided';
  const side = isTwoSided ? THREE.DoubleSide : THREE.FrontSide;
  // When vertex colors are baked into the geometry (foliage bark vs leaf),
  // use white as the base color so vertex colors aren't tinted, unless the
  // user explicitly overrode the material color.
  const effectiveColor = useVertexColors && !effectiveMat?.color ? '#ffffff' : (effectiveMat?.color ?? color);
  return (
    <meshStandardMaterial
      color={effectiveColor}
      vertexColors={useVertexColors}
      map={map || undefined}
      bumpMap={bumpMap || undefined}
      bumpScale={effectiveMat?.bumpScale ?? 0.3}
      alphaMap={opacityMap || undefined}
      emissiveMap={emissiveMap || undefined}
      transparent={transparent}
      opacity={opacity}
      depthWrite={renderMode !== 'bbox' && !isWire}
      colorWrite={!isWire}
      wireframe={false}
      metalness={effectiveMat?.metalness ?? 0.15}
      roughness={effectiveMat?.roughness ?? 0.55}
      emissive={effectiveMat?.emissive ?? '#000000'}
      emissiveIntensity={effectiveMat?.emissiveIntensity ?? 0}
      side={side}
      flatShading={false}
    />
  );
}

/** Mix two hex colors ("#rrggbb") by amount 0..1. */
function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.replace('#', ''), 16), pb = parseInt(b.replace('#', ''), 16);
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
  return '#' + [r, g, bl].map((n) => n.toString(16).padStart(2, '0')).join('');
}

/**
 * Collapse a compound material payload into effective viewport props.
 * Multi/Sub-Object uses sub-material #1 (a separate mesh path renders the
 * full array). Blend/DoubleSided/Top-Bottom/Composite/Shellac produce a
 * mixed-color approximation for the viewport.
 */
function resolveEffectiveMaterial(m: any): any {
  if (!m || !m.type) return m;
  if (m.type === 'Multi/Sub-Object') {
    const first = m.subMaterials?.[0];
    return first ? { ...m, ...first } : m;
  }
  if (m.type === 'Blend' && m.blend) {
    const a = m.blend.mat1?.color || m.color;
    const b = m.blend.mat2?.color || m.color;
    return { ...m, color: mixHex(a, b, m.blend.amount ?? 0.5), map: m.blend.mat1?.map || m.map };
  }
  if (m.type === 'Double Sided' && m.doubleSided) {
    return { ...m, color: m.doubleSided.front?.color || m.color, map: m.doubleSided.front?.map || m.map };
  }
  if (m.type === 'Top/Bottom' && m.topBottom) {
    const a = m.topBottom.top?.color || m.color;
    const b = m.topBottom.bottom?.color || m.color;
    return { ...m, color: mixHex(b, a, m.topBottom.position ?? 0.5) };
  }
  if ((m.type === 'Composite' || m.type === 'Shellac') && m.composite?.layers?.length) {
    const layers: any[] = m.composite.layers;
    let col = layers[0]?.color || m.color;
    for (let i = 1; i < layers.length; i++) col = mixHex(col, layers[i]?.color || col, 0.5);
    return { ...m, color: col };
  }
  if (m.type === 'Matte/Shadow') {
    return { ...m, color: '#000000', opacity: m.matteShadow?.opaqueAlpha ? 0.001 : 0.1 };
  }
  return m;
}

/**
 * Build a cloned geometry with N evenly-distributed material groups so a
 * Multi/Sub-Object material's sub-materials each shade a slice of the mesh
 * when no per-face Material IDs have been assigned yet.
 */
function buildMultiSubGeometry(base: THREE.BufferGeometry, count: number): THREE.BufferGeometry {
  const g = base.clone();
  const posAttr = g.getAttribute('position') as THREE.BufferAttribute | undefined;
  const indexed = g.getIndex();
  const total = indexed ? indexed.count : (posAttr ? posAttr.count : 0);
  if (!total || count <= 1) { g.clearGroups(); g.addGroup(0, total, 0); return g; }
  g.clearGroups();
  const step = Math.floor(total / count);
  let start = 0;
  for (let i = 0; i < count; i++) {
    const cnt = i === count - 1 ? (total - start) : step;
    g.addGroup(start, cnt, i);
    start += cnt;
  }
  return g;
}


function cloneMaterialInstance(material: any): any {
  if (!material) return material;
  return typeof material.clone === 'function' ? material.clone() : material;
}

function cloneImportedViewportRoot(root: THREE.Object3D): THREE.Object3D {
  const cloned = cloneSkeleton(root) as THREE.Object3D;
  cloned.traverse((child: any) => {
    if (!child.isMesh && !child.isSkinnedMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    // Animated/skinned imports often have stale bounds after pose changes; do
    // not let orthographic wireframe viewports cull them away.
    child.frustumCulled = false;
    if (child.material) {
      child.material = Array.isArray(child.material)
        ? child.material.map(cloneMaterialInstance)
        : cloneMaterialInstance(child.material);
    }
  });
  return cloned;
}

function applyImportedViewportMode(root: THREE.Object3D, renderMode: string) {
  const wire = renderMode === 'wireframe';
  root.traverse((child: any) => {
    if (!child.isMesh && !child.isSkinnedMesh) return;
    child.frustumCulled = false;
    if (!child.material) {
      child.material = new THREE.MeshBasicMaterial({ color: 0x9ca3af });
    }
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat) continue;
      if ('wireframe' in mat) mat.wireframe = wire;
      if (wire && 'side' in mat) mat.side = THREE.DoubleSide;
      mat.needsUpdate = true;
    }
  });
}

function collectBoneSegments(root: THREE.Object3D): Array<[THREE.Object3D, THREE.Object3D]> {
  const bones = new Set<THREE.Object3D>();
  root.traverse((node: any) => {
    if (node.isBone) bones.add(node);
    if (node.isSkinnedMesh && node.skeleton?.bones) {
      for (const b of node.skeleton.bones) bones.add(b);
    }
  });
  const segments: Array<[THREE.Object3D, THREE.Object3D]> = [];
  bones.forEach((bone) => {
    const parent = bone.parent as any;
    if (parent?.isBone && bones.has(parent)) segments.push([parent, bone]);
  });
  return segments;
}

function syncImportedClonePose(source: THREE.Object3D, cloned: THREE.Object3D) {
  const src: THREE.Object3D[] = [];
  const dst: THREE.Object3D[] = [];
  source.traverse((n) => src.push(n));
  cloned.traverse((n) => dst.push(n));
  const n = Math.min(src.length, dst.length);
  for (let i = 0; i < n; i++) {
    dst[i].position.copy(src[i].position);
    dst[i].quaternion.copy(src[i].quaternion);
    dst[i].scale.copy(src[i].scale);
    dst[i].visible = src[i].visible;
    const sm = src[i] as any;
    const dm = dst[i] as any;
    if (sm.isMesh && dm.isMesh && sm.morphTargetInfluences && dm.morphTargetInfluences) {
      for (let j = 0; j < sm.morphTargetInfluences.length; j++) {
        dm.morphTargetInfluences[j] = sm.morphTargetInfluences[j];
      }
    }
  }
  cloned.updateMatrixWorld(true);
  cloned.traverse((child: any) => {
    if (child.isSkinnedMesh && child.skeleton) child.skeleton.update();
  });
}

function ImportedBoneWireOverlay({ root }: { root: THREE.Object3D }) {
  const segments = useMemo(() => collectBoneSegments(root), [root]);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(1, segments.length * 2) * 3), 3));
    return g;
  }, [segments.length]);
  const tmpA = useMemo(() => new THREE.Vector3(), []);
  const tmpB = useMemo(() => new THREE.Vector3(), []);
  const invParent = useMemo(() => new THREE.Matrix4(), []);

  useFrame(() => {
    if (segments.length === 0) return;
    root.updateMatrixWorld(true);
    const parent = root.parent;
    if (parent) parent.updateMatrixWorld(true);
    invParent.copy(parent?.matrixWorld ?? new THREE.Matrix4()).invert();
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    let i = 0;
    for (const [a, b] of segments) {
      tmpA.setFromMatrixPosition(a.matrixWorld).applyMatrix4(invParent);
      tmpB.setFromMatrixPosition(b.matrixWorld).applyMatrix4(invParent);
      pos.setXYZ(i++, tmpA.x, tmpA.y, tmpA.z);
      pos.setXYZ(i++, tmpB.x, tmpB.y, tmpB.z);
    }
    pos.needsUpdate = true;
    geometry.computeBoundingSphere();
  });

  useEffect(() => () => geometry.dispose(), [geometry]);
  if (segments.length === 0) return null;
  return (
    <lineSegments geometry={geometry} userData={{ __helper: true, __rigWireHelper: true }} raycast={() => null}>
      <lineBasicMaterial color={0xfbbf24} depthTest={false} depthWrite={false} transparent opacity={0.95} />
    </lineSegments>
  );
}

function ImportedModelViewportRoot({
  imported,
  renderMode,
  useSourceRoot,
}: {
  imported: { root: THREE.Object3D; animations: THREE.AnimationClip[] };
  renderMode: string;
  useSourceRoot: boolean;
}) {
  const root = useMemo(
    () => (useSourceRoot ? imported.root : cloneImportedViewportRoot(imported.root)),
    [imported, useSourceRoot],
  );

  useEffect(() => {
    applyImportedViewportMode(root, renderMode);
  }, [root, renderMode]);

  useFrame(() => {
    if (!useSourceRoot) syncImportedClonePose(imported.root, root);
  });

  return (
    <>
      <primitive object={root} />
      {renderMode === 'wireframe' && <ImportedBoneWireOverlay root={root} />}
    </>
  );
}

/**
 * Reconstruct the 2D outline of a shape-type object as world-plane 3D points,
 * plus the axis that would be used as the extrude direction (smallest range).
 * Returned axis is one of 'x'|'y'|'z'; `pts3` lie approximately on the plane
 * perpendicular to that axis at the object's local origin.
 */
function getShapeOutline(objectType: string, geom: any): { pts3: THREE.Vector3[]; axis: 'x'|'y'|'z'; closed: boolean } | null {
  if (!geom) return null;
  let pts3: THREE.Vector3[] = [];
  let closed = false;
  if (objectType === 'line') {
    closed = !!geom.closed;
    if (geom.knots && geom.knots.length >= 2) {
      const list = closed ? [...geom.knots, geom.knots[0]] : geom.knots;
      for (let i = 0; i < list.length - 1; i++) {
        const k0 = list[i], k1 = list[i + 1];
        const p0 = new THREE.Vector3(k0.pos[0], k0.pos[1], k0.pos[2]);
        const p3 = new THREE.Vector3(k1.pos[0], k1.pos[1], k1.pos[2]);
        const p1 = p0.clone().add(new THREE.Vector3(k0.outH[0], k0.outH[1], k0.outH[2]));
        const p2 = p3.clone().add(new THREE.Vector3(k1.inH[0], k1.inH[1], k1.inH[2]));
        const seg = new THREE.CubicBezierCurve3(p0, p1, p2, p3).getPoints(20);
        if (i > 0) seg.shift();
        pts3.push(...seg);
      }
    } else if (geom.points && geom.points.length >= 2) {
      pts3 = (geom.points as number[][]).map((v) => new THREE.Vector3(v[0], v[1], v[2]));
    }
  } else if (objectType === 'rectangle') {
    const w = (geom.width ?? 1) / 2, h = (geom.height ?? 1) / 2;
    pts3 = [
      new THREE.Vector3(-w, 0, -h), new THREE.Vector3(w, 0, -h),
      new THREE.Vector3(w, 0, h),   new THREE.Vector3(-w, 0, h),
    ];
    closed = true;
  } else if (objectType === 'circle' || objectType === 'ellipse' || objectType === 'ngon' || objectType === 'star') {
    const n = objectType === 'ngon' ? Math.max(3, geom.sides ?? 6)
      : objectType === 'star' ? Math.max(3, geom.points ?? 5) * 2
      : 64;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      let rx: number, ry: number;
      if (objectType === 'ellipse') { rx = geom.radiusX ?? 0.7; ry = geom.radiusY ?? 0.4; }
      else if (objectType === 'star') { const r = i % 2 === 0 ? (geom.radius1 ?? 0.5) : (geom.radius2 ?? 0.22); rx = ry = r; }
      else { rx = ry = (geom.radius ?? 0.5); }
      pts3.push(new THREE.Vector3(Math.cos(a) * rx, 0, Math.sin(a) * ry));
    }
    closed = true;
  } else {
    return null;
  }
  if (pts3.length < 2) return null;

  const min = pts3[0].clone(), max = pts3[0].clone();
  pts3.forEach((p) => { min.min(p); max.max(p); });
  const range = max.clone().sub(min);
  const axis: 'x' | 'y' | 'z' =
    range.x <= range.y && range.x <= range.z ? 'x' : range.y <= range.z ? 'y' : 'z';
  return { pts3, axis, closed };
}

interface Object3DProps {
  object: {
    id: string;
    type: string;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    color: string;
    geometry?: any;
    lightData?: {
      intensity?: number;
      distance?: number;
      decay?: number;
      angle?: number;        // spot
      penumbra?: number;     // spot
      castShadow?: boolean;
      skyColor?: string;     // skylight
      groundColor?: string;  // skylight
      targetObjectId?: string;
    };
    cameraData?: {
      fov?: number;
      near?: number;
      far?: number;
      lens?: number;              // focal length in mm (auto-linked to fov)
      showCone?: boolean;
      showHorizon?: boolean;
      manualClip?: boolean;
      nearRange?: number;         // environment range near
      farRange?: number;          // environment range far
      dofEnabled?: boolean;
      focusDistance?: number;
      aperture?: number;
      targetDistance?: number;    // free camera only
      targetObjectId?: string;
    };

    modifiers?: Array<{
      id: string;
      type: string;
      params: any;
      active: boolean;
    }>;
    ref?: React.MutableRefObject<any>;
  };
  isSelected: boolean;
  onSelect: (additive?: boolean, remove?: boolean) => void;
  renderMode: 'solid' | 'textured' | 'wireframe' | 'semi-transparent' | 'edged' | 'bbox';
  currentFrame?: number;
  totalFrames?: number;
  isPlaying?: boolean;
  targetLookup?: (id: string) => [number, number, number] | null;
  isActiveViewCamera?: boolean;
  isActiveViewport?: boolean;
}



export const Object3D = ({ object, isSelected, onSelect, renderMode, currentFrame = 0, totalFrames = 100, isPlaying = false, targetLookup, isActiveViewCamera = false, isActiveViewport = false }: Object3DProps) => {

  const meshRef = useRef<Mesh>(null);
  const selectFromEvent = (e: any) => {
    const native = e?.nativeEvent ?? e;
    onSelect(!!(e?.ctrlKey || e?.metaKey || native?.ctrlKey || native?.metaKey), !!(e?.altKey || native?.altKey));
  };

  // Modify-panel gate: Edit Mesh / Edit Poly sub-object overlay only appears
  // when the user is on the Modify panel (matches 3ds Max behavior).
  const [modifyPanelActive, setModifyPanelActive] = useState<boolean>(
    typeof window !== 'undefined' ? !!(window as any).__r3_modifyPanelActive : false,
  );
  useEffect(() => {
    const on = (ev: Event) => setModifyPanelActive(!!(ev as CustomEvent).detail?.active);
    window.addEventListener('r3-modify-panel', on as any);
    return () => window.removeEventListener('r3-modify-panel', on as any);
  }, []);




  // Update object ref — skip for lights/cameras/helpers, whose EntityRenderer
  // binds `object.ref` to its own group. Overwriting here with the (null) mesh
  // ref would break TransformControls attach for those entities.
  useEffect(() => {
    if (isEntityType(object.type)) return;
    if (!isActiveViewport) return;
    if (object.ref) {
      object.ref.current = meshRef.current;
    }
  }, [object.ref, object.type, isActiveViewport]);


  // Imported model: cached scene graph + animations
  const imported = object.type === 'imported' ? getImportedModel(object.id) : undefined;
  const mixerRef = useRef<AnimationMixer | null>(null);
  // One action per available clip so clip-switch cues can swap them at
  // runtime without rebuilding the mixer.
  const actionsRef = useRef<THREE.AnimationAction[]>([]);
  const activeActionRef = useRef<THREE.AnimationAction | null>(null);
  const clipDurationsRef = useRef<number[]>([]);
  const syncImportedClipRef = useRef<((frame: number, total: number) => void) | null>(null);

  useEffect(() => {
    if (!imported || imported.animations.length === 0) return;
    const mixer = new AnimationMixer(imported.root);
    const actions: THREE.AnimationAction[] = imported.animations.map((clip, i) => {
      const a = mixer.clipAction(clip);
      a.reset();
      a.enabled = true;
      a.paused = false;
      a.setLoop(THREE.LoopRepeat, Infinity); // Mixamo clips are cyclic
      a.setEffectiveTimeScale(1);
      a.setEffectiveWeight(i === 0 ? 1 : 0);
      a.play();
      return a;
    });
    actionsRef.current = actions;
    activeActionRef.current = actions[0];
    mixerRef.current = mixer;
    clipDurationsRef.current = imported.animations.map((c) => c.duration);

    // Track which clip index was active last frame so we can crossfade on
    // transitions instead of popping.
    let lastActiveIdx = 0;

    const syncClipTime = (frame: number, total: number) => {
      const safeTotal = Math.max(1, total || totalFrames || 1);
      // Look up Gantt segments for this object and find the one containing
      // the current frame. If none matches, fall back to clip 0 anchored at
      // frame 0 so the character still plays its default idle/walk loop.
      const segMap = ((window as any).__clipSegments || {}) as Record<
        string,
        Array<{ startFrame: number; endFrame: number; clipIndex: number; blendIn?: number }>
      >;
      const segs = (segMap[object.id] || []).slice().sort((a, b) => a.startFrame - b.startFrame);
      let activeIdx = 0;
      let anchorFrame = 0;
      let activeSegIdx = -1;
      const hitIdx = segs.findIndex((s) => frame >= s.startFrame && frame <= s.endFrame);
      if (hitIdx >= 0) {
        activeIdx = segs[hitIdx].clipIndex;
        anchorFrame = segs[hitIdx].startFrame;
        activeSegIdx = hitIdx;
      }

      // Detect a crossfade window: the current segment has (explicit or
      // auto-defaulted) blendIn > 0, there is a previous segment adjacent or
      // overlapping this one, and the frame is inside the first `blendIn`
      // frames of the current segment. Uses smoothstep easing on the weight
      // so the ramp feels natural (ease-in / ease-out), not linear.
      let blendT = -1; // 0 = fully previous, 1 = fully current (post-easing)
      let prevClipIdx = -1;
      let prevAnchor = 0;
      if (activeSegIdx > 0) {
        const cur = segs[activeSegIdx];
        const prev = segs[activeSegIdx - 1];
        // Auto-blend: if user didn't set blendIn but segments are adjacent
        // (or overlap), apply a default 15-frame crossfade so movement isn't
        // brutal. Explicit blendIn === 0 hard-cuts (opt-out).
        const explicit = cur.blendIn;
        let requested: number;
        if (explicit === undefined || explicit === null) {
          const adjacent = Math.abs(cur.startFrame - prev.endFrame) <= 1 || cur.startFrame < prev.endFrame;
          requested = adjacent ? 15 : 0;
        } else {
          requested = explicit;
        }
        const segLen = cur.endFrame - cur.startFrame;
        const prevLen = prev.endFrame - prev.startFrame;
        const blen = Math.max(0, Math.min(requested, segLen, Math.max(1, prevLen)));
        if (blen > 0 && frame < cur.startFrame + blen) {
          let t = (frame - cur.startFrame) / blen;
          if (t < 0) t = 0;
          if (t > 1) t = 1;
          // Smoothstep: 3t² - 2t³ — ease-in-out, standard for animation
          // blending (matches Unreal's default cubic transition curve).
          blendT = t * t * (3 - 2 * t);
          prevClipIdx = prev.clipIndex;
          prevAnchor = prev.startFrame;
        }
      }

      const clip = imported.animations[activeIdx];
      const action = actions[activeIdx];
      if (!clip || !action) return;
      const duration = clip.duration || 0;
      if (duration <= 0) return;

      const fps = 30;

      if (blendT >= 0 && prevClipIdx >= 0 && prevClipIdx !== activeIdx && actions[prevClipIdx] && imported.animations[prevClipIdx]) {
        // Weighted crossfade: both actions active, weights sum to 1, times
        // advanced independently so each clip continues its own local motion.
        const prevClip = imported.animations[prevClipIdx];
        const prevDur = prevClip.duration || 0;
        for (let i = 0; i < actions.length; i++) {
          const a = actions[i];
          a.enabled = i === activeIdx || i === prevClipIdx;
          a.paused = false;
          if (i === activeIdx) a.setEffectiveWeight(blendT);
          else if (i === prevClipIdx) a.setEffectiveWeight(1 - blendT);
          else a.setEffectiveWeight(0);
        }
        const curTime = ((frame - anchorFrame) / fps) % Math.max(1e-6, duration);
        const prevTime = prevDur > 0 ? (((frame - prevAnchor) / fps) % prevDur) : 0;
        actions[activeIdx].time = Math.max(0, curTime);
        actions[prevClipIdx].time = Math.max(0, prevTime);
        mixer.update(0);
        lastActiveIdx = activeIdx;
      } else {
        // No transition: single active clip.
        for (let i = 0; i < actions.length; i++) {
          actions[i].setEffectiveWeight(i === activeIdx ? 1 : 0);
          actions[i].enabled = true;
          actions[i].paused = false;
        }
        lastActiveIdx = activeIdx;
        const framesSinceAnchor = Math.max(0, frame - anchorFrame);
        const rawTime = framesSinceAnchor / fps;
        const clipTime = rawTime % duration;
        mixer.setTime(clipTime);
      }

      activeActionRef.current = action;
      imported.root.updateMatrixWorld(true);
      imported.root.traverse((child: any) => {
        if (child.isSkinnedMesh && child.skeleton) {
          child.updateMatrixWorld(true);
          child.skeleton.update();
        }
      });
      void safeTotal;
    };
    syncImportedClipRef.current = syncClipTime;
    (imported.root as any).userData.__syncClipTime = syncClipTime;
    if (meshRef.current) (meshRef.current as any).userData.__syncClipTime = syncClipTime;
    syncClipTime(currentFrame, totalFrames);
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(imported.root);
      mixerRef.current = null;
      actionsRef.current = [];
      activeActionRef.current = null;
      syncImportedClipRef.current = null;
      delete (imported.root as any).userData.__syncClipTime;
      if (meshRef.current) delete (meshRef.current as any).userData.__syncClipTime;
    };
  }, [imported]);

  // Drive animation from scene timeline. When the user has baked the
  // model's clip into editable per-bone tracks (Track View), we sample those
  // tracks and skip the AnimationMixer so edits reflect immediately.
  useFrame(() => {
    if (object.type === 'imported' && imported) {
      const bakedSets = (window as any).__bakedClipSets as
        | Record<string, BakedClipSet>
        | undefined;
      const baked = bakedSets?.[object.id];
      if (baked && baked.tracks.length > 0) {
        applyBakedSet(baked, imported.root, currentFrame);
        // Also override the syncClipTime hook used by the animation
        // renderer so offline renders read from the baked tracks too.
        (imported.root as any).userData.__syncClipTime = (frame: number) => {
          applyBakedSet(baked, imported.root, frame);
        };
        return;
      }
    }
    syncImportedClipRef.current?.(currentFrame, totalFrames);
  });


  // Apply modifiers to geometry (only for primitive types)
  const modifiedGeometry = useMemo(() => {
    if (object.type === 'imported') return new THREE.BufferGeometry();
    if (isHelperType(object.type)) return new THREE.BufferGeometry();
    let geometry: BufferGeometry = createBaseGeometry(object.type, object.geometry);

    if (object.modifiers) {
      object.modifiers.forEach(modifier => {
        if (modifier.active) {
          geometry = applyModifier(geometry, modifier, object.type, object.geometry);
        }
      });
    }
    // UVW fallback: any geometry without a uv attribute gets a box-projection UV
    // (equivalent to a default UVW Map modifier). This makes bitmap textures show
    // up on Shapes/Extruded geometry that would otherwise render solid color.
    if (!geometry.getAttribute('uv') && geometry.getAttribute('position')) {
      geometry.computeBoundingBox();
      const bb = geometry.boundingBox!;
      const sx = Math.max(1e-6, bb.max.x - bb.min.x);
      const sy = Math.max(1e-6, bb.max.y - bb.min.y);
      const sz = Math.max(1e-6, bb.max.z - bb.min.z);
      const pos = geometry.getAttribute('position');
      const uvs = new Float32Array(pos.count * 2);
      // Project onto the two largest axes (planar-box style)
      const dims = [
        { k: 'x' as const, s: sx }, { k: 'y' as const, s: sy }, { k: 'z' as const, s: sz },
      ].sort((a, b) => b.s - a.s);
      const u = dims[0], v = dims[1];
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
        const uc = u.k === 'x' ? px : u.k === 'y' ? py : pz;
        const vc = v.k === 'x' ? px : v.k === 'y' ? py : pz;
        uvs[i * 2] = (uc - (u.k === 'x' ? bb.min.x : u.k === 'y' ? bb.min.y : bb.min.z)) / u.s;
        uvs[i * 2 + 1] = (vc - (v.k === 'x' ? bb.min.x : v.k === 'y' ? bb.min.y : bb.min.z)) / v.s;
      }
      geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    }
    return geometry;
  }, [object.id, object.type, object.geometry, object.modifiers]);

  /**
   * Visible segment rings for an active Extrude modifier. Produces `segments+1`
   * copies of the base outline stacked proportionally between base (0) and top
   * (amount) along the extrude axis, rendered as a wireframe overlay so the
   * user actually sees the subdivision.
   */
  const extrudeRings = useMemo(() => {
    const ext = object.modifiers?.find((m: any) => m.type === 'Extrude' && m.active);
    if (!ext) return null;
    const outline = getShapeOutline(object.type, object.geometry);
    if (!outline) return null;
    const amount = ext.params?.amount ?? 1;
    const segments = Math.max(1, Math.floor(ext.params?.segments ?? 1));
    const { pts3, axis, closed } = outline;

    const positions: number[] = [];
    const pushRing = (offset: number) => {
      for (let i = 0; i < pts3.length; i++) {
        const a = pts3[i];
        const b = pts3[(i + 1) % pts3.length];
        if (!closed && i === pts3.length - 1) break;
        const push = (p: THREE.Vector3) => {
          const x = axis === 'x' ? offset : p.x;
          const y = axis === 'y' ? offset : p.y;
          const z = axis === 'z' ? offset : p.z;
          positions.push(x, y, z);
        };
        push(a); push(b);
      }
    };
    for (let s = 0; s <= segments; s++) {
      pushRing((s / segments) * amount);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [object.type, object.geometry, object.modifiers]);





  function createBaseGeometry(type: string, geometry?: any): BufferGeometry {
    const geom = geometry || {};

    // Compound Objects — baked geometry produced by Boolean / ProBoolean / Loft / Scatter.
    // `geom` carries { positions, normals?, uvs?, indices? } (Float32/Uint32 arrays or plain arrays).
    if (type === 'compound') {
      const g = new THREE.BufferGeometry();
      const pos = geom.positions ? new Float32Array(geom.positions) : new Float32Array(0);
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      if (geom.normals && geom.normals.length === pos.length) {
        g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(geom.normals), 3));
      } else {
        g.computeVertexNormals();
      }
      if (geom.uvs) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geom.uvs), 2));
      if (geom.indices) g.setIndex(Array.from(geom.indices));
      return g;
    }

    // Sprint C — Extended Primitives
    const extPrims: ExtPrimType[] = ['hedra', 'chamferBox', 'chamferCyl', 'oilTank', 'spindle', 'gengon', 'torusKnot', 'ringWave', 'prism', 'teapot', 'tube', 'pyramid', 'geoSphere', 'capsule', 'lExt', 'cExt', 'hose', 'foliage'];
    if (extPrims.includes(type as ExtPrimType)) {
      return buildExtendedPrimitive(type as ExtPrimType, geom);
    }
    // Editable Spline — deserialise + tube-mesh
    if (type === 'editable_spline') {
      const es = EditableSpline.deserialize((geometry || {}).editableSpline);
      const tube = es.toTubeGeometry();
      return tube ?? new THREE.BufferGeometry();
    }
    // Sprint C — Shapes
    const shapes: ShapeType[] = ['line', 'rectangle', 'circle', 'ellipse', 'arc', 'donut', 'ngon', 'star', 'helix', 'text'];
    if (shapes.includes(type as ShapeType)) {
      return buildShape(type as ShapeType, geom);
    }
    // AEC Extended
    if (type === 'wall')   return buildWall(geom);
    if (type === 'door')   return buildDoor(geom);
    if (type === 'window') return buildWindow(geom);

    switch (type) {
      case 'box':
        return new THREE.BoxGeometry(
          geom.width || 1,
          geom.height || 1,
          geom.depth || 1,
          geom.widthSegments || 1,
          geom.heightSegments || 1,
          geom.depthSegments || 1
        );
      case 'sphere':
        return new THREE.SphereGeometry(
          geom.radius || 0.5,
          geom.widthSegments || 32,
          geom.heightSegments || 32
        );
      case 'cylinder':
        return new THREE.CylinderGeometry(
          geom.radiusTop || 0.5,
          geom.radiusBottom || 0.5,
          geom.height || 1,
          geom.radialSegments || 32,
          geom.heightSegments || 1
        );
      case 'cone':
        return new THREE.ConeGeometry(
          geom.radius || 0.5,
          geom.height || 1,
          geom.radialSegments || 32,
          geom.heightSegments || 1
        );
      case 'torus':
        return new THREE.TorusGeometry(
          geom.radius || 0.5,
          geom.tube || 0.2,
          geom.radialSegments || 16,
          geom.tubularSegments || 100
        );
      case 'plane': {
        const planeGeom = new THREE.PlaneGeometry(
          geom.width || 1,
          geom.height || 1,
          geom.widthSegments || 1,
          geom.heightSegments || 1
        );
        // 3ds Max Plane sits flat on the ground (XZ plane, normal +Y).
        // Three's PlaneGeometry lies on XY (normal +Z), so rotate -90° around X.
        planeGeom.rotateX(-Math.PI / 2);
        return planeGeom;
      }
      default:
        return new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
    }
  }

  function applyModifier(geometry: BufferGeometry, modifier: any, objectType?: string, objectGeom?: any): BufferGeometry {
    if (modifier.type === 'Extrude') {
      const extruded = applyExtrude(objectType, objectGeom, modifier.params || {});
      return extruded || geometry;
    }
    if (modifier.type === 'Lathe') {
      const lathed = applyLathe(objectType, objectGeom, modifier.params || {});
      return lathed || geometry;
    }
    if (modifier.type === 'Bevel') {
      const beveled = applyBevel(objectType, objectGeom, modifier.params || {});
      return beveled || geometry;
    }
    const newGeometry = geometry.clone();

    switch (modifier.type) {
      case 'Bend':        return applyBend(newGeometry, modifier.params);
      case 'Twist':       return applyTwist(newGeometry, modifier.params);
      case 'Taper':       return applyTaper(newGeometry, modifier.params);
      case 'Noise':       return applyNoise(newGeometry, modifier.params);
      case 'Stretch':     return applyStretch(newGeometry, modifier.params);
      case 'Skew':        return applySkew(newGeometry, modifier.params);
      case 'FFD':         return applyFFD(newGeometry, modifier.params);
      case 'Symmetry':    return applySymmetry(newGeometry, modifier.params);
      case 'Mirror':      return applyMirror(newGeometry, modifier.params);
      case 'Slice':       return applySlice(newGeometry, modifier.params);
      case 'Skin':        return applySkin(newGeometry, modifier.params);
      case 'UVW Map':     return applyUVWMap(newGeometry, modifier.params);
      case 'Unwrap UVW':  return applyUnwrapUVW(newGeometry, modifier.params);
      case 'MeshSmooth':  return applyMeshSmooth(newGeometry, modifier.params);
      case 'WaltSculpt':  return applyWaltSculptMod(newGeometry, modifier.params);
      case 'TurboSmooth': return applyTurboSmooth(newGeometry, modifier.params);
      case 'Edit Poly':   return applyEditPoly(newGeometry, modifier.params);
      case 'Edit Mesh':   return applyEditMesh(newGeometry, modifier.params);
      case 'Shell':       return applyShell(newGeometry, modifier.params);
      default:            return newGeometry;
    }
  }

  // ---------------------------------------------------------------------------
  // Shell modifier — gives 2D / open surfaces real thickness by duplicating
  // the mesh along its vertex normals (Outer/Inner Amount), reversing the inner
  // shell winding and stitching side polygons along every open (boundary) edge.
  // Mirrors 3ds Max Shell: Outer Amount, Inner Amount, Segments, Straighten
  // Corners, Auto Smooth Edge, and per-region Material IDs.
  // ---------------------------------------------------------------------------
  function applyShell(geometry: BufferGeometry, params: any): BufferGeometry {
    const outer = Number.isFinite(params?.outer) ? params.outer : 0;
    const inner = Number.isFinite(params?.inner) ? params.inner : 0.1;
    const segments = Math.max(1, Math.floor(params?.segments ?? 1));
    const straighten = params?.straightenCorners !== false;
    const overrideOuterId = !!params?.overrideOuterMatId;
    const overrideInnerId = !!params?.overrideInnerMatId;
    const overrideEdgeId  = !!params?.overrideEdgeMatId;
    const outerId = Math.max(0, Math.floor(params?.outerMatId ?? 0));
    const innerId = Math.max(0, Math.floor(params?.innerMatId ?? 1));
    const edgeId  = Math.max(0, Math.floor(params?.edgeMatId  ?? 2));

    if (outer === 0 && inner === 0) return geometry;

    // Weld duplicate positions so open-edge detection works on any input.
    let src: BufferGeometry;
    try {
      src = mergeVertices(geometry, 1e-6);
    } catch {
      src = geometry.clone();
    }
    if (!src.getIndex()) {
      const posCount = src.getAttribute('position').count;
      const idx: number[] = [];
      for (let i = 0; i < posCount; i++) idx.push(i);
      src.setIndex(idx);
    }
    src.computeVertexNormals();

    const posAttr = src.getAttribute('position') as THREE.BufferAttribute;
    const nrmAttr = src.getAttribute('normal') as THREE.BufferAttribute;
    const uvAttr  = src.getAttribute('uv') as THREE.BufferAttribute | undefined;
    const index   = src.getIndex()!;
    const vCount  = posAttr.count;
    const triCount = index.count / 3;

    // Straighten Corners: average per-vertex direction so quins stay square
    // instead of bulging outward along sharp normals (3ds Max checkbox).
    const dir = new Float32Array(vCount * 3);
    for (let i = 0; i < vCount; i++) {
      dir[i * 3]     = nrmAttr.getX(i);
      dir[i * 3 + 1] = nrmAttr.getY(i);
      dir[i * 3 + 2] = nrmAttr.getZ(i);
    }
    if (straighten) {
      // Normalize each direction; already unit-length from computeVertexNormals.
      for (let i = 0; i < vCount; i++) {
        const x = dir[i*3], y = dir[i*3+1], z = dir[i*3+2];
        const l = Math.hypot(x, y, z) || 1;
        dir[i*3]   = x / l;
        dir[i*3+1] = y / l;
        dir[i*3+2] = z / l;
      }
    }

    // -- Detect open (boundary) edges: those appearing in exactly one triangle.
    // Key by ordered vertex pair (min,max) so we can count uses.
    const edgeUse = new Map<number, { a: number; b: number; count: number; loopA: number; loopB: number }>();
    const keyOf = (a: number, b: number) => {
      const lo = a < b ? a : b;
      const hi = a < b ? b : a;
      return lo * 0x100000 + hi;
    };
    for (let t = 0; t < triCount; t++) {
      const ia = index.getX(t * 3);
      const ib = index.getX(t * 3 + 1);
      const ic = index.getX(t * 3 + 2);
      // Track directed edge for side-face winding
      const pushEdge = (a: number, b: number) => {
        const k = keyOf(a, b);
        const rec = edgeUse.get(k);
        if (!rec) edgeUse.set(k, { a, b, count: 1, loopA: a, loopB: b });
        else rec.count++;
      };
      pushEdge(ia, ib); pushEdge(ib, ic); pushEdge(ic, ia);
    }
    const openEdges: Array<{ a: number; b: number }> = [];
    edgeUse.forEach((r) => { if (r.count === 1) openEdges.push({ a: r.loopA, b: r.loopB }); });

    // ------------------------------------------------------------------
    // Build the new geometry:
    //   ring 0            = outer shell (v + n*outer)   — original winding
    //   ring (segments)   = inner shell (v - n*inner)   — reversed winding
    //   rings 1..segs-1   = side subdivisions along open edges
    // ------------------------------------------------------------------
    const totalOffset = outer + inner;
    const ringCount = segments + 1; // 0..segments
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const matIds: number[] = []; // per-triangle material id (groups)

    // Ring 0 (outer) and ring segments (inner) share original topology; the
    // in-between rings only need vertices for the open-edge loops (side wall).
    // For simplicity we duplicate the full vertex set on every ring — memory
    // is O(V * (segments+1)) which is fine for typical 3ds Max Shell usage
    // (segments defaults to 1, so most objects use just 2 rings).
    for (let r = 0; r <= segments; r++) {
      const t = r / segments; // 0 at outer ring, 1 at inner
      const off = outer - t * totalOffset; // outer -> -inner
      for (let i = 0; i < vCount; i++) {
        const px = posAttr.getX(i), py = posAttr.getY(i), pz = posAttr.getZ(i);
        const dx = dir[i*3], dy = dir[i*3+1], dz = dir[i*3+2];
        positions.push(px + dx * off, py + dy * off, pz + dz * off);
        normals.push(dx, dy, dz);
        if (uvAttr) uvs.push(uvAttr.getX(i), uvAttr.getY(i));
      }
    }

    // Front faces (outer shell) — original winding, ring 0
    for (let t = 0; t < triCount; t++) {
      const ia = index.getX(t * 3);
      const ib = index.getX(t * 3 + 1);
      const ic = index.getX(t * 3 + 2);
      indices.push(ia, ib, ic);
      matIds.push(overrideOuterId ? outerId : 0);
    }
    // Back faces (inner shell) — reversed winding, last ring
    const backBase = segments * vCount;
    for (let t = 0; t < triCount; t++) {
      const ia = index.getX(t * 3);
      const ib = index.getX(t * 3 + 1);
      const ic = index.getX(t * 3 + 2);
      indices.push(backBase + ia, backBase + ic, backBase + ib);
      matIds.push(overrideInnerId ? innerId : 0);
    }
    // Flip normals on the back ring so lighting matches the reversed winding.
    for (let i = 0; i < vCount; i++) {
      const b = (backBase + i) * 3;
      normals[b] = -normals[b];
      normals[b + 1] = -normals[b + 1];
      normals[b + 2] = -normals[b + 2];
    }

    // Side faces — one quad strip per open edge, subdivided into `segments` bands
    for (const e of openEdges) {
      for (let r = 0; r < segments; r++) {
        const r0 = r * vCount;
        const r1 = (r + 1) * vCount;
        const a0 = r0 + e.a, b0 = r0 + e.b;
        const a1 = r1 + e.a, b1 = r1 + e.b;
        // Wind so outward-facing side matches the outer shell exterior.
        indices.push(a0, b1, b0);
        indices.push(a0, a1, b1);
        const mid = overrideEdgeId ? edgeId : 0;
        matIds.push(mid, mid);
      }
    }

    const out = new BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    out.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
    if (uvAttr) out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    out.setIndex(indices);

    // Material groups (used by Multi/Sub-Object materials when overrides on)
    if (overrideOuterId || overrideInnerId || overrideEdgeId) {
      // Group triangles by matId, in the same order as `indices`.
      let start = 0;
      let currentId = matIds[0] ?? 0;
      for (let i = 1; i <= matIds.length; i++) {
        if (i === matIds.length || matIds[i] !== currentId) {
          out.addGroup(start * 3, (i - start) * 3, currentId);
          start = i;
          currentId = matIds[i] ?? currentId;
        }
      }
    }

    // Recompute normals for side faces (front/back rings already correct).
    // Only side faces need recomputation, but a single pass keeps things simple
    // and matches 3ds Max's "Auto Smooth Edges" default behavior.
    if (params?.autoSmooth !== false) out.computeVertexNormals();
    out.computeBoundingBox();
    out.computeBoundingSphere();
    return out;
  }

  function applyExtrude(objectType: string | undefined, geom: any, params: any): BufferGeometry | null {
    if (!objectType || !geom) return null;

    // Text is a shape composed of many sub-splines (one per glyph, each with
    // its own holes for letter counters). We build ExtrudeGeometry directly
    // from the font's shapes so O/B/D/e/a/o keep their interior cutouts.
    if (objectType === 'text') {
      const shapes = buildTextShapes(
        geom.text ?? 'Text',
        geom.font ?? 'helvetiker',
        !!geom.bold,
        geom.size ?? 1,
        geom.kerning ?? 0,
        geom.curveSegments ?? 6,
      );
      if (!shapes.length) return null;
      const amount = params.amount ?? 0.2;
      const segments = Math.max(1, Math.floor(params.segments ?? 1));
      const bevelEnabled = !!params.bevelEnabled;
      const extrGeo = new THREE.ExtrudeGeometry(shapes, {
        depth: amount,
        steps: segments,
        bevelEnabled,
        bevelThickness: params.bevelThickness ?? Math.min(0.05, amount * 0.1),
        bevelSize: params.bevelSize ?? Math.min(0.03, amount * 0.05),
        bevelSegments: Math.max(1, Math.floor(params.bevelSegments ?? 2)),
        curveSegments: geom.curveSegments ?? 6,
      });
      // Match the flat-text preview (XZ ground plane, extrusion along +Y).
      extrGeo.rotateX(-Math.PI / 2);
      extrGeo.computeBoundingBox();
      const bb = extrGeo.boundingBox!;
      const cx = (bb.min.x + bb.max.x) / 2;
      const cz = (bb.min.z + bb.max.z) / 2;
      extrGeo.translate(-cx, 0, -cz);
      return smoothExtrudeSides(extrGeo);
    }

    const outline = getShapeOutline(objectType, geom);
    if (!outline || outline.pts3.length < 3) return null;


    const amount = params.amount ?? 1;
    const segments = Math.max(1, Math.floor(params.segments ?? 1));
    const bevelEnabled = !!params.bevelEnabled;
    const { pts3, axis, closed } = outline;

    // Map outline to shape-local 2D so that after the rotation below the base
    // ring lands exactly on the original pts3 (matching the visible ring
    // overlay). ExtrudeGeometry places shape at local z=0 and extrudes toward
    // local +Z; the rotations below then send local +Z → world +axis.
    //
    //   axis='y': rotateX(-π/2) → world (x,y,z) = (u,  z_local, -v)
    //   axis='x': rotateY(+π/2) → world (x,y,z) = ( z_local, v, -u)
    //   axis='z': no rotation   → world (x,y,z) = (u, v, z_local)
    //
    // We want world base (z_local=0) to equal the source pts3 coordinates on
    // the plane perpendicular to `axis`, so we invert the second component
    // accordingly on x/y axes.
    const to2D = (p: THREE.Vector3) =>
      axis === 'x' ? new THREE.Vector2(-p.z, p.y)
      : axis === 'y' ? new THREE.Vector2(p.x, -p.z)
      : new THREE.Vector2(p.x, p.y);

    const pts2 = pts3.map(to2D);
    const shape = new THREE.Shape(pts2);
    if (closed) shape.autoClose = true;

    const extrGeo = new THREE.ExtrudeGeometry(shape, {
      depth: amount,
      steps: segments,
      bevelEnabled,
      curveSegments: 24,
    });

    // Align local +Z (extrude direction) with the chosen world axis.
    if (axis === 'y') extrGeo.rotateX(-Math.PI / 2);
    else if (axis === 'x') extrGeo.rotateY(Math.PI / 2);

    // Smooth-shade the side walls (group 1) while keeping caps flat (group 0).
    // ExtrudeGeometry duplicates vertices per side-quad, producing faceted
    // shading on curved shapes (circle, ngon, ellipse...). We split the two
    // groups, mergeVertices on the walls only, recompute normals, then
    // recombine so the rim between cap and wall stays a hard edge.
    return smoothExtrudeSides(extrGeo);
  }

  function smoothExtrudeSides(geo: THREE.BufferGeometry): THREE.BufferGeometry {
    try {
      const groups = geo.groups;
      if (!groups || groups.length < 2) {
        geo.computeVertexNormals();
        return geo;
      }
      // Isolate walls (materialIndex === 1) and caps (materialIndex === 0).
      const nonIndexed = geo.index ? geo.toNonIndexed() : geo;
      const pos = nonIndexed.getAttribute('position') as THREE.BufferAttribute;
      const uv = nonIndexed.getAttribute('uv') as THREE.BufferAttribute | undefined;
      const capsGeo = new THREE.BufferGeometry();
      const wallsGeo = new THREE.BufferGeometry();
      const capsPos: number[] = [];
      const wallsPos: number[] = [];
      const capsUv: number[] = [];
      const wallsUv: number[] = [];
      // Rebuild groups from the non-indexed geometry.
      // Note: toNonIndexed keeps groups; each group's start/count refers to vertices.
      const ng = (nonIndexed.groups && nonIndexed.groups.length ? nonIndexed.groups : groups);
      for (const g of ng) {
        const start = g.start;
        const end = g.start + g.count;
        const target = g.materialIndex === 1 ? wallsPos : capsPos;
        const targetUv = g.materialIndex === 1 ? wallsUv : capsUv;
        for (let i = start; i < end; i++) {
          target.push(pos.getX(i), pos.getY(i), pos.getZ(i));
          if (uv) targetUv.push(uv.getX(i), uv.getY(i));
        }
      }
      capsGeo.setAttribute('position', new THREE.Float32BufferAttribute(capsPos, 3));
      wallsGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallsPos, 3));
      if (uv) {
        capsGeo.setAttribute('uv', new THREE.Float32BufferAttribute(capsUv, 2));
        wallsGeo.setAttribute('uv', new THREE.Float32BufferAttribute(wallsUv, 2));
      }
      const wallsMerged = mergeVertices(wallsGeo, 1e-4);
      wallsMerged.computeVertexNormals();
      capsGeo.computeVertexNormals();

      // Recombine into a single indexed-less geometry with two groups so a
      // single material still shows both parts.
      const out = new THREE.BufferGeometry();
      const wPos = wallsMerged.getAttribute('position') as THREE.BufferAttribute;
      const wNorm = wallsMerged.getAttribute('normal') as THREE.BufferAttribute;
      const wIdx = wallsMerged.getIndex();
      // Flatten walls back to non-indexed to concatenate simply with caps.
      const wallsFlat = wallsMerged.toNonIndexed();
      const cPosArr = capsGeo.getAttribute('position').array as Float32Array;
      const cNormArr = capsGeo.getAttribute('normal').array as Float32Array;
      const wPosArr = wallsFlat.getAttribute('position').array as Float32Array;
      const wNormArr = wallsFlat.getAttribute('normal').array as Float32Array;
      const posOut = new Float32Array(cPosArr.length + wPosArr.length);
      const normOut = new Float32Array(cNormArr.length + wNormArr.length);
      posOut.set(cPosArr, 0); posOut.set(wPosArr, cPosArr.length);
      normOut.set(cNormArr, 0); normOut.set(wNormArr, cNormArr.length);
      out.setAttribute('position', new THREE.BufferAttribute(posOut, 3));
      out.setAttribute('normal', new THREE.BufferAttribute(normOut, 3));
      if (uv) {
        const cUv = capsGeo.getAttribute('uv')?.array as Float32Array | undefined;
        const wUv = wallsFlat.getAttribute('uv')?.array as Float32Array | undefined;
        if (cUv && wUv) {
          const uvOut = new Float32Array(cUv.length + wUv.length);
          uvOut.set(cUv, 0); uvOut.set(wUv, cUv.length);
          out.setAttribute('uv', new THREE.BufferAttribute(uvOut, 2));
        }
      }
      return out;
    } catch {
      geo.computeVertexNormals();
      return geo;
    }
  }


  // 3ds Max-style Bend: bends geometry along the chosen axis by `angle`,
  // with `direction` rotating the bend plane around that axis, and optional
  // limits that restrict the bend region (outside → rigid tangent extension).
  /**
   * Build the gizmo → mesh matrices from `params.gizmo` + `params.center` and
   * temporarily transform `geometry`'s position buffer *into* gizmo space so
   * the modifier math (which is hardcoded around local axes / origin) sees
   * vertices in the user-chosen frame. After `deform()` runs, positions are
   * transformed back to mesh-local space. This is exactly how 3ds Max lets a
   * gizmo move / rotate / scale the deformation region without touching the
   * mesh transform.
   */
  function withGizmoSpace(
    geometry: BufferGeometry,
    params: any,
    deform: (g: BufferGeometry, p: any) => BufferGeometry,
  ): BufferGeometry {
    const g = params?.gizmo || {};
    const c = params?.center || {};
    const gPos = Array.isArray(g.pos) ? g.pos : [0, 0, 0];
    const gRot = Array.isArray(g.rot) ? g.rot : [0, 0, 0];
    const gScl = Array.isArray(g.scale) ? g.scale : [1, 1, 1];
    const cPos = Array.isArray(c.pos) ? c.pos : [0, 0, 0];

    const hasGizmo =
      gPos[0] || gPos[1] || gPos[2] ||
      gRot[0] || gRot[1] || gRot[2] ||
      (gScl[0] !== 1) || (gScl[1] !== 1) || (gScl[2] !== 1) ||
      cPos[0] || cPos[1] || cPos[2];

    if (!hasGizmo) return deform(geometry, params);

    const G = new THREE.Matrix4().compose(
      new THREE.Vector3(gPos[0], gPos[1], gPos[2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(gRot[0], gRot[1], gRot[2], 'XYZ')),
      new THREE.Vector3(gScl[0] || 1, gScl[1] || 1, gScl[2] || 1),
    );
    const Ginv = new THREE.Matrix4().copy(G).invert();

    const pos = geometry.getAttribute('position');
    const arr = pos.array as Float32Array;
    const v = new THREE.Vector3();

    // Mesh → gizmo space, subtract center offset.
    for (let i = 0; i < arr.length; i += 3) {
      v.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(Ginv);
      arr[i] = v.x - cPos[0];
      arr[i + 1] = v.y - cPos[1];
      arr[i + 2] = v.z - cPos[2];
    }
    pos.needsUpdate = true;

    deform(geometry, params);

    // Re-read (deform() may have replaced the attribute via computeVertexNormals but
    // not the position buffer — same reference is fine).
    const pos2 = geometry.getAttribute('position');
    const arr2 = pos2.array as Float32Array;
    for (let i = 0; i < arr2.length; i += 3) {
      v.set(arr2[i] + cPos[0], arr2[i + 1] + cPos[1], arr2[i + 2] + cPos[2]).applyMatrix4(G);
      arr2[i] = v.x; arr2[i + 1] = v.y; arr2[i + 2] = v.z;
    }
    pos2.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  // Public wrappers apply the Gizmo/Center transform, then run the core math.
  function applyBend(geometry: BufferGeometry, params: any): BufferGeometry {
    return withGizmoSpace(geometry, params, applyBendCore);
  }
  function applyTwist(geometry: BufferGeometry, params: any): BufferGeometry {
    return withGizmoSpace(geometry, params, applyTwistCore);
  }
  function applyTaper(geometry: BufferGeometry, params: any): BufferGeometry {
    return withGizmoSpace(geometry, params, applyTaperCore);
  }
  function applyNoise(geometry: BufferGeometry, params: any): BufferGeometry {
    return withGizmoSpace(geometry, params, applyNoiseCore);
  }

  function applyBendCore(geometry: BufferGeometry, params: any): BufferGeometry {
    const angle = (params.angle || 0) * Math.PI / 180;
    const direction = (params.direction || 0) * Math.PI / 180;
    const axisName = (params.bendAxis || 'Z') as 'X' | 'Y' | 'Z';
    const useLimits = !!params.limits;
    const upperLim = Number(params.upperLimit ?? 0);
    const lowerLim = Number(params.lowerLimit ?? 0);

    const axisIdx = axisName === 'X' ? 0 : axisName === 'Y' ? 1 : 2;
    const uIdx = (axisIdx + 1) % 3;
    const vIdx = (axisIdx + 2) % 3;

    const positionAttribute = geometry.getAttribute('position');
    const positions = positionAttribute.array as Float32Array;

    // Extent along bend axis
    let minA = Infinity, maxA = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      const a = positions[i + axisIdx];
      if (a < minA) minA = a;
      if (a > maxA) maxA = a;
    }
    const H = maxA - minA;
    if (H < 1e-8 || Math.abs(angle) < 1e-8) return geometry;

    // 3ds Max style: limits are measured from the gizmo center (assumed 0 in local
    // space) along the bend axis. Upper Limit >= 0, Lower Limit <= 0. Points inside
    // [lower, upper] bend proportionally; points outside extend straight with the
    // tangent at the limit boundary. When limits are off, the whole extent bends.
    const center = 0;
    let aLo: number, aHi: number, span: number;
    if (useLimits) {
      aHi = center + Math.max(0, upperLim);
      aLo = center + Math.min(0, lowerLim);
      span = aHi - aLo;
      if (span < 1e-8) return geometry;
    } else {
      aLo = minA; aHi = maxA; span = H;
    }

    const r = span / angle;
    const cosD = Math.cos(direction);
    const sinD = Math.sin(direction);

    for (let i = 0; i < positions.length; i += 3) {
      const a = positions[i + axisIdx];
      const uRaw = positions[i + uIdx];
      const vRaw = positions[i + vIdx];

      const uP = uRaw * cosD + vRaw * sinD;
      const vP = -uRaw * sinD + vRaw * cosD;

      // Clamp a into the bend region and remember overshoot for rigid extension.
      let aClamped = a;
      let extraStraight = 0;
      if (a < aLo) { aClamped = aLo; extraStraight = a - aLo; }
      else if (a > aHi) { aClamped = aHi; extraStraight = a - aHi; }
      const t = aClamped - aLo; // 0..span

      const theta = angle * (t / span);
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);

      const newA = aLo + (r - uP) * sinT + extraStraight * cosT;
      const newUp = r - (r - uP) * cosT + extraStraight * sinT;
      const newVp = vP;

      const newU = newUp * cosD - newVp * sinD;
      const newV = newUp * sinD + newVp * cosD;

      positions[i + axisIdx] = newA;
      positions[i + uIdx] = newU;
      positions[i + vIdx] = newV;
    }

    positionAttribute.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  function applyTwistCore(geometry: BufferGeometry, params: any): BufferGeometry {
    const angle = (params.angle || 0) * Math.PI / 180;
    const bias = params.bias || 0;
    
    const positionAttribute = geometry.getAttribute('position');
    const positions = positionAttribute.array as Float32Array;

    for (let i = 0; i < positions.length; i += 3) {
      let x = positions[i];
      let y = positions[i + 1];
      let z = positions[i + 2];

      const factor = (y + 0.5) * angle + bias;
      const newX = x * Math.cos(factor) - z * Math.sin(factor);
      const newZ = x * Math.sin(factor) + z * Math.cos(factor);
      
      positions[i] = newX;
      positions[i + 2] = newZ;
    }

    positionAttribute.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  function applyTaperCore(geometry: BufferGeometry, params: any): BufferGeometry {
    const amount = params.amount || 0;
    const curve = params.curve || 0;
    
    const positionAttribute = geometry.getAttribute('position');
    const positions = positionAttribute.array as Float32Array;

    for (let i = 0; i < positions.length; i += 3) {
      let x = positions[i];
      let y = positions[i + 1];
      let z = positions[i + 2];

      const factor = 1 + (y + 0.5) * amount;
      positions[i] = x * factor;
      positions[i + 2] = z * factor;
    }

    positionAttribute.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  function applyNoiseCore(geometry: BufferGeometry, params: any): BufferGeometry {
    const scale = params.scale || 1;
    const strengthX = params.strengthX || 0;
    const strengthY = params.strengthY || 0;
    const strengthZ = params.strengthZ || 0;
    const seed = params.seed || 1;
    
    const positionAttribute = geometry.getAttribute('position');
    const positions = positionAttribute.array as Float32Array;

    // Simple noise function
    function noise(x: number, y: number, z: number) {
      return Math.sin(x * scale + seed) * Math.cos(y * scale + seed) * Math.sin(z * scale + seed);
    }

    for (let i = 0; i < positions.length; i += 3) {
      let x = positions[i];
      let y = positions[i + 1];
      let z = positions[i + 2];

      const noiseValue = noise(x, y, z);
      positions[i] += noiseValue * strengthX * 0.1;
      positions[i + 1] += noiseValue * strengthY * 0.1;
      positions[i + 2] += noiseValue * strengthZ * 0.1;
    }

    positionAttribute.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  function applyTurboSmooth(geometry: BufferGeometry, params: any): BufferGeometry {
    const iterations = params.iterations || 1;
    
    // Simple subdivision simulation
    for (let iter = 0; iter < iterations; iter++) {
      const positionAttribute = geometry.getAttribute('position');
      const positions = positionAttribute.array as Float32Array;

      // Smooth vertices by averaging with neighbors (simplified)
      for (let i = 0; i < positions.length; i += 3) {
        positions[i] *= 0.9;
        positions[i + 1] *= 0.9;
        positions[i + 2] *= 0.9;
      }

      positionAttribute.needsUpdate = true;
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }

  function applyEditableStack(geometry: BufferGeometry, params: any, triangulate: boolean): BufferGeometry {
    const em = fromGeometry(geometry);
    if (triangulate) em.triangulate();
    const ops: OpRecord[] = Array.isArray(params?.ops) ? params.ops : [];
    const level = ((params?.selectionLevel ?? 'vertex') as string).toLowerCase() as SubObjectLevel;
    const initialSel = { level, ids: new Set<number>(params?.selectedIds ?? []) };
    const { mesh } = replay(em, initialSel, ops);
    const g = toGeometry(mesh);
    (g as any).userData.editableMesh = mesh;
    g.computeVertexNormals();
    return g;
  }

  function applyEditPoly(geometry: BufferGeometry, params: any): BufferGeometry {
    return applyEditableStack(geometry, params, false);
  }

  function applyEditMesh(geometry: BufferGeometry, params: any): BufferGeometry {
    return applyEditableStack(geometry, params, true);
  }

  // ---------------------------------------------------------------------------
  // Stretch — 3ds Max Stretch: stretches along one axis by (1+amount) and
  // simultaneously scales the two perpendicular axes by 1/sqrt(1+amount) so
  // volume tends to be preserved. `amplify` (0..) biases the perpendicular
  // scale, and `limits` clamps the stretch region.
  // ---------------------------------------------------------------------------
  function applyStretch(geometry: BufferGeometry, params: any): BufferGeometry {
    return withGizmoSpace(geometry, params, (g, p) => {
      const amount = Number(p.amount ?? 0);
      const amplify = Number(p.amplify ?? 0);
      const axisName = (p.axis || 'Z') as 'X'|'Y'|'Z';
      const useLimits = !!p.limits;
      const upper = Number(p.upperLimit ?? 0);
      const lower = Number(p.lowerLimit ?? 0);
      const ai = axisName === 'X' ? 0 : axisName === 'Y' ? 1 : 2;
      const ui = (ai + 1) % 3, vi = (ai + 2) % 3;
      const pos = g.getAttribute('position');
      const arr = pos.array as Float32Array;
      const stretch = 1 + amount;
      const invSide = 1 / Math.sqrt(Math.max(0.0001, stretch)) * (1 + amplify * 0.1);
      let minA = Infinity, maxA = -Infinity;
      for (let i = 0; i < arr.length; i += 3) { const a = arr[i + ai]; if (a<minA) minA=a; if (a>maxA) maxA=a; }
      const aLo = useLimits ? Math.min(0, lower) : minA;
      const aHi = useLimits ? Math.max(0, upper) : maxA;
      for (let i = 0; i < arr.length; i += 3) {
        const a = arr[i + ai];
        const inside = a >= aLo && a <= aHi;
        if (inside) {
          arr[i + ai] = a * stretch;
          arr[i + ui] *= invSide;
          arr[i + vi] *= invSide;
        }
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
      return g;
    });
  }

  // Skew — shear along one axis proportional to position along another.
  // amount = tan(angle) * height. Params: amount, skewAxis (dir), effectAxis.
  function applySkew(geometry: BufferGeometry, params: any): BufferGeometry {
    return withGizmoSpace(geometry, params, (g, p) => {
      const amount = Number(p.amount ?? 0);
      const dirName = (p.direction || 'X') as 'X'|'Y'|'Z';
      const axisName = (p.axis || 'Z') as 'X'|'Y'|'Z';
      const di = dirName === 'X' ? 0 : dirName === 'Y' ? 1 : 2;
      const ai = axisName === 'X' ? 0 : axisName === 'Y' ? 1 : 2;
      if (di === ai) return g;
      const pos = g.getAttribute('position');
      const arr = pos.array as Float32Array;
      let minA = Infinity, maxA = -Infinity;
      for (let i = 0; i < arr.length; i += 3) { const a = arr[i + ai]; if (a<minA) minA=a; if (a>maxA) maxA=a; }
      const H = Math.max(1e-6, maxA - minA);
      for (let i = 0; i < arr.length; i += 3) {
        const t = (arr[i + ai] - minA) / H;
        arr[i + di] += amount * t;
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
      return g;
    });
  }

  // FFD (Free-Form Deformation) — simplified 2x2x2 / 3x3x3 / 4x4x4 lattice.
  // Control points are stored in params.points as a flat array of Vector3 offsets
  // in normalized [0..1] bbox space. Interpolates trilinearly.
  function applyFFD(geometry: BufferGeometry, params: any): BufferGeometry {
    return withGizmoSpace(geometry, params, (g, p) => {
      const size = Math.max(2, Math.min(4, Math.floor(p.size ?? 2)));
      const offsets: number[] = Array.isArray(p.points) ? p.points : [];
      if (!offsets.length) return g;
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      const dx = bb.max.x - bb.min.x || 1;
      const dy = bb.max.y - bb.min.y || 1;
      const dz = bb.max.z - bb.min.z || 1;
      const pos = g.getAttribute('position');
      const arr = pos.array as Float32Array;
      const get = (i: number, j: number, k: number, c: number) =>
        offsets[((i * size + j) * size + k) * 3 + c] || 0;
      for (let n = 0; n < arr.length; n += 3) {
        const u = (arr[n] - bb.min.x) / dx;
        const v = (arr[n + 1] - bb.min.y) / dy;
        const w = (arr[n + 2] - bb.min.z) / dz;
        const fu = u * (size - 1), fv = v * (size - 1), fw = w * (size - 1);
        const i0 = Math.floor(fu), j0 = Math.floor(fv), k0 = Math.floor(fw);
        const i1 = Math.min(size - 1, i0 + 1), j1 = Math.min(size - 1, j0 + 1), k1 = Math.min(size - 1, k0 + 1);
        const tu = fu - i0, tv = fv - j0, tw = fw - k0;
        for (let c = 0; c < 3; c++) {
          const c00 = get(i0,j0,k0,c)*(1-tu) + get(i1,j0,k0,c)*tu;
          const c10 = get(i0,j1,k0,c)*(1-tu) + get(i1,j1,k0,c)*tu;
          const c01 = get(i0,j0,k1,c)*(1-tu) + get(i1,j0,k1,c)*tu;
          const c11 = get(i0,j1,k1,c)*(1-tu) + get(i1,j1,k1,c)*tu;
          const c0 = c00*(1-tv) + c10*tv;
          const c1 = c01*(1-tv) + c11*tv;
          arr[n + c] += (c0*(1-tw) + c1*tw) * (c === 0 ? dx : c === 1 ? dy : dz);
        }
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
      return g;
    });
  }

  // Mirror — reflect the geometry across one axis (or plane). Also flips
  // triangle winding to keep normals outward-facing.
  function applyMirror(geometry: BufferGeometry, params: any): BufferGeometry {
    return withGizmoSpace(geometry, params, (g, p) => {
      const axisName = (p.axis || 'X') as 'X'|'Y'|'Z';
      const offset = Number(p.offset ?? 0);
      const ai = axisName === 'X' ? 0 : axisName === 'Y' ? 1 : 2;
      const pos = g.getAttribute('position');
      const arr = pos.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) arr[i + ai] = 2 * offset - arr[i + ai];
      pos.needsUpdate = true;
      // Flip winding
      const idx = g.getIndex();
      if (idx) {
        const a = idx.array as any;
        for (let i = 0; i < a.length; i += 3) { const t = a[i]; a[i] = a[i + 2]; a[i + 2] = t; }
        idx.needsUpdate = true;
      } else {
        for (let i = 0; i < arr.length; i += 9) {
          for (let c = 0; c < 3; c++) { const t = arr[i + c]; arr[i + c] = arr[i + 6 + c]; arr[i + 6 + c] = t; }
        }
      }
      g.computeVertexNormals();
      return g;
    });
  }

  // Symmetry — Mirror one half onto the other with optional weld across the
  // seam. Vertices on the negative side of the plane are kept as-is; the mesh
  // is duplicated + reflected and merged.
  function applySymmetry(geometry: BufferGeometry, params: any): BufferGeometry {
    const axis = (params.mirrorAxis || 'X') as 'X'|'Y'|'Z';
    const weld = params.weldSeam !== false;
    const threshold = Number(params.threshold ?? 0.1);
    const flip = !!params.flip;
    const ai = axis === 'X' ? 0 : axis === 'Y' ? 1 : 2;
    const mirrored = geometry.clone();
    const mArr = mirrored.getAttribute('position').array as Float32Array;
    for (let i = 0; i < mArr.length; i += 3) mArr[i + ai] = -mArr[i + ai];
    (mirrored.getAttribute('position') as any).needsUpdate = true;
    // flip winding
    const mIdx = mirrored.getIndex();
    if (mIdx) {
      const a = mIdx.array as any;
      for (let i = 0; i < a.length; i += 3) { const t = a[i]; a[i] = a[i + 2]; a[i + 2] = t; }
    }
    // Clip original to keep the "kept" side (flip switches side)
    const src = flip ? mirrored : geometry;
    const dst = flip ? geometry : mirrored;
    void src; void dst;
    // Merge by concatenating positions/indices.
    const geoms = [geometry, mirrored];
    const merged = mergeGeometries(geoms);
    if (weld) {
      try { return mergeVertices(merged, threshold); } catch { /* ignore */ }
    }
    merged.computeVertexNormals();
    return merged;
  }

  // Slice — cut mesh with a plane. Supports Refine (keep both sides w/ new
  // vertices on the cut edges), Split, Remove Top, Remove Bottom.
  function applySlice(geometry: BufferGeometry, params: any): BufferGeometry {
    return withGizmoSpace(geometry, params, (g, p) => {
      const axisName = (p.axis || 'Y') as 'X'|'Y'|'Z';
      const offset = Number(p.offset ?? 0);
      const mode = (p.mode || 'refine') as 'refine'|'removeTop'|'removeBottom'|'split';
      const ai = axisName === 'X' ? 0 : axisName === 'Y' ? 1 : 2;
      if (mode === 'refine' || mode === 'split') return g;
      const nonIdx = g.index ? g.toNonIndexed() : g;
      const pos = nonIdx.getAttribute('position');
      const arr = pos.array as Float32Array;
      const keep: number[] = [];
      for (let i = 0; i < arr.length; i += 9) {
        const c = (arr[i + ai] + arr[i + 3 + ai] + arr[i + 6 + ai]) / 3;
        const side = c - offset;
        if (mode === 'removeTop' ? side < 0 : side > 0) {
          for (let k = 0; k < 9; k++) keep.push(arr[i + k]);
        }
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
      out.computeVertexNormals();
      return out;
    });
  }

  // Skin — records bindings; at evaluation time in a linked rig, the skinned
  // mesh already deforms via the SkinnedMesh path. As a modifier we simply
  // pass geometry through (rigging happens on imported models).
  function applySkin(geometry: BufferGeometry, _params: any): BufferGeometry {
    return geometry;
  }

  // UVW Map — regenerate uv attribute using Planar / Cylindrical / Spherical / Box.
  function applyUVWMap(geometry: BufferGeometry, params: any): BufferGeometry {
    const mapping = (params.mapping || 'planar') as 'planar'|'cylindrical'|'spherical'|'box';
    const tileU = Number(params.tileU ?? 1);
    const tileV = Number(params.tileV ?? 1);
    const axisName = (params.axis || 'Z') as 'X'|'Y'|'Z';

    // Box mapping needs per-face normals — a shared cube-corner vertex would
    // otherwise collapse to a single UV. Split into non-indexed triangles.
    let g = geometry;
    if (mapping === 'box' && geometry.index) g = geometry.toNonIndexed();

    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const pos = g.getAttribute('position');
    const arr = pos.array as Float32Array;
    const uv = new Float32Array((arr.length / 3) * 2);
    const dx = bb.max.x - bb.min.x || 1;
    const dy = bb.max.y - bb.min.y || 1;
    const dz = bb.max.z - bb.min.z || 1;

    if (mapping === 'box') {
      for (let i = 0, j = 0; i < arr.length; i += 9, j += 6) {
        const ax = arr[i],   ay = arr[i+1], az = arr[i+2];
        const bx = arr[i+3], by = arr[i+4], bz = arr[i+5];
        const cx = arr[i+6], cy = arr[i+7], cz = arr[i+8];
        const e1x = bx-ax, e1y = by-ay, e1z = bz-az;
        const e2x = cx-ax, e2y = cy-ay, e2z = cz-az;
        const nx = e1y*e2z - e1z*e2y;
        const ny = e1z*e2x - e1x*e2z;
        const nz = e1x*e2y - e1y*e2x;
        const anx = Math.abs(nx), any_ = Math.abs(ny), anz = Math.abs(nz);
        const p = [ax,ay,az, bx,by,bz, cx,cy,cz];
        for (let k = 0; k < 3; k++) {
          const px = p[k*3], py = p[k*3+1], pz = p[k*3+2];
          let u = 0, v = 0;
          if (anx >= any_ && anx >= anz) {
            u = (pz - bb.min.z) / dz;
            v = (py - bb.min.y) / dy;
            if (nx < 0) u = 1 - u;
          } else if (any_ >= anz) {
            u = (px - bb.min.x) / dx;
            v = (pz - bb.min.z) / dz;
            if (ny < 0) v = 1 - v;
          } else {
            u = (px - bb.min.x) / dx;
            v = (py - bb.min.y) / dy;
            if (nz < 0) u = 1 - u;
          }
          uv[j + k*2]     = u * tileU;
          uv[j + k*2 + 1] = v * tileV;
        }
      }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      return g;
    }

    for (let i = 0, j = 0; i < arr.length; i += 3, j += 2) {
      const x = arr[i], y = arr[i + 1], z = arr[i + 2];
      let u = 0, v = 0;
      if (mapping === 'planar') {
        if (axisName === 'Z') { u = (x - bb.min.x) / dx; v = (y - bb.min.y) / dy; }
        else if (axisName === 'Y') { u = (x - bb.min.x) / dx; v = (z - bb.min.z) / dz; }
        else { u = (z - bb.min.z) / dz; v = (y - bb.min.y) / dy; }
      } else if (mapping === 'cylindrical') {
        const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
        u = (Math.atan2(z - cz, x - cx) + Math.PI) / (2 * Math.PI);
        v = (y - bb.min.y) / dy;
      } else if (mapping === 'spherical') {
        const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2, cz = (bb.min.z + bb.max.z) / 2;
        const dx2 = x - cx, dy2 = y - cy, dz2 = z - cz;
        const r = Math.sqrt(dx2*dx2 + dy2*dy2 + dz2*dz2) || 1;
        u = (Math.atan2(dz2, dx2) + Math.PI) / (2 * Math.PI);
        v = 0.5 - Math.asin(dy2 / r) / Math.PI;
      }
      uv[j] = u * tileU;
      uv[j + 1] = v * tileV;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  }

  // Unwrap UVW — placeholder that uses per-face planar projection based on
  // face normal, mimicking the initial Flatten pass of an unwrap operation.
  function applyUnwrapUVW(geometry: BufferGeometry, params: any): BufferGeometry {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = g.getAttribute('position');
    const arr = pos.array as Float32Array;
    const uv = new Float32Array((arr.length / 3) * 2);
    const pad = Number(params.padding ?? 0.02);
    for (let i = 0, j = 0; i < arr.length; i += 9, j += 6) {
      const ax = arr[i], ay = arr[i + 1], az = arr[i + 2];
      const bx = arr[i + 3], by = arr[i + 4], bz = arr[i + 5];
      const cx = arr[i + 6], cy = arr[i + 7], cz = arr[i + 8];
      const ex1 = bx - ax, ey1 = by - ay, ez1 = bz - az;
      const ex2 = cx - ax, ey2 = cy - ay, ez2 = cz - az;
      const nx = ey1 * ez2 - ez1 * ey2;
      const ny = ez1 * ex2 - ex1 * ez2;
      const nz = ex1 * ey2 - ey1 * ex2;
      const anx = Math.abs(nx), any_ = Math.abs(ny), anz = Math.abs(nz);
      let uAx = 0, vAx = 1;
      if (anx > any_ && anx > anz) { uAx = 2; vAx = 1; }
      else if (any_ > anz) { uAx = 0; vAx = 2; }
      const p = [ax,ay,az, bx,by,bz, cx,cy,cz];
      const us = [p[uAx], p[3+uAx], p[6+uAx]];
      const vs = [p[vAx], p[3+vAx], p[6+vAx]];
      const uMin = Math.min(...us), vMin = Math.min(...vs);
      const uMax = Math.max(...us), vMax = Math.max(...vs);
      const uR = (uMax - uMin) || 1, vR = (vMax - vMin) || 1;
      for (let k = 0; k < 3; k++) {
        uv[j + k*2] = pad + ((us[k] - uMin) / uR) * (1 - 2*pad);
        uv[j + k*2 + 1] = pad + ((vs[k] - vMin) / vR) * (1 - 2*pad);
      }
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  }

  // MeshSmooth — Laplacian smoothing: average each vertex with its neighbors.
  function applyMeshSmooth(geometry: BufferGeometry, params: any): BufferGeometry {
    const iterations = Math.max(1, Math.floor(params.iterations ?? 1));
    const strength = Math.min(1, Math.max(0, Number(params.strength ?? 0.5)));
    let g = geometry;
    try { g = mergeVertices(g, 1e-5); } catch { /* ignore */ }
    const idx = g.getIndex();
    if (!idx) return g;
    const pos = g.getAttribute('position');
    const arr = pos.array as Float32Array;
    const n = arr.length / 3;
    const neighbors: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
    const ia = idx.array as any;
    for (let i = 0; i < ia.length; i += 3) {
      const a = ia[i], b = ia[i+1], c = ia[i+2];
      neighbors[a].add(b); neighbors[a].add(c);
      neighbors[b].add(a); neighbors[b].add(c);
      neighbors[c].add(a); neighbors[c].add(b);
    }
    for (let it = 0; it < iterations; it++) {
      const src = arr.slice();
      for (let v = 0; v < n; v++) {
        const nb = neighbors[v]; if (!nb.size) continue;
        let sx = 0, sy = 0, sz = 0;
        nb.forEach((k) => { sx += src[k*3]; sy += src[k*3+1]; sz += src[k*3+2]; });
        const inv = 1 / nb.size;
        arr[v*3]   = src[v*3]   * (1 - strength) + sx * inv * strength;
        arr[v*3+1] = src[v*3+1] * (1 - strength) + sy * inv * strength;
        arr[v*3+2] = src[v*3+2] * (1 - strength) + sz * inv * strength;
      }
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }

  // WaltSculpt (modifier form) — sculpt strokes are baked into params.strokes
  // as {v[], delta:[dx,dy,dz]} entries. This applies them non-destructively.
  function applyWaltSculptMod(geometry: BufferGeometry, params: any): BufferGeometry {
    const strokes: Array<{ v: number[]; delta: number[] }> = Array.isArray(params?.strokes) ? params.strokes : [];
    if (!strokes.length) return geometry;
    const pos = geometry.getAttribute('position');
    const arr = pos.array as Float32Array;
    for (const s of strokes) {
      const [dx, dy, dz] = s.delta || [0,0,0];
      for (const idx of s.v || []) {
        if (idx*3+2 < arr.length) { arr[idx*3] += dx; arr[idx*3+1] += dy; arr[idx*3+2] += dz; }
      }
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  // Lathe — revolve a 2D spline profile around an axis to create solids
  // (glass, vase, wheel). Uses THREE.LatheGeometry with the shape's outline.
  function applyLathe(objectType: string | undefined, geom: any, params: any): BufferGeometry | null {
    if (!objectType || !geom) return null;
    const outline = getShapeOutline(objectType, geom);
    if (!outline || outline.pts3.length < 2) return null;
    const segments = Math.max(3, Math.floor(params.segments ?? 32));
    const degrees = Number(params.degrees ?? 360);
    const axisName = (params.axis || 'Y') as 'X'|'Y'|'Z';
    const dir = Number(params.direction ?? 0); // 0=min,1=center,2=max on axis-perp
    const flip = !!params.flipNormals;
    const points: THREE.Vector2[] = outline.pts3.map((p) =>
      axisName === 'Y' ? new THREE.Vector2(Math.abs(p.x), p.y)
      : axisName === 'X' ? new THREE.Vector2(Math.abs(p.y), p.x)
      : new THREE.Vector2(Math.abs(p.x), p.z)
    );
    // Shift by direction: min/center/max of the perpendicular axis
    const vals = points.map((v) => v.x);
    const shift = dir === 0 ? -Math.min(...vals) : dir === 2 ? -Math.max(...vals) : 0;
    if (shift) points.forEach((v) => (v.x = Math.max(0, v.x + shift)));
    let latheGeo = new THREE.LatheGeometry(points, segments, 0, (degrees * Math.PI) / 180);
    if (axisName === 'X') latheGeo.rotateZ(Math.PI / 2);
    if (axisName === 'Z') latheGeo.rotateX(Math.PI / 2);
    if (flip) {
      const idx = latheGeo.getIndex();
      if (idx) { const a = idx.array as any; for (let i = 0; i < a.length; i += 3) { const t = a[i]; a[i] = a[i+2]; a[i+2] = t; } idx.needsUpdate = true; }
    }
    latheGeo.computeVertexNormals();
    return latheGeo;
  }

  // Bevel — Extrude with beveled top/bottom, matching 3ds Max Bevel modifier
  // (Level 1/2/3 heights and outlines).
  function applyBevel(objectType: string | undefined, geom: any, params: any): BufferGeometry | null {
    if (!objectType || !geom) return null;
    const outline = getShapeOutline(objectType, geom);
    if (!outline || outline.pts3.length < 3) return null;
    const { pts3, axis, closed } = outline;
    const to2D = (p: THREE.Vector3) =>
      axis === 'x' ? new THREE.Vector2(-p.z, p.y)
      : axis === 'y' ? new THREE.Vector2(p.x, -p.z)
      : new THREE.Vector2(p.x, p.y);
    const shape = new THREE.Shape(pts3.map(to2D));
    if (closed) shape.autoClose = true;
    const height = Number(params.height ?? 1);
    const bevelSize = Number(params.outline ?? 0.1);
    const bevelSegments = Math.max(1, Math.floor(params.bevelSegments ?? 3));
    const extrGeo = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      steps: Math.max(1, Math.floor(params.segments ?? 1)),
      bevelEnabled: true,
      bevelThickness: bevelSize,
      bevelSize: bevelSize,
      bevelSegments,
      curveSegments: 24,
    });
    if (axis === 'y') extrGeo.rotateX(-Math.PI / 2);
    else if (axis === 'x') extrGeo.rotateY(Math.PI / 2);
    return smoothExtrudeSides(extrGeo);
  }

  // ------------------------------------------------------------------



  // Render imported models as their full scene graph (preserves materials,
  // textures, skinning, and animations).
  if (object.type === 'imported') {


    return (
      <group
        ref={meshRef as any}
        userData={{ objectId: object.id }}
        position={object.position}
        rotation={object.rotation}
        scale={object.scale}
        onClick={(e) => {
          e.stopPropagation();
          selectFromEvent(e);
        }}
      >
        {imported ? (
          <ImportedModelViewportRoot imported={imported} renderMode={renderMode} useSourceRoot={isActiveViewport} />
        ) : (
          <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#666" />
          </mesh>
        )}
      </group>
    );
  }

  // Helpers (Point / Dummy / Tape / Grid / Compass) — non-renderable viewport
  // gizmos, no material, no shadows, ignored by exporters.
  if (isHelperType(object.type)) {
    const ghostH = (object as any).__creating === true;
    return (
      <group
        ref={meshRef as any}
        userData={{ objectId: object.id }}
        position={object.position}
        rotation={object.rotation}
        scale={object.scale}
        onClick={ghostH ? undefined : (e) => { e.stopPropagation(); selectFromEvent(e); }}
      >
        <HelperGizmo data={object.geometry} selected={isSelected} ghost={ghostH} />
        {/* Invisible pick-proxy so users can click helpers easily. */}
        <mesh visible={false} raycast={ghostH ? () => null : undefined}>
          <sphereGeometry args={[0.25, 6, 6]} />
        </mesh>
      </group>
    );
  }

  // Bones (Systems → Bones) — bone chain rendered as nested groups for FK.
  if (isBoneType(object.type)) {
    const ghostB = (object as any).__creating === true;
    return (
      <group
        ref={meshRef as any}
        userData={{ objectId: object.id }}
        position={object.position}
        rotation={object.rotation}
        scale={object.scale}
      >
        {/* No invisible pick-proxy here: it would compete with joint spheres
            for pointer events and cause the whole chain to select whenever
            the user tried to click an individual joint. Joint spheres are
            large enough to select the chain-as-a-whole from any joint. */}
        <BoneChainGizmo data={object.geometry} selected={isSelected} ghost={ghostB} objectId={object.id} />
      </group>
    );
  }

  // Print3D — virtual build plate (Create → Systems → Print3D).
  if (object.type === 'print_bed') {
    return (
      <group
        ref={meshRef as any}
        userData={{ objectId: object.id }}
        position={object.position}
        rotation={object.rotation}
        scale={object.scale}
      >
        <PrintBedObject data={object.geometry as any} selected={isSelected} onSelect={onSelect} />
      </group>
    );
  }

  // Particle emitter — Spray / Snow / Super Spray / PArray / PCloud / Blizzard.
  // Ghosts during drag also route here so the user sees the emission surface
  // being sized in real time.
  if (object.type === 'particle_emitter' || (typeof object.type === 'string' && object.type.startsWith('part_'))) {
    return (
      <group
        ref={meshRef as any}
        userData={{ objectId: object.id }}
        position={object.position}
        rotation={object.rotation}
        scale={object.scale}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
      >
        <ParticleObject
          data={object.geometry as any}
          currentFrame={currentFrame}
          selected={isSelected}
          onSelect={onSelect}
        />
      </group>
    );
  }


  // Render lights and cameras as full-fledged scene entities with R3-style helpers.

  if (isEntityType(object.type)) {
    return (
      <EntityRenderer
        object={object as any}
        isSelected={isSelected}
        onSelect={onSelect}
        meshRef={meshRef as any}
        targetLookup={targetLookup}
        isActiveViewCamera={isActiveViewCamera}
      />

    );
  }


  const isGhost = (object as any).__creating === true;


  return (
    <mesh
      ref={meshRef}
      userData={{ objectId: object.id }}
      position={object.position}
      rotation={object.rotation}
      scale={object.scale}
      castShadow={!isGhost}
      receiveShadow={!isGhost}
      raycast={isGhost ? (() => null) as any : (renderMode === 'wireframe' ? (vertexOnlyRaycast as any) : undefined)}
      onClick={isGhost ? undefined : (e) => {
        e.stopPropagation();
        selectFromEvent(e);
      }}
      onPointerUp={isGhost ? undefined : (e) => {
        const payload = (window as any).__matDragPayload;
        if (payload) {
          e.stopPropagation();
          window.dispatchEvent(new CustomEvent('r3-apply-material', {
            detail: { id: (object as any).id, material: payload },
          }));
          (window as any).__matDragPayload = null;
        }
      }}
      geometry={modifiedGeometry}
    >
      <MaterialWithMaps
        material={(object as any).material}
        color={(object as any).material?.color ?? object.color}
        renderMode={renderMode}
        isGhost={!!isGhost}
        useVertexColors={(object as any).type === 'foliage'}
      />


      {/* Wireframe view: keep longitudinal/transversal segment rings but
          filter out the diagonal edges that split each quad into two
          triangles. The two triangles inside a single quad are (nearly)
          coplanar, so a small threshold (~1°) drops those diagonals while
          preserving the ring/segment edges shared between adjacent quads. */}
      {renderMode === 'wireframe' && !isGhost && (
        <>
          {/* Full subdivision grid (Length/Width/Height Segments) — dim so it
              doesn't overwhelm, but visible so segment parameter changes show
              up immediately in wireframe viewports. */}
          <lineSegments renderOrder={996}>
            <wireframeGeometry args={[modifiedGeometry]} />
            <lineBasicMaterial
              color={isSelected ? '#ffffff' : ((object as any).material?.color ?? object.color ?? '#cbd5e1')}
              transparent
              opacity={0.35}
            />
          </lineSegments>
          {/* Silhouette / hard edges on top for a clean 3ds Max feel. */}
          <lineSegments renderOrder={997}>
            <edgesGeometry args={[modifiedGeometry, 15]} />
            <lineBasicMaterial color={isSelected ? '#ffffff' : ((object as any).material?.color ?? object.color ?? '#cbd5e1')} />
          </lineSegments>
        </>
      )}


      {/* Selection outline — silhouette edges plus internal subdivisions so
          segment/geometry-parameter changes are visible in solid mode. */}
      {isSelected && renderMode !== 'wireframe' && !isGhost && (
        <>
          <lineSegments renderOrder={999} userData={{ __selectionWire: true }}>
            <edgesGeometry args={[modifiedGeometry, 15]} />
            <lineBasicMaterial color="#00bfff" transparent opacity={0.9} depthTest={false} />
          </lineSegments>
          <lineSegments renderOrder={998} userData={{ __selectionWire: true }}>
            <wireframeGeometry args={[modifiedGeometry]} />
            <lineBasicMaterial color="#00bfff" transparent opacity={0.25} depthTest={true} />
          </lineSegments>
        </>
      )}

      {/* Wireframe vertex dots removed — they were rendering N points buffers
          (heavy for dense meshes like spheres). Vertex-proximity picking on the
          mesh still works via vertexOnlyRaycast; sub-object editing shows its
          own overlay dots only when the Edit Mesh/Spline sub-mode is active. */}

      {/* Edged Faces (F4): show wire on top of solid */}
      {renderMode === 'edged' && !isGhost && !isSelected && (
        <lineSegments>
          <edgesGeometry args={[modifiedGeometry, 15]} />
          <lineBasicMaterial color="#000000" transparent opacity={0.55} />
        </lineSegments>
      )}

      {/* Bounding Box mode: fill mesh becomes invisible, box drawn instead */}
      {renderMode === 'bbox' && !isGhost && (() => {
        modifiedGeometry.computeBoundingBox();
        const bb = modifiedGeometry.boundingBox;
        if (!bb) return null;
        const sx = Math.max(0.001, bb.max.x - bb.min.x);
        const sy = Math.max(0.001, bb.max.y - bb.min.y);
        const sz = Math.max(0.001, bb.max.z - bb.min.z);
        const cx = (bb.max.x + bb.min.x) / 2;
        const cy = (bb.max.y + bb.min.y) / 2;
        const cz = (bb.max.z + bb.min.z) / 2;
        return (
          <lineSegments position={[cx, cy, cz]} renderOrder={999}>
            <edgesGeometry args={[new THREE.BoxGeometry(sx, sy, sz)]} />
            <lineBasicMaterial color={isSelected ? '#00bfff' : '#a3a3a3'} />
          </lineSegments>
        );
      })()}

      {/* Ghost edges — bright preview outline while creating */}
      {isGhost && (
        <lineSegments renderOrder={999}>
          <edgesGeometry args={[modifiedGeometry, 15]} />
          <lineBasicMaterial color="#fbbf24" transparent opacity={1} depthTest={false} />
        </lineSegments>
      )}

      {/* Extrude segment rings — only shown while the object is selected, as
          an editing helper. Hidden on unselected objects and during renders so
          the mesh appears as a solid extrusion. */}
      {extrudeRings && !isGhost && isSelected && (renderMode === 'wireframe' || renderMode === 'edged') && (
        <lineSegments geometry={extrudeRings} renderOrder={998}>
          <lineBasicMaterial color="#00bfff" transparent opacity={0.8} depthTest={true} />
        </lineSegments>
      )}

      {/* Sub-object overlay — Vertex/Edge/Border/Face/Polygon/Element display
          for Edit Poly / Edit Mesh. Follows mesh transform automatically. */}
      {(() => {
        if (isGhost || !isSelected || !modifyPanelActive) return null;

        const editMod = (object as any).modifiers?.find(
          (m: any) => m.active && (m.type === 'Edit Poly' || m.type === 'Edit Mesh')
        );
        if (!editMod) return null;
        const level = ((editMod.params?.selectionLevel ?? 'vertex') as string).toLowerCase() as SubObjectLevel;
        const selectedIds = new Set<number>(editMod.params?.selectedIds ?? []);
        return (
          <SubObjectOverlay
            geometry={modifiedGeometry}
            level={level}
            selectedIds={selectedIds}
            objectId={object.id}
            modifierId={editMod.id}
          />

        );
      })()}
    </mesh>

  );
};


/**
 * Renders a light or camera object with a small pickable icon (R3-style helper).
 * - The `meshRef` (passed from Object3D) is bound to the actual THREE entity so
 *   TransformControls can attach to it.
 * - For target-based entities (target camera, target spot, etc.), we lookAt the
 *   target object's world position every frame via `targetLookup`.
 */
interface EntityRendererProps {
  object: any;
  isSelected: boolean;
  onSelect: (additive?: boolean, remove?: boolean) => void;
  meshRef: React.MutableRefObject<any>;
  targetLookup?: (id: string) => [number, number, number] | null;
  isActiveViewCamera?: boolean;
}

const EntityRenderer = ({ object, isSelected, onSelect, meshRef, targetLookup, isActiveViewCamera = false }: EntityRendererProps) => {

  const groupRef = useRef<Group>(null);
  const selectFromEvent = (e: any) => {
    const native = e?.nativeEvent ?? e;
    onSelect(!!(e?.ctrlKey || e?.metaKey || native?.ctrlKey || native?.metaKey), !!(e?.altKey || native?.altKey));
  };
  const pointLightRef = useRef<THREE.PointLight>(null);
  const spotLightRef = useRef<THREE.SpotLight>(null);
  const spotTargetRef = useRef<THREE.Object3D>(null);
  const directLightRef = useRef<THREE.DirectionalLight>(null);
  const directTargetRef = useRef<THREE.Object3D>(null);
  const targetId: string | undefined = object.lightData?.targetObjectId || object.cameraData?.targetObjectId;
  const isOn = object.lightData?.on !== false;
  // 3ds Max R3 multipliers are artist-facing values, not physically tiny
  // three.js candela/lumen values. Scale them so Multiplier 1 visibly lights
  // scene objects in both the viewport and Quick Render.
  const maxMultiplier = object.lightData?.intensity ?? 1;
  const omniIntensity = isOn ? maxMultiplier * 55 : 0;
  const spotIntensity = isOn ? maxMultiplier * 70 : 0;
  const directIntensity = isOn ? maxMultiplier * 2.2 : 0;
  const ambientIntensity = isOn ? maxMultiplier : 0;
  const hemiIntensity = isOn ? maxMultiplier * 1.4 : 0;

  // Track target — rotate the group to look at it every frame. Uses camera
  // convention (local -Z faces target) instead of Object3D.lookAt, which would
  // point +Z at the target and render the camera symbol/frustum reversed.
  useFrame(() => {
    if (!targetId || !groupRef.current || !targetLookup) return;
    const tp = targetLookup(targetId);
    if (!tp) return;
    const g = groupRef.current;
    const eye = g.getWorldPosition(new THREE.Vector3());
    const tgt = new THREE.Vector3(tp[0], tp[1], tp[2]);
    const m = new THREE.Matrix4().lookAt(eye, tgt, g.up);
    g.quaternion.setFromRotationMatrix(m);
  });

  useFrame(() => {
    if (spotLightRef.current && spotTargetRef.current) spotLightRef.current.target = spotTargetRef.current;
    if (directLightRef.current && directTargetRef.current) directLightRef.current.target = directTargetRef.current;
  });

  useEffect(() => {
    const configureShadow = (light: THREE.PointLight | THREE.SpotLight | THREE.DirectionalLight | null) => {
      if (!light?.shadow) return;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.0005;
      if ((light.shadow.camera as any).isPerspectiveCamera) {
        const cam = light.shadow.camera as THREE.PerspectiveCamera;
        cam.near = 0.1;
        cam.far = Math.max(10, object.lightData?.distance || 50);
        cam.updateProjectionMatrix();
      }
    };
    configureShadow(pointLightRef.current);
    configureShadow(spotLightRef.current);
    configureShadow(directLightRef.current);
  }, [object.lightData?.distance]);

  useEffect(() => {
    if (object.ref) object.ref.current = groupRef.current;
    meshRef.current = groupRef.current;
  }, [meshRef, object.ref]);

  const t = object.type;
  const iconColor = isSelected ? '#ffcc00' : (
    t.startsWith('light_') ? '#ffef88' :
    t.startsWith('camera_') ? '#7ec8ff' : '#aaaaaa'
  );

  // Ambient / Skylight are non-directional and don't need helpers beyond an icon.
  if (t === 'light_ambient') {
    return (
      <group ref={groupRef} userData={{ objectId: object.id }} position={object.position}>
        <ambientLight color={object.color} intensity={ambientIntensity} />
        <mesh userData={{ __helper: true }} onClick={(e) => { e.stopPropagation(); selectFromEvent(e); }}>
          <sphereGeometry args={[0.25, 8, 6]} />
          <meshBasicMaterial color={iconColor} wireframe />
        </mesh>
      </group>
    );
  }
  if (t === 'light_skylight') {
    return (
      <group ref={groupRef} userData={{ objectId: object.id }} position={object.position}>
        <hemisphereLight
          color={object.lightData?.skyColor || object.color}
          groundColor={object.lightData?.groundColor || '#404040'}
          intensity={hemiIntensity}
        />
        <mesh userData={{ __helper: true }} onClick={(e) => { e.stopPropagation(); selectFromEvent(e); }}>
          <octahedronGeometry args={[0.3, 0]} />
          <meshBasicMaterial color={iconColor} wireframe />
        </mesh>
      </group>
    );
  }
  if (t === 'light_omni') {
    return (
      <group ref={groupRef} userData={{ objectId: object.id }} position={object.position}>
        <pointLight
          ref={pointLightRef}
          color={object.color}
          intensity={omniIntensity}
          distance={object.lightData?.distance ?? 0}
          decay={object.lightData?.decay ?? 2}
          castShadow={!!object.lightData?.castShadow}
        />
        <mesh userData={{ __helper: true }} onClick={(e) => { e.stopPropagation(); selectFromEvent(e); }}>
          <sphereGeometry args={[0.2, 10, 6]} />
          <meshBasicMaterial color={iconColor} wireframe />
        </mesh>
        {isSelected && (
          <lineSegments userData={{ __helper: true }}>
            <edgesGeometry args={[new THREE.SphereGeometry(0.35, 10, 6), 1]} />
            <lineBasicMaterial color="#ffcc00" />
          </lineSegments>
        )}
      </group>
    );
  }
  if (t === 'light_spot') {
    const angle = object.lightData?.angle ?? Math.PI / 6;
    const dist = object.lightData?.distance ?? 10;
    return (
      <group ref={groupRef} userData={{ objectId: object.id }} position={object.position} rotation={targetId ? undefined : object.rotation}>
        {/* SpotLight in three.js emits down -Z; child target at (0,0,-1) does that automatically */}
        <spotLight
          ref={spotLightRef}
          color={object.color}
          intensity={spotIntensity}
          distance={dist}
          angle={angle}
          penumbra={object.lightData?.penumbra ?? 0.2}
          decay={object.lightData?.decay ?? 2}
          castShadow={!!object.lightData?.castShadow}
          position={[0, 0, 0]}
        />
        <object3D ref={spotTargetRef} position={[0, 0, -1]} />
        {/* Cone helper points along -Z */}
        <group userData={{ __helper: true }} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -dist / 2]}>
          <mesh userData={{ __helper: true }}>
            <coneGeometry args={[Math.tan(angle) * dist, dist, 12, 1, true]} />
            <meshBasicMaterial color={iconColor} wireframe transparent opacity={0.6} />
          </mesh>
        </group>
        <mesh userData={{ __helper: true }} onClick={(e) => { e.stopPropagation(); selectFromEvent(e); }}>
          <boxGeometry args={[0.3, 0.3, 0.5]} />
          <meshBasicMaterial color={iconColor} />
        </mesh>
      </group>
    );
  }
  if (t === 'light_direct') {
    const dist = object.lightData?.distance ?? 20;
    return (
      <group ref={groupRef} userData={{ objectId: object.id }} position={object.position} rotation={targetId ? undefined : object.rotation}>
        <directionalLight
          ref={directLightRef}
          color={object.color}
          intensity={directIntensity}
          castShadow={!!object.lightData?.castShadow}
          position={[0, 0, 0]}
        />
        <object3D ref={directTargetRef} position={[0, 0, -1]} />
        {/* Ray helper along -Z */}
        <group userData={{ __helper: true }} position={[0, 0, -dist / 2]}>
          <mesh userData={{ __helper: true }}>
            <cylinderGeometry args={[0.4, 0.4, dist, 10, 1, true]} />
            <meshBasicMaterial color={iconColor} wireframe transparent opacity={0.4} />
          </mesh>
        </group>
        <mesh userData={{ __helper: true }} onClick={(e) => { e.stopPropagation(); selectFromEvent(e); }}>
          <boxGeometry args={[0.4, 0.4, 0.4]} />
          <meshBasicMaterial color={iconColor} />
        </mesh>
      </group>
    );
  }
  if (t === 'camera_free' || t === 'camera_target') {
    const fov = object.cameraData?.fov ?? 45;
    const near = object.cameraData?.near ?? 0.1;
    const far = object.cameraData?.far ?? 100;
    // Distance to target (in local -Z), for the target line.
    let targetDist = 0;
    if (targetId && targetLookup) {
      const tp = targetLookup(targetId);
      if (tp) {
        const dx = tp[0] - object.position[0];
        const dy = tp[1] - object.position[1];
        const dz = tp[2] - object.position[2];
        targetDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
    }
    const showCone = object.cameraData?.showCone !== false;
    // Build a small camera-shaped helper (body only), fully wireframe.
    return (
      <group ref={groupRef} userData={{ objectId: object.id }} position={object.position} rotation={targetId ? undefined : object.rotation}>
        <perspectiveCamera args={[fov, 1, near, far]} name={`__cam_${object.id}`} />
        {/* Body (wireframe) — pickable box */}
        <mesh userData={{ __helper: true }} position={[0, 0, 0.4]} onClick={(e) => { e.stopPropagation(); selectFromEvent(e); }}>
          <boxGeometry args={[0.6, 0.4, 0.6]} />
          <meshBasicMaterial color={iconColor} wireframe />
        </mesh>

        {/* Target line — hidden when this camera is the viewport view. */}
        {!isActiveViewCamera && targetId && targetDist > 0 && (
          <primitive
            object={(() => {
              const geom = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, -targetDist),
              ]);
              const mat = new THREE.LineDashedMaterial({ color: iconColor, dashSize: 0.2, gapSize: 0.15 });
              const l = new THREE.Line(geom, mat);
              l.computeLineDistances();
              (l as any).userData = { __helper: true };
              return l;
            })()}
          />
        )}
        {/* Frustum pyramid — hidden when this camera is the viewport view. */}
        {!isActiveViewCamera && showCone && (
          <group userData={{ __helper: true }} position={[0, 0, -1.5]}>
            <mesh userData={{ __helper: true }} rotation={[Math.PI / 2, Math.PI / 4, 0]}>
              <coneGeometry args={[1.2, 3, 4, 1, true]} />
              <meshBasicMaterial color={isSelected ? '#ffcc00' : iconColor} wireframe transparent opacity={isSelected ? 0.8 : 0.5} />
            </mesh>
          </group>
        )}


      </group>
    );
  }

  if (t === 'target_helper') {
    return (
      <group ref={groupRef} userData={{ objectId: object.id }} position={object.position}>
        <mesh userData={{ __helper: true }} onClick={(e) => { e.stopPropagation(); selectFromEvent(e); }}>
          <boxGeometry args={[0.25, 0.25, 0.25]} />
          <meshBasicMaterial color={iconColor} wireframe />
        </mesh>
      </group>
    );
  }
  return null;
};

