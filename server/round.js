// Authoritative round manager: seed, timer, players, scoring, lifecycle, signed outcome.
import crypto from 'node:crypto';
import { ROUND_SECONDS, LOBBY_SECONDS, MIN_PLAYERS, scoreOf } from '../shared/constants.js';

export class Round {
  constructor(onEnd) {
    this.onEnd = onEnd;
    this.players = new Map();   // id -> player state
    this.eventLog = [];          // append-only, signed at end for verifiability
    this._new();
  }

  _new() {
    this.seed = crypto.randomBytes(4).readUInt32LE(0);
    this.startedAt = null;
    this.secondsLeft = ROUND_SECONDS;
    this.state = 'lobby';        // lobby | playing | over
    this.lobbyLeft = LOBBY_SECONDS;
    this.eventLog = [];
    this.winners = null;
    this._log('round_seed', { seed: this.seed });
  }

  _log(type, data) { this.eventLog.push({ t: Date.now(), type, data }); }

  addPlayer(id, name, wallet) {
    this.players.set(id, {
      id, name: name || 'Wanderer', wallet: wallet || null,
      x: 0, z: 0, ry: 0, depth: 0, sanity: 100, hp: 100, almond: 0,
      survivalSeconds: 0, exitsFound: 0, dead: false, joinedAt: Date.now(),
    });
    this._log('join', { id, name });
  }

  removePlayer(id) { this.players.delete(id); this._log('leave', { id }); }

  applyInput(id, msg) {
    const p = this.players.get(id); if (!p) return;
    p.x = msg.x ?? p.x; p.z = msg.z ?? p.z; p.ry = msg.ry ?? p.ry;
    p.depth = Math.max(p.depth, msg.depth ?? p.depth);
    p.sanity = msg.sanity ?? p.sanity; p.hp = msg.hp ?? p.hp;
    p.almond = msg.almond ?? p.almond; p.name = msg.name ?? p.name;
    if (msg.dead && !p.dead) { p.dead = true; this._log('dead', { id }); }
  }

  pickup(id, x, y) {
    const p = this.players.get(id); if (!p) return;
    p.almond += 1; this._log('pickup', { id, x, y });
  }

  descend(id) {
    const p = this.players.get(id); if (!p) return;
    p.exitsFound += 1; this._log('descend', { id, depth: p.exitsFound });
    // RACE MODE: the first player to reach an exit ESCAPES the Backrooms and wins the round.
    if (this.state === 'playing' && !this.escapedBy) {
      this.escapedBy = id; p.escaped = true;
      this._log('escape', { id, name: p.name, atSeconds: ROUND_SECONDS - this.secondsLeft });
      this._end();
    }
  }

  tick(dt) {
    if (this.state === 'lobby') {
      if (this.players.size >= MIN_PLAYERS) {
        this.lobbyLeft -= dt;
        if (this.lobbyLeft <= 0) this._begin();
      } else { this.lobbyLeft = LOBBY_SECONDS; }
    } else if (this.state === 'playing') {
      this.secondsLeft -= dt;
      for (const p of this.players.values()) if (!p.dead) p.survivalSeconds += dt;
      const alive = [...this.players.values()].filter(p => !p.dead);
      const ended = this.secondsLeft <= 0 || (this.players.size > 1 && alive.length <= 1 && this.players.size >= MIN_PLAYERS);
      if (ended) this._end();
    }
  }

  _begin() {
    this.state = 'playing';
    this.startedAt = Date.now();
    this.secondsLeft = ROUND_SECONDS;
    this.escapedBy = null;
    for (const p of this.players.values()) {
      Object.assign(p, { depth: 0, sanity: 100, hp: 100, almond: 0, survivalSeconds: 0, exitsFound: 0, dead: false, escaped: false });
    }
    this._log('begin', { seed: this.seed, players: this.players.size });
  }

  scoreboard() {
    return [...this.players.values()].map(p => ({
      id: p.id, name: p.name, wallet: p.wallet, depth: p.depth,
      score: scoreOf({ depth: p.depth, survivalSeconds: p.survivalSeconds, almondCollected: p.almond, exitsFound: p.exitsFound }),
    })).sort((a, b) => b.score - a.score);
  }

  _end() {
    if (this.state === 'over') return;
    this.state = 'over';
    const board = this.scoreboard();
    if (this.escapedBy) {
      // Race winner: whoever escaped first, regardless of score.
      const w = this.players.get(this.escapedBy);
      this.winners = w ? [{ id: w.id, name: w.name, wallet: w.wallet, depth: w.depth, score: board.find(b => b.id === w.id)?.score ?? 0, escaped: true }] : [];
    } else {
      // Timed out: nobody escaped — best score (deepest/longest survivor) takes it.
      const top = board[0]?.score ?? 0;
      this.winners = board.filter(p => p.score === top && top > 0);
    }
    this._log('end', { winners: this.winners.map(w => w.id), board, escapedBy: this.escapedBy || null });
    // Sign the outcome so it is verifiable / auditable before any payout.
    const payload = JSON.stringify({ seed: this.seed, board, winners: this.winners });
    this.signature = crypto.createHash('sha256').update(payload).digest('hex');
    this.onEnd?.(this);
  }

  // Public snapshot for clients.
  snapshot() {
    return {
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, x: p.x, z: p.z, ry: p.ry, depth: p.depth, dead: p.dead,
      })),
      round: {
        seed: this.seed, state: this.state,
        secondsLeft: Math.max(0, Math.round(this.secondsLeft)),
        lobbyLeft: Math.max(0, Math.round(this.lobbyLeft)),
        level: 0,
      },
    };
  }
}
