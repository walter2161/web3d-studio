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
export type RenderEngine = 'scanline' | 'vray' | 'corona' | 'arnold';

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
    label: 'V-Ray',
    description: 'V-Ray — physically-based, punchy contrast, rich reflections.',
    toneMapping: THREE.ACESFilmicToneMapping,
    exposure: 1.15,
    cssFilter: 'contrast(1.12) saturate(1.15) brightness(1.02)',
    aiStyle:
      'V-Ray photorealistic architectural render, physically based materials, VRaySun and VRaySky lighting, ' +
      'glossy reflections, subtle GI bounce, sharp contact shadows, ArchViz cinematic look',
    env: { level: 6, tint: '#fff4e0', ambient: '#3a3a44' },
  },
  corona: {
    label: 'Corona',
    description: 'Chaos Corona — path traced, soft cinematic tones, LightMix warmth.',
    toneMapping: THREE.CineonToneMapping,
    exposure: 1.05,
    cssFilter: 'contrast(1.05) saturate(1.08) brightness(1.04) sepia(0.05)',
    aiStyle:
      'Chaos Corona unbiased path traced render, soft cinematic tone mapping, warm LightMix balance, ' +
      'creamy highlights, physically accurate soft shadows, artistic ArchViz mood',
    env: { level: 5.5, tint: '#ffe6c2', ambient: '#4a3f38' },
  },
  arnold: {
    label: 'Arnold',
    description: 'Autodesk Arnold — Monte Carlo ray tracing, filmic VFX cinema look.',
    toneMapping: THREE.AgXToneMapping,
    exposure: 1.0,
    cssFilter: 'contrast(1.08) saturate(0.98) brightness(0.98)',
    aiStyle:
      'Autodesk Arnold Monte Carlo ray traced render, filmic VFX cinema quality, subsurface scattering, ' +
      'volumetric lighting, deep blacks, subtle grain, Hollywood studio VFX look',
    env: { level: 5, tint: '#e6ecff', ambient: '#2f333d' },
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
