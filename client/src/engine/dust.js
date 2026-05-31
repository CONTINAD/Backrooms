// Floating dust motes — that stale, undisturbed air of a place no one's meant to be.
// A single THREE.Points cloud that follows the player and wraps around them, so the air
// always feels thick. Cheap (one draw call, additive) and adds a lot of liminal atmosphere.
import * as THREE from 'three';

export class Dust {
  constructor(scene, count = 380, box = 14) {
    this.box = box;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * box;
      pos[i * 3 + 1] = Math.random() * 3.2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * box;
      this.vel[i * 3] = (Math.random() - 0.5) * 0.05;
      this.vel[i * 3 + 1] = -0.01 - Math.random() * 0.03;       // slow settle
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xfff0c8, size: 0.02, transparent: true, opacity: 0.42,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.count = count;
  }

  update(dt, t, cameraPos) {
    const pos = this.points.geometry.getAttribute('position');
    const arr = pos.array; const half = this.box / 2;
    for (let i = 0; i < this.count; i++) {
      const j = i * 3;
      arr[j] += (this.vel[j] + Math.sin(t * 0.5 + i) * 0.01) * dt;
      arr[j + 1] += this.vel[j + 1] * dt;
      arr[j + 2] += (this.vel[j + 2] + Math.cos(t * 0.4 + i) * 0.01) * dt;
      // wrap within a box centered on the player
      const lx = arr[j] - cameraPos.x, lz = arr[j + 2] - cameraPos.z;
      if (lx > half) arr[j] -= this.box; else if (lx < -half) arr[j] += this.box;
      if (lz > half) arr[j + 2] -= this.box; else if (lz < -half) arr[j + 2] += this.box;
      if (arr[j + 1] < 0.05) arr[j + 1] = 3.15;                 // recycle to ceiling
    }
    pos.needsUpdate = true;
  }
}
