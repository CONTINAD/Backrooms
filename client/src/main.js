import * as THREE from 'three';
import {
  generateLevel, scoreOf, TILE, PLAYER_EYE, SANITY_MAX, SANITY_DRAIN, SANITY_DARK_MULT,
  SANITY_ENTITY_MULT, ALMOND_RESTORE, LOW_SANITY, SANITY_DAMAGE, PLAYER_HP, TICK_HZ,
  worldToCell, cellCenter,
} from 'shared/constants.js';
import { World } from './engine/world.js';
import { Player } from './engine/player.js';
import { Hollow } from './engine/monster.js';
import { Post } from './engine/post.js';
import { Dust } from './engine/dust.js';
import { AudioEngine } from './engine/audio.js';
import { NetClient } from './net/client.js';
import { Wallet } from './crypto/wallet.js';

const $ = s => document.querySelector(s);

class Game {
  constructor() {
    this.net = new NetClient();
    this.wallet = new Wallet();
    this.audio = new AudioEngine();
    this.avatars = new Map();      // id -> {group, nameSprite}
    this.state = 'menu';
    this.clock = new THREE.Clock();
    this.tickAccum = 0;
    this._initRenderer();
    this._wireMenu();
    this._wireNet();
    window.addEventListener('resize', () => this._onResize());
    $('#loading').classList.add('hidden');
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    document.body.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d0c07);
    this.scene.fog = new THREE.FogExp2(0x100e08, 0.042);

    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 200);
    this.scene.add(new THREE.AmbientLight(0x7a6e3e, 0.85));
    // Hemisphere fill: warm ceiling glow, dim carpet bounce — reads better than flat ambient.
    this.scene.add(new THREE.HemisphereLight(0xfff0c8, 0x2a2414, 0.5));

    this.world = new World(this.scene);
    this.player = new Player(this.camera, this.renderer.domElement);
    this.player.onStep = () => this.audio.footstep();
    this.scene.add(this.player.object);
    this.monster = new Hollow(this.scene);
    this.dust = new Dust(this.scene);
    this.post = new Post(this.renderer, this.scene, this.camera);
  }

  // ---------- Menu / lobby ----------
  _wireMenu() {
    $('#name-input').value = 'Wanderer' + Math.floor(Math.random() * 1000);
    $('#play-btn').addEventListener('click', () => this._enter());
    $('#again-btn').addEventListener('click', () => location.reload());
    $('#connect-wallet').addEventListener('click', async () => {
      try {
        const pk = await this.wallet.connect();
        $('#wallet-line').textContent = `Connected: ${this.wallet.short()}  (payouts bind to this address)`;
        $('#connect-wallet').textContent = this.wallet.short();
      } catch (e) { $('#wallet-line').textContent = e.message; }
    });
    // Allow play as soon as net says welcome (or offline fallback).
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.player.locked) this.player.lock();
    });
  }

  _wireNet() {
    this.net.addEventListener('welcome', e => {
      const { round, offline } = e.detail;
      this.round = round;
      $('#lobby-status').textContent = offline
        ? 'Offline solo practice (server unreachable) — full game still playable.'
        : 'Connected. Enter when ready.';
      $('#pool-amount').textContent = (round.pool ?? 0) + ' SOL';
      $('#net-badge').textContent = round.network || 'devnet';
      $('#play-btn').disabled = false;
    });
    this.net.addEventListener('state', e => this._onState(e.detail));
    this.net.addEventListener('win', e => this._onRoundOver(e.detail));
    this.net.addEventListener('chat', e => this._addChat(e.detail.name, e.detail.text));
    // Start connecting immediately so the lobby fills.
    this.net.connect($('#name-input').value, this.wallet.pubkey);
  }

  _enter() {
    this.audio.start();
    $('#menu').classList.add('hidden');
    $('#hud').classList.remove('hidden');
    this._startRound(this.round);
    this.state = 'playing';
    this.player.lock();
    this.clock.start();
    this._loop();
  }

  _startRound(round) {
    this.level = generateLevel(round.seed >>> 0);
    this.depth = round.level || 0;
    this.world.build(this.level);
    this.player.spawnAt(this.level.start.x, this.level.start.y);
    this.sanity = SANITY_MAX;
    this.hp = PLAYER_HP;
    this.almond = 0;
    this.exitsFound = 0;
    this.survival = 0;
    this.alive = true;
    this._escaped = false;
    this.secondsLeft = round.secondsLeft ?? 600;
    $('#level-name').textContent = `LEVEL ${this.depth} — ${this._levelName(this.depth)}`;
    this._toast('You no-clipped into the Backrooms. Find the exit.');
  }

  _levelName(d) {
    return ['THE LOBBY', 'HABITABLE ZONE', 'PIPE DREAMS', 'RUN FOR YOUR LIFE'][d] || `THE DEEP (${d})`;
  }

  // ---------- Main loop ----------
  _loop() {
    if (this.state !== 'playing') return;
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    // Robust viewport sync — some embed/preview contexts resize without a resize event.
    if (this.renderer.domElement.width !== Math.floor(innerWidth * this.renderer.getPixelRatio()) ||
        this.renderer.domElement.height !== Math.floor(innerHeight * this.renderer.getPixelRatio())) {
      this._onResize();
    }
    this._fps = this._fps ? this._fps * 0.9 + (1 / Math.max(dt, 1e-4)) * 0.1 : 1 / Math.max(dt, 1e-4);

    if (this.alive) {
      this.player.update(dt, this.level);
      this.survival += dt;
    }
    const pos = this.player.object.position;
    this.world.update(dt, t, pos);
    this.dust.update(dt, t, pos);

    // ---- Sanity model ----
    const lightLevel = this._lightAt(pos);
    const sm = this.monster.update(dt, t, pos, this.camera, this.sanity, this.level);
    let drain = SANITY_DRAIN;
    if (lightLevel < 0.35) drain *= SANITY_DARK_MULT;
    if (sm.visible) drain *= 1 + sm.drain * (SANITY_ENTITY_MULT - 1);
    if (this.alive) this.sanity = Math.max(0, this.sanity - drain * dt);

    if (this.sanity <= 0 && this.alive) this.hp = Math.max(0, this.hp - SANITY_DAMAGE * dt);
    if (sm.attack) { this.hp = Math.max(0, this.hp - 38); this.audio.sting(); this._shake(1); this._jumpFlash(); }
    if (this.hp <= 0 && this.alive) this._die();

    // Heartbeat + tension audio
    const tension = THREE.MathUtils.clamp((LOW_SANITY - this.sanity) / LOW_SANITY, 0, 1);
    this.audio.setTension(Math.max(tension, sm.visible ? sm.drain : 0));
    this._beatAccum = (this._beatAccum || 0) + dt;
    if (this.sanity < LOW_SANITY && this._beatAccum > (0.4 + (this.sanity / LOW_SANITY) * 0.6)) {
      this.audio.heartbeat(1 - this.sanity / LOW_SANITY); this._beatAccum = 0;
    }
    // The Hollow breathes — faster and louder the closer it gets.
    if (sm.visible && sm.dist < 12) {
      this._breathAccum = (this._breathAccum || 0) + dt;
      const interval = 0.5 + (sm.dist / 12) * 1.6;
      if (this._breathAccum > interval) { this.audio.breath(THREE.MathUtils.clamp((12 - sm.dist) / 12, 0.2, 1)); this._breathAccum = 0; }
    }
    // Distant unsettling ambience — something far off. More frequent as sanity drops.
    this._ambAccum = (this._ambAccum || 0) + dt;
    if (this._ambAccum > (this._ambNext || 12)) {
      this.audio.ambientEvent();
      this._ambAccum = 0;
      const fear = 1 - this.sanity / SANITY_MAX;
      this._ambNext = (14 - fear * 7) * (0.6 + Math.random() * 0.9); // ~8–21s, sooner when scared
    }

    this._checkPickups(pos);
    this._checkExit(pos);
    this._updateAvatars(dt);
    this._updateHud(sm, dt);

    // ---- Network tick ----
    this.tickAccum += dt;
    if (this.tickAccum > 1 / TICK_HZ) {
      this.tickAccum = 0;
      const ry = this.camera.rotation.y;
      this.net.sendInput(pos.x, pos.z, ry, {
        depth: this.depth, sanity: Math.round(this.sanity), hp: Math.round(this.hp),
        almond: this.almond, score: this._score(), dead: !this.alive,
        name: $('#name-input').value,
      });
    }

    this.post.render(dt, this.sanity / SANITY_MAX);
  }

  _lightAt(pos) {
    // Cheap approximation: brightness from nearest panel lights.
    let max = 0;
    for (const L of this.world.lightPool) {
      const d = L.position.distanceTo(pos);
      max = Math.max(max, (L.intensity / 16) * Math.max(0, 1 - d / (TILE * 4)));
    }
    return THREE.MathUtils.clamp(max + 0.22, 0, 1);
  }

  _checkPickups(pos) {
    for (const a of this.world.almondMeshes) {
      if (a.taken) continue;
      if (a.mesh.position.distanceTo(pos) < 1.1) {
        a.taken = true; a.mesh.visible = false;
        this.sanity = Math.min(SANITY_MAX, this.sanity + ALMOND_RESTORE);
        this.almond++; this.audio.pickup();
        this._toast('Almond Water +' + ALMOND_RESTORE + ' sanity');
        this.net.sendPickup(a.cell.x, a.cell.y);
      }
    }
  }

  _checkExit(pos) {
    if (!this.world.exitMesh || this._escaped) return;
    if (this.world.exitMesh.position.distanceTo(pos) < 1.6) {
      if (!this._exitPrompted) { this._exitPrompted = true; this._toast('THE SEAM — press E to ESCAPE'); }
      if (this.player.keys['KeyE']) {
        this.player.keys['KeyE'] = false;
        this._escaped = true; this.exitsFound++; this.depth++;
        this.net.sendDescend();                 // server: first escape wins the round
        this.audio.sting();
        this._toast('YOU NO-CLIPPED OUT. YOU ESCAPED.');
        // Offline solo: end immediately as the winner. Online: the server broadcasts WIN.
        if (this.net.offline) setTimeout(() => this._onRoundOver({ scores: this._soloBoard(), escaped: true, self: true }), 1400);
      }
    } else { this._exitPrompted = false; }
  }

  _score() { return scoreOf({ depth: this.depth, survivalSeconds: this.survival, almondCollected: this.almond, exitsFound: this.exitsFound }); }

  _die() {
    this.alive = false;
    this.audio.sting(); this._shake(1);
    this.net.sendDead();
    this._toast('YOU SUCCUMBED TO THE BACKROOMS');
    setTimeout(() => this._onRoundOver({ scores: this._soloBoard(), self: true }), 2600);
  }

  _soloBoard() {
    return [{ name: $('#name-input').value, score: this._score(), depth: this.depth, you: true }];
  }

  // ---------- Other players ----------
  _onState(msg) {
    if (msg.round) {
      this.secondsLeft = msg.round.secondsLeft ?? this.secondsLeft;
      if (msg.round.pool != null) this._pool = msg.round.pool;
    }
  }

  _ensureAvatar(p) {
    if (this.avatars.has(p.id)) return this.avatars.get(p.id);
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.32, 1.0, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x222018, emissive: 0x40381c, emissiveIntensity: 0.4, roughness: 0.8 })
    );
    body.position.y = 0.9; group.add(body);
    // nametag
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const ctx = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    tag.scale.set(2, 0.5, 1); tag.position.y = 2.1; group.add(tag);
    this.scene.add(group);
    const av = { group, body, tag, ctx, tex, cv };
    this.avatars.set(p.id, av);
    return av;
  }

  _updateAvatars(dt) {
    for (const [id, p] of this.net.players) {
      const av = this._ensureAvatar(p);
      const tx = p.x, tz = p.z;
      av.group.position.x += (tx - av.group.position.x) * Math.min(1, dt * 10);
      av.group.position.z += (tz - av.group.position.z) * Math.min(1, dt * 10);
      av.group.rotation.y = p.ry || 0;
      av.body.material.opacity = p.dead ? 0.25 : 1;
      av.body.material.transparent = p.dead;
      if (av._name !== p.name || av._dead !== p.dead) {
        av._name = p.name; av._dead = p.dead;
        const c = av.ctx; c.clearRect(0, 0, 256, 64);
        c.font = 'bold 26px Courier New'; c.textAlign = 'center';
        c.fillStyle = p.dead ? '#777' : '#d8c15a'; c.shadowColor = '#000'; c.shadowBlur = 6;
        c.fillText((p.name || '???') + (p.dead ? ' †' : ''), 128, 40);
        av.tex.needsUpdate = true;
      }
    }
    for (const [id, av] of this.avatars) {
      if (!this.net.players.has(id)) { this.scene.remove(av.group); this.avatars.delete(id); }
    }
  }

  // ---------- HUD ----------
  _updateHud(sm, dt) {
    $('#sanity-fill').style.width = (this.sanity / SANITY_MAX * 100) + '%';
    $('#sanity-fill').style.background = this.sanity < LOW_SANITY ? '#b5482e' : '#5ad0d8';
    $('#hp-fill').style.width = (this.hp / PLAYER_HP * 100) + '%';
    const stam = $('#stam-fill');
    stam.style.width = (this.player.stamina) + '%';
    stam.classList.toggle('winded', this.player._winded);
    $('#almond-count').textContent = this.almond;
    $('#depth-count').textContent = this.depth;
    $('#score-count').textContent = this._score();
    const total = (this.net.players.size + 1);
    const dead = [...this.net.players.values()].filter(p => p.dead).length + (this.alive ? 0 : 1);
    $('#alive-count').textContent = Math.max(0, total - dead);
    // Online: the server owns the clock (snapped in _onState). Offline solo: count locally.
    if (this.net.offline) this.secondsLeft -= dt;
    const left = Math.max(0, this.secondsLeft);
    $('#round-timer').textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    if (this.secondsLeft <= 0 && this.alive) this._onRoundOver({ scores: this._soloBoard(), timeout: true });
    this._updateCompass();
    const warn = $('#entity-warning');
    const showWarn = sm.visible && sm.dist < 14;
    warn.classList.toggle('hidden', !showWarn);
    if (showWarn) warn.textContent = sm.observed ? "DON'T LOOK AWAY" : (sm.dist < 6 ? 'IT IS BEHIND YOU' : 'SOMETHING IS NEAR');
    document.documentElement.style.setProperty('--san', this.sanity);
  }

  // Diegetic "exit sense" — a faint purple pull toward the no-clip seam. Without it, a
  // 48×48 maze with no minimap is effectively unwinnable for humans. Kept subtle so it
  // guides rather than trivializes; fades out when you're basically on top of the exit.
  _updateCompass() {
    if (!this.level) return;
    const exit = cellCenter(this.level.exit.x, this.level.exit.y);
    const p = this.camera.position;
    const tox = exit.x - p.x, toz = exit.z - p.z;
    const dist = Math.hypot(tox, toz);
    const worldAngle = Math.atan2(tox, toz);
    const fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd);
    const fwdAngle = Math.atan2(fwd.x, fwd.z);
    let rel = worldAngle - fwdAngle;
    while (rel > Math.PI) rel -= Math.PI * 2; while (rel < -Math.PI) rel += Math.PI * 2;
    const el = $('#compass'); const arrow = $('#compass-arrow');
    arrow.style.transform = `rotate(${(rel * 180 / Math.PI).toFixed(1)}deg)`;
    $('#compass-dist').textContent = dist < 3 ? 'THE SEAM' : Math.round(dist) + 'm';
    // visible when not extremely close; subtle flicker; dimmer as sanity drops (harder when scared)
    const base = dist < 3 ? 0 : 0.5;
    const flick = 0.85 + Math.random() * 0.15;
    el.style.opacity = (base * flick * (0.5 + 0.5 * (this.sanity / SANITY_MAX))).toFixed(2);
  }

  // White-to-red flash punch when The Hollow lands a hit.
  _jumpFlash() {
    let el = $('#jumpflash');
    if (!el) { el = document.createElement('div'); el.id = 'jumpflash'; document.body.appendChild(el); }
    el.style.cssText = 'position:fixed;inset:0;z-index:30;pointer-events:none;background:radial-gradient(circle,#b5482eaa,#000c);opacity:1;transition:opacity .5s';
    requestAnimationFrame(() => { el.style.opacity = '0'; });
  }

  _toast(text) {
    const el = $('#toast'); el.textContent = text; el.style.opacity = 1;
    clearTimeout(this._toastT); this._toastT = setTimeout(() => el.style.opacity = 0, 2600);
  }
  _addChat(name, text) {
    const log = $('#chatlog'); const d = document.createElement('div');
    d.textContent = `${name}: ${text}`; log.appendChild(d);
    while (log.children.length > 6) log.removeChild(log.firstChild);
  }
  _shake(amount) {
    this._shakeAmt = amount;
    const start = performance.now();
    const cam = this.camera;
    const tick = () => {
      const e = (performance.now() - start) / 400;
      if (e >= 1) return;
      const a = amount * (1 - e) * 0.06;
      cam.rotation.z = (Math.random() - 0.5) * a;
      requestAnimationFrame(tick);
    };
    tick();
  }

  _onRoundOver(data) {
    if (this.state === 'over') return;
    this.state = 'over';
    this.player.unlock();
    $('#hud').classList.add('hidden');
    $('#results').classList.remove('hidden');
    const board = (data.scores || this._soloBoard()).sort((a, b) => b.score - a.score);
    const escaperName = data.escapedName || (data.escaped && board[0]?.name);
    $('#results-title').textContent =
      data.escaped ? (this._escaped ? 'YOU ESCAPED THE BACKROOMS 🏆' : `${escaperName || 'SOMEONE'} ESCAPED FIRST`)
      : data.timeout ? 'TIME — NOBODY ESCAPED'
      : (board[0]?.you ? 'YOU SURVIVED DEEPEST' : 'ROUND OVER');
    const ol = $('#scoreboard'); ol.innerHTML = '';
    board.forEach((p, i) => {
      const li = document.createElement('li');
      if (i === 0) li.classList.add('win');
      li.innerHTML = `<span>${i === 0 ? '🏆 ' : (i + 1) + '. '}${p.name}${p.you ? ' (you)' : ''}</span><span class="pts">L${p.depth || 0} · ${p.score} pts</span>`;
      ol.appendChild(li);
    });
    const pool = this._pool ?? this.round?.pool ?? 0;
    $('#payout-line').textContent = pool > 0
      ? `Winner receives ${pool} SOL (${this.round?.network || 'devnet'}). ${this.wallet.pubkey ? 'Bound to ' + this.wallet.short() : 'Connect a wallet next round to be eligible.'}`
      : 'Devnet demo pool. Connect Phantom to play for prizes.';
  }

  _onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.post.setSize(innerWidth, innerHeight);
  }
}

window.__game = new Game();
