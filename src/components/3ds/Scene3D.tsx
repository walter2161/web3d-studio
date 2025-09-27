import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { TransformControls } from '@react-three/drei';
import { Object3D } from './Object3D';

interface Scene3DProps {
  objects: any[];
  selectedObject: string | null;
  onSelectObject: (id: string | null) => void;
  onTransformObject: (id: string, transform: any) => void;
  viewportType: string;
  transformMode: 'translate' | 'rotate' | 'scale';
  renderMode: 'solid' | 'wireframe' | 'semi-transparent';
}

export const Scene3D = ({
  objects,
  selectedObject,
  onSelectObject,
  onTransformObject,
  viewportType,
  transformMode,
  renderMode
}: Scene3DProps) => {
  const transformControlsRef = useRef<any>(null);

  const selectedObjectData = objects.find(obj => obj.id === selectedObject);

  return (
    <>
      {/* Render all objects */}
      {objects.map((object) => (
        <Object3D
          key={object.id}
          object={object}
          isSelected={object.id === selectedObject}
          onSelect={() => onSelectObject(object.id)}
          renderMode={renderMode}
        />
      ))}

      {/* Transform Controls for selected object */}
      {selectedObject && selectedObjectData && viewportType === 'perspective' && (
        <TransformControls
          ref={transformControlsRef}
          object={selectedObjectData.ref?.current}
          mode={transformMode}
          size={0.8}
          showX={true}
          showY={true}
          showZ={true}
          onObjectChange={(e: any) => {
            if (e?.target?.object) {
              const obj = e.target.object;
              const { position, rotation, scale } = obj;
              onTransformObject(selectedObject, {
                position: [position.x, position.y, position.z],
                rotation: [rotation.x, rotation.y, rotation.z],
                scale: [scale.x, scale.y, scale.z],
              });
            }
          }}
        />
      )}
    </>
  );
};