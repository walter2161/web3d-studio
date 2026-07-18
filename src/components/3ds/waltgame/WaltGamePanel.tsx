/**
 * WaltGame — main plugin panel.
 *
 * Every entity/component the plugin advertises is really editable here:
 *  • Audio Source — URL field, local file upload (→ blob URL), volume, loop,
 *    autoplay, spatial 3D toggle with min/max distance, pitch, test Play/Stop.
 *  • Collision & Physics — collider shape, isTrigger, mass/friction/bounciness,
 *    collision-target picker (add from scene list, remove per row, "collide
 *    with all" when list is empty), collision layer name.
 *  • Trigger events — free-text DSL fields (log:msg, damage:10, load:scene).
 *  • Character Controller — walk/run speed, jump height.
 *  • HUD — label, health/max health, score/timer toggles.
 *  • Terrain — size, segments, height amplitude, color.
 *  • Spawn Point — which tag to spawn, respawn delay.
 *  • Light Probe — intensity, color, radius.
 *  • NavMesh — bounds and cell size.
 *  • Game Manager — title, timer, target score, fog range, sky color.
 *  • Input Manager — rebind any action key.
 *  • World — camera mode/distance/height/sens, gravity.
 */
import { useMemo, useRef, useState } from 'react';
import { R3Dialog, GroupBox, Row, R3Button, Spinner } from '../r3/R3Dialog';
import { useWaltGame, GameTag, CameraMode, GameObjectProps } from './gameStore';
import { exportGameHTML } from './gameExport';

interface SceneObjRef { id: string; name?: string; type: string; }

interface Props {
  open: boolean;
  onClose: () => void;
  selectedObjectId: string | null;
  selectedObjectName?: string;
  objects?: SceneObjRef[];
  onRun: () => void;
}

const TAGS: GameTag[] = ['static', 'dynamic', 'character', 'trigger', 'collectible', 'interactive', 'enemy', 'vehicle', 'cameraTarget', 'spawn', 'audio', 'hud', 'terrain', 'manager', 'probe', 'navmesh'];
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

export const WaltGamePanel = ({ open, onClose, selectedObjectId, selectedObjectName, objects = [], onRun }: Props) => {
  const g = useWaltGame();
  const [tab, setTab] = useState<'create' | 'object' | 'input' | 'world' | 'manager'>('object');
  const props = selectedObjectId ? (g.props[selectedObjectId] ?? g.ensureProps(selectedObjectId)) : null;
  const [pickTarget, setPickTarget] = useState<string>('');
  const audioTestRef = useRef<HTMLAudioElement | null>(null);

  const set = (patch: Partial<GameObjectProps>) => { if (selectedObjectId) g.setProps(selectedObjectId, patch); };

  const notify = (msg: string) => {
    try { (window as any).__waltNotify?.(msg); } catch {}
    console.log('[WaltGame]', msg);
  };

  const createHelper = (kind: string) => {
    window.dispatchEvent(new CustomEvent('waltgame:create', { detail: { kind } }));
    notify(`Create ${kind} — placed in scene.`);
  };

  const availableTargets = useMemo(
    () => objects.filter((o) => o.id !== selectedObjectId && !(props?.collisionTargets ?? []).includes(o.id)),
    [objects, selectedObjectId, props?.collisionTargets],
  );
  const targetsById = useMemo(() => Object.fromEntries(objects.map((o) => [o.id, o])), [objects]);

  const handleAudioFile = async (file: File) => {
    if (!selectedObjectId) return;
    // Turn the picked file into a data URL so it survives across the app
    // and can be embedded in HTML5 exports.
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      g.patchAudio(selectedObjectId, { url, name: file.name });
    };
    reader.readAsDataURL(file);
  };

  const testAudio = () => {
    if (!props?.audio.url) return notify('No audio URL/file set.');
    try {
      if (audioTestRef.current) { audioTestRef.current.pause(); audioTestRef.current = null; }
      const a = new Audio(props.audio.url);
      a.volume = props.audio.volume;
      a.loop = props.audio.loop;
      a.playbackRate = props.audio.pitch;
      audioTestRef.current = a;
      a.play().catch((err) => notify(`Audio error: ${err.message}`));
    } catch (err: any) {
      notify(`Audio error: ${err.message}`);
    }
  };
  const stopAudio = () => { audioTestRef.current?.pause(); audioTestRef.current = null; };

  return (
    <R3Dialog open={open} onClose={onClose} title="WaltGame — Game Systems" width={460}>
      {/* Tabs */}
      <div className="flex gap-[2px] mb-1 flex-wrap">
        {(['create', 'object', 'input', 'world', 'manager'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-[11px] px-2 py-[2px] ${tab === t ? 'bevel-inset' : 'bevel-raised'} bg-win-face`}
          >
            {t === 'create' ? 'Create' : t === 'object' ? 'Game Properties' : t === 'input' ? 'Input Manager' : t === 'world' ? 'World' : 'Game Manager'}
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
        <div className="space-y-1 max-h-[520px] overflow-auto pr-1">
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
                <Row label="Layer">
                  <input
                    className="bevel-inset bg-white text-[11px] px-1 flex-1"
                    value={props.collisionLayer}
                    onChange={(e) => set({ collisionLayer: e.target.value })}
                  />
                </Row>
              </GroupBox>

              <GroupBox title="Collision Targets">
                <div className="text-[10px] opacity-70 mb-1">
                  Empty list = collide with everything. Add objects to restrict to specific targets.
                </div>
                <Row label="Add">
                  <select
                    className="bevel-inset bg-white text-[11px] px-1 flex-1"
                    value={pickTarget}
                    onChange={(e) => setPickTarget(e.target.value)}
                  >
                    <option value="">— pick an object —</option>
                    {availableTargets.map((o) => <option key={o.id} value={o.id}>{o.name || o.type}</option>)}
                  </select>
                  <R3Button
                    onClick={() => { if (pickTarget) { g.addCollisionTarget(selectedObjectId, pickTarget); setPickTarget(''); } }}
                  >+ Add</R3Button>
                </Row>
                <div className="bevel-inset bg-white max-h-[80px] overflow-auto text-[11px]">
                  {props.collisionTargets.length === 0 && (
                    <div className="p-1 opacity-60">(no filters — collides with all)</div>
                  )}
                  {props.collisionTargets.map((tid) => (
                    <div key={tid} className="flex items-center justify-between px-1 hover:bg-menu-hover hover:text-menu-hover-fg">
                      <span>{targetsById[tid]?.name || targetsById[tid]?.type || tid.slice(0, 8)}</span>
                      <button
                        className="text-[10px] px-1 bevel-raised bg-win-face"
                        onClick={() => g.removeCollisionTarget(selectedObjectId, tid)}
                      >×</button>
                    </div>
                  ))}
                </div>
              </GroupBox>

              {(props.tag === 'trigger' || props.isTrigger) && (
                <GroupBox title="Trigger Events">
                  <div className="text-[10px] opacity-70 mb-1">
                    DSL: <code>log:msg</code>, <code>damage:10</code>, <code>score:+1</code>, <code>load:scene</code>, <code>audio:play</code>
                  </div>
                  <Row label="OnEnter">
                    <input className="bevel-inset bg-white text-[11px] px-1 flex-1" value={props.onEnter ?? ''} onChange={(e) => set({ onEnter: e.target.value })} placeholder="log:Entered zone" />
                  </Row>
                  <Row label="OnExit">
                    <input className="bevel-inset bg-white text-[11px] px-1 flex-1" value={props.onExit ?? ''} onChange={(e) => set({ onExit: e.target.value })} placeholder="log:Left zone" />
                  </Row>
                </GroupBox>
              )}

              {props.components.characterController && (
                <GroupBox title="Character Controller">
                  <Row label="Walk Speed"><Spinner value={props.walkSpeed} step={0.1} min={0} onChange={(v) => set({ walkSpeed: v })} /></Row>
                  <Row label="Run Speed"><Spinner value={props.runSpeed} step={0.1} min={0} onChange={(v) => set({ runSpeed: v })} /></Row>
                  <Row label="Jump Height"><Spinner value={props.jumpHeight} step={0.1} min={0} onChange={(v) => set({ jumpHeight: v })} /></Row>
                </GroupBox>
              )}

              {(props.components.audioSource || props.tag === 'audio') && (
                <GroupBox title="Audio Source">
                  <Row label="URL">
                    <input
                      className="bevel-inset bg-white text-[11px] px-1 flex-1"
                      value={props.audio.url}
                      onChange={(e) => g.patchAudio(selectedObjectId, { url: e.target.value, name: undefined })}
                      placeholder="https://example.com/sound.mp3"
                    />
                  </Row>
                  <Row label="File">
                    <label className="bevel-raised bg-win-face text-[11px] px-2 py-[1px] cursor-pointer">
                      Upload…
                      <input
                        type="file" accept="audio/*" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAudioFile(f); }}
                      />
                    </label>
                    <span className="text-[11px] ml-1 opacity-70">{props.audio.name || (props.audio.url ? '(url set)' : '—')}</span>
                  </Row>
                  <Row label="Volume"><Spinner value={props.audio.volume} step={0.05} min={0} max={1} onChange={(v) => g.patchAudio(selectedObjectId, { volume: v })} /></Row>
                  <Row label="Pitch"><Spinner value={props.audio.pitch} step={0.05} min={0.1} max={4} onChange={(v) => g.patchAudio(selectedObjectId, { pitch: v })} /></Row>
                  <Row>
                    <label className="text-[11px] flex items-center gap-1"><input type="checkbox" checked={props.audio.loop} onChange={(e) => g.patchAudio(selectedObjectId, { loop: e.target.checked })} />Loop</label>
                    <label className="text-[11px] flex items-center gap-1 ml-2"><input type="checkbox" checked={props.audio.autoplay} onChange={(e) => g.patchAudio(selectedObjectId, { autoplay: e.target.checked })} />Autoplay</label>
                    <label className="text-[11px] flex items-center gap-1 ml-2"><input type="checkbox" checked={props.audio.spatial} onChange={(e) => g.patchAudio(selectedObjectId, { spatial: e.target.checked })} />3D Spatial</label>
                  </Row>
                  {props.audio.spatial && (
                    <>
                      <Row label="Min Dist"><Spinner value={props.audio.minDistance} step={0.5} min={0} onChange={(v) => g.patchAudio(selectedObjectId, { minDistance: v })} /></Row>
                      <Row label="Max Dist"><Spinner value={props.audio.maxDistance} step={0.5} min={0} onChange={(v) => g.patchAudio(selectedObjectId, { maxDistance: v })} /></Row>
                    </>
                  )}
                  <Row label="Trigger">
                    <select
                      className="bevel-inset bg-white text-[11px] px-1"
                      value={props.audio.triggerOn}
                      onChange={(e) => g.patchAudio(selectedObjectId, { triggerOn: e.target.value as any })}
                    >
                      <option value="start">On Scene Start</option>
                      <option value="enter">On Trigger Enter</option>
                      <option value="action">On Action Key</option>
                    </select>
                  </Row>
                  <Row>
                    <R3Button onClick={testAudio}>▶ Test</R3Button>
                    <R3Button onClick={stopAudio}>■ Stop</R3Button>
                  </Row>
                </GroupBox>
              )}

              {props.tag === 'hud' && (
                <GroupBox title="HUD">
                  <Row label="Label"><input className="bevel-inset bg-white text-[11px] px-1 flex-1" value={props.hud.label} onChange={(e) => g.patchHud(selectedObjectId, { label: e.target.value })} /></Row>
                  <Row><label className="text-[11px] flex items-center gap-1"><input type="checkbox" checked={props.hud.showHealth} onChange={(e) => g.patchHud(selectedObjectId, { showHealth: e.target.checked })} />Show Health</label></Row>
                  <Row label="Health"><Spinner value={props.hud.health} step={1} min={0} onChange={(v) => g.patchHud(selectedObjectId, { health: v })} /></Row>
                  <Row label="Max HP"><Spinner value={props.hud.maxHealth} step={1} min={1} onChange={(v) => g.patchHud(selectedObjectId, { maxHealth: v })} /></Row>
                  <Row>
                    <label className="text-[11px] flex items-center gap-1"><input type="checkbox" checked={props.hud.showScore} onChange={(e) => g.patchHud(selectedObjectId, { showScore: e.target.checked })} />Score</label>
                    <label className="text-[11px] flex items-center gap-1 ml-2"><input type="checkbox" checked={props.hud.showTimer} onChange={(e) => g.patchHud(selectedObjectId, { showTimer: e.target.checked })} />Timer</label>
                  </Row>
                </GroupBox>
              )}

              {props.tag === 'terrain' && (
                <GroupBox title="Terrain">
                  <Row label="Size"><Spinner value={props.terrain.size} step={1} min={1} onChange={(v) => g.patchTerrain(selectedObjectId, { size: v })} /></Row>
                  <Row label="Segments"><Spinner value={props.terrain.segments} step={1} min={1} max={512} onChange={(v) => g.patchTerrain(selectedObjectId, { segments: v })} /></Row>
                  <Row label="Height"><Spinner value={props.terrain.heightScale} step={0.1} min={0} onChange={(v) => g.patchTerrain(selectedObjectId, { heightScale: v })} /></Row>
                  <Row label="Color"><input type="color" value={props.terrain.color} onChange={(e) => g.patchTerrain(selectedObjectId, { color: e.target.value })} /></Row>
                </GroupBox>
              )}

              {props.tag === 'spawn' && (
                <GroupBox title="Spawn Point">
                  <Row label="Spawns">
                    <select className="bevel-inset bg-white text-[11px] px-1" value={props.spawn.spawnTag} onChange={(e) => g.patchSpawn(selectedObjectId, { spawnTag: e.target.value as GameTag })}>
                      {TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Row>
                  <Row label="Respawn Delay"><Spinner value={props.spawn.respawnDelay} step={0.1} min={0} onChange={(v) => g.patchSpawn(selectedObjectId, { respawnDelay: v })} /></Row>
                </GroupBox>
              )}

              {props.tag === 'probe' && (
                <GroupBox title="Light Probe">
                  <Row label="Intensity"><Spinner value={props.probe.intensity} step={0.05} min={0} onChange={(v) => g.patchProbe(selectedObjectId, { intensity: v })} /></Row>
                  <Row label="Radius"><Spinner value={props.probe.radius} step={0.5} min={0} onChange={(v) => g.patchProbe(selectedObjectId, { radius: v })} /></Row>
                  <Row label="Color"><input type="color" value={props.probe.color} onChange={(e) => g.patchProbe(selectedObjectId, { color: e.target.value })} /></Row>
                </GroupBox>
              )}

              {props.tag === 'navmesh' && (
                <GroupBox title="NavMesh">
                  <Row label="Bounds X"><Spinner value={props.nav.boundsX} step={1} min={1} onChange={(v) => g.patchNav(selectedObjectId, { boundsX: v })} /></Row>
                  <Row label="Bounds Z"><Spinner value={props.nav.boundsZ} step={1} min={1} onChange={(v) => g.patchNav(selectedObjectId, { boundsZ: v })} /></Row>
                  <Row label="Cell Size"><Spinner value={props.nav.cellSize} step={0.1} min={0.1} onChange={(v) => g.patchNav(selectedObjectId, { cellSize: v })} /></Row>
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
          <div className="text-[10px] opacity-70 mt-1">Click a field and press a key to rebind.</div>
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

      {tab === 'manager' && (
        <div className="space-y-1">
          <GroupBox title="Game Manager">
            <Row label="Title"><input className="bevel-inset bg-white text-[11px] px-1 flex-1" value={g.manager.title} onChange={(e) => g.patchManager({ title: e.target.value })} /></Row>
            <Row label="Start Timer (s)"><Spinner value={g.manager.startTimer} step={1} min={0} onChange={(v) => g.patchManager({ startTimer: v })} /></Row>
            <Row label="Start Score"><Spinner value={g.manager.startScore} step={1} onChange={(v) => g.patchManager({ startScore: v })} /></Row>
            <Row label="Win Score"><Spinner value={g.manager.winScore} step={1} onChange={(v) => g.patchManager({ winScore: v })} /></Row>
            <Row><label className="text-[11px] flex items-center gap-1"><input type="checkbox" checked={g.manager.loseOnTimeout} onChange={(e) => g.patchManager({ loseOnTimeout: e.target.checked })} />Lose on Timeout</label></Row>
          </GroupBox>
          <GroupBox title="Sky & Fog">
            <Row label="Sky"><input type="color" value={g.manager.bgColor} onChange={(e) => g.patchManager({ bgColor: e.target.value })} /></Row>
            <Row label="Fog Near"><Spinner value={g.manager.fogNear} step={1} min={0} onChange={(v) => g.patchManager({ fogNear: v })} /></Row>
            <Row label="Fog Far"><Spinner value={g.manager.fogFar} step={1} min={0} onChange={(v) => g.patchManager({ fogFar: v })} /></Row>
          </GroupBox>
        </div>
      )}
    </R3Dialog>
  );
};
