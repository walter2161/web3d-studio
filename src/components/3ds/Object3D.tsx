import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, BufferGeometry, Vector3, Group, AnimationMixer, Object3D as ThreeObject3D } from 'three';
import * as THREE from 'three';
import { getImportedModel } from './utils/modelImport';
import { buildExtendedPrimitive, buildShape, ExtPrimType, ShapeType } from './utils/extendedGeometry';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// R3-style entity types
export const LIGHT_TYPES = ['light_omni', 'light_spot', 'light_direct', 'light_skylight', 'light_ambient'] as const;
export const CAMERA_TYPES = ['camera_free', 'camera_target'] as const;
export const TARGET_TYPES = ['target_helper'] as const;
export type LightType = typeof LIGHT_TYPES[number];
export type CameraType = typeof CAMERA_TYPES[number];
export const isLightType = (t: string): t is LightType => (LIGHT_TYPES as readonly string[]).includes(t);
export const isCameraType = (t: string): t is CameraType => (CAMERA_TYPES as readonly string[]).includes(t);
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
    const tex = loader.load(payload.url);
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
  material, color, renderMode, isGhost,
}: { material: any; color: string; renderMode: string; isGhost: boolean }) {
  const map = useBitmapTexture(material?.map, true);
  const bumpMap = useBitmapTexture(material?.bumpMap);
  const opacityMap = useBitmapTexture(material?.opacityMap);
  const emissiveMap = useBitmapTexture(material?.emissiveMap, true);
  const baseOpacity = material?.opacity ?? 1;
  const transparent = renderMode === 'semi-transparent' || renderMode === 'bbox' || isGhost || baseOpacity < 1 || !!opacityMap;
  const opacity = isGhost ? 0.55 : (renderMode === 'bbox' ? 0 : (renderMode === 'semi-transparent' ? 0.5 : baseOpacity));
  return (
    <meshStandardMaterial
      color={color}
      map={map || undefined}
      bumpMap={bumpMap || undefined}
      bumpScale={material?.bumpScale ?? 0.3}
      alphaMap={opacityMap || undefined}
      emissiveMap={emissiveMap || undefined}
      transparent={transparent}
      opacity={opacity}
      depthWrite={renderMode !== 'bbox'}
      wireframe={renderMode === 'wireframe'}
      metalness={material?.metalness ?? 0.15}
      roughness={material?.roughness ?? 0.55}
      emissive={material?.emissive ?? '#000000'}
      emissiveIntensity={material?.emissiveIntensity ?? 0}
      flatShading={false}
    />
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
  onSelect: () => void;
  renderMode: 'solid' | 'wireframe' | 'semi-transparent' | 'edged' | 'bbox';
  currentFrame?: number;
  totalFrames?: number;
  isPlaying?: boolean;
  targetLookup?: (id: string) => [number, number, number] | null;
  isActiveViewCamera?: boolean;
}



export const Object3D = ({ object, isSelected, onSelect, renderMode, currentFrame = 0, totalFrames = 100, isPlaying = false, targetLookup, isActiveViewCamera = false }: Object3DProps) => {

  const meshRef = useRef<Mesh>(null);


  // Update object ref — skip for lights/cameras/helpers, whose EntityRenderer
  // binds `object.ref` to its own group. Overwriting here with the (null) mesh
  // ref would break TransformControls attach for those entities.
  useEffect(() => {
    if (isEntityType(object.type)) return;
    if (object.ref) {
      object.ref.current = meshRef.current;
    }
  }, [object.ref, object.type]);

  // Imported model: cached scene graph + animations
  const imported = object.type === 'imported' ? getImportedModel(object.id) : undefined;
  const mixerRef = useRef<AnimationMixer | null>(null);
  const actionRef = useRef<THREE.AnimationAction | null>(null);
  const clipDurationRef = useRef<number>(0);

  useEffect(() => {
    if (!imported || imported.animations.length === 0) return;
    const mixer = new AnimationMixer(imported.root);
    const action = mixer.clipAction(imported.animations[0]);
    action.play();
    action.paused = true; // driven manually by timeline
    mixerRef.current = mixer;
    actionRef.current = action;
    clipDurationRef.current = imported.animations[0].duration;
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(imported.root);
      mixerRef.current = null;
      actionRef.current = null;
    };
  }, [imported]);

  // Drive animation from scene timeline
  useFrame(() => {
    const mixer = mixerRef.current;
    const action = actionRef.current;
    if (!mixer || !action) return;
    const duration = clipDurationRef.current || 0;
    if (duration <= 0) return;
    const t = totalFrames > 0 ? (currentFrame / totalFrames) : 0;
    const clipTime = (t * duration) % duration;
    action.time = clipTime;
    mixer.update(0);
  });


  // Apply modifiers to geometry (only for primitive types)
  const modifiedGeometry = useMemo(() => {
    if (object.type === 'imported') return new THREE.BufferGeometry();
    let geometry: BufferGeometry = createBaseGeometry(object.type, object.geometry);
    if (object.modifiers) {
      object.modifiers.forEach(modifier => {
        if (modifier.active) {
          geometry = applyModifier(geometry, modifier, object.type, object.geometry);
        }
      });
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

    // Sprint C — Extended Primitives
    const extPrims: ExtPrimType[] = ['hedra', 'chamferBox', 'chamferCyl', 'oilTank', 'spindle', 'gengon', 'torusKnot', 'ringWave', 'prism'];
    if (extPrims.includes(type as ExtPrimType)) {
      return buildExtendedPrimitive(type as ExtPrimType, geom);
    }
    // Sprint C — Shapes
    const shapes: ShapeType[] = ['line', 'rectangle', 'circle', 'ellipse', 'arc', 'donut', 'ngon', 'star', 'helix'];
    if (shapes.includes(type as ShapeType)) {
      return buildShape(type as ShapeType, geom);
    }

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
    const newGeometry = geometry.clone();

    switch (modifier.type) {
      case 'Bend':
        return applyBend(newGeometry, modifier.params);
      case 'Twist':
        return applyTwist(newGeometry, modifier.params);
      case 'Taper':
        return applyTaper(newGeometry, modifier.params);
      case 'Noise':
        return applyNoise(newGeometry, modifier.params);
      case 'TurboSmooth':
        return applyTurboSmooth(newGeometry, modifier.params);
      case 'Edit Poly':
        return applyEditPoly(newGeometry, modifier.params);
      case 'Edit Mesh':
        return applyEditMesh(newGeometry, modifier.params);
      default:
        return newGeometry;
    }
  }

  function applyExtrude(objectType: string | undefined, geom: any, params: any): BufferGeometry | null {
    if (!objectType || !geom) return null;
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


  function applyBend(geometry: BufferGeometry, params: any): BufferGeometry {
    const angle = (params.angle || 0) * Math.PI / 180;
    const direction = (params.direction || 0) * Math.PI / 180;
    const bendAxis = params.bendAxis || 'Z';
    
    const positionAttribute = geometry.getAttribute('position');
    const positions = positionAttribute.array as Float32Array;

    for (let i = 0; i < positions.length; i += 3) {
      let x = positions[i];
      let y = positions[i + 1];
      let z = positions[i + 2];

      if (bendAxis === 'Z' && angle !== 0) {
        const factor = (y + 0.5) * angle;
        const newX = x * Math.cos(factor) - z * Math.sin(factor);
        const newZ = x * Math.sin(factor) + z * Math.cos(factor);
        positions[i] = newX;
        positions[i + 2] = newZ;
      }
    }

    positionAttribute.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  function applyTwist(geometry: BufferGeometry, params: any): BufferGeometry {
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

  function applyTaper(geometry: BufferGeometry, params: any): BufferGeometry {
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

  function applyNoise(geometry: BufferGeometry, params: any): BufferGeometry {
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

  function applyEditPoly(geometry: BufferGeometry, params: any): BufferGeometry {
    // Edit Poly modifier affects vertex segments and selection
    const segmentsX = params.segmentsX || 1;
    const segmentsY = params.segmentsY || 1;
    const segmentsZ = params.segmentsZ || 1;
    
    // Create a new geometry with more segments if needed
    if (segmentsX > 1 || segmentsY > 1 || segmentsZ > 1) {
      const newGeometry = createBaseGeometry(object.type, {
        ...object.geometry,
        widthSegments: segmentsX,
        heightSegments: segmentsY,
        depthSegments: segmentsZ,
        radialSegments: Math.max(segmentsX, segmentsY)
      });
      
      // Copy positions from original if needed
      newGeometry.computeVertexNormals();
      return newGeometry;
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }

  function applyEditMesh(geometry: BufferGeometry, params: any): BufferGeometry {
    // Edit Mesh modifier affects tessellation and smoothing
    const tessellation = params.tessellation || 1;
    const smoothingGroups = params.smoothingGroups || 1;
    
    // Apply tessellation (simple subdivision)
    if (tessellation > 1) {
      for (let i = 0; i < tessellation; i++) {
        const positionAttribute = geometry.getAttribute('position');
        const positions = positionAttribute.array as Float32Array;
        
        // Simple mesh smoothing
        for (let j = 0; j < positions.length; j += 3) {
          positions[j] *= 0.99;
          positions[j + 1] *= 0.99;
          positions[j + 2] *= 0.99;
        }
        
        positionAttribute.needsUpdate = true;
      }
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }

  // Render imported models as their full scene graph (preserves materials,
  // textures, skinning, and animations).
  if (object.type === 'imported') {
    return (
      <group
        ref={meshRef as any}
        position={object.position}
        rotation={object.rotation}
        scale={object.scale}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        {imported ? (
          <primitive object={imported.root} />
        ) : (
          <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#666" />
          </mesh>
        )}
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
      position={object.position}
      rotation={object.rotation}
      scale={object.scale}
      castShadow={!isGhost}
      receiveShadow={!isGhost}
      raycast={isGhost ? () => null : undefined}
      onClick={isGhost ? undefined : (e) => {
        e.stopPropagation();
        onSelect();
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
      />


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
  onSelect: () => void;
  meshRef: React.MutableRefObject<any>;
  targetLookup?: (id: string) => [number, number, number] | null;
  isActiveViewCamera?: boolean;
}

const EntityRenderer = ({ object, isSelected, onSelect, meshRef, targetLookup, isActiveViewCamera = false }: EntityRendererProps) => {

  const groupRef = useRef<Group>(null);
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
      <group ref={groupRef} position={object.position}>
        <ambientLight color={object.color} intensity={ambientIntensity} />
        <mesh userData={{ __helper: true }} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
          <sphereGeometry args={[0.25, 12, 8]} />
          <meshBasicMaterial color={iconColor} wireframe />
        </mesh>
      </group>
    );
  }
  if (t === 'light_skylight') {
    return (
      <group ref={groupRef} position={object.position}>
        <hemisphereLight
          color={object.lightData?.skyColor || object.color}
          groundColor={object.lightData?.groundColor || '#404040'}
          intensity={hemiIntensity}
        />
        <mesh userData={{ __helper: true }} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
          <octahedronGeometry args={[0.3, 0]} />
          <meshBasicMaterial color={iconColor} wireframe />
        </mesh>
      </group>
    );
  }
  if (t === 'light_omni') {
    return (
      <group ref={groupRef} position={object.position}>
        <pointLight
          ref={pointLightRef}
          color={object.color}
          intensity={omniIntensity}
          distance={object.lightData?.distance ?? 0}
          decay={object.lightData?.decay ?? 2}
          castShadow={!!object.lightData?.castShadow}
        />
        <mesh userData={{ __helper: true }} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
          <sphereGeometry args={[0.2, 12, 8]} />
          <meshBasicMaterial color={iconColor} />
        </mesh>
        {isSelected && (
          <lineSegments userData={{ __helper: true }}>
            <edgesGeometry args={[new THREE.SphereGeometry(0.35, 12, 8), 1]} />
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
      <group ref={groupRef} position={object.position} rotation={targetId ? undefined : object.rotation}>
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
            <coneGeometry args={[Math.tan(angle) * dist, dist, 20, 1, true]} />
            <meshBasicMaterial color={iconColor} wireframe transparent opacity={0.6} />
          </mesh>
        </group>
        <mesh userData={{ __helper: true }} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
          <boxGeometry args={[0.3, 0.3, 0.5]} />
          <meshBasicMaterial color={iconColor} />
        </mesh>
      </group>
    );
  }
  if (t === 'light_direct') {
    const dist = object.lightData?.distance ?? 20;
    return (
      <group ref={groupRef} position={object.position} rotation={targetId ? undefined : object.rotation}>
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
            <cylinderGeometry args={[0.4, 0.4, dist, 16, 1, true]} />
            <meshBasicMaterial color={iconColor} wireframe transparent opacity={0.4} />
          </mesh>
        </group>
        <mesh userData={{ __helper: true }} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
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
      <group ref={groupRef} position={object.position} rotation={targetId ? undefined : object.rotation}>
        <perspectiveCamera args={[fov, 1, near, far]} name={`__cam_${object.id}`} />
        {/* Body (wireframe) — pickable box */}
        <mesh userData={{ __helper: true }} position={[0, 0, 0.4]} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
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
      <group ref={groupRef} position={object.position}>
        <mesh userData={{ __helper: true }} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
          <boxGeometry args={[0.25, 0.25, 0.25]} />
          <meshBasicMaterial color={iconColor} wireframe />
        </mesh>
      </group>
    );
  }
  return null;
};

