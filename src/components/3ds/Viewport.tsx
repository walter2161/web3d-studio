import { useRef, useState, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import { Scene3D } from './Scene3D';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { AnimationTrack, Keyframe } from './AnimationTimeline';
import { useEnvironment } from './r3/EnvironmentContext';
import { registerViewport, unregisterViewport } from './r3/viewportRegistry';
import { CreationController } from './r3/creation/CreationController';

// Full R3-style view type set (7 orthographic directions + Perspective + User)
type ViewType = 'perspective' | 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' | 'user';
type RenderMode = 'solid' | 'textured' | 'wireframe' | 'semi-transparent' | 'edged' | 'bbox';

const VIEW_LABELS: Record<ViewType, string> = {
  perspective: 'Perspective',
  top: 'Top',
  bottom: 'Bottom',
  front: 'Front',
  back: 'Back',
  left: 'Left',
  right: 'Right',
  user: 'User',
};

// Orthographic camera positions (world axes are X-right, Y-up, Z-forward-toward-camera-in-front).
const VIEW_POS: Record<ViewType, [number, number, number]> = {
  top: [0, 10, 0],
  bottom: [0, -10, 0],
  front: [0, 0, 10],
  back: [0, 0, -10],
  left: [-10, 0, 0],
  right: [10, 0, 0],
  perspective: [5, 5, 5],
  user: [5, 5, 5],
};

const VIEW_UP: Record<ViewType, [number, number, number]> = {
  top: [0, 0, -1],
  bottom: [0, 0, 1],
  front: [0, 1, 0],
  back: [0, 1, 0],
  left: [0, 1, 0],
  right: [0, 1, 0],
  perspective: [0, 1, 0],
  user: [0, 1, 0],
};

// Axis label pair (horizontal, vertical) shown in the corner of ortho views (R3-style).
const AXIS_LABEL: Record<ViewType, string | null> = {
  top: 'X → / Y ↓',
  bottom: 'X → / Y ↑',
  front: 'X → / Z ↑',
  back: 'X ← / Z ↑',
  left: 'Y → / Z ↑',
  right: 'Y ← / Z ↑',
  perspective: null,
  user: null,
};

interface ViewportProps {
  type: 'perspective' | 'top' | 'front' | 'left';
  isActive: boolean;
  onActivate: () => void;
  objects: any[];
  selectedObject: string | null;
  selectedSubUuid?: string | null;
  onSelectObject: (id: string | null) => void;
  onTransformObject: (id: string, transform: any) => void;
  transformMode: 'translate' | 'rotate' | 'scale';
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
  showGrid?: boolean;
  cameraObjectId?: string | null;
  onChangeCameraObject?: (id: string | null) => void;
  availableCameras?: any[];
}

export const Viewport = ({
  type, isActive, onActivate, objects, selectedObject, selectedSubUuid,
  onSelectObject, onTransformObject, transformMode,
  animationTracks, selectedKeyframe, onUpdateKeyframe,
  currentFrame, totalFrames, isPlaying,
  snapEnabled, snapGridSpacing, snapAngleDeg, snapPercent, showGrid: showGridProp = true,
  cameraObjectId, onChangeCameraObject, availableCameras = [],
}: ViewportProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderMode, setRenderMode] = useState<RenderMode>('solid');
  // Per-cell view override lets a single grid cell show any of the 7 R3 views.
  const [viewOverride, setViewOverride] = useState<ViewType | null>(null);
  const [showGridLocal, setShowGridLocal] = useState(true);
  const [showSafeFrame, setShowSafeFrame] = useState(false);
  const { env } = useEnvironment();

  const view: ViewType = viewOverride ?? (type as ViewType);

  // Preserve zoom distance across view switches (R3-style). Captured from OrbitControls
  // right before changing view, then used to scale the new camera position / ortho zoom.
  const distanceRef = useRef<number>(Math.sqrt(75)); // ~8.66 (matches default [5,5,5])

  const captureDistance = () => {
    const oc: any = (window as any).__orbitControls;
    if (oc?.object && oc?.target) {
      const d = oc.object.position.distanceTo(oc.target);
      if (d > 0.001 && isFinite(d)) distanceRef.current = d;
    }
  };

  const switchView = (v: ViewType) => { captureDistance(); setViewOverride(v); onChangeCameraObject?.(null); };

  const cameraPosition = useMemo(() => {
    const [x, y, z] = VIEW_POS[view];
    const len = Math.hypot(x, y, z) || 1;
    const s = distanceRef.current / len;
    return [x * s, y * s, z * s] as [number, number, number];
  }, [view]);
  const cameraUp = useMemo(() => VIEW_UP[view], [view]);
  const orthographic = view !== 'perspective' && view !== 'user';
  // Ortho zoom that matches perspective visible height at same distance (fov≈50°).
  const orthoZoom = useMemo(() => 21.44 / Math.max(0.001, distanceRef.current), [view]);
  const effectiveShowGrid = showGridProp && showGridLocal;
  const hasActiveSceneLights = useMemo(
    () => objects.some((o) => o.visible !== false && String(o.type || '').startsWith('light_') && o.lightData?.on !== false),
    [objects]
  );

  // F3 → toggle Wireframe, F4 → toggle Edged Faces (R3 shortcuts). Active viewport only.
  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'F3') {
        e.preventDefault();
        setRenderMode((m) => (m === 'wireframe' ? 'solid' : 'wireframe'));
      } else if (e.key === 'F4') {
        e.preventDefault();
        setRenderMode((m) => (m === 'edged' ? 'solid' : 'edged'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isActive]);

  const headerLabel = cameraObjectId
    ? (availableCameras.find((c) => c.id === cameraObjectId)?.name || 'Camera')
    : VIEW_LABELS[view];

  return (
    <div
      className={cn(
        "relative w-full h-full bg-viewport",
        isActive ? "outline outline-2 outline-viewport-active -outline-offset-2" : "outline outline-1 outline-viewport-border -outline-offset-1"
      )}
      onClick={onActivate}
    >
      {/* R3-style clickable label at top-left → opens the viewport menu (Views / Display / Grid / Safe Frame / Camera). */}
      <div className="absolute top-1 left-1 z-10 flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="px-1.5 py-0 bg-black/50 hover:bg-black/70 text-[10px] font-mono text-viewport-label uppercase tracking-wide select-none border border-transparent hover:border-viewport-label/40"
              title="Viewport menu (right-click label)"
              onClick={(e) => e.stopPropagation()}
            >
              [{headerLabel}]
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 text-xs">
            <DropdownMenuLabel>Views</DropdownMenuLabel>
            {(['perspective', 'top', 'bottom', 'front', 'back', 'left', 'right', 'user'] as ViewType[]).map((v) => (
              <DropdownMenuItem
                key={v}
                onClick={() => switchView(v)}
              >
                {VIEW_LABELS[v]}{view === v && !cameraObjectId ? '  ✓' : ''}
              </DropdownMenuItem>
            ))}

            {availableCameras.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>View from Camera</DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="text-xs">
                      <DropdownMenuItem onClick={() => onChangeCameraObject?.(null)}>
                        None (use view){!cameraObjectId ? '  ✓' : ''}
                      </DropdownMenuItem>
                      {availableCameras.map((c) => (
                        <DropdownMenuItem key={c.id} onClick={() => onChangeCameraObject?.(c.id)}>
                          {c.name || c.id}{cameraObjectId === c.id ? '  ✓' : ''}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              </>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuLabel>Display</DropdownMenuLabel>
            {([
              ['solid', 'Smooth + Highlights'],
              ['textured', 'Texture + Shadow'],
              ['wireframe', 'Wireframe  (F3)'],
              ['edged', 'Edged Faces  (F4)'],
              ['semi-transparent', 'Transparent'],
              ['bbox', 'Bounding Box'],
            ] as [RenderMode, string][]).map(([val, label]) => (
              <DropdownMenuItem key={val} onClick={() => setRenderMode(val)}>
                {label}{renderMode === val ? '  ✓' : ''}
              </DropdownMenuItem>
            ))}

            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={showGridLocal}
              onCheckedChange={(v) => setShowGridLocal(!!v)}
            >
              Show Grid  (G)
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showSafeFrame}
              onCheckedChange={(v) => setShowSafeFrame(!!v)}
            >
              Show Safe Frame  (Shift+F)
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Axis label corner (R3 ortho views). */}
      {AXIS_LABEL[view] && !cameraObjectId && (
        <div className="absolute bottom-1 left-1 z-10 px-1.5 py-0 bg-black/40 text-[10px] font-mono text-viewport-label pointer-events-none">
          {AXIS_LABEL[view]}
        </div>
      )}

      {/* Safe frame overlay (rendered as DOM inset for perspective / camera views). */}
      {showSafeFrame && (view === 'perspective' || cameraObjectId) && (
        <div className="absolute inset-0 z-[5] pointer-events-none">
          <div className="absolute inset-[5%] border border-yellow-400/60" />
          <div className="absolute inset-[10%] border border-yellow-400/40 border-dashed" />
        </div>
      )}

      <Canvas
        key={`${view}-${orthographic ? 'ortho' : 'persp'}`}
        ref={canvasRef}
        camera={{
          position: cameraPosition,
          up: cameraUp,
          ...(orthographic && { left: -10, right: 10, top: 10, bottom: -10, near: -1000, far: 1000, zoom: orthoZoom }),
        }}
        orthographic={orthographic}
        className="w-full h-full"
        onCreated={({ gl, scene }) => {
          gl.setClearColor(env.backgroundColor);
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          scene.background = new THREE.Color(env.backgroundColor);
        }}
        onPointerMissed={(e) => { if ((e as any).button === 0 || e.type === 'click') onSelectObject(null); }}
      >
        <ViewportRegistrar vkey={type} isActive={isActive} />
        <SceneEnvSync
          backgroundColor={env.backgroundColor}
          fogEnabled={env.fogEnabled}
          fogColor={env.fogColor}
          fogNear={env.fogNear}
          fogFar={env.fogFar}
        />
        <ambientLight color={env.ambient} intensity={(hasActiveSceneLights ? 0.08 : env.ambientIntensity) * env.level} />
        {!hasActiveSceneLights && (
          <>
            <directionalLight
              color={env.tint}
              position={[10, 15, 8]}
              intensity={0.9 * env.level}
              castShadow
              shadow-mapSize-width={2048}
              shadow-mapSize-height={2048}
              shadow-camera-left={-20}
              shadow-camera-right={20}
              shadow-camera-top={20}
              shadow-camera-bottom={-20}
              shadow-camera-near={0.1}
              shadow-camera-far={80}
              shadow-bias={-0.0005}
            />
            <directionalLight color={env.tint} position={[-10, -10, -5]} intensity={0.25 * env.level} />
          </>
        )}

        {effectiveShowGrid && (
          <group userData={{ __helper: true }}>
            {/* Home Grid: XZ plane at Y=0 (world floor). */}
            <Grid position={[0, 0, 0]} args={[20, 20]} cellSize={snapGridSpacing || 1} cellThickness={0.5} cellColor="#404040"
              sectionSize={(snapGridSpacing || 1) * 5} sectionThickness={1} sectionColor="#606060" fadeDistance={30} fadeStrength={1}
              followCamera={false} infiniteGrid={true} />
          </group>
        )}

        <Scene3D
          objects={objects}
          selectedObject={selectedObject}
          selectedSubUuid={selectedSubUuid}
          onSelectObject={onSelectObject}
          onTransformObject={onTransformObject}
          viewportType={view === 'bottom' || view === 'back' || view === 'right' || view === 'user' ? 'perspective' : (view as any)}
          transformMode={transformMode}
          renderMode={renderMode}
          animationTracks={animationTracks}
          selectedKeyframe={selectedKeyframe}
          onUpdateKeyframe={onUpdateKeyframe}
          currentFrame={currentFrame}
          totalFrames={totalFrames}
          isPlaying={isPlaying}
          snapEnabled={snapEnabled}
          snapGridSpacing={snapGridSpacing}
          snapAngleDeg={snapAngleDeg}
          snapPercent={snapPercent}
          activeCameraId={cameraObjectId || null}
        />


        <CreationController viewportType={view === 'bottom' || view === 'back' || view === 'right' || view === 'user' ? 'perspective' : (view as any)} isActive={isActive} />

        {/* Camera-view mode: mount OrbitControls that orbit around the camera's focal point.
            Target camera → focal point = target helper position.
            Free camera   → focal point = camera position + forward * targetDistance. */}
        {cameraObjectId && (() => {
          const cam = availableCameras.find((c) => c.id === cameraObjectId);
          const tid = cam?.cameraData?.targetObjectId;
          const targetObj = tid ? objects.find((o) => o.id === tid) : null;
          return (
            <CameraViewController
              camObj={cam}
              targetObj={targetObj}
              isActive={isActive}
              onTransformObject={onTransformObject}
              isPlaying={!!isPlaying}
            />
          );
        })()}


        {!cameraObjectId && (view === 'perspective' || view === 'user') && (
          <OrbitControls
            makeDefault
            enablePan enableZoom enableRotate panSpeed={1} rotateSpeed={1} zoomSpeed={1}
            onUpdate={(self) => {
              if (isActive) {
                (window as any).__orbitControls = self;
                (window as any).__activeOrbitControls = self;
              }
            }}
          />
        )}
        {!cameraObjectId && orthographic && (
          <OrbitControls
            makeDefault
            enablePan enableZoom enableRotate={false} panSpeed={1} zoomSpeed={1}
            onUpdate={(self) => {
              if (isActive) {
                (window as any).__orbitControls = self;
                (window as any).__activeOrbitControls = self;
              }
            }}
          />
        )}
        {(view === 'perspective' || view === 'user') && !cameraObjectId && (
          <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
            <GizmoViewport axisColors={['#ef4444', '#22c55e', '#3b82f6']} labelColor="white" />
          </GizmoHelper>
        )}
      </Canvas>
    </div>
  );
};

// Syncs environment settings (background, fog) with the three.js scene each render.
const SceneEnvSync = ({ backgroundColor, fogEnabled, fogColor, fogNear, fogFar }: {
  backgroundColor: string; fogEnabled: boolean; fogColor: string; fogNear: number; fogFar: number;
}) => {
  const { scene, gl } = useThree();
  useEffect(() => {
    scene.background = new THREE.Color(backgroundColor);
    gl.setClearColor(backgroundColor);
  }, [backgroundColor, scene, gl]);
  useEffect(() => {
    scene.fog = fogEnabled ? new THREE.Fog(fogColor, fogNear, fogFar) : null;
  }, [fogEnabled, fogColor, fogNear, fogFar, scene]);
  return null;
};

// Registers this viewport's three.js primitives so the Quick Render dialog can
// access them for a proper offline render.
const ViewportRegistrar = ({ vkey, isActive }: { vkey: string; isActive: boolean }) => {
  const state = useThree();
  const { gl, scene, camera } = state;
  useFrame(() => {
    const controls = (state as any).controls;
    registerViewport(vkey, { gl, scene, camera, controls });
    if (isActive && controls) {
      (window as any).__orbitControls = controls;
      (window as any).__activeOrbitControls = controls;
    }
    if (isActive) (window as any).__r3Scene = scene;
  });
  useEffect(() => {
    registerViewport(vkey, { gl, scene, camera, controls: (state as any).controls });
    return () => unregisterViewport(vkey);
  }, [vkey, gl, scene, camera, state]);
  return null;
};

/**
 * Camera-view controller: drives the viewport's active camera from a scene
 * Camera object, and mounts an OrbitControls whose pivot is the camera's
 * focal point (target helper for a Target Camera, or a virtual focal point
 * at `targetDistance` in front of a Free Camera).
 *
 * Orbit / pan / zoom write back:
 *   - Target camera: dragging orbits the camera around the target (target
 *     stays put); panning moves both camera and target together; dolly moves
 *     the camera along the view vector.
 *   - Free camera: orbit rotates the camera in place around its own focal
 *     point; the camera object stores the resulting Euler rotation.
 */
const CameraViewController = ({
  camObj,
  targetObj,
  isActive,
  onTransformObject,
  isPlaying = false,
}: {
  camObj: any;
  targetObj: any;
  isActive: boolean;
  onTransformObject: (id: string, transform: any) => void;
  isPlaying?: boolean;
}) => {
  const { camera, gl } = useThree();
  const controlsRef = useRef<any>(null);
  const suppressWriteRef = useRef(false);
  const lastCamIdRef = useRef<string | null>(null);

  // Sync FOV/clip from the scene camera object every frame (cheap, idempotent).
  // Also, during playback, drive the viewport camera pose from the animated
  // scene camera object so keyframed camera moves are visible in the viewport.
  useFrame(() => {
    if (!camObj) return;
    const pc = camera as THREE.PerspectiveCamera;
    if (pc.isPerspectiveCamera) {
      const fov = camObj.cameraData?.fov ?? 45;
      const near = camObj.cameraData?.near ?? 0.1;
      const far = camObj.cameraData?.far ?? 1000;
      if (pc.fov !== fov) { pc.fov = fov; pc.updateProjectionMatrix(); }
      if (pc.near !== near || pc.far !== far) { pc.near = near; pc.far = far; pc.updateProjectionMatrix(); }
    }

    if (isPlaying) {
      const controls = controlsRef.current;
      suppressWriteRef.current = true;
      const [px, py, pz] = camObj.position;
      camera.position.set(px, py, pz);
      if (targetObj) {
        const [tx, ty, tz] = targetObj.position;
        if (controls) controls.target.set(tx, ty, tz);
        camera.lookAt(tx, ty, tz);
      } else {
        const [rx, ry, rz] = camObj.rotation;
        camera.rotation.set(rx, ry, rz);
        if (controls) {
          const dist = camObj.cameraData?.targetDistance ?? 10;
          const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
          const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
          controls.target.set(px + fwd.x * dist, py + fwd.y * dist, pz + fwd.z * dist);
        }
      }
      if (controls) controls.update();
    }
  });

  // On camera swap (or first mount), snap the viewport camera + orbit target
  // to the scene camera's current pose. External changes to camObj.position /
  // rotation while active are ignored — the orbit controls own the pose.
  useEffect(() => {
    if (!camObj) return;
    const controls = controlsRef.current;
    if (!controls) return;
    suppressWriteRef.current = true;
    const [px, py, pz] = camObj.position;
    camera.position.set(px, py, pz);

    if (targetObj) {
      const [tx, ty, tz] = targetObj.position;
      controls.target.set(tx, ty, tz);
    } else {
      // Free camera: focal point sits at targetDistance in front (local -Z).
      const dist = camObj.cameraData?.targetDistance ?? 10;
      const [rx, ry, rz] = camObj.rotation;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      controls.target.set(px + fwd.x * dist, py + fwd.y * dist, pz + fwd.z * dist);
    }
    camera.lookAt(controls.target);
    controls.update();
    lastCamIdRef.current = camObj.id;
    // Release the write-suppression on the next tick so the initial `change`
    // event fired by controls.update() doesn't clobber the scene camera.
    const t = setTimeout(() => { suppressWriteRef.current = false; }, 0);
    return () => clearTimeout(t);
  }, [camObj?.id, camera, targetObj?.id]);

  // Write orbit results back into the scene: camera position (both types),
  // target helper position (target camera), or camera rotation (free camera).
  const handleChange = () => {
    if (!camObj || suppressWriteRef.current) return;
    const controls = controlsRef.current;
    if (!controls) return;
    const pos: [number, number, number] = [camera.position.x, camera.position.y, camera.position.z];
    onTransformObject(camObj.id, { position: pos });

    if (targetObj) {
      const tp: [number, number, number] = [controls.target.x, controls.target.y, controls.target.z];
      // Only push updates if it actually moved (pan).
      const [ox, oy, oz] = targetObj.position;
      if (Math.abs(tp[0] - ox) > 1e-6 || Math.abs(tp[1] - oy) > 1e-6 || Math.abs(tp[2] - oz) > 1e-6) {
        onTransformObject(targetObj.id, { position: tp });
      }
    } else {
      // Free camera: store the Euler rotation derived from the current view.
      const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'XYZ');
      onTransformObject(camObj.id, { rotation: [e.x, e.y, e.z] as [number, number, number] });
    }
  };

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan enableZoom enableRotate
      panSpeed={1} rotateSpeed={1} zoomSpeed={1}
      onChange={handleChange}
      onUpdate={(self) => {
        if (isActive) {
          (window as any).__orbitControls = self;
          (window as any).__activeOrbitControls = self;
        }
      }}
    />
  );
};

