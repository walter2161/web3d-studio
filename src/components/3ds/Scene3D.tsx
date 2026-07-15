import { useRef, useEffect, useState, useMemo } from 'react';
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
  renderMode: 'solid' | 'textured' | 'wireframe' | 'semi-transparent' | 'edged' | 'bbox';
  animationTracks?: AnimationTrack[];
  selectedKeyframe?: Keyframe | null;
  onUpdateKeyframe?: (objectId: string, keyframeId: string, updates: Partial<Keyframe>) => void;
  onSelectKeyframe?: (kf: Keyframe | null) => void;
  currentFrame?: number;
  totalFrames?: number;
  isPlaying?: boolean;
  snapEnabled?: boolean;
  snapGridSpacing?: number;
  snapAngleDeg?: number;
  snapPercent?: number;
  activeCameraId?: string | null;
}

interface SubObjCentroid {
  objectId: string;
  modifierId: string;
  level: string;
  local: [number, number, number] | null;
}

export const Scene3D = ({
  objects, selectedObject, selectedSubUuid, onSelectObject, onTransformObject,
  viewportType, transformMode, renderMode,
  animationTracks, selectedKeyframe, onUpdateKeyframe, onSelectKeyframe,
  currentFrame, totalFrames, isPlaying,
  snapEnabled, snapGridSpacing = 1, snapAngleDeg = 5, snapPercent = 10,
  activeCameraId = null,
}: Scene3DProps) => {

  const transformControlsRef = useRef<any>(null);
  const selectedObjectData = objects.find(obj => obj.id === selectedObject);

  // ---- Sub-object gizmo state -------------------------------------------------
  const [subCentroid, setSubCentroid] = useState<SubObjCentroid | null>(null);
  const [subProxyObj, setSubProxyObj] = useState<THREE.Object3D | null>(null);
  const subDragStartRef = useRef<THREE.Vector3 | null>(null);
  const subDragStartRotRef = useRef<THREE.Euler | null>(null);
  const subDragStartScaleRef = useRef<THREE.Vector3 | null>(null);
  const subDragPivotRef = useRef<[number, number, number] | null>(null);
  const subDragOpKeyRef = useRef<string | null>(null);
  const subDragMovedRef = useRef(false);

  useEffect(() => {
    const onCentroid = (ev: Event) => {
      const d = (ev as CustomEvent).detail as SubObjCentroid;
      setSubCentroid(d.local ? d : null);
    };
    window.addEventListener('r3-subobj-centroid', onCentroid as any);
    return () => window.removeEventListener('r3-subobj-centroid', onCentroid as any);
  }, []);

  // Modify-panel gate: sub-object editing only activates on the Modify tab.
  const [modifyActive, setModifyActive] = useState<boolean>(
    typeof window !== 'undefined' ? !!(window as any).__r3_modifyPanelActive : false,
  );
  useEffect(() => {
    const on = (ev: Event) => setModifyActive(!!(ev as CustomEvent).detail?.active);
    window.addEventListener('r3-modify-panel', on as any);
    return () => window.removeEventListener('r3-modify-panel', on as any);
  }, []);

  // Only show sub-object gizmo when its centroid matches the current selection
  // AND that object has an active Edit Poly/Mesh modifier AND the Modify panel
  // is open (matches 3ds Max: sub-object edit lives inside the Modify panel).
  const activeEditMod = useMemo(() => {
    if (!selectedObjectData || !modifyActive) return null;
    return (selectedObjectData.modifiers ?? []).find(
      (m: any) => m.active && (m.type === 'Edit Poly' || m.type === 'Edit Mesh'),
    );
  }, [selectedObjectData, modifyActive]);

  const subGizmoActive =
    !!activeEditMod &&
    !!subCentroid &&
    subCentroid.objectId === selectedObject &&
    subCentroid.modifierId === activeEditMod.id &&
    !!subCentroid.local;


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
  if (subGizmoActive && subProxyObj) {
    transformTarget = subProxyObj;
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
          isActiveViewCamera={!!activeCameraId && object.id === activeCameraId}
        />
      ))}

      {/* Sub-object gizmo proxy: parented in a group that mirrors the mesh
          transform, so proxy.position lives in mesh-local space. */}
      {subGizmoActive && selectedObjectData && (
        <group
          position={selectedObjectData.position}
          rotation={selectedObjectData.rotation}
          scale={selectedObjectData.scale}
        >
          <object3D ref={setSubProxyObj} position={subCentroid!.local!} />
        </group>
      )}

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
            if (subGizmoActive && subProxyObj) {
              subDragStartRef.current = subProxyObj.position.clone();
              subDragStartRotRef.current = subProxyObj.rotation.clone();
              subDragStartScaleRef.current = subProxyObj.scale.clone();
              subDragPivotRef.current = [subProxyObj.position.x, subProxyObj.position.y, subProxyObj.position.z];
              subDragOpKeyRef.current = `subdrag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
              subDragMovedRef.current = false;
            }
          }}
          onMouseUp={() => {
            const controls = (window as any).__orbitControls;
            if (controls) controls.enabled = true;
            if (subGizmoActive && subProxyObj && activeEditMod && selectedObject) {
              // Reset the proxy so the next drag starts from identity.
              subProxyObj.rotation.set(0, 0, 0);
              subProxyObj.scale.set(1, 1, 1);
              subDragStartRef.current = null;
              subDragStartRotRef.current = null;
              subDragStartScaleRef.current = null;
              subDragPivotRef.current = null;
              subDragOpKeyRef.current = null;
              subDragMovedRef.current = false;
            }
          }}
          onObjectChange={(e: any) => {
            if (subGizmoActive) {
              if (!subProxyObj || !activeEditMod || !selectedObject) return;
              const replaceKey = subDragOpKeyRef.current;
              const pivot = subDragPivotRef.current ?? [0, 0, 0];
              if (transformMode === 'translate' && subDragStartRef.current) {
                const cur = subProxyObj.position;
                const start = subDragStartRef.current;
                const delta: [number, number, number] = [cur.x - start.x, cur.y - start.y, cur.z - start.z];
                const len = Math.hypot(delta[0], delta[1], delta[2]);
                if (len > 1e-6) {
                  subDragMovedRef.current = true;
                  window.dispatchEvent(new CustomEvent('r3-subobj-op', {
                    detail: {
                      objectId: selectedObject,
                      modifierId: activeEditMod.id,
                      op: { kind: 'move', params: { delta, __replaceKey: replaceKey } },
                    },
                  }));
                }
              } else if (transformMode === 'rotate' && subDragStartRotRef.current) {
                const rCur = subProxyObj.rotation;
                const rStart = subDragStartRotRef.current;
                const euler: [number, number, number] = [rCur.x - rStart.x, rCur.y - rStart.y, rCur.z - rStart.z];
                if (Math.abs(euler[0]) + Math.abs(euler[1]) + Math.abs(euler[2]) > 1e-6) {
                  subDragMovedRef.current = true;
                  window.dispatchEvent(new CustomEvent('r3-subobj-op', {
                    detail: {
                      objectId: selectedObject,
                      modifierId: activeEditMod.id,
                      op: { kind: 'rotate', params: { euler, pivot, __replaceKey: replaceKey } },
                    },
                  }));
                }
              } else if (transformMode === 'scale' && subDragStartScaleRef.current) {
                const sCur = subProxyObj.scale;
                const sStart = subDragStartScaleRef.current;
                const fx = sStart.x !== 0 ? sCur.x / sStart.x : 1;
                const fy = sStart.y !== 0 ? sCur.y / sStart.y : 1;
                const fz = sStart.z !== 0 ? sCur.z / sStart.z : 1;
                if (Math.abs(fx - 1) + Math.abs(fy - 1) + Math.abs(fz - 1) > 1e-6) {
                  subDragMovedRef.current = true;
                  window.dispatchEvent(new CustomEvent('r3-subobj-op', {
                    detail: {
                      objectId: selectedObject,
                      modifierId: activeEditMod.id,
                      op: { kind: 'scale', params: { factor: [fx, fy, fz], pivot, __replaceKey: replaceKey } },
                    },
                  }));
                }
              }
              return;
            }
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
          onSelectKeyframe={onSelectKeyframe}
        />
      )}
    </>
  );
};
