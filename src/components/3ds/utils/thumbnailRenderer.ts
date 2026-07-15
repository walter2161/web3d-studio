import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Offline renderer that produces small preview thumbnails (data URLs) for
 * remote GLB files. A single shared WebGLRenderer is reused across requests
 * and results are cached in memory + localStorage so re-opening the library
 * feels instant.
 */

const SIZE = 96;
const LS_PREFIX = 'lib-thumb-v1:';

const memCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

// Serialize renders so we never fight for the single WebGL context.
let queue: Promise<any> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

let renderer: THREE.WebGLRenderer | null = null;
let loader: GLTFLoader | null = null;

function getRenderer() {
  if (!renderer) {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  return renderer;
}

function getLoader() {
  if (!loader) loader = new GLTFLoader();
  return loader;
}

async function renderThumbnail(url: string): Promise<string> {
  const gltf = await getLoader().loadAsync(url);
  const root = gltf.scene || gltf.scenes?.[0];
  if (!root) throw new Error('empty gltf');

  // Fit inside a unit box centered at origin.
  const bbox = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  bbox.getSize(size);
  bbox.getCenter(center);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = 1 / maxDim;
  root.position.sub(center).multiplyScalar(scale);
  root.scale.multiplyScalar(scale);

  const scene = new THREE.Scene();
  scene.add(root);

  // Lighting — enough contrast for a clean silhouette.
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444455, 1.0);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(2, 3, 2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xaad4ff, 0.5);
  fill.position.set(-2, 1, -1);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  camera.position.set(1.2, 1.0, 1.6);
  camera.lookAt(0, 0, 0);

  const r = getRenderer();
  r.render(scene, camera);
  const dataUrl = r.domElement.toDataURL('image/png');

  // Dispose textures/materials/geometries to free GPU memory.
  scene.traverse((obj: any) => {
    if (obj.isMesh) {
      obj.geometry?.dispose?.();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m: any) => {
        if (!m) return;
        for (const k in m) {
          const v = (m as any)[k];
          if (v && v.isTexture) v.dispose();
        }
        m.dispose?.();
      });
    }
  });

  return dataUrl;
}

export async function getLibraryThumbnail(id: string, url: string): Promise<string> {
  if (memCache.has(id)) return memCache.get(id)!;

  try {
    const cached = localStorage.getItem(LS_PREFIX + id);
    if (cached) {
      memCache.set(id, cached);
      return cached;
    }
  } catch {}

  if (inflight.has(id)) return inflight.get(id)!;

  const p = renderThumbnail(url)
    .then((dataUrl) => {
      memCache.set(id, dataUrl);
      try { localStorage.setItem(LS_PREFIX + id, dataUrl); } catch {}
      inflight.delete(id);
      return dataUrl;
    })
    .catch((err) => {
      inflight.delete(id);
      throw err;
    });

  inflight.set(id, p);
  return p;
}
