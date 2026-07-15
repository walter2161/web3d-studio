import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Real-time 3D material preview renderer for the Material Editor sample slots.
 * Renders a sphere/cylinder/cube with PBR shading + IBL reflections from a
 * shared PMREM'd RoomEnvironment, producing a data URL cached by material
 * signature so a scroll doesn't re-render dozens of slots.
 */

export type PreviewShape = 'sphere' | 'cylinder' | 'cube';

export interface MaterialPreviewInput {
  shape: PreviewShape;
  color: string;
  metalness: number;
  roughness: number;
  opacity: number;
  emissive: string;
  emissiveIntensity: number;
  bitmapUrl?: string | null;
  size?: number;
}

const SIZE_DEFAULT = 72;

let renderer: THREE.WebGLRenderer | null = null;
let envTex: THREE.Texture | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
const geomCache = new Map<string, THREE.BufferGeometry>();
const texCache = new Map<string, THREE.Texture>();
const resultCache = new Map<string, string>();

let queue: Promise<any> = Promise.resolve();
function enqueue<T>(fn: () => T | Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next as Promise<T>;
}

function ensureRenderer(size: number) {
  if (!renderer) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    const pmrem = new THREE.PMREMGenerator(renderer);
    envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    scene = new THREE.Scene();
    scene.environment = envTex;
    scene.background = null;

    // Subtle direct light for extra highlight punch.
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(2, 3, 2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xaad4ff, 0.4);
    fill.position.set(-2, 1, -1);
    scene.add(fill);

    camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    camera.position.set(0, 0, 3.2);
    camera.lookAt(0, 0, 0);
  }
  if (renderer.domElement.width !== size) {
    renderer.setSize(size, size, false);
  }
  return renderer;
}

function getGeom(shape: PreviewShape): THREE.BufferGeometry {
  if (geomCache.has(shape)) return geomCache.get(shape)!;
  let g: THREE.BufferGeometry;
  if (shape === 'cube') g = new THREE.BoxGeometry(1.1, 1.1, 1.1);
  else if (shape === 'cylinder') g = new THREE.CylinderGeometry(0.6, 0.6, 1.3, 48, 1);
  else g = new THREE.SphereGeometry(0.75, 48, 32);
  geomCache.set(shape, g);
  return g;
}

function getTexture(url: string): Promise<THREE.Texture> {
  if (texCache.has(url)) return Promise.resolve(texCache.get(url)!);
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = 4;
        texCache.set(url, tex);
        resolve(tex);
      },
      undefined,
      (err) => reject(err),
    );
  });
}

function sigOf(input: MaterialPreviewInput): string {
  return [
    input.shape, input.color, input.metalness.toFixed(3), input.roughness.toFixed(3),
    input.opacity.toFixed(3), input.emissive, input.emissiveIntensity.toFixed(3),
    input.bitmapUrl || '', input.size || SIZE_DEFAULT,
  ].join('|');
}

async function doRender(input: MaterialPreviewInput): Promise<string> {
  const size = input.size || SIZE_DEFAULT;
  const r = ensureRenderer(size);
  const s = scene!;
  const c = camera!;

  // Set transparent clear
  r.setClearColor(0x000000, 0);

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(input.color),
    metalness: input.metalness,
    roughness: input.roughness,
    transparent: input.opacity < 1,
    opacity: input.opacity,
    emissive: new THREE.Color(input.emissive),
    emissiveIntensity: input.emissiveIntensity,
    envMapIntensity: 1,
  });

  if (input.bitmapUrl) {
    try {
      const tex = await getTexture(input.bitmapUrl);
      mat.map = tex;
      mat.needsUpdate = true;
    } catch { /* ignore */ }
  }

  const geom = getGeom(input.shape);
  const mesh = new THREE.Mesh(geom, mat);
  s.add(mesh);

  r.render(s, c);
  const dataUrl = r.domElement.toDataURL('image/png');

  s.remove(mesh);
  mat.dispose();

  return dataUrl;
}

export function getMaterialPreview(input: MaterialPreviewInput): Promise<string> {
  const key = sigOf(input);
  const cached = resultCache.get(key);
  if (cached) return Promise.resolve(cached);
  return enqueue(async () => {
    const c2 = resultCache.get(key);
    if (c2) return c2;
    const url = await doRender(input);
    resultCache.set(key, url);
    // Cap cache size.
    if (resultCache.size > 400) {
      const first = resultCache.keys().next().value;
      if (first) resultCache.delete(first);
    }
    return url;
  });
}
