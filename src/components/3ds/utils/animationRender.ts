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
    from, to, step, width, height, fps, format, engine, setFrame, resolveCameraPose, onProgress,
  } = opts;

  const handle = getViewportHandle('perspective') ?? getViewportHandle();
  if (!handle) throw new Error('No active viewport to render');
  const { scene, camera: viewCamera, gl } = handle;
  const preset = ENGINES[engine];

  // 2× supersampling: render into an offscreen render-target at double
  // resolution using the viewport's OWN WebGLRenderer, so all shadow maps,
  // env maps, PBR shaders and material caches are reused exactly as seen
  // in the live viewport. We then blit the target to a 2D canvas that feeds
  // MediaRecorder.
  const SS = 2;
  const ssW = width * SS;
  const ssH = height * SS;

  const rt = new THREE.WebGLRenderTarget(ssW, ssH, {
    samples: 4, // MSAA on WebGL2
    colorSpace: THREE.SRGBColorSpace,
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false,
  });

  // Save renderer state so we can restore R3F's live viewport afterwards.
  const origToneMapping = gl.toneMapping;
  const origExposure = gl.toneMappingExposure;
  const origColorSpace = gl.outputColorSpace;
  const origShadowEnabled = gl.shadowMap.enabled;
  const origShadowType = gl.shadowMap.type;
  const origClearColor = new THREE.Color();
  gl.getClearColor(origClearColor);
  const origClearAlpha = gl.getClearAlpha();

  // Apply engine preset (matches Quick Render tone mapping/exposure).
  gl.toneMapping = preset.toneMapping;
  gl.toneMappingExposure = preset.exposure;
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = THREE.PCFSoftShadowMap;
  gl.shadowMap.needsUpdate = true;
  if (scene.background instanceof THREE.Color) gl.setClearColor(scene.background, 1);

  // Recording canvas at the requested output resolution.
  const recCanvas = document.createElement('canvas');
  recCanvas.width = width;
  recCanvas.height = height;
  const ctx = recCanvas.getContext('2d', { alpha: false })!;
  (ctx as any).imageSmoothingEnabled = true;
  (ctx as any).imageSmoothingQuality = 'high';

  // A temporary display canvas the same size as the render target — we blit
  // the render-target pixels here via readRenderTargetPixels, flip Y, then
  // downscale into recCanvas.
  const blitCanvas = document.createElement('canvas');
  blitCanvas.width = ssW;
  blitCanvas.height = ssH;
  const blitCtx = blitCanvas.getContext('2d', { alpha: false })!;
  const pixels = new Uint8ClampedArray(ssW * ssH * 4);

  // Dedicated render camera when a scene camera is chosen so we don't fight
  // OrbitControls or R3F over the viewport camera.
  const renderCam = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);

  // Hide viewport helpers / gizmo / selection wires so they don't show in the video.
  const hidden: THREE.Object3D[] = [];
  scene.traverse((obj) => {
    const ud: any = obj.userData || {};
    const t = obj.type || '';
    const isHelper = /Helper$/.test(t);
    const isTC = t === 'TransformControls' || (obj as any).isTransformControls;
    if (ud.__helper || ud.__selectionWire || isHelper || isTC) {
      if (obj.visible) { hidden.push(obj); obj.visible = false; }
    }
  });

  // Force shadows on for meshes (mirrors Quick Render).
  const meshTouched: { mesh: THREE.Mesh; cast: boolean; receive: boolean }[] = [];
  scene.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const m = obj as THREE.Mesh;
      meshTouched.push({ mesh: m, cast: m.castShadow, receive: m.receiveShadow });
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  // Enable shadow casting on all directional/spot/point lights.
  const lightTouched: { light: any; cast: boolean }[] = [];
  scene.traverse((obj) => {
    const l = obj as any;
    if (l.isDirectionalLight || l.isSpotLight || l.isPointLight) {
      lightTouched.push({ light: l, cast: l.castShadow });
      l.castShadow = true;
    }
  });

  const stream = (recCanvas as HTMLCanvasElement).captureStream(0);
  const track = stream.getVideoTracks()[0] as any;

  const mimeCandidates =
    format === 'mp4'
      ? ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';

  const recorder = new MediaRecorder(
    stream,
    mime
      ? { mimeType: mime, videoBitsPerSecond: 12_000_000 }
      : { videoBitsPerSecond: 12_000_000 },
  );
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
  });

  recorder.start();

  const frameCount = Math.max(1, Math.floor((to - from) / Math.max(1, step)) + 1);
  const targetDelayMs = 1000 / Math.max(1, fps);

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

      // Render into the offscreen render target using the SAME renderer that
      // drives the viewport — every material, envmap and shadow map is already
      // uploaded and hot.
      const prevRT = gl.getRenderTarget();
      gl.setRenderTarget(rt);
      gl.clear();
      gl.render(scene, renderTarget);
      gl.readRenderTargetPixels(rt, 0, 0, ssW, ssH, pixels);
      gl.setRenderTarget(prevRT);

      // Push pixels to blit canvas, flipping Y (WebGL is bottom-up).
      const img = new ImageData(pixels, ssW, ssH);
      blitCtx.putImageData(img, 0, 0);
      ctx.save();
      ctx.scale(1, -1);
      ctx.drawImage(blitCanvas, 0, 0, ssW, ssH, 0, -height, width, height);
      ctx.restore();

      if (typeof track.requestFrame === 'function') track.requestFrame();
      await new Promise((r) => setTimeout(r, targetDelayMs));
      idx++;
      onProgress?.(idx, frameCount);
    }
    // Flush the last frame.
    await new Promise((r) => setTimeout(r, 250));
  } finally {
    if (recorder.state !== 'inactive') recorder.stop();
  }


  const blob = await stopped;

  // Restore scene state.
  hidden.forEach((o) => { o.visible = true; });
  meshTouched.forEach(({ mesh, cast, receive }) => {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
  });
  lightTouched.forEach(({ light, cast }) => {
    light.castShadow = cast;
  });

  // Restore the live viewport renderer so R3F keeps rendering normally.
  gl.toneMapping = origToneMapping;
  gl.toneMappingExposure = origExposure;
  gl.outputColorSpace = origColorSpace;
  gl.shadowMap.enabled = origShadowEnabled;
  gl.shadowMap.type = origShadowType;
  gl.setClearColor(origClearColor, origClearAlpha);

  rt.dispose();

  return blob;
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
