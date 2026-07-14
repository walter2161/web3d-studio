import { createContext, useContext, useState, ReactNode } from 'react';

export interface EnvironmentSettings {
  backgroundColor: string;   // hex, e.g. '#000000'
  tint: string;              // global lighting tint (multiplies light color)
  level: number;             // global light intensity multiplier
  ambient: string;           // ambient color
  ambientIntensity: number;  // derived; kept for spinner if desired
  // Atmosphere: simple fog controls
  fogEnabled: boolean;
  fogColor: string;
  fogNear: number;
  fogFar: number;
}

const DEFAULT_ENV: EnvironmentSettings = {
  backgroundColor: '#0f1419',
  tint: '#ffffff',
  level: 1.0,
  ambient: '#333333',
  ambientIntensity: 0.4,
  fogEnabled: false,
  fogColor: '#808080',
  fogNear: 10,
  fogFar: 50,
};

interface Ctx {
  env: EnvironmentSettings;
  setEnv: (patch: Partial<EnvironmentSettings>) => void;
}

const EnvironmentContext = createContext<Ctx | null>(null);

export const EnvironmentProvider = ({ children }: { children: ReactNode }) => {
  const [env, setEnvState] = useState<EnvironmentSettings>(() => {
    try {
      const s = localStorage.getItem('3dsled-env');
      return s ? { ...DEFAULT_ENV, ...JSON.parse(s) } : DEFAULT_ENV;
    } catch { return DEFAULT_ENV; }
  });
  const setEnv = (patch: Partial<EnvironmentSettings>) => {
    setEnvState((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem('3dsled-env', JSON.stringify(next)); } catch {}
      return next;
    });
  };
  return (
    <EnvironmentContext.Provider value={{ env, setEnv }}>
      {children}
    </EnvironmentContext.Provider>
  );
};

export const useEnvironment = (): Ctx => {
  const ctx = useContext(EnvironmentContext);
  if (!ctx) {
    // Safe fallback (no provider) — returns defaults, setEnv is a no-op.
    return { env: DEFAULT_ENV, setEnv: () => {} };
  }
  return ctx;
};
