import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

interface Props {
  objects: Array<{ id: string; ref?: React.RefObject<any> }>;
}

/**
 * 3ds Max-style total bounding box for multi-selection.
 * Draws a yellow wireframe box wrapping every selected node and labels
 * the overall Width (X) / Depth (Z) / Height (Y).
 */
export function MultiSelectBoundsOverlay({ objects }: Props) {
  const boxRef = useRef<THREE.LineSegments>(null);
  const centerRef = useRef(new THREE.Vector3());
  const sizeRef = useRef(new THREE.Vector3());
  const { camera } = useThree();

  const geom = useMemo(() => {
    // Unit cube edges centered at origin; scaled per frame to match the bbox.
    const g = new THREE.BoxGeometry(1, 1, 1);
    const e = new THREE.EdgesGeometry(g);
    g.dispose();
    return e;
  }, []);
  const mat = useMemo(
    () => new THREE.LineBasicMaterial({ color: 0xffee00, depthTest: false, transparent: true, opacity: 0.9 }),
    [],
  );

  const labelW = useRef<HTMLDivElement>(null);
  const labelH = useRef<HTMLDivElement>(null);
  const labelD = useRef<HTMLDivElement>(null);

  useFrame(() => {
    if (!boxRef.current) return;
    const bbox = new THREE.Box3();
    let has = false;
    for (const o of objects) {
      const node = o.ref?.current as THREE.Object3D | null | undefined;
      if (!node) continue;
      node.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(node);
      if (b.isEmpty()) continue;
      if (!has) { bbox.copy(b); has = true; } else bbox.union(b);
    }
    if (!has) { boxRef.current.visible = false; return; }
    boxRef.current.visible = true;
    bbox.getCenter(centerRef.current);
    bbox.getSize(sizeRef.current);
    const s = sizeRef.current;
    boxRef.current.position.copy(centerRef.current);
    boxRef.current.scale.set(Math.max(s.x, 1e-4), Math.max(s.y, 1e-4), Math.max(s.z, 1e-4));

    const fmt = (v: number) => (Math.abs(v) < 100 ? v.toFixed(2) : v.toFixed(1));
    if (labelW.current) labelW.current.textContent = `W: ${fmt(s.x)}`;
    if (labelH.current) labelH.current.textContent = `H: ${fmt(s.y)}`;
    if (labelD.current) labelD.current.textContent = `D: ${fmt(s.z)}`;
  });

  // Anchor labels at three canonical points of the bbox using Html + follow.
  return (
    <>
      <lineSegments ref={boxRef} geometry={geom} material={mat} renderOrder={999} />
      <BoundsLabels
        labelWRef={labelW}
        labelHRef={labelH}
        labelDRef={labelD}
        centerRef={centerRef}
        sizeRef={sizeRef}
        camera={camera}
      />
    </>
  );
}

function labelStyle(color: string): React.CSSProperties {
  return {
    color,
    background: 'rgba(0,0,0,0.6)',
    padding: '1px 4px',
    borderRadius: 2,
    font: '10px monospace',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  };
}

function BoundsLabels({
  labelWRef, labelHRef, labelDRef, centerRef, sizeRef,
}: {
  labelWRef: React.RefObject<HTMLDivElement>;
  labelHRef: React.RefObject<HTMLDivElement>;
  labelDRef: React.RefObject<HTMLDivElement>;
  centerRef: React.MutableRefObject<THREE.Vector3>;
  sizeRef: React.MutableRefObject<THREE.Vector3>;
  camera: THREE.Camera;
}) {
  const wRef = useRef<any>(null);
  const hRef = useRef<any>(null);
  const dRef = useRef<any>(null);
  useFrame(() => {
    const c = centerRef.current;
    const s = sizeRef.current;
    if (wRef.current) wRef.current.position.set(c.x, c.y - s.y / 2, c.z + s.z / 2);
    if (hRef.current) hRef.current.position.set(c.x + s.x / 2, c.y, c.z + s.z / 2);
    if (dRef.current) dRef.current.position.set(c.x + s.x / 2, c.y - s.y / 2, c.z);
  });
  return (
    <>
      <group ref={wRef}>
        <Html center style={{ pointerEvents: 'none' }}>
          <div ref={labelWRef} style={labelStyle('#ff5555')} />
        </Html>
      </group>
      <group ref={hRef}>
        <Html center style={{ pointerEvents: 'none' }}>
          <div ref={labelHRef} style={labelStyle('#55ff55')} />
        </Html>
      </group>
      <group ref={dRef}>
        <Html center style={{ pointerEvents: 'none' }}>
          <div ref={labelDRef} style={labelStyle('#5599ff')} />
        </Html>
      </group>
    </>
  );
}
