import { useState, useRef, useCallback, useEffect } from 'react';
import { MenuBar } from './MenuBar';
import { ViewportGrid, ViewportLayout } from './ViewportGrid';
import { SidePanel } from './SidePanel';
import { AnimationTimeline, Keyframe, AnimationTrack } from './AnimationTimeline';
import type { BakedClipSet } from './timeline/channelTracks';
import { MaterialEditorR3 } from './r3/MaterialEditorR3';
import { QuickRender } from './QuickRender';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { SceneHierarchy } from './SceneHierarchy';
import { ObjectLibrary, DND_MIME } from './ObjectLibrary';
import { R3Dialog } from './r3/R3Dialog';
import { TransformTypeInDialog } from './r3/TransformTypeInDialog';
import { FileOperations } from './FileOperations';
import { MainToolbar, SnapsToolbar } from './ToolbarStrip';
import { StatusBar } from './StatusBar';
import { RenderSetup } from './r3/RenderSetup';
import { EnvironmentDialog } from './r3/EnvironmentDialog';
import { ViewImageFile } from './r3/ViewImageFile';
import { MaterialMapBrowser } from './r3/MaterialMapBrowser';
import { EnvironmentProvider } from './r3/EnvironmentContext';
import { RenderEngineProvider } from './r3/RenderEngineContext';
import { ObjectPropertiesDialog } from './r3/ObjectPropertiesDialog';
import { UnitsSetup, loadUnits } from './r3/UnitsSetup';
import { GridAndSnapSettings, loadSnap } from './r3/GridAndSnapSettings';
import { AboutDialog } from './r3/AboutDialog';
import { ConfirmDialog } from './r3/ConfirmDialog';
import { SelectByNameDialog } from './r3/SelectByNameDialog';
import { MirrorDialog } from './r3/MirrorDialog';
import { ArrayDialog } from './r3/ArrayDialog';
import { AlignDialog, AlignOpts } from './r3/AlignDialog';
import { CreationProvider, useCreation, GhostObject } from './r3/creation/CreationContext';
import { getViewportHandle } from './r3/viewportRegistry';
import { toast } from 'sonner';
import * as THREE from 'three';
import { snapDoorWindowToWall, type WallOpening, type WallGeom } from './utils/aecGeometry';
import { LoginDialog } from './r3/LoginDialog';
import { AdminPanelDialog } from './r3/AdminPanelDialog';
import { CloudSceneDialog } from './r3/CloudSceneDialog';
import { WelcomeDialog } from './r3/WelcomeDialog';
import { PreferencesDialog } from './prefs/PreferencesDialog';
import { MapToolsPanel } from './maptools/MapToolsPanel';
import { WaltSculptPanel } from './waltsculpt/WaltSculptPanel';
import { WaltSculptController } from './waltsculpt/WaltSculptController';
import { CustomizeUIDialog } from './prefs/CustomizeUIDialog';
import { commandForEvent } from './prefs/hotkeysStore';
import { DEFAULT_PRINTER_ID } from './print3d/printers';
import { DEFAULT_PARTICLE_GEOM } from './particles/ParticleObject';
import { HELPER_DEFAULTS } from './utils/helpers';
import { getImportedModel } from './utils/modelImport';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { paramsToEditableSpline } from './editable/EditableSpline';

// 3ds Max-style random wire color for new objects: saturated, mid-bright HSL.
const randomMaxColor = (): string => {
  const h = Math.random();
  const s = 0.55 + Math.random() * 0.35;
  const l = 0.5 + Math.random() * 0.15;
  return '#' + new THREE.Color().setHSL(h, s, l).getHexString();
};





interface Object3DData {
  id: string;
  name?: string;
  // Sprint C: expanded to include Extended Primitives + Shapes.
  type:
    | 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane' | 'imported'
    | 'hedra' | 'chamferBox' | 'chamferCyl' | 'oilTank' | 'spindle' | 'gengon' | 'torusKnot' | 'ringWave' | 'prism'
    | 'line' | 'rectangle' | 'circle' | 'ellipse' | 'arc' | 'donut' | 'ngon' | 'star' | 'helix' | 'text' | 'editable_spline'
    | 'wall' | 'door' | 'window'
    | 'helper'
    | 'bone_chain'
    | 'print_bed'
    | 'particle_emitter'
    | 'light_omni' | 'light_spot' | 'light_direct' | 'light_skylight' | 'light_ambient'
    | 'camera_target' | 'camera_free' | 'target_helper';


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
  lightData?: any;
  cameraData?: any;

  // Sprint A additions
  groupId?: string;
  groupOpen?: boolean;
  isGroup?: boolean;
  // 3ds Max "Select and Link" hierarchy — a real parent/child relationship
  // (independent from Group). Position/rotation/scale remain in world space;
  // parent transforms cascade to descendants via delta composition.
  parentId?: string | null;

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

const vectorTuple = (v: THREE.Vector3): [number, number, number] => [v.x, v.y, v.z];

const readPerspectiveViewPose = (activeViewport: string) => {
  const handle = getViewportHandle('perspective') ?? getViewportHandle(activeViewport) ?? getViewportHandle();
  const camera = handle?.camera;
  const controls = handle?.controls ?? (window as any).__activeOrbitControls ?? (window as any).__orbitControls;

  const position = camera
    ? camera.getWorldPosition(new THREE.Vector3())
    : new THREE.Vector3(3, 3, 3);
  const forward = camera
    ? camera.getWorldDirection(new THREE.Vector3()).normalize()
    : new THREE.Vector3(-1, -1, -1).normalize();
  const target = controls?.target?.isVector3
    ? controls.target.clone()
    : position.clone().add(forward.multiplyScalar(8));

  // Use camera-convention lookAt so local -Z faces the target (regular
  // Object3D.lookAt would make +Z face target, spawning cameras backwards).
  const up = camera ? camera.up.clone() : new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4().lookAt(position, target, up);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  const euler = new THREE.Euler().setFromQuaternion(q);

  const pc = camera as THREE.PerspectiveCamera | undefined;
  return {
    position: vectorTuple(position),
    target: vectorTuple(target),
    rotation: [euler.x, euler.y, euler.z] as [number, number, number],
    fov: pc?.isPerspectiveCamera ? pc.fov : 45,
    near: pc?.isPerspectiveCamera ? pc.near : 0.1,
    far: pc?.isPerspectiveCamera ? pc.far : 1000,
  };
};

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
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>(() => initial?.selectedObject ? [initial.selectedObject] : []);
  const [selectedSubUuid, setSelectedSubUuid] = useState<string | null>(null);

  // Expose current selection to the StatusBar viewport nav (Zoom Extents Selected,
  // Arc Rotate Selected). Uses a window-global so non-r3f code can read it
  // without threading props through the entire viewport tree.
  useEffect(() => {
    (window as any).__r3SelectedIds = selectedObjectIds.length ? selectedObjectIds : (selectedObject ? [selectedObject] : []);
  }, [selectedObjectIds, selectedObject]);

  // Global bus: SidePanel modifier picker → open WaltSculpt panel.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { objectId?: string } | undefined;
      setWaltSculptOpen(true);
      // Lazy import to avoid circular init.
      import('./waltsculpt/sculptStore').then(({ sculptStore }) => {
        sculptStore.set({ active: true, targetId: detail?.objectId ?? sculptStore.getState().targetId });
      });
    };
    window.addEventListener('r3-open-waltsculpt', onOpen);
    return () => window.removeEventListener('r3-open-waltsculpt', onOpen);
  }, []);

  useEffect(() => {
    if (!selectedObject) {
      if (selectedObjectIds.length) setSelectedObjectIds([]);
      return;
    }
    if (!selectedObjectIds.includes(selectedObject)) setSelectedObjectIds([selectedObject]);
  }, [selectedObject, selectedObjectIds]);



  const [activeViewport, setActiveViewport] = useState<'perspective' | 'top' | 'front' | 'left'>('perspective');
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [currentFrame, setCurrentFrame] = useState(initial?.currentFrame ?? 0);
  const [timelineVisible, setTimelineVisible] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoKey, setAutoKey] = useState(false);
  const [loopPlayback, setLoopPlayback] = useState(false);
  const [viewportLayout, setViewportLayout] = useState<ViewportLayout>('quad');
  const [viewportCameras, setViewportCameras] = useState<Record<string, string | null>>({
    perspective: null, top: null, front: null, left: null,
  });

  const [hierarchyWindowOpen, setHierarchyWindowOpen] = useState(false);
  const [libraryWindowOpen, setLibraryWindowOpen] = useState(false);
  const [typeInOpen, setTypeInOpen] = useState(false);

  const [materialEditorOpen, setMaterialEditorOpen] = useState(false);
  const [quickRenderOpen, setQuickRenderOpen] = useState(false);
  const [renderDims, setRenderDims] = useState<{ width?: number; height?: number }>({});
  const [renderSetupOpen, setRenderSetupOpen] = useState(false);
  const [environmentOpen, setEnvironmentOpen] = useState(false);
  const [viewImageOpen, setViewImageOpen] = useState(false);
  const [materialBrowserOpen, setMaterialBrowserOpen] = useState(false);
  const [mapToolsOpen, setMapToolsOpen] = useState(false);
  const [waltSculptOpen, setWaltSculptOpen] = useState(false);
  const [objectPropsOpen, setObjectPropsOpen] = useState(false);
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [snapSettingsOpen, setSnapSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  // View-menu options (Show Grid / Statistics / Update During Spinner Drag).
  const [viewOpts, setViewOpts] = useState({
    showGrid: true,
    showStatistics: false,
    updateDuringSpinnerDrag: true,
  });
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [customizeUIOpen, setCustomizeUIOpen] = useState(false);
  const [maxScriptOpen, setMaxScriptOpen] = useState(false);
  const [maxScriptLog, setMaxScriptLog] = useState<string[]>(['-- Walt3D MAXScript Listener --']);
  const [confirmState, setConfirmState] = useState<{ open: boolean; message: string; onOk: () => void; title?: string }>({ open: false, message: '', onOk: () => {} });
  const [heldSnapshot, setHeldSnapshot] = useState<Object3DData[] | null>(null);
  const [units, setUnits] = useState(() => loadUnits());
  const [snapCfg, setSnapCfg] = useState(() => loadSnap());
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [angleSnapEnabled, setAngleSnapEnabled] = useState(false);
  const [selectByNameOpen, setSelectByNameOpen] = useState(false);
  const [mirrorOpen, setMirrorOpen] = useState(false);
  const [arrayOpen, setArrayOpen] = useState(false);
  const [alignOpen, setAlignOpen] = useState(false);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [fileDialogType, setFileDialogType] = useState<'save' | 'open' | 'export' | 'import'>('save');
  const [loginOpen, setLoginOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [cloudSaveOpen, setCloudSaveOpen] = useState(false);
  const [cloudOpenOpen, setCloudOpenOpen] = useState(false);
  const [cloudExportOpen, setCloudExportOpen] = useState(false);
  const [cloudImportOpen, setCloudImportOpen] = useState(false);
  const [cloudImportPayload, setCloudImportPayload] = useState<any>(null);
  const [cloudImportName, setCloudImportName] = useState<string>('');
  const [currentCloudScene, setCurrentCloudScene] = useState<{ id: string; name: string; folderId: string | null } | null>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !localStorage.getItem('3de.welcome.seen');
  });
  const [welcomeInitialTab, setWelcomeInitialTab] = useState<'welcome' | 'request'>('welcome');
  const [pendingFileOp, setPendingFileOp] = useState<null | (() => void)>(null);
  const { user, isAdmin, signOut } = useAuth();
  const [undoStack, setUndoStack] = useState<Object3DData[][]>([]);
  const [redoStack, setRedoStack] = useState<Object3DData[][]>([]);
  // Unified undo ordering: parallel to the state stacks above and to
  // rigUndoRef/rigRedoRef below. Each entry records whether that step is
  // an object-graph snapshot or a rig-pose patch, so undo()/redo() can pop
  // in the exact temporal order actions happened.
  type RigPoseTRS = { pos: [number, number, number]; rot: [number, number, number]; scale: [number, number, number] };
  type RigPoseEntry = { objectId: string; nodeUuid: string; prev: RigPoseTRS; next: RigPoseTRS };
  const undoOrderRef = useRef<Array<'objects' | 'rig'>>([]);
  const redoOrderRef = useRef<Array<'objects' | 'rig'>>([]);
  const rigUndoRef = useRef<RigPoseEntry[]>([]);
  const rigRedoRef = useRef<RigPoseEntry[]>([]);
  const [animationTracks, setAnimationTracks] = useState<AnimationTrack[]>(initial?.animationTracks || []);
  // Per-imported-object baked clip data (3ds Max style per-bone channel tracks).
  // Keyed by objectId. Populated by "Bake clip → tracks" in the timeline.
  const [bakedClipSets, setBakedClipSets] = useState<Record<string, BakedClipSet>>({});
  const bakedClipSetsRef = useRef<Record<string, BakedClipSet>>({});
  useEffect(() => {
    bakedClipSetsRef.current = bakedClipSets;
    // Expose the current baked-set map on window so Object3D's per-frame
    // driver can prefer our editable tracks over the built-in
    // AnimationMixer for imported models.
    (window as any).__bakedClipSets = bakedClipSets;
  }, [bakedClipSets]);
  // Per-imported-object animation-clip segments (Gantt style):
  // each segment plays a specific clipIndex between startFrame..endFrame.
  // Consumed by Object3D at runtime to drive the mixer.
  const [clipSegmentsByObject, setClipSegmentsByObject] = useState<
    Record<string, Array<{ id: string; startFrame: number; endFrame: number; clipIndex: number; blendIn?: number }>>
  >({});
  useEffect(() => {
    (window as any).__clipSegments = clipSegmentsByObject;
  }, [clipSegmentsByObject]);

  // ---- Timeline / TrackView scoped history ----
  // The timeline keeps its own undo stack. When the pointer is over the
  // timeline / Track View, Ctrl+Z rolls back the last timeline edit (keys,
  // baked tracks, clip segments) instead of the scene graph — so undoing a
  // bad keyframe or gantt tweak never wipes an imported character. When the
  // timeline is not focused we fall through to the regular scene undo stack.
  type TimelineSnapshot = {
    animationTracks: AnimationTrack[];
    bakedClipSets: Record<string, BakedClipSet>;
    clipSegmentsByObject: Record<string, Array<{ id: string; startFrame: number; endFrame: number; clipIndex: number; blendIn?: number }>>;
  };
  const timelineUndoRef = useRef<TimelineSnapshot[]>([]);
  const timelineRedoRef = useRef<TimelineSnapshot[]>([]);
  const timelineHoveredRef = useRef(false);
  const isRestoringTimelineRef = useRef(false);
  const prevTimelineSnapshotRef = useRef<TimelineSnapshot | null>(null);
  useEffect(() => {
    const current: TimelineSnapshot = { animationTracks, bakedClipSets, clipSegmentsByObject };
    const prev = prevTimelineSnapshotRef.current;
    prevTimelineSnapshotRef.current = current;
    if (!prev) return; // first mount — no baseline to diff against
    if (isRestoringTimelineRef.current) {
      // This update came from undo/redo restoring a snapshot: don't push.
      isRestoringTimelineRef.current = false;
      return;
    }
    timelineUndoRef.current.push(prev);
    if (timelineUndoRef.current.length > 50) timelineUndoRef.current.shift();
    timelineRedoRef.current = [];
  }, [animationTracks, bakedClipSets, clipSegmentsByObject]);
  const [selectedKeyframe, setSelectedKeyframe] = useState<Keyframe | null>(null);
  const [armedTool, setArmedTool] = useState<string | null>(null);
  const [ghost, setGhost] = useState<GhostObject | null>(null);
  const [sidePanelTab, setSidePanelTab] = useState<string>('create');
  const totalFrames = 100;
  const playRef = useRef<number | null>(null);
  const subObjReplaceUndoKeysRef = useRef<Set<string>>(new Set());
  // Live ref used by the animation renderer to read up-to-date object poses
  // (positions/rotations after each frame's keyframe interpolation).
  const objectsRef = useRef<Object3DData[]>(objects);
  useEffect(() => { objectsRef.current = objects; }, [objects]);
  const animationTracksRef = useRef<AnimationTrack[]>(animationTracks);
  useEffect(() => { animationTracksRef.current = animationTracks; }, [animationTracks]);

  // Broadcast Modify-panel state so viewport gates sub-object editing on it.
  // Edit Mesh / Edit Poly sub-selection & gizmos only activate when the user
  // is actually on the Modify tab (like 3ds Max's Modify panel).
  useEffect(() => {
    const active = sidePanelTab === 'modify';
    (window as any).__r3_modifyPanelActive = active;
    window.dispatchEvent(new CustomEvent('r3-modify-panel', { detail: { active } }));
  }, [sidePanelTab]);



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
      let startTime = performance.now();
      let startFrame = currentFrame >= totalFrames ? 0 : currentFrame;
      if (currentFrame >= totalFrames) setCurrentFrame(0);
      const duration = 4000; // 4 seconds for full timeline

      const animate = (time: number) => {
        const elapsed = time - startTime;
        const t = elapsed / duration;
        const frame = Math.round(startFrame + t * (totalFrames - startFrame));

        if (frame >= totalFrames) {
          if (loopPlayback) {
            setCurrentFrame(0);
            startTime = performance.now();
            startFrame = 0;
            playRef.current = requestAnimationFrame(animate);
            return;
          }
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
  }, [isPlaying, loopPlayback, totalFrames]);

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

  const sampleAnimationTrackAtFrame = useCallback((track: AnimationTrack, frame: number) => {
    if (track.keyframes.length === 0) return null;
    const kfs = [...track.keyframes].sort((a, b) => a.frame - b.frame);
    const first = kfs[0];
    const last = kfs[kfs.length - 1];
    if (frame <= first.frame) {
      return {
        position: [...first.position] as [number, number, number],
        rotation: [...first.rotation] as [number, number, number],
        scale: [...first.scale] as [number, number, number],
      };
    }
    if (frame >= last.frame) {
      return {
        position: [...last.position] as [number, number, number],
        rotation: [...last.rotation] as [number, number, number],
        scale: [...last.scale] as [number, number, number],
      };
    }

    let prev = first;
    let next = last;
    for (let i = 0; i < kfs.length - 1; i++) {
      if (frame >= kfs[i].frame && frame <= kfs[i + 1].frame) {
        prev = kfs[i];
        next = kfs[i + 1];
        break;
      }
    }
    const span = Math.max(1, next.frame - prev.frame);
    return bezierInterpolate(prev, next, (frame - prev.frame) / span);
  }, []);

  const setAnimationRenderFrame = useCallback((frame: number) => {
    const sampled = new Map<string, ReturnType<typeof sampleAnimationTrackAtFrame>>();
    animationTracksRef.current.forEach((track) => {
      sampled.set(track.objectId, sampleAnimationTrackAtFrame(track, frame));
    });

    setCurrentFrame(frame);
    setObjects((prev) => {
      let changed = false;
      const next = prev.map((obj) => {
        const pose = sampled.get(obj.id);
        if (!pose) return obj;
        changed = true;
        return {
          ...obj,
          position: pose.position,
          rotation: pose.rotation,
          scale: pose.scale,
        };
      });
      return changed ? next : prev;
    });
  }, [sampleAnimationTrackAtFrame]);

  // Save state for undo/redo
  const saveState = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-9), [...objects]]);
    undoOrderRef.current.push('objects');
    setRedoStack([]);
    redoOrderRef.current = [];
    rigRedoRef.current = [];
  }, [objects]);

  const createObject = useCallback((type: string) => {
    const standard = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'plane', 'teapot', 'tube', 'pyramid', 'geoSphere'];
    const extended = ['hedra', 'chamferBox', 'chamferCyl', 'oilTank', 'spindle', 'gengon', 'torusKnot', 'ringWave', 'prism', 'capsule', 'lExt', 'cExt', 'hose'];
    const shapes = ['line', 'rectangle', 'circle', 'ellipse', 'arc', 'donut', 'ngon', 'star', 'helix'];
    const aec = ['wall', 'door', 'window', 'foliage'];
    const lightTypes = ['light_omni', 'light_spot', 'light_spot_free', 'light_direct', 'light_direct_free', 'light_skylight', 'light_ambient'];
    const camTypes   = ['camera_target', 'camera_free'];

    const helperTools = ['helper_point', 'helper_dummy', 'helper_tape', 'helper_grid', 'helper_compass'];
    if (type === 'sys_print_bed') {
      saveState();
      const id = `print_bed_${Date.now()}`;
      const newObject: Object3DData = {
        id,
        name: `PrintBed${objects.filter((o) => o.type === 'print_bed').length + 1}`,
        type: 'print_bed' as any,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: '#5f7fa0',
        visible: true,
        locked: false,
        modifiers: [],
        geometry: { printerId: DEFAULT_PRINTER_ID },
        ref: { current: null } as any,
      };
      setObjects((prev) => [...prev, newObject]);
      setSelectedObject(id);
      setSidePanelTab('utilities');
      toast.success('Print Bed created');
      return;
    }
    if (![...standard, ...extended, ...shapes, ...aec, ...lightTypes, ...camTypes, ...helperTools].includes(type)) return;

    // Helpers: create directly at origin, no drag flow needed for click-only use.
    if (helperTools.includes(type)) {
      saveState();
      const kind = type.replace('helper_', '') as any;
      const geom = { ...HELPER_DEFAULTS[kind] };
      const id = `helper_${Date.now()}`;
      const newObject: Object3DData = {
        id,
        name: `${kind}${objects.filter((o) => o.type === 'helper' && (o.geometry as any)?.helperKind === kind).length + 1}`,
        type: 'helper' as any,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: '#00e5ff',
        visible: true,
        locked: false,
        modifiers: [],
        geometry: geom,
        ref: { current: null } as any,
      };
      setObjects((prev) => [...prev, newObject]);
      setSelectedObject(id);
      toast.success(`${kind} helper created`);
      return;
    }


    saveState();

    // ------------- Lights & Cameras -------------------------------------------------
    if (lightTypes.includes(type) || camTypes.includes(type)) {
      const isTargeted = type === 'light_spot' || type === 'light_direct' || type === 'camera_target';
      const baseKind = type === 'light_spot_free' ? 'light_spot'
                     : type === 'light_direct_free' ? 'light_direct'
                     : type;
      const baseId = `${baseKind}_${Date.now()}`;
      const namePrefix = baseKind.replace('light_', '').replace('camera_', 'Cam_');
      const count = objects.filter((o) => o.type === baseKind).length + 1;
      const newObjs: Object3DData[] = [];

      let position: [number, number, number] = [0, 3, 0];
      let rotation: [number, number, number] = [0, 0, 0];
      let color = '#ffffff';
      const lightData: any = { intensity: 1, distance: 0, decay: 2, castShadow: false };
      const viewPose = baseKind.startsWith('camera_') ? readPerspectiveViewPose(activeViewport) : null;
      const cameraData: any = {
        fov: viewPose?.fov ?? 45,
        near: viewPose?.near ?? 0.1,
        far: viewPose?.far ?? 1000,
      };

      // Default distance the target sits below the light (matches 3ds Max R3
      // convention: newly-created directional lights always aim straight down).
      const defaultDist = 8;

      if (baseKind === 'light_omni')     { position = [3, 5, 3]; color = '#fff2cc'; lightData.intensity = 1; }
      if (baseKind === 'light_spot')     { position = [0, 8, 0]; color = '#ffffff'; lightData.angle = Math.PI / 6; lightData.penumbra = 0.2; lightData.distance = 20; }
      if (baseKind === 'light_direct')   { position = [0, 8, 0]; color = '#ffffff'; lightData.distance = 30; }
      if (baseKind === 'light_skylight') { position = [0, 8, 0]; color = '#a0c8ff'; lightData.skyColor = '#a0c8ff'; lightData.groundColor = '#4a3a2a'; lightData.intensity = 0.6; }
      if (baseKind === 'light_ambient')  { position = [0, 5, 0]; color = '#404040'; lightData.intensity = 0.4; }
      if (baseKind === 'camera_target' || baseKind === 'camera_free') {
        position = viewPose?.position ?? [3, 3, 3];
        rotation = viewPose?.rotation ?? [0, 0, 0];
        color = '#4488ff';
      }

      // Free (non-targeted) spot/direct lights: nascem apontando para baixo (-Y).
      // Local -Z is the light forward, so rotate -90° around X to send -Z → -Y.
      if (!isTargeted && (baseKind === 'light_spot' || baseKind === 'light_direct')) {
        rotation = [-Math.PI / 2, 0, 0];
      }

      // Create target dummy for targeted variants, placed directly BELOW the
      // light so the initial aim is straight down (3ds Max R3 behavior).
      let targetId: string | undefined;
      if (isTargeted) {
        const targetPos: [number, number, number] =
          baseKind.startsWith('light_')
            ? [position[0], Math.max(0, position[1] - defaultDist), position[2]]
            : (viewPose?.target ?? [0, 0, 0]);
        targetId = `target_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        newObjs.push({
          id: targetId,
          name: `${namePrefix}${count}.Target`,
          type: 'target_helper' as any,
          position: targetPos,
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          color: '#cccccc',
          visible: true,
          locked: false,
          modifiers: [],
          ref: { current: null } as any,
        });
        if (baseKind.startsWith('light_')) lightData.targetObjectId = targetId;
        else cameraData.targetObjectId = targetId;
      }

      const entity: Object3DData = {
        id: baseId,
        name: `${namePrefix}${count.toString().padStart(2, '0')}`,
        type: baseKind as any,
        position, rotation, scale: [1, 1, 1],
        color,
        visible: true, locked: false, modifiers: [],
        ref: { current: null } as any,
        ...(baseKind.startsWith('light_') ? { lightData } : {}),
        ...(baseKind.startsWith('camera_') ? { cameraData } : {}),
      } as any;
      newObjs.push(entity);

      setObjects((prev) => [...prev, ...newObjs]);
      setSelectedObject(baseId);
      toast.success(`${namePrefix}${count} created`);
      return;
    }

    // ------------- Geometric primitives / shapes -----------------------------------
    let defaultGeometry: any = undefined;
    if (extended.includes(type)) {
      defaultGeometry = {};
    } else if (shapes.includes(type)) {
      defaultGeometry = {};
    } else if (aec.includes(type)) {
      if (type === 'wall') {
        // Sane default: a 4m straight wall along +X.
        defaultGeometry = {
          path: [[-2, 0, 0], [2, 0, 0]],
          width: 0.2,
          height: 2.7,
          justification: 'center',
          closed: false,
        };
      } else if (type === 'door') {
        defaultGeometry = { subtype: 'pivot', width: 0.9, height: 2.1, thickness: 0.04, frameDepth: 0.2, frameSize: 0.05, openPercentage: 0 };
      } else if (type === 'window') {
        defaultGeometry = { subtype: 'casement', width: 1.2, height: 1.2, frameThickness: 0.05, glassThickness: 0.01, frameDepth: 0.2, sillHeight: 1.0, openPercentage: 0 };
      } else {
        defaultGeometry = {};
      }
    }

    const newObject: Object3DData = {
      id: `${type}_${Date.now()}`,
      name: `${type}_${Math.random().toString(36).slice(2, 8)}`,
      type: type as any,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: shapes.includes(type) ? '#f2c744' : randomMaxColor(),
      visible: true,
      locked: false,
      modifiers: [],
      geometry: defaultGeometry,
      ref: { current: null } as any,
    };

    setObjects(prev => [...prev, newObject]);
    setSelectedObject(newObject.id);
    toast.success(`${type} created`);
  }, [saveState, objects, activeViewport]);


  // Commit a ghost object from the interactive click-drag creation flow.
  // Pivot policy (matches 3ds Max R3):
  //   - Box / Cylinder / Cone / Pyramid / Tube  → pivot at CENTER OF BASE
  //   - Sphere / Torus / Hedra / GeoSphere      → pivot at GEOMETRIC CENTER
  //   - Plane / Shapes 2D                        → pivot at CENTER
  // Our geometry primitives are already center-origin, so the ghost sits with
  // its center at ghost.position. For base-pivot types we shift position up so
  // that y = base + height/2, and record that offset so the Modify panel still
  // reads intuitive Width/Depth/Height numbers.
  const commitGhostObject = useCallback((g: GhostObject) => {
    saveState();
    const id = `${g.type}_${Date.now()}`;

    // Print3D bed — placed via CreationController click. Attach the default
    // printer profile and open the Print Tools panel.
    if ((g.type as any) === 'print_bed') {
      const newBed: Object3DData = {
        id,
        name: `PrintBed${objects.filter((o) => o.type === ('print_bed' as any)).length + 1}`,
        type: 'print_bed' as any,
        position: g.position,
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: '#5f7fa0',
        visible: true,
        locked: false,
        modifiers: [],
        geometry: { printerId: DEFAULT_PRINTER_ID },
        ref: { current: null } as any,
      };
      setObjects((prev) => [...prev, newBed]);
      setSelectedObject(id);
      setSidePanelTab('utilities');
      toast.success('Print Bed created');
      return;
    }

    // Particle emitters — Spray / Snow / Super Spray / PArray / PCloud / Blizzard.
    // We normalise the tool key ("part_spray") → object type "particle_emitter",
    // stamping the emitter kind + defaults into `geometry`.
    if (typeof g.type === 'string' && g.type.startsWith('part_')) {
      const kind = (g.geometry?.emitterKind ?? g.type.replace('part_', '')) as keyof typeof DEFAULT_PARTICLE_GEOM;
      const defaults = DEFAULT_PARTICLE_GEOM[kind];
      const geometry = {
        ...defaults,
        width: Math.max(0.2, g.geometry?.width ?? defaults.width),
        length: Math.max(0.2, g.geometry?.length ?? defaults.length),
      };
      const newEmitter: Object3DData = {
        id,
        name: `${kind}_${objects.filter((o) => o.type === 'particle_emitter').length + 1}`,
        type: 'particle_emitter' as any,
        position: g.position,
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: defaults.color,
        visible: true,
        locked: false,
        modifiers: [],
        geometry,
        ref: { current: null } as any,
      };
      setObjects((prev) => [...prev, newEmitter]);
      setSelectedObject(id);
      setSidePanelTab('modify');
      toast.success(`${kind} emitter created`);
      return;
    }



    // ---- Magnetic wall snap for doors & windows ----
    // If a wall is within reach, align the object to its segment (position on
    // the centerline + rotation matching segment direction) and register a
    // non-destructive opening on the wall.
    let finalPosition = g.position;
    let finalRotation = g.rotation;
    let finalGeometry: any = g.geometry;
    let wallOpeningEdit: { wallId: string; opening: WallOpening } | null = null;

    if (g.type === 'door' || g.type === 'window') {
      const walls = objects.filter((o) => o.type === 'wall');
      const worldPos = new THREE.Vector3(g.position[0], g.position[1], g.position[2]);
      // Reach: half a door-width plus a generous margin so the user doesn't
      // have to be pixel-perfect. Skip snap if the wall list is empty.
      const snap = walls.length > 0
        ? snapDoorWindowToWall(worldPos, walls as any, Math.max(0.6, (g.geometry?.width ?? 1) * 0.9))
        : null;

      if (snap) {
        finalPosition = [snap.position.x, snap.position.y, snap.position.z];
        finalRotation = [g.rotation[0], snap.rotationY, g.rotation[2]];

        const w = Math.max(0.1, g.geometry?.width ?? 0.9);
        const h = Math.max(0.1, g.geometry?.height ?? 2.1);
        const yBottom = g.type === 'window' ? Math.max(0, g.geometry?.sillHeight ?? 1.0) : 0;

        // Clamp opening to fit inside the segment.
        const halfW = w / 2;
        const centerT = THREE.MathUtils.clamp(snap.t, halfW, snap.segmentLength - halfW);
        const opening: WallOpening = {
          id,
          segmentIndex: snap.segmentIndex,
          tStart: centerT - halfW,
          tEnd: centerT + halfW,
          yBottom,
          yTop: yBottom + h,
        };
        wallOpeningEdit = { wallId: snap.wallId, opening };

        finalGeometry = {
          ...g.geometry,
          parentWallId: snap.wallId,
          wallSegmentIndex: snap.segmentIndex,
          wallT: centerT,
          // Match wall thickness so frame sits flush.
          frameDepth: snap.wallWidth,
        };
      }
    }

    // Helpers: normalize `helper_point` / `helper_dummy` / … → type='helper',
    // and stash the subtype under geometry.helperKind (already set by the
    // controller). Helpers never snap to walls and never carry a material.
    const isHelperGhost = typeof g.type === 'string' && (g.type as string).startsWith('helper_');
    const normalizedType: any = isHelperGhost ? 'helper' : (g.type as any);

    const newObject: Object3DData = {
      id,
      name: `${normalizedType}${objects.filter((o) => o.type === normalizedType).length + 1 < 10 ? '0' : ''}${objects.filter((o) => o.type === normalizedType).length + 1}`,
      type: normalizedType,
      position: finalPosition,
      rotation: finalRotation,
      scale: g.scale,
      color: isHelperGhost
        ? '#00e5ff'
        : g.type === 'line' || g.type === 'rectangle' || g.type === 'circle' || g.type === 'ellipse' ||
             g.type === 'arc' || g.type === 'donut' || g.type === 'ngon' || g.type === 'star' || g.type === 'helix'
        ? '#f2c744'
        : g.type === 'wall'
          ? '#c9bfae'
          : g.type === 'door'
            ? '#8b5a2b'
            : g.type === 'window'
              ? '#a8c8e0'
              : randomMaxColor(),

      visible: true,
      locked: false,
      modifiers: [],
      geometry: finalGeometry,
      ref: { current: null } as any,
    };

    setObjects((prev) => {
      let next = [...prev, newObject];
      // Register the opening on the target wall (rebuilds mesh with the hole).
      if (wallOpeningEdit) {
        next = next.map((o) => {
          if (o.id !== wallOpeningEdit!.wallId) return o;
          const wg: WallGeom = { ...(o.geometry || {}) };
          const openings = [...(wg.openings || []), wallOpeningEdit!.opening];
          return { ...o, geometry: { ...wg, openings } };
        });
      }
      return next;
    });
    setSelectedObject(id);
    setSidePanelTab('modify');
    toast.success(wallOpeningEdit ? `${g.type} snapped to wall` : `${g.type} created`);
  }, [objects, saveState]);

  // Bone joint FK — Scene3D dispatches this while TransformControls is rotating
  // a sub-selected joint <group>. We just mirror the group's local rotation
  // into the chain's data model so the object stays consistent across re-renders
  // and animation sampling. Children keep following naturally (nested groups).
  useEffect(() => {
    const onJointRot = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { objectId: string; jointIndex: number; rot: [number, number, number] };
      if (!d) return;
      setObjects((prev) => prev.map((o) => {
        if (o.id !== d.objectId) return o;
        const g = { ...(o.geometry || {}) };
        const joints = Array.isArray(g.joints) ? g.joints.map((j: any, i: number) =>
          i === d.jointIndex ? { ...j, rot: d.rot } : j
        ) : g.joints;
        return { ...o, geometry: { ...g, joints } };
      }));
    };
    window.addEventListener('r3-bone-joint-rot', onJointRot as any);
    return () => window.removeEventListener('r3-bone-joint-rot', onJointRot as any);
  }, []);

  // When a joint sphere is clicked, we also need the parent chain object to be
  // the current scene selection — otherwise Scene3D keeps the gizmo attached
  // to the previous target and moving one joint looks like moving the whole
  // chain (because it never actually attached to the joint's inner group).
  useEffect(() => {
    const onJointPick = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { objectId: string; jointIndex: number };
      if (!d?.objectId) return;
      setSelectedObject(d.objectId);
    };
    window.addEventListener('r3-bone-joint-pick', onJointPick as any);
    return () => window.removeEventListener('r3-bone-joint-pick', onJointPick as any);
  }, []);



  // Biped spawn — the creation controller dispatches this event when the user
  // drag-releases with Systems→Biped armed. We build a whole set of bone_chain
  // objects (spine, arms, legs) in a single undoable batch, matching how 3ds
  // Max Character Studio generates the Bip01 skeleton at once.
  useEffect(() => {
    const onSpawnBiped = (e: Event) => {
      const parts = (e as CustomEvent).detail?.parts as Array<{ name: string; position: [number, number, number]; geometry: any }> | undefined;
      if (!parts?.length) return;
      saveState();
      const stamp = Date.now();
      const newObjects: Object3DData[] = parts.map((part, i) => ({
        id: `bone_chain_${stamp}_${i}`,
        name: part.name,
        type: 'bone_chain' as any,
        position: part.position,
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: '#f2c744',
        visible: true,
        locked: false,
        modifiers: [],
        geometry: part.geometry,
        ref: { current: null } as any,
      }));
      setObjects((prev) => [...prev, ...newObjects]);
      setSelectedObject(newObjects[0].id);
      setSidePanelTab('modify');
      toast.success(`Biped criado com ${newObjects.length} cadeias de osso`);
    };
    window.addEventListener('r3-spawn-biped', onSpawnBiped as any);
    return () => window.removeEventListener('r3-spawn-biped', onSpawnBiped as any);
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
  // Resolve modifier-target ids. If the target belongs to a *closed* group (or
  // is the group head itself), the modifier operation is broadcast to every
  // member so the group deforms as a single object — mirroring 3ds Max's
  // behaviour where a modifier on a group affects all members simultaneously.
  const resolveModifierTargets = useCallback((objectId: string): Set<string> => {
    const list = objectsRef.current;
    const obj = list.find((o) => o.id === objectId);
    if (!obj) return new Set([objectId]);
    let groupId: string | undefined;
    if (obj.isGroup) groupId = obj.id;
    else if (obj.groupId) {
      const head = list.find((o) => o.id === obj.groupId);
      if (head && !head.groupOpen) groupId = head.id;
    }
    if (!groupId) return new Set([objectId]);
    const ids = new Set<string>();
    for (const o of list) if (o.groupId === groupId && !o.isGroup) ids.add(o.id);
    if (ids.size === 0) ids.add(objectId);
    return ids;
  }, []);

  const addModifier = useCallback((objectId: string, modifierType: string) => {
    const defaultParams: Record<string, any> = {
      Extrude: { amount: 1, segments: 1, capStart: true, capEnd: true, bevelEnabled: false },
      Shell: {
        inner: 0.1, outer: 0, segments: 1,
        straightenCorners: true, autoSmooth: true,
        overrideInnerMatId: false, innerMatId: 1,
        overrideOuterMatId: false, outerMatId: 0,
        overrideEdgeMatId: false,  edgeMatId: 2,
      },
    };
    // Shared id across group members so subsequent updates find them together.
    const sharedId = `${modifierType}_${Date.now()}`;
    const targets = resolveModifierTargets(objectId);

    setObjects(prev => prev.map(obj =>
      targets.has(obj.id)
        ? { ...obj, modifiers: [...(obj.modifiers || []), {
            id: sharedId,
            type: modifierType,
            params: JSON.parse(JSON.stringify(defaultParams[modifierType] || {})),
            active: true,
          } as Modifier] }
        : obj
    ));

    toast.success(`${modifierType} modifier added${targets.size > 1 ? ` to ${targets.size} objects` : ''}`);
  }, [resolveModifierTargets]);

  const updateModifier = useCallback((objectId: string, modifierId: string, params: any) => {
    saveState();
    const targets = resolveModifierTargets(objectId);
    setObjects(prev => prev.map(obj =>
      targets.has(obj.id)
        ? {
            ...obj,
            modifiers: obj.modifiers?.map(mod =>
              mod.id === modifierId ? { ...mod, params } : mod
            ) || []
          }
        : obj
    ));
  }, [saveState, resolveModifierTargets]);

  // Sub-object picking & op dispatch from viewport / modifier panel.
  useEffect(() => {
    const onPick = (ev: Event) => {
      const d = (ev as CustomEvent).detail as {
        objectId: string; modifierId: string; level: string;
        id: number; additive?: boolean; remove?: boolean;
      };
      if (objectsRef.current.some((obj) => obj.id === d.objectId && (obj.modifiers ?? []).some((m: any) => m.id === d.modifierId))) {
        setUndoStack((stack) => [...stack.slice(-9), objectsRef.current]);
        undoOrderRef.current.push('objects');
        setRedoStack([]);
        redoOrderRef.current = [];
        rigRedoRef.current = [];
      }
      setObjects((prev) => prev.map((obj) => {
        if (obj.id !== d.objectId) return obj;
        return {
          ...obj,
          modifiers: (obj.modifiers ?? []).map((m: any) => {
            if (m.id !== d.modifierId) return m;
            const cur: number[] = Array.isArray(m.params?.selectedIds) ? m.params.selectedIds : [];
            let next: number[];
            if (d.remove) next = cur.filter((x) => x !== d.id);
            else if (d.additive) next = cur.includes(d.id) ? cur.filter((x) => x !== d.id) : [...cur, d.id];
            else next = [d.id];
            return { ...m, params: { ...m.params, selectedIds: next, selectionLevel: d.level } };
          }),
        };
      }));
    };
    const onOp = (ev: Event) => {
      const d = (ev as CustomEvent).detail as {
        objectId: string; modifierId: string; op: { kind: string; params?: any };
      };
      const replaceKey = d.op?.params?.__replaceKey;
      const hasExistingReplace = !!replaceKey && objectsRef.current.some((obj) =>
        obj.id === d.objectId && (obj.modifiers ?? []).some((m: any) =>
          m.id === d.modifierId && Array.isArray(m.params?.ops) && m.params.ops.some((op: any) => op?.params?.__replaceKey === replaceKey)
        )
      );
      const replaceAlreadySaved = !!replaceKey && subObjReplaceUndoKeysRef.current.has(replaceKey);
      if (!hasExistingReplace && !replaceAlreadySaved && objectsRef.current.some((obj) => obj.id === d.objectId && (obj.modifiers ?? []).some((m: any) => m.id === d.modifierId))) {
        setUndoStack((stack) => [...stack.slice(-9), objectsRef.current]);
        undoOrderRef.current.push('objects');
        setRedoStack([]);
        redoOrderRef.current = [];
        rigRedoRef.current = [];
        if (replaceKey) {
          subObjReplaceUndoKeysRef.current.add(replaceKey);
          if (subObjReplaceUndoKeysRef.current.size > 200) {
            subObjReplaceUndoKeysRef.current = new Set(Array.from(subObjReplaceUndoKeysRef.current).slice(-100));
          }
        }
      }
      setObjects((prev) => prev.map((obj) => {
        if (obj.id !== d.objectId) return obj;
        return {
          ...obj,
          modifiers: (obj.modifiers ?? []).map((m: any) => {
            if (m.id !== d.modifierId) return m;
            const level = (m.params?.selectionLevel ?? 'vertex').toLowerCase();
            const ids: number[] = Array.isArray(m.params?.selectedIds) ? m.params.selectedIds : [];
            const ops = Array.isArray(m.params?.ops) ? m.params.ops : [];
            const opRec = { ...d.op, selection: { level, ids: ids.slice() } };
            const nextOps = replaceKey && ops.some((op: any) => op?.params?.__replaceKey === replaceKey)
              ? ops.map((op: any) => op?.params?.__replaceKey === replaceKey ? opRec : op)
              : [...ops, opRec];
            return { ...m, params: { ...m.params, ops: nextOps } };
          }),
        };
      }));
    };
    const onGizmoOp = (ev: Event) => {
      const d = (ev as CustomEvent).detail as {
        objectId: string; modifierId: string; part: 'gizmo' | 'center';
        pos: [number, number, number]; rot: [number, number, number]; scale: [number, number, number];
        commit: boolean;
      };
      // Snapshot for undo only when the drag commits (mouseup), so live drag
      // updates collapse into a single history entry.
      if (d.commit && objectsRef.current.some((obj) => obj.id === d.objectId)) {
        setUndoStack((stack) => [...stack.slice(-9), objectsRef.current]);
        undoOrderRef.current.push('objects');
        setRedoStack([]);
        redoOrderRef.current = [];
        rigRedoRef.current = [];
      }
      setObjects((prev) => prev.map((obj) => {
        if (obj.id !== d.objectId) return obj;
        return {
          ...obj,
          modifiers: (obj.modifiers ?? []).map((m: any) => {
            if (m.id !== d.modifierId) return m;
            const params = { ...(m.params || {}) };
            if (d.part === 'gizmo') {
              params.gizmo = { pos: d.pos, rot: d.rot, scale: d.scale };
            } else {
              // Center is translation-only in 3ds Max.
              params.center = { pos: d.pos };
            }
            return { ...m, params };
          }),
        };
      }));
    };
    window.addEventListener('r3-subobj-select', onPick as any);
    window.addEventListener('r3-subobj-op', onOp as any);
    window.addEventListener('r3-modifier-gizmo-op', onGizmoOp as any);
    return () => {
      window.removeEventListener('r3-subobj-select', onPick as any);
      window.removeEventListener('r3-subobj-op', onOp as any);
      window.removeEventListener('r3-modifier-gizmo-op', onGizmoOp as any);
    };
  }, []);


  const removeModifier = useCallback((objectId: string, modifierId: string) => {
    saveState();
    const targets = resolveModifierTargets(objectId);
    setObjects(prev => prev.map(obj =>
      targets.has(obj.id)
        ? {
            ...obj,
            modifiers: obj.modifiers?.filter(mod => mod.id !== modifierId) || []
          }
        : obj
    ));

    toast.success('Modifier removed');
  }, [saveState, resolveModifierTargets]);

  const toggleModifier = useCallback((objectId: string, modifierId: string) => {
    saveState();
    const targets = resolveModifierTargets(objectId);
    setObjects(prev => prev.map(obj =>
      targets.has(obj.id)
        ? {
            ...obj,
            modifiers: obj.modifiers?.map(m =>
              m.id === modifierId ? { ...m, active: !m.active } : m
            ) || [],
          }
        : obj
    ));
  }, [saveState, resolveModifierTargets]);

  const reorderModifier = useCallback((objectId: string, modifierId: string, direction: -1 | 1) => {
    saveState();
    const targets = resolveModifierTargets(objectId);
    setObjects(prev => prev.map(obj => {
      if (!targets.has(obj.id) || !obj.modifiers) return obj;
      const mods = [...obj.modifiers];
      const idx = mods.findIndex(m => m.id === modifierId);
      if (idx < 0) return obj;
      const swap = idx + direction;
      if (swap < 0 || swap >= mods.length) return obj;
      [mods[idx], mods[swap]] = [mods[swap], mods[idx]];
      return { ...obj, modifiers: mods };
    }));
  }, [saveState, resolveModifierTargets]);




  const updateObjectGeometry = useCallback((objectId: string, params: any) => {
    setObjects(prev => prev.map(obj => {
      if (obj.id !== objectId) return obj;
      // Special action: convert a parametric shape to Editable Spline.
      if (params && params.__convertToEditableSpline) {
        try {
          const es = paramsToEditableSpline(obj.type, obj.geometry || {});
          return { ...obj, type: 'editable_spline', geometry: { editableSpline: es.serialize() } };
        } catch (err) {
          console.warn('[editable-spline] convert failed', err);
          return obj;
        }
      }
      return { ...obj, geometry: { ...(obj.geometry || {}), ...params } };
    }));
  }, []);

  // Editable Spline live commit (knot drag / handle edit from viewport overlay).
  useEffect(() => {
    const on = (ev: Event) => {
      const d = (ev as CustomEvent).detail;
      if (!d?.objectId) return;
      updateObjectGeometry(d.objectId, { editableSpline: d.editableSpline });
    };
    window.addEventListener('r3-editable-spline-commit', on as any);
    return () => window.removeEventListener('r3-editable-spline-commit', on as any);
  }, []);

  const updateObjectLightData = useCallback((objectId: string, params: any) => {
    setObjects(prev => prev.map(obj =>
      obj.id === objectId
        ? { ...obj, lightData: { ...(obj.lightData || {}), ...params } }
        : obj
    ));
  }, []);

  const updateObjectCameraData = useCallback((objectId: string, params: any) => {
    setObjects(prev => prev.map(obj =>
      obj.id === objectId
        ? { ...obj, cameraData: { ...(obj.cameraData || {}), ...params } }
        : obj
    ));
  }, []);




  const updateObjectColor = useCallback((objectId: string, color: string) => {
    setObjects(prev => prev.map(obj => obj.id === objectId ? { ...obj, color } : obj));
  }, []);


  // ---- Compound Objects (Boolean / ProBoolean) --------------------------------
  const [compoundState, setCompoundState] = useState<{
    tool: 'boolean' | 'proboolean' | 'loft' | 'scatter' | null;
    op: 'union' | 'subtract' | 'intersect';
    picking: boolean;
  }>({ tool: null, op: 'subtract', picking: false });

  const armCompound = useCallback((tool: 'boolean' | 'proboolean' | 'loft' | 'scatter' | null) => {
    if (tool === 'loft' || tool === 'scatter') {
      toast.info(`${tool === 'loft' ? 'Loft' : 'Scatter'} — em breve`);
      return;
    }
    setCompoundState((s) => ({ ...s, tool, picking: false }));
  }, []);

  const setCompoundOp = useCallback((op: 'union' | 'subtract' | 'intersect') => {
    setCompoundState((s) => ({ ...s, op }));
  }, []);

  const startPickOperandB = useCallback(() => {
    setCompoundState((s) => (s.tool ? { ...s, picking: true } : s));
  }, []);

  const cancelCompound = useCallback(() => {
    setCompoundState({ tool: null, op: 'subtract', picking: false });
  }, []);

  const performBoolean = useCallback((operandBId: string) => {
    const aId = selectedObject;
    if (!aId || aId === operandBId) {
      toast.error('Operando A e Operando B devem ser objetos distintos');
      return;
    }
    const a = objects.find((o) => o.id === aId);
    const b = objects.find((o) => o.id === operandBId);
    const meshA = a?.ref?.current as THREE.Mesh | undefined;
    const meshB = b?.ref?.current as THREE.Mesh | undefined;
    if (!a || !b || !meshA || !meshB || !(meshA as any).geometry || !(meshB as any).geometry) {
      toast.error('Operandos inválidos — selecione dois objetos com geometria');
      return;
    }

    // Dynamic import keeps the CSG lib out of the initial bundle.
    import('./utils/compoundOps').then(({ computeBoolean }) => {
      try {
        saveState();
        const baked = computeBoolean(meshA, meshB, compoundState.op);
        const newObj: Object3DData = {
          id: `compound_${Date.now()}`,
          name: `Boolean_${(a.name || a.type).slice(0, 8)}`,
          type: 'compound' as any,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          color: a.color,
          visible: true,
          locked: false,
          modifiers: [],
          geometry: baked,
          ref: { current: null } as any,
        };
        setObjects((prev) => {
          const rest = prev.filter((o) => o.id !== aId && o.id !== operandBId);
          return [...rest, newObj];
        });
        setSelectedObject(newObj.id);
        toast.success(`Boolean ${compoundState.op} concluído`);
      } catch (err) {
        console.error('Boolean failed', err);
        toast.error('Operação Boolean falhou — verifique se as malhas são fechadas');
      } finally {
        // ProBoolean stays armed to accept more operands B; classic Boolean disarms.
        setCompoundState((s) => s.tool === 'proboolean'
          ? { tool: 'proboolean', op: s.op, picking: true }
          : { tool: null, op: s.op, picking: false }
        );
      }
    });
  }, [selectedObject, objects, compoundState.op, saveState]);

  const handleSelectObject = useCallback((id: string | null, additive = false, remove = false) => {
    // Select and Link — consume the click as "pick parent"
    if ((window as any).__r3LinkTool === 'link' && id) {
      (window as any).__r3DoLink?.(id);
      return;
    }

    // If a compound Boolean is waiting for Operand B, consume the click.
    if (id && compoundState.picking && compoundState.tool && selectedObject && id !== selectedObject) {
      performBoolean(id);
      return;
    }

    if (!id) {
      if (additive || remove) return;
      setSelectedObject(null);
      setSelectedObjectIds([]);
      return;
    }
    // 3ds Max groups: clicking a member of a CLOSED group promotes the pick to
    // every member (so the group acts as a single object). Clicking the group
    // head does the same. When the group is OPEN, the click stays local.
    const clicked = objectsRef.current.find((o) => o.id === id);
    const expandIds: string[] = (() => {
      if (!clicked) return [id];
      if (clicked.isGroup) {
        return objectsRef.current.filter((o) => o.groupId === clicked.id).map((o) => o.id);
      }
      if (clicked.groupId) {
        const head = objectsRef.current.find((o) => o.id === clicked.groupId);
        if (head && !head.groupOpen) {
          return objectsRef.current.filter((o) => o.groupId === head.id).map((o) => o.id);
        }
      }
      return [id];
    })();
    if (remove) {
      const drop = new Set(expandIds);
      const next = selectedObjectIds.filter((sid) => !drop.has(sid));
      setSelectedObjectIds(next);
      setSelectedObject(next[next.length - 1] ?? null);
      return;
    }
    if (additive) {
      const next = Array.from(new Set([...selectedObjectIds, ...expandIds]));
      setSelectedObjectIds(next);
      setSelectedObject(expandIds[expandIds.length - 1]);
      return;
    }
    setSelectedObjectIds(expandIds);
    setSelectedObject(expandIds[expandIds.length - 1]);
  }, [compoundState.picking, compoundState.tool, selectedObject, selectedObjectIds, performBoolean]);

  useEffect(() => {
    const onTransformStart = (e: Event) => {
      const id = (e as CustomEvent).detail?.objectId as string | undefined;
      if (!id || !objectsRef.current.some((obj) => obj.id === id)) return;
      setUndoStack((stack) => [...stack.slice(-9), objectsRef.current]);
      undoOrderRef.current.push('objects');
      setRedoStack([]);
      redoOrderRef.current = [];
      rigRedoRef.current = [];
    };
    const onTransformMany = (e: Event) => {
      const updates = (e as CustomEvent).detail?.updates as Array<{
        id: string; position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number];
      }> | undefined;
      if (!updates?.length) return;
      const byId = new Map(updates.map((u) => [u.id, u]));
      setObjects((prev) => {
        // Hierarchical cascade (Select and Link): moving/rotating/scaling a
        // parent applies the same world-space delta to every descendant, so
        // linked children follow their parent like in 3ds Max.
        const hasChildren = prev.some((o) => o.parentId && byId.has(o.parentId));
        if (!hasChildren) {
          return prev.map((o) => {
            const u = byId.get(o.id);
            return u ? { ...o, position: u.position, rotation: u.rotation, scale: u.scale } : o;
          });
        }
        const oldById = new Map(prev.map((o) => [o.id, o] as const));
        const cascade = new Map<string, { pos: [number, number, number]; rot: [number, number, number]; scl: [number, number, number] }>();
        const mOld = new THREE.Matrix4();
        const mNew = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const eu = new THREE.Euler();
        const p = new THREE.Vector3();
        const s = new THREE.Vector3();
        // For each source, compute world delta = M_new * M_old^-1 and apply
        // to every descendant that is NOT itself in the source list.
        for (const u of updates) {
          const old = oldById.get(u.id);
          if (!old) continue;
          mOld.compose(
            new THREE.Vector3(...old.position),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(...old.rotation)),
            new THREE.Vector3(...old.scale),
          );
          mNew.compose(
            new THREE.Vector3(...u.position),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(...u.rotation)),
            new THREE.Vector3(...u.scale),
          );
          const delta = mNew.clone().multiply(mOld.clone().invert());
          const desc = collectDescendantIds(u.id, prev);
          for (const dId of desc) {
            if (byId.has(dId) || cascade.has(dId)) continue;
            const d = oldById.get(dId);
            if (!d) continue;
            const md = new THREE.Matrix4().compose(
              new THREE.Vector3(...d.position),
              new THREE.Quaternion().setFromEuler(new THREE.Euler(...d.rotation)),
              new THREE.Vector3(...d.scale),
            );
            const mdNew = delta.clone().multiply(md);
            mdNew.decompose(p, q, s);
            eu.setFromQuaternion(q);
            cascade.set(dId, {
              pos: [p.x, p.y, p.z],
              rot: [eu.x, eu.y, eu.z],
              scl: [s.x, s.y, s.z],
            });
          }
        }
        return prev.map((o) => {
          const u = byId.get(o.id);
          if (u) return { ...o, position: u.position, rotation: u.rotation, scale: u.scale };
          const c = cascade.get(o.id);
          if (c) return { ...o, position: c.pos, rotation: c.rot, scale: c.scl };
          return o;
        });
      });
    };

    window.addEventListener('r3-transform-start', onTransformStart as EventListener);
    window.addEventListener('r3-transform-many', onTransformMany as EventListener);
    return () => {
      window.removeEventListener('r3-transform-start', onTransformStart as EventListener);
      window.removeEventListener('r3-transform-many', onTransformMany as EventListener);
    };
  }, []);


  // Selection Region marquee: aggregate hit ids come in via `r3-region-select`.
  // Until true multi-select lands, we pick the last matched id as the primary
  // scene selection (or clear when the region hit nothing and wasn't additive).
  useEffect(() => {
    const onRegion = (e: Event) => {
      const detail = (e as CustomEvent).detail as { ids: string[]; additive: boolean; remove: boolean } | undefined;
      if (!detail) return;
      const { ids, additive, remove } = detail;
      if (remove) {
        const next = selectedObjectIds.filter((id) => !ids.includes(id));
        setSelectedObjectIds(next);
        setSelectedObject(next[next.length - 1] ?? null);
        return;
      }
      if (ids.length === 0) {
        if (!additive) {
          setSelectedObject(null);
          setSelectedObjectIds([]);
        }
        return;
      }
      const next = additive ? Array.from(new Set([...selectedObjectIds, ...ids])) : ids;
      setSelectedObjectIds(next);
      setSelectedObject(next[next.length - 1]);
    };
    window.addEventListener('r3-region-select', onRegion as EventListener);
    return () => window.removeEventListener('r3-region-select', onRegion as EventListener);
  }, [selectedObjectIds]);


  const handleTransformObject = useCallback((id: string, transform: any) => {
    // Route through r3-transform-many so hierarchical cascade (Select and Link)
    // applies uniformly — the listener handles descendant propagation.
    const cur = objectsRef.current.find((o) => o.id === id);
    if (cur && (transform.position || transform.rotation || transform.scale)) {
      window.dispatchEvent(new CustomEvent('r3-transform-many', { detail: { updates: [{
        id,
        position: transform.position ?? cur.position,
        rotation: transform.rotation ?? cur.rotation,
        scale: transform.scale ?? cur.scale,
      }] } }));
      return;
    }
    setObjects(prev => prev.map(obj =>
      obj.id === id ? { ...obj, ...transform } : obj
    ));
  }, []);


  // Object operations
  const deleteObject = useCallback((id: string) => {
    saveState();
    const obj = objects.find(o => o.id === id);
    // Build cascade set: a target camera and its target_helper are the same logical object.
    const idsToDelete = new Set<string>([id]);
    if (obj) {
      const linkedTargetId: string | undefined =
        (obj as any).cameraData?.targetObjectId || (obj as any).lightData?.targetObjectId;
      if (linkedTargetId) idsToDelete.add(linkedTargetId);
      if (obj.type === 'target_helper') {
        // Find any camera/light referencing this target and delete it too.
        for (const o of objects) {
          const tid = (o as any).cameraData?.targetObjectId || (o as any).lightData?.targetObjectId;
          if (tid === id) idsToDelete.add(o.id);
        }
      }
    }
    setObjects(prev => prev.filter(o => !idsToDelete.has(o.id)));
    setAnimationTracks(prev => prev.filter(t => !idsToDelete.has(t.objectId)));
    // Purge per-object timeline state so a re-imported character starts clean
    // (previous keys/baked bone tracks/clip-gantt segments won't leak onto it).
    setBakedClipSets(prev => {
      const next = { ...prev };
      for (const did of idsToDelete) delete next[did];
      return next;
    });
    setClipSegmentsByObject(prev => {
      const next = { ...prev };
      for (const did of idsToDelete) delete next[did];
      return next;
    });
    setSelectedObjectIds((prev) => prev.filter((sid) => !idsToDelete.has(sid)));
    if (selectedObject && idsToDelete.has(selectedObject)) setSelectedObject(null);
    // NOTE: we intentionally do NOT purge the imported-model cache or the
    // persisted blob here. If we did, an Undo restoring this object would
    // bring back the entry but the model geometry/animations would already
    // be gone → empty character. Keep the cache alive so undo restores the
    // full model. A future "Purge unused models" action can reclaim space.
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
      obj.id === objectId ? { ...obj, material, color: material.color ?? obj.color } : obj
    ));
    toast.success('Material applied');
  }, []);

  // Drag & drop material from Material Editor onto a viewport object.
  // Also accepts `name` lookups (from tests / macros) alongside raw ids.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.material) return;
      let id: string | undefined = detail.id;
      if (!id && detail.name) {
        const match = objects.find((o) => o.name === detail.name);
        id = match?.id;
      }
      if (id) handleMaterialChange(id, detail.material);
    };
    window.addEventListener('r3-apply-material', handler);
    return () => window.removeEventListener('r3-apply-material', handler);
  }, [handleMaterialChange, objects]);

  // Imported-model rig pose ops — TransformControls attached to a bone/mesh
  // inside a rigged GLTF/FBX mutates the three.js node directly, so it does
  // not go through setObjects and would be invisible to the object-graph undo
  // stack. Scene3D dispatches this event on drag-release with prev/next TRS
  // so we can record and later restore that pose.
  useEffect(() => {
    const applyPose = (objectId: string, nodeUuid: string, trs: RigPoseTRS) => {
      import('./utils/modelImport').then(({ getImportedModel }) => {
        const imp = getImportedModel(objectId);
        if (!imp) return;
        imp.root.traverse((n: any) => {
          if (n.uuid === nodeUuid) {
            n.position.set(trs.pos[0], trs.pos[1], trs.pos[2]);
            n.rotation.set(trs.rot[0], trs.rot[1], trs.rot[2]);
            n.scale.set(trs.scale[0], trs.scale[1], trs.scale[2]);
            n.updateMatrixWorld(true);
          }
        });
      });
    };
    const onOp = (ev: Event) => {
      const d = (ev as CustomEvent).detail as RigPoseEntry | undefined;
      if (!d) return;
      rigUndoRef.current.push(d);
      if (rigUndoRef.current.length > 100) rigUndoRef.current.shift();
      undoOrderRef.current.push('rig');
      rigRedoRef.current = [];
      redoOrderRef.current = [];
      setRedoStack([]);
    };
    (applyPose as any).__rigApply = true;
    (window as any).__rigApplyPose = applyPose;
    window.addEventListener('r3-rig-pose-op', onOp as any);
    return () => window.removeEventListener('r3-rig-pose-op', onOp as any);
  }, []);

  // Undo/Redo
  const undo = useCallback(() => {
    // Timeline / Track View has priority when it's the focused surface:
    // this way undoing a bad keyframe never yanks scene objects with it.
    if (timelineHoveredRef.current && timelineUndoRef.current.length > 0) {
      const snap = timelineUndoRef.current.pop()!;
      timelineRedoRef.current.push({ animationTracks, bakedClipSets, clipSegmentsByObject });
      isRestoringTimelineRef.current = true;
      setAnimationTracks(snap.animationTracks);
      setBakedClipSets(snap.bakedClipSets);
      setClipSegmentsByObject(snap.clipSegmentsByObject);
      toast.success('Undo (timeline)');
      return;
    }
    const kind = undoOrderRef.current[undoOrderRef.current.length - 1];
    if (kind === 'rig') {
      const entry = rigUndoRef.current.pop();
      if (!entry) return;
      undoOrderRef.current.pop();
      (window as any).__rigApplyPose?.(entry.objectId, entry.nodeUuid, entry.prev);
      rigRedoRef.current.push(entry);
      redoOrderRef.current.push('rig');
      toast.success('Undo');
      return;
    }
    if (undoStack.length > 0) {
      const previousState = undoStack[undoStack.length - 1];
      setRedoStack(prev => [...prev, [...objects]]);
      setUndoStack(prev => prev.slice(0, -1));
      undoOrderRef.current.pop();
      redoOrderRef.current.push('objects');
      setObjects(previousState);
      toast.success('Undo');
    }
  }, [undoStack, objects, animationTracks, bakedClipSets, clipSegmentsByObject]);

  const redo = useCallback(() => {
    if (timelineHoveredRef.current && timelineRedoRef.current.length > 0) {
      const snap = timelineRedoRef.current.pop()!;
      timelineUndoRef.current.push({ animationTracks, bakedClipSets, clipSegmentsByObject });
      isRestoringTimelineRef.current = true;
      setAnimationTracks(snap.animationTracks);
      setBakedClipSets(snap.bakedClipSets);
      setClipSegmentsByObject(snap.clipSegmentsByObject);
      toast.success('Redo (timeline)');
      return;
    }
    const kind = redoOrderRef.current[redoOrderRef.current.length - 1];
    if (kind === 'rig') {
      const entry = rigRedoRef.current.pop();
      if (!entry) return;
      redoOrderRef.current.pop();
      (window as any).__rigApplyPose?.(entry.objectId, entry.nodeUuid, entry.next);
      rigUndoRef.current.push(entry);
      undoOrderRef.current.push('rig');
      toast.success('Redo');
      return;
    }
    if (redoStack.length > 0) {
      const nextState = redoStack[redoStack.length - 1];
      setUndoStack(prev => [...prev.slice(-9), [...objects]]);
      setRedoStack(prev => prev.slice(0, -1));
      redoOrderRef.current.pop();
      undoOrderRef.current.push('objects');
      setObjects(nextState);
      toast.success('Redo');
    }
  }, [redoStack, objects, animationTracks, bakedClipSets, clipSegmentsByObject]);

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
    const nameLc = file.name.toLowerCase();

    // DXF (native text) and DWG (binary, converted via LibreDWG WASM) both
    // produce parametric Wall objects from LINE / POLYLINE entities.
    if (nameLc.endsWith('.dxf') || nameLc.endsWith('.dwg')) {
      const isDwg = nameLc.endsWith('.dwg');
      const loadingId = toast.loading(
        isDwg ? `Convertendo ${file.name} (DWG → DXF)...` : `Parsing ${file.name}...`,
      );
      try {
        let result;
        if (isDwg) {
          const { parseDwgFile } = await import('./utils/dwgImport');
          result = await parseDwgFile(file);
        } else {
          const { parseDxfFile } = await import('./utils/dxfImport');
          result = await parseDxfFile(file);
        }
        if (result.walls.length === 0) {
          toast.dismiss(loadingId);
          toast.error(`Nenhuma LINE / POLYLINE encontrada no ${isDwg ? 'DWG' : 'DXF'}.`);
          return;
        }
        saveState();
        const now = Date.now();
        const prefix = isDwg ? 'DWG' : 'DXF';
        const newObjs: Object3DData[] = result.walls.map((w, i) => ({
          id: `line_${prefix.toLowerCase()}_${now}_${i}`,
          name: (w.layer ? `${w.layer}_` : `${prefix}_`) + `line${i + 1}`,
          type: 'line' as any,
          position: w.position,
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          color: '#ffcc33',
          visible: true,
          locked: false,
          modifiers: [],
          geometry: {
            knots: w.path.map((p) => ({
              pos: [p[0], p[1], p[2]] as [number, number, number],
              inH: [0, 0, 0] as [number, number, number],
              outH: [0, 0, 0] as [number, number, number],
            })),
            closed: w.closed,
            // Rendering (extrusion) OFF by default — imported DXF/DWG stay as
            // 2D vectors / splines, matching 3ds Max shape import behavior.
            renderable: false,
            displayRenderMesh: false,
          },
          ref: { current: null } as any,
        }));
        setObjects((prev) => [...prev, ...newObjs]);
        setSelectedObject(newObjs[0]?.id ?? null);
        toast.dismiss(loadingId);
        const bx = result.bounds.max[0] - result.bounds.min[0];
        const by = result.bounds.max[1] - result.bounds.min[1];
        const ignoredNote = Object.keys(result.ignoredEntities).length > 0
          ? ` Ignorado: ${Object.entries(result.ignoredEntities).map(([k, v]) => `${k}×${v}`).join(', ')}.`
          : '';
        toast.success(
          `${prefix} importado: ${result.walls.length} spline(s), ${bx.toFixed(1)}×${by.toFixed(1)}m (units: ${result.units}).${ignoredNote}`,
          { duration: 7000 },
        );
      } catch (err: any) {
        toast.dismiss(loadingId);
        console.error(`${isDwg ? 'DWG' : 'DXF'} import failed:`, err);
        toast.error(`${isDwg ? 'DWG' : 'DXF'} falhou: ${err?.message || 'unknown error'}`);
      }
      return;
    }

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

  /**
   * Import a model straight from a URL — used by the Object Library
   * drag-and-drop flow. Fetches the bytes, hands them to the same importer
   * pipeline as the file-based flow, and persists them to IndexedDB so the
   * imported entity survives page refreshes.
   */
  const importFromUrl = useCallback(async (url: string, filename: string, dropAt?: [number, number, number]) => {
    const loadingId = toast.loading(`Downloading ${filename}...`);
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = await res.arrayBuffer();
      const { importFromBytes, setImportedModel } = await import('./utils/modelImport');
      const { saveModelBlob } = await import('./utils/modelStorage');
      const model = await importFromBytes(filename, bytes);
      const id = `imported_${Date.now()}`;
      setImportedModel(id, model);
      try {
        await saveModelBlob(id, filename, bytes);
      } catch (e) {
        console.warn('Could not persist model blob:', e);
      }
      saveState();
      const baseName = filename.replace(/\.[^.]+$/, '');
      const newObject: Object3DData = {
        id,
        name: baseName,
        type: 'imported',
        position: dropAt || [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: '#9ca3af',
        visible: true,
        locked: false,
        modifiers: [],
        ref: { current: null } as any,
        geometry: { __importedFilename: filename },
      };
      setObjects((prev) => [...prev, newObject]);
      setSelectedObject(id);
      toast.dismiss(loadingId);
      toast.success(`Imported ${baseName}`);
    } catch (err: any) {
      toast.dismiss(loadingId);
      console.error('URL import failed:', err);
      toast.error(`Import failed: ${err?.message || 'unknown error'}`);
    }
  }, [saveState]);




  const handleDeleteSelected = useCallback(() => {
    const ids = selectedObjectIds.length ? selectedObjectIds : (selectedObject ? [selectedObject] : []);
    ids.forEach((id) => deleteObject(id));
  }, [selectedObjectIds, selectedObject, deleteObject]);

  const handleSelectAll = useCallback(() => {
    const ids = objects.filter((o) => o.visible !== false && !o.isGroup).map((o) => o.id);
    setSelectedObjectIds(ids);
    setSelectedObject(ids[ids.length - 1] ?? null);
  }, [objects]);

  const handleDeselectAll = useCallback(() => {
    setSelectedObject(null);
    setSelectedObjectIds([]);
  }, []);

  const handleFocusSelected = useCallback(() => {
    if (selectedObject) toast.info('Focus on object');
  }, [selectedObject]);

  const openFileDialog = useCallback((type: 'save' | 'open' | 'export' | 'import') => {
    if (!user) {
      setPendingFileOp(() => () => { setFileDialogType(type); setFileDialogOpen(true); });
      setLoginOpen(true);
      toast.info('Login necessário');
      return;
    }
    setFileDialogType(type);
    setFileDialogOpen(true);
  }, [user]);

  const buildScenePayload = useCallback(() => ({
    version: '1.0',
    objects,
    animationTracks,
    selectedObject,
    currentFrame,
    timestamp: new Date().toISOString(),
  }), [objects, animationTracks, selectedObject, currentFrame]);

  const applyScenePayload = useCallback((payload: any, meta?: { id: string; name: string; folderId: string | null }) => {
    saveState();
    setObjects(payload?.objects || []);
    setAnimationTracks(payload?.animationTracks || []);
    setSelectedObject(payload?.selectedObject || null);
    setCurrentFrame(payload?.currentFrame || 0);
    setCurrentCloudScene(meta ?? null);
  }, [saveState]);

  const saveToCloud = useCallback(async (name: string, folderId: string | null) => {
    if (!user) throw new Error('login required');
    const { data, error } = await supabase.from('scenes').insert({
      user_id: user.id,
      name,
      folder_id: folderId,
      data: buildScenePayload() as any,
    }).select('id').maybeSingle();
    if (error) throw error;
    if (data?.id) setCurrentCloudScene({ id: data.id, name, folderId });
  }, [user, buildScenePayload]);

  const saveCurrentCloudInPlace = useCallback(async () => {
    if (!currentCloudScene) return false;
    const { error } = await supabase.from('scenes')
      .update({ data: buildScenePayload() as any })
      .eq('id', currentCloudScene.id);
    if (error) { toast.error('Falha ao salvar na nuvem'); return false; }
    toast.success(`Salvo em "${currentCloudScene.name}"`);
    return true;
  }, [currentCloudScene, buildScenePayload]);

  const handleSaveRequest = useCallback(async () => {
    if (currentCloudScene && user) {
      const ok = await saveCurrentCloudInPlace();
      if (ok) return;
    }
    openFileDialog('save');
  }, [currentCloudScene, user, saveCurrentCloudInPlace, openFileDialog]);


  const gate = useCallback((run: () => void) => {
    if (!user) {
      setPendingFileOp(() => run);
      setLoginOpen(true);
      toast.info('Login necessário');
      return;
    }
    run();
  }, [user]);

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
    setCurrentCloudScene(null);
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

  // ---------- Select and Link (3ds Max hierarchy) ----------
  // A parent/child relationship built via world-space delta cascading:
  // moving/rotating/scaling a parent applies the same world-space delta to
  // every descendant (like Max), while descendants remain stored in world
  // coordinates so unlinking never causes the object to "jump".
  const [linkTool, setLinkTool] = useState<'link' | null>(null);
  const linkToolRef = useRef<'link' | null>(null);
  useEffect(() => {
    linkToolRef.current = linkTool;
    (window as any).__r3LinkTool = linkTool;
  }, [linkTool]);


  const collectDescendantIds = (parentId: string, list: Object3DData[]): Set<string> => {
    const out = new Set<string>();
    const stack = [parentId];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const o of list) {
        if (o.parentId === cur && !out.has(o.id)) {
          out.add(o.id);
          stack.push(o.id);
        }
      }
    }
    return out;
  };

  const isAncestorOf = (maybeAncestor: string, node: string, list: Object3DData[]): boolean => {
    let cur: string | undefined | null = list.find((o) => o.id === node)?.parentId;
    while (cur) {
      if (cur === maybeAncestor) return true;
      cur = list.find((o) => o.id === cur!)?.parentId;
    }
    return false;
  };

  const doLinkSelectionTo = (parentId: string) => {
    const ids = selectedObjectIds.length ? selectedObjectIds : (selectedObject ? [selectedObject] : []);
    if (!ids.length) return;
    const parent = objectsRef.current.find((o) => o.id === parentId);
    if (!parent) return;
    const validIds = ids.filter((id) => {
      if (id === parentId) return false;
      if (isAncestorOf(id, parentId, objectsRef.current)) return false;
      return true;
    });
    if (!validIds.length) { toast.error('Cannot link an object to itself or to its descendant'); return; }
    saveState();
    setObjects((prev) => prev.map((o) => validIds.includes(o.id) ? { ...o, parentId } : o));
    toast.success(`Linked ${validIds.length} object(s) → ${parent.isGroup ? 'group' : parentId.slice(0, 8)}`);
  };

  useEffect(() => {
    (window as any).__r3DoLink = (parentId: string) => {
      doLinkSelectionTo(parentId);
      setLinkTool(null);
    };
    return () => { delete (window as any).__r3DoLink; };
  }, [selectedObjectIds, selectedObject]);


  const doUnlinkSelection = () => {
    const ids = selectedObjectIds.length ? selectedObjectIds : (selectedObject ? [selectedObject] : []);
    if (!ids.length) { toast.error('Select object(s) to unlink'); return; }
    const targets = ids.filter((id) => objectsRef.current.find((o) => o.id === id)?.parentId);
    if (!targets.length) { toast.info('Selected object(s) have no parent link'); return; }
    saveState();
    setObjects((prev) => prev.map((o) => targets.includes(o.id) ? { ...o, parentId: null } : o));
    toast.success(`Unlinked ${targets.length} object(s)`);
  };

  const armLinkTool = () => {
    const ids = selectedObjectIds.length ? selectedObjectIds : (selectedObject ? [selectedObject] : []);
    if (!ids.length) { toast.error('Select the child object(s) first, then click Select and Link'); return; }
    setLinkTool('link');
    toast.info('Click the parent object to link to (Esc to cancel)');
  };

  useEffect(() => {
    if (!linkTool) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLinkTool(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [linkTool]);



  // ---------- Groups (3ds Max style) ----------
  // Model: a group is a hidden "head" node (isGroup:true) + members carrying its
  // groupId. When closed, clicking any member selects the entire group as one
  // (multi-select). When open, members can be edited individually and new
  // objects can be Attached/Detached.

  const resolveGroupIdFromSelection = (): string | null => {
    const ids = selectedObjectIds.length ? selectedObjectIds : (selectedObject ? [selectedObject] : []);
    for (const id of ids) {
      const o = objects.find((x) => x.id === id);
      if (!o) continue;
      if (o.isGroup) return o.id;
      if (o.groupId) return o.groupId;
    }
    return null;
  };

  const doGroup = () => {
    const memberIds = (selectedObjectIds.length ? selectedObjectIds : (selectedObject ? [selectedObject] : []))
      .filter((id) => {
        const o = objects.find((x) => x.id === id);
        return o && !o.isGroup && !o.groupId;
      });
    if (memberIds.length < 2) {
      toast.error('Select at least 2 objects (Ctrl+click) before grouping');
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
      const memberSet = new Set(memberIds);
      return [
        groupNode,
        ...prev.map((o) => memberSet.has(o.id) ? { ...o, groupId } : o),
      ];
    });
    // Selection stays on all members so the multi-proxy gizmo appears at the
    // shared centroid immediately — this is what makes the group behave as one.
    setSelectedObjectIds(memberIds);
    setSelectedObject(memberIds[memberIds.length - 1]);
    toast.success(`Grouped ${memberIds.length} objects as "${name}"`);
  };

  const doUngroup = () => {
    const groupId = resolveGroupIdFromSelection();
    if (!groupId) { toast.error('Select a group (or a group member) to ungroup'); return; }
    saveState();
    setObjects((prev) => prev
      .filter((o) => o.id !== groupId)
      .map((o) => o.groupId === groupId ? { ...o, groupId: undefined } : o));
    setSelectedObject(null);
    setSelectedObjectIds([]);
    toast.success('Ungrouped');
  };

  const doOpenGroup = () => {
    const groupId = resolveGroupIdFromSelection();
    if (!groupId) { toast.error('Select a group first'); return; }
    setObjects((prev) => prev.map((o) => o.id === groupId ? { ...o, groupOpen: true } : o));
    toast.success('Group opened — edit members individually');
  };

  const doCloseGroup = () => {
    const groupId = resolveGroupIdFromSelection();
    if (!groupId) { toast.error('Select a group first'); return; }
    setObjects((prev) => prev.map((o) => o.id === groupId ? { ...o, groupOpen: false } : o));
    toast.success('Group closed');
  };

  const doAttach = () => {
    // Attach: requires an OPEN group + one or more selected non-grouped objects.
    const openGroup = objects.find((o) => o.isGroup && o.groupOpen);
    if (!openGroup) { toast.error('Open a group first (Group → Open)'); return; }
    const ids = (selectedObjectIds.length ? selectedObjectIds : (selectedObject ? [selectedObject] : []))
      .filter((id) => {
        const o = objects.find((x) => x.id === id);
        return o && !o.isGroup && !o.groupId;
      });
    if (!ids.length) { toast.error('Select ungrouped object(s) to attach'); return; }
    saveState();
    const idSet = new Set(ids);
    setObjects((prev) => prev.map((o) => idSet.has(o.id) ? { ...o, groupId: openGroup.id } : o));
    toast.success(`Attached ${ids.length} object(s) to "${openGroup.name}"`);
  };

  const doDetach = () => {
    // Detach: currently selected members leave their group. Group survives if
    // 2+ members remain, otherwise it is dissolved (matches 3ds Max).
    const ids = (selectedObjectIds.length ? selectedObjectIds : (selectedObject ? [selectedObject] : []))
      .filter((id) => {
        const o = objects.find((x) => x.id === id);
        return o && !o.isGroup && o.groupId;
      });
    if (!ids.length) { toast.error('Select group member(s) to detach'); return; }
    saveState();
    const idSet = new Set(ids);
    setObjects((prev) => {
      const next = prev.map((o) => idSet.has(o.id) ? { ...o, groupId: undefined } : o);
      // Dissolve groups that no longer have >=2 members
      const alive = new Set<string>();
      for (const o of next) if (o.groupId) alive.add(o.groupId);
      return next
        .filter((o) => !o.isGroup || alive.has(o.id))
        .map((o) => (o.groupId && !alive.has(o.groupId)) ? { ...o, groupId: undefined } : o);
    });
    toast.success(`Detached ${ids.length} object(s)`);
  };

  const doExplode = () => {
    // Remove EVERY group container (nested or not) touching the selection —
    // or all groups when nothing is selected — leaving members independent.
    const groupId = resolveGroupIdFromSelection();
    saveState();
    setObjects((prev) => {
      if (!groupId) {
        return prev.filter((o) => !o.isGroup).map((o) => ({ ...o, groupId: undefined }));
      }
      return prev
        .filter((o) => o.id !== groupId)
        .map((o) => o.groupId === groupId ? { ...o, groupId: undefined } : o);
    });
    setSelectedObject(null);
    setSelectedObjectIds([]);
    toast.success('Exploded');
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

  // ---------- Sprint B: Mirror / Array / Align / Select Invert ----------

  const applyMirror = (opts: { axis: 'X' | 'Y' | 'Z' | 'XY' | 'YZ' | 'ZX'; offset: number; cloneMode: 'no' | 'copy' | 'instance' | 'reference' }) => {
    const sel = objects.find((o) => o.id === selectedObject);
    if (!sel) { toast.error('Select an object first'); return; }
    saveState();
    const flip = (v: [number, number, number], axis: typeof opts.axis, off: number): [number, number, number] => {
      const p: [number, number, number] = [...v] as [number, number, number];
      const applyOn = (i: 0 | 1 | 2) => { p[i] = -p[i] + (i === 0 ? off : 0); };
      if (axis.includes('X')) applyOn(0);
      if (axis.includes('Y')) applyOn(1);
      if (axis.includes('Z')) applyOn(2);
      return p;
    };
    const flipScale = (v: [number, number, number], axis: typeof opts.axis): [number, number, number] => {
      const s: [number, number, number] = [...v] as [number, number, number];
      if (axis.includes('X')) s[0] = -s[0];
      if (axis.includes('Y')) s[1] = -s[1];
      if (axis.includes('Z')) s[2] = -s[2];
      return s;
    };
    const mirrored = {
      ...sel,
      id: opts.cloneMode !== 'no' ? `${sel.type}_${Date.now()}` : sel.id,
      name: opts.cloneMode !== 'no' ? `${sel.name || sel.type}_mirror` : sel.name,
      position: flip(sel.position, opts.axis, opts.offset),
      scale: flipScale(sel.scale, opts.axis),
      ref: opts.cloneMode !== 'no' ? { current: null } as any : sel.ref,
    };
    setObjects((prev) => opts.cloneMode === 'no'
      ? prev.map((o) => (o.id === sel.id ? mirrored : o))
      : [...prev, mirrored]
    );
    if (opts.cloneMode !== 'no') setSelectedObject(mirrored.id);
    toast.success(`Mirrored along ${opts.axis}`);
  };

  const applyArray = (opts: { count: number; incX: number; incY: number; incZ: number; incRotX: number; incRotY: number; incRotZ: number; incScale: number }) => {
    const sel = objects.find((o) => o.id === selectedObject);
    if (!sel) { toast.error('Select an object first'); return; }
    saveState();
    const clones: Object3DData[] = [];
    const d2r = Math.PI / 180;
    for (let i = 1; i < opts.count; i++) {
      clones.push({
        ...sel,
        id: `${sel.type}_${Date.now()}_${i}`,
        name: `${sel.name || sel.type}_${String(i).padStart(2, '0')}`,
        position: [sel.position[0] + opts.incX * i, sel.position[1] + opts.incY * i, sel.position[2] + opts.incZ * i],
        rotation: [sel.rotation[0] + opts.incRotX * d2r * i, sel.rotation[1] + opts.incRotY * d2r * i, sel.rotation[2] + opts.incRotZ * d2r * i],
        scale: [sel.scale[0] * Math.pow(opts.incScale, i), sel.scale[1] * Math.pow(opts.incScale, i), sel.scale[2] * Math.pow(opts.incScale, i)],
        ref: { current: null } as any,
      });
    }
    setObjects((prev) => [...prev, ...clones]);
    toast.success(`Array of ${opts.count} created`);
  };

  const applyAlign = (opts: AlignOpts) => {
    const sel = objects.find((o) => o.id === selectedObject);
    if (!sel) { toast.error('Select current object first'); return; }
    const target = objects.find((o) => o.id !== sel.id && !o.isGroup);
    if (!target) { toast.error('Need a second object as target'); return; }
    saveState();
    const pos: [number, number, number] = [...sel.position] as [number, number, number];
    if (opts.x) pos[0] = target.position[0];
    if (opts.y) pos[1] = target.position[1];
    if (opts.z) pos[2] = target.position[2];
    setObjects((prev) => prev.map((o) => (o.id === sel.id ? { ...o, position: pos } : o)));
    toast.success(`Aligned to ${target.name || target.type}`);
  };

  const doSelectInvert = () => {
    const candidates = objects.filter((o) => !o.isGroup && o.visible !== false);
    const other = candidates.find((o) => o.id !== selectedObject);
    setSelectedObject(other?.id ?? null);
  };

  const handleMenuAction = (action: string) => {
    switch (action) {
      case 'New Scene': doNewScene(); break;
      case 'Reset': doReset(); break;
      case 'Hold': doHold(); break;
      case 'Fetch': doFetch(); break;
      case 'Exit': askConfirm('Save changes before exit?', () => { openFileDialog('save'); }, 'Exit'); break;
      case 'Login...': setLoginOpen(true); break;
      case 'Logout': signOut(); toast.success('Sessão encerrada'); break;
      case 'Admin — Liberar usuário...': if (isAdmin) setAdminOpen(true); else toast.error('Apenas admin'); break;
      case 'Save': handleSaveRequest(); break;
      case 'Save Cloud...':
        if (currentCloudScene && user) { saveCurrentCloudInPlace(); }
        else { gate(() => setCloudSaveOpen(true)); }
        break;
      case 'Open Cloud...': gate(() => setCloudOpenOpen(true)); break;
      case 'Export Cloud...': gate(() => setCloudExportOpen(true)); break;
      case 'Import Cloud...': gate(() => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.json,.3dsled,application/json';
        inp.onchange = async () => {
          const f = inp.files?.[0]; if (!f) return;
          try {
            const text = await f.text();
            const payload = JSON.parse(text);
            setCloudImportPayload(payload);
            setCloudImportName(f.name.replace(/\.(3dsled\.)?json$/i, ''));
            setCloudImportOpen(true);
          } catch { toast.error('Arquivo JSON inválido'); }
        };
        inp.click();
      }); break;
      case 'Object Properties...': if (selectedObject) setObjectPropsOpen(true); else toast.error('Select an object'); break;
      case 'Select All': setSelectedObject(objects[0]?.id ?? null); break;
      case 'Select None': setSelectedObject(null); break;
      case 'Select Invert': doSelectInvert(); break;
      case 'Region': setSelectByNameOpen(true); break;
      case 'Group': doGroup(); break;
      case 'Ungroup': doUngroup(); break;
      case 'Open': doOpenGroup(); break;
      case 'Close': doCloseGroup(); break;
      case 'Attach': doAttach(); break;
      case 'Detach': doDetach(); break;
      case 'Explode': doExplode(); break;
      case 'Units Setup...': setUnitsOpen(true); break;
      case 'Grid and Snap Settings...': setSnapSettingsOpen(true); break;
      case 'Welcome...': setWelcomeOpen(true); break;
      case 'About Walt3D...': setAboutOpen(true); break;
      case 'Layout: Single': setViewportLayout('single'); break;
      case 'Layout: Quad (3 Wire + Persp)': setViewportLayout('quad'); break;
      case 'Layout: 2 Cols — Top (Wire) + Persp': setViewportLayout('2col-top-persp'); break;
      case 'Layout: 2 Cols — Front (Wire) + Persp': setViewportLayout('2col-front-persp'); break;
      case 'Layout: 2 Cols — Left (Wire) + Persp': setViewportLayout('2col-left-persp'); break;
      case 'Layout: 2 Rows — Top (Wire) + Persp': setViewportLayout('2row-top-persp'); break;

      // Edit — menu-click versions of shortcuts already covered by keyboard.
      case 'Undo': undo(); break;
      case 'Redo': redo(); break;
      case 'Delete': handleDeleteSelected(); break;
      case 'Clone': {
        const sel = objects.find((o) => o.id === selectedObject);
        if (!sel) { toast.error('Select an object first'); break; }
        saveState();
        const c: Object3DData = {
          ...sel,
          id: `${sel.type}_${Date.now()}`,
          name: `${sel.name || sel.type}_copy`,
          position: [sel.position[0] + 1, sel.position[1], sel.position[2] + 1],
          ref: { current: null } as any,
        };
        setObjects((prev) => [...prev, c]);
        setSelectedObject(c.id);
        toast.success('Cloned');
        break;
      }

      // Views — toggles + configuration.
      case 'Show Grid':
        setViewOpts((v) => ({ ...v, showGrid: !v.showGrid }));
        toast.info(`Grid ${!viewOpts.showGrid ? 'on' : 'off'}`);
        break;
      case 'Show Statistics':
        setViewOpts((v) => {
          (window as any).__showStatistics = !v.showStatistics;
          return { ...v, showStatistics: !v.showStatistics };
        });
        break;
      case 'Update During Spinner Drag':
        setViewOpts((v) => {
          (window as any).__updateDuringSpinnerDrag = !v.updateDuringSpinnerDrag;
          return { ...v, updateDuringSpinnerDrag: !v.updateDuringSpinnerDrag };
        });
        break;
      case 'Viewport Configuration...': setSnapSettingsOpen(true); break;

      // Create — switch Create tab + category (SidePanel listens on the
      // r3-sidepanel-set-category event bus we added).
      case 'Standard Primitives':
        setSidePanelTab('create');
        window.dispatchEvent(new CustomEvent('r3-sidepanel-set-category', { detail: { tab: 'create', createCat: 'geometry', createCategory: 'standard' } }));
        break;
      case 'Extended Primitives':
        setSidePanelTab('create');
        window.dispatchEvent(new CustomEvent('r3-sidepanel-set-category', { detail: { tab: 'create', createCat: 'geometry', createCategory: 'extended' } }));
        break;
      case 'AEC Objects':
        setSidePanelTab('create');
        window.dispatchEvent(new CustomEvent('r3-sidepanel-set-category', { detail: { tab: 'create', createCat: 'geometry', createCategory: 'aec' } }));
        break;
      case 'Compound Objects':
      case 'Compound':
        setSidePanelTab('create');
        window.dispatchEvent(new CustomEvent('r3-sidepanel-set-category', { detail: { tab: 'create', createCat: 'geometry', createCategory: 'compound' } }));
        break;
      case 'Particle Systems':
        setSidePanelTab('create');
        window.dispatchEvent(new CustomEvent('r3-sidepanel-set-category', { detail: { tab: 'create', createCat: 'geometry', createCategory: 'particles' } }));
        break;
      case 'Helpers':
        setSidePanelTab('create');
        window.dispatchEvent(new CustomEvent('r3-sidepanel-set-category', { detail: { tab: 'create', createCat: 'helpers' } }));
        break;
      case 'Lights':
        setSidePanelTab('create');
        window.dispatchEvent(new CustomEvent('r3-sidepanel-set-category', { detail: { tab: 'create', createCat: 'lights' } }));
        break;
      case 'Cameras':
        setSidePanelTab('create');
        window.dispatchEvent(new CustomEvent('r3-sidepanel-set-category', { detail: { tab: 'create', createCat: 'cameras' } }));
        break;

      // Modifiers — add named modifier to current selection. The submenu labels
      // "Selection Modifiers / Parametric Deformers / Free Form Deformers /
      // Edit Poly / Edit Mesh / …" open the Modify tab and, for concrete named
      // modifiers, add them via the existing addModifier pipeline.
      case 'Selection Modifiers':
      case 'Parametric Deformers':
      case 'Free Form Deformers':
        setSidePanelTab('modify');
        toast.info(`${action} — pick a modifier in the stack`);
        break;
      case 'Edit Poly':
      case 'Edit Mesh':
      case 'Bend':
      case 'Twist':
      case 'Taper':
      case 'Noise':
      case 'TurboSmooth': {
        if (!selectedObject) { toast.error('Select an object first'); break; }
        setSidePanelTab('modify');
        addModifier(selectedObject, action);
        break;
      }

      // Character.
      case 'Create Character':
        // Spawn a default biped at world origin via existing pipeline.
        window.dispatchEvent(new CustomEvent('r3-spawn-biped', { detail: { origin: [0, 0, 0], height: 1.8 } }));
        break;
      case 'Insert Character...': openFileDialog('import'); break;
      case 'Save Character...':   openFileDialog('export'); break;
      case 'Bone Tools...':
        setSidePanelTab('create');
        window.dispatchEvent(new CustomEvent('r3-sidepanel-set-category', { detail: { tab: 'create', createCat: 'systems' } }));
        toast.info('Bone Tools — pick Bones in Systems');
        break;
      case 'IK Solvers':
        toast.info('IK Solvers — apply on a selected bone chain (Modify tab)');
        setSidePanelTab('modify');
        break;

      // Animation.
      case 'Set Key': {
        if (!selectedObject) { toast.error('Select an object first'); break; }
        addKeyframe(selectedObject, currentFrame);
        toast.success(`Key set at frame ${currentFrame}`);
        setTimelineVisible(true);
        break;
      }
      case 'Auto Key':
        setAutoKey((v) => !v);
        toast.info(`Auto Key ${!autoKey ? 'ON' : 'OFF'}`);
        break;
      case 'Track View':
      case 'Track View - Dope Sheet':
      case 'Track View - Curve Editor':
      case 'Curve Editor':
        setTimelineVisible(true);
        setTimeout(() => window.dispatchEvent(new CustomEvent('r3-timeline-set-view', { detail: { view: 'trackview' } })), 0);
        break;
      case 'Position Constraint':
      case 'LookAt Constraint':
        toast.info(`${action} — assign target via the Motion panel (coming next sprint)`);
        break;
      case 'Schematic View':
        setHierarchyWindowOpen(true);
        break;

      // Customize.
      case 'Customize User Interface...':
        setCustomizeUIOpen(true);
        break;
      case 'Load Custom UI Scheme...':
      case 'Save Custom UI Scheme...':
        // Both routes are handled inside the CustomizeUIDialog "Scheme" tab.
        setCustomizeUIOpen(true);
        break;
      case 'Preferences...':
        setPreferencesOpen(true);
        break;
      case 'MapTools...':
        setMapToolsOpen(true);
        break;
      case 'WaltSculpt...':
        setWaltSculptOpen(true);
        break;

      // MAXScript.
      case 'New Script':
      case 'Open Script...':
      case 'Run Script...':
      case 'MAXScript Listener':
        setMaxScriptOpen(true);
        break;

      // Help — external references.
      case 'User Reference':
        window.open('https://help.autodesk.com/view/3DSMAX/2024/ENU/', '_blank', 'noopener');
        break;
      case 'MAXScript Reference':
        window.open('https://help.autodesk.com/view/3DSMAX/2024/ENU/?guid=GUID-F039181A-C072-4469-A329-AE60FF7535E7', '_blank', 'noopener');
        break;
      case 'Tutorials':
        window.open('https://www.autodesk.com/certification/learn/catalog/product/3ds-max', '_blank', 'noopener');
        break;

      default: break;
    }
  };

  // Global hotkey dispatcher. Reads the (persistent) hotkey map on every
  // keydown and routes matches back through `handleMenuAction` so a chord
  // press and a menu click take the exact same code path. Skipped when the
  // user is typing inside a text input / textarea / contentEditable field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) {
          return;
        }
      }
      const cmd = commandForEvent(e);
      if (!cmd) return;
      e.preventDefault();
      e.stopPropagation();
      handleMenuAction(cmd);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true } as any);
    // handleMenuAction is redefined every render but only reads state via
    // closures that are already stable within the component instance; we
    // intentionally re-bind so the listener always sees the latest handler.
  });


  return (
    <EnvironmentProvider>
    <RenderEngineProvider>
    <CreationProvider
      onCommit={commitGhostObject}
      onArmedChange={setArmedTool}
      onGhostChange={setGhost}
    >
    <div className="h-screen bg-win-face text-win-text overflow-hidden flex flex-col select-none">

      <KeyboardShortcuts
        onTransformMode={setTransformMode}
        onDeleteSelected={handleDeleteSelected}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        onFocusSelected={handleFocusSelected}
        onUndo={undo}
        onRedo={redo}
        onSave={handleSaveRequest}
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
        onToggleMaximize={() => setViewportLayout((v) => (v === 'single' ? 'quad' : 'single'))}
        onToggleSnap={() => setSnapEnabled((v) => !v)}
        onOpenSelectByName={() => setSelectByNameOpen(true)}
      />

      {/* Windows title bar */}
      <div className="titlebar-gradient h-[20px] px-1.5 flex items-center justify-between text-[11px] font-bold shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 bevel-raised bg-win-face flex items-center justify-center text-[10px] text-win-title">3</div>
          <span>{currentCloudScene ? `${currentCloudScene.name} - Walt3D` : 'Untitled - Walt3D'}</span>
          <span className="ml-3 font-normal opacity-90">
            {user ? `● ${user.email}${isAdmin ? ' (admin)' : ''}` : '○ not logged in'}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            className="w-[16px] h-[14px] bevel-raised text-win-text text-[10px] leading-none"
            title="Minimize"
            onClick={() => { try { (document.activeElement as HTMLElement | null)?.blur?.(); } catch {} }}
          >_</button>
          <button
            className="w-[16px] h-[14px] bevel-raised text-win-text text-[10px] leading-none"
            title="Maximize App (Fullscreen — F11)"
            onClick={() => {
              if (typeof document === 'undefined') return;
              if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
              else (document.documentElement.requestFullscreen?.() ?? Promise.resolve()).catch(() => {});
            }}
          >▢</button>
          <button
            className="w-[16px] h-[14px] bevel-raised text-win-text text-[10px] leading-none"
            title="Close"
            onClick={() => { try { window.close(); } catch {} }}
          >✕</button>
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
        onMenuAction={handleMenuAction}
      />

      {/* Main toolbar row (icons) */}
      <div className="shrink-0">
        <MainToolbar
          transformMode={transformMode}
          onTransformMode={(m) => { setTransformMode(m); setTypeInOpen(true); }}
          onUndo={undo}
          onRedo={redo}
          onOpenMaterialEditor={() => setMaterialEditorOpen(true)}
          onQuickRender={() => setQuickRenderOpen(true)}
          onMirror={() => { setTypeInOpen(false); if (selectedObject) setMirrorOpen(true); else toast.error('Select an object'); }}
          onArray={() => { setTypeInOpen(false); if (selectedObject) setArrayOpen(true); else toast.error('Select an object'); }}
          onAlign={() => { setTypeInOpen(false); if (selectedObject) setAlignOpen(true); else toast.error('Select an object'); }}
          onLayerManager={() => { setTypeInOpen(false); toast.info('Layer Manager — coming next sprint'); }}
          onSelectByName={() => { setTypeInOpen(false); setSelectByNameOpen(true); }}
          onRenderSetup={() => setRenderSetupOpen(true)}
          onOpenHierarchy={() => setHierarchyWindowOpen(true)}
          onOpenLibrary={() => setLibraryWindowOpen(true)}
          viewportLayout={viewportLayout}
          onToggleViewportLayout={() => setViewportLayout((v) => v === 'quad' ? 'single' : 'quad')}
          onSelectAndLink={armLinkTool}
          onUnlinkSelection={doUnlinkSelection}
          linkToolActive={linkTool === 'link'}
        />


      </div>

      {/* Snaps / secondary toolbar row */}
      <div className="shrink-0">
        <SnapsToolbar
          snapEnabled={snapEnabled}
          onToggleSnap={() => setSnapEnabled((v) => !v)}
          angleSnapEnabled={angleSnapEnabled}
          onToggleAngleSnap={() => setAngleSnapEnabled((v) => !v)}
          onOpenGridSettings={() => setSnapSettingsOpen(true)}
        />
      </div>

      <div className="flex flex-1 min-h-0 bg-win-face">
        {/* Left sidebar removed — Object Library is now a floating window opened from the toolbar */}


        {/* Center: Viewport(s) */}
        <div
          className="flex-1 flex flex-col min-h-0 bevel-inset"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(DND_MIME) || e.dataTransfer.types.includes('text/plain')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDrop={(e) => {
            const raw = e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData('text/plain');
            if (!raw) return;
            try {
              const data = JSON.parse(raw);
              if (data?.url && data?.filename) {
                e.preventDefault();
                importFromUrl(data.url, data.filename);
              }
            } catch { /* not our payload */ }
          }}
        >
          <div className="flex-1 min-h-0 bg-win-dark">

            <ViewportGrid
              layout={viewportLayout}
              activeViewport={activeViewport}
              onActiveViewportChange={setActiveViewport}
              objects={[
                ...objects.filter(obj => obj.visible !== false && !obj.isGroup),
                ...(ghost ? [ghost as any] : []),
              ]}
              viewportCameras={viewportCameras}
              onSetViewportCamera={(vp, camId) => setViewportCameras((prev) => ({ ...prev, [vp]: camId }))}
              availableCameras={objects.filter((o) => o.type === 'camera_target' || o.type === 'camera_free')}

              selectedObject={selectedObject}
              selectedObjectIds={selectedObjectIds}
              selectedSubUuid={selectedSubUuid}
              onSelectObject={(id, additive, remove) => { handleSelectObject(id, additive, remove); if (id === null) setSelectedSubUuid(null); }}
              onTransformObject={handleTransformObject}
              transformMode={transformMode}
              animationTracks={animationTracks}
              selectedKeyframe={selectedKeyframe}
              onUpdateKeyframe={updateKeyframe}
              onSelectKeyframe={setSelectedKeyframe}
              currentFrame={currentFrame}
              totalFrames={totalFrames}
              isPlaying={isPlaying}
              snapEnabled={snapEnabled}
              snapGridSpacing={snapCfg.gridSpacing}
              snapAngleDeg={angleSnapEnabled ? snapCfg.angleSnap : 0}
              snapPercent={snapCfg.percentSnap}
              showGrid={viewOpts.showGrid}
            />

          </div>
        </div>

        {/* Right: Command Panel — fixed width like 3ds Max R3 (~200 px) */}
        <div className="w-[210px] shrink-0 bevel-inset bg-panel overflow-hidden">
          <ArmedSidePanel
            onCreateObject={createObject}
            activeTab={sidePanelTab}
            onActiveTabChange={setSidePanelTab}
            selectedObject={selectedObjectData}
            onOpenMaterialEditor={() => setMaterialEditorOpen(true)}
            onAddModifier={addModifier}
            onUpdateModifier={updateModifier}
            onRemoveModifier={removeModifier}
            onToggleModifier={toggleModifier}
            onReorderModifier={reorderModifier}
            onRenameObject={renameObject}
            onUpdateObjectGeometry={updateObjectGeometry}
            onUpdateObjectLightData={updateObjectLightData}
            onUpdateObjectCameraData={updateObjectCameraData}
            onUpdateObjectColor={updateObjectColor}
            compoundState={compoundState}
            onArmCompound={armCompound}
            onSetCompoundOp={setCompoundOp}
            onStartPickOperandB={startPickOperandB}
            onCancelCompound={cancelCompound}
            allObjects={objects}
            onCreatePrintBed={() => createObject('sys_print_bed')}
            onUpdatePrintBed={(id, patch) => setObjects((prev) => prev.map((o) => o.id === id ? { ...o, geometry: { ...(o.geometry || {}), ...patch } } : o))}
            onTransformObject={handleTransformObject}
            selectedSubUuid={selectedSubUuid}
            onSelectSubObject={(_id, uuid) => setSelectedSubUuid(uuid)}
          />



        </div>
      </div>

      {/* Trackbar (Animation timeline) — hidden by default */}
      {timelineVisible && (() => {
        // Discover the selected imported model's animation clips (if any).
        const selData = objects.find((o) => o.id === selectedObject);
        const isImported = selData?.type === 'imported';
        let clipOptions: { index: number; name: string }[] | undefined;
        if (isImported) {
          // Fire-and-forget — modelImport cache is sync after import.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const imp = getImportedModel(selData!.id);
          if (imp && imp.animations && imp.animations.length > 0) {
            clipOptions = imp.animations.map((c: any, i: number) => ({
              index: i,
              name: c.name || `Clip ${i + 1}`,
            }));
          }
        }
        const bakedSet = selectedObject ? bakedClipSets[selectedObject] : undefined;
        const handleBake = async (clipIndex: number) => {
          if (!selData || !isImported) return;
          const { getImportedModel } = await import('./utils/modelImport');
          const { bakeClipToTracks } = await import('./timeline/channelTracks');
          const imp = getImportedModel(selData.id);
          if (!imp || !imp.animations[clipIndex]) return;
          const baked = bakeClipToTracks(imp.animations[clipIndex], clipIndex, imp.root, selData.id, 30);
          setBakedClipSets((prev) => ({ ...prev, [selData.id]: baked }));
          toast.success(`Baked "${baked.clipName}" → ${baked.tracks.length} tracks`);
        };
        const handleChangeBakedSet = (next: BakedClipSet) => {
          if (!selectedObject) return;
          setBakedClipSets((prev) => ({ ...prev, [selectedObject]: next }));
        };
        const clipSegments = selectedObject ? (clipSegmentsByObject[selectedObject] || []) : [];
        const setClipSegments = (next: Array<{ id: string; startFrame: number; endFrame: number; clipIndex: number; blendIn?: number }>) => {
          if (!selectedObject) return;
          setClipSegmentsByObject((prev) => ({
            ...prev,
            [selectedObject]: next.slice().sort((a, b) => a.startFrame - b.startFrame),
          }));
        };
        return (
          <div
            onMouseEnter={() => { timelineHoveredRef.current = true; }}
            onMouseLeave={() => { timelineHoveredRef.current = false; }}
            className="contents"
          >
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
            loopPlayback={loopPlayback}
            onToggleLoopPlayback={() => setLoopPlayback(v => !v)}
            bakedClipSet={bakedSet ?? null}
            bakedClipOptions={clipOptions}
            onBakeClip={clipOptions ? handleBake : undefined}
            onChangeBakedSet={handleChangeBakedSet}
            clipSegments={clipSegments}
            onClipSegmentsChange={clipOptions ? setClipSegments : undefined}
          />
          </div>
        );
      })()}


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
        gridSpacing={snapCfg.gridSpacing}
        units={units}
        timelineVisible={timelineVisible}
        onToggleTimeline={() => setTimelineVisible(v => !v)}
        loopPlayback={loopPlayback}
        onToggleLoopPlayback={() => setLoopPlayback(v => !v)}
      />


      <MaterialEditorR3
        open={materialEditorOpen}
        onOpenChange={setMaterialEditorOpen}
        selectedObject={selectedObjectData}
        onMaterialChange={handleMaterialChange}
      />

      <QuickRender
        open={quickRenderOpen}
        onOpenChange={setQuickRenderOpen}
        width={renderDims.width}
        height={renderDims.height}
      />
      <RenderSetup
        open={renderSetupOpen}
        onOpenChange={setRenderSetupOpen}
        onRender={(w, h) => { setRenderDims({ width: w, height: h }); setQuickRenderOpen(true); }}
        currentFrame={currentFrame}
        totalFrames={totalFrames}
        setCurrentFrame={setAnimationRenderFrame}
        cameras={objects
          .filter((o) => o.type === 'camera_target' || o.type === 'camera_free')
          .map((o) => ({ id: o.id, name: o.name || o.type }))}
        getObjects={() => objectsRef.current}
        activeViewportCameraId={viewportCameras[activeViewport] ?? null}
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

      <LoginDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onSuccess={() => { const p = pendingFileOp; setPendingFileOp(null); p?.(); }}
        onRequestAccess={() => { setWelcomeInitialTab('request'); setWelcomeOpen(true); }}
      />
      <AdminPanelDialog open={adminOpen} onOpenChange={setAdminOpen} />
      <CloudSceneDialog
        open={cloudSaveOpen}
        mode="save"
        onOpenChange={setCloudSaveOpen}
        onSave={saveToCloud}
      />
      <CloudSceneDialog
        open={cloudOpenOpen}
        mode="open"
        onOpenChange={setCloudOpenOpen}
        onLoad={applyScenePayload}
      />
      <CloudSceneDialog
        open={cloudExportOpen}
        mode="export"
        onOpenChange={setCloudExportOpen}
      />
      <WelcomeDialog
        open={welcomeOpen}
        initialTab={welcomeInitialTab}
        onOpenChange={(o) => {
          setWelcomeOpen(o);
          if (!o) { setWelcomeInitialTab('welcome'); try { localStorage.setItem('3de.welcome.seen', '1'); } catch {} }
        }}
      />
      <CloudSceneDialog
        open={cloudImportOpen}
        mode="import"
        onOpenChange={(o) => { setCloudImportOpen(o); if (!o) { setCloudImportPayload(null); setCloudImportName(''); } }}
        importPayload={cloudImportPayload}
        importDefaultName={cloudImportName}
      />



      <ObjectPropertiesDialog
        open={objectPropsOpen}
        onOpenChange={setObjectPropsOpen}
        object={selectedObjectData ?? null}
        onSave={saveObjectProperties}
      />
      <UnitsSetup open={unitsOpen} onOpenChange={setUnitsOpen} onApply={setUnits} />
      <GridAndSnapSettings open={snapSettingsOpen} onOpenChange={setSnapSettingsOpen} onApply={setSnapCfg} />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />

      {/* Full multi-tab Preferences panel (General, Files, Viewports, Gamma,
          Rendering, Animation, IK, Gizmos, MAXScript). Persists to localStorage
          and mirrors runtime bridges via `window.__prefs`. */}
      <PreferencesDialog open={preferencesOpen} onClose={() => setPreferencesOpen(false)} />
      <MapToolsPanel open={mapToolsOpen} onClose={() => setMapToolsOpen(false)} />
      <WaltSculptPanel open={waltSculptOpen} onClose={() => setWaltSculptOpen(false)} />
      <WaltSculptController />

      {/* Customize UI — keyboard shortcut editor, color scheme picker, and
          scheme import/export. Live bindings feed the global hotkey listener
          registered below. */}
      <CustomizeUIDialog open={customizeUIOpen} onClose={() => setCustomizeUIOpen(false)} />

      {/* MAXScript Listener — minimal REPL. Evaluates JS in the app scope so
          scripts can drive the exposed window.* bridges (dispatch events,
          create objects). No sandboxing, mirrors 3ds Max Listener spirit. */}
      <R3Dialog open={maxScriptOpen} onClose={() => setMaxScriptOpen(false)} title="MAXScript Listener" width={520}>
        <div className="p-2 text-[11px] font-mono">
          <div className="h-40 overflow-auto bg-black text-green-300 p-2 whitespace-pre-wrap">
            {maxScriptLog.join('\n')}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const input = (e.currentTarget.elements.namedItem('cmd') as HTMLInputElement);
              const cmd = input.value.trim();
              if (!cmd) return;
              let out = '';
              try {
                // eslint-disable-next-line no-new-func
                const r = new Function('return (' + cmd + ')')();
                out = String(r === undefined ? 'ok' : r);
              } catch (err: any) {
                out = 'error: ' + (err?.message || String(err));
              }
              setMaxScriptLog((l) => [...l, '> ' + cmd, out]);
              input.value = '';
            }}
            className="mt-1 flex gap-1"
          >
            <span className="text-win-text">&gt;</span>
            <input name="cmd" autoFocus className="flex-1 bg-white text-black px-1 outline-none border border-win-shadow" placeholder="e.g. window.dispatchEvent(new CustomEvent('r3-spawn-biped',{detail:{origin:[0,0,0]}}))" />
          </form>
        </div>
      </R3Dialog>

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={() => { confirmState.onOk(); setConfirmState((s) => ({ ...s, open: false })); }}
        onCancel={() => setConfirmState((s) => ({ ...s, open: false }))}
      />

      <SelectByNameDialog
        open={selectByNameOpen}
        onOpenChange={setSelectByNameOpen}
        objects={objects}
        selectedId={selectedObject}
        onSelect={setSelectedObject}
      />
      <MirrorDialog open={mirrorOpen} onOpenChange={setMirrorOpen} onApply={applyMirror} />
      <ArrayDialog open={arrayOpen} onOpenChange={setArrayOpen} onApply={applyArray} />
      <AlignDialog
        open={alignOpen}
        onOpenChange={setAlignOpen}
        targetName={objects.find((o) => o.id !== selectedObject && !o.isGroup)?.name}
        onApply={applyAlign}
      />

      {/* Scene Hierarchy — floating window (opened from the "List" button) */}
      <R3Dialog
        open={hierarchyWindowOpen}
        onClose={() => setHierarchyWindowOpen(false)}
        title="Scene Hierarchy"
        width={320}
      >
        <div style={{ height: 420 }}>
          <SceneHierarchy
            objects={objects}
            selectedObject={selectedObject}
            selectedObjectIds={selectedObjectIds}
            selectedSubUuid={selectedSubUuid}
            onSelectObject={(id, additive, remove) => { handleSelectObject(id, additive, remove); setSelectedSubUuid(null); }}
            onSelectSubObject={(_id, uuid) => setSelectedSubUuid(uuid)}
            onDeleteObject={deleteObject}
            onDuplicateObject={duplicateObject}
            onToggleVisibility={toggleVisibility}
            onToggleLock={toggleLock}
            onRenameObject={renameObject}
          />
        </div>
      </R3Dialog>

      {/* Object Library — floating window (opened from the toolbar button) */}
      <R3Dialog
        open={libraryWindowOpen}
        onClose={() => setLibraryWindowOpen(false)}
        title="Object Library"
        width={360}
      >
        <div style={{ height: 480 }}>
          <ObjectLibrary onImportUrl={(u, f) => importFromUrl(u, f)} />
        </div>
      </R3Dialog>

      {/* Transform Type-In (F12-style) — top-left, opens with Move/Rotate/Scale */}
      <TransformTypeInDialog
        open={typeInOpen && !!selectedObjectData}
        onClose={() => setTypeInOpen(false)}
        mode={transformMode}
        object={selectedObjectData ? {
          id: selectedObjectData.id,
          name: selectedObjectData.name,
          position: selectedObjectData.position,
          rotation: selectedObjectData.rotation,
          scale: selectedObjectData.scale,
        } : null}
        onCommit={(id, t) => handleTransformObject(id, t)}
      />
    </div>
    </CreationProvider>
    </RenderEngineProvider>
    </EnvironmentProvider>
  );
};

// Bridges the SidePanel's "arm tool" action to the CreationContext so the
// button clicks in the Create rollout hand off to the viewport click-drag flow.
const ArmedSidePanel = (props: React.ComponentProps<typeof SidePanel>) => {
  const { arm, disarm, armed } = useCreation();
  return (
    <SidePanel
      {...props}
      armedTool={armed}
      onArmTool={(t: string) => {
        if (armed === (t as any)) disarm();
        else arm(t as any);
      }}
    />
  );
};

