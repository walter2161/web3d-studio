/**
 * SubObjectOverlay — renders the sub-object display for an Edit Poly / Edit
 * Mesh modifier: vertex dots, edge/border lines, or highlighted faces.
 *
 * Phase 1: display only. Picking + gizmo transform arrive in Phase 2.
 * The overlay reads the object's currently active Edit Poly/Mesh modifier
 * and derives an EditableMesh from the object's live BufferGeometry.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { fromGeometry } from './fromGeometry';
import { SubObjectLevel } from './EditableMesh';

interface Props {
  geometry: THREE.BufferGeometry;
  level: SubObjectLevel;
  selectedIds?: Set<number>;
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

export const SubObjectOverlay = ({ geometry, level, selectedIds }: Props) => {
  const mesh = useMemo(() => fromGeometry(geometry), [geometry]);

  const vertexPoints = useMemo(() => {
    if (level !== 'vertex') return null;
    const positions: number[] = [];
    const colors: number[] = [];
    const sel = selectedIds ?? new Set();
    const base = new THREE.Color(LEVEL_COLOR.vertex);
    const selCol = new THREE.Color(SELECTED_COLOR);
    mesh.vertices.forEach((v) => {
      positions.push(v.position.x, v.position.y, v.position.z);
      const c = sel.has(v.id) ? selCol : base;
      colors.push(c.r, c.g, c.b);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }, [mesh, level, selectedIds]);

  const edgeSegments = useMemo(() => {
    if (level !== 'edge' && level !== 'border') return null;
    const positions: number[] = [];
    const colors: number[] = [];
    const sel = selectedIds ?? new Set();
    const base = new THREE.Color(LEVEL_COLOR[level]);
    const selCol = new THREE.Color(SELECTED_COLOR);
    mesh.edges.forEach((e) => {
      if (level === 'border' && e.faces.length !== 1) return;
      const a = mesh.vertices.get(e.a)!.position;
      const b = mesh.vertices.get(e.b)!.position;
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      const c = sel.has(e.id) ? selCol : base;
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }, [mesh, level, selectedIds]);

  const faceMarkers = useMemo(() => {
    if (level !== 'face' && level !== 'polygon' && level !== 'element') return null;
    const positions: number[] = [];
    const colors: number[] = [];
    const sel = selectedIds ?? new Set();
    const base = new THREE.Color(LEVEL_COLOR[level]);
    const selCol = new THREE.Color(SELECTED_COLOR);
    mesh.faces.forEach((f) => {
      // face centroid as marker point
      const c = new THREE.Vector3();
      f.verts.forEach((vid) => c.add(mesh.vertices.get(vid)!.position));
      c.multiplyScalar(1 / f.verts.length);
      positions.push(c.x, c.y, c.z);
      const col = sel.has(f.id) ? selCol : base;
      colors.push(col.r, col.g, col.b);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }, [mesh, level, selectedIds]);

  return (
    <group renderOrder={1000}>
      {vertexPoints && (
        <points geometry={vertexPoints} renderOrder={1001}>
          <pointsMaterial size={0.12} sizeAttenuation vertexColors depthTest={false} />
        </points>
      )}
      {edgeSegments && (
        <lineSegments geometry={edgeSegments} renderOrder={1001}>
          <lineBasicMaterial vertexColors depthTest={false} linewidth={2} />
        </lineSegments>
      )}
      {faceMarkers && (
        <points geometry={faceMarkers} renderOrder={1001}>
          <pointsMaterial size={0.16} sizeAttenuation vertexColors depthTest={false} />
        </points>
      )}
    </group>
  );
};
