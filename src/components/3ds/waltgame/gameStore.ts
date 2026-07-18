/**
 * WaltGame — in-editor game creation plugin store.
 *
 * Holds per-object game tags/components, global input bindings, physics
 * settings, camera mode and main-player designation. Kept intentionally
 * self-contained so it can be serialized into an HTML5 export without
 * pulling in editor state.
 */
import { create } from 'zustand';

export type GameTag =
  | 'static' | 'dynamic' | 'character' | 'trigger'
  | 'collectible' | 'interactive' | 'enemy' | 'vehicle' | 'cameraTarget';

export type ColliderShape = 'auto' | 'box' | 'sphere' | 'capsule' | 'mesh' | 'none';

export interface GameObjectProps {
  tag: GameTag;
  collider: ColliderShape;
  isTrigger: boolean;
  mass: number;
  friction: number;
  bounciness: number;
  // Components toggles (visualized in panel).
  components: {
    meshRenderer: boolean;
    collider: boolean;
    rigidbody: boolean;
    characterController: boolean;
    animator: boolean;
    cameraFollow: boolean;
    input: boolean;
    audioSource: boolean;
    navAgent: boolean;
  };
  // Character-specific tuning.
  walkSpeed: number;
  runSpeed: number;
  jumpHeight: number;
  // Trigger event slots (id references or free-text action string).
  onEnter?: string;
  onExit?: string;
}

export type CameraMode = 'thirdPerson' | 'firstPerson' | 'topDown' | 'free' | 'rts';

export interface InputBinding { action: string; key: string; }

interface WaltGameState {
  props: Record<string, GameObjectProps>;
  mainPlayerId: string | null;
  cameraMode: CameraMode;
  gravity: number;
  inputMap: InputBinding[];

  // Third-person camera params.
  camDistance: number;
  camHeight: number;
  camSensitivity: number;
  camSmoothing: number;

  setProps: (id: string, patch: Partial<GameObjectProps>) => void;
  ensureProps: (id: string) => GameObjectProps;
  toggleComponent: (id: string, key: keyof GameObjectProps['components']) => void;
  setMainPlayer: (id: string | null) => void;
  setCameraMode: (m: CameraMode) => void;
  setGravity: (v: number) => void;
  setInputKey: (action: string, key: string) => void;
  patchGlobal: (p: Partial<Pick<WaltGameState, 'camDistance' | 'camHeight' | 'camSensitivity' | 'camSmoothing'>>) => void;
  serialize: () => any;
}

export const DEFAULT_GAME_OBJECT: GameObjectProps = {
  tag: 'static',
  collider: 'auto',
  isTrigger: false,
  mass: 1,
  friction: 0.5,
  bounciness: 0,
  components: {
    meshRenderer: true,
    collider: true,
    rigidbody: false,
    characterController: false,
    animator: false,
    cameraFollow: false,
    input: false,
    audioSource: false,
    navAgent: false,
  },
  walkSpeed: 4,
  runSpeed: 8,
  jumpHeight: 1.2,
};

const DEFAULT_INPUT: InputBinding[] = [
  { action: 'MoveForward', key: 'w' },
  { action: 'MoveBackward', key: 's' },
  { action: 'MoveLeft', key: 'a' },
  { action: 'MoveRight', key: 'd' },
  { action: 'Jump', key: ' ' },
  { action: 'Run', key: 'Shift' },
  { action: 'Action', key: 'e' },
];

export const useWaltGame = create<WaltGameState>((set, get) => ({
  props: {},
  mainPlayerId: null,
  cameraMode: 'thirdPerson',
  gravity: 9.8,
  inputMap: DEFAULT_INPUT,
  camDistance: 5,
  camHeight: 1.7,
  camSensitivity: 0.0022,
  camSmoothing: 0.15,

  ensureProps: (id) => {
    const cur = get().props[id];
    if (cur) return cur;
    const next = { ...DEFAULT_GAME_OBJECT, components: { ...DEFAULT_GAME_OBJECT.components } };
    set((s) => ({ props: { ...s.props, [id]: next } }));
    return next;
  },
  setProps: (id, patch) => set((s) => ({
    props: { ...s.props, [id]: { ...(s.props[id] ?? DEFAULT_GAME_OBJECT), ...patch,
      components: { ...(s.props[id]?.components ?? DEFAULT_GAME_OBJECT.components), ...(patch as any).components ?? {} } } },
  })),
  toggleComponent: (id, key) => set((s) => {
    const cur = s.props[id] ?? { ...DEFAULT_GAME_OBJECT, components: { ...DEFAULT_GAME_OBJECT.components } };
    return { props: { ...s.props, [id]: { ...cur, components: { ...cur.components, [key]: !cur.components[key] } } } };
  }),
  setMainPlayer: (id) => set(() => {
    if (id) {
      const s = get();
      const p = s.props[id] ?? { ...DEFAULT_GAME_OBJECT, components: { ...DEFAULT_GAME_OBJECT.components } };
      const nextProps = {
        ...p,
        tag: 'character' as GameTag,
        components: {
          ...p.components,
          characterController: true,
          collider: true,
          input: true,
          cameraFollow: true,
        },
      };
      return { mainPlayerId: id, props: { ...s.props, [id]: nextProps } };
    }
    return { mainPlayerId: null };
  }),
  setCameraMode: (m) => set({ cameraMode: m }),
  setGravity: (v) => set({ gravity: v }),
  setInputKey: (action, key) => set((s) => ({
    inputMap: s.inputMap.map((b) => (b.action === action ? { ...b, key } : b)),
  })),
  patchGlobal: (p) => set(p as any),
  serialize: () => {
    const s = get();
    return {
      mainPlayerId: s.mainPlayerId,
      cameraMode: s.cameraMode,
      gravity: s.gravity,
      inputMap: s.inputMap,
      camera: { distance: s.camDistance, height: s.camHeight, sensitivity: s.camSensitivity, smoothing: s.camSmoothing },
      props: s.props,
    };
  },
}));
