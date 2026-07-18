/**
 * WaltGame Icon Overlay
 *
 * Renders a billboarded 2D icon (Sprite) at the center of every scene object
 * that has WaltGame properties assigned. Icons make it easy to visually
 * identify Players, Triggers, Audio Sources, Spawns, etc. directly in the
 * viewport, regardless of the camera angle.
 *
 * The sprites are flagged with `userData.__helper = true` so the offline
 * animation/still renderer skips them — they are editor-only helpers, never
 * baked into a final render.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { useWaltGame, type GameTag } from './gameStore';

interface Obj {
  id: string;
  position: [number, number, number];
}

/** Emoji / glyph used as icon per game tag. */
const TAG_GLYPH: Record<GameTag, { glyph: string; color: string; label: string }> = {
  character:     { glyph: '🎮', color: '#4ade80', label: 'PLAYER' },
  cameraTarget:  { glyph: '🎥', color: '#f59e0b', label: 'CAMERA' },
  trigger:       { glyph: '⚡', color: '#facc15', label: 'TRIGGER' },
  collectible:   { glyph: '⭐', color: '#fde047', label: 'PICKUP' },
  interactive:   { glyph: '✋', color: '#a78bfa', label: 'ACTION' },
  enemy:         { glyph: '👾', color: '#ef4444', label: 'ENEMY' },
  vehicle:       { glyph: '🚗', color: '#38bdf8', label: 'VEHICLE' },
  spawn:         { glyph: '🚩', color: '#22d3ee', label: 'SPAWN' },
  audio:         { glyph: '🔊', color: '#60a5fa', label: 'AUDIO' },
  hud:           { glyph: '🖥', color: '#e879f9', label: 'HUD' },
  terrain:       { glyph: '🌄', color: '#84cc16', label: 'TERRAIN' },
  manager:       { glyph: '⚙',  color: '#94a3b8', label: 'MANAGER' },
  probe:         { glyph: '💡', color: '#fbbf24', label: 'PROBE' },
  navmesh:       { glyph: '🧭', color: '#2dd4bf', label: 'NAVMESH' },
  dynamic:       { glyph: '◆',  color: '#fb7185', label: 'DYNAMIC' },
  static:        { glyph: '■',  color: '#64748b', label: 'STATIC' },
};

const textureCache = new Map<GameTag, THREE.CanvasTexture>();

function getIconTexture(tag: GameTag): THREE.CanvasTexture {
  const cached = textureCache.get(tag);
  if (cached) return cached;

  const entry = TAG_GLYPH[tag] ?? TAG_GLYPH.static;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Rounded background badge.
  const r = size * 0.22;
  ctx.fillStyle = 'rgba(15,23,42,0.85)';
  ctx.strokeStyle = entry.color;
  ctx.lineWidth = 6;
  ctx.beginPath();
  const pad = 6;
  const x = pad, y = pad, w = size - pad * 2, h = size - pad * 2;
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Glyph.
  ctx.fillStyle = '#fff';
  ctx.font = `${Math.round(size * 0.55)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(entry.glyph, size / 2, size / 2 + 4);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  textureCache.set(tag, tex);
  return tex;
}

interface Props {
  objects: Obj[];
}

export function WaltGameIconOverlay({ objects }: Props) {
  const propsMap = useWaltGame((s) => s.props);

  const entries = useMemo(() => {
    // Only badge objects that are explicit WaltGame entities. 'static' and
    // 'dynamic' are the defaults applied to plain scene meshes and must NOT
    // get an icon — otherwise every object in the scene would show a badge.
    const GAME_TAGS = new Set<GameTag>([
      'character', 'cameraTarget', 'trigger', 'collectible', 'interactive',
      'enemy', 'vehicle', 'spawn', 'audio', 'hud', 'terrain', 'manager',
      'probe', 'navmesh',
    ]);
    const list: Array<{ id: string; pos: [number, number, number]; tag: GameTag }> = [];
    for (const obj of objects) {
      const p = propsMap[obj.id];
      if (!p) continue;
      if (!GAME_TAGS.has(p.tag)) continue;
      list.push({ id: obj.id, pos: obj.position, tag: p.tag });
    }
    return list;
  }, [objects, propsMap]);

  if (entries.length === 0) return null;

  return (
    <group userData={{ __helper: true }}>
      {entries.map((e) => {
        const tex = getIconTexture(e.tag);
        return (
          <sprite
            key={e.id}
            position={e.pos}
            scale={[0.6, 0.6, 0.6]}
            renderOrder={9999}
            userData={{ __helper: true, __waltgameIcon: true, targetId: e.id }}
            raycast={() => null}
          >
            <spriteMaterial
              map={tex}
              transparent
              depthTest={false}
              depthWrite={false}
              sizeAttenuation
              toneMapped={false}
            />
          </sprite>
        );
      })}
    </group>
  );
}
