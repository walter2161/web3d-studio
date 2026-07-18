import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { R3Dialog, GroupBox, R3Button, Row, Spinner } from '../r3/R3Dialog';
import { toast } from 'sonner';
import { makeCheckerTexture } from './checkerTexture';
import {
  alignUV, forEachMesh, getTexelDensity, packUV, planarProject, relaxUV,
  renderUVToPNG, rotateUV, scaleUV, setTexelDensity, spaceEvenly, straightenUV,
  randomizeMaterialIDs, transferVertexColors, ensureUV,
} from './uvOps';

interface Props { open: boolean; onClose: () => void; }

const getScene = (): THREE.Scene | null => (window as any).__r3Scene || null;
const getSelectedIds = (): string[] => (window as any).__r3SelectedIds || [];

/** Walks the scene and returns every mesh whose top-level object id
 *  is in the current selection. */
function selectedMeshes(): THREE.Mesh[] {
  const scene = getScene();
  const ids = new Set(getSelectedIds());
  if (!scene || !ids.size) return [];
  const out: THREE.Mesh[] = [];
  scene.traverse((o) => {
    // Object3D nodes registered by the studio carry userData.objectId at the
    // top; child meshes inherit responsibility via ancestry.
    let node: THREE.Object3D | null = o;
    while (node) {
      if (node.userData?.objectId && ids.has(node.userData.objectId)) {
        if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
        break;
      }
      node = node.parent;
    }
  });
  return out;
}

const originalMaterials = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();

function applyChecker(tileRepeat: number) {
  const meshes = selectedMeshes();
  if (!meshes.length) { toast.error('Select a mesh first'); return; }
  const tex = makeCheckerTexture(512, 8);
  tex.repeat.set(tileRepeat, tileRepeat);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0 });
  meshes.forEach((m) => {
    if (!originalMaterials.has(m)) originalMaterials.set(m, m.material);
    m.material = mat;
    ensureUV(m.geometry as THREE.BufferGeometry);
  });
  toast.success(`Checker applied to ${meshes.length} mesh(es)`);
}

function restoreOriginal() {
  const meshes = selectedMeshes();
  meshes.forEach((m) => {
    const orig = originalMaterials.get(m);
    if (orig) { m.material = orig; originalMaterials.delete(m); }
  });
  toast.success('Original material restored');
}

/** Small helper — apply an op to all currently-selected meshes with a label. */
function doOp(label: string, fn: (m: THREE.Mesh) => void) {
  const meshes = selectedMeshes();
  if (!meshes.length) { toast.error('Select a mesh first'); return; }
  meshes.forEach(fn);
  toast.success(`${label} · ${meshes.length} mesh(es)`);
}

export function MapToolsPanel({ open, onClose }: Props) {
  const [tileRepeat, setTileRepeat] = useState(4);
  const [texRes, setTexRes] = useState(1024);
  const [targetTD, setTargetTD] = useState(512);
  const [padding, setPadding] = useState(0.02);
  const [rotDeg, setRotDeg] = useState(90);
  const [uvSize, setUvSize] = useState(1024);
  const [uvPreview, setUvPreview] = useState<string | null>(null);
  const [currentTD, setCurrentTD] = useState<number | null>(null);
  const [projAxis, setProjAxis] = useState<'auto' | 'x' | 'y' | 'z'>('auto');
  const [relaxIter, setRelaxIter] = useState(10);
  const [matIdCount, setMatIdCount] = useState(6);
  const [namePrefix, setNamePrefix] = useState('Asset_');

  const readTD = () => {
    const meshes = selectedMeshes();
    if (!meshes.length) { toast.error('Select a mesh'); return; }
    const td = getTexelDensity(meshes[0], texRes);
    setCurrentTD(td);
    toast.success(`TD: ${td.toFixed(2)} px/unit`);
  };

  const renderUVs = () => {
    const meshes = selectedMeshes();
    if (!meshes.length) { toast.error('Select a mesh'); return; }
    const png = renderUVToPNG(meshes[0], uvSize);
    setUvPreview(png);
  };

  const downloadUV = () => {
    if (!uvPreview) return;
    const a = document.createElement('a');
    a.href = uvPreview; a.download = 'uv_layout.png'; a.click();
  };

  const renameSelected = () => {
    const scene = getScene();
    const ids = getSelectedIds();
    if (!scene || !ids.length) { toast.error('Select objects'); return; }
    // Renames the actual object 3D name and dispatches a hierarchy refresh.
    // Persisting into the object list would require Studio3D wiring; for now
    // we update THREE names + toast so users see the change in outliner.
    let n = 1;
    ids.forEach((id) => {
      const obj = scene.getObjectByProperty('userData', { objectId: id } as any);
      if (obj) obj.name = `${namePrefix}${String(n++).padStart(2, '0')}`;
    });
    window.dispatchEvent(new Event('r3-hierarchy-refresh'));
    toast.success(`Renamed ${ids.length} object(s)`);
  };

  const transferColors = () => {
    const meshes = selectedMeshes();
    if (meshes.length < 2) { toast.error('Select at least 2 meshes (first=source)'); return; }
    const [src, ...targets] = meshes;
    targets.forEach((t) => transferVertexColors(src, t));
    toast.success(`Vertex colors → ${targets.length} target(s)`);
  };

  return (
    <R3Dialog open={open} onClose={onClose} title="MapTools — UV & Texturing" width={520}>
      <div className="space-y-1.5">
        <GroupBox title="Selection">
          <div className="flex flex-wrap gap-1">
            <R3Button onClick={() => doOp('Ensure UV', (m) => ensureUV(m.geometry as any))}>Ensure UV</R3Button>
            <R3Button onClick={renderUVs}>Render UV</R3Button>
            <R3Button onClick={downloadUV} disabled={!uvPreview}>Save PNG</R3Button>
          </div>
        </GroupBox>

        <GroupBox title="Checker">
          <Row label="Tile Repeat:">
            <Spinner value={tileRepeat} min={1} max={64} step={1} onChange={setTileRepeat} />
            <R3Button onClick={() => applyChecker(tileRepeat)}>Apply Checker</R3Button>
            <R3Button onClick={restoreOriginal}>Restore</R3Button>
          </Row>
        </GroupBox>

        <GroupBox title="Texel Density">
          <Row label="Tex Size:">
            <Spinner value={texRes} min={16} max={8192} step={128} onChange={setTexRes} />
            <R3Button onClick={readTD}>Get TD</R3Button>
            <span className="text-[11px] px-1">
              {currentTD !== null ? `${currentTD.toFixed(2)} px/u` : '—'}
            </span>
          </Row>
          <Row label="Target TD:">
            <Spinner value={targetTD} min={1} max={8192} step={16} onChange={setTargetTD} />
            <R3Button onClick={() => doOp('Set TD', (m) => setTexelDensity(m, targetTD, texRes))}>Set TD</R3Button>
          </Row>
        </GroupBox>

        <GroupBox title="Align">
          <div className="flex flex-wrap gap-1">
            <R3Button onClick={() => doOp('Align Left', (m) => alignUV(m, 'left'))}>Left</R3Button>
            <R3Button onClick={() => doOp('Align Right', (m) => alignUV(m, 'right'))}>Right</R3Button>
            <R3Button onClick={() => doOp('Align Top', (m) => alignUV(m, 'top'))}>Top</R3Button>
            <R3Button onClick={() => doOp('Align Bottom', (m) => alignUV(m, 'bottom'))}>Bottom</R3Button>
            <R3Button onClick={() => doOp('Center H', (m) => alignUV(m, 'centerH'))}>Center H</R3Button>
            <R3Button onClick={() => doOp('Center V', (m) => alignUV(m, 'centerV'))}>Center V</R3Button>
            <R3Button onClick={() => doOp('Straighten H', (m) => straightenUV(m, 'h'))}>Straighten H</R3Button>
            <R3Button onClick={() => doOp('Straighten V', (m) => straightenUV(m, 'v'))}>Straighten V</R3Button>
            <R3Button onClick={() => doOp('Space Evenly U', (m) => spaceEvenly(m, 'u'))}>Space U</R3Button>
            <R3Button onClick={() => doOp('Space Evenly V', (m) => spaceEvenly(m, 'v'))}>Space V</R3Button>
          </div>
        </GroupBox>

        <GroupBox title="Iron / Relax">
          <Row label="Iron Axis:">
            <select
              value={projAxis}
              onChange={(e) => setProjAxis(e.target.value as any)}
              className="bevel-inset bg-white text-[11px] h-[18px] px-1"
            >
              <option value="auto">Auto</option><option value="x">X</option>
              <option value="y">Y</option><option value="z">Z</option>
            </select>
            <R3Button onClick={() => doOp('Iron', (m) => planarProject(m, projAxis))}>Iron (Planar)</R3Button>
          </Row>
          <Row label="Iterations:">
            <Spinner value={relaxIter} min={1} max={100} onChange={setRelaxIter} />
            <R3Button onClick={() => doOp('Relax', (m) => relaxUV(m, relaxIter, 0.5))}>Relax</R3Button>
          </Row>
        </GroupBox>

        <GroupBox title="Packing">
          <Row label="Padding:">
            <Spinner value={padding} min={0} max={0.25} step={0.005} onChange={setPadding} />
            <R3Button onClick={() => doOp('Pack', (m) => packUV(m, padding))}>Pack</R3Button>
          </Row>
          <Row label="Rotate:">
            <Spinner value={rotDeg} min={-360} max={360} step={15} onChange={setRotDeg} />
            <R3Button onClick={() => doOp('Rotate UV', (m) => rotateUV(m, rotDeg))}>Rotate</R3Button>
            <R3Button onClick={() => doOp('Scale ×2', (m) => scaleUV(m, 2))}>×2</R3Button>
            <R3Button onClick={() => doOp('Scale ÷2', (m) => scaleUV(m, 0.5))}>÷2</R3Button>
          </Row>
        </GroupBox>

        <GroupBox title="ID Tools">
          <Row label="# IDs:">
            <Spinner value={matIdCount} min={2} max={32} onChange={setMatIdCount} />
            <R3Button onClick={() => doOp('Random IDs', (m) => randomizeMaterialIDs(m, matIdCount))}>Random IDs</R3Button>
          </Row>
        </GroupBox>

        <GroupBox title="Vertex Colors">
          <div className="flex gap-1">
            <R3Button onClick={transferColors}>Transfer (first→rest)</R3Button>
          </div>
        </GroupBox>

        <GroupBox title="Naming">
          <Row label="Prefix:">
            <input
              value={namePrefix}
              onChange={(e) => setNamePrefix(e.target.value)}
              className="bevel-inset bg-white text-[11px] h-[18px] px-1 w-[120px]"
            />
            <R3Button onClick={renameSelected}>Rename Selected</R3Button>
          </Row>
        </GroupBox>

        {uvPreview && (
          <GroupBox title="UV Preview">
            <img src={uvPreview} alt="UV Layout" className="w-full max-w-[420px] mx-auto border border-win-shadow" />
          </GroupBox>
        )}
      </div>
    </R3Dialog>
  );
}
