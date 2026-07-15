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
  setFrame: (frame: number) => void;
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
    from, to, step, width, height, fps, format, engine, setFrame, resolveCameraPose, onProgress, onFramePreview,
  } = opts;

  const handle = getViewportHandle('perspective') ?? getViewportHandle();
  if (!handle) throw new Error('No active viewport to render');
  const { scene, camera: viewCamera } = handle;
  const preset = ENGINES[engine];

  // Production sequence render: each timeline frame is rendered as an isolated
  // high-quality still with the SAME path used by Quick Render (dedicated
  // antialiased WebGLRenderer, production tone mapping / exposure, soft
  // shadows, helper cleanup). The still is then drawn into the encoder canvas;
  // after all requested frames are rendered, MediaRecorder compacts them into
  // the chosen video container.
  const SS = 2;
  const ssW = width * SS;
  const ssH = height * SS;

  const offscreen = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  offscreen.setPixelRatio(1);
  offscreen.setSize(ssW, ssH, false);
  offscreen.toneMapping = preset.toneMapping;
  offscreen.toneMappingExposure = preset.exposure;
  offscreen.outputColorSpace = THREE.SRGBColorSpace;
  offscreen.shadowMap.enabled = true;
  offscreen.shadowMap.type = THREE.PCFSoftShadowMap;
  if (scene.background instanceof THREE.Color) offscreen.setClearColor(scene.background, 1);

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

  // Editor-only overlays (helpers, gizmos, selection wires, camera/light
  // indicator geometry) are re-created by React every time `setFrame()`
  // commits, so we CANNOT hide them once and be done — the references go
  // stale and fresh overlays appear in later frames. Instead we hide them
  // right before each offscreen.render() and restore them right after.
  const hasHelperAncestor = (obj: THREE.Object3D): boolean => {
    let cur: THREE.Object3D | null = obj.parent;
    while (cur) {
      const ud: any = cur.userData || {};
      if (ud.__helper || ud.__selectionWire) return true;
      cur = cur.parent;
    }
    return false;
  };

  const isHelperMaterial = (mat: any): boolean => {
    // Editor icons (light/camera indicators, trajectory dots) all use
    // MeshBasicMaterial — no production mesh in the scene uses it.
    if (!mat) return false;
    const check = (m: any) => m && (m.isMeshBasicMaterial || m.type === 'MeshBasicMaterial');
    if (Array.isArray(mat)) return mat.some(check);
    return check(mat);
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
      // Match Quick Render's rules: hide ONLY things explicitly marked as
      // editor overlays (grid, gizmos, selection wires, helper icons, camera
      // frustums, light indicators, trajectory paths). Do NOT hide by
      // "isLine/isSprite/MeshBasicMaterial" heuristics — those can catch
      // user-created line/sprite objects, and hiding descendants of any group
      // upstream can leak into lit meshes, producing the "no lights / no
      // shadows" look reported by users.
      const hidden_by_marker =
        ud.__helper || ud.__selectionWire || isHelper || isTC;
      if (hidden_by_marker) {
        if (obj.visible) { hidden.push(obj); obj.visible = false; }
      }
    });
    return hidden;
  };



  // Meshes + lights only need their shadow flags forced once; the underlying
  // Three.js objects survive across React re-renders even when their wrappers
  // don't.
  const meshTouched: { mesh: THREE.Mesh; cast: boolean; receive: boolean }[] = [];
  scene.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const m = obj as THREE.Mesh;
      meshTouched.push({ mesh: m, cast: m.castShadow, receive: m.receiveShadow });
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  const lightTouched: {
    light: any;
    cast: boolean;
    mapW?: number;
    mapH?: number;
    bias?: number;
    normalBias?: number;
  }[] = [];
  scene.traverse((obj) => {
    const l = obj as any;
    if (l.isDirectionalLight || l.isSpotLight || l.isPointLight) {
      const touched: { light: any; cast: boolean; mapW?: number; mapH?: number; bias?: number; normalBias?: number } = {
        light: l,
        cast: l.castShadow,
      };
      if (l.shadow) {
        touched.mapW = l.shadow.mapSize.width;
        touched.mapH = l.shadow.mapSize.height;
        touched.bias = l.shadow.bias;
        touched.normalBias = l.shadow.normalBias;
        l.shadow.mapSize.set(2048, 2048);
        l.shadow.bias = -0.00035;
        l.shadow.normalBias = 0.015;
      }
      lightTouched.push(touched);
      l.castShadow = true;
    }
  });


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

  try {
    let idx = 0;
    for (let f = from; f <= to; f += step) {
      setFrame(f);
      // Two rAFs so React state commit + Object3D refs update.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      let renderTarget: THREE.Camera = viewCamera;
      if (resolveCameraPose) {
        const pose = resolveCameraPose(f);
        if (pose) { applyPose(pose); renderTarget = renderCam; }
      }

      // Hide editor overlays freshly right before the render so any helpers
      // React just re-mounted for this frame are also hidden, then restore
      // immediately so the viewport stays fully usable between frames.
      const hiddenForFrame = hideEditorOverlays();
      try {
        offscreen.render(scene, renderTarget);
      } finally {
        hiddenForFrame.forEach((o) => { o.visible = true; });
      }
      ctx.save();
      ctx.filter = preset.cssFilter || 'none';
      ctx.drawImage(offscreen.domElement, 0, 0, ssW, ssH, 0, 0, width, height);
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

    recorder.start();
    for (const frame of renderedFrames) {
      const bitmap = await createImageBitmap(frame);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      if (typeof track.requestFrame === 'function') track.requestFrame();
      await new Promise((r) => setTimeout(r, targetDelayMs));
    }
    // Flush the last frame.
    await new Promise((r) => setTimeout(r, 250));
    if (recorder.state !== 'inactive') recorder.stop();
    const blob = await stopped;
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

    offscreen.dispose();
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
