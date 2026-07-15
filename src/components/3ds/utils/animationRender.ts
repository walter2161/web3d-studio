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

  // Hide viewport helpers / gizmo / selection wires using the same filtering
  // as Quick Render, so the production video has no editor overlays.
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
  const renderedFrames: ImageBitmap[] = [];
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

      // Render one complete production still, then downsample + bake the same
      // color-response filter shown in Quick Render into the encoded frame.
      offscreen.render(scene, renderTarget);
      ctx.save();
      ctx.filter = preset.cssFilter || 'none';
      ctx.drawImage(offscreen.domElement, 0, 0, ssW, ssH, 0, 0, width, height);
      ctx.restore();

      // Store the rendered still. Encoding happens only after every requested
      // animation frame has been rendered, matching a real image-sequence flow.
      renderedFrames.push(await createImageBitmap(recCanvas));
      idx++;
      onProgress?.(idx, frameCount);
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
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(frame, 0, 0, width, height);
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
    renderedFrames.forEach((frame) => frame.close());

    // Restore scene state.
    hidden.forEach((o) => { o.visible = true; });
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
