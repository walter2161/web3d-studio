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
  /** Total timeline length (frames). Used to sync imported-model
   *  AnimationMixers (GLB/FBX skeletal animation) to the frame being
   *  rendered — without this, imported characters render frozen. */
  totalFrames?: number;
  /**
   * Resolves the camera pose to use for a given frame AFTER setFrame(frame)
   * has been applied and React has committed. Return null to fall back to
   * the current viewport camera (orbit view).
   */
  resolveCameraPose?: (frame: number) => CameraPose | null;
  onProgress?: (done: number, total: number) => void;
  /** Called with a data URL preview of each just-rendered frame so the UI
   *  can show frame-by-frame progress while the sequence runs. */
  onFramePreview?: (dataUrl: string, frame: number, index: number, total: number) => void;
  /** Optional abort signal. When aborted mid-render, the sequence stops
   *  cleanly and renderAnimation rejects with a DOMException('AbortError'). */
  signal?: AbortSignal;
}

export class RenderCancelledError extends Error {
  constructor() { super('Render cancelled'); this.name = 'RenderCancelledError'; }
}

/**
 * Renders a range of animation frames offscreen and encodes them into a
 * downloadable video (WebM/MP4) using MediaRecorder. Steps the shared
 * timeline frame so every keyframed track updates naturally between renders.
 * If `resolveCameraPose` is provided, a dedicated render camera is posed each
 * frame so scene-camera animations (target/free) are captured in the video.
 */
export async function renderAnimation(opts: AnimationRenderOptions): Promise<Blob> {
  const {
    from, to, step, width, height, fps, format, engine, setFrame, totalFrames, resolveCameraPose, onProgress, onFramePreview, signal,
  } = opts;
  const throwIfAborted = () => { if (signal?.aborted) throw new RenderCancelledError(); };
  const totalTimeline = totalFrames ?? Math.max(1, to);

  // Walk the scene and pump every registered imported-model mixer so GLB/FBX
  // skeletal animation matches the frame being rendered.
  const syncImportedMixers = (frame: number) => {
    const handle = getViewportHandle('perspective') ?? getViewportHandle();
    if (!handle) return;
    handle.scene.traverse((obj) => {
      const fn = (obj as any).userData?.__syncClipTime;
      if (typeof fn === 'function') fn(frame, totalTimeline);
    });
    handle.scene.updateMatrixWorld(true);
  };

  const handle = getViewportHandle('perspective') ?? getViewportHandle();
  if (!handle) throw new Error('No active viewport to render');
  const { scene, camera: viewCamera, gl } = handle;
  const preset = ENGINES[engine];

  // Render each animation frame using the SAME WebGLRenderer that drives the
  // live viewport. This keeps shadow maps, PMREM environment maps, textures
  // and every GPU-side resource intact — a fresh offscreen renderer would
  // lose all of that and produce flat / unlit frames.
  //
  // IMPORTANT: do NOT force castShadow/receiveShadow on every mesh and light.
  // Doing so overrides what the scene was intentionally set up with, and lights
  // that never had their shadow cameras configured end up producing black or
  // acne-covered shadow passes, which is why videos looked completely unlit
  // compared to the live viewport. We render EXACTLY what the viewport shows.
  const SS = 2;
  const ssW = width * SS;
  const ssH = height * SS;

  // Save current renderer state so we can restore the viewport exactly after
  // the sequence is done.
  const prevSize = new THREE.Vector2();
  gl.getSize(prevSize);
  const prevPixelRatio = gl.getPixelRatio();
  const prevToneMapping = gl.toneMapping;
  const prevExposure = gl.toneMappingExposure;
  const prevShadowsEnabled = gl.shadowMap.enabled;
  const prevShadowType = gl.shadowMap.type;
  const prevAutoUpdate = gl.shadowMap.autoUpdate;
  const prevAutoClear = gl.autoClear;
  const prevScissorTest = gl.getScissorTest();
  const prevRT = gl.getRenderTarget();

  gl.setPixelRatio(1);
  gl.setSize(ssW, ssH, false);
  gl.toneMapping = preset.toneMapping;
  gl.toneMappingExposure = preset.exposure;
  // Keep whatever shadow map type the viewport is using; just make sure the
  // shadow pipeline stays enabled and refreshes each frame so animated
  // objects/lights get the correct cast+receive result.
  gl.shadowMap.enabled = true;
  gl.shadowMap.autoUpdate = true;
  gl.shadowMap.type = prevShadowType || THREE.PCFSoftShadowMap;
  gl.shadowMap.needsUpdate = true;

  // Recording canvas at the requested output resolution.
  const recCanvas = document.createElement('canvas');
  recCanvas.width = width;
  recCanvas.height = height;
  const ctx = recCanvas.getContext('2d', { alpha: false })!;
  (ctx as any).imageSmoothingEnabled = true;
  (ctx as any).imageSmoothingQuality = 'high';

  // Dedicated render camera when a scene camera is chosen so we don't fight
  // OrbitControls or R3F over the viewport camera.
  const renderCam = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);

  // Hide editor-only overlays (helpers, gizmos, selection wires, camera/light
  // indicator geometry) right before each render and restore right after.
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
      const hidden_by_marker =
        ud.__helper || ud.__selectionWire || isHelper || isTC;
      if (hidden_by_marker) {
        if (obj.visible) { hidden.push(obj); obj.visible = false; }
      }
    });
    return hidden;
  };

  const bitRate = Math.max(16_000_000, Math.min(60_000_000, Math.floor(width * height * Math.max(1, fps) * 0.8)));
  const frameCount = Math.max(1, Math.floor((to - from) / Math.max(1, step)) + 1);
  const targetDelayMs = 1000 / Math.max(1, fps);
  const renderedFrames: Blob[] = [];
  let encodeStream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;


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

  const waitForSceneCommit = () => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });

  // Force the live viewport camera's aspect to match the requested output so
  // the recorded frame fills the full canvas — otherwise scenes whose viewport
  // aspect differs from the chosen resolution render with black side bars.
  const viewPersp = viewCamera as THREE.PerspectiveCamera;
  const prevViewAspect = viewPersp.aspect;
  if ((viewPersp as any).isPerspectiveCamera) {
    viewPersp.aspect = width / height;
    viewPersp.updateProjectionMatrix();
  }

  try {
    let idx = 0;
    for (let f = from; f <= to; f += step) {
      throwIfAborted();
      await setFrame(f);
      // Wait for the timeline state, animated object transforms, R3F scene refs,
      // mixers, lights, and camera view controllers to commit before capturing.
      await waitForSceneCommit();

      let renderTarget: THREE.Camera = viewCamera;
      if (resolveCameraPose) {
        const pose = resolveCameraPose(f);
        if (pose) { applyPose(pose); renderTarget = renderCam; }
      }

      // Hide editor overlays freshly right before the render so any helpers
      // React just re-mounted for this frame are also hidden, then restore
      // immediately so the viewport stays fully usable between frames.
      // Advance imported-model AnimationMixers to this exact frame so
      // GLB/FBX skeletal animation isn't frozen in the render.
      syncImportedMixers(f);
      const hiddenForFrame = hideEditorOverlays();
      try {
        gl.setRenderTarget(null);
        // Force shadow maps to refresh every frame so animated objects and
        // lights get correct shadows on subsequent renders (three.js reuses
        // cached shadow maps otherwise, leading to missing/stale shadows).
        gl.shadowMap.needsUpdate = true;
        gl.render(scene, renderTarget);
      } finally {
        hiddenForFrame.forEach((o) => { o.visible = true; });
      }
      ctx.save();
      ctx.filter = preset.cssFilter || 'none';
      ctx.drawImage(gl.domElement, 0, 0, ssW, ssH, 0, 0, width, height);
      ctx.restore();


      // Store the rendered still as a separate PNG frame in memory. Encoding
      // happens only after every requested animation frame has been rendered,
      // matching a real image-sequence flow without keeping huge decoded
      // bitmaps alive for the whole render.
      renderedFrames.push(await new Promise<Blob>((resolve, reject) => {
        recCanvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to capture rendered frame'));
        }, 'image/png');
      }));
      idx++;
      // Emit a JPEG data URL preview (smaller than PNG) so the UI can show
      // the frame-by-frame progress while the sequence renders.
      if (onFramePreview) {
        try {
          const dataUrl = recCanvas.toDataURL('image/jpeg', 0.7);
          onFramePreview(dataUrl, f, idx, frameCount);
        } catch { /* ignore preview failures */ }
      }
      onProgress?.(idx, frameCount);
      // Yield to the browser so React can repaint the progress UI between
      // frames — without this, the main thread stays busy and the modal
      // appears frozen until the whole sequence finishes.
      await new Promise((r) => setTimeout(r, 0));
      throwIfAborted();
    }

    encodeStream = (recCanvas as HTMLCanvasElement).captureStream(0);
    let track = encodeStream.getVideoTracks()[0] as any;
    if (typeof track.requestFrame !== 'function') {
      track.stop();
      encodeStream = (recCanvas as HTMLCanvasElement).captureStream(Math.max(1, fps));
      track = encodeStream.getVideoTracks()[0] as any;
    }

    const mimeCandidates =
      format === 'mp4'
        ? ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
        : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';

    recorder = new MediaRecorder(
      encodeStream,
      mime
        ? { mimeType: mime, videoBitsPerSecond: bitRate }
        : { videoBitsPerSecond: bitRate },
    );
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise<Blob>((resolve) => {
      recorder!.onstop = () => resolve(new Blob(chunks, { type: recorder?.mimeType || 'video/webm' }));
    });

    // Request data chunks every 100ms so large-resolution encodes (1280x1024+)
    // actually accumulate data rather than dumping a single huge chunk that
    // some browsers drop when the recorder is stopped abruptly.
    recorder.start(100);
    for (const frame of renderedFrames) {
      throwIfAborted();
      const bitmap = await createImageBitmap(frame);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      if (typeof track.requestFrame === 'function') track.requestFrame();
      await new Promise((r) => setTimeout(r, targetDelayMs));
    }
    // Flush the last frame — larger canvases need more time for the encoder
    // to drain before we stop it, otherwise the final blob comes back empty.
    await new Promise((r) => setTimeout(r, 500));
    if (typeof (recorder as any).requestData === 'function') {
      try { (recorder as any).requestData(); } catch { /* ignore */ }
    }
    if (recorder.state !== 'inactive') recorder.stop();
    const blob = await stopped;
    if (!blob || blob.size === 0) {
      throw new Error('Encoder produced empty video — try a smaller resolution or WebM format');
    }
    return blob;
  } finally {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    encodeStream?.getTracks().forEach((track) => track.stop());
    renderedFrames.length = 0;

    // Restore scene state.
    meshTouched.forEach(({ mesh, cast, receive }) => {

      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
    });
    lightTouched.forEach(({ light, cast }) => {
      light.castShadow = cast;
    });
    lightTouched.forEach(({ light, mapW, mapH, bias, normalBias }) => {
      if (!light.shadow) return;
      if (typeof mapW === 'number' && typeof mapH === 'number') light.shadow.mapSize.set(mapW, mapH);
      if (typeof bias === 'number') light.shadow.bias = bias;
      if (typeof normalBias === 'number') light.shadow.normalBias = normalBias;
    });

    // Restore the live viewport renderer to its previous state so the editor
    // resumes exactly as it was before the sequence.
    try {
      gl.setRenderTarget(prevRT);
      gl.setScissorTest(prevScissorTest);
      gl.autoClear = prevAutoClear;
      gl.shadowMap.enabled = prevShadowsEnabled;
      gl.shadowMap.type = prevShadowType;
      gl.toneMapping = prevToneMapping;
      gl.toneMappingExposure = prevExposure;
      gl.setPixelRatio(prevPixelRatio);
      gl.setSize(prevSize.x, prevSize.y, false);
    } catch { /* ignore restore errors */ }
    if ((viewPersp as any).isPerspectiveCamera) {
      viewPersp.aspect = prevViewAspect;
      viewPersp.updateProjectionMatrix();
    }
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
  return `animation-${Date.now()}.${ext}`;
}
