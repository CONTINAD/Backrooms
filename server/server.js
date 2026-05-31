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

const server = http.createServer((req, res) => {
  const { pathname } = url.parse(req.url);
  if (pathname === '/api/health') return send(res, 200, JSON.stringify({ ok: true, ...pool.snapshot() }), 'application/json');
  if (pathname === '/api/pool') return send(res, 200, JSON.stringify(pool.snapshot()), 'application/json');

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
const sockets = new Map();   // id -> ws

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const ws of sockets.values()) { if (ws.readyState === 1) ws.send(data); }
}

wss.on('connection', (ws) => {
  const id = crypto.randomBytes(6).toString('hex');
  sockets.set(id, ws);
  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    switch (msg.t) {
      case MSG.HELLO:
        round.addPlayer(id, msg.name, msg.wallet);
        ws.send(JSON.stringify({
          t: MSG.WELCOME, id,
          round: { ...round.snapshot().round, ...pool.snapshot() },
        }));
        break;
      case MSG.INPUT: round.applyInput(id, msg); break;
      case MSG.PICKUP: round.pickup(id, msg.x, msg.y); break;
      case MSG.DESCEND: round.descend(id); break;
      case MSG.DEAD: round.applyInput(id, { dead: true }); break;
      case MSG.CHAT:
        broadcast({ t: MSG.CHAT, name: round.players.get(id)?.name || '???', text: String(msg.text).slice(0, 120) });
        break;
    }
  });
  ws.on('close', () => { round.removePlayer(id); sockets.delete(id); });
});

// Fixed-rate simulation + broadcast.
let last = Date.now();
setInterval(() => {
  const now = Date.now(); const dt = (now - last) / 1000; last = now;
  round.tick(dt);
  const snap = round.snapshot();
  broadcast({ t: MSG.STATE, players: snap.players, round: { ...snap.round, ...pool.snapshot() } });
}, 1000 / TICK_HZ);

async function onRoundEnd(r) {
  const result = await pool.award(r.winners || [], r.signature);
  broadcast({
    t: MSG.WIN,
    scores: r.scoreboard().map(p => ({ name: p.name, score: p.score, depth: p.depth })),
    winners: (r.winners || []).map(w => w.name),
    escaped: !!r.escapedBy,
    escapedName: r.winners?.[0]?.name || null,
    outcome: r.signature,
    payout: result,
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
