// Entities. v0.1 ships the Smiler: a grin in the dark that drifts toward low-sanity prey.
import * as THREE from 'three';
import { TILE, worldToCell, hasWall, BIT } from 'shared/constants.js';

function smilerTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 128, 128);
  // eyes
  x.fillStyle = '#eafff0';
  x.beginPath(); x.ellipse(44, 50, 9, 13, 0, 0, 7); x.fill();
  x.beginPath(); x.ellipse(84, 50, 9, 13, 0, 0, 7); x.fill();
  // grin: row of teeth
  x.save(); x.translate(64, 82);
  x.fillStyle = '#eafff0';
  for (let i = -5; i <= 5; i++) {
    const tx = i * 9; const ty = Math.abs(i) * 2.2;
    x.beginPath(); x.moveTo(tx - 4, ty); x.lineTo(tx + 4, ty);
    x.lineTo(tx + 3, ty + 12); x.lineTo(tx - 3, ty + 12); x.closePath(); x.fill();
  }
  x.restore();
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
}

export class Smiler {
  constructor(scene) {
    this.scene = scene;
    const mat = new THREE.SpriteMaterial({ map: smilerTexture(), transparent: true, opacity: 0, depthWrite: false });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.scale.set(1.6, 1.6, 1);
    scene.add(this.sprite);
    this.eyeLight = new THREE.PointLight(0xccffdd, 0, 4, 2);
    scene.add(this.eyeLight);
    this.state = 'hidden';   // hidden | lurking | hunting
    this.cooldown = 0;
    this.pos = new THREE.Vector3();
    this.target = 6;          // preferred lurk distance
  }

  // returns {sanityDrain:0..1, attack:bool}
  update(dt, t, playerPos, sanity, level) {
    this.cooldown -= dt;
    const dist = this.pos.distanceTo(playerPos);
    let drain = 0, attack = false;

    if (this.state === 'hidden') {
      // Materialize when sanity is shaky and cooldown elapsed.
      if (sanity < 55 && this.cooldown <= 0 && Math.random() < dt * (sanity < 25 ? 0.5 : 0.12)) {
        this._spawnNear(playerPos, level);
        this.state = 'lurking';
      }
    } else {
      // Face the player, drift in. Hunt harder at low sanity.
      const speed = this.state === 'hunting' ? 2.6 : 0.7;
      const dir = new THREE.Vector3().subVectors(playerPos, this.pos); dir.y = 0;
      const d = dir.length(); dir.normalize();
      // approach but keep lurk distance unless hunting
      if (this.state === 'lurking' && d > this.target) this.pos.addScaledVector(dir, speed * dt);
      else if (this.state === 'hunting') this.pos.addScaledVector(dir, speed * dt);

      // escalate
      if (sanity < 25) this.state = 'hunting';
      else if (sanity > 60 && this.cooldown <= 0) this._despawn();

      this.sprite.position.copy(this.pos); this.sprite.position.y = 1.5;
      this.eyeLight.position.copy(this.sprite.position);
      const targetOp = this.state === 'hunting' ? 0.95 : THREE.MathUtils.clamp((60 - sanity) / 60, 0.08, 0.6);
      this.sprite.material.opacity += (targetOp - this.sprite.material.opacity) * Math.min(1, dt * 3);
      this.eyeLight.intensity = this.sprite.material.opacity * 1.5;

      drain = THREE.MathUtils.clamp((10 - dist) / 10, 0, 1);
      if (dist < 1.3 && this.state === 'hunting' && this.cooldown <= 0) {
        attack = true; this.cooldown = 2.5; this._despawn();
      }
    }
    return { drain, attack, visible: this.state !== 'hidden', dist };
  }

  _spawnNear(playerPos, level) {
    // Pick a cell a few tiles away in a random direction.
    for (let tries = 0; tries < 12; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 5 + Math.random() * 4;
      const x = playerPos.x + Math.cos(ang) * r;
      const z = playerPos.z + Math.sin(ang) * r;
      const cell = worldToCell(x, z);
      if (cell.x > 0 && cell.y > 0 && cell.x < level.w - 1 && cell.y < level.h - 1) {
        this.pos.set(cell.x * TILE + TILE / 2, 1.5, cell.y * TILE + TILE / 2);
        this.sprite.material.opacity = 0;
        return;
      }
    }
    this.pos.set(playerPos.x + 5, 1.5, playerPos.z);
  }

  _despawn() {
    this.state = 'hidden';
    this.sprite.material.opacity = 0;
    this.eyeLight.intensity = 0;
    this.cooldown = 6 + Math.random() * 8;
  }
}
