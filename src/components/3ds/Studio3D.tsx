import { useState, useRef, useCallback, useEffect } from 'react';
import { MenuBar } from './MenuBar';
import { Viewport } from './Viewport';
import { SidePanel } from './SidePanel';
import { Timeline } from './Timeline';
import { MaterialEditor } from './MaterialEditor';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { SceneHierarchy } from './SceneHierarchy';
import { FileOperations } from './FileOperations';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Object3DData {
  id: string;
  name?: string;
  type: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane';
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  material?: any;
  visible?: boolean;
  locked?: boolean;
  ref?: React.MutableRefObject<any>;
}

export const Studio3D = () => {
  const [objects, setObjects] = useState<Object3DData[]>([]);
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const [activeViewport, setActiveViewport] = useState<'perspective' | 'top' | 'front' | 'left'>('perspective');
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [materialEditorOpen, setMaterialEditorOpen] = useState(false);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [fileDialogType, setFileDialogType] = useState<'save' | 'open' | 'export' | 'import'>('save');
  const [undoStack, setUndoStack] = useState<Object3DData[][]>([]);
  const [redoStack, setRedoStack] = useState<Object3DData[][]>([]);
  const totalFrames = 100;

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
        ref: { current: null } as any,
      };
      
      setObjects(prev => [...prev, newObject]);
      setSelectedObject(newObject.id);
      toast.success(`${type} created`);
    }
  }, [saveState]);

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

  // Object operations
  const deleteObject = useCallback((id: string) => {
    saveState();
    setObjects(prev => prev.filter(obj => obj.id !== id));
    if (selectedObject === id) {
      setSelectedObject(null);
    }
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
      obj.id === id 
        ? { ...obj, visible: !obj.visible }
        : obj
    ));
  }, []);

  const toggleLock = useCallback((id: string) => {
    setObjects(prev => prev.map(obj => 
      obj.id === id 
        ? { ...obj, locked: !obj.locked }
        : obj
    ));
  }, []);

  const renameObject = useCallback((id: string, name: string) => {
    setObjects(prev => prev.map(obj => 
      obj.id === id 
        ? { ...obj, name }
        : obj
    ));
  }, []);

  const handleMaterialChange = useCallback((objectId: string, material: any) => {
    setObjects(prev => prev.map(obj => 
      obj.id === objectId 
        ? { ...obj, material, color: material.color }
        : obj
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
      selectedObject,
      currentFrame,
      timestamp: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(projectData, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.3dsled') ? filename : `${filename}.3dsled`;
    a.click();
    URL.revokeObjectURL(url);
  }, [objects, selectedObject, currentFrame]);

  const loadProject = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const projectData = JSON.parse(e.target?.result as string);
        saveState();
        setObjects(projectData.objects || []);
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
    // TODO: Implement actual export functionality
  }, []);

  const importModel = useCallback((file: File) => {
    toast.success(`Importing ${file.name}...`);
    // TODO: Implement actual import functionality
  }, []);

  // Keyboard shortcuts
  const handleDeleteSelected = useCallback(() => {
    if (selectedObject) {
      deleteObject(selectedObject);
    }
  }, [selectedObject, deleteObject]);

  const handleSelectAll = useCallback(() => {
    // TODO: Implement multi-selection
    toast.info('Multi-selection not yet implemented');
  }, []);

  const handleDeselectAll = useCallback(() => {
    setSelectedObject(null);
  }, []);

  const handleFocusSelected = useCallback(() => {
    if (selectedObject) {
      // TODO: Focus camera on selected object
      toast.info('Focus on object');
    }
  }, [selectedObject]);

  const openFileDialog = useCallback((type: 'save' | 'open' | 'export' | 'import') => {
    setFileDialogType(type);
    setFileDialogOpen(true);
  }, []);

  const selectedObjectData = objects.find(obj => obj.id === selectedObject);

  return (
    <div className="h-screen bg-background text-foreground overflow-hidden">
      {/* Keyboard Shortcuts */}
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
          setSelectedObject(null);
          setCurrentFrame(0);
          toast.success('New scene created');
        }}
        onViewportChange={setActiveViewport}
      />

      {/* Menu Bar */}
      <MenuBar 
        onOpenMaterialEditor={() => setMaterialEditorOpen(true)}
        onFileOperation={openFileDialog}
        onViewportChange={setActiveViewport}
        activeViewport={activeViewport}
      />

      {/* Main Content */}
      <div className="flex h-[calc(100vh-2rem)]">
        {/* Left Sidebar - Scene Hierarchy */}
        <div className="w-64 bg-panel border-r border-panel-border">
          <SceneHierarchy
            objects={objects}
            selectedObject={selectedObject}
            onSelectObject={handleSelectObject}
            onDeleteObject={deleteObject}
            onDuplicateObject={duplicateObject}
            onToggleVisibility={toggleVisibility}
            onToggleLock={toggleLock}
            onRenameObject={renameObject}
          />
        </div>

        {/* Viewport Area with Toolbar */}
        <div className="flex-1 flex flex-col">
          {/* Transform Toolbar */}
          <div className="h-12 bg-panel border-b border-panel-border flex items-center px-4 gap-2">
            <span className="text-xs text-muted-foreground mr-4">Transform:</span>
            <Button
              variant={transformMode === 'translate' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTransformMode('translate')}
              className="h-8 gap-2"
              title="Move Tool (W)"
            >
              ⌖ Move
            </Button>
            <Button
              variant={transformMode === 'rotate' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTransformMode('rotate')}
              className="h-8 gap-2"
              title="Rotate Tool (E)"
            >
              ↻ Rotate
            </Button>
            <Button
              variant={transformMode === 'scale' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTransformMode('scale')}
              className="h-8 gap-2"
              title="Scale Tool (R)"
            >
              ⚏ Scale
            </Button>
          </div>

          {/* Viewport */}
          <div className="flex-1 p-1">
          <Viewport
            type={activeViewport}
            isActive={true}
            onActivate={() => {}}
            objects={objects.filter(obj => obj.visible !== false)}
            selectedObject={selectedObject}
            onSelectObject={handleSelectObject}
            onTransformObject={handleTransformObject}
            transformMode={transformMode}
            />
          </div>
        </div>

        {/* Right Side Panel */}
        <SidePanel
          onCreateObject={createObject}
          selectedObject={selectedObjectData}
          onOpenMaterialEditor={() => setMaterialEditorOpen(true)}
        />
      </div>

      {/* Timeline */}
      <div className="h-16 bg-panel border-t border-panel-border">
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

      {/* Material Editor Dialog */}
      <MaterialEditor
        open={materialEditorOpen}
        onOpenChange={setMaterialEditorOpen}
        selectedObject={selectedObjectData}
        onMaterialChange={handleMaterialChange}
      />

      {/* File Operations Dialog */}
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
    </div>
  );
};