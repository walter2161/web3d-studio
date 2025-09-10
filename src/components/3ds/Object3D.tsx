import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh } from 'three';

interface Object3DProps {
  object: {
    id: string;
    type: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane';
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    color: string;
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

  const renderGeometry = () => {
    switch (object.type) {
      case 'box':
        return <boxGeometry args={[1, 1, 1]} />;
      case 'sphere':
        return <sphereGeometry args={[0.5, 32, 32]} />;
      case 'cylinder':
        return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />;
      case 'cone':
        return <coneGeometry args={[0.5, 1, 32]} />;
      case 'torus':
        return <torusGeometry args={[0.5, 0.2, 16, 100]} />;
      case 'plane':
        return <planeGeometry args={[1, 1]} />;
      default:
        return <boxGeometry args={[1, 1, 1]} />;
    }
  };

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
    >
      {renderGeometry()}
      <meshPhongMaterial 
        color={object.color}
        transparent={isSelected}
        opacity={isSelected ? 0.8 : 1}
        wireframe={isSelected}
      />
      
      {/* Selection outline */}
      {isSelected && (
        <mesh>
          {renderGeometry()}
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