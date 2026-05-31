// THE HOUND — the Backrooms' pursuit predator. Counterpart to The Hollow:
// where the Hollow freezes when watched, the Hound HUNTS when it sees you. It prowls until
// it gets line-of-sight, then sprints you down; you only shake it by breaking sight around
// corners. Heard before seen (a low growl, then fast clattering steps).
//
// No PointLight (emissive eyes only) so the scene stays within the 16-light budget.
import * as THREE from 'three';
import { TILE, worldToCell, hasWall, BIT } from 'shared/constants.js';

export class Hound {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.visible = false;
    scene.add(this.root);
    this._build();
    this.state = 'hidden';       // hidden | prowling | chasing
    this.cooldown = 6 + Math.random() * 6;
    this.pos = new THREE.Vector3();
    this.facing = 0;
    this.lost = 0;               // seconds since last had line-of-sight
    this.wander = new THREE.Vector3();
  }

  _build() {
    const hide = new THREE.MeshStandardMaterial({ color: 0x0b0a09, roughness: 0.9, emissive: 0x070605, emissiveIntensity: 0.3 });
    // Low, long body (dog-sized but wrong — too long, too thin).
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.9, 4, 8), hide);
    body.rotation.z = Math.PI / 2; body.position.y = 0.55; this.root.add(body);
    const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), hide);
    haunch.position.set(-0.55, 0.55, 0); haunch.scale.set(1, 1.1, 1); this.root.add(haunch);

    // Head low and forward.
    this.head = new THREE.Group(); this.head.position.set(0.7, 0.5, 0); this.root.add(this.head);
    const skull = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 8), hide);
    skull.rotation.z = -Math.PI / 2; this.head.add(skull);
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0xff2a18, emissive: 0xff2a18, emissiveIntensity: 4 });
    const eL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), this.eyeMat);
    const eR = eL.clone(); eL.position.set(0.16, 0.06, -0.09); eR.position.set(0.16, 0.06, 0.09);
    this.head.add(eL, eR);

    // Four spindly legs.
    this.legs = [];
    for (const [lx, lz] of [[0.45, 0.18], [0.45, -0.18], [-0.45, 0.18], [-0.45, -0.18]]) {
      const hip = new THREE.Group(); hip.position.set(lx, 0.5, lz); this.root.add(hip);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.5, 5), hide);
      leg.position.y = -0.25; hip.add(leg);
      this.legs.push(hip);
    }
  }

  _occluded(a, b, level) {
    let x = worldToCell(a.x, a.z).x, y = worldToCell(a.x, a.z).y;
    const c = worldToCell(b.x, b.z); let guard = 0;
    while ((x !== c.x || y !== c.y) && guard++ < 200) {
      const dx = Math.sign(c.x - x), dy = Math.sign(c.y - y);
      if (dx !== 0 && (dy === 0 || Math.abs(c.x - x) >= Math.abs(c.y - y))) {
        if (hasWall(level, x, y, dx > 0 ? BIT.E : BIT.W)) return true; x += dx;
      } else if (dy !== 0) {
        if (hasWall(level, x, y, dy > 0 ? BIT.S : BIT.N)) return true; y += dy;
      } else break;
    }
    return false;
  }

  // returns { drain, attack, visible, dist, chasing, justDetected }
  update(dt, t, playerPos, sanity, level) {
    this.cooldown -= dt;
    let justDetected = false;

    if (this.state === 'hidden') {
      this.root.visible = false;
      const pressure = sanity < 70 ? (sanity < 35 ? 0.4 : 0.14) : 0.03;
      if (this.cooldown <= 0 && Math.random() < dt * pressure) { this._spawn(playerPos, level); }
      return { drain: 0, attack: false, visible: false, dist: 99, chasing: false, justDetected };
    }

    const to = new THREE.Vector3().subVectors(playerPos, this.pos); to.y = 0;
    const dist = to.length(); to.normalize();
    const sight = !this._occluded(this.pos, playerPos, level) && dist < 18;

    if (sight) {
      this.lost = 0;
      if (this.state !== 'chasing') { this.state = 'chasing'; justDetected = true; }
    } else if (this.state === 'chasing') {
      this.lost += dt;
      if (this.lost > 2.5) this.state = 'prowling';
    }

    const speed = this.state === 'chasing' ? 6.6 : 1.6;
    if (this.state === 'chasing') {
      this.pos.addScaledVector(to, speed * dt);
    } else { // prowling — drift, occasionally re-aim
      if (this.wander.lengthSq() < 0.01 || Math.random() < dt * 0.4) {
        const a = Math.random() * Math.PI * 2; this.wander.set(Math.cos(a), 0, Math.sin(a));
      }
      const nx = this.pos.x + this.wander.x * speed * dt, nz = this.pos.z + this.wander.z * speed * dt;
      const c = worldToCell(nx, nz);
      if (c.x > 0 && c.y > 0 && c.x < level.w - 1 && c.y < level.h - 1) { this.pos.x = nx; this.pos.z = nz; }
      else this.wander.multiplyScalar(-1);
      if (this.cooldown <= -10 && dist > 22) { this._despawn(); }  // wandered off, give up
    }

    this.facing = Math.atan2(to.x, to.z);
    this.root.position.copy(this.pos); this.root.rotation.y = this.facing - Math.PI / 2;

    // gallop animation while chasing
    const gait = this.state === 'chasing' ? 14 : 5;
    this.legs.forEach((hip, i) => { hip.rotation.z = Math.sin(t * gait + i * Math.PI / 2) * 0.5; });
    this.eyeMat.emissiveIntensity = this.state === 'chasing' ? 5 + Math.sin(t * 25) : 3;

    let attack = false;
    if (dist < 1.5 && this.state === 'chasing' && this.cooldown <= 0) { attack = true; this.cooldown = 1.8; }

    const drain = THREE.MathUtils.clamp((12 - dist) / 12, 0, 1) * (this.state === 'chasing' ? 1.2 : 0.5);
    return { drain, attack, visible: true, dist, chasing: this.state === 'chasing', justDetected };
  }

  _spawn(playerPos, level) {
    for (let i = 0; i < 16; i++) {
      const ang = Math.random() * Math.PI * 2, r = 8 + Math.random() * 6;
      const x = playerPos.x + Math.cos(ang) * r, z = playerPos.z + Math.sin(ang) * r;
      const cell = worldToCell(x, z);
      if (cell.x <= 0 || cell.y <= 0 || cell.x >= level.w - 1 || cell.y >= level.h - 1) continue;
      this.pos.set(cell.x * TILE + TILE / 2, 0, cell.y * TILE + TILE / 2);
      this.root.position.copy(this.pos); this.root.visible = true;
      this.state = 'prowling'; this.lost = 0; this.cooldown = 0;
      return;
    }
  }

  _despawn() {
    this.state = 'hidden'; this.root.visible = false;
    this.cooldown = 10 + Math.random() * 12;
  }
}
