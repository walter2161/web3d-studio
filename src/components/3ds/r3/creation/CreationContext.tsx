import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

export type CreatableTool =
  | 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane'
  | 'hedra' | 'chamferBox' | 'chamferCyl' | 'oilTank' | 'spindle' | 'gengon' | 'torusKnot' | 'ringWave' | 'prism'
  | 'line' | 'rectangle' | 'circle' | 'ellipse' | 'arc' | 'donut' | 'ngon' | 'star' | 'helix';

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
  registerCommitHandler: (fn: (g: GhostObject) => void) => void;
}

const Ctx = createContext<CreationCtx | null>(null);

export const useCreation = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCreation must be used inside <CreationProvider>');
  return ctx;
};

export const CreationProvider = ({ children }: { children: ReactNode }) => {
  const [armed, setArmed] = useState<CreatableTool | null>(null);
  const [ghost, setGhost] = useState<GhostObject | null>(null);
  const [commitFn, setCommitFn] = useState<(g: GhostObject) => void>(() => () => {});

  const arm = useCallback((tool: CreatableTool) => {
    setGhost(null);
    setArmed(tool);
  }, []);
  const disarm = useCallback(() => {
    setGhost(null);
    setArmed(null);
  }, []);
  const commit = useCallback((g: GhostObject) => {
    commitFn(g);
    setGhost(null);
    // 3ds Max R3 keeps the tool armed until you press ESC or pick another,
    // so users can chain-create the same primitive quickly.
  }, [commitFn]);
  const registerCommitHandler = useCallback((fn: (g: GhostObject) => void) => {
    setCommitFn(() => fn);
  }, []);

  const value = useMemo(
    () => ({ armed, arm, disarm, ghost, setGhost, commit, registerCommitHandler }),
    [armed, arm, disarm, ghost, commit, registerCommitHandler]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
