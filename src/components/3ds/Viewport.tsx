import { useRef, useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei';
import { Scene3D } from './Scene3D';
import { cn } from '@/lib/utils';

interface ViewportProps {
  type: 'perspective' | 'top' | 'front' | 'left';
  isActive: boolean;
  onActivate: () => void;
  objects: any[];
  selectedObject: string | null;
  onSelectObject: (id: string | null) => void;
  onTransformObject: (id: string, transform: any) => void;
  transformMode: 'translate' | 'rotate' | 'scale';
}

export const Viewport = ({ 
  type, 
  isActive, 
  onActivate, 
  objects, 
  selectedObject, 
  onSelectObject,
  onTransformObject,
  transformMode 
}: ViewportProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const cameraPosition = useMemo(() => {
    switch (type) {
      case 'top':
        return [0, 10, 0] as [number, number, number];
      case 'front':
        return [0, 0, 10] as [number, number, number];
      case 'left':
        return [-10, 0, 0] as [number, number, number];
      default:
        return [5, 5, 5] as [number, number, number];
    }
  }, [type]);

  const cameraUp = useMemo(() => {
    switch (type) {
      case 'top':
        return [0, 0, -1] as [number, number, number];
      case 'front':
        return [0, 1, 0] as [number, number, number];
      case 'left':
        return [0, 1, 0] as [number, number, number];
      default:
        return [0, 1, 0] as [number, number, number];
    }
  }, [type]);

  const orthographic = type !== 'perspective';

  return (
    <div 
      className={cn(
        "relative border bg-gradient-viewport h-[600px] min-h-[100%] w-full",
        isActive ? "border-viewport-active" : "border-viewport-border"
      )}
      onClick={onActivate}
    >
      {/* Viewport Label */}
      <div className="absolute top-2 left-2 z-10 px-2 py-1 bg-panel text-xs font-mono text-muted-foreground uppercase tracking-wider">
        {type}
      </div>

      {/* 3D Canvas */}
      <Canvas
        ref={canvasRef}
        camera={{
          position: cameraPosition,
          up: cameraUp,
          ...(orthographic && {
            left: -10,
            right: 10,
            top: 10,
            bottom: -10,
            near: 0.1,
            far: 1000,
          }),
        }}
        orthographic={orthographic}
        className="w-full h-full"
        onCreated={({ gl }) => {
          gl.setClearColor('#0f1419');
        }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 10, 5]} intensity={0.8} />
        <directionalLight position={[-10, -10, -5]} intensity={0.3} />

        {/* Grid */}
        <Grid
          position={[0, 0, 0]}
          args={[20, 20]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#404040"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#606060"
          fadeDistance={30}
          fadeStrength={1}
          followCamera={false}
          infiniteGrid={true}
        />

        {/* 3D Scene */}
        <Scene3D
          objects={objects}
          selectedObject={selectedObject}
          onSelectObject={onSelectObject}
          onTransformObject={onTransformObject}
          viewportType={type}
          transformMode={transformMode}
        />

        {/* Controls */}
        {type === 'perspective' && (
          <OrbitControls
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            panSpeed={1}
            rotateSpeed={1}
            zoomSpeed={1}
          />
        )}

        {type !== 'perspective' && (
          <OrbitControls
            enablePan={true}
            enableZoom={true}
            enableRotate={false}
            panSpeed={1}
            zoomSpeed={1}
          />
        )}

        {/* Gizmo Helper for perspective view */}
        {type === 'perspective' && (
          <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
            <GizmoViewport 
              axisColors={['#ef4444', '#22c55e', '#3b82f6']} 
              labelColor="white"
            />
          </GizmoHelper>
        )}
      </Canvas>
    </div>
  );
};