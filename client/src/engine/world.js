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

    // ---- Ceiling support beams: the darker grid that divides the acoustic tiles. ----
    // Real protruding geometry (vs. flat texture) catches light and reads as structure.
    // Two InstancedMeshes (X-running and Z-running beams) every 2 cells. Cheap, no lights.
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x8c7d36, roughness: 0.85, metalness: 0 });
    const beamY = WALL_H - 0.08, bd = 0.16;
    const xLines = h + 1, zLines = w + 1;   // a beam on every cell boundary (4m grid)
    const beamX = new THREE.InstancedMesh(new THREE.BoxGeometry(w * S, 0.16, bd), beamMat, xLines);
    const beamZ = new THREE.InstancedMesh(new THREE.BoxGeometry(bd, 0.16, h * S), beamMat, zLines);
    const bm = new THREE.Matrix4();
    for (let i = 0; i < xLines; i++) { bm.makeTranslation(w * S / 2, beamY, i * S); beamX.setMatrixAt(i, bm); }
    for (let i = 0; i < zLines; i++) { bm.makeTranslation(i * S, beamY, h * S / 2); beamZ.setMatrixAt(i, bm); }
    beamX.instanceMatrix.needsUpdate = true; beamZ.instanceMatrix.needsUpdate = true;
    this.group.add(beamX); this.group.add(beamZ);

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

    // ---- Baseboards: dark vinyl trim where every wall meets the carpet. ----
    // Reuses the wall segment placements; one InstancedMesh. This single architectural
    // detail is what makes the rooms read as a real building instead of floating planes.
    const baseGeo = new THREE.BoxGeometry(S, 0.22, 0.26);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x2a2614, roughness: 0.6, metalness: 0.05 });
    const baseInst = new THREE.InstancedMesh(baseGeo, baseMat, segments.length);
    segments.forEach((s, i) => {
      e.set(0, s[3], 0); q.setFromEuler(e);
      m.compose(new THREE.Vector3(s[0], 0.11, s[2]), q, new THREE.Vector3(1, 1, 1));
      baseInst.setMatrixAt(i, m);
    });
    baseInst.instanceMatrix.needsUpdate = true; baseInst.receiveShadow = true;
    this.group.add(baseInst);

    // ---- Scattered electrical outlets — a defining Level 0 detail. ----
    // Small cream faceplates centered on a seeded subset of wall segments (same transform as
    // the baseboards, so orientation is correct), at outlet height. Centered on the wall plane
    // → shows on whichever side faces the room, no "wrong-facing" risk. One InstancedMesh.
    const orng = makeRng((level.seed ^ 0x51ed270b) >>> 0);
    const outletSegs = segments.filter(() => orng() < 0.06);
    if (outletSegs.length) {
      const outGeo = new THREE.BoxGeometry(0.12, 0.18, 0.26);
      const outMat = new THREE.MeshStandardMaterial({ color: 0xd8d2b8, roughness: 0.7, metalness: 0 });
      const outInst = new THREE.InstancedMesh(outGeo, outMat, outletSegs.length);
      outletSegs.forEach((s, i) => {
        e.set(0, s[3], 0); q.setFromEuler(e);
        m.compose(new THREE.Vector3(s[0], 0.35, s[2]), q, new THREE.Vector3(1, 1, 1));
        outInst.setMatrixAt(i, m);
      });
      outInst.instanceMatrix.needsUpdate = true;
      this.group.add(outInst);
    }

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
    const ex = p.x * TILE + TILE / 2, ez = p.y * TILE + TILE / 2;
    frame.position.set(ex, WALL_H * 0.475, ez);
    this.group.add(frame);
    const light = new THREE.PointLight(0x7a4dff, 9, 7, 2);
    light.position.copy(frame.position); this.group.add(light);
    this.exitMesh = frame; this.exitLight = light;

    // A flickering EXIT sign above the seam — a landmark you can trust to be the way out.
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#0b0402'; cx.fillRect(0, 0, 256, 96);
    cx.strokeStyle = '#3a0d06'; cx.lineWidth = 6; cx.strokeRect(3, 3, 250, 90);
    cx.fillStyle = '#ff3a22'; cx.font = 'bold 62px Arial'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.shadowColor = '#ff5a3a'; cx.shadowBlur = 24; cx.fillText('EXIT', 128, 52);
    const signTex = new THREE.CanvasTexture(cv);
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex, emissive: 0xff2a18, emissiveMap: signTex, emissiveIntensity: 2.2,
      transparent: true, side: THREE.DoubleSide, depthWrite: false,
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.38), signMat);
    sign.position.set(ex, WALL_H * 0.92, ez);
    this.group.add(sign);
    this.exitSign = sign;
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
    if (this.exitLight) this.exitLight.intensity = 8 + Math.sin(t * 3) * 3;
    if (this.exitSign) {
      // buzzing-sign flicker + billboard toward the player so it's readable on approach
      this.exitSign.material.emissiveIntensity = 1.8 + Math.sin(t * 13) * 0.3 + (Math.random() < 0.05 ? -1.2 : 0);
      if (playerPos) this.exitSign.lookAt(playerPos.x, this.exitSign.position.y, playerPos.z);
    }
  }
}
