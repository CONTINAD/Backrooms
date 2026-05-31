// Procedural textures drawn on <canvas> — no image downloads. Returns THREE.CanvasTexture.
import * as THREE from 'three';

function canvas(size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  return { c, ctx: c.getContext('2d') };
}
function noise(ctx, w, h, amount, alpha) {
  const img = ctx.getImageData(0, 0, w, h); const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
    if (alpha) d[i + 3] = d[i + 3];
  }
  ctx.putImageData(img, 0, 0);
}

// The iconic mono-yellow damp wallpaper with faint vertical pinstripes & water stains.
export function wallpaperTexture() {
  const { c, ctx } = canvas(256);
  ctx.fillStyle = '#b6a444'; ctx.fillRect(0, 0, 256, 256);
  // vertical stripes
  for (let x = 0; x < 256; x += 8) {
    ctx.fillStyle = (x / 8) % 2 ? '#b29f40' : '#bca84a';
    ctx.fillRect(x, 0, 4, 256);
  }
  // damp stains
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 8 + Math.random() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(90,70,20,0.18)'); g.addColorStop(1, 'rgba(90,70,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  noise(ctx, 256, 256, 26);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1);
  t.anisotropy = 4;
  return t;
}

// Damp office carpet — dark mottled with subtle pattern.
export function carpetTexture() {
  const { c, ctx } = canvas(256);
  ctx.fillStyle = '#3a3320'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = `rgba(${40 + Math.random() * 30},${36 + Math.random() * 26},${18 + Math.random() * 16},0.5)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  noise(ctx, 256, 256, 18);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

// Ceiling: drop-ceiling tiles with grid lines; light panels handled separately as emissive.
export function ceilingTexture() {
  const { c, ctx } = canvas(256);
  ctx.fillStyle = '#c9b86a'; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#7d7038'; ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 252, 252);
  // speckle acoustic tile
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = `rgba(120,108,60,${Math.random() * 0.4})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  noise(ctx, 256, 256, 16);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
