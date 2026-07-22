import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';

export interface ExtractedLight {
  kind: 'light_omni' | 'light_spot' | 'light_direct';
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  color: string;
  intensity: number;
  distance: number;
  angle?: number;
  penumbra?: number;
  castShadow: boolean;
}

export interface ImportedModel {
  root: THREE.Object3D;
  animations: THREE.AnimationClip[];
  extractedLights?: ExtractedLight[];
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

  // Target ~10 units to match the app's default primitive scale.
  const TARGET_SIZE = 10;
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = TARGET_SIZE / maxDim;

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

export async function importFromBytes(filename: string, bytes: ArrayBuffer): Promise<ImportedModel> {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const decodeText = () => new TextDecoder().decode(bytes);

  let loaded: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };

  switch (ext) {
    case 'obj': {
      const scene = new OBJLoader().parse(decodeText());
      loaded = { scene, animations: [] };
      break;
    }
    case 'gltf': {
      const loader = new GLTFLoader();
      const gltf = await new Promise<any>((res, rej) =>
        loader.parse(decodeText(), '', res, rej)
      );
      loaded = { scene: gltf.scene, animations: gltf.animations || [] };
      break;
    }
    case 'glb': {
      const loader = new GLTFLoader();
      const gltf = await new Promise<any>((res, rej) =>
        loader.parse(bytes, '', res, rej)
      );
      loaded = { scene: gltf.scene, animations: gltf.animations || [] };
      break;
    }
    case 'fbx': {
      const scene = new FBXLoader().parse(bytes, '');
      loaded = { scene, animations: scene.animations || [] };
      break;
    }
    case '3ds': {
      const scene = new TDSLoader().parse(bytes, '');
      loaded = { scene, animations: [] };
      break;
    }
    case 'dae': {
      const collada = new ColladaLoader().parse(decodeText(), '');
      loaded = { scene: collada.scene, animations: collada.scene.animations || [] };
      break;
    }
    case 'stl': {
      const geom = new STLLoader().parse(bytes);
      const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: 0x9ca3af }));
      loaded = { scene: mesh, animations: [] };
      break;
    }
    case 'ply': {
      const geom = new PLYLoader().parse(bytes);
      geom.computeVertexNormals();
      const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: 0x9ca3af }));
      loaded = { scene: mesh, animations: [] };
      break;
    }
    default:
      throw new Error(`Unsupported format: .${ext}`);
  }

  // Extract embedded lights (GLB / FBX / DAE often ship with lights baked into
  // the scene graph). We turn each into a scene-editable Walt3D light object
  // and remove it from the imported subtree so it isn't rendered twice.
  const extractedLights: ExtractedLight[] = [];
  const toRemove: THREE.Object3D[] = [];
  loaded.scene.updateMatrixWorld(true);
  loaded.scene.traverse((obj: any) => {
    if (!obj.isLight) return;
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    obj.matrixWorld.decompose(worldPos, worldQuat, worldScale);
    const e = new THREE.Euler().setFromQuaternion(worldQuat, 'XYZ');
    const col = (obj.color && obj.color.getHexString) ? `#${obj.color.getHexString()}` : '#ffffff';
    const intensity = typeof obj.intensity === 'number' ? obj.intensity : 1;
    let kind: ExtractedLight['kind'] = 'light_omni';
    let angle: number | undefined;
    let penumbra: number | undefined;
    let distance = 0;
    if (obj.isSpotLight) { kind = 'light_spot'; angle = obj.angle; penumbra = obj.penumbra; distance = obj.distance || 20; }
    else if (obj.isDirectionalLight) { kind = 'light_direct'; distance = 30; }
    else if (obj.isPointLight) { kind = 'light_omni'; distance = obj.distance || 0; }
    else return; // Hemisphere/Ambient/RectArea: ignore for now
    extractedLights.push({
      kind,
      name: obj.name || kind,
      position: [worldPos.x, worldPos.y, worldPos.z],
      rotation: [e.x, e.y, e.z],
      color: col,
      intensity,
      distance,
      angle,
      penumbra,
      castShadow: !!obj.castShadow,
    });
    toRemove.push(obj);
  });
  toRemove.forEach((o) => o.parent?.remove(o));

  const root = normalizeTransform(loaded.scene);
  return { root, animations: loaded.animations, extractedLights };
}


export async function importModelFile(file: File): Promise<{ model: ImportedModel; bytes: ArrayBuffer }> {
  const bytes = await file.arrayBuffer();
  const model = await importFromBytes(file.name, bytes);
  return { model, bytes };
}

