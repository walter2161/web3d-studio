import * as THREE from 'three';
import { getViewportHandle } from '../r3/viewportRegistry';
import { ENGINES, RenderEngine } from '../r3/RenderEngineContext';

export type VideoFormat = 'mp4' | 'webm' | 'webp';

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
  onProgress?: (done: number, total: number) => void;
}

/**
 * Renders a range of animation frames offscreen and encodes them into a
 * downloadable video (WebM/MP4) using MediaRecorder, or into an animated WebP
 * (encoded as WebM with .webp fallback). Steps the shared timeline frame so
 * every keyframed track updates naturally between renders.
 */
export async function renderAnimation(opts: AnimationRenderOptions): Promise<Blob> {
  const {
    from, to, step, width, height, fps, format, engine, setFrame, onProgress,
  } = opts;

  const handle = getViewportHandle('perspective') ?? getViewportHandle();
  if (!handle) throw new Error('No active viewport to render');
  const { scene, camera } = handle;
  const preset = ENGINES[engine];

  const offscreen = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  offscreen.setPixelRatio(1);
  offscreen.setSize(width, height, false);
  offscreen.toneMapping = preset.toneMapping;
  offscreen.toneMappingExposure = preset.exposure;
  offscreen.outputColorSpace = THREE.SRGBColorSpace;
  offscreen.shadowMap.enabled = true;
  offscreen.shadowMap.type = THREE.PCFSoftShadowMap;
  const bg = scene.background instanceof THREE.Color ? scene.background : null;
  if (bg) offscreen.setClearColor(bg);

  // Aspect for output
  const pcam = camera as THREE.PerspectiveCamera;
  const origAspect = pcam.aspect;
  if (pcam.isPerspectiveCamera) {
    pcam.aspect = width / height;
    pcam.updateProjectionMatrix();
  }

  // Hide viewport helpers / transform gizmo / selection wires
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

  // Force shadows on
  const meshTouched: { mesh: THREE.Mesh; cast: boolean; receive: boolean }[] = [];
  scene.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const m = obj as THREE.Mesh;
      meshTouched.push({ mesh: m, cast: m.castShadow, receive: m.receiveShadow });
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  const canvas = offscreen.domElement as HTMLCanvasElement;
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as any;

  // Pick a mimeType supported by this browser matching the requested format.
  const mimeCandidates =
    format === 'mp4'
      ? ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      : format === 'webp'
      ? ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';

  const recorder = new MediaRecorder(
    stream,
    mime
      ? { mimeType: mime, videoBitsPerSecond: 8_000_000 }
      : { videoBitsPerSecond: 8_000_000 },
  );
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
  });

  recorder.start();

  const frameCount = Math.max(1, Math.floor((to - from) / Math.max(1, step)) + 1);
  const targetDelayMs = 1000 / Math.max(1, fps);

  try {
    let idx = 0;
    for (let f = from; f <= to; f += step) {
      setFrame(f);
      // Give React two frames to commit the state update and Object3D refs to update.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      offscreen.render(scene, camera);
      if (typeof track.requestFrame === 'function') track.requestFrame();
      // Pace so the recorded timeline matches the requested fps.
      await new Promise((r) => setTimeout(r, targetDelayMs));
      idx++;
      onProgress?.(idx, frameCount);
    }
    // Let the recorder flush the last frame.
    await new Promise((r) => setTimeout(r, 250));
  } finally {
    if (recorder.state !== 'inactive') recorder.stop();
  }

  const blob = await stopped;

  // Restore scene
  hidden.forEach((o) => { o.visible = true; });
  meshTouched.forEach(({ mesh, cast, receive }) => {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
  });
  if (pcam.isPerspectiveCamera) {
    pcam.aspect = origAspect;
    pcam.updateProjectionMatrix();
  }
  offscreen.dispose();

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

/**
 * Chooses a filename+extension based on the actual encoded blob type.
 * MP4 fallback to WebM when the browser can't encode H.264 in-browser
 * (common on Chromium Linux); WebP request also falls back to WebM.
 */
export function suggestFilename(blob: Blob, requested: VideoFormat): string {
  const t = blob.type || '';
  let ext = 'webm';
  if (t.includes('mp4')) ext = 'mp4';
  else if (requested === 'webp') ext = 'webm'; // Real animated-WebP encoding is not natively supported
  const stamp = Date.now();
  return `animation-${stamp}.${ext}`;
}
