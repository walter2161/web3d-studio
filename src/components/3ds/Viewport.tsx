import { useRef, useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import { Scene3D } from './Scene3D';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { AnimationTrack, Keyframe } from './AnimationTimeline';
import { useEnvironment } from './r3/EnvironmentContext';

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
}

export const Viewport = ({
  type, isActive, onActivate, objects, selectedObject, selectedSubUuid,
  onSelectObject, onTransformObject, transformMode,
  animationTracks, selectedKeyframe, onUpdateKeyframe,
  currentFrame, totalFrames, isPlaying,
}: ViewportProps) => {

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderMode, setRenderMode] = useState<'solid' | 'wireframe' | 'semi-transparent'>('solid');
  const { env } = useEnvironment();

  const cameraPosition = useMemo(() => {
    switch (type) {
      case 'top': return [0, 10, 0] as [number, number, number];
      case 'front': return [0, 0, 10] as [number, number, number];
      case 'left': return [-10, 0, 0] as [number, number, number];
      default: return [5, 5, 5] as [number, number, number];
    }
  }, [type]);

  const cameraUp = useMemo(() => {
    switch (type) {
      case 'top': return [0, 0, -1] as [number, number, number];
      default: return [0, 1, 0] as [number, number, number];
    }
  }, [type]);

  const orthographic = type !== 'perspective';

  return (
    <div
      className={cn(
        "relative w-full h-full bg-viewport",
        // Yellow 2px border on active viewport (3ds Max R3 look)
        isActive ? "outline outline-2 outline-viewport-active -outline-offset-2" : "outline outline-1 outline-viewport-border -outline-offset-1"
      )}
      onClick={onActivate}
    >
      <div className="absolute top-1 left-1 z-10 px-1.5 py-0 bg-black/50 text-[10px] font-mono text-viewport-label uppercase tracking-wide select-none pointer-events-none">
        [{type}]
      </div>


      <div className="absolute top-2 right-2 z-10">
        <Select value={renderMode} onValueChange={(value: any) => setRenderMode(value)}>
          <SelectTrigger className="h-7 w-32 text-xs bg-background/80 backdrop-blur-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="solid">Solid</SelectItem>
            <SelectItem value="wireframe">Wireframe</SelectItem>
            <SelectItem value="semi-transparent">Semi-Render</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Canvas
        ref={canvasRef}
        camera={{
          position: cameraPosition,
          up: cameraUp,
          ...(orthographic && { left: -10, right: 10, top: 10, bottom: -10, near: 0.1, far: 1000 }),
        }}
        orthographic={orthographic}
        className="w-full h-full"
        onCreated={({ gl, scene }) => {
          gl.setClearColor(env.backgroundColor);
          scene.background = new THREE.Color(env.backgroundColor);
        }}
        onPointerMissed={(e) => { if ((e as any).button === 0 || e.type === 'click') onSelectObject(null); }}
      >
        <SceneEnvSync
          backgroundColor={env.backgroundColor}
          fogEnabled={env.fogEnabled}
          fogColor={env.fogColor}
          fogNear={env.fogNear}
          fogFar={env.fogFar}
        />
        <ambientLight color={env.ambient} intensity={env.ambientIntensity * env.level} />
        <directionalLight color={env.tint} position={[10, 10, 5]} intensity={0.8 * env.level} />
        <directionalLight color={env.tint} position={[-10, -10, -5]} intensity={0.3 * env.level} />



        <group userData={{ __helper: true }}>
          <Grid position={[0, 0, 0]} args={[20, 20]} cellSize={1} cellThickness={0.5} cellColor="#404040"
            sectionSize={5} sectionThickness={1} sectionColor="#606060" fadeDistance={30} fadeStrength={1}
            followCamera={false} infiniteGrid={true} />
        </group>

        <Scene3D
          objects={objects}
          selectedObject={selectedObject}
          selectedSubUuid={selectedSubUuid}
          onSelectObject={onSelectObject}
          onTransformObject={onTransformObject}
          viewportType={type}
          transformMode={transformMode}
          renderMode={renderMode}
          animationTracks={animationTracks}
          selectedKeyframe={selectedKeyframe}
          onUpdateKeyframe={onUpdateKeyframe}
          currentFrame={currentFrame}
          totalFrames={totalFrames}
          isPlaying={isPlaying}
        />


        {type === 'perspective' && (
          <OrbitControls
            makeDefault
            enablePan enableZoom enableRotate panSpeed={1} rotateSpeed={1} zoomSpeed={1}
            onUpdate={(self) => { (window as any).__orbitControls = self; }}
          />
        )}
        {type !== 'perspective' && (
          <OrbitControls
            makeDefault
            enablePan enableZoom enableRotate={false} panSpeed={1} zoomSpeed={1}
            onUpdate={(self) => { (window as any).__orbitControls = self; }}
          />
        )}
        {type === 'perspective' && (
          <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
            <GizmoViewport axisColors={['#ef4444', '#22c55e', '#3b82f6']} labelColor="white" />
          </GizmoHelper>
        )}
      </Canvas>
    </div>
  );
};

// Syncs environment settings (background, fog) with the three.js scene each render.
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

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

