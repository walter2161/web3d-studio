/**
 * WaltGame — main plugin panel. Groups all the plugin's actions (create
 * player/camera/collider/trigger/spawn/UI/NavMesh), exposes per-object Game
 * Properties (tag + components), input bindings, physics + camera settings,
 * plus Play/Export.
 */
import { useState } from 'react';
import { R3Dialog, GroupBox, Row, R3Button, Spinner } from '../r3/R3Dialog';
import { useWaltGame, GameTag, CameraMode, GameObjectProps } from './gameStore';
import { exportGameHTML } from './gameExport';

interface Props {
  open: boolean;
  onClose: () => void;
  selectedObjectId: string | null;
  selectedObjectName?: string;
  onRun: () => void;
}

const TAGS: GameTag[] = ['static', 'dynamic', 'character', 'trigger', 'collectible', 'interactive', 'enemy', 'vehicle', 'cameraTarget'];
const CAMERAS: { key: CameraMode; label: string }[] = [
  { key: 'thirdPerson', label: 'Third Person' },
  { key: 'firstPerson', label: 'First Person' },
  { key: 'topDown', label: 'Top Down' },
  { key: 'free', label: 'Free Camera' },
  { key: 'rts', label: 'RTS' },
];
const COMPONENTS: { key: keyof GameObjectProps['components']; label: string }[] = [
  { key: 'meshRenderer', label: 'Mesh Renderer' },
  { key: 'collider', label: 'Collider' },
  { key: 'rigidbody', label: 'Rigidbody' },
  { key: 'characterController', label: 'Character Controller' },
  { key: 'animator', label: 'Animator' },
  { key: 'cameraFollow', label: 'Camera Follow' },
  { key: 'input', label: 'Input Controller' },
  { key: 'audioSource', label: 'Audio Source' },
  { key: 'navAgent', label: 'NavMesh Agent' },
];

export const WaltGamePanel = ({ open, onClose, selectedObjectId, selectedObjectName, onRun }: Props) => {
  const g = useWaltGame();
  const [tab, setTab] = useState<'create' | 'object' | 'input' | 'world'>('object');
  const props = selectedObjectId ? (g.props[selectedObjectId] ?? g.ensureProps(selectedObjectId)) : null;

  const set = (patch: Partial<GameObjectProps>) => { if (selectedObjectId) g.setProps(selectedObjectId, patch); };

  const notify = (msg: string) => {
    // Best-effort toast via existing sonner setup.
    try { (window as any).__waltNotify?.(msg); } catch {}
    console.log('[WaltGame]', msg);
  };

  const createHelper = (kind: string) => {
    window.dispatchEvent(new CustomEvent('waltgame:create', { detail: { kind } }));
    notify(`Create ${kind} — click in a viewport to place it.`);
  };

  return (
    <R3Dialog open={open} onClose={onClose} title="WaltGame — Game Systems" width={430}>
      {/* Tabs */}
      <div className="flex gap-[2px] mb-1">
        {(['create', 'object', 'input', 'world'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-[11px] px-2 py-[2px] ${tab === t ? 'bevel-inset' : 'bevel-raised'} bg-win-face`}
          >
            {t === 'create' ? 'Create' : t === 'object' ? 'Game Properties' : t === 'input' ? 'Input Manager' : 'World'}
          </button>
        ))}
      </div>

      {tab === 'create' && (
        <GroupBox title="WaltGame">
          <div className="grid grid-cols-2 gap-1 mt-1">
            {[
              'Player', 'Camera', 'Collider', 'Trigger',
              'Spawn Point', 'NavMesh', 'HUD', 'Light Probe',
              'AI Character', 'Audio Source', 'Terrain', 'Game Manager',
            ].map((k) => (
              <R3Button key={k} onClick={() => createHelper(k)}>{`Create ${k}`}</R3Button>
            ))}
          </div>
          <div className="mt-2 flex gap-1">
            <R3Button onClick={onRun}>▶ Run Game (F12)</R3Button>
            <R3Button onClick={() => exportGameHTML()}>Export HTML Game</R3Button>
          </div>
        </GroupBox>
      )}

      {tab === 'object' && (
        <div className="space-y-1">
          <GroupBox title={`Selection: ${selectedObjectName || '(none)'}`}>
            {!selectedObjectId && <div className="text-[11px] opacity-70 py-1">Select an object in the scene to edit its game properties.</div>}
            {selectedObjectId && props && (
              <>
                <Row label="Tag">
                  <select
                    className="bevel-inset bg-white text-[11px] px-1"
                    value={props.tag}
                    onChange={(e) => set({ tag: e.target.value as GameTag })}
                  >
                    {TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Row>
                <Row>
                  <R3Button
                    active={g.mainPlayerId === selectedObjectId}
                    onClick={() => g.setMainPlayer(g.mainPlayerId === selectedObjectId ? null : selectedObjectId)}
                  >
                    {g.mainPlayerId === selectedObjectId ? '★ Main Player' : 'Set As Main Character'}
                  </R3Button>
                </Row>
              </>
            )}
          </GroupBox>

          {selectedObjectId && props && (
            <>
              <GroupBox title="Components">
                <div className="grid grid-cols-2 gap-x-2">
                  {COMPONENTS.map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-1 text-[11px]">
                      <input
                        type="checkbox"
                        checked={!!props.components[key]}
                        onChange={() => g.toggleComponent(selectedObjectId, key)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </GroupBox>

              <GroupBox title="Collider & Physics">
                <Row label="Shape">
                  <select
                    className="bevel-inset bg-white text-[11px] px-1"
                    value={props.collider}
                    onChange={(e) => set({ collider: e.target.value as any })}
                  >
                    {['auto', 'box', 'sphere', 'capsule', 'mesh', 'none'].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <label className="ml-2 text-[11px] flex items-center gap-1">
                    <input type="checkbox" checked={props.isTrigger} onChange={(e) => set({ isTrigger: e.target.checked })} />
                    Is Trigger
                  </label>
                </Row>
                <Row label="Mass"><Spinner value={props.mass} step={0.1} min={0} onChange={(v) => set({ mass: v })} /></Row>
                <Row label="Friction"><Spinner value={props.friction} step={0.05} min={0} max={2} onChange={(v) => set({ friction: v })} /></Row>
                <Row label="Bounciness"><Spinner value={props.bounciness} step={0.05} min={0} max={1} onChange={(v) => set({ bounciness: v })} /></Row>
              </GroupBox>

              {props.components.characterController && (
                <GroupBox title="Character Controller">
                  <Row label="Walk Speed"><Spinner value={props.walkSpeed} step={0.1} min={0} onChange={(v) => set({ walkSpeed: v })} /></Row>
                  <Row label="Run Speed"><Spinner value={props.runSpeed} step={0.1} min={0} onChange={(v) => set({ runSpeed: v })} /></Row>
                  <Row label="Jump Height"><Spinner value={props.jumpHeight} step={0.1} min={0} onChange={(v) => set({ jumpHeight: v })} /></Row>
                </GroupBox>
              )}

              {props.tag === 'trigger' && (
                <GroupBox title="Events">
                  <Row label="OnEnter">
                    <input className="bevel-inset bg-white text-[11px] px-1 flex-1" value={props.onEnter ?? ''} onChange={(e) => set({ onEnter: e.target.value })} placeholder="log:Entered zone" />
                  </Row>
                  <Row label="OnExit">
                    <input className="bevel-inset bg-white text-[11px] px-1 flex-1" value={props.onExit ?? ''} onChange={(e) => set({ onExit: e.target.value })} placeholder="log:Left zone" />
                  </Row>
                </GroupBox>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'input' && (
        <GroupBox title="Input Manager">
          <div className="grid grid-cols-[1fr_1fr] gap-1">
            {g.inputMap.map((b) => (
              <div key={b.action} className="contents">
                <div className="text-[11px] py-[2px]">{b.action}</div>
                <input
                  className="bevel-inset bg-white text-[11px] px-1"
                  value={b.key}
                  onChange={(e) => g.setInputKey(b.action, e.target.value)}
                  onKeyDown={(e) => { e.preventDefault(); g.setInputKey(b.action, e.key); }}
                />
              </div>
            ))}
          </div>
          <div className="text-[10px] opacity-70 mt-1">Click the field and press a key to rebind.</div>
        </GroupBox>
      )}

      {tab === 'world' && (
        <div className="space-y-1">
          <GroupBox title="Camera">
            <Row label="Mode">
              <select
                className="bevel-inset bg-white text-[11px] px-1"
                value={g.cameraMode}
                onChange={(e) => g.setCameraMode(e.target.value as CameraMode)}
              >
                {CAMERAS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </Row>
            <Row label="Distance"><Spinner value={g.camDistance} step={0.5} min={0} onChange={(v) => g.patchGlobal({ camDistance: v })} /></Row>
            <Row label="Height"><Spinner value={g.camHeight} step={0.1} onChange={(v) => g.patchGlobal({ camHeight: v })} /></Row>
            <Row label="Sensitivity"><Spinner value={g.camSensitivity} step={0.0005} min={0.0001} onChange={(v) => g.patchGlobal({ camSensitivity: v })} /></Row>
            <Row label="Smoothing"><Spinner value={g.camSmoothing} step={0.05} min={0} max={1} onChange={(v) => g.patchGlobal({ camSmoothing: v })} /></Row>
          </GroupBox>
          <GroupBox title="Physics">
            <Row label="Gravity"><Spinner value={g.gravity} step={0.1} onChange={(v) => g.setGravity(v)} /></Row>
          </GroupBox>
          <div className="flex gap-1 pt-1">
            <R3Button onClick={onRun}>▶ Run Game</R3Button>
            <R3Button onClick={() => exportGameHTML()}>Export HTML5</R3Button>
          </div>
        </div>
      )}
    </R3Dialog>
  );
};
