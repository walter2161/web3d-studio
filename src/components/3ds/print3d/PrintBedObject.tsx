import { useMemo } from 'react';
import * as THREE from 'three';
import { getPrinter, DEFAULT_PRINTER_ID } from './printers';

/**
 * Renders a virtual build plate for the Print3D toolkit.
 *
 * `object.geometry` shape:
 *   {
 *     printerId: string,           // id from printers.ts
 *     sizeMM?: [x, y, z],          // override the printer's size, in mm
 *     unitScale?: number,          // scene units per millimetre (default 0.01 = 1 unit = 10 cm)
 *   }
 *
 * The base plate lives on Y=0 in local space, height grows along +Y.
 */
export interface PrintBedGeom {
  printerId?: string;
  sizeMM?: [number, number, number];
  unitScale?: number;
}

export const DEFAULT_UNIT_SCALE = 0.01; // 1 scene unit = 100mm

export const bedSizeUnits = (geom: PrintBedGeom | undefined): [number, number, number] => {
  const g = geom || {};
  const printer = getPrinter(g.printerId ?? DEFAULT_PRINTER_ID);
  const mm = g.sizeMM ?? printer?.size ?? [129, 80, 160];
  const s = g.unitScale ?? DEFAULT_UNIT_SCALE;
  return [mm[0] * s, mm[1] * s, mm[2] * s];
};

interface Props {
  data: PrintBedGeom;
  selected: boolean;
  onSelect: () => void;
}

export const PrintBedObject = ({ data, selected, onSelect }: Props) => {
  const [w, d, h] = bedSizeUnits(data);

  const gridGeom = useMemo(() => {
    const step = Math.max(0.05, Math.min(w, d) / 12);
    const positions: number[] = [];
    for (let x = -w / 2; x <= w / 2 + 1e-4; x += step) {
      positions.push(x, 0.001, -d / 2, x, 0.001, d / 2);
    }
    for (let z = -d / 2; z <= d / 2 + 1e-4; z += step) {
      positions.push(-w / 2, 0.001, z, w / 2, 0.001, z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [w, d]);

  return (
    <group onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      {/* Solid build plate */}
      <mesh position={[0, -0.005, 0]} receiveShadow>
        <boxGeometry args={[w, 0.01, d]} />
        <meshStandardMaterial
          color={selected ? '#8ab4ff' : '#4a5566'}
          metalness={0.3}
          roughness={0.6}
        />
      </mesh>
      {/* Grid */}
      <lineSegments geometry={gridGeom}>
        <lineBasicMaterial color="#2a3340" transparent opacity={0.9} />
      </lineSegments>
      {/* Transparent build volume */}
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshBasicMaterial
          color={selected ? '#8ab4ff' : '#5f7fa0'}
          transparent
          opacity={0.06}
          depthWrite={false}
        />
      </mesh>
      {/* Volume edges */}
      <lineSegments position={[0, h / 2, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(w, h, d)]} />
        <lineBasicMaterial color={selected ? '#8ab4ff' : '#5f7fa0'} />
      </lineSegments>
    </group>
  );
};
