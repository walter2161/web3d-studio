import { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MenuBar } from './MenuBar';
import { ViewportGrid, ViewportLayout } from './ViewportGrid';
import { SidePanel } from './SidePanel';
import { AnimationTimeline, Keyframe, AnimationTrack } from './AnimationTimeline';
import { MaterialEditor } from './MaterialEditor';
import { QuickRender } from './QuickRender';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { SceneHierarchy } from './SceneHierarchy';
import { FileOperations } from './FileOperations';
import { MainToolbar, SnapsToolbar } from './ToolbarStrip';
import { StatusBar } from './StatusBar';
import { RenderSetup } from './r3/RenderSetup';
import { EnvironmentDialog } from './r3/EnvironmentDialog';
import { ViewImageFile } from './r3/ViewImageFile';
import { MaterialMapBrowser } from './r3/MaterialMapBrowser';
import { EnvironmentProvider } from './r3/EnvironmentContext';
import { ObjectPropertiesDialog } from './r3/ObjectPropertiesDialog';
import { UnitsSetup, loadUnits } from './r3/UnitsSetup';
import { GridAndSnapSettings, loadSnap } from './r3/GridAndSnapSettings';
import { AboutDialog } from './r3/AboutDialog';
import { ConfirmDialog } from './r3/ConfirmDialog';
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
  // Sprint A additions
  groupId?: string;        // membership in a group node
  groupOpen?: boolean;     // used on the group node itself (id === groupId)
  isGroup?: boolean;       // marker for group container objects (not rendered)
  properties?: {
    renderable?: boolean;
    castShadows?: boolean;
    receiveShadows?: boolean;
    visibility?: number;
    displayAsBox?: boolean;
    backfaceCull?: boolean;
    edgesOnly?: boolean;
    vertexTicks?: boolean;
    wireframeColor?: string;
    motionBlur?: 'none' | 'object' | 'image';
    motionBlurMultiplier?: number;
    gBufferId?: number;
  };
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
  const [autoKey, setAutoKey] = useState(false);
  const [viewportLayout, setViewportLayout] = useState<ViewportLayout>('single');
  const [hierarchyCollapsed, setHierarchyCollapsed] = useState(false);

  const [materialEditorOpen, setMaterialEditorOpen] = useState(false);
  const [quickRenderOpen, setQuickRenderOpen] = useState(false);
  const [renderSetupOpen, setRenderSetupOpen] = useState(false);
  const [environmentOpen, setEnvironmentOpen] = useState(false);
  const [viewImageOpen, setViewImageOpen] = useState(false);
  const [materialBrowserOpen, setMaterialBrowserOpen] = useState(false);
  const [objectPropsOpen, setObjectPropsOpen] = useState(false);
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [snapSettingsOpen, setSnapSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<{ open: boolean; message: string; onOk: () => void; title?: string }>({ open: false, message: '', onOk: () => {} });
  const [heldSnapshot, setHeldSnapshot] = useState<Object3DData[] | null>(null);
  const [units, setUnits] = useState(() => loadUnits());
  const [snapCfg, setSnapCfg] = useState(() => loadSnap());
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

  // Rehydrate imported models from IndexedDB on mount.
  // Autosave restores object metadata, but the parsed scene graph lives in
  // memory only — we re-parse from the stored bytes so the character isn't
  // replaced by a placeholder cube after a refresh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const importedObjs = objects.filter(o => o.type === 'imported');
      if (importedObjs.length === 0) return;
      const { getImportedModel, setImportedModel, importFromBytes } = await import('./utils/modelImport');
      const { loadModelBlob } = await import('./utils/modelStorage');
      let rehydratedAny = false;
      for (const obj of importedObjs) {
        if (getImportedModel(obj.id)) continue;
        try {
          const stored = await loadModelBlob(obj.id);
          if (!stored) continue;
          const model = await importFromBytes(stored.filename, stored.bytes);
          if (cancelled) return;
          setImportedModel(obj.id, model);
          rehydratedAny = true;
        } catch (e) {
          console.warn('Failed to rehydrate imported model', obj.id, e);
        }
      }
      // Force a re-render so <primitive> picks up the newly cached scene.
      if (rehydratedAny && !cancelled) {
        setObjects(prev => prev.map(o => ({ ...o })));
      }
    })();
    return () => { cancelled = true; };
    // Run once on mount; subsequent imports set the cache synchronously.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);




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
    const obj = objects.find(o => o.id === id);
    setObjects(prev => prev.filter(o => o.id !== id));
    setAnimationTracks(prev => prev.filter(t => t.objectId !== id));
    if (selectedObject === id) setSelectedObject(null);
    // Clean up persisted blob for imported models.
    if (obj?.type === 'imported') {
      import('./utils/modelStorage').then(({ deleteModelBlob }) => {
        deleteModelBlob(id).catch(() => {});
      });
      import('./utils/modelImport').then(({ removeImportedModel }) => {
        removeImportedModel(id);
      });
    }
    toast.success('Object deleted');
  }, [saveState, selectedObject, objects]);


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
      const { saveModelBlob } = await import('./utils/modelStorage');
      const { model, bytes } = await importModelFile(file);
      const id = `imported_${Date.now()}`;
      setImportedModel(id, model);
      // Persist the original bytes so we can rehydrate after a refresh.
      try {
        await saveModelBlob(id, file.name, bytes);
      } catch (e) {
        console.warn('Could not persist model blob:', e);
      }
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
        // Store filename in geometry blob so rehydration knows the extension.
        geometry: { __importedFilename: file.name },
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

  // ---------- Sprint A: menu operations ----------

  const askConfirm = (message: string, onOk: () => void, title = 'Confirm') =>
    setConfirmState({ open: true, message, onOk, title });

  const doNewScene = () => askConfirm('Discard current scene and start a new one?', () => {
    saveState();
    setObjects([]);
    setSelectedObject(null);
    setAnimationTracks([]);
    setCurrentFrame(0);
    toast.success('New scene');
  }, 'New Scene');

  const doReset = () => askConfirm('Reset all objects, animations and timeline?', () => {
    saveState();
    setObjects([]);
    setSelectedObject(null);
    setAnimationTracks([]);
    setCurrentFrame(0);
    setIsPlaying(false);
    setAutoKey(false);
    setTransformMode('translate');
    toast.success('Scene reset');
  }, 'Reset');

  const doHold = () => {
    setHeldSnapshot(JSON.parse(JSON.stringify(objects.map(({ ref, ...o }) => o))));
    toast.success('Scene held');
  };
  const doFetch = () => {
    if (!heldSnapshot) { toast.error('Nothing to fetch — use Edit → Hold first'); return; }
    askConfirm('Discard current scene and restore last Hold snapshot?', () => {
      saveState();
      setObjects(heldSnapshot.map((o) => ({ ...o, ref: { current: null } })));
      setSelectedObject(null);
      toast.success('Scene fetched');
    }, 'Fetch');
  };

  // ---------- Groups ----------

  const doGroup = () => {
    // Group all currently visible top-level selected + everything if none, but we only have single-select.
    // Behavior: convert selected + all non-grouped as a new group? R3 requires multi-select.
    // We approximate: group the selected object with the previously duplicated/created objects that share color.
    // For now, prompt to name and group ALL top-level ungrouped objects.
    if (objects.filter((o) => !o.groupId && !o.isGroup).length < 2) {
      toast.error('Select at least 2 objects (multi-select coming soon)');
      return;
    }
    const name = window.prompt('Group name?', `Group${(objects.filter((o) => o.isGroup).length || 0) + 1}`);
    if (!name) return;
    const groupId = `grp-${Date.now()}`;
    saveState();
    setObjects((prev) => {
      const groupNode: Object3DData = {
        id: groupId, name, type: 'box', position: [0,0,0], rotation: [0,0,0], scale: [1,1,1],
        color: '#888', isGroup: true, groupOpen: false, visible: true,
      };
      return [
        groupNode,
        ...prev.map((o) => o.groupId || o.isGroup ? o : { ...o, groupId }),
      ];
    });
    setSelectedObject(groupId);
    toast.success(`Grouped as "${name}"`);
  };
  const doUngroup = () => {
    const sel = objects.find((o) => o.id === selectedObject);
    if (!sel || !sel.isGroup) { toast.error('Select a group to ungroup'); return; }
    saveState();
    setObjects((prev) => prev
      .filter((o) => o.id !== sel.id)
      .map((o) => o.groupId === sel.id ? { ...o, groupId: undefined } : o));
    setSelectedObject(null);
    toast.success('Ungrouped');
  };
  const doOpenGroup = () => {
    const sel = objects.find((o) => o.id === selectedObject);
    if (!sel?.isGroup) return;
    setObjects((prev) => prev.map((o) => o.id === sel.id ? { ...o, groupOpen: true } : o));
  };
  const doCloseGroup = () => {
    const sel = objects.find((o) => o.id === selectedObject);
    if (!sel?.isGroup) return;
    setObjects((prev) => prev.map((o) => o.id === sel.id ? { ...o, groupOpen: false } : o));
  };
  const doExplode = () => {
    // Remove all group containers, keep members ungrouped.
    saveState();
    setObjects((prev) => prev.filter((o) => !o.isGroup).map((o) => ({ ...o, groupId: undefined })));
    setSelectedObject(null);
    toast.success('Exploded groups');
  };

  const saveObjectProperties = (id: string, updates: { name?: string; color?: string; properties: any }) => {
    saveState();
    setObjects((prev) => prev.map((o) => o.id === id ? {
      ...o,
      name: updates.name ?? o.name,
      color: updates.color ?? o.color,
      properties: { ...(o.properties || {}), ...updates.properties },
    } : o));
    toast.success('Properties updated');
  };

  const handleMenuAction = (action: string) => {
    switch (action) {
      case 'New Scene': doNewScene(); break;
      case 'Reset': doReset(); break;
      case 'Hold': doHold(); break;
      case 'Fetch': doFetch(); break;
      case 'Exit': askConfirm('Save changes before exit?', () => { openFileDialog('save'); }, 'Exit'); break;
      case 'Object Properties...': if (selectedObject) setObjectPropsOpen(true); else toast.error('Select an object'); break;
      case 'Select All': setSelectedObject(objects[0]?.id ?? null); break;
      case 'Select None': setSelectedObject(null); break;
      case 'Group': doGroup(); break;
      case 'Ungroup': doUngroup(); break;
      case 'Open': doOpenGroup(); break;
      case 'Close': doCloseGroup(); break;
      case 'Explode': doExplode(); break;
      case 'Units Setup...': setUnitsOpen(true); break;
      case 'Grid and Snap Settings...': setSnapSettingsOpen(true); break;
      case 'About 3ds Max...': setAboutOpen(true); break;
      default: break;
    }
  };

  return (
    <EnvironmentProvider>
    <div className="h-screen bg-win-face text-win-text overflow-hidden flex flex-col select-none">
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

      {/* Windows title bar */}
      <div className="titlebar-gradient h-[20px] px-1.5 flex items-center justify-between text-[11px] font-bold shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 bevel-raised bg-win-face flex items-center justify-center text-[10px] text-win-title">3</div>
          <span>Untitled - 3dsLed R3</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button className="w-[16px] h-[14px] bevel-raised text-win-text text-[10px] leading-none">_</button>
          <button className="w-[16px] h-[14px] bevel-raised text-win-text text-[10px] leading-none">▢</button>
          <button className="w-[16px] h-[14px] bevel-raised text-win-text text-[10px] leading-none">✕</button>
        </div>
      </div>

      <MenuBar
        onOpenMaterialEditor={() => setMaterialEditorOpen(true)}
        onFileOperation={openFileDialog}
        onViewportChange={setActiveViewport}
        activeViewport={activeViewport}
        onQuickRender={() => setQuickRenderOpen(true)}
        onRenderSetup={() => setRenderSetupOpen(true)}
        onEnvironment={() => setEnvironmentOpen(true)}
        onMaterialBrowser={() => setMaterialBrowserOpen(true)}
        onViewImageFile={() => setViewImageOpen(true)}
      />

      {/* Main toolbar row (icons) */}
      <div className="shrink-0">
        <MainToolbar
          transformMode={transformMode}
          onTransformMode={setTransformMode}
          onUndo={undo}
          onRedo={redo}
          onOpenMaterialEditor={() => setMaterialEditorOpen(true)}
          onQuickRender={() => setQuickRenderOpen(true)}
        />
      </div>

      {/* Snaps / secondary toolbar row */}
      <div className="shrink-0">
        <SnapsToolbar />
      </div>

      <div className="flex flex-1 min-h-0 bg-win-face">
        {/* Left: Scene hierarchy (collapsible) */}
        {hierarchyCollapsed ? (
          <div className="w-6 bevel-raised bg-win-face flex flex-col items-center py-1">
            <button
              className="w-5 h-5 bevel-raised bg-win-face hover:brightness-110 flex items-center justify-center"
              title="Mostrar Hierarquia"
              onClick={() => setHierarchyCollapsed(false)}
            >
              <ChevronRight size={12} />
            </button>
            <div
              className="mt-2 text-[10px] select-none cursor-pointer"
              style={{ writingMode: 'vertical-rl' }}
              onClick={() => setHierarchyCollapsed(false)}
            >
              Hierarchy
            </div>
          </div>
        ) : (
          <div className="w-56 bevel-inset bg-panel flex flex-col">
            <div className="flex items-center justify-between px-1 py-0.5 bevel-raised bg-win-face shrink-0">
              <span className="text-[11px] font-bold pl-1">Hierarchy</span>
              <button
                className="w-5 h-5 bevel-raised bg-win-face hover:brightness-110 flex items-center justify-center"
                title="Esconder Hierarquia"
                onClick={() => setHierarchyCollapsed(true)}
              >
                <ChevronLeft size={12} />
              </button>
            </div>
            <div className="flex-1 min-h-0">
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
          </div>
        )}

        {/* Center: Viewport(s) */}
        <div className="flex-1 flex flex-col min-h-0 bevel-inset">
          <div className="flex-1 min-h-0 bg-win-dark">
            <ViewportGrid
              layout={viewportLayout}
              activeViewport={activeViewport}
              onActiveViewportChange={setActiveViewport}
              objects={objects.filter(obj => obj.visible !== false)}
              selectedObject={selectedObject}
              selectedSubUuid={selectedSubUuid}
              onSelectObject={(id) => { handleSelectObject(id); if (id === null) setSelectedSubUuid(null); }}
              onTransformObject={handleTransformObject}
              transformMode={transformMode}
              animationTracks={animationTracks}
              selectedKeyframe={selectedKeyframe}
              onUpdateKeyframe={updateKeyframe}
              currentFrame={currentFrame}
              totalFrames={totalFrames}
              isPlaying={isPlaying}
            />
          </div>
        </div>

        {/* Right: Command Panel — fixed width like 3ds Max R3 (~200 px) */}
        <div className="w-[210px] shrink-0 bevel-inset bg-panel overflow-hidden">
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
      </div>

      {/* Trackbar (Animation timeline) */}
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

      {/* Status bar */}
      <StatusBar
        currentFrame={currentFrame}
        totalFrames={totalFrames}
        isPlaying={isPlaying}
        autoKey={autoKey}
        onToggleAutoKey={() => setAutoKey(v => !v)}
        onSetKey={() => {
          if (selectedObject) addKeyframe(selectedObject, currentFrame);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onStop={() => { setIsPlaying(false); setCurrentFrame(0); }}
        onFrameChange={setCurrentFrame}
        selectedPosition={selectedObjectData?.position ?? null}
        prompt={selectedObjectData ? `Selected: ${selectedObjectData.name || selectedObjectData.type}` : 'Click and drag to select and move objects'}
        viewportLayout={viewportLayout}
        onToggleViewportLayout={() => setViewportLayout(v => v === 'single' ? 'quad' : 'single')}
      />


      <MaterialEditor
        open={materialEditorOpen}
        onOpenChange={setMaterialEditorOpen}
        selectedObject={selectedObjectData}
        onMaterialChange={handleMaterialChange}
      />

      <QuickRender open={quickRenderOpen} onOpenChange={setQuickRenderOpen} />
      <RenderSetup
        open={renderSetupOpen}
        onOpenChange={setRenderSetupOpen}
        onRender={() => setQuickRenderOpen(true)}
        currentFrame={currentFrame}
      />
      <EnvironmentDialog open={environmentOpen} onOpenChange={setEnvironmentOpen} />
      <ViewImageFile open={viewImageOpen} onOpenChange={setViewImageOpen} />
      <MaterialMapBrowser open={materialBrowserOpen} onOpenChange={setMaterialBrowserOpen} />

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
    </EnvironmentProvider>
  );
};
