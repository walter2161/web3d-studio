import { useState, useRef, useCallback } from 'react';
import { MenuBar } from './MenuBar';
import { Viewport } from './Viewport';
import { SidePanel } from './SidePanel';
import { Timeline } from './Timeline';

interface Object3DData {
  id: string;
  type: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane';
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  ref?: React.MutableRefObject<any>;
}

export const Studio3D = () => {
  const [objects, setObjects] = useState<Object3DData[]>([]);
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const [activeViewport, setActiveViewport] = useState<string>('perspective');
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const totalFrames = 100;

  const createObject = useCallback((type: string) => {
    if (['box', 'sphere', 'cylinder', 'cone', 'torus', 'plane'].includes(type)) {
      const newObject: Object3DData = {
        id: `${type}_${Date.now()}`,
        type: type as any,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: '#3b82f6',
        ref: { current: null } as any,
      };
      
      setObjects(prev => [...prev, newObject]);
      setSelectedObject(newObject.id);
    }
  }, []);

  const handleSelectObject = useCallback((id: string | null) => {
    setSelectedObject(id);
  }, []);

  const handleTransformObject = useCallback((id: string, transform: any) => {
    setObjects(prev => prev.map(obj => 
      obj.id === id 
        ? { ...obj, ...transform }
        : obj
    ));
  }, []);

  const selectedObjectData = objects.find(obj => obj.id === selectedObject);

  return (
    <div className="h-screen bg-background text-foreground overflow-hidden">
      {/* Menu Bar */}
      <MenuBar />

      {/* Main Content */}
      <div className="flex h-[calc(100vh-8rem)]">
        {/* Viewport Grid */}
        <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-1 p-1">
          <Viewport
            type="perspective"
            isActive={activeViewport === 'perspective'}
            onActivate={() => setActiveViewport('perspective')}
            objects={objects}
            selectedObject={selectedObject}
            onSelectObject={handleSelectObject}
            onTransformObject={handleTransformObject}
          />
          <Viewport
            type="top"
            isActive={activeViewport === 'top'}
            onActivate={() => setActiveViewport('top')}
            objects={objects}
            selectedObject={selectedObject}
            onSelectObject={handleSelectObject}
            onTransformObject={handleTransformObject}
          />
          <Viewport
            type="front"
            isActive={activeViewport === 'front'}
            onActivate={() => setActiveViewport('front')}
            objects={objects}
            selectedObject={selectedObject}
            onSelectObject={handleSelectObject}
            onTransformObject={handleTransformObject}
          />
          <Viewport
            type="left"
            isActive={activeViewport === 'left'}
            onActivate={() => setActiveViewport('left')}
            objects={objects}
            selectedObject={selectedObject}
            onSelectObject={handleSelectObject}
            onTransformObject={handleTransformObject}
          />
        </div>

        {/* Side Panel */}
        <SidePanel
          onCreateObject={createObject}
          selectedObject={selectedObjectData}
          onTransformMode={setTransformMode}
          transformMode={transformMode}
        />
      </div>

      {/* Timeline */}
      <Timeline
        currentFrame={currentFrame}
        totalFrames={totalFrames}
        isPlaying={isPlaying}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onStop={() => {
          setIsPlaying(false);
          setCurrentFrame(0);
        }}
        onFrameChange={setCurrentFrame}
        onSetKeyframe={() => {
          // TODO: Implement keyframe creation
          console.log('Set keyframe at frame:', currentFrame);
        }}
      />
    </div>
  );
};