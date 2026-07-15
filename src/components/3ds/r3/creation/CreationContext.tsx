import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';

export type CreatableTool =
  | 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane'
  | 'hedra' | 'chamferBox' | 'chamferCyl' | 'oilTank' | 'spindle' | 'gengon' | 'torusKnot' | 'ringWave' | 'prism'
  | 'line' | 'rectangle' | 'circle' | 'ellipse' | 'arc' | 'donut' | 'ngon' | 'star' | 'helix' | 'text'
  | 'wall';


export interface GhostObject {
  id: '__ghost';
  type: CreatableTool;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  geometry: any;
  visible: true;
  __creating: true;
}

interface CreationCtx {
  armed: CreatableTool | null;
  arm: (tool: CreatableTool) => void;
  disarm: () => void;
  ghost: GhostObject | null;
  setGhost: (g: GhostObject | null) => void;
  commit: (g: GhostObject) => void;
}

const Ctx = createContext<CreationCtx | null>(null);

export const useCreation = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCreation must be used inside <CreationProvider>');
  return ctx;
};

interface ProviderProps {
  children: ReactNode;
  onCommit: (g: GhostObject) => void;
  onArmedChange?: (t: CreatableTool | null) => void;
  onGhostChange?: (g: GhostObject | null) => void;
}

export const CreationProvider = ({ children, onCommit, onArmedChange, onGhostChange }: ProviderProps) => {
  const [armed, setArmed] = useState<CreatableTool | null>(null);
  const [ghost, setGhost] = useState<GhostObject | null>(null);

  useEffect(() => { onArmedChange?.(armed); }, [armed, onArmedChange]);
  useEffect(() => { onGhostChange?.(ghost); }, [ghost, onGhostChange]);


  const arm = useCallback((tool: CreatableTool) => {
    setGhost(null);
    setArmed(tool);
  }, []);
  const disarm = useCallback(() => {
    setGhost(null);
    setArmed(null);
  }, []);
  const commit = useCallback((g: GhostObject) => {
    onCommit(g);
    setGhost(null);
    // Disarm after commit so the user can select/transform without re-triggering creation.
    setArmed(null);
  }, [onCommit]);

  const value = useMemo(
    () => ({ armed, arm, disarm, ghost, setGhost, commit }),
    [armed, arm, disarm, ghost, commit]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

