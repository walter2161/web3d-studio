/**
 * SubObjectOverlay — interactive sub-object display for Edit Poly / Edit
 * Mesh modifiers. Renders vertex dots, edges/border lines, or face centroids
 * and lets the user click to pick them.
 *
 * Picking dispatches a `r3-subobj-select` window event carrying
 * `{ objectId, modifierId, level, id, additive, remove }` so the app-level
 * state (Studio3D) can update the modifier's `params.selectedIds`.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { fromGeometry } from './fromGeometry';
import { EditableMesh, SubObjectLevel } from './EditableMesh';
import { ThreeEvent } from '@react-three/fiber';

interface Props {
  geometry: THREE.BufferGeometry;
  level: SubObjectLevel;
  selectedIds?: Set<number>;
  objectId: string;
  modifierId: string;
}

const LEVEL_COLOR: Record<SubObjectLevel, string> = {
  vertex: '#3b82f6',
  edge: '#f59e0b',
  border: '#22c55e',
  face: '#ef4444',
  polygon: '#ef4444',
  element: '#a855f7',
};

const SELECTED_COLOR = '#ffea00';

const emitPick = (
  objectId: string,
  modifierId: string,
  level: SubObjectLevel,
  id: number,
  e: ThreeEvent<PointerEvent>,
) => {
  e.stopPropagation();
  const additive = e.shiftKey || e.ctrlKey || e.metaKey;
  const remove = e.altKey;
  window.dispatchEvent(new CustomEvent('r3-subobj-select', {
    detail: { objectId, modifierId, level, id, additive, remove },
  }));
};

export const SubObjectOverlay = ({ geometry, level, selectedIds, objectId, modifierId }: Props) => {
  const mesh = useMemo(() => fromGeometry(geometry), [geometry]);

  // Build parallel id arrays so raycaster event.index maps back to element id.
  const vertexData = useMemo(() => {
    if (level !== 'vertex') return null;
    const positions: number[] = [];
    const colors: number[] = [];
    const ids: number[] = [];
    const sel = selectedIds ?? new Set();
    const base = new THREE.Color(LEVEL_COLOR.vertex);
    const selCol = new THREE.Color(SELECTED_COLOR);
    mesh.vertices.forEach((v) => {
      positions.push(v.position.x, v.position.y, v.position.z);
      ids.push(v.id);
      const c = sel.has(v.id) ? selCol : base;
      colors.push(c.r, c.g, c.b);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return { geometry: g, ids };
  }, [mesh, level, selectedIds]);

  const edgeData = useMemo(() => {
    if (level !== 'edge' && level !== 'border') return null;
    // Render each edge as its own line so raycaster picks individually via
    // event.object.userData.__edgeId. Doing this per-edge keeps picking simple.
    const items: { a: THREE.Vector3; b: THREE.Vector3; id: number; selected: boolean }[] = [];
    const sel = selectedIds ?? new Set();
    mesh.edges.forEach((e) => {
      if (level === 'border' && e.faces.length !== 1) return;
      const a = mesh.vertices.get(e.a)!.position;
      const b = mesh.vertices.get(e.b)!.position;
      items.push({ a, b, id: e.id, selected: sel.has(e.id) });
    });
    return items;
  }, [mesh, level, selectedIds]);

  const faceData = useMemo(() => {
    if (level !== 'face' && level !== 'polygon' && level !== 'element') return null;
    const positions: number[] = [];
    const colors: number[] = [];
    const ids: number[] = [];
    const sel = selectedIds ?? new Set();
    const base = new THREE.Color(LEVEL_COLOR[level]);
    const selCol = new THREE.Color(SELECTED_COLOR);
    mesh.faces.forEach((f) => {
      const c = new THREE.Vector3();
      f.verts.forEach((vid) => c.add(mesh.vertices.get(vid)!.position));
      c.multiplyScalar(1 / f.verts.length);
      positions.push(c.x, c.y, c.z);
      ids.push(f.id);
      const col = sel.has(f.id) ? selCol : base;
      colors.push(col.r, col.g, col.b);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return { geometry: g, ids };
  }, [mesh, level, selectedIds]);

  return (
    <group renderOrder={1000}>
      {vertexData && (
        <points
          geometry={vertexData.geometry}
          renderOrder={1001}
          onPointerDown={(e) => {
            const idx = (e as any).index ?? e.faceIndex;
            if (idx == null) return;
            const id = vertexData.ids[idx];
            if (id != null) emitPick(objectId, modifierId, level, id, e);
          }}
        >
          <pointsMaterial size={12} sizeAttenuation={false} vertexColors depthTest={false} />
        </points>
      )}
      {edgeData && edgeData.map((seg) => {
        const g = new THREE.BufferGeometry().setFromPoints([seg.a, seg.b]);
        return (
          <lineSegments
            key={seg.id}
            geometry={g}
            renderOrder={1001}
            onPointerDown={(e) => emitPick(objectId, modifierId, level, seg.id, e)}
          >
            <lineBasicMaterial
              color={seg.selected ? SELECTED_COLOR : LEVEL_COLOR[level]}
              depthTest={false}
              linewidth={3}
            />
          </lineSegments>
        );
      })}
      {faceData && (
        <points
          geometry={faceData.geometry}
          renderOrder={1001}
          onPointerDown={(e) => {
            const idx = (e as any).index ?? e.faceIndex;
            if (idx == null) return;
            const id = faceData.ids[idx];
            if (id != null) emitPick(objectId, modifierId, level, id, e);
          }}
        >
          <pointsMaterial size={16} sizeAttenuation={false} vertexColors depthTest={false} />
        </points>
      )}
    </group>
  );
};
