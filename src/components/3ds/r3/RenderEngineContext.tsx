import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import * as THREE from 'three';
import { useEnvironment, EnvironmentSettings } from './EnvironmentContext';

/**
 * Render engine presets. Each engine drives:
 *  - the offline Quick Render (tone mapping + exposure + CSS filter)
 *  - the AI render prompt style
 *  - the scene Environment (level / tint / ambient) so the viewport
 *    itself already looks like the chosen engine.
 */
export type RenderEngine =
  | 'scanline'
  | 'vray'
  | 'corona'
  | 'arnold'
  | 'pathtracer_gpu'
  | 'pathtracer_erichlof'
  | 'pathtracer_webgpu';

export interface EnginePreset {
  label: string;
  description: string;
  toneMapping: THREE.ToneMapping;
  exposure: number;
  cssFilter: string;
  aiStyle: string;
  /** Environment tweaks applied when this engine becomes active. */
  env: Partial<EnvironmentSettings>;
}

export const ENGINES: Record<RenderEngine, EnginePreset> = {
  scanline: {
    label: 'Scanline',
    description: 'Default 3ds Max Scanline — flat shaded, neutral, no post.',
    toneMapping: THREE.NoToneMapping,
    exposure: 1.0,
    cssFilter: 'none',
    aiStyle: 'clean flat 3d render, neutral studio lighting, no post-processing',
    env: { level: 5, tint: '#ffffff', ambient: '#4a4a4a' },
  },
  vray: {
    label: 'RayFlux',
    description: 'RayFlux — physically-based, punchy contrast, rich reflections.',
    toneMapping: THREE.ACESFilmicToneMapping,
    exposure: 1.15,
    cssFilter: 'contrast(1.12) saturate(1.15) brightness(1.02)',
    aiStyle:
      'photorealistic architectural render, physically based materials, sun and sky lighting, ' +
      'glossy reflections, subtle GI bounce, sharp contact shadows, ArchViz cinematic look',
    env: { level: 6, tint: '#fff4e0', ambient: '#3a3a44' },
  },
  corona: {
    label: 'LumenPath',
    description: 'LumenPath — path traced, soft cinematic tones, warm light balance.',
    toneMapping: THREE.CineonToneMapping,
    exposure: 1.05,
    cssFilter: 'contrast(1.05) saturate(1.08) brightness(1.04) sepia(0.05)',
    aiStyle:
      'unbiased path traced render, soft cinematic tone mapping, warm light balance, ' +
      'creamy highlights, physically accurate soft shadows, artistic ArchViz mood',
    env: { level: 5.5, tint: '#ffe6c2', ambient: '#4a3f38' },
  },
  arnold: {
    label: 'CineTrace',
    description: 'CineTrace — Monte Carlo ray tracing, filmic VFX cinema look.',
    toneMapping: THREE.AgXToneMapping,
    exposure: 1.0,
    cssFilter: 'contrast(1.08) saturate(0.98) brightness(0.98)',
    aiStyle:
      'Monte Carlo ray traced render, filmic VFX cinema quality, subsurface scattering, ' +
      'volumetric lighting, deep blacks, subtle grain, studio VFX look',
    env: { level: 5, tint: '#e6ecff', ambient: '#2f333d' },
  },
  pathtracer_gpu: {
    label: 'GPU PathTracer',
    description:
      'GPU PathTracer (three-gpu-pathtracer by Garrett Johnson) — progressive Monte Carlo path tracing on the GPU with BVH acceleration, faithful MeshPhysicalMaterial (SSS, roughness, glass refraction, metallic-roughness), HDRI IBL, depth of field and denoiser. ArchViz / product HD look.',
    toneMapping: THREE.ACESFilmicToneMapping,
    exposure: 1.1,
    cssFilter: 'contrast(1.10) saturate(1.12) brightness(1.02)',
    aiStyle:
      'unbiased GPU path traced render, global illumination with indirect bounces, HDRI environment lighting, ' +
      'physically based MeshPhysicalMaterial (subsurface scattering, roughness, refraction), depth of field, ' +
      'ArchViz cinematic quality, denoised, ultra sharp',
    env: { level: 6, tint: '#fff2d8', ambient: '#3a3a44' },
  },
  pathtracer_erichlof: {
    label: 'CausticRay',
    description:
      "CausticRay (Erich Lof's THREE.js Path Tracing Renderer) — real-time interactive path tracer built on Three.js with hyper-accurate CAUSTICS, complex refractions, soft shadows, volumetric rendering (smoke/fog), real glass and metals; tuned for great FPS even on mobile.",
    toneMapping: THREE.AgXToneMapping,
    exposure: 1.05,
    cssFilter: 'contrast(1.12) saturate(1.08) brightness(1.01)',
    aiStyle:
      'real-time path traced render with accurate caustics, complex glass refraction and dispersion, ' +
      'volumetric fog and smoke, soft area shadows, physically correct metals, filmic tone mapping',
    env: { level: 5.5, tint: '#f0efff', ambient: '#333744' },
  },
  pathtracer_webgpu: {
    label: 'WebGPU Trace',
    description:
      'WebGPU Trace (Three-PT by SreeXD) — next-gen compute-shader path tracer running on WebGPU with BVH acceleration and exact microfacet BRDF. Requires a WebGPU-capable browser; falls back visually to filmic tone mapping in the viewport.',
    toneMapping: THREE.ACESFilmicToneMapping,
    exposure: 1.0,
    cssFilter: 'contrast(1.06) saturate(1.05) brightness(1.0)',
    aiStyle:
      'WebGPU compute-shader path traced render, exact microfacet BRDF, high sample count, ' +
      'physically based global illumination, crisp reflections, modern engine look',
    env: { level: 5.8, tint: '#eef2ff', ambient: '#2e323d' },
  },
};

const STORAGE_KEY = '3dsled-render-engine';
const DEFAULT_ENGINE: RenderEngine = 'vray';

interface Ctx {
  engine: RenderEngine;
  setEngine: (e: RenderEngine) => void;
  preset: EnginePreset;
}

const RenderEngineContext = createContext<Ctx | null>(null);

export const RenderEngineProvider = ({ children }: { children: ReactNode }) => {
  const { setEnv } = useEnvironment();
  const [engine, setEngineState] = useState<RenderEngine>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY) as RenderEngine | null;
      if (s && ENGINES[s]) return s;
    } catch {}
    return DEFAULT_ENGINE;
  });

  // Apply the engine's env preset on mount and whenever it changes.
  useEffect(() => {
    setEnv(ENGINES[engine].env);
    try { localStorage.setItem(STORAGE_KEY, engine); } catch {}
  }, [engine]); // eslint-disable-line react-hooks/exhaustive-deps

  const setEngine = (e: RenderEngine) => setEngineState(e);

  return (
    <RenderEngineContext.Provider value={{ engine, setEngine, preset: ENGINES[engine] }}>
      {children}
    </RenderEngineContext.Provider>
  );
};

export const useRenderEngine = (): Ctx => {
  const ctx = useContext(RenderEngineContext);
  if (!ctx) {
    return { engine: DEFAULT_ENGINE, setEngine: () => {}, preset: ENGINES[DEFAULT_ENGINE] };
  }
  return ctx;
};
