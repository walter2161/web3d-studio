/**
 * ParticleObject — renders a 3ds Max-style particle emitter in the viewport.
 *
 * Every emitter kind (Spray, Snow, Super Spray, PArray, PCloud, Blizzard)
 * shares the same simulator: it's a deterministic, frame-based CPU sim driven
 * by the scene's `currentFrame`, so the timeline scrubber controls it exactly
 * like a keyframe animation — no wall-clock time, no drift, no rebuilding when
 * the user scrubs backwards.
 *
 * Everything below is intentionally analytical (no Euler integration state)
 * so scrubbing the timeline to any frame reproduces the exact same particle
 * positions. Each particle is spawned at a deterministic frame based on the
 * emit rate + PRNG seed, and its position at time t is a closed-form function
 * of (spawnFrame, life, seed, initial velocity, gravity).
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/** Data shape stored in `Object3DData.geometry` for particle emitters. */
export interface ParticleGeom {
  emitterKind: 'spray' | 'snow' | 'super_spray' | 'parray' | 'pcloud' | 'blizzard';
  /** Emitter size (footprint on the base plane). */
  width: number;
  length: number;
  /** Total particles the emitter can hold. */
  count: number;
  /** Particles emitted per frame. */
  emitRate: number;
  /** Frame range in which the emitter is active. */
  startFrame: number;
  stopFrame: number;
  /** Per-particle lifetime in frames. */
  life: number;
  /** Initial speed (world units / frame). */
  speed: number;
  /** Random speed variation (0..1 fraction of speed). */
  speedVariation: number;
  /** Angular spread of the emission cone, in degrees. */
  spread: number;
  /** Gravity acceleration (world units / frame²) — pulls along -Y. */
  gravity: number;
  /** Wind vector (world units / frame²). */
  wind: [number, number, number];
  /** Particle visual size (world units). */
  size: number;
  /** Particle draw mode. */
  particleShape: 'dot' | 'tri' | 'facing' | 'sphere';
  /** Base color for the particle cloud. */
  color: string;
  /** Deterministic PRNG seed — same seed → same simulation. */
  seed: number;
}

export const DEFAULT_PARTICLE_GEOM: Record<ParticleGeom['emitterKind'], ParticleGeom> = {
  spray: {
    emitterKind: 'spray', width: 2, length: 2, count: 200, emitRate: 5,
    startFrame: 0, stopFrame: 100, life: 60,
    speed: 0.15, speedVariation: 0.2, spread: 15,
    gravity: 0.005, wind: [0, 0, 0], size: 0.08,
    particleShape: 'dot', color: '#4aa3ff', seed: 12345,
  },
  snow: {
    emitterKind: 'snow', width: 4, length: 4, count: 300, emitRate: 6,
    startFrame: 0, stopFrame: 200, life: 120,
    speed: 0.05, speedVariation: 0.3, spread: 5,
    gravity: 0.002, wind: [0.005, 0, 0], size: 0.06,
    particleShape: 'tri', color: '#ffffff', seed: 24680,
  },
  super_spray: {
    emitterKind: 'super_spray', width: 1, length: 1, count: 500, emitRate: 12,
    startFrame: 0, stopFrame: 100, life: 45,
    speed: 0.25, speedVariation: 0.15, spread: 25,
    gravity: 0.008, wind: [0, 0, 0], size: 0.06,
    particleShape: 'facing', color: '#ff9c42', seed: 33333,
  },
  parray: {
    emitterKind: 'parray', width: 2, length: 2, count: 400, emitRate: 8,
    startFrame: 0, stopFrame: 120, life: 60,
    speed: 0.18, speedVariation: 0.25, spread: 45,
    gravity: 0.006, wind: [0, 0, 0], size: 0.07,
    particleShape: 'tri', color: '#e0e0e0', seed: 44444,
  },
  pcloud: {
    emitterKind: 'pcloud', width: 3, length: 3, count: 600, emitRate: 20,
    startFrame: 0, stopFrame: 60, life: 200,
    speed: 0.02, speedVariation: 0.5, spread: 180,
    gravity: 0, wind: [0, 0, 0], size: 0.05,
    particleShape: 'sphere', color: '#c0c0ff', seed: 55555,
  },
  blizzard: {
    emitterKind: 'blizzard', width: 6, length: 6, count: 800, emitRate: 15,
    startFrame: 0, stopFrame: 240, life: 90,
    speed: 0.12, speedVariation: 0.4, spread: 20,
    gravity: 0.003, wind: [0.02, 0, 0.005], size: 0.05,
    particleShape: 'dot', color: '#e8f0ff', seed: 66666,
  },
};

// ---- Deterministic PRNG (Mulberry32) ---------------------------------------
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Compute the world-space position + alpha for a single particle at frame `f`.
 * Returns null if the particle isn't alive at that frame.
 */
function evalParticle(
  index: number,
  frame: number,
  g: ParticleGeom,
): { x: number; y: number; z: number; alpha: number } | null {
  // Deterministic emission frame based on index & emit rate.
  const spawn = g.startFrame + Math.floor(index / Math.max(0.001, g.emitRate));
  if (spawn > g.stopFrame) return null;
  if (frame < spawn) return null;
  const age = frame - spawn;
  if (age > g.life) return null;

  // Per-particle deterministic random draws (position on emitter, velocity dir,
  // speed jitter). We advance the PRNG a fixed number of times per particle.
  const rnd = mulberry32(g.seed + index * 2654435761);
  const px = (rnd() - 0.5) * g.width;
  const pz = (rnd() - 0.5) * g.length;

  // Direction inside a cone around +Y.
  const spreadRad = (g.spread * Math.PI) / 180;
  const theta = rnd() * 2 * Math.PI;
  const phi = rnd() * spreadRad;
  const sinPhi = Math.sin(phi);
  const dirX = sinPhi * Math.cos(theta);
  const dirY = Math.cos(phi);
  const dirZ = sinPhi * Math.sin(theta);

  const speed = g.speed * (1 - g.speedVariation + rnd() * 2 * g.speedVariation);

  // Analytical trajectory: p = p0 + v·t + 0.5·a·t².
  const t = age;
  const ax = g.wind[0];
  const ay = -g.gravity + g.wind[1];
  const az = g.wind[2];
  const x = px + dirX * speed * t + 0.5 * ax * t * t;
  const y = 0  + dirY * speed * t + 0.5 * ay * t * t;
  const z = pz + dirZ * speed * t + 0.5 * az * t * t;

  // Fade out during the last 20% of life.
  const alpha = age > g.life * 0.8
    ? Math.max(0, 1 - (age - g.life * 0.8) / (g.life * 0.2))
    : 1;

  return { x, y, z, alpha };
}

interface ParticleObjectProps {
  data: ParticleGeom;
  currentFrame: number;
  selected: boolean;
  onSelect?: () => void;
}

/**
 * Renders the emitter icon + the particle cloud driven by `currentFrame`.
 */
export const ParticleObject = ({ data, currentFrame, selected, onSelect }: ParticleObjectProps) => {
  const geom = data;
  const pointsRef = useRef<THREE.Points>(null);
  const positionsRef = useRef<Float32Array>(new Float32Array(0));
  const colorsRef = useRef<Float32Array>(new Float32Array(0));

  // Rebuild the buffers when the particle count changes.
  const bufferGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(geom.count * 3);
    const colors = new Float32Array(geom.count * 3);
    positionsRef.current = positions;
    colorsRef.current = colors;
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color',    new THREE.BufferAttribute(colors,    3).setUsage(THREE.DynamicDrawUsage));
    return g;
  }, [geom.count]);

  const baseColor = useMemo(() => new THREE.Color(geom.color || '#ffffff'), [geom.color]);

  // Per-shape sprite texture so 'dot' (circle), 'tri' (triangle), and
  // 'facing' (square) actually look different in the viewport. Without this,
  // three.js `pointsMaterial` always renders square pixels regardless of
  // `particleShape`, which is why switching shapes appeared to do nothing.
  const shapeTexture = useMemo(() => {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    const cx = size / 2, cy = size / 2, r = size / 2 - 2;
    if (geom.particleShape === 'dot') {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    } else if (geom.particleShape === 'tri') {
      ctx.beginPath();
      ctx.moveTo(cx, 2);
      ctx.lineTo(size - 2, size - 2);
      ctx.lineTo(2, size - 2);
      ctx.closePath();
      ctx.fill();
    } else {
      // 'facing' → filled square sprite (still distinct from dot/tri).
      ctx.fillRect(2, 2, size - 4, size - 4);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }, [geom.particleShape]);

  // On every frame, evaluate every particle at the current timeline frame.
  // This runs even when isPlaying=false so scrubbing works instantly.
  useFrame(() => {
    const pos = positionsRef.current;
    const col = colorsRef.current;
    if (!pos || !col) return;
    for (let i = 0; i < geom.count; i++) {
      const r = evalParticle(i, currentFrame, geom);
      const o = i * 3;
      if (!r) {
        // Park dead particles far away; alpha=0 hides them anyway.
        pos[o] = 0; pos[o + 1] = -1e6; pos[o + 2] = 0;
        col[o] = 0; col[o + 1] = 0; col[o + 2] = 0;
        continue;
      }
      pos[o]     = r.x;
      pos[o + 1] = r.y;
      pos[o + 2] = r.z;
      col[o]     = baseColor.r * r.alpha;
      col[o + 1] = baseColor.g * r.alpha;
      col[o + 2] = baseColor.b * r.alpha;
    }
    const posAttr = bufferGeom.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = bufferGeom.getAttribute('color')    as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  });

  return (
    <group>
      {/* Emitter icon — a wireframe rectangle showing the emission surface. */}
      <mesh
        onClick={(e) => { e.stopPropagation(); onSelect?.(); }}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[Math.max(0.1, geom.width), Math.max(0.1, geom.length)]} />
        <meshBasicMaterial color={selected ? '#ffff00' : '#00e5ff'} wireframe transparent opacity={0.9} />
      </mesh>
      {/* Small emission arrow so users see the +Y direction visually. */}
      <mesh position={[0, 0.25, 0]} rotation={[0, 0, 0]}>
        <coneGeometry args={[0.08, 0.25, 8]} />
        <meshBasicMaterial color={selected ? '#ffff00' : '#00e5ff'} wireframe />
      </mesh>

      {/* Particle cloud. Points for dot/facing/tri (single draw call, very
          cheap); instanced spheres for the 'sphere' visual. */}
      {geom.particleShape !== 'sphere' && (
        <points key={geom.particleShape} ref={pointsRef} geometry={bufferGeom} frustumCulled={false}>
          <pointsMaterial
            size={Math.max(0.5, geom.size * 40)}
            sizeAttenuation
            vertexColors
            transparent
            depthWrite={false}
            map={shapeTexture}
            alphaTest={0.2}
          />
        </points>
      )}
      {geom.particleShape === 'sphere' && (
        <InstancedSpheres data={geom} bufferGeom={bufferGeom} />
      )}
    </group>
  );
};

/**
 * Instanced sphere renderer for the 'sphere' shape option — reads the same
 * positions buffer the CPU sim just filled.
 */
const InstancedSpheres = ({ data, bufferGeom }: { data: ParticleGeom; bufferGeom: THREE.BufferGeometry }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const pos = (bufferGeom.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    const col = (bufferGeom.getAttribute('color')    as THREE.BufferAttribute).array as Float32Array;
    const c = new THREE.Color();
    for (let i = 0; i < data.count; i++) {
      const o = i * 3;
      dummy.position.set(pos[o], pos[o + 1], pos[o + 2]);
      const s = pos[o + 1] < -1e5 ? 0 : data.size;
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      c.setRGB(col[o], col[o + 1], col[o + 2]);
      mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={meshRef} args={[undefined as any, undefined as any, data.count]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial vertexColors transparent depthWrite={false} />
    </instancedMesh>
  );
};
