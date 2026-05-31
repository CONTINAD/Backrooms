// BACKROOMS: NO-CLIP server — static file host + WebSocket multiplayer hub.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { config, assertSafeToStart } from './config.js';
import { Round } from './round.js';
import { PrizePool } from './prizepool.js';
import { MSG, TICK_HZ } from '../shared/constants.js';

assertSafeToStart();

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CLIENT = path.join(ROOT, 'client');
const SHARED = path.join(ROOT, 'shared');
const THREE_DIR = path.join(ROOT, 'node_modules', 'three');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
};

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain', 'Cache-Control': 'no-cache' });
  res.end(body);
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, 'Not found: ' + path.basename(filePath));
    send(res, 200, data, MIME[path.extname(filePath)] || 'application/octet-stream');
  });
}

// Map request paths to files. Maps /vendor/* to the installed three package so the
// browser importmap ("three" -> /vendor/three.module.js) works with no bundler.
function resolvePath(pathname) {
  if (pathname === '/' || pathname === '') return path.join(CLIENT, 'index.html');
  if (pathname.startsWith('/shared/')) return path.join(SHARED, pathname.slice('/shared/'.length));
  if (pathname === '/vendor/three.module.js') return path.join(THREE_DIR, 'build', 'three.module.js');
  if (pathname.startsWith('/vendor/jsm/')) return path.join(THREE_DIR, 'examples', 'jsm', pathname.slice('/vendor/jsm/'.length));
  return path.join(CLIENT, pathname.replace(/^\/+/, ''));
}

const pool = new PrizePool();

// Session leaderboard: escapes (round wins) per player name. Champions of the Backrooms.
const champions = new Map();   // name -> { wins, wallet }
function leaderboardTop(n = 8) {
  return [...champions.entries()]
    .map(([name, v]) => ({ name, wins: v.wins, wallet: v.wallet || null }))
    .sort((a, b) => b.wins - a.wins).slice(0, n);
}

const server = http.createServer((req, res) => {
  const { pathname } = url.parse(req.url);
  if (pathname === '/api/health') return send(res, 200, JSON.stringify({ ok: true, ...pool.snapshot() }), 'application/json');
  if (pathname === '/api/pool') return send(res, 200, JSON.stringify(pool.snapshot()), 'application/json');
  if (pathname === '/api/leaderboard') return send(res, 200, JSON.stringify({ leaderboard: leaderboardTop() }), 'application/json');

  const filePath = resolvePath(decodeURIComponent(pathname));
  // Prevent path traversal outside allowed roots.
  const allowed = [CLIENT, SHARED, THREE_DIR];
  if (!allowed.some(base => path.resolve(filePath).startsWith(path.resolve(base)))) {
    return send(res, 403, 'Forbidden');
  }
  serveFile(res, filePath);
});

// ---------- Multiplayer ----------
const wss = new WebSocketServer({ server });
const round = new Round(onRoundEnd);
const sockets = new Map();        // id -> ws
const reconnectTokens = new Map(); // token -> current player id
const pendingRemoval = new Map();  // id -> removal timeout (player is in disconnect grace)
const GRACE_MS = 15000;            // resume window after a dropped connection

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const ws of sockets.values()) { if (ws.readyState === 1) ws.send(data); }
}

wss.on('connection', (ws) => {
  const id = crypto.randomBytes(6).toString('hex');
  sockets.set(id, ws);
  // Per-connection abuse guards (public, prize-bearing game on the open internet).
  let bucket = 60, lastRefill = Date.now();   // token bucket: ~60 msgs/sec sustained
  ws.on('message', raw => {
    // 1) size cap — drop absurdly large frames before parsing.
    if (raw.length > 4096) return;
    // 2) rate limit — refill 60 tokens/sec, drop when empty.
    const now = Date.now();
    bucket = Math.min(120, bucket + (now - lastRefill) / 1000 * 60); lastRefill = now;
    if (bucket < 1) return; bucket -= 1;

    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    switch (msg.t) {
      case MSG.HELLO: {
        let token = typeof msg.reconnect === 'string' ? msg.reconnect : null;
        let resumed = false;
        // Resume a session dropped within the grace window (same exact state).
        if (token && reconnectTokens.has(token)) {
          const oldId = reconnectTokens.get(token);
          const player = round.players.get(oldId);
          const timer = pendingRemoval.get(oldId);
          if (player && timer) {
            clearTimeout(timer); pendingRemoval.delete(oldId);
            round.players.delete(oldId);
            player.id = id; player.disconnected = false;
            round.players.set(id, player);
            reconnectTokens.set(token, id);
            resumed = true;
          }
        }
        if (!resumed) {
          round.addPlayer(id, msg.name, msg.wallet);
          token = crypto.randomBytes(8).toString('hex');
          reconnectTokens.set(token, id);
        }
        ws.send(JSON.stringify({
          t: MSG.WELCOME, id, reconnect: token, resumed,
          round: { ...round.snapshot().round, ...pool.snapshot() },
          leaderboard: leaderboardTop(),
        }));
        break;
      }
      case MSG.INPUT: round.applyInput(id, msg); break;
      case MSG.PICKUP: round.pickup(id, msg.x, msg.y); break;
      case MSG.DESCEND: round.descend(id); break;
      case MSG.DEAD: round.applyInput(id, { dead: true }); break;
      case MSG.CHAT:
        broadcast({ t: MSG.CHAT, name: round.players.get(id)?.name || '???', text: String(msg.text).slice(0, 120) });
        break;
    }
  });
  ws.on('close', () => {
    sockets.delete(id);
    const player = round.players.get(id);
    const dropToken = () => { for (const [tk, pid] of reconnectTokens) if (pid === id) reconnectTokens.delete(tk); };
    if (player) {
      // Keep their state alive for GRACE_MS so a refresh/blip can resume the same session.
      player.disconnected = true;
      pendingRemoval.set(id, setTimeout(() => {
        round.removePlayer(id); pendingRemoval.delete(id); dropToken();
      }, GRACE_MS));
    } else { dropToken(); }
  });
});

// Fixed-rate simulation + broadcast.
let last = Date.now();
setInterval(() => {
  const now = Date.now(); const dt = (now - last) / 1000; last = now;
  round.tick(dt);
  const snap = round.snapshot();
  broadcast({ t: MSG.STATE, players: snap.players, round: { ...snap.round, ...pool.snapshot() } });
  // Drain + broadcast the event feed (eliminations / escapes).
  if (round.feed && round.feed.length) {
    for (const ev of round.feed.splice(0)) broadcast({ t: MSG.FEED, text: ev.text, kind: ev.kind });
  }
}, 1000 / TICK_HZ);

async function onRoundEnd(r) {
  const result = await pool.award(r.winners || [], r.signature);
  // Credit the champion(s) of this round to the session leaderboard.
  for (const w of (r.winners || [])) {
    const cur = champions.get(w.name) || { wins: 0, wallet: w.wallet || null };
    cur.wins += 1; if (w.wallet) cur.wallet = w.wallet;
    champions.set(w.name, cur);
  }
  broadcast({
    t: MSG.WIN,
    scores: r.scoreboard().map(p => ({ name: p.name, score: p.score, depth: p.depth })),
    winners: (r.winners || []).map(w => w.name),
    escaped: !!r.escapedBy,
    escapedName: r.winners?.[0]?.name || null,
    outcome: r.signature,
    payout: result,
    leaderboard: leaderboardTop(),
  });
  console.log(`[round] ended. winners=${(r.winners || []).map(w => w.name).join(',') || 'none'} payout=${JSON.stringify(result)}`);
  // Reset for the next round after a short results window.
  setTimeout(() => { round._new(); }, 12000);
}

server.listen(config.port, () => {
  console.log(`\n  BACKROOMS: NO-CLIP`);
  console.log(`  ▶ http://localhost:${config.port}`);
  console.log(`  network=${config.network}  pool=${pool.balanceSol} SOL\n`);
});
