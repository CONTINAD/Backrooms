// Builds the Three.js scene geometry for a level from shared maze data.
// Walls/floor/ceiling are merged-ish via InstancedMesh for performance.
import * as THREE from 'three';
import { TILE, WALL_H, BIT, makeRng } from 'shared/constants.js';
import { wallpaperTexture, carpetTexture, ceilingTexture } from './textures.js';

export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.panelPositions = [];  // every ceiling panel's world position (for nearest-light)
    this.lightPool = [];        // small pool of PointLights that follow the player
    this.almondMeshes = [];     // {mesh, cell, taken}
    this.exitMesh = null;
    this.POOL = 12;             // max simultaneous point lights — well under GPU uniform budget
    this._mats();
  }

  _mats() {
    this.wallMat = new THREE.MeshStandardMaterial({ map: wallpaperTexture(), roughness: 0.93, metalness: 0 });
    const floorTex = carpetTexture(); floorTex.repeat.set(1, 1);
    this.floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1, metalness: 0 });
    this.ceilMat = new THREE.MeshStandardMaterial({ map: ceilingTexture(), roughness: 0.95, metalness: 0 });
    this.panelMat = new THREE.MeshStandardMaterial({ color: 0xfff4d0, emissive: 0xfff0c0, emissiveIntensity: 1.35 });
  }

  clear() {
    this.group.clear();
    this.lightPool.forEach(l => this.scene.remove(l));
    this.lightPool = []; this.panelPositions = [];
    this.almondMeshes = []; this.exitMesh = null;
    if (this.exitLight) { this.scene.remove(this.exitLight); this.exitLight = null; }
  }

  build(level) {
    this.clear();
    this.level = level;
    const w = level.w, h = level.h, S = TILE;

    // ---- Floor & ceiling as two big planes (tiled texture) ----
    const floorGeo = new THREE.PlaneGeometry(w * S, h * S);
    this.floorMat.map.repeat.set(w, h);
    const floor = new THREE.Mesh(floorGeo, this.floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(w * S / 2, 0, h * S / 2);
    floor.receiveShadow = true; this.group.add(floor);

    const ceilGeo = new THREE.PlaneGeometry(w * S, h * S);
    this.ceilMat.map.repeat.set(w, h);
    const ceil = new THREE.Mesh(ceilGeo, this.ceilMat);
    ceil.rotation.x = Math.PI / 2; ceil.position.set(w * S / 2, WALL_H, h * S / 2);
    this.group.add(ceil);

    // ---- Walls via InstancedMesh ----
    const segGeo = new THREE.BoxGeometry(S, WALL_H, 0.2);
    const segments = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const b = level.walls[y * w + x];
        const cx = x * S + S / 2, cz = y * S + S / 2;
        if (b & BIT.N) segments.push([cx, WALL_H / 2, y * S, 0]);
        if (b & BIT.W) segments.push([x * S, WALL_H / 2, cz, Math.PI / 2]);
        if (x === w - 1 && (b & BIT.E)) segments.push([(x + 1) * S, WALL_H / 2, cz, Math.PI / 2]);
        if (y === h - 1 && (b & BIT.S)) segments.push([cx, WALL_H / 2, (y + 1) * S, 0]);
      }
    }
    const inst = new THREE.InstancedMesh(segGeo, this.wallMat, segments.length);
    const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const e = new THREE.Euler();
    segments.forEach((s, i) => {
      e.set(0, s[3], 0); q.setFromEuler(e);
      m.compose(new THREE.Vector3(s[0], s[1], s[2]), q, new THREE.Vector3(1, 1, 1));
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true; inst.castShadow = true; inst.receiveShadow = true;
    this.group.add(inst);
    this.wallInstanced = inst;

    // ---- Fluorescent ceiling panels (emissive) as ONE instanced mesh ----
    // Every panel glows (cheap, drives bloom). Actual dynamic PointLights come from a small
    // pool that follows the player — using a real light per panel blows the GPU's fragment
    // uniform budget and makes the lit shader render black. (Learned the hard way.)
    // Lore-accurate: fluorescent lights are "seemingly distributed at random", not gridded.
    // Seeded from the level so every player sees the SAME placement (fair multiplayer).
    const prng = makeRng((level.seed ^ 0x9e3779b9) >>> 0);
    const positions = [];
    // Jittered base every ~2 cells with occasional gaps: irregular ("seemingly random")
    // but no large unlit voids, so the place stays navigable.
    for (let y = 1; y < h - 1; y += 2) for (let x = 1; x < w - 1; x += 2) {
      if (prng() < 0.84) {
        positions.push([
          x * S + S / 2 + (prng() - 0.5) * S * 1.1, WALL_H - 0.06,
          y * S + S / 2 + (prng() - 0.5) * S * 1.1,
        ]);
      }
    }
    const panelGeo = new THREE.BoxGeometry(S * 0.6, 0.08, S * 0.6);
    const panels = new THREE.InstancedMesh(panelGeo, this.panelMat, positions.length);
    const pm = new THREE.Matrix4();
    positions.forEach((p, i) => {
      pm.makeTranslation(p[0], p[1], p[2]); panels.setMatrixAt(i, pm);
      this.panelPositions.push(new THREE.Vector3(p[0], WALL_H - 0.3, p[2]));
    });
    panels.instanceMatrix.needsUpdate = true;
    this.group.add(panels);
    this.panelInstanced = panels;

    // Hazy light shafts under each panel — that thick, dust-laden fluorescent column.
    // One additive InstancedMesh (commutative blending → no sort needed), cheap, big payoff.
    const shaftGeo = new THREE.CylinderGeometry(0.35, 1.5, WALL_H * 0.96, 10, 1, true);
    const shaftMat = new THREE.MeshBasicMaterial({
      color: 0xffeec0, transparent: true, opacity: 0.07, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const shafts = new THREE.InstancedMesh(shaftGeo, shaftMat, positions.length);
    positions.forEach((p, i) => { pm.makeTranslation(p[0], WALL_H * 0.5, p[2]); shafts.setMatrixAt(i, pm); });
    shafts.instanceMatrix.needsUpdate = true;
    this.group.add(shafts);
    this.shaftInstanced = shafts;

    // The light pool.
    for (let i = 0; i < this.POOL; i++) {
      const L = new THREE.PointLight(0xfff0c8, 16, S * 6.5, 2);
      L.userData.phase = Math.random() * 7;
      L.userData.rate = 0.4 + Math.random() * 2.4;
      this.scene.add(L); this.lightPool.push(L);
    }

    this._buildAlmonds(level);
    this._buildExit(level);
    return this;
  }

  _buildAlmonds(level) {
    // Strongly emissive so they read as glowing beacons through bloom — no per-bottle
    // PointLight (that would re-introduce the too-many-lights problem).
    const geo = new THREE.CylinderGeometry(0.12, 0.14, 0.42, 10);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xeef6ff, emissive: 0x59d8e6, emissiveIntensity: 1.7,
      transparent: true, opacity: 0.9, roughness: 0.2,
    });
    for (const a of level.almonds) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(a.x * TILE + TILE / 2, 0.5, a.y * TILE + TILE / 2);
      this.group.add(mesh);
      this.almondMeshes.push({ mesh, cell: a, taken: false });
    }
  }

  _buildExit(level) {
    // A glowing dark doorway — the no-clip seam to the next level.
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(TILE * 0.7, WALL_H * 0.95, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x05060a, emissive: 0x1a0030, emissiveIntensity: 0.8 })
    );
    const p = level.exit;
    frame.position.set(p.x * TILE + TILE / 2, WALL_H * 0.475, p.y * TILE + TILE / 2);
    this.group.add(frame);
    const light = new THREE.PointLight(0x7a4dff, 16, 8, 2);
    light.position.copy(frame.position); this.group.add(light);
    this.exitMesh = frame; this.exitLight = light;
  }

  update(dt, t, playerPos) {
    // Move the light pool onto the nearest ceiling panels around the player each frame.
    if (playerPos && this.panelPositions.length) {
      // partial selection: find POOL nearest panels (cheap for a few hundred panels)
      const scored = this.panelPositions;
      // simple nearest-N via distance compare on the pool slots
      const nearest = [];
      for (const p of scored) {
        const d = p.distanceToSquared(playerPos);
        if (nearest.length < this.POOL) { nearest.push({ p, d }); nearest.sort((a, b) => a.d - b.d); }
        else if (d < nearest[this.POOL - 1].d) { nearest[this.POOL - 1] = { p, d }; nearest.sort((a, b) => a.d - b.d); }
      }
      this.lightPool.forEach((L, i) => {
        const n = nearest[i];
        if (!n) { L.intensity = 0; return; }
        L.position.copy(n.p);
        // per-light fluorescent flicker
        const f = 0.82 + 0.18 * Math.sin(t * L.userData.rate + L.userData.phase)
          + (Math.random() < 0.015 ? -0.55 : 0);
        L.intensity = 16 * Math.max(0.05, f);
      });
    }
    // Subtle global panel emissive flicker (shared material).
    this.panelMat.emissiveIntensity = 1.3 + Math.sin(t * 9.3) * 0.12 + (Math.random() < 0.04 ? -0.5 : 0);

    // Bob almond bottles.
    for (const a of this.almondMeshes) {
      if (a.taken) continue;
      a.mesh.rotation.y += dt * 1.2;
      a.mesh.position.y = 0.5 + Math.sin(t * 2 + a.cell.x) * 0.08;
    }
    if (this.exitLight) this.exitLight.intensity = 13 + Math.sin(t * 3) * 5;
  }
}
