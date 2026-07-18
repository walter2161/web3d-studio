import * as THREE from 'three';

/**
 * Generates a numbered checker map (TexTools-style). Colored squares with
 * incrementing numbers so texel stretching and rotation are obvious.
 */
export function makeCheckerTexture(size = 512, tiles = 8): THREE.CanvasTexture {
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = size;
  const g = cvs.getContext('2d')!;
  const step = size / tiles;
  const palette = ['#c62828', '#2e7d32', '#1565c0', '#f9a825', '#6a1b9a', '#00838f', '#ef6c00', '#4e342e'];
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      const isDark = (x + y) % 2 === 0;
      g.fillStyle = isDark ? '#1a1a1a' : palette[(x + y * 3) % palette.length];
      g.fillRect(x * step, y * step, step, step);
      g.fillStyle = isDark ? '#eeeeee' : '#ffffff';
      g.font = `${Math.floor(step * 0.42)}px monospace`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const n = y * tiles + x + 1;
      g.fillText(String(n), x * step + step / 2, y * step + step / 2);
    }
  }
  // border lines
  g.strokeStyle = '#ffffff';
  g.lineWidth = 1;
  for (let i = 0; i <= tiles; i++) {
    g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, size); g.stroke();
    g.beginPath(); g.moveTo(0, i * step); g.lineTo(size, i * step); g.stroke();
  }
  const tex = new THREE.CanvasTexture(cvs);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export function makeGradientTexture(size = 256): THREE.CanvasTexture {
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = size;
  const g = cvs.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#000'); grad.addColorStop(1, '#fff');
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cvs);
  tex.needsUpdate = true;
  return tex;
}
