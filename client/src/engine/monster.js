// THE HOLLOW — the apex Backrooms entity. A procedural 3D horror, not a billboard.
//
// Design (real game-feel craft, not just a model):
//  * Wrong proportions: ~2.6m tall, emaciated, arms that hang past the knees. The brain
//    reads "human but wrong" as threat. Pitch-black skin so it's a silhouette; the only
//    bright things are a too-wide grin and pinprick eyes — the face is the payload.
//  * THE MECHANIC: it's a Weeping Angel. While it's in your view AND unobstructed it
//    FREEZES (and twitches). The instant you look away — or a wall breaks line of sight —
//    it rushes you. So safety requires staring, but staring drains sanity and stops you
//    progressing. That tension is the scare, not a jumpscare alone.
//  * Escalation: breathing rises as it nears; at contact, a lunge + sting + screen punch.
import * as THREE from 'three';
import { TILE, worldToCell, hasWall, BIT } from 'shared/constants.js';

export class Hollow {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.visible = false;
    scene.add(this.root);
    this._build();
    this.state = 'hidden';        // hidden | stalking
    this.cooldown = 4 + Math.random() * 4;
    this.pos = new THREE.Vector3();
    this.facing = 0;
    this.observedT = 0;           // how long it's been watched (for the twitch)
    this.breath = 0;
  }

  _build() {
    const skin = new THREE.MeshStandardMaterial({ color: 0x070707, roughness: 0.85, metalness: 0.0, emissive: 0x050505, emissiveIntensity: 0.4 });
    const glow = (c, i) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.4 });

    // Torso — tall, narrow, slightly tapered.
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.25, 10), skin);
    torso.position.y = 1.55; this.root.add(torso);
    // Ribcage hint
    const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.14, 0.4, 8), skin);
    pelvis.position.y = 0.95; this.root.add(pelvis);

    // Neck + head (head tilted slightly — uncanny).
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.28, 6), skin);
    neck.position.y = 2.28; this.root.add(neck);
    this.head = new THREE.Group(); this.head.position.y = 2.5; this.root.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), skin);
    skull.scale.set(1, 1.25, 0.92); this.head.add(skull);

    // The grin — a wide emissive arc of teeth. The focal scare.
    const grin = new THREE.Group(); grin.position.set(0, -0.04, 0.17); this.head.add(grin);
    const toothMat = glow(0xfff7e6, 2.6);
    for (let i = -5; i <= 5; i++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.05 + Math.abs(i) * 0.006, 0.01), toothMat);
      t.position.set(i * 0.026, -Math.abs(i) * 0.012, 0); grin.add(t);
    }
    this.grin = grin;

    // Eyes — tiny, far too high, glowing.
    this.eyeMat = glow(0xffffff, 3.2);
    const eL = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), this.eyeMat);
    const eR = eL.clone(); eL.position.set(-0.075, 0.06, 0.17); eR.position.set(0.075, 0.06, 0.17);
    this.head.add(eL, eR); this.eyes = [eL, eR];
    // A faint glow light at the face (counts toward the light budget — just one).
    this.faceLight = new THREE.PointLight(0xffeedd, 0, 3.5, 2);
    this.head.add(this.faceLight);

    // Long arms (upper + fore + a clawed hand), hung unnaturally low.
    this.arms = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group(); shoulder.position.set(side * 0.2, 2.05, 0); this.root.add(shoulder);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.75, 6), skin);
      upper.position.y = -0.37; shoulder.add(upper);
      const elbow = new THREE.Group(); elbow.position.y = -0.75; shoulder.add(elbow);
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.03, 0.8, 6), skin);
      fore.position.y = -0.4; elbow.add(fore);
      const hand = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 5), skin);
      hand.position.y = -0.85; hand.rotation.x = Math.PI; elbow.add(hand);
      this.arms.push({ shoulder, elbow, side });
    }

    // Long legs.
    this.legs = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(side * 0.1, 0.95, 0); this.root.add(hip);
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.55, 6), skin);
      thigh.position.y = -0.28; hip.add(thigh);
      const knee = new THREE.Group(); knee.position.y = -0.55; hip.add(knee);
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.5, 6), skin);
      shin.position.y = -0.25; knee.add(shin);
      this.legs.push({ hip, knee, side });
    }
  }

  // ---- line of sight on the maze grid (true if a wall blocks a→b) ----
  _occluded(a, b, level) {
    let ca = worldToCell(a.x, a.z), cb = worldToCell(b.x, b.z);
    let x = ca.x, y = ca.y; const tx = cb.x, ty = cb.y;
    let guard = 0;
    while ((x !== tx || y !== ty) && guard++ < 200) {
      const dx = Math.sign(tx - x), dy = Math.sign(ty - y);
      // step horizontally or vertically toward target, checking the wall we'd cross
      if (dx !== 0 && (dy === 0 || Math.abs(tx - x) >= Math.abs(ty - y))) {
        if (hasWall(level, x, y, dx > 0 ? BIT.E : BIT.W)) return true; x += dx;
      } else if (dy !== 0) {
        if (hasWall(level, x, y, dy > 0 ? BIT.S : BIT.N)) return true; y += dy;
      } else break;
    }
    return false;
  }

  // returns { drain:0..1, attack:bool, visible, dist, observed }
  update(dt, t, playerPos, camera, sanity, level) {
    this.cooldown -= dt;

    if (this.state === 'hidden') {
      this.root.visible = false;
      // Materialize out of view when nerves are frayed.
      const pressure = sanity < 60 ? (sanity < 30 ? 0.6 : 0.22) : 0.04;
      if (this.cooldown <= 0 && Math.random() < dt * pressure) this._spawn(playerPos, camera, level);
      return { drain: 0, attack: false, visible: false, dist: 99, observed: false };
    }

    const toMon = new THREE.Vector3().subVectors(this.pos, camera.position);
    const dist = toMon.length(); toMon.normalize();
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
    const inFov = fwd.dot(toMon) > 0.55;                          // ~57° cone
    const occluded = this._occluded(camera.position, this.pos, level);
    const observed = inFov && !occluded && dist < 22;

    // Movement: freeze while watched, rush when unwatched.
    if (observed) {
      this.observedT += dt;
      // micro-twitch while frozen — it wants to move
      this.root.position.x = this.pos.x + Math.sin(t * 40) * 0.012 * Math.min(1, this.observedT);
      this.root.position.z = this.pos.z + Math.cos(t * 37) * 0.012 * Math.min(1, this.observedT);
      this.root.position.y = this.pos.y;
    } else {
      this.observedT = 0;
      const speed = (sanity < 30 ? 3.4 : 2.4);
      const dir = new THREE.Vector3().subVectors(playerPos, this.pos); dir.y = 0; dir.normalize();
      this.pos.addScaledVector(dir, speed * dt);
      this.facing = Math.atan2(dir.x, dir.z);
      this.root.position.copy(this.pos);
    }
    this.root.rotation.y = this.facing;

    // Animation: creeping gait + arm sway + head tracking the player.
    const gait = observed ? 0 : 1;
    const stride = Math.sin(t * 6) * 0.5 * gait;
    this.legs.forEach((l, i) => { l.hip.rotation.x = stride * (i ? 1 : -1); l.knee.rotation.x = Math.max(0, -stride * (i ? 1 : -1)) * 1.2; });
    this.arms.forEach((a, i) => { a.shoulder.rotation.x = -stride * (i ? 1 : -1) * 0.6 + Math.sin(t * 1.3 + i) * 0.06; a.elbow.rotation.x = 0.5 + Math.sin(t * 2 + i) * 0.1; });
    this.head.lookAt(camera.position.x, camera.position.y + 0.3, camera.position.z);
    this.head.rotation.z = Math.sin(t * 2.3) * 0.12;             // unsettling head-tilt
    // grin/eyes brighten the closer it gets
    const near = THREE.MathUtils.clamp((12 - dist) / 12, 0, 1);
    this.eyeMat.emissiveIntensity = 2.5 + near * 3 + (observed ? Math.sin(t * 30) * 0.6 : 0);
    this.faceLight.intensity = near * 1.4 * (observed ? 1 : 0.4);

    // Attack only lands when it reaches you UNWATCHED (it got you while you weren't looking).
    let attack = false;
    if (dist < 1.4 && !observed && this.cooldown <= 0) { attack = true; this.cooldown = 3; this._despawn(); }
    // Despawn if you keep it watched long enough and you're calm-ish (it loses interest).
    if (observed && this.observedT > 6 && sanity > 45) this._despawn();

    const drain = THREE.MathUtils.clamp((14 - dist) / 14, 0, 1) * (observed ? 1.4 : 0.7);
    this.breath = drain;
    return { drain, attack, visible: true, dist, observed };
  }

  _spawn(playerPos, camera, level) {
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
    for (let i = 0; i < 16; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * 5;
      const x = playerPos.x + Math.cos(ang) * r, z = playerPos.z + Math.sin(ang) * r;
      const cell = worldToCell(x, z);
      if (cell.x <= 0 || cell.y <= 0 || cell.x >= level.w - 1 || cell.y >= level.h - 1) continue;
      const to = new THREE.Vector3(x - camera.position.x, 0, z - camera.position.z).normalize();
      if (fwd.dot(to) > 0.3) continue;                            // prefer to appear behind/aside
      this.pos.set(cell.x * TILE + TILE / 2, 0, cell.y * TILE + TILE / 2);
      this.root.position.copy(this.pos); this.root.visible = true;
      this.state = 'stalking'; this.observedT = 0;
      return;
    }
  }

  _despawn() {
    this.state = 'hidden'; this.root.visible = false;
    this.faceLight.intensity = 0;
    this.cooldown = 7 + Math.random() * 9;
  }
}
