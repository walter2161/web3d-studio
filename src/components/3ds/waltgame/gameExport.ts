/**
 * WaltGame HTML5 export — writes a standalone, single-file game project as
 * a downloadable ZIP containing index.html + game.js + scene.json. The
 * runtime mirrors GamePreviewDialog so exported games behave identically
 * to in-editor Play mode.
 */
import JSZip from 'jszip';
import { useWaltGame } from './gameStore';

function serializeScene(): any {
  const objects: any[] = (window as any).__objects || [];
  return objects
    .filter((o) => o.visible !== false)
    .filter((o) => !(o.type?.startsWith('light_') || o.type?.startsWith('camera_') || o.type === 'helper' || o.type === 'print_bed' || o.type === 'particle_emitter'))
    .map((o) => ({
      id: o.id,
      name: o.name,
      type: o.type,
      position: o.position,
      rotation: o.rotation,
      scale: o.scale,
      color: o.color,
      geometry: o.geometry,
    }));
}

const RUNTIME_JS = String.raw`
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const data = await fetch('scene.json').then(r => r.json());
const { objects, game } = data;

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(devicePixelRatio);
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#7fb0dd');
scene.fog = new THREE.Fog('#7fb0dd', 40, 200);
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(10,20,10); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(500,500), new THREE.MeshStandardMaterial({ color: 0x4c8f3f }));
ground.rotation.x = -Math.PI/2; scene.add(ground);
const colliders = [ground];
let player = null, playerHeight = 1.8;
function buildGeom(o){
  const g = o.geometry || {};
  switch(o.type){
    case 'box': return new THREE.BoxGeometry(g.width??1,g.height??1,g.depth??1);
    case 'sphere': return new THREE.SphereGeometry(g.radius??0.5,24,16);
    case 'cylinder': return new THREE.CylinderGeometry(g.radius??0.5,g.radius??0.5,g.height??1,24);
    case 'cone': return new THREE.ConeGeometry(g.radius??0.5,g.height??1,24);
    case 'plane': return new THREE.PlaneGeometry(g.width??10,g.height??10);
    case 'torus': return new THREE.TorusGeometry(g.radius??1,g.tube??0.3,16,32);
    default: return null;
  }
}
for (const o of objects){
  const geom = buildGeom(o); if (!geom) continue;
  const m = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: o.color||'#888' }));
  m.position.set(...o.position); m.rotation.set(...o.rotation); m.scale.set(...o.scale);
  if (o.type==='plane') m.rotation.x -= Math.PI/2;
  scene.add(m);
  const p = game.props[o.id];
  if (game.mainPlayerId === o.id || p?.tag === 'character'){ player = m; const bb = new THREE.Box3().setFromObject(m); playerHeight = Math.max(0.5, bb.max.y-bb.min.y); }
  else colliders.push(m);
}
if (!player){ player = new THREE.Mesh(new THREE.CapsuleGeometry(0.4,1,4,8), new THREE.MeshStandardMaterial({ color:'#fc4' })); player.position.set(0,1,5); scene.add(player); playerHeight = 1.8; }

const cam = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 1000);
const keys = new Set(); const keyMap = new Map(game.inputMap.map(b=>[b.key.toLowerCase(), b.action]));
addEventListener('keydown', e=>keys.add(e.key.length===1?e.key.toLowerCase():e.key));
addEventListener('keyup', e=>keys.delete(e.key.length===1?e.key.toLowerCase():e.key));
let yaw=0, pitch=-0.2;
canvas.addEventListener('click', ()=>canvas.requestPointerLock());
addEventListener('mousemove', e=>{ if(document.pointerLockElement!==canvas) return; yaw-=e.movementX*game.camera.sensitivity; pitch=Math.max(-1.5,Math.min(1.5,pitch-e.movementY*game.camera.sensitivity)); });
const act = a => { for (const [k,n] of keyMap) if (n===a && keys.has(k)) return true; return false; };
const vel = new THREE.Vector3(); const ray = new THREE.Raycaster();
let onGround=false; const clock=new THREE.Clock();
function tick(){
  const dt = Math.min(0.05, clock.getDelta());
  const fw = new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  const rt = new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  const d = new THREE.Vector3();
  if (act('MoveForward')) d.add(fw); if (act('MoveBackward')) d.sub(fw);
  if (act('MoveRight')) d.add(rt); if (act('MoveLeft')) d.sub(rt);
  if (d.lengthSq()>0) d.normalize();
  const pp = game.props[game.mainPlayerId] || {}; const speed = act('Run') ? (pp.runSpeed??8) : (pp.walkSpeed??4);
  vel.x = d.x*speed; vel.z = d.z*speed; vel.y -= game.gravity*dt;
  if (onGround && act('Jump')) vel.y = Math.sqrt(2*game.gravity*(pp.jumpHeight??1.2));
  player.position.addScaledVector(vel, dt);
  ray.set(new THREE.Vector3(player.position.x, player.position.y+2, player.position.z), new THREE.Vector3(0,-1,0));
  const h = ray.intersectObjects(colliders, true);
  if (h.length){ const foot = player.position.y - playerHeight/2; if (foot < h[0].point.y){ player.position.y = h[0].point.y + playerHeight/2; vel.y=0; onGround=true; } else onGround = Math.abs(foot-h[0].point.y) < 0.05; }
  if (game.cameraMode==='firstPerson'){ cam.position.copy(player.position); cam.position.y += playerHeight*0.4; cam.rotation.set(pitch,yaw,0,'YXZ'); }
  else if (game.cameraMode==='topDown'){ cam.position.set(player.position.x, player.position.y+12, player.position.z); cam.lookAt(player.position); }
  else { const dist = game.camera.distance; const off = new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch)*dist, Math.sin(-pitch)*dist + game.camera.height, Math.cos(yaw)*Math.cos(pitch)*dist); cam.position.copy(player.position).add(off); const lk = player.position.clone(); lk.y += game.camera.height*0.5; cam.lookAt(lk); player.rotation.y = yaw; }
  renderer.render(scene, cam);
  requestAnimationFrame(tick);
}
addEventListener('resize', ()=>{ renderer.setSize(innerWidth,innerHeight); cam.aspect=innerWidth/innerHeight; cam.updateProjectionMatrix(); });
tick();
`;

const INDEX_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>WaltGame Export</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden;font-family:sans-serif}#hud{position:absolute;top:8px;left:8px;color:#fff;background:rgba(0,0,0,.4);padding:4px 8px;border-radius:4px;font-size:12px}</style>
</head><body><canvas id="view" style="width:100%;height:100%;display:block"></canvas>
<div id="hud">WASD · Space · Shift · Click to lock mouse</div>
<script type="module" src="game.js"></script></body></html>`;

export async function exportGameHTML() {
  const zip = new JSZip();
  const sceneData = {
    objects: serializeScene(),
    game: useWaltGame.getState().serialize(),
  };
  zip.file('index.html', INDEX_HTML);
  zip.file('game.js', RUNTIME_JS);
  zip.file('scene.json', JSON.stringify(sceneData, null, 2));
  zip.file('README.txt', 'WaltGame export — open index.html via a static server (python -m http.server) since ES modules need HTTP.');
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'waltgame-export.zip';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
