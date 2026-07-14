import * as THREE from 'three';
import { BufferGeometry } from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// In-memory geometry cache for imported models (keyed by object id).
// Not persisted across full reloads — imported models must be re-imported
// after a hard refresh.
const geometryCache = new Map<string, BufferGeometry>();

export const getImportedGeometry = (id: string): BufferGeometry | undefined =>
  geometryCache.get(id);

export const setImportedGeometry = (id: string, geom: BufferGeometry) => {
  geometryCache.set(id, geom);
};

export const removeImportedGeometry = (id: string) => {
  const g = geometryCache.get(id);
  if (g) g.dispose();
  geometryCache.delete(id);
};

function collectGeometries(root: THREE.Object3D): BufferGeometry[] {
  const geoms: BufferGeometry[] = [];
  root.updateMatrixWorld(true);
  root.traverse((child: any) => {
    if (child.isMesh && child.geometry) {
      const g = child.geometry.clone() as BufferGeometry;
      g.applyMatrix4(child.matrixWorld);
      // Normalize attributes so merge works
      const pos = g.getAttribute('position');
      if (!pos) return;
      // Keep only position + normal + uv for consistent merge
      const kept = new BufferGeometry();
      kept.setAttribute('position', pos);
      if (g.getAttribute('normal')) kept.setAttribute('normal', g.getAttribute('normal'));
      if (g.getAttribute('uv')) kept.setAttribute('uv', g.getAttribute('uv'));
      if (g.index) kept.setIndex(g.index);
      geoms.push(kept);
    }
  });
  return geoms;
}

function finalizeGeometry(root: THREE.Object3D): BufferGeometry {
  const geoms = collectGeometries(root);
  if (geoms.length === 0) throw new Error('No mesh geometry found in file');

  // Ensure every geometry has normals + uv (fill uv with zeros if missing)
  geoms.forEach(g => {
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) {
      const count = g.getAttribute('position').count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    // Deindex to make merging safer across mixed indexed/non-indexed
    if (g.index) {
      const de = g.toNonIndexed();
      g.copy(de);
    }
  });

  let merged: BufferGeometry;
  try {
    merged = BufferGeometryUtils.mergeGeometries(geoms, false) as BufferGeometry;
    if (!merged) throw new Error('merge failed');
  } catch {
    merged = geoms[0];
  }

  // Center + scale-normalize so imported models are visible in the viewport
  merged.computeBoundingBox();
  const bbox = merged.boundingBox!;
  const center = new THREE.Vector3();
  bbox.getCenter(center);
  merged.translate(-center.x, -center.y, -center.z);

  const size = new THREE.Vector3();
  bbox.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const target = 2; // fit into a ~2-unit box
  const scale = target / maxDim;
  merged.scale(scale, scale, scale);
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
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

export async function importModelFile(file: File): Promise<BufferGeometry> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  switch (ext) {
    case 'obj': {
      const text = (await readFileAs(file, 'text')) as string;
      const root = new OBJLoader().parse(text);
      return finalizeGeometry(root);
    }
    case 'gltf': {
      const text = (await readFileAs(file, 'text')) as string;
      const loader = new GLTFLoader();
      const gltf = await new Promise<any>((res, rej) =>
        loader.parse(text, '', res, rej)
      );
      return finalizeGeometry(gltf.scene);
    }
    case 'glb': {
      const buf = (await readFileAs(file, 'arraybuffer')) as ArrayBuffer;
      const loader = new GLTFLoader();
      const gltf = await new Promise<any>((res, rej) =>
        loader.parse(buf, '', res, rej)
      );
      return finalizeGeometry(gltf.scene);
    }
    case 'fbx': {
      const buf = (await readFileAs(file, 'arraybuffer')) as ArrayBuffer;
      const root = new FBXLoader().parse(buf, '');
      return finalizeGeometry(root);
    }
    case '3ds': {
      const buf = (await readFileAs(file, 'arraybuffer')) as ArrayBuffer;
      const root = new TDSLoader().parse(buf, '');
      return finalizeGeometry(root);
    }
    case 'dae': {
      const text = (await readFileAs(file, 'text')) as string;
      const collada = new ColladaLoader().parse(text, '');
      return finalizeGeometry(collada.scene);
    }
    case 'stl': {
      const buf = (await readFileAs(file, 'arraybuffer')) as ArrayBuffer;
      const geom = new STLLoader().parse(buf) as BufferGeometry;
      const mesh = new THREE.Mesh(geom);
      return finalizeGeometry(mesh);
    }
    case 'ply': {
      const buf = (await readFileAs(file, 'arraybuffer')) as ArrayBuffer;
      const geom = new PLYLoader().parse(buf) as BufferGeometry;
      const mesh = new THREE.Mesh(geom);
      return finalizeGeometry(mesh);
    }
    default:
      throw new Error(`Unsupported format: .${ext}`);
  }
}
