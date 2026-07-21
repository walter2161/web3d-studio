import * as THREE from 'three';
import { getViewportHandle } from '../r3/viewportRegistry';
import { ENGINES, RenderEngine } from '../r3/RenderEngineContext';

export type VideoFormat = 'mp4' | 'webm' | 'webp';

export interface CameraPose {
  position: [number, number, number];
  rotation?: [number, number, number];
  target?: [number, number, number];
  fov?: number;
  near?: number;
  far?: number;
}

/** 3ds Max style pipeline phase, emitted for every frame. */
export type FramePhase =
  | 'evaluate'    // Evaluate scene (timeline / controllers / modifiers)
  | 'bones'       // Update bones / skin
  | 'particles'   // Update particles / dynamics
  | 'geometry'    // Build final geometry
  | 'lights'      // Update lights
  | 'shadows'     // Shadow map pass
  | 'gi'          // Global Illumination
  | 'reflections' // Reflections / refractions
  | 'aa'          // Anti-aliasing / beauty pass
  | 'save';       // Save frame to buffer

export const FRAME_PHASES: { key: FramePhase; label: string }[] = [
  { key: 'evaluate',    label: 'Evaluate Scene' },
  { key: 'bones',       label: 'Update Bones / Skin' },
  { key: 'particles',   label: 'Update Particles' },
  { key: 'geometry',    label: 'Build Geometry' },
  { key: 'lights',      label: 'Update Lights' },
  { key: 'shadows',     label: 'Shadow Maps' },
  { key: 'gi',          label: 'Global Illumination' },
  { key: 'reflections', label: 'Reflections / Refractions' },
  { key: 'aa',          label: 'Anti-Aliasing / Beauty Pass' },
  { key: 'save',        label: 'Save Frame Buffer' },
];

export interface AnimationRenderOptions {
  from: number;
  to: number;
  step: number;
  width: number;
  height: number;
  fps: number;
  format: VideoFormat;
  engine: RenderEngine;
  setFrame: (frame: number) => void | Promise<void>;
  totalFrames?: number;
  resolveCameraPose?: (frame: number) => CameraPose | null;
  onProgress?: (done: number, total: number) => void;
  onFramePreview?: (dataUrl: string, frame: number, index: number, total: number) => void;
  /** Emits the current pipeline phase for the frame being processed. */
  onPhase?: (phase: FramePhase, frame: number, index: number, total: number) => void;
  signal?: AbortSignal;
}

export class RenderCancelledError extends Error {
  constructor() { super('Render cancelled'); this.name = 'RenderCancelledError'; }
}

// ----------------------------------------------------------------------------
// Sequence renderer — v2 rewrite.
//
// Why a full rewrite: the previous version resized the LIVE viewport
// WebGLRenderer to the output resolution and rendered into it. Because R3F's
// render loop keeps firing on every RAF, it would grab the renderer back
// between our warmup and beauty passes, call `setSize` back to the viewport
// canvas, and re-render with the viewport camera — invalidating our shadow
// maps for that frame. Result: videos with flat/missing shadows and no
// visible lighting even though the viewport looked correct.
//
// v2 uses a completely dedicated offscreen `WebGLRenderer` at the exact
// output resolution. It shares the SAME `THREE.Scene` graph as the viewport
// (textures re-upload on first use — cheap, one-time) but nothing R3F does
// can touch it. Every frame gets:
//   1. Timeline set (React commit + RAF settling)
//   2. Skeletal mixers synced (imported GLB/FBX)
//   3. Every light forced to `shadow.needsUpdate = true`
//   4. Two full renders (warmup + beauty) so shadow programs compile before
//      the pixels that end up in the video are captured
//   5. Canvas → PNG blob stored in memory
// After the last frame, the PNG sequence is fed into a MediaRecorder at the
// requested fps to produce the final MP4/WebM.
// ----------------------------------------------------------------------------

export async function renderAnimation(opts: AnimationRenderOptions): Promise<Blob> {
  const {
    from, to, step, width, height, fps, format, engine,
    setFrame, totalFrames, resolveCameraPose,
    onProgress, onFramePreview, onPhase, signal,
  } = opts;

  const throwIfAborted = () => { if (signal?.aborted) throw new RenderCancelledError(); };
  const totalTimeline = totalFrames ?? Math.max(1, to);

  const viewHandle = getViewportHandle('perspective') ?? getViewportHandle();
  if (!viewHandle) throw new Error('No active viewport to render');
  const scene = viewHandle.scene;
  const viewCamera = viewHandle.camera;
  const preset = ENGINES[engine];

  // ---- Offscreen renderer at the exact output resolution ------------------
  const offCanvas = document.createElement('canvas');
  offCanvas.width = width;
  offCanvas.height = height;
  const renderer = new THREE.WebGLRenderer({
    canvas: offCanvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = preset.toneMapping;
  renderer.toneMappingExposure = preset.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(new THREE.Color(0x000000), 1);
  // Copy any environment map / background from the live scene so the
  // offscreen renderer produces the same look as the viewport.
  const savedBg = scene.background;
  const savedEnv = scene.environment;

  // Dedicated camera used when the user picked a scene camera.
  const renderCam = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);

  const applyPose = (pose: CameraPose) => {
    renderCam.position.set(pose.position[0], pose.position[1], pose.position[2]);
    if (pose.target) {
      renderCam.up.set(0, 1, 0);
      renderCam.lookAt(pose.target[0], pose.target[1], pose.target[2]);
    } else if (pose.rotation) {
      renderCam.rotation.set(pose.rotation[0], pose.rotation[1], pose.rotation[2]);
    }
    renderCam.fov = pose.fov ?? 45;
    renderCam.near = pose.near ?? 0.1;
    renderCam.far = pose.far ?? 1000;
    renderCam.aspect = width / height;
    renderCam.updateProjectionMatrix();
    renderCam.updateMatrixWorld(true);
  };

  const syncImportedMixers = (frame: number) => {
    scene.traverse((obj) => {
      const fn = (obj as any).userData?.__syncClipTime;
      if (typeof fn === 'function') fn(frame, totalTimeline);
    });
    scene.updateMatrixWorld(true);
  };

  const forceShadowUpdates = () => {
    scene.traverse((obj) => {
      const l = obj as THREE.Light & { shadow?: THREE.LightShadow };
      if ((l as any).isLight && l.shadow) l.shadow.needsUpdate = true;
    });
    renderer.shadowMap.needsUpdate = true;
  };

  const hideEditorOverlays = (): THREE.Object3D[] => {
    const hidden: THREE.Object3D[] = [];
    scene.traverse((obj) => {
      const ud: any = obj.userData || {};
      const t = obj.type || '';
      const isHelper =
        t === 'GridHelper' || t === 'AxesHelper' || t === 'BoxHelper' ||
        t === 'CameraHelper' || t === 'DirectionalLightHelper' || t === 'PointLightHelper' ||
        t === 'SpotLightHelper' || t === 'PolarGridHelper' || t === 'HemisphereLightHelper' ||
        t.endsWith('Helper');
      const isTC = t === 'TransformControls' || (obj as any).isTransformControls;
      if (ud.__helper || ud.__selectionWire || isHelper || isTC) {
        if (obj.visible) { hidden.push(obj); obj.visible = false; }
      }
    });
    return hidden;
  };

  const waitForSceneCommit = () => new Promise<void>((resolve) => {
    // React commit + R3F ref sync + OrbitControls damping + mixer advance.
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => setTimeout(() => resolve(), 24)))));
  });

  const frameCount = Math.max(1, Math.floor((to - from) / Math.max(1, step)) + 1);
  const renderedFrames: Blob[] = [];

  try {
    let idx = 0;

    for (let f = from; f <= to; f += step) {
      throwIfAborted();

      // ---- Phase 1: Evaluate scene (advance timeline) ---------------------
      onPhase?.('evaluate', f, idx, frameCount);
      await setFrame(f);
      await waitForSceneCommit();

      // ---- Phase 2: Bones / skin ------------------------------------------
      onPhase?.('bones', f, idx, frameCount);
      syncImportedMixers(f);

      // ---- Phase 3: Particles / dynamics ---------------------------------
      onPhase?.('particles', f, idx, frameCount);
      // Particle stores tick on the frame counter directly — nothing extra.

      // ---- Phase 4: Geometry ---------------------------------------------
      onPhase?.('geometry', f, idx, frameCount);
      scene.updateMatrixWorld(true);

      // ---- Phase 5: Lights ------------------------------------------------
      onPhase?.('lights', f, idx, frameCount);

      // Pick camera for this frame.
      let renderTarget: THREE.Camera = viewCamera;
      if (resolveCameraPose) {
        const pose = resolveCameraPose(f);
        if (pose) { applyPose(pose); renderTarget = renderCam; }
      } else if ((viewCamera as any).isPerspectiveCamera) {
        // Force viewport camera aspect to output aspect for this render call.
        const vc = viewCamera as THREE.PerspectiveCamera;
        vc.aspect = width / height;
        vc.updateProjectionMatrix();
      }

      // ---- Phase 6: Shadow maps -------------------------------------------
      onPhase?.('shadows', f, idx, frameCount);
      forceShadowUpdates();
      // Warmup render — compiles programs, populates shadow maps.
      const hidden = hideEditorOverlays();
      renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, renderTarget);

      // ---- Phase 7: GI ----------------------------------------------------
      onPhase?.('gi', f, idx, frameCount);
      // Environment map already applied on offscreen scene; nothing to bake.
      await new Promise((r) => setTimeout(r, 12));

      // ---- Phase 8: Reflections ------------------------------------------
      onPhase?.('reflections', f, idx, frameCount);
      // Force one more shadow refresh so moving lights/objects between the
      // warmup and beauty passes still produce correct occlusion.
      forceShadowUpdates();

      // ---- Phase 9: AA / Beauty pass -------------------------------------
      onPhase?.('aa', f, idx, frameCount);
      renderer.render(scene, renderTarget);
      hidden.forEach((o) => { o.visible = true; });

      // ---- Phase 10: Save frame ------------------------------------------
      onPhase?.('save', f, idx, frameCount);
      const png = await new Promise<Blob>((resolve, reject) => {
        offCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Frame capture failed'))), 'image/png');
      });
      renderedFrames.push(png);
      idx++;

      if (onFramePreview) {
        try { onFramePreview(offCanvas.toDataURL('image/jpeg', 0.75), f, idx, frameCount); }
        catch { /* preview optional */ }
      }
      onProgress?.(idx, frameCount);

      // Yield to browser between frames.
      await new Promise((r) => setTimeout(r, 0));
      throwIfAborted();
    }

    // ---- Encode phase — PNG sequence → video ---------------------------
    const encCanvas = document.createElement('canvas');
    encCanvas.width = width;
    encCanvas.height = height;
    const ctx = encCanvas.getContext('2d', { alpha: false })!;
    ctx.imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = 'high';

    const bitRate = Math.max(16_000_000, Math.min(60_000_000, Math.floor(width * height * fps * 0.8)));
    const stream = (encCanvas as HTMLCanvasElement).captureStream(0);
    let track = stream.getVideoTracks()[0] as any;
    if (typeof track.requestFrame !== 'function') {
      track.stop();
      const s2 = (encCanvas as HTMLCanvasElement).captureStream(Math.max(1, fps));
      track = s2.getVideoTracks()[0] as any;
    }

    const mimeCandidates =
      format === 'mp4'
        ? ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
        : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const recorder = new MediaRecorder(
      stream,
      mime ? { mimeType: mime, videoBitsPerSecond: bitRate } : { videoBitsPerSecond: bitRate },
    );
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    const stopped = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
    });

    const targetDelay = 1000 / Math.max(1, fps);
    recorder.start(100);
    for (const png of renderedFrames) {
      throwIfAborted();
      const bmp = await createImageBitmap(png);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(bmp, 0, 0, width, height);
      bmp.close();
      if (typeof track.requestFrame === 'function') track.requestFrame();
      await new Promise((r) => setTimeout(r, targetDelay));
    }
    // Flush the encoder — some MediaRecorder impls drop the tail otherwise.
    await new Promise((r) => setTimeout(r, 500));
    if (typeof (recorder as any).requestData === 'function') {
      try { (recorder as any).requestData(); } catch { /* ignore */ }
    }
    if (recorder.state !== 'inactive') recorder.stop();
    const blob = await stopped;
    if (!blob || blob.size === 0) {
      throw new Error('Encoder produced empty video — try a smaller resolution or WebM');
    }
    return blob;
  } finally {
    // Restore live scene refs untouched (we only borrowed them).
    scene.background = savedBg;
    scene.environment = savedEnv;
    // Kill offscreen renderer — frees the GL context.
    try { renderer.dispose(); } catch { /* ignore */ }
    try { (renderer as any).forceContextLoss?.(); } catch { /* ignore */ }
    renderedFrames.length = 0;
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function suggestFilename(blob: Blob, requested: VideoFormat): string {
  const t = blob.type || '';
  let ext = 'webm';
  if (t.includes('mp4')) ext = 'mp4';
  else if (requested === 'webp') ext = 'webm';
  return `walt3d-render-${Date.now()}.${ext}`;
}
