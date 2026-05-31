// WebSocket client. Falls back to a local solo round if the server is unreachable,
// so the game is ALWAYS playable (key robustness rule from SELF_PROMPT).
import { MSG } from 'shared/constants.js';

export class NetClient extends EventTarget {
  constructor() {
    super();
    this.ws = null;
    this.id = null;
    this.connected = false;
    this.offline = false;
    this.players = new Map();   // id -> {name, x, z, ry, depth, dead}
    this.round = null;
  }

  connect(name, wallet) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}`;
    try {
      const ws = new WebSocket(url);
      this.ws = ws;
      const failTimer = setTimeout(() => { if (!this.connected) this._goOffline(); }, 2500);
      ws.onopen = () => {
        clearTimeout(failTimer); this.connected = true;
        this._send(MSG.HELLO, { name, wallet });
      };
      ws.onmessage = ev => this._onMessage(ev.data);
      ws.onclose = () => { this.connected = false; if (!this.offline) this._goOffline(); };
      ws.onerror = () => { clearTimeout(failTimer); if (!this.connected) this._goOffline(); };
    } catch (e) { this._goOffline(); }
  }

  _goOffline() {
    if (this.offline) return;
    this.offline = true;
    this.id = 'solo';
    // Synthesize a round with a random seed so solo practice works with no server.
    const seed = (Math.floor((performance.now() % 1) * 1e9) ^ (Date.now() & 0xffffff)) >>> 0;
    this.round = { seed, level: 0, secondsLeft: 600, state: 'playing', pool: 0, network: 'devnet' };
    this.dispatchEvent(new CustomEvent('welcome', { detail: { id: this.id, round: this.round, offline: true } }));
  }

  _onMessage(data) {
    let msg; try { msg = JSON.parse(data); } catch { return; }
    switch (msg.t) {
      case MSG.WELCOME:
        this.id = msg.id; this.round = msg.round;
        this.dispatchEvent(new CustomEvent('welcome', { detail: { ...msg, offline: false } }));
        break;
      case MSG.STATE:
        for (const p of msg.players) {
          if (p.id === this.id) continue;
          this.players.set(p.id, p);
        }
        // prune
        const ids = new Set(msg.players.map(p => p.id));
        for (const k of this.players.keys()) if (!ids.has(k)) this.players.delete(k);
        this.round = { ...this.round, ...msg.round };
        this.dispatchEvent(new CustomEvent('state', { detail: msg }));
        break;
      case MSG.ROUND:
        this.round = msg.round;
        this.dispatchEvent(new CustomEvent('round', { detail: msg }));
        break;
      case MSG.WIN:
        this.dispatchEvent(new CustomEvent('win', { detail: msg }));
        break;
      case MSG.CHAT:
        this.dispatchEvent(new CustomEvent('chat', { detail: msg }));
        break;
      case MSG.FEED:
        this.dispatchEvent(new CustomEvent('feed', { detail: msg }));
        break;
    }
  }

  _send(t, payload) {
    if (this.ws && this.connected) {
      try { this.ws.send(JSON.stringify({ t, ...payload })); } catch {}
    }
  }

  sendInput(x, z, ry, stats) { this._send(MSG.INPUT, { x, z, ry, ...stats }); }
  sendPickup(cellX, cellY) { this._send(MSG.PICKUP, { x: cellX, y: cellY }); }
  sendDescend() { this._send(MSG.DESCEND, {}); }
  sendChat(text) { this._send(MSG.CHAT, { text }); }
  sendDead() { this._send(MSG.DEAD, {}); }
}
