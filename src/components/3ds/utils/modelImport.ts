import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';

export interface ImportedModel {
  root: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

// In-memory cache — imported models must be re-imported after a full reload.
const cache = new Map<string, ImportedModel>();

export const getImportedModel = (id: string): ImportedModel | undefined =>
  cache.get(id);

export const setImportedModel = (id: string, model: ImportedModel) => {
  cache.set(id, model);
};

export const removeImportedModel = (id: string) => {
  cache.delete(id);
};

/** Center at origin and scale so the model fits a ~2-unit box. */
function normalizeTransform(root: THREE.Object3D) {
  // Wrap in a group so we can safely translate/scale without touching
  // internal bones/skinning.
  const wrapper = new THREE.Group();
  wrapper.add(root);

  const bbox = new THREE.Box3().setFromObject(wrapper);
  if (!isFinite(bbox.min.x) || bbox.isEmpty()) return wrapper;

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  bbox.getSize(size);
  bbox.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = 2 / maxDim;

  root.position.sub(center.multiplyScalar(1));
  root.position.multiplyScalar(scale);
  root.scale.multiplyScalar(scale);

  // Ensure shadows + material double-sided fallback for thin meshes.
  wrapper.traverse((child: any) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m: any) => {
          if (m && 'side' in m && m.side === THREE.FrontSide && !child.isSkinnedMesh) {
            // leave as is
          }
        });
      }
    }
  });

  return wrapper;
}

async function readFileAs(file: File, mode: 'text' | 'arraybuffer'): Promise<string | ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as any);
    r.onerror = () => reject(r.error);
    if (mode === 'text') r.readAsText(file);
    else r.readAsArrayBuffer(file);
  });
}

export async function importModelFile(file: File): Promise<ImportedModel> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  let loaded: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };

  switch (ext) {
    case 'obj': {
      const text = (await readFileAs(file, 'text')) as string;
      const scene = new OBJLoader().parse(text);
      loaded = { scene, animations: [] };
      break;
    }
    case 'gltf': {
      const text = (await readFileAs(file, 'text')) as string;
      const loader = new GLTFLoader();
      const gltf = await new Promise<any>((res, rej) =>
        loader.parse(text, '', res, rej)
      );
      loaded = { scene: gltf.scene, animations: gltf.animations || [] };
      break;
    }
    case 'glb': {
      const buf = (await readFileAs(file, 'arraybuffer')) as ArrayBuffer;
      const loader = new GLTFLoader();
      const gltf = await new Promise<any>((res, rej) =>
        loader.parse(buf, '', res, rej)
      );
      loaded = { scene: gltf.scene, animations: gltf.animations || [] };
      break;
    }
    case 'fbx': {
      const buf = (await readFileAs(file, 'arraybuffer')) as ArrayBuffer;
      const scene = new FBXLoader().parse(buf, '');
      loaded = { scene, animations: scene.animations || [] };
      break;
    }
    case '3ds': {
      const buf = (await readFileAs(file, 'arraybuffer')) as ArrayBuffer;
      const scene = new TDSLoader().parse(buf, '');
      loaded = { scene, animations: [] };
      break;
    }
    case 'dae': {
      const text = (await readFileAs(file, 'text')) as string;
      const collada = new ColladaLoader().parse(text, '');
      loaded = { scene: collada.scene, animations: collada.scene.animations || [] };
      break;
    }
    case 'stl': {
      const buf = (await readFileAs(file, 'arraybuffer')) as ArrayBuffer;
      const geom = new STLLoader().parse(buf);
      const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: 0x9ca3af }));
      loaded = { scene: mesh, animations: [] };
      break;
    }
    case 'ply': {
      const buf = (await readFileAs(file, 'arraybuffer')) as ArrayBuffer;
      const geom = new PLYLoader().parse(buf);
      geom.computeVertexNormals();
      const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: 0x9ca3af }));
      loaded = { scene: mesh, animations: [] };
      break;
    }
    default:
      throw new Error(`Unsupported format: .${ext}`);
  }

  const root = normalizeTransform(loaded.scene);
  return { root, animations: loaded.animations };
}
