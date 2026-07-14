import { useRef, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Mesh, BufferGeometry, Vector3, Group, AnimationMixer, Object3D as ThreeObject3D } from 'three';
import * as THREE from 'three';
import { getImportedModel } from './utils/modelImport';
import { buildExtendedPrimitive, buildShape, ExtPrimType, ShapeType } from './utils/extendedGeometry';

// R3-style entity types
export const LIGHT_TYPES = ['light_omni', 'light_spot', 'light_direct', 'light_skylight', 'light_ambient'] as const;
export const CAMERA_TYPES = ['camera_free', 'camera_target'] as const;
export const TARGET_TYPES = ['target_helper'] as const;
export type LightType = typeof LIGHT_TYPES[number];
export type CameraType = typeof CAMERA_TYPES[number];
export const isLightType = (t: string): t is LightType => (LIGHT_TYPES as readonly string[]).includes(t);
export const isCameraType = (t: string): t is CameraType => (CAMERA_TYPES as readonly string[]).includes(t);
export const isEntityType = (t: string) => isLightType(t) || isCameraType(t) || t === 'target_helper';

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
  renderMode: 'solid' | 'wireframe' | 'semi-transparent';
  currentFrame?: number;
  totalFrames?: number;
  isPlaying?: boolean;
  targetLookup?: (id: string) => [number, number, number] | null;
}



export const Object3D = ({ object, isSelected, onSelect, renderMode, currentFrame = 0, totalFrames = 100, isPlaying = false, targetLookup }: Object3DProps) => {
  const meshRef = useRef<Mesh>(null);


  // Update object ref
  useEffect(() => {
    if (object.ref) {
      object.ref.current = meshRef.current;
    }
  }, [object.ref]);

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
          geometry = applyModifier(geometry, modifier);
        }
      });
    }
    return geometry;
  }, [object.id, object.type, object.geometry, object.modifiers]);



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
      case 'plane':
        return new THREE.PlaneGeometry(
          geom.width || 1,
          geom.height || 1,
          geom.widthSegments || 1,
          geom.heightSegments || 1
        );
      default:
        return new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
    }
  }

  function applyModifier(geometry: BufferGeometry, modifier: any): BufferGeometry {
    const newGeometry = geometry.clone();
    const positionAttribute = newGeometry.getAttribute('position');
    const positions = positionAttribute.array as Float32Array;

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
  // Render lights and cameras as full-fledged scene entities with R3-style helpers.
  if (isEntityType(object.type)) {
    return (
      <EntityRenderer
        object={object as any}
        isSelected={isSelected}
        onSelect={onSelect}
        meshRef={meshRef as any}
        targetLookup={targetLookup}
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
      <meshStandardMaterial
        color={(object as any).material?.color ?? object.color}
        transparent={renderMode === 'semi-transparent' || isGhost || ((object as any).material?.opacity ?? 1) < 1}
        opacity={isGhost ? 0.55 : (renderMode === 'semi-transparent' ? 0.5 : ((object as any).material?.opacity ?? 1))}
        wireframe={renderMode === 'wireframe'}
        metalness={(object as any).material?.metalness ?? 0.15}
        roughness={(object as any).material?.roughness ?? 0.55}
        emissive={(object as any).material?.emissive ?? '#000000'}
        emissiveIntensity={(object as any).material?.emissiveIntensity ?? 0}
        flatShading={false}
      />

      {/* Selection outline via edges only (no wire overlay on the surface) */}
      {isSelected && renderMode !== 'wireframe' && !isGhost && (
        <lineSegments renderOrder={999}>
          <edgesGeometry args={[modifiedGeometry, 15]} />
          <lineBasicMaterial color="#00bfff" transparent opacity={0.9} depthTest={false} />
        </lineSegments>
      )}

      {/* Ghost edges — bright preview outline while creating */}
      {isGhost && (
        <lineSegments renderOrder={999}>
          <edgesGeometry args={[modifiedGeometry, 15]} />
          <lineBasicMaterial color="#fbbf24" transparent opacity={1} depthTest={false} />
        </lineSegments>
      )}
    </mesh>

  );
};
