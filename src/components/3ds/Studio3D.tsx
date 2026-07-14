import { useState, useRef, useCallback, useEffect } from 'react';
import { MenuBar } from './MenuBar';
import { Viewport } from './Viewport';
import { SidePanel } from './SidePanel';
import { AnimationTimeline, Keyframe, AnimationTrack } from './AnimationTimeline';
import { MaterialEditor } from './MaterialEditor';
import { QuickRender } from './QuickRender';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { SceneHierarchy } from './SceneHierarchy';
import { FileOperations } from './FileOperations';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Object3DData {
  id: string;
  name?: string;
  type: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane' | 'imported';
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  material?: any;
  visible?: boolean;
  locked?: boolean;
  geometry?: any;
  modifiers?: Modifier[];
  ref?: React.MutableRefObject<any>;
}

interface Modifier {
  id: string;
  type: string;
  params: any;
  active: boolean;
}

export const Studio3D = () => {
  const STORAGE_KEY = '3dsled:scene:autosave:v1';

  const loadInitial = () => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  };
  const initial = loadInitial();

  const [objects, setObjects] = useState<Object3DData[]>(() =>
    (initial?.objects || []).map((o: any) => ({ ...o, ref: { current: null } }))
  );
  const [selectedObject, setSelectedObject] = useState<string | null>(initial?.selectedObject ?? null);
  const [selectedSubUuid, setSelectedSubUuid] = useState<string | null>(null);

  const [activeViewport, setActiveViewport] = useState<'perspective' | 'top' | 'front' | 'left'>('perspective');
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [currentFrame, setCurrentFrame] = useState(initial?.currentFrame ?? 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [materialEditorOpen, setMaterialEditorOpen] = useState(false);
  const [quickRenderOpen, setQuickRenderOpen] = useState(false);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [fileDialogType, setFileDialogType] = useState<'save' | 'open' | 'export' | 'import'>('save');
  const [undoStack, setUndoStack] = useState<Object3DData[][]>([]);
  const [redoStack, setRedoStack] = useState<Object3DData[][]>([]);
  const [animationTracks, setAnimationTracks] = useState<AnimationTrack[]>(initial?.animationTracks || []);
  const [selectedKeyframe, setSelectedKeyframe] = useState<Keyframe | null>(null);
  const totalFrames = 100;
  const playRef = useRef<number | null>(null);

  // Autosave scene to sessionStorage (survives HMR/refresh in same tab)
  useEffect(() => {
    try {
      const serializable = objects.map(({ ref, ...rest }) => rest);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        objects: serializable,
        animationTracks,
        selectedObject,
        currentFrame,
      }));
    } catch {}
  }, [objects, animationTracks, selectedObject, currentFrame]);


  // Playback loop
  useEffect(() => {
    if (isPlaying) {
      const startTime = performance.now();
      const startFrame = currentFrame;
      const duration = 4000; // 4 seconds for full timeline
      
      const animate = (time: number) => {
        const elapsed = time - startTime;
        const t = elapsed / duration;
        const frame = Math.round(startFrame + t * (totalFrames - startFrame));
        
        if (frame >= totalFrames) {
          setCurrentFrame(totalFrames);
          setIsPlaying(false);
          return;
        }
        
        setCurrentFrame(frame);
        playRef.current = requestAnimationFrame(animate);
      };
      
      playRef.current = requestAnimationFrame(animate);
      return () => {
        if (playRef.current) cancelAnimationFrame(playRef.current);
      };
    }
  }, [isPlaying]);

  // Apply animation at current frame
  useEffect(() => {
    animationTracks.forEach(track => {
      if (track.keyframes.length < 2) return;
      
      const kfs = track.keyframes;
      let prev = kfs[0];
      let next = kfs[kfs.length - 1];
      
      if (currentFrame <= prev.frame) {
        applyKeyframeToObject(track.objectId, prev);
        return;
      }
      if (currentFrame >= next.frame) {
        applyKeyframeToObject(track.objectId, next);
        return;
      }
      
      for (let i = 0; i < kfs.length - 1; i++) {
        if (currentFrame >= kfs[i].frame && currentFrame <= kfs[i + 1].frame) {
          prev = kfs[i];
          next = kfs[i + 1];
          break;
        }
      }
      
      const t = (currentFrame - prev.frame) / (next.frame - prev.frame);
      const interpolated = bezierInterpolate(prev, next, t);
      
      setObjects(prevObjs => prevObjs.map(obj => 
        obj.id === track.objectId 
          ? { ...obj, position: interpolated.position, rotation: interpolated.rotation, scale: interpolated.scale }
          : obj
      ));
    });
  }, [currentFrame, animationTracks]);

  function bezierInterpolate(a: Keyframe, b: Keyframe, t: number) {
    const cubicBezier = (p0: number, p1: number, p2: number, p3: number, t: number) => {
      const mt = 1 - t;
      return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
    };

    const pos: [number, number, number] = [0, 0, 0];
    const rot: [number, number, number] = [0, 0, 0];
    const scl: [number, number, number] = [0, 0, 0];

    for (let i = 0; i < 3; i++) {
      pos[i] = cubicBezier(
        a.position[i],
        a.position[i] + a.outTangent[i],
        b.position[i] + b.inTangent[i],
        b.position[i],
        t
      );
      rot[i] = a.rotation[i] + (b.rotation[i] - a.rotation[i]) * t;
      scl[i] = a.scale[i] + (b.scale[i] - a.scale[i]) * t;
    }

    return { position: pos, rotation: rot, scale: scl };
  }

  function applyKeyframeToObject(objectId: string, kf: Keyframe) {
    setObjects(prev => prev.map(obj => 
      obj.id === objectId 
        ? { ...obj, position: [...kf.position] as [number,number,number], rotation: [...kf.rotation] as [number,number,number], scale: [...kf.scale] as [number,number,number] }
        : obj
    ));
  }

  // Save state for undo/redo
  const saveState = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-19), [...objects]]);
    setRedoStack([]);
  }, [objects]);

  const createObject = useCallback((type: string) => {
    if (['box', 'sphere', 'cylinder', 'cone', 'torus', 'plane'].includes(type)) {
      saveState();
      const newObject: Object3DData = {
        id: `${type}_${Date.now()}`,
        name: `${type}_${Math.random().toString(36).slice(2, 8)}`,
        type: type as any,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: '#3b82f6',
        visible: true,
        locked: false,
        modifiers: [],
        ref: { current: null } as any,
      };
      
      setObjects(prev => [...prev, newObject]);
      setSelectedObject(newObject.id);
      toast.success(`${type} created`);
    }
  }, [saveState]);

  // Animation operations
  const addKeyframe = useCallback((objectId: string, frame: number) => {
    const obj = objects.find(o => o.id === objectId);
    if (!obj) return;

    const newKf: Keyframe = {
      id: `kf_${Date.now()}`,
      objectId,
      frame,
      position: [...obj.position] as [number, number, number],
      rotation: [...obj.rotation] as [number, number, number],
      scale: [...obj.scale] as [number, number, number],
      inTangent: [-0.5, 0, 0],
      outTangent: [0.5, 0, 0],
    };

    setAnimationTracks(prev => {
      const existing = prev.find(t => t.objectId === objectId);
      if (existing) {
        // Replace keyframe at same frame or add new
        const filtered = existing.keyframes.filter(k => k.frame !== frame);
        const updated = [...filtered, newKf].sort((a, b) => a.frame - b.frame);
        return prev.map(t => t.objectId === objectId ? { ...t, keyframes: updated } : t);
      } else {
        return [...prev, {
          objectId,
          objectName: obj.name || obj.type,
          keyframes: [newKf],
          showTrajectory: false,
        }];
      }
    });
    
    toast.success(`Keyframe added at frame ${frame}`);
  }, [objects]);

  const removeKeyframe = useCallback((objectId: string, keyframeId: string) => {
    setAnimationTracks(prev => prev.map(t => 
      t.objectId === objectId
        ? { ...t, keyframes: t.keyframes.filter(k => k.id !== keyframeId) }
        : t
    ).filter(t => t.keyframes.length > 0));
    setSelectedKeyframe(null);
    toast.success('Keyframe removed');
  }, []);

  const updateKeyframe = useCallback((objectId: string, keyframeId: string, updates: Partial<Keyframe>) => {
    setAnimationTracks(prev => prev.map(t => 
      t.objectId === objectId
        ? { ...t, keyframes: t.keyframes.map(k => k.id === keyframeId ? { ...k, ...updates } : k) }
        : t
    ));
  }, []);

  const toggleTrajectory = useCallback((objectId: string) => {
    setAnimationTracks(prev => prev.map(t => 
      t.objectId === objectId ? { ...t, showTrajectory: !t.showTrajectory } : t
    ));
  }, []);

  // Modifier operations
  const addModifier = useCallback((objectId: string, modifierType: string) => {
    const newModifier: Modifier = {
      id: `${modifierType}_${Date.now()}`,
      type: modifierType,
      params: {},
      active: true
    };
    
    setObjects(prev => prev.map(obj => 
      obj.id === objectId 
        ? { ...obj, modifiers: [...(obj.modifiers || []), newModifier] }
        : obj
    ));
    
    toast.success(`${modifierType} modifier added`);
  }, []);

  const updateModifier = useCallback((objectId: string, modifierId: string, params: any) => {
    setObjects(prev => prev.map(obj => 
      obj.id === objectId 
        ? { 
            ...obj, 
            modifiers: obj.modifiers?.map(mod => 
              mod.id === modifierId ? { ...mod, params } : mod
            ) || []
          }
        : obj
    ));
  }, []);

  const removeModifier = useCallback((objectId: string, modifierId: string) => {
    setObjects(prev => prev.map(obj => 
      obj.id === objectId 
        ? { 
            ...obj, 
            modifiers: obj.modifiers?.filter(mod => mod.id !== modifierId) || []
          }
        : obj
    ));
    
    toast.success('Modifier removed');
  }, []);

  const updateObjectGeometry = useCallback((objectId: string, params: any) => {
    setObjects(prev => prev.map(obj => 
      obj.id === objectId 
        ? { ...obj, geometry: { ...(obj.geometry || {}), ...params } }
        : obj
    ));
  }, []);

  const handleSelectObject = useCallback((id: string | null) => {
    setSelectedObject(id);
  }, []);

  const handleTransformObject = useCallback((id: string, transform: any) => {
    setObjects(prev => prev.map(obj => 
      obj.id === id ? { ...obj, ...transform } : obj
    ));
  }, []);

  // Object operations
  const deleteObject = useCallback((id: string) => {
    saveState();
    setObjects(prev => prev.filter(obj => obj.id !== id));
    setAnimationTracks(prev => prev.filter(t => t.objectId !== id));
    if (selectedObject === id) setSelectedObject(null);
    toast.success('Object deleted');
  }, [saveState, selectedObject]);

  const duplicateObject = useCallback((id: string) => {
    const obj = objects.find(o => o.id === id);
    if (obj) {
      saveState();
      const newObject: Object3DData = {
        ...obj,
        id: `${obj.type}_${Date.now()}`,
        name: `${obj.name}_copy`,
        position: [obj.position[0] + 1, obj.position[1], obj.position[2]],
        ref: { current: null } as any,
      };
      setObjects(prev => [...prev, newObject]);
      setSelectedObject(newObject.id);
      toast.success('Object duplicated');
    }
  }, [objects, saveState]);

  const toggleVisibility = useCallback((id: string) => {
    setObjects(prev => prev.map(obj => 
      obj.id === id ? { ...obj, visible: !obj.visible } : obj
    ));
  }, []);

  const toggleLock = useCallback((id: string) => {
    setObjects(prev => prev.map(obj => 
      obj.id === id ? { ...obj, locked: !obj.locked } : obj
    ));
  }, []);

  const renameObject = useCallback((id: string, name: string) => {
    setObjects(prev => prev.map(obj => 
      obj.id === id ? { ...obj, name } : obj
    ));
  }, []);

  const handleMaterialChange = useCallback((objectId: string, material: any) => {
    setObjects(prev => prev.map(obj => 
      obj.id === objectId ? { ...obj, material, color: material.color } : obj
    ));
  }, []);

  // Undo/Redo
  const undo = useCallback(() => {
    if (undoStack.length > 0) {
      const previousState = undoStack[undoStack.length - 1];
      setRedoStack(prev => [...prev, [...objects]]);
      setUndoStack(prev => prev.slice(0, -1));
      setObjects(previousState);
      toast.success('Undo');
    }
  }, [undoStack, objects]);

  const redo = useCallback(() => {
    if (redoStack.length > 0) {
      const nextState = redoStack[redoStack.length - 1];
      setUndoStack(prev => [...prev, [...objects]]);
      setRedoStack(prev => prev.slice(0, -1));
      setObjects(nextState);
      toast.success('Redo');
    }
  }, [redoStack, objects]);

  // File operations
  const saveProject = useCallback((filename: string) => {
    const projectData = {
      version: '1.0',
      objects,
      animationTracks,
      selectedObject,
      currentFrame,
      timestamp: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.3dsled') ? filename : `${filename}.3dsled`;
    a.click();
    URL.revokeObjectURL(url);
  }, [objects, animationTracks, selectedObject, currentFrame]);

  const loadProject = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const projectData = JSON.parse(e.target?.result as string);
        saveState();
        setObjects(projectData.objects || []);
        setAnimationTracks(projectData.animationTracks || []);
        setSelectedObject(projectData.selectedObject || null);
        setCurrentFrame(projectData.currentFrame || 0);
      } catch (error) {
        toast.error('Failed to load project');
      }
    };
    reader.readAsText(file);
  }, [saveState]);

  const exportScene = useCallback((format: string, settings: any) => {
    toast.success(`Exporting as ${format.toUpperCase()}...`);
  }, []);

  const importModel = useCallback(async (file: File) => {
    const loadingId = toast.loading(`Importing ${file.name}...`);
    try {
      const { importModelFile, setImportedModel } = await import('./utils/modelImport');
      const model = await importModelFile(file);
      const id = `imported_${Date.now()}`;
      setImportedModel(id, model);
      saveState();
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const newObject: Object3DData = {
        id,
        name: baseName,
        type: 'imported',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: '#9ca3af',
        visible: true,
        locked: false,
        modifiers: [],
        ref: { current: null } as any,
      };
      setObjects(prev => [...prev, newObject]);
      setSelectedObject(id);
      toast.dismiss(loadingId);
      const animMsg = model.animations.length > 0
        ? ` (${model.animations.length} animation${model.animations.length > 1 ? 's' : ''})`
        : '';
      toast.success(`Imported ${file.name}${animMsg}`);

    } catch (err: any) {
      toast.dismiss(loadingId);
      console.error('Import failed:', err);
      toast.error(`Import failed: ${err?.message || 'unknown error'}`);
    }
  }, [saveState]);


  const handleDeleteSelected = useCallback(() => {
    if (selectedObject) deleteObject(selectedObject);
  }, [selectedObject, deleteObject]);

  const handleSelectAll = useCallback(() => {
    toast.info('Multi-selection not yet implemented');
  }, []);

  const handleDeselectAll = useCallback(() => {
    setSelectedObject(null);
  }, []);

  const handleFocusSelected = useCallback(() => {
    if (selectedObject) toast.info('Focus on object');
  }, [selectedObject]);

  const openFileDialog = useCallback((type: 'save' | 'open' | 'export' | 'import') => {
    setFileDialogType(type);
    setFileDialogOpen(true);
  }, []);

  const selectedObjectData = objects.find(obj => obj.id === selectedObject);

  return (
    <div className="h-screen bg-background text-foreground overflow-hidden flex flex-col">
      <KeyboardShortcuts
        onTransformMode={setTransformMode}
        onDeleteSelected={handleDeleteSelected}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        onFocusSelected={handleFocusSelected}
        onUndo={undo}
        onRedo={redo}
        onSave={() => openFileDialog('save')}
        onOpen={() => openFileDialog('open')}
        onNew={() => {
          saveState();
          setObjects([]);
          setAnimationTracks([]);
          setSelectedObject(null);
          setCurrentFrame(0);
          toast.success('New scene created');
        }}
        onViewportChange={setActiveViewport}
      />

      <MenuBar 
        onOpenMaterialEditor={() => setMaterialEditorOpen(true)}
        onFileOperation={openFileDialog}
        onViewportChange={setActiveViewport}
        activeViewport={activeViewport}
      />

      <div className="flex flex-1 min-h-0">
        <div className="w-64 bg-panel border-r border-panel-border">
          <SceneHierarchy
            objects={objects}
            selectedObject={selectedObject}
            selectedSubUuid={selectedSubUuid}
            onSelectObject={(id) => { handleSelectObject(id); setSelectedSubUuid(null); }}
            onSelectSubObject={(_id, uuid) => setSelectedSubUuid(uuid)}
            onDeleteObject={deleteObject}
            onDuplicateObject={duplicateObject}
            onToggleVisibility={toggleVisibility}
            onToggleLock={toggleLock}
            onRenameObject={renameObject}
          />
        </div>


        <div className="flex-1 flex flex-col min-h-0">
          <div className="h-12 bg-panel border-b border-panel-border flex items-center px-4 gap-2">
            <span className="text-xs text-muted-foreground mr-4">Transform:</span>
            <Button variant={transformMode === 'translate' ? 'default' : 'ghost'} size="sm"
              onClick={() => setTransformMode('translate')} className="h-8 gap-2" title="Move Tool (W)">
              ⌖ Move
            </Button>
            <Button variant={transformMode === 'rotate' ? 'default' : 'ghost'} size="sm"
              onClick={() => setTransformMode('rotate')} className="h-8 gap-2" title="Rotate Tool (E)">
              ↻ Rotate
            </Button>
            <Button variant={transformMode === 'scale' ? 'default' : 'ghost'} size="sm"
              onClick={() => setTransformMode('scale')} className="h-8 gap-2" title="Scale Tool (R)">
              ⚏ Scale
            </Button>

            <div className="w-px h-6 bg-panel-border mx-2" />

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMaterialEditorOpen(true)}
              className="h-8 gap-2"
              title="Material Editor (M)"
            >
              ◐ Edit Material
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setQuickRenderOpen(true)}
              className="h-8 gap-2"
              title="Quick Render (Shift+Q)"
            >
              ▶ Quick Render
            </Button>
          </div>

          <div className="flex-1 min-h-0 p-1">
            <Viewport
              type={activeViewport}
              isActive={true}
              onActivate={() => {}}
              objects={objects.filter(obj => obj.visible !== false)}
              selectedObject={selectedObject}
              onSelectObject={handleSelectObject}
              onTransformObject={handleTransformObject}
              transformMode={transformMode}
              animationTracks={animationTracks}
              selectedKeyframe={selectedKeyframe}
              onUpdateKeyframe={updateKeyframe}
            />
          </div>
        </div>

        <SidePanel
          onCreateObject={createObject}
          selectedObject={selectedObjectData}
          onOpenMaterialEditor={() => setMaterialEditorOpen(true)}
          onAddModifier={addModifier}
          onUpdateModifier={updateModifier}
          onRemoveModifier={removeModifier}
          onUpdateObjectGeometry={updateObjectGeometry}
        />
      </div>

      {/* Animation Timeline */}
      <AnimationTimeline
        tracks={animationTracks}
        currentFrame={currentFrame}
        totalFrames={totalFrames}
        isPlaying={isPlaying}
        selectedObject={selectedObject}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onStop={() => { setIsPlaying(false); setCurrentFrame(0); }}
        onFrameChange={setCurrentFrame}
        onAddKeyframe={addKeyframe}
        onRemoveKeyframe={removeKeyframe}
        onUpdateKeyframe={updateKeyframe}
        onToggleTrajectory={toggleTrajectory}
        onSelectKeyframe={setSelectedKeyframe}
        selectedKeyframe={selectedKeyframe}
      />

      <MaterialEditor
        open={materialEditorOpen}
        onOpenChange={setMaterialEditorOpen}
        selectedObject={selectedObjectData}
        onMaterialChange={handleMaterialChange}
      />

      <QuickRender open={quickRenderOpen} onOpenChange={setQuickRenderOpen} />

      <FileOperations
        open={fileDialogOpen}
        onOpenChange={setFileDialogOpen}
        type={fileDialogType}
        onSaveProject={saveProject}
        onLoadProject={loadProject}
        onExportScene={exportScene}
        onImportModel={importModel}
      />
    </div>
  );
};
