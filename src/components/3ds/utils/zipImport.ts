/**
 * ZIP archive importer — Sketchfab-style.
 *
 * The user drops a `.zip` that bundles a 3D model together with its textures
 * (and optional companion files, e.g. .bin for glTF, .mtl for OBJ). We:
 *   1. Extract every entry to a Blob and mint a blob: URL keyed by BOTH the
 *      full archive path and the leaf filename.
 *   2. Pick the "main" model file (first supported extension found, glTF/GLB
 *      preferred, then FBX/OBJ/DAE/3DS/STL/PLY).
 *   3. Load it through the format's loader with a THREE.LoadingManager whose
 *      setURLModifier() rewrites any relative resource path (textures, .bin
 *      buffers, .mtl, external images) to the matching blob: URL.
 *
 * Returned { model, bytes, filename }:
 *   - bytes: the ORIGINAL zip bytes so we can persist it to IndexedDB and
 *     rehydrate the exact same archive on reload.
 *   - filename: the main model filename inside the zip (kept for extension
 *     lookup during rehydration).
 */
import * as THREE from 'three';
import JSZip from 'jszip';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import type { ImportedModel } from './modelImport';

const MODEL_EXTS = ['gltf', 'glb', 'fbx', 'obj', 'dae', '3ds', 'stl', 'ply'];

// Preference order when the archive contains several model files.
const PRIORITY = ['gltf', 'glb', 'fbx', 'dae', 'obj', '3ds', 'stl', 'ply'];

function extOf(path: string): string {
  const i = path.lastIndexOf('.');
  return i < 0 ? '' : path.slice(i + 1).toLowerCase();
}

function mimeFor(ext: string): string {
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'bmp': return 'image/bmp';
    case 'tga': return 'image/x-tga';
    case 'ktx2': return 'image/ktx2';
    case 'basis': return 'image/basis';
    case 'hdr': return 'image/vnd.radiance';
    case 'exr': return 'image/x-exr';
    case 'bin': return 'application/octet-stream';
    case 'mtl': return 'text/plain';
    default: return 'application/octet-stream';
  }
}

function normalizeTransform(root: THREE.Object3D): THREE.Object3D {
  const wrapper = new THREE.Group();
  wrapper.add(root);
  const bbox = new THREE.Box3().setFromObject(wrapper);
  if (!isFinite(bbox.min.x) || bbox.isEmpty()) return wrapper;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  bbox.getSize(size);
  bbox.getCenter(center);
  const TARGET_SIZE = 10;
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = TARGET_SIZE / maxDim;
  root.position.sub(center);
  root.position.multiplyScalar(scale);
  root.scale.multiplyScalar(scale);
  wrapper.traverse((child: any) => {
    if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
  });
  return wrapper;
}

export interface ZipImportResult {
  model: ImportedModel;
  bytes: ArrayBuffer;      // original zip bytes (for persistence)
  filename: string;        // main model file inside the zip (e.g. "scene.gltf")
}

export async function importZipArchive(file: File | { name: string; arrayBuffer: () => Promise<ArrayBuffer> }): Promise<ZipImportResult> {
  const zipBytes = await file.arrayBuffer();
  return importZipBytes(file.name, zipBytes);
}

export async function importZipBytes(zipName: string, zipBytes: ArrayBuffer): Promise<ZipImportResult> {
  const zip = await JSZip.loadAsync(zipBytes);

  // Map of blob URLs keyed by every plausible path spelling so relative refs
  // in the model file resolve regardless of how the archive is nested.
  //   - full path from archive root (lowercased)
  //   - leaf filename (lowercased)
  //   - filename without extension (rare, but some exporters do this)
  const urlMap = new Map<string, string>();
  const revokeList: string[] = [];
  const entries: { path: string; ext: string }[] = [];

  const files = Object.values(zip.files).filter((f) => !f.dir);
  await Promise.all(files.map(async (entry) => {
    const path = entry.name;
    const ext = extOf(path);
    const data = await entry.async('blob');
    const typedBlob = data.type ? data : new Blob([data], { type: mimeFor(ext) });
    const url = URL.createObjectURL(typedBlob);
    revokeList.push(url);
    const lower = path.toLowerCase();
    const leaf = lower.split('/').pop() || lower;
    urlMap.set(lower, url);
    urlMap.set(leaf, url);
    // Also register the path without the leading folder(s) segment by segment,
    // so refs like "textures/foo.png" resolve inside "SubFolder/textures/foo.png".
    const parts = lower.split('/');
    for (let i = 1; i < parts.length; i++) {
      urlMap.set(parts.slice(i).join('/'), url);
    }
    entries.push({ path, ext });
  }));

  // Choose the main model file.
  const candidates = entries.filter((e) => MODEL_EXTS.includes(e.ext));
  if (candidates.length === 0) {
    revokeList.forEach((u) => URL.revokeObjectURL(u));
    throw new Error('No supported 3D model file found inside the archive.');
  }
  candidates.sort((a, b) => {
    const pa = PRIORITY.indexOf(a.ext); const pb = PRIORITY.indexOf(b.ext);
    if (pa !== pb) return pa - pb;
    // Shorter path wins (root-level over deeply nested).
    return a.path.split('/').length - b.path.split('/').length;
  });
  const main = candidates[0];
  const mainExt = main.ext;
  const mainZipEntry = zip.file(main.path);
  if (!mainZipEntry) throw new Error(`Missing entry ${main.path}`);

  // Build a LoadingManager that rewrites relative resource URLs to the blob:
  // URL of the matching zip entry.
  const manager = new THREE.LoadingManager();
  const resolveInArchive = (url: string): string | null => {
    if (!url) return null;
    if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http:') || url.startsWith('https:')) {
      return null;
    }
    // Strip any leading "./" or "/".
    let clean = url.replace(/^\.\//, '').replace(/^\/+/, '').toLowerCase();
    // Some exporters percent-encode filenames.
    try { clean = decodeURIComponent(clean); } catch { /* noop */ }
    if (urlMap.has(clean)) return urlMap.get(clean)!;
    const leaf = clean.split('/').pop()!;
    if (urlMap.has(leaf)) return urlMap.get(leaf)!;
    return null;
  };
  manager.setURLModifier((requested) => {
    const resolved = resolveInArchive(requested);
    return resolved || requested;
  });

  const mainBlobUrl = urlMap.get(main.path.toLowerCase())!;
  const mainBytes = await mainZipEntry.async('arraybuffer');

  let loaded: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };

  switch (mainExt) {
    case 'gltf': {
      const loader = new GLTFLoader(manager);
      // Parse from text so LoadingManager handles the .bin/textures via setURLModifier.
      const text = new TextDecoder().decode(mainBytes);
      const gltf = await new Promise<any>((res, rej) =>
        loader.parse(text, mainBlobUrl.replace(/[^/]+$/, ''), res, rej),
      );
      loaded = { scene: gltf.scene, animations: gltf.animations || [] };
      break;
    }
    case 'glb': {
      // GLB embeds everything — LoadingManager not needed, but pass it anyway.
      const loader = new GLTFLoader(manager);
      const gltf = await new Promise<any>((res, rej) =>
        loader.parse(mainBytes, '', res, rej),
      );
      loaded = { scene: gltf.scene, animations: gltf.animations || [] };
      break;
    }
    case 'fbx': {
      // FBXLoader uses its internal manager for texture requests via the
      // path argument. We instead patch THREE.TextureLoader temporarily so
      // any texture path it tries to load routes through our resolver.
      const scene = new FBXLoader(manager).parse(mainBytes, '');
      loaded = { scene, animations: scene.animations || [] };
      break;
    }
    case 'obj': {
      // If an .mtl companion exists, parse it first and hand materials to OBJ.
      const objLoader = new OBJLoader(manager);
      const mtlEntry = entries.find((e) => e.ext === 'mtl');
      if (mtlEntry) {
        const mtlText = await zip.file(mtlEntry.path)!.async('string');
        const mtlLoader = new MTLLoader(manager);
        // resourcePath so material texture URLs stay relative and go through manager.
        mtlLoader.setResourcePath('');
        const materials = mtlLoader.parse(mtlText, '');
        materials.preload();
        objLoader.setMaterials(materials);
      }
      const scene = objLoader.parse(new TextDecoder().decode(mainBytes));
      loaded = { scene, animations: [] };
      break;
    }
    case 'dae': {
      const collada = new ColladaLoader(manager).parse(new TextDecoder().decode(mainBytes), '');
      loaded = { scene: collada.scene, animations: collada.scene.animations || [] };
      break;
    }
    case '3ds': {
      const scene = new TDSLoader(manager).parse(mainBytes, '');
      loaded = { scene, animations: [] };
      break;
    }
    case 'stl': {
      const geom = new STLLoader().parse(mainBytes);
      const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: 0x9ca3af }));
      loaded = { scene: mesh, animations: [] };
      break;
    }
    case 'ply': {
      const geom = new PLYLoader().parse(mainBytes);
      geom.computeVertexNormals();
      const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: 0x9ca3af }));
      loaded = { scene: mesh, animations: [] };
      break;
    }
    default:
      revokeList.forEach((u) => URL.revokeObjectURL(u));
      throw new Error(`Unsupported main format in zip: .${mainExt}`);
  }

  // Textures loaded via blob: URLs stay valid as long as we don't revoke them.
  // Some loaders (FBX, GLTF text-mode) resolve textures asynchronously after
  // parse resolves, so keep the blob URLs alive for the lifetime of the model.
  (loaded.scene as any).__zipBlobUrls = revokeList;

  const root = normalizeTransform(loaded.scene);
  return {
    model: { root, animations: loaded.animations },
    bytes: zipBytes,
    filename: main.path.split('/').pop() || main.path,
  };
}
