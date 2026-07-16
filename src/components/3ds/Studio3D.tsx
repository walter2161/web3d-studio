import { useState, useRef, useCallback, useEffect } from 'react';
import { MenuBar } from './MenuBar';
import { ViewportGrid, ViewportLayout } from './ViewportGrid';
import { SidePanel } from './SidePanel';
import { AnimationTimeline, Keyframe, AnimationTrack } from './AnimationTimeline';
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
  const [selectedSubUuid, setSelectedSubUuid] = useState<string | null>(null);

  const [activeViewport, setActiveViewport] = useState<'perspective' | 'top' | 'front' | 'left'>('perspective');
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [currentFrame, setCurrentFrame] = useState(initial?.currentFrame ?? 0);
  const [timelineVisible, setTimelineVisible] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoKey, setAutoKey] = useState(false);
  const [loopPlayback, setLoopPlayback] = useState(false);
  const [viewportLayout, setViewportLayout] = useState<ViewportLayout>('single');
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
  const [objectPropsOpen, setObjectPropsOpen] = useState(false);
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [snapSettingsOpen, setSnapSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
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
  const [animationTracks, setAnimationTracks] = useState<AnimationTrack[]>(initial?.animationTracks || []);
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
    setRedoStack([]);
  }, [objects]);

  const createObject = useCallback((type: string) => {
    const standard = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'plane'];
    const extended = ['hedra', 'chamferBox', 'chamferCyl', 'oilTank', 'spindle', 'gengon', 'torusKnot', 'ringWave', 'prism'];
    const shapes = ['line', 'rectangle', 'circle', 'ellipse', 'arc', 'donut', 'ngon', 'star', 'helix'];
    const aec = ['wall', 'door', 'window'];
    const lightTypes = ['light_omni', 'light_spot', 'light_spot_free', 'light_direct', 'light_direct_free', 'light_skylight', 'light_ambient'];
    const camTypes   = ['camera_target', 'camera_free'];

    const helperTools = ['helper_point', 'helper_dummy', 'helper_tape', 'helper_grid', 'helper_compass'];
    if (type === 'sys_print_bed') {
      saveState();
      const { DEFAULT_PRINTER_ID } = require('./print3d/printers');
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
      const { HELPER_DEFAULTS } = require('./utils/helpers');
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
      const { DEFAULT_PRINTER_ID } = require('./print3d/printers');
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
    const newModifier: Modifier = {
      id: `${modifierType}_${Date.now()}`,
      type: modifierType,
      params: defaultParams[modifierType] || {},
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
    saveState();
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
  }, [saveState]);

  // Sub-object picking & op dispatch from viewport / modifier panel.
  useEffect(() => {
    const onPick = (ev: Event) => {
      const d = (ev as CustomEvent).detail as {
        objectId: string; modifierId: string; level: string;
        id: number; additive?: boolean; remove?: boolean;
      };
      if (objectsRef.current.some((obj) => obj.id === d.objectId && (obj.modifiers ?? []).some((m: any) => m.id === d.modifierId))) {
        setUndoStack((stack) => [...stack.slice(-9), objectsRef.current]);
        setRedoStack([]);
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
        setRedoStack([]);
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
    window.addEventListener('r3-subobj-select', onPick as any);
    window.addEventListener('r3-subobj-op', onOp as any);
    return () => {
      window.removeEventListener('r3-subobj-select', onPick as any);
      window.removeEventListener('r3-subobj-op', onOp as any);
    };
  }, []);


  const removeModifier = useCallback((objectId: string, modifierId: string) => {
    saveState();
    setObjects(prev => prev.map(obj => 
      obj.id === objectId 
        ? { 
            ...obj, 
            modifiers: obj.modifiers?.filter(mod => mod.id !== modifierId) || []
          }
        : obj
    ));
    
    toast.success('Modifier removed');
  }, [saveState]);

  const toggleModifier = useCallback((objectId: string, modifierId: string) => {
    saveState();
    setObjects(prev => prev.map(obj =>
      obj.id === objectId
        ? {
            ...obj,
            modifiers: obj.modifiers?.map(m =>
              m.id === modifierId ? { ...m, active: !m.active } : m
            ) || [],
          }
        : obj
    ));
  }, [saveState]);

  const reorderModifier = useCallback((objectId: string, modifierId: string, direction: -1 | 1) => {
    saveState();
    setObjects(prev => prev.map(obj => {
      if (obj.id !== objectId || !obj.modifiers) return obj;
      const mods = [...obj.modifiers];
      const idx = mods.findIndex(m => m.id === modifierId);
      if (idx < 0) return obj;
      const swap = idx + direction;
      if (swap < 0 || swap >= mods.length) return obj;
      [mods[idx], mods[swap]] = [mods[swap], mods[idx]];
      return { ...obj, modifiers: mods };
    }));
  }, [saveState]);




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

  const handleSelectObject = useCallback((id: string | null) => {
    // If a compound Boolean is waiting for Operand B, consume the click.
    if (id && compoundState.picking && compoundState.tool && selectedObject && id !== selectedObject) {
      performBoolean(id);
      return;
    }
    setSelectedObject(id);
  }, [compoundState.picking, compoundState.tool, selectedObject, performBoolean]);


  const handleTransformObject = useCallback((id: string, transform: any) => {
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
    if (selectedObject && idsToDelete.has(selectedObject)) setSelectedObject(null);
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
      setUndoStack(prev => [...prev.slice(-9), [...objects]]);
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
    const nameLc = file.name.toLowerCase();

    // DWG is proprietary Autodesk binary — cannot parse in-browser. Ask the
    // user to convert to DXF (any free CAD tool does this).
    if (nameLc.endsWith('.dwg')) {
      toast.error('DWG não é suportado diretamente. Converta para DXF (LibreCAD, ODA File Converter ou o conversor online da Autodesk) e importe o .dxf.', { duration: 8000 });
      return;
    }

    // DXF → creates parametric Wall objects from LINE / POLYLINE entities.
    if (nameLc.endsWith('.dxf')) {
      const loadingId = toast.loading(`Parsing ${file.name}...`);
      try {
        const { parseDxfFile } = await import('./utils/dxfImport');
        const result = await parseDxfFile(file);
        if (result.walls.length === 0) {
          toast.dismiss(loadingId);
          toast.error('Nenhuma LINE / POLYLINE encontrada no DXF.');
          return;
        }
        saveState();
        const now = Date.now();
        const newObjs: Object3DData[] = result.walls.map((w, i) => ({
          id: `wall_dxf_${now}_${i}`,
          name: (w.layer ? `${w.layer}_` : 'DXF_') + `wall${i + 1}`,
          type: 'wall' as any,
          position: w.position,
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          color: '#c9bfae',
          visible: true,
          locked: false,
          modifiers: [],
          geometry: {
            path: w.path,
            width: 0.2,
            height: 2.7,
            justification: 'center',
            closed: w.closed,
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
          `DXF importado: ${result.walls.length} parede(s), ${bx.toFixed(1)}×${by.toFixed(1)}m (units: ${result.units}).${ignoredNote}`,
          { duration: 7000 },
        );
      } catch (err: any) {
        toast.dismiss(loadingId);
        console.error('DXF import failed:', err);
        toast.error(`DXF falhou: ${err?.message || 'unknown error'}`);
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
      case 'Explode': doExplode(); break;
      case 'Units Setup...': setUnitsOpen(true); break;
      case 'Grid and Snap Settings...': setSnapSettingsOpen(true); break;
      case 'Welcome...': setWelcomeOpen(true); break;
      case 'About 3De...': setAboutOpen(true); break;
      default: break;
    }
  };

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
          <span>{currentCloudScene ? `${currentCloudScene.name} - 3De` : 'Untitled - 3De'}</span>
          <span className="ml-3 font-normal opacity-90">
            {user ? `● ${user.email}${isAdmin ? ' (admin)' : ''}` : '○ not logged in'}
          </span>
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
              selectedSubUuid={selectedSubUuid}
              onSelectObject={(id) => { handleSelectObject(id); if (id === null) setSelectedSubUuid(null); }}
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
          />



        </div>
      </div>

      {/* Trackbar (Animation timeline) — hidden by default */}
      {timelineVisible && (
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
        />
      )}

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

