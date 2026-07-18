/**
 * WaltGame Preview — fullscreen runtime that spawns a live playable scene
 * from the current editor objects (via window.__objects) and applies the
 * per-object WaltGame components (character controller, colliders, camera
 * follow) configured in the WaltGame panel.
 *
 * Uses only three.js primitives and raycast-based ground/wall collision so
 * the same runtime can be re-emitted by the HTML5 export.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useWaltGame } from './gameStore';
import { X } from 'lucide-react';

interface Props { open: boolean; onClose: () => void; }

function cloneObjectMesh(obj: any): THREE.Object3D | null {
  // Prefer the live three object attached via ref (imported models, TTF
  // text, particle meshes, etc.). Fall back to primitive builders otherwise.
  const live = obj?.ref?.current;
  if (live && typeof live.clone === 'function') {
    try {
      const c = live.clone(true);
      c.traverse((n: any) => {
        if (n.isMesh && n.material) {
          n.material = Array.isArray(n.material) ? n.material.map((m: any) => m.clone()) : n.material.clone();
        }
      });
      return c;
    } catch { /* fall through */ }
  }
  const type = obj.type;
  let geom: THREE.BufferGeometry | null = null;
  const g = obj.geometry || {};
  switch (type) {
    case 'box': geom = new THREE.BoxGeometry(g.width ?? 1, g.height ?? 1, g.depth ?? 1); break;
    case 'sphere': geom = new THREE.SphereGeometry(g.radius ?? 0.5, 24, 16); break;
    case 'cylinder': geom = new THREE.CylinderGeometry(g.radius ?? 0.5, g.radius ?? 0.5, g.height ?? 1, 24); break;
    case 'cone': geom = new THREE.ConeGeometry(g.radius ?? 0.5, g.height ?? 1, 24); break;
    case 'plane': geom = new THREE.PlaneGeometry(g.width ?? 10, g.height ?? 10); break;
    case 'torus': geom = new THREE.TorusGeometry(g.radius ?? 1, g.tube ?? 0.3, 16, 32); break;
    default: return null;
  }
  const mat = new THREE.MeshStandardMaterial({ color: obj.color || '#888' });
  const mesh = new THREE.Mesh(geom, mat);
  if (type === 'plane') mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export const GamePreviewDialog = ({ open, onClose }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const width = window.innerWidth;
    const height = window.innerHeight;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;

    const scene = new THREE.Scene();
    const mgr = useWaltGame.getState().manager;
    scene.background = new THREE.Color(mgr.bgColor || '#7fb0dd');
    scene.fog = new THREE.Fog(mgr.bgColor || '#7fb0dd', mgr.fogNear, mgr.fogFar);

    // Ambient + sun.
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(10, 20, 10);
    sun.castShadow = true;
    scene.add(sun);

    // Populate from editor.
    const state = useWaltGame.getState();
    const objects: any[] = (window as any).__objects || [];
    const colliders: THREE.Object3D[] = [];
    // Runtime maps for feature systems.
    const meshById = new Map<string, THREE.Object3D>();
    const idByMesh = new WeakMap<THREE.Object3D, string>();
    const audioSources: { id: string; el: HTMLAudioElement; obj: THREE.Object3D; spatial: boolean; min: number; max: number; vol: number; trigger: string }[] = [];
    let playerRoot: THREE.Object3D | null = null;
    let playerBaseHeight = 1.7;

    // Implicit ground so the runtime has something to walk on even if the
    // scene lacks a floor plane.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 500),
      new THREE.MeshStandardMaterial({ color: 0x4c8f3f }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    colliders.push(ground);

    for (const obj of objects) {
      if (!obj || obj.visible === false) continue;
      if (obj.type?.startsWith('light_') || obj.type?.startsWith('camera_')) continue;
      if (obj.type === 'helper' || obj.type === 'print_bed' || obj.type === 'particle_emitter') continue;
      const mesh = cloneObjectMesh(obj);
      if (!mesh) continue;
      mesh.position.set(obj.position[0], obj.position[1], obj.position[2]);
      mesh.rotation.set(obj.rotation[0], obj.rotation[1], obj.rotation[2]);
      mesh.scale.set(obj.scale[0], obj.scale[1], obj.scale[2]);
      mesh.traverse((n: any) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
      scene.add(mesh);
      meshById.set(obj.id, mesh);
      idByMesh.set(mesh, obj.id);

      const props = state.props[obj.id];
      const isPlayer = state.mainPlayerId === obj.id
        || props?.tag === 'character'
        || props?.components.characterController;
      if (isPlayer && !playerRoot) {
        playerRoot = mesh;
        const bbox = new THREE.Box3().setFromObject(mesh);
        playerBaseHeight = Math.max(0.5, bbox.max.y - bbox.min.y);
      } else if (!props || (props.tag !== 'trigger' && !props.isTrigger)) {
        colliders.push(mesh);
      }

      // Attach an audio source if enabled and URL provided.
      if (props?.components.audioSource && props.audio.url) {
        try {
          const el = new Audio(props.audio.url);
          el.loop = props.audio.loop;
          el.volume = props.audio.spatial ? 0 : props.audio.volume; // spatial volume computed per frame
          el.playbackRate = props.audio.pitch;
          if (props.audio.autoplay || props.audio.triggerOn === 'start') el.play().catch(() => {});
          audioSources.push({ id: obj.id, el, obj: mesh, spatial: props.audio.spatial, min: props.audio.minDistance, max: props.audio.maxDistance, vol: props.audio.volume, trigger: props.audio.triggerOn });
        } catch { /* ignore */ }
      }
    }


    // If no player set, spawn a capsule proxy.
    let playerIsProxy = false;
    if (!playerRoot) {
      const proxy = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.4, 1.0, 4, 8),
        new THREE.MeshStandardMaterial({ color: '#ffcc44' }),
      );
      proxy.position.set(0, 1, 5);
      proxy.castShadow = true;
      scene.add(proxy);
      playerRoot = proxy;
      playerBaseHeight = 1.8;
      playerIsProxy = true;
    }

    // Camera.
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    const camMode = state.cameraMode;
    const yaw = { v: 0 };
    const pitch = { v: -0.2 };

    // Input.
    const keys = new Set<string>();
    const keyMap = new Map<string, string>();
    state.inputMap.forEach((b) => keyMap.set(b.key.toLowerCase(), b.action));
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if (e.key === 'Escape' && down) onClose();
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (down) keys.add(k); else keys.delete(k);
    };
    const kd = onKey(true), ku = onKey(false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    const onMouse = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      yaw.v -= e.movementX * state.camSensitivity;
      pitch.v -= e.movementY * state.camSensitivity;
      pitch.v = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch.v));
    };
    const lockClick = () => canvas.requestPointerLock();
    canvas.addEventListener('click', lockClick);
    document.addEventListener('mousemove', onMouse);

    // Physics state.
    const vel = new THREE.Vector3();
    const tmpDir = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();
    let onGround = false;

    // Trigger overlap tracking (id → currently inside).
    const insideTriggers = new Set<string>();
    // HUD runtime state.
    const hud = { health: 100, maxHealth: 100, score: state.manager.startScore, time: state.manager.startTimer };
    // Find any HUD/manager objects for display config.
    const hudObj = objects.find((o) => state.props[o.id]?.tag === 'hud');
    if (hudObj) {
      const h = state.props[hudObj.id].hud;
      hud.health = h.health; hud.maxHealth = h.maxHealth;
    }
    // Simple DSL executor for trigger events.
    const runAction = (cmd?: string) => {
      if (!cmd) return;
      cmd.split(';').forEach((raw) => {
        const [op, ...rest] = raw.trim().split(':');
        const val = rest.join(':');
        switch (op) {
          case 'log': console.log('[WaltGame trigger]', val); break;
          case 'damage': hud.health = Math.max(0, hud.health - Number(val || 0)); break;
          case 'heal': hud.health = Math.min(hud.maxHealth, hud.health + Number(val || 0)); break;
          case 'score': hud.score += val.startsWith('+') || val.startsWith('-') ? Number(val) : Number(val); break;
          case 'audio': {
            const src = audioSources.find((a) => a.trigger === 'enter');
            if (src) { try { src.el.currentTime = 0; src.el.play(); } catch {} }
            break;
          }
          case 'load': console.log('[WaltGame] load scene:', val); break;
          default: if (op) console.log('[WaltGame action]', raw);
        }
      });
    };

    const actionActive = (name: string): boolean => {
      for (const [k, a] of keyMap.entries()) {
        if (a === name && keys.has(k)) return true;
      }
      return false;
    };

    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      const dt = Math.min(0.05, clock.getDelta());


      // Character movement in the horizontal plane relative to yaw.
      const forward = new THREE.Vector3(-Math.sin(yaw.v), 0, -Math.cos(yaw.v));
      const right = new THREE.Vector3(Math.cos(yaw.v), 0, -Math.sin(yaw.v));
      tmpDir.set(0, 0, 0);
      if (actionActive('MoveForward')) tmpDir.add(forward);
      if (actionActive('MoveBackward')) tmpDir.sub(forward);
      if (actionActive('MoveRight')) tmpDir.add(right);
      if (actionActive('MoveLeft')) tmpDir.sub(right);
      if (tmpDir.lengthSq() > 0) tmpDir.normalize();

      const playerProps = state.mainPlayerId ? state.props[state.mainPlayerId] : undefined;
      const walk = playerProps?.walkSpeed ?? 4;
      const run = playerProps?.runSpeed ?? 8;
      const jumpH = playerProps?.jumpHeight ?? 1.2;
      const speed = actionActive('Run') ? run : walk;

      vel.x = tmpDir.x * speed;
      vel.z = tmpDir.z * speed;
      vel.y -= state.gravity * dt;
      if (onGround && actionActive('Jump')) {
        vel.y = Math.sqrt(2 * state.gravity * jumpH);
      }

      playerRoot!.position.x += vel.x * dt;
      playerRoot!.position.z += vel.z * dt;
      playerRoot!.position.y += vel.y * dt;

      // Ground raycast (down from player top).
      raycaster.set(
        new THREE.Vector3(playerRoot!.position.x, playerRoot!.position.y + 2, playerRoot!.position.z),
        new THREE.Vector3(0, -1, 0),
      );
      const hits = raycaster.intersectObjects(colliders, true);
      if (hits.length) {
        const groundY = hits[0].point.y;
        const foot = playerRoot!.position.y - playerBaseHeight / 2;
        if (foot < groundY) {
          playerRoot!.position.y = groundY + playerBaseHeight / 2;
          vel.y = 0;
          onGround = true;
        } else if (Math.abs(foot - groundY) < 0.05) {
          onGround = true;
          vel.y = 0;
        } else {
          onGround = false;
        }
      }

      // Camera.
      if (camMode === 'firstPerson') {
        const head = playerRoot!.position.clone();
        head.y += playerBaseHeight * 0.4;
        camera.position.copy(head);
        camera.rotation.set(pitch.v, yaw.v, 0, 'YXZ');
      } else if (camMode === 'topDown') {
        camera.position.set(playerRoot!.position.x, playerRoot!.position.y + 12, playerRoot!.position.z);
        camera.lookAt(playerRoot!.position);
      } else if (camMode === 'free') {
        camera.position.copy(playerRoot!.position);
        camera.rotation.set(pitch.v, yaw.v, 0, 'YXZ');
      } else {
        // Third-person orbit.
        const dist = state.camDistance;
        const off = new THREE.Vector3(
          Math.sin(yaw.v) * Math.cos(pitch.v) * dist,
          Math.sin(-pitch.v) * dist + state.camHeight,
          Math.cos(yaw.v) * Math.cos(pitch.v) * dist,
        );
        camera.position.copy(playerRoot!.position).add(off);
        const look = playerRoot!.position.clone(); look.y += state.camHeight * 0.5;
        camera.lookAt(look);
        // Face body forward when moving.
        if (tmpDir.lengthSq() > 0.01 && !playerIsProxy) {
          const targetY = Math.atan2(tmpDir.x, tmpDir.z);
          playerRoot!.rotation.y += (targetY - playerRoot!.rotation.y) * 0.15;
        } else if (playerIsProxy) {
          playerRoot!.rotation.y = yaw.v;
        }
      }

      // Trigger overlap: check each trigger-tagged object against player.
      const pPos = playerRoot!.position;
      const playerId = state.mainPlayerId ?? '__player__';
      for (const [id, mesh] of meshById.entries()) {
        const p = state.props[id];
        if (!p || (!p.isTrigger && p.tag !== 'trigger')) continue;
        // Respect collisionTargets: if list non-empty, only fire when player id is included.
        if (p.collisionTargets.length && !p.collisionTargets.includes(playerId)) continue;
        const box = new THREE.Box3().setFromObject(mesh);
        const overlaps = box.containsPoint(pPos);
        const was = insideTriggers.has(id);
        if (overlaps && !was) { insideTriggers.add(id); runAction(p.onEnter); }
        else if (!overlaps && was) { insideTriggers.delete(id); runAction(p.onExit); }
      }

      // Spatial audio: attenuate by distance from player.
      for (const src of audioSources) {
        if (!src.spatial) continue;
        const d = src.obj.position.distanceTo(pPos);
        let atten = 1;
        if (d >= src.max) atten = 0;
        else if (d > src.min) atten = 1 - (d - src.min) / (src.max - src.min);
        src.el.volume = Math.max(0, Math.min(1, src.vol * atten));
      }

      // Timer countdown (Game Manager).
      if (state.manager.startTimer > 0) {
        hud.time = Math.max(0, hud.time - dt);
        if (hud.time <= 0 && state.manager.loseOnTimeout) { hud.time = 0; }
      }

      // Push HUD state to DOM overlay.
      const hudEl = (renderer.domElement.parentElement?.querySelector('[data-hud]') as HTMLElement | null);
      if (hudEl) {
        hudEl.innerHTML = [
          `<div style="opacity:.9">${state.manager.title}</div>`,
          `<div>HP: ${Math.round(hud.health)}/${hud.maxHealth}</div>`,
          `<div>Score: ${hud.score}</div>`,
          state.manager.startTimer > 0 ? `<div>Time: ${hud.time.toFixed(1)}s</div>` : '',
        ].join('');
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    stopRef.current = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      document.removeEventListener('mousemove', onMouse);
      canvas.removeEventListener('click', lockClick);
      window.removeEventListener('resize', onResize);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      audioSources.forEach((a) => { try { a.el.pause(); } catch {} });
      renderer.dispose();
      scene.traverse((n: any) => {
        if (n.geometry?.dispose) n.geometry.dispose();
        if (n.material?.dispose) n.material.dispose();
      });
    };
    return () => stopRef.current();
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black">
      <canvas ref={canvasRef} className="w-full h-full block" />
      <div className="absolute top-2 left-2 text-white text-xs bg-black/50 px-2 py-1 rounded">
        WaltGame Preview — WASD move · Space jump · Shift run · Mouse look (click to lock) · Esc to exit
      </div>
      <div data-hud className="absolute bottom-3 left-3 text-white text-xs bg-black/50 px-2 py-1 rounded font-mono leading-tight pointer-events-none" />
      <button
        onClick={onClose}
        className="absolute top-2 right-2 bg-black/60 text-white px-2 py-1 rounded flex items-center gap-1 text-xs hover:bg-black/80"
      >
        <X size={14} /> Stop
      </button>
    </div>
  );
};
