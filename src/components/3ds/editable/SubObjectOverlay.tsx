/**
 * SubObjectOverlay — interactive sub-object display for Edit Poly / Edit
 * Mesh modifiers. Renders vertex dots, edges/border lines, or filled face
 * polygons (red when selected) and lets the user click to pick them.
 *
 * Picking dispatches a `r3-subobj-select` window event carrying
 * `{ objectId, modifierId, level, id, additive, remove }` so the app-level
 * state (Studio3D) can update the modifier's `params.selectedIds`.
 *
 * When the selection changes, this component also emits a
 * `r3-subobj-centroid` event with the current selection's local-space
 * centroid so Scene3D can position a transform gizmo on the selection.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { fromGeometry } from './fromGeometry';
import { SubObjectLevel } from './EditableMesh';
import { selectionToVertexIds } from './selection';
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
  face: '#ffffff',
  polygon: '#ffffff',
  element: '#a855f7',
};

const SELECTED_COLOR = '#ff2a2a';

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
  const sel = selectedIds ?? new Set<number>();

  // Emit centroid on selection change so Scene3D can drive a gizmo.
  useEffect(() => {
    let local: [number, number, number] | null = null;
    if (sel.size > 0) {
      const vids = selectionToVertexIds(mesh, { level, ids: sel });
      if (vids.size > 0) {
        const c = new THREE.Vector3();
        vids.forEach((vid) => { const v = mesh.vertices.get(vid); if (v) c.add(v.position); });
        c.multiplyScalar(1 / vids.size);
        local = [c.x, c.y, c.z];
      }
    }
    window.dispatchEvent(new CustomEvent('r3-subobj-centroid', {
      detail: { objectId, modifierId, level, local },
    }));
  }, [mesh, level, sel, objectId, modifierId]);

  // ---- VERTEX ----
  const vertexData = useMemo(() => {
    if (level !== 'vertex') return null;
    const positions: number[] = [];
    const colors: number[] = [];
    const ids: number[] = [];
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
  }, [mesh, level, sel]);

  // ---- EDGE / BORDER ----
  const edgeItems = useMemo(() => {
    if (level !== 'edge' && level !== 'border') return null;
    const items: { a: THREE.Vector3; b: THREE.Vector3; id: number; selected: boolean }[] = [];
    mesh.edges.forEach((e) => {
      if (level === 'border' && e.faces.length !== 1) return;
      const va = mesh.vertices.get(e.a)!.position;
      const vb = mesh.vertices.get(e.b)!.position;
      items.push({ a: va, b: vb, id: e.id, selected: sel.has(e.id) });
    });
    return items;
  }, [mesh, level, sel]);

  // ---- FACE / POLYGON / ELEMENT ----
  // Two overlay meshes:
  //   * pick mesh: all faces triangulated, nearly-invisible material, used
  //     for raycasting -> face id via faceIndex lookup.
  //   * highlight mesh: only selected faces, bright red translucent.
  const faceOverlay = useMemo(() => {
    if (level !== 'face' && level !== 'polygon' && level !== 'element') return null;

    // For 'element' level, expand selection to whole connected component.
    let effectiveSel = sel;
    if (level === 'element' && sel.size > 0) {
      const elements = mesh.elements();
      const expanded = new Set<number>();
      elements.forEach((comp) => {
        const hit = Array.from(comp).some((fid) => sel.has(fid));
        if (hit) comp.forEach((fid) => expanded.add(fid));
      });
      effectiveSel = expanded;
    }

    const pickPos: number[] = [];
    const triFaceId: number[] = []; // one entry per triangle
    const selPos: number[] = [];
    const centroids: number[] = [];
    const centroidIds: number[] = [];

    mesh.faces.forEach((f) => {
      if (f.hidden) return;
      const verts = f.verts.map((vid) => mesh.vertices.get(vid)!.position);
      // Fan-triangulate the polygon.
      for (let i = 1; i < verts.length - 1; i++) {
        pickPos.push(
          verts[0].x, verts[0].y, verts[0].z,
          verts[i].x, verts[i].y, verts[i].z,
          verts[i + 1].x, verts[i + 1].y, verts[i + 1].z,
        );
        triFaceId.push(f.id);
        if (effectiveSel.has(f.id)) {
          selPos.push(
            verts[0].x, verts[0].y, verts[0].z,
            verts[i].x, verts[i].y, verts[i].z,
            verts[i + 1].x, verts[i + 1].y, verts[i + 1].z,
          );
        }
      }
      // Centroid marker
      const c = new THREE.Vector3();
      verts.forEach((p) => c.add(p));
      c.multiplyScalar(1 / verts.length);
      centroids.push(c.x, c.y, c.z);
      centroidIds.push(f.id);
    });

    const pickGeom = new THREE.BufferGeometry();
    pickGeom.setAttribute('position', new THREE.Float32BufferAttribute(pickPos, 3));
    pickGeom.computeVertexNormals();

    let selGeom: THREE.BufferGeometry | null = null;
    if (selPos.length > 0) {
      selGeom = new THREE.BufferGeometry();
      selGeom.setAttribute('position', new THREE.Float32BufferAttribute(selPos, 3));
      selGeom.computeVertexNormals();
    }

    const centroidGeom = new THREE.BufferGeometry();
    centroidGeom.setAttribute('position', new THREE.Float32BufferAttribute(centroids, 3));

    return { pickGeom, triFaceId, selGeom, centroidGeom, centroidIds };
  }, [mesh, level, sel]);

  return (
    <group renderOrder={1000}>
      {vertexData && (
        <points
          geometry={vertexData.geometry}
          renderOrder={1002}
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

      {edgeItems && edgeItems.map((seg) => {
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
              transparent
              opacity={seg.selected ? 1 : 0.9}
            />
          </lineSegments>
        );
      })}

      {faceOverlay && (
        <>
          {/* Pickable transparent hull covering every face triangle. */}
          <mesh
            geometry={faceOverlay.pickGeom}
            renderOrder={1000}
            onPointerDown={(e) => {
              const fi = e.faceIndex;
              if (fi == null) return;
              const fid = faceOverlay.triFaceId[fi];
              if (fid != null) emitPick(objectId, modifierId, level, fid, e);
            }}
          >
            <meshBasicMaterial
              color="#ffffff"
              transparent
              opacity={0.04}
              depthWrite={false}
              side={THREE.DoubleSide}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
            />
          </mesh>

          {/* Red highlight on top of selected faces. */}
          {faceOverlay.selGeom && (
            <mesh geometry={faceOverlay.selGeom} renderOrder={1001}>
              <meshBasicMaterial
                color={SELECTED_COLOR}
                transparent
                opacity={0.55}
                depthTest={false}
                depthWrite={false}
                side={THREE.DoubleSide}
                polygonOffset
                polygonOffsetFactor={-2}
                polygonOffsetUnits={-2}
              />
            </mesh>
          )}

          {/* Small dots at face centroids for legacy Max feedback. */}
          <points geometry={faceOverlay.centroidGeom} renderOrder={1002}>
            <pointsMaterial
              size={6}
              sizeAttenuation={false}
              color={LEVEL_COLOR[level]}
              depthTest={false}
            />
          </points>
        </>
      )}
    </group>
  );
};
