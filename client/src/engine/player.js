// First-person controller: pointer-lock look + WASD move + grid collision + head-bob.
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import {
  TILE, PLAYER_SPEED, PLAYER_SPRINT, PLAYER_EYE, PLAYER_RADIUS, hasWall, BIT,
  STAMINA_MAX, STAMINA_DRAIN, STAMINA_REGEN, STAMINA_MIN,
} from 'shared/constants.js';

export class Player {
  constructor(camera, domElement) {
    this.camera = camera;
    this.controls = new PointerLockControls(camera, domElement);
    this.velocity = new THREE.Vector3();
    this.keys = {};
    this.bob = 0;
    this.stepAccum = 0;
    this.onStep = null;     // callback for footstep audio
    this.sprinting = false; // shift held (intent)
    this.stamina = STAMINA_MAX;
    this._winded = false;   // true after exhausting; must recover to STAMINA_MIN
    this._bindKeys();
  }

  _bindKeys() {
    const down = e => {
      if (e.code === 'Enter') return;          // chat handled elsewhere
      this.keys[e.code] = true;
      if (e.code === 'ShiftLeft') this.sprinting = true;
    };
    const up = e => {
      this.keys[e.code] = false;
      if (e.code === 'ShiftLeft') this.sprinting = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
  }

  get object() { return this.controls.object; }
  lock() { this.controls.lock(); }
  unlock() { this.controls.unlock(); }
  get locked() { return this.controls.isLocked; }

  spawnAt(cellX, cellY) {
    this.object.position.set(cellX * TILE + TILE / 2, PLAYER_EYE, cellY * TILE + TILE / 2);
    this.velocity.set(0, 0, 0);
    this.stamina = STAMINA_MAX; this._winded = false;
  }

  update(dt, level) {
    const o = this.object;
    // desired direction in local space
    const fwd = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);
    const str = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);

    // Stamina-gated sprint: drains while sprinting, regens otherwise. Exhausting it "winds"
    // you — you can't sprint again until you've recovered to STAMINA_MIN.
    const wantsSprint = this.sprinting && fwd > 0 && !this._winded && this.stamina > 0;
    if (wantsSprint) {
      this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN * dt);
      if (this.stamina <= 0) this._winded = true;
    } else {
      this.stamina = Math.min(STAMINA_MAX, this.stamina + STAMINA_REGEN * dt);
      if (this._winded && this.stamina >= STAMINA_MIN) this._winded = false;
    }
    this.isSprinting = wantsSprint;
    const speed = wantsSprint ? PLAYER_SPRINT : PLAYER_SPEED;

    const dir = new THREE.Vector3();
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    dir.addScaledVector(forward, fwd).addScaledVector(right, str);
    if (dir.lengthSq() > 0) dir.normalize();

    const moving = dir.lengthSq() > 0;
    // Smooth accel/decel
    const target = dir.multiplyScalar(speed);
    this.velocity.x += (target.x - this.velocity.x) * Math.min(1, dt * 12);
    this.velocity.z += (target.z - this.velocity.z) * Math.min(1, dt * 12);

    let nx = o.position.x + this.velocity.x * dt;
    let nz = o.position.z + this.velocity.z * dt;
    if (level) { const c = this._clamp(level, nx, nz); nx = c.x; nz = c.z; }
    o.position.x = nx; o.position.z = nz;

    // Head-bob + footsteps
    if (moving) {
      const rate = (this.isSprinting ? 11 : 7);
      this.bob += dt * rate;
      this.stepAccum += dt * rate;
      if (this.stepAccum > Math.PI) { this.stepAccum -= Math.PI; if (this.onStep) this.onStep(); }
    } else { this.bob += (0 - (this.bob % (Math.PI * 2))) * 0; }
    o.position.y = PLAYER_EYE + Math.sin(this.bob) * (moving ? 0.045 : 0) + Math.sin(this.bob * 0.5) * 0.01;

    this.lastMoving = moving;
  }

  // Grid clamp: keep the player circle from crossing closed walls of its cell.
  _clamp(level, x, z) {
    const r = PLAYER_RADIUS;
    const cx = Math.floor(x / TILE), cy = Math.floor(z / TILE);
    const left = cx * TILE, right = (cx + 1) * TILE, top = cy * TILE, bottom = (cy + 1) * TILE;
    if (hasWall(level, cx, cy, BIT.W)) x = Math.max(x, left + r);
    if (hasWall(level, cx, cy, BIT.E)) x = Math.min(x, right - r);
    if (hasWall(level, cx, cy, BIT.N)) z = Math.max(z, top + r);
    if (hasWall(level, cx, cy, BIT.S)) z = Math.min(z, bottom - r);
    return { x, z };
  }
}
