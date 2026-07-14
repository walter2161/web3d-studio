import { useRef } from 'react';
import { TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import { Object3D } from './Object3D';
import { TrajectoryRenderer } from './TrajectoryRenderer';
import { AnimationTrack, Keyframe } from './AnimationTimeline';
import { getImportedModel } from './utils/modelImport';

interface Scene3DProps {
  objects: any[];
  selectedObject: string | null;
  selectedSubUuid?: string | null;
  onSelectObject: (id: string | null) => void;
  onTransformObject: (id: string, transform: any) => void;
  viewportType: string;
  transformMode: 'translate' | 'rotate' | 'scale';
  renderMode: 'solid' | 'wireframe' | 'semi-transparent';
  animationTracks?: AnimationTrack[];
  selectedKeyframe?: Keyframe | null;
  onUpdateKeyframe?: (objectId: string, keyframeId: string, updates: Partial<Keyframe>) => void;
  currentFrame?: number;
  totalFrames?: number;
  isPlaying?: boolean;
  snapEnabled?: boolean;
  snapGridSpacing?: number;
  snapAngleDeg?: number;
  snapPercent?: number;
}

export const Scene3D = ({
  objects, selectedObject, selectedSubUuid, onSelectObject, onTransformObject,
  viewportType, transformMode, renderMode,
  animationTracks, selectedKeyframe, onUpdateKeyframe,
  currentFrame, totalFrames, isPlaying,
  snapEnabled, snapGridSpacing = 1, snapAngleDeg = 5, snapPercent = 10,
}: Scene3DProps) => {
  const transformControlsRef = useRef<any>(null);
  const selectedObjectData = objects.find(obj => obj.id === selectedObject);

  // Resolve the actual THREE.Object3D that TransformControls should attach to.
  let transformTarget: any = selectedObjectData?.ref?.current || null;
  if (selectedObjectData?.type === 'imported' && selectedSubUuid) {
    const imported = getImportedModel(selectedObjectData.id);
    if (imported) {
      imported.root.traverse((n: any) => {
        if (n.uuid === selectedSubUuid) transformTarget = n;
      });
    }
  }

  // Lookup a target object's world position for target-camera / target-spot / target-direct.
  const targetLookup = (id: string): [number, number, number] | null => {
    const t = objects.find((o) => o.id === id);
    if (!t) return null;
    return [t.position[0], t.position[1], t.position[2]];
  };

  return (
    <>
      {objects.map((object) => (
        <Object3D
          key={object.id}
          object={object}
          isSelected={object.id === selectedObject}
          onSelect={() => onSelectObject(object.id)}
          renderMode={renderMode}
          currentFrame={currentFrame}
          totalFrames={totalFrames}
          isPlaying={isPlaying}
          targetLookup={targetLookup}
        />
      ))}


      {selectedObject && transformTarget && (
        <TransformControls
          ref={transformControlsRef}
          object={transformTarget}
          mode={transformMode}
          size={0.8}
          showX showY showZ
          translationSnap={snapEnabled && transformMode === 'translate' ? snapGridSpacing : null}
          rotationSnap={snapEnabled && transformMode === 'rotate' ? THREE.MathUtils.degToRad(snapAngleDeg) : null}
          scaleSnap={snapEnabled && transformMode === 'scale' ? snapPercent / 100 : null}
          onMouseDown={() => {
            const controls = (window as any).__orbitControls;
            if (controls) controls.enabled = false;
          }}
          onMouseUp={() => {
            const controls = (window as any).__orbitControls;
            if (controls) controls.enabled = true;
          }}
          onObjectChange={(e: any) => {
            if (e?.target?.object && !selectedSubUuid) {
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

      {/* Render trajectories */}
      {animationTracks && onUpdateKeyframe && (
        <TrajectoryRenderer
          tracks={animationTracks}
          selectedKeyframe={selectedKeyframe || null}
          onUpdateKeyframe={onUpdateKeyframe}
        />
      )}
    </>
  );
};
