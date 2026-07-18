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
  | 'collectible' | 'interactive' | 'enemy' | 'vehicle' | 'cameraTarget'
  | 'spawn' | 'audio' | 'hud' | 'terrain' | 'manager' | 'probe' | 'navmesh';

export type ColliderShape = 'auto' | 'box' | 'sphere' | 'capsule' | 'mesh' | 'none';

export interface AudioSettings {
  url: string;           // http(s) URL or blob/data URL from local upload
  name?: string;         // original filename (display only)
  volume: number;        // 0..1
  loop: boolean;
  autoplay: boolean;
  spatial: boolean;      // 3D positional audio
  minDistance: number;
  maxDistance: number;
  pitch: number;         // playbackRate multiplier
  triggerOn: 'start' | 'enter' | 'action';
}

export interface HudSettings {
  label: string;
  showHealth: boolean;
  health: number;
  maxHealth: number;
  showScore: boolean;
  showTimer: boolean;
}

export interface TerrainSettings {
  size: number;          // XZ size in units
  segments: number;
  heightScale: number;   // procedural noise amplitude
  color: string;
}

export interface SpawnSettings {
  spawnTag: GameTag;     // what to spawn (player/enemy/collectible)
  respawnDelay: number;
}

export interface ProbeSettings {
  intensity: number;
  color: string;
  radius: number;
}

export interface NavSettings {
  boundsX: number;
  boundsZ: number;
  cellSize: number;
}

export interface GameObjectProps {
  tag: GameTag;
  collider: ColliderShape;
  isTrigger: boolean;
  mass: number;
  friction: number;
  bounciness: number;
  // Layers / filtering: which object ids this object should collide against.
  // Empty means "collide with everything (except triggers)".
  collisionTargets: string[];
  collisionLayer: string;
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
  // Trigger event slots (free-text action DSL parsed by preview).
  onEnter?: string;
  onExit?: string;
  // Feature-specific sub-blocks.
  audio: AudioSettings;
  hud: HudSettings;
  terrain: TerrainSettings;
  spawn: SpawnSettings;
  probe: ProbeSettings;
  nav: NavSettings;
}

export type CameraMode = 'thirdPerson' | 'firstPerson' | 'topDown' | 'free' | 'rts';

export interface InputBinding { action: string; key: string; }

export interface ManagerSettings {
  title: string;
  startTimer: number;    // seconds; 0 = disabled
  startScore: number;
  winScore: number;
  loseOnTimeout: boolean;
  bgColor: string;
  fogNear: number;
  fogFar: number;
}

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

  manager: ManagerSettings;

  setProps: (id: string, patch: Partial<GameObjectProps>) => void;
  ensureProps: (id: string) => GameObjectProps;
  patchAudio: (id: string, patch: Partial<AudioSettings>) => void;
  patchHud: (id: string, patch: Partial<HudSettings>) => void;
  patchTerrain: (id: string, patch: Partial<TerrainSettings>) => void;
  patchSpawn: (id: string, patch: Partial<SpawnSettings>) => void;
  patchProbe: (id: string, patch: Partial<ProbeSettings>) => void;
  patchNav: (id: string, patch: Partial<NavSettings>) => void;
  addCollisionTarget: (id: string, targetId: string) => void;
  removeCollisionTarget: (id: string, targetId: string) => void;
  toggleComponent: (id: string, key: keyof GameObjectProps['components']) => void;
  setMainPlayer: (id: string | null) => void;
  setCameraMode: (m: CameraMode) => void;
  setGravity: (v: number) => void;
  setInputKey: (action: string, key: string) => void;
  patchGlobal: (p: Partial<Pick<WaltGameState, 'camDistance' | 'camHeight' | 'camSensitivity' | 'camSmoothing'>>) => void;
  patchManager: (p: Partial<ManagerSettings>) => void;
  serialize: () => any;
}

const DEFAULT_AUDIO: AudioSettings = {
  url: '', volume: 0.8, loop: false, autoplay: false, spatial: false,
  minDistance: 1, maxDistance: 30, pitch: 1, triggerOn: 'start',
};
const DEFAULT_HUD: HudSettings = { label: 'HUD', showHealth: true, health: 100, maxHealth: 100, showScore: true, showTimer: false };
const DEFAULT_TERRAIN: TerrainSettings = { size: 200, segments: 64, heightScale: 0, color: '#4c8f3f' };
const DEFAULT_SPAWN: SpawnSettings = { spawnTag: 'character', respawnDelay: 3 };
const DEFAULT_PROBE: ProbeSettings = { intensity: 1, color: '#ffffff', radius: 10 };
const DEFAULT_NAV: NavSettings = { boundsX: 50, boundsZ: 50, cellSize: 1 };

export const DEFAULT_GAME_OBJECT: GameObjectProps = {
  tag: 'static',
  collider: 'auto',
  isTrigger: false,
  mass: 1,
  friction: 0.5,
  bounciness: 0,
  collisionTargets: [],
  collisionLayer: 'default',
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
  audio: { ...DEFAULT_AUDIO },
  hud: { ...DEFAULT_HUD },
  terrain: { ...DEFAULT_TERRAIN },
  spawn: { ...DEFAULT_SPAWN },
  probe: { ...DEFAULT_PROBE },
  nav: { ...DEFAULT_NAV },
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

const DEFAULT_MANAGER: ManagerSettings = {
  title: 'My Walt3D Game',
  startTimer: 0,
  startScore: 0,
  winScore: 10,
  loseOnTimeout: false,
  bgColor: '#7fb0dd',
  fogNear: 40,
  fogFar: 200,
};

function freshProps(): GameObjectProps {
  return {
    ...DEFAULT_GAME_OBJECT,
    components: { ...DEFAULT_GAME_OBJECT.components },
    collisionTargets: [],
    audio: { ...DEFAULT_AUDIO },
    hud: { ...DEFAULT_HUD },
    terrain: { ...DEFAULT_TERRAIN },
    spawn: { ...DEFAULT_SPAWN },
    probe: { ...DEFAULT_PROBE },
    nav: { ...DEFAULT_NAV },
  };
}

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
  manager: { ...DEFAULT_MANAGER },

  ensureProps: (id) => {
    const cur = get().props[id];
    if (cur) return cur;
    const next = freshProps();
    set((s) => ({ props: { ...s.props, [id]: next } }));
    return next;
  },
  setProps: (id, patch) => set((s) => {
    const cur = s.props[id] ?? freshProps();
    return {
      props: {
        ...s.props,
        [id]: {
          ...cur,
          ...patch,
          components: { ...cur.components, ...((patch as any).components ?? {}) },
        },
      },
    };
  }),
  patchAudio: (id, patch) => set((s) => {
    const cur = s.props[id] ?? freshProps();
    return { props: { ...s.props, [id]: { ...cur, audio: { ...cur.audio, ...patch } } } };
  }),
  patchHud: (id, patch) => set((s) => {
    const cur = s.props[id] ?? freshProps();
    return { props: { ...s.props, [id]: { ...cur, hud: { ...cur.hud, ...patch } } } };
  }),
  patchTerrain: (id, patch) => set((s) => {
    const cur = s.props[id] ?? freshProps();
    return { props: { ...s.props, [id]: { ...cur, terrain: { ...cur.terrain, ...patch } } } };
  }),
  patchSpawn: (id, patch) => set((s) => {
    const cur = s.props[id] ?? freshProps();
    return { props: { ...s.props, [id]: { ...cur, spawn: { ...cur.spawn, ...patch } } } };
  }),
  patchProbe: (id, patch) => set((s) => {
    const cur = s.props[id] ?? freshProps();
    return { props: { ...s.props, [id]: { ...cur, probe: { ...cur.probe, ...patch } } } };
  }),
  patchNav: (id, patch) => set((s) => {
    const cur = s.props[id] ?? freshProps();
    return { props: { ...s.props, [id]: { ...cur, nav: { ...cur.nav, ...patch } } } };
  }),
  addCollisionTarget: (id, tid) => set((s) => {
    const cur = s.props[id] ?? freshProps();
    if (cur.collisionTargets.includes(tid) || tid === id) return {} as any;
    return { props: { ...s.props, [id]: { ...cur, collisionTargets: [...cur.collisionTargets, tid] } } };
  }),
  removeCollisionTarget: (id, tid) => set((s) => {
    const cur = s.props[id] ?? freshProps();
    return { props: { ...s.props, [id]: { ...cur, collisionTargets: cur.collisionTargets.filter((x) => x !== tid) } } };
  }),
  toggleComponent: (id, key) => set((s) => {
    const cur = s.props[id] ?? freshProps();
    return { props: { ...s.props, [id]: { ...cur, components: { ...cur.components, [key]: !cur.components[key] } } } };
  }),
  setMainPlayer: (id) => set(() => {
    if (id) {
      const s = get();
      const p = s.props[id] ?? freshProps();
      const nextProps: GameObjectProps = {
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
  patchManager: (p) => set((s) => ({ manager: { ...s.manager, ...p } })),
  serialize: () => {
    const s = get();
    return {
      mainPlayerId: s.mainPlayerId,
      cameraMode: s.cameraMode,
      gravity: s.gravity,
      inputMap: s.inputMap,
      camera: { distance: s.camDistance, height: s.camHeight, sensitivity: s.camSensitivity, smoothing: s.camSmoothing },
      manager: s.manager,
      props: s.props,
    };
  },
}));
