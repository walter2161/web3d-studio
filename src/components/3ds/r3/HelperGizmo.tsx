import { useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { HelperGeom, tapeDistance } from '../utils/helpers';

interface Props {
  data: HelperGeom | undefined | null;
  selected?: boolean;
  ghost?: boolean;
}

const CYAN = '#00e5ff';
const YELLOW = '#f2c744';
const SEL = '#ffffff';

/**
 * Viewport-only gizmo for the Helpers category (Point / Dummy / Tape / Grid /
 * Compass). Rendered inside the parent <group> that already carries the
 * helper's position / rotation / scale.
 */
export const HelperGizmo = ({ data, selected, ghost }: Props) => {
  const kind = data?.helperKind ?? 'point';
  const color = ghost ? YELLOW : selected ? SEL : CYAN;

  // ---- Point --------------------------------------------------------------
  const pointGeom = useMemo(() => {
    if (kind !== 'point') return null;
    const s = data?.size ?? 0.2;
    const positions: number[] = [];
    if (data?.showCross ?? true) {
      positions.push(-s, 0, 0, s, 0, 0);
      positions.push(0, -s, 0, 0, s, 0);
      positions.push(0, 0, -s, 0, 0, s);
    }
    if (data?.showAxisTripod) {
      // small colored axes on top of the cross — draw as separate segments.
      positions.push(0, 0, 0, s * 1.5, 0, 0);
      positions.push(0, 0, 0, 0, s * 1.5, 0);
      positions.push(0, 0, 0, 0, 0, s * 1.5);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [kind, data?.size, data?.showCross, data?.showAxisTripod]);

  // ---- Dummy (wireframe box) ---------------------------------------------
  const dummyGeom = useMemo(() => {
    if (kind !== 'dummy') return null;
    const l = data?.length ?? 1;
    const w = data?.width ?? 1;
    const h = data?.height ?? 1;
    return new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, l));
  }, [kind, data?.length, data?.width, data?.height]);

  // ---- Tape --------------------------------------------------------------
  const tapePos = useMemo(() => {
    if (kind !== 'tape') return null;
    const a = data?.endpointA ?? [0, 0, 0];
    const b = data?.endpointB ?? [1, 0, 0];
    // Endpoints are stored in the helper's local frame (pivot is A).
    const arr = new Float32Array([a[0], a[1], a[2], b[0], b[1], b[2]]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return { g, a, b };
  }, [kind, data?.endpointA, data?.endpointB]);

  // ---- Compass ring ------------------------------------------------------
  const compassGeom = useMemo(() => {
    if (kind !== 'compass') return null;
    const r = data?.radius ?? 1;
    const seg = 64;
    const arr: number[] = [];
    for (let i = 0; i < seg; i++) {
      const a1 = (i / seg) * Math.PI * 2;
      const a2 = ((i + 1) / seg) * Math.PI * 2;
      arr.push(Math.cos(a1) * r, 0, Math.sin(a1) * r);
      arr.push(Math.cos(a2) * r, 0, Math.sin(a2) * r);
    }
    // N/E/S/W tick marks (short radial lines just outside the ring).
    if (data?.showTicks ?? true) {
      const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      for (const [dx, dz] of dirs) {
        arr.push(dx * r, 0, dz * r);
        arr.push(dx * r * 1.2, 0, dz * r * 1.2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return g;
  }, [kind, data?.radius, data?.showTicks]);

  // ---- Grid --------------------------------------------------------------
  const gridGeom = useMemo(() => {
    if (kind !== 'grid') return null;
    const l = data?.gridLength ?? 5;
    const w = data?.gridWidth ?? 5;
    const s = Math.max(0.05, data?.gridSpacing ?? 0.5);
    const arr: number[] = [];
    // Lines parallel to X, stepping in Z
    const halfL = l / 2, halfW = w / 2;
    for (let z = -halfL; z <= halfL + 1e-6; z += s) {
      arr.push(-halfW, 0, z, halfW, 0, z);
    }
    for (let x = -halfW; x <= halfW + 1e-6; x += s) {
      arr.push(x, 0, -halfL, x, 0, halfL);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return g;
  }, [kind, data?.gridLength, data?.gridWidth, data?.gridSpacing]);

  if (kind === 'point' && pointGeom) {
    return (
      <group>
        <lineSegments geometry={pointGeom} renderOrder={999}>
          <lineBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
        </lineSegments>
        {data?.showBox && (
          <lineSegments renderOrder={999}>
            <edgesGeometry args={[new THREE.BoxGeometry((data.size ?? 0.2) * 2, (data.size ?? 0.2) * 2, (data.size ?? 0.2) * 2)]} />
            <lineBasicMaterial color={color} depthTest={false} transparent opacity={0.8} />
          </lineSegments>
        )}
        {data?.showCenterMarker && (
          <mesh renderOrder={999}>
            <sphereGeometry args={[(data.size ?? 0.2) * 0.15, 8, 8]} />
            <meshBasicMaterial color={color} depthTest={false} />
          </mesh>
        )}
      </group>
    );
  }

  if (kind === 'dummy' && dummyGeom) {
    return (
      <lineSegments geometry={dummyGeom} renderOrder={998}>
        <lineBasicMaterial color={color} transparent opacity={0.95} />
      </lineSegments>
    );
  }

  if (kind === 'tape' && tapePos) {
    const dist = tapeDistance(data);
    const mid: [number, number, number] = [
      (tapePos.a[0] + tapePos.b[0]) / 2,
      (tapePos.a[1] + tapePos.b[1]) / 2 + 0.02,
      (tapePos.a[2] + tapePos.b[2]) / 2,
    ];
    return (
      <group>
        <lineSegments geometry={tapePos.g} renderOrder={999}>
          <lineBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
        </lineSegments>
        {/* endpoint dots */}
        {[tapePos.a, tapePos.b].map((p, i) => (
          <mesh key={i} position={p as any} renderOrder={999}>
            <sphereGeometry args={[0.03, 8, 8]} />
            <meshBasicMaterial color={color} depthTest={false} />
          </mesh>
        ))}
        <Html position={mid} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
          <div style={{
            fontSize: 10, padding: '1px 4px', background: 'rgba(0,0,0,0.65)',
            color: '#fff', border: `1px solid ${color}`, borderRadius: 2, whiteSpace: 'nowrap',
          }}>
            {dist.toFixed(3)} m
          </div>
        </Html>
      </group>
    );
  }

  if (kind === 'compass' && compassGeom) {
    const r = data?.radius ?? 1;
    return (
      <group>
        <lineSegments geometry={compassGeom} renderOrder={998}>
          <lineBasicMaterial color={color} transparent opacity={0.9} />
        </lineSegments>
        {(data?.showTicks ?? true) && (
          <>
            <Html position={[0, 0, -r * 1.35]} center style={{ pointerEvents: 'none' }}>
              <div style={{ fontSize: 10, color, fontWeight: 700 }}>N</div>
            </Html>
            <Html position={[r * 1.35, 0, 0]} center style={{ pointerEvents: 'none' }}>
              <div style={{ fontSize: 10, color, fontWeight: 700 }}>E</div>
            </Html>
            <Html position={[0, 0, r * 1.35]} center style={{ pointerEvents: 'none' }}>
              <div style={{ fontSize: 10, color, fontWeight: 700 }}>S</div>
            </Html>
            <Html position={[-r * 1.35, 0, 0]} center style={{ pointerEvents: 'none' }}>
              <div style={{ fontSize: 10, color, fontWeight: 700 }}>W</div>
            </Html>
          </>
        )}
      </group>
    );
  }

  if (kind === 'grid' && gridGeom) {
    return (
      <lineSegments geometry={gridGeom} renderOrder={997}>
        <lineBasicMaterial color={color} transparent opacity={0.55} />
      </lineSegments>
    );
  }

  return null;
};
