import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, BufferGeometry, Vector3 } from 'three';
import * as THREE from 'three';

interface Object3DProps {
  object: {
    id: string;
    type: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane';
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    color: string;
    geometry?: any;
    modifiers?: Array<{
      id: string;
      type: string;
      params: any;
      active: boolean;
    }>;
    ref?: React.MutableRefObject<Mesh | null>;
  };
  isSelected: boolean;
  onSelect: () => void;
}

export const Object3D = ({ object, isSelected, onSelect }: Object3DProps) => {
  const meshRef = useRef<Mesh>(null);

  // Update object ref
  useEffect(() => {
    if (object.ref) {
      object.ref.current = meshRef.current;
    }
  }, [object.ref]);

  // Apply modifiers to geometry
  const modifiedGeometry = useMemo(() => {
    let geometry = createBaseGeometry(object.type, object.geometry);
    
    if (object.modifiers) {
      object.modifiers.forEach(modifier => {
        if (modifier.active) {
          geometry = applyModifier(geometry, modifier);
        }
      });
    }
    
    return geometry;
  }, [object.type, object.geometry, object.modifiers]);

  function createBaseGeometry(type: string, geometry?: any): BufferGeometry {
    const geom = geometry || {};
    
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

  return (
    <mesh
      ref={meshRef}
      position={object.position}
      rotation={object.rotation}
      scale={object.scale}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      geometry={modifiedGeometry}
    >
      <meshPhongMaterial 
        color={object.color}
        transparent={isSelected}
        opacity={isSelected ? 0.8 : 1}
        wireframe={isSelected}
      />
      
      {/* Selection outline */}
      {isSelected && (
        <mesh geometry={modifiedGeometry}>
          <meshBasicMaterial 
            color="#00bfff" 
            wireframe 
            transparent 
            opacity={0.5}
          />
        </mesh>
      )}
    </mesh>
  );
};