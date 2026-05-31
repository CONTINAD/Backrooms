// AI PLAYTESTER — the "pro gamer".
// Connects to the live server as a player, reconstructs the maze from the round seed,
// pathfinds optimally (BFS) to Almond Water and the exit, "plays" by streaming inputs,
// and writes a prioritized findings report to docs/METRICS.md for the improvement loop.
//
// This bot measures *design/solvability* metrics (is the level beatable? how long is the
// optimal route? are pickups reachable? is it trivial or tedious?). Render-FPS is measured
// separately by the browser playtest; here we care about whether the game is winnable & fun.
import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import {
  generateLevel, hasWall, BIT, cellCenter, TILE, PLAYER_SPEED, MSG, VERSION, ROUND_SECONDS,
} from '../shared/constants.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SERVER = process.env.SERVER || 'ws://localhost:8080';
const RUN_MS = Number(process.env.BOT_RUN_MS || 20000);

// ---- Maze analysis (pure, no network) -------------------------------------
function neighbors(level, x, y) {
  const out = [];
  if (!hasWall(level, x, y, BIT.N)) out.push([x, y - 1]);
  if (!hasWall(level, x, y, BIT.S)) out.push([x, y + 1]);
  if (!hasWall(level, x, y, BIT.E)) out.push([x + 1, y]);
  if (!hasWall(level, x, y, BIT.W)) out.push([x - 1, y]);
  return out;
}

// BFS shortest path of cells from a→b. Returns [] if unreachable.
function bfsPath(level, a, b) {
  const key = (x, y) => y * level.w + x;
  const q = [[a.x, a.y]]; const prev = new Map([[key(a.x, a.y), null]]);
  while (q.length) {
    const [x, y] = q.shift();
    if (x === b.x && y === b.y) {
      const path = []; let k = key(x, y);
      while (k !== null) { const cx = k % level.w, cy = (k - cx) / level.w; path.push({ x: cx, y: cy }); k = prev.get(k); }
      return path.reverse();
    }
    for (const [nx, ny] of neighbors(level, x, y)) {
      const nk = key(nx, ny);
      if (!prev.has(nk)) { prev.set(nk, key(x, y)); q.push([nx, ny]); }
    }
  }
  return [];
}

// Full reachability + dead-end / branching analysis for "fun" heuristics.
function analyze(level) {
  const reachable = bfsFlood(level, level.start);
  const exitPath = bfsPath(level, level.start, level.exit);
  const almondReach = level.almonds.filter(a => reachable.has(a.y * level.w + a.x));
  // dead ends = cells with exactly one open neighbor
  let deadEnds = 0;
  for (let y = 0; y < level.h; y++) for (let x = 0; x < level.w; x++) {
    if (reachable.has(y * level.w + x) && neighbors(level, x, y).length === 1) deadEnds++;
  }
  const cells = level.w * level.h;
  return {
    solvable: exitPath.length > 0,
    optimalExitCells: exitPath.length,
    optimalExitSeconds: +((exitPath.length * TILE) / PLAYER_SPEED).toFixed(1),
    reachableFraction: +(reachable.size / cells).toFixed(2),
    almondTotal: level.almonds.length,
    almondReachable: almondReach.length,
    deadEnds,
    deadEndRatio: +(deadEnds / cells).toFixed(3),
    exitPath, almondReach,
  };
}

function bfsFlood(level, start) {
  const key = (x, y) => y * level.w + x;
  const seen = new Set([key(start.x, start.y)]); const q = [[start.x, start.y]];
  while (q.length) { const [x, y] = q.shift(); for (const [nx, ny] of neighbors(level, x, y)) { const k = key(nx, ny); if (!seen.has(k)) { seen.add(k); q.push([nx, ny]); } } }
  return seen;
}

// ---- Live play over the protocol -------------------------------------------
function play() {
  return new Promise((resolve) => {
    const findings = [];
    const t0 = Date.now();
    let level = null, anal = null, id = null;
    let reachedExit = false, almondsGrabbed = 0, descended = 0, errors = [];
    let pathPlan = [];   // world waypoints to walk
    let wp = 0; let pos = { x: 0, z: 0 };

    const ws = new WebSocket(SERVER);
    const t = (m) => ws.send(JSON.stringify(m));

    const finish = (note) => {
      try { ws.close(); } catch {}
      clearInterval(stepTimer);
      const report = {
        timestamp: new Date().toISOString(), build: VERSION, server: SERVER,
        connected: !!id, note,
        analysis: anal ? {
          solvable: anal.solvable, optimalExitSeconds: anal.optimalExitSeconds,
          optimalExitCells: anal.optimalExitCells, reachableFraction: anal.reachableFraction,
          almondReachable: `${anal.almondReachable}/${anal.almondTotal}`,
          deadEnds: anal.deadEnds, deadEndRatio: anal.deadEndRatio,
        } : null,
        play: { reachedExit, almondsGrabbed, descended },
        errors,
        findings: deriveFindings(anal, { reachedExit, almondsGrabbed, descended, errors }),
      };
      resolve(report);
    };

    ws.on('open', () => t({ t: MSG.HELLO, name: 'PRO-BOT', wallet: null }));
    ws.on('error', (e) => { errors.push('ws:' + e.message); });
    ws.on('close', () => {});
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (m.t === MSG.WELCOME) {
        id = m.id;
        const seed = (m.round?.seed ?? 1) >>> 0;
        level = generateLevel(seed);
        anal = analyze(level);
        if (!anal.solvable) { findings.push('LEVEL UNSOLVABLE'); finish('unsolvable level'); return; }
        // Plan: start → each reachable almond in greedy-nearest order → exit.
        planRoute();
        const sc = cellCenter(level.start.x, level.start.y); pos = { x: sc.x, z: sc.z };
      }
      if (m.t === MSG.WIN) { finish('round ended (WIN broadcast)'); }
    });

    // Greedy route: visit a handful of nearest almonds, then exit.
    function planRoute() {
      let cur = { ...level.start };
      const remaining = anal.almondReach.slice(0, 8); // grab up to 8 — a pro hoards water
      const order = [];
      while (remaining.length) {
        let bi = 0, bd = Infinity;
        remaining.forEach((a, i) => { const d = Math.abs(a.x - cur.x) + Math.abs(a.y - cur.y); if (d < bd) { bd = d; bi = i; } });
        const a = remaining.splice(bi, 1)[0]; order.push(a); cur = a;
      }
      const stops = [...order, level.exit];
      cur = { ...level.start };
      for (const s of stops) {
        const seg = bfsPath(level, cur, s);
        for (const c of seg) pathPlan.push({ cell: c, world: cellCenter(c.x, c.y), almond: order.some(o => o.x === c.x && o.y === c.y), exit: c.x === level.exit.x && c.y === level.exit.y });
        cur = s;
      }
    }

    // Walk one "tick": move toward current waypoint, emit INPUT, handle pickups/exit.
    const stepTimer = setInterval(() => {
      if (!level || !pathPlan.length) return;
      const target = pathPlan[Math.min(wp, pathPlan.length - 1)];
      const dx = target.world.x - pos.x, dz = target.world.z - pos.z;
      const dist = Math.hypot(dx, dz);
      const step = PLAYER_SPEED * (1 / 15);
      if (dist <= step) {
        pos = { x: target.world.x, z: target.world.z };
        if (target.almond) { t({ t: MSG.PICKUP, x: target.cell.x, y: target.cell.y }); almondsGrabbed++; }
        if (target.exit) { t({ t: MSG.DESCEND }); descended++; reachedExit = true; finish('reached exit (optimal route complete)'); return; }
        wp++;
      } else { pos.x += (dx / dist) * step; pos.z += (dz / dist) * step; }
      const ry = Math.atan2(dx, dz);
      t({ t: MSG.INPUT, x: pos.x, z: pos.z, ry, name: 'PRO-BOT', depth: descended, sanity: 80, hp: 100, almond: almondsGrabbed, score: 0, dead: false });
    }, 1000 / 15);

    setTimeout(() => finish('time budget reached'), RUN_MS);
  });
}

function deriveFindings(anal, play) {
  const f = [];
  if (!anal) { f.push('CRITICAL: bot never received WELCOME — server/protocol broken.'); return f; }
  if (!anal.solvable) f.push('CRITICAL: Level 0 is UNSOLVABLE from start to exit — fix maze gen.');
  if (anal.reachableFraction < 0.85) f.push(`Map fragmentation: only ${(anal.reachableFraction * 100) | 0}% of cells reachable — increase braiding/connectivity.`);
  if (anal.almondReachable === 0) f.push('No Almond Water is reachable — players cannot restore sanity.');
  // Pacing is judged RELATIVE to round length. Humans take ~2–4x the optimal route, so an
  // optimal path of ~5–55% of the round is a healthy "find the exit before time/sanity runs out".
  const optFrac = anal.optimalExitSeconds / ROUND_SECONDS;
  if (optFrac < 0.04) f.push(`Exit too close (~${anal.optimalExitSeconds}s, ${(optFrac * 100) | 0}% of round) — trivial; move exit / enlarge maze.`);
  if (optFrac > 0.6) f.push(`Exit too far (~${anal.optimalExitSeconds}s, ${(optFrac * 100) | 0}% of round) — even optimal play barely finishes; shrink maze or move exit.`);
  if (anal.deadEndRatio > 0.18) f.push(`High dead-end ratio (${anal.deadEndRatio}) — frustrating; braid more loops.`);
  if (play.errors.length) f.push('Protocol errors observed: ' + play.errors.join('; '));
  // Only flag a non-finish as a PROBLEM if the bot had more time than the optimal route needs.
  const hadEnoughTime = Number(process.env.BOT_RUN_MS || 20000) > anal.optimalExitSeconds * 1000;
  if (!play.reachedExit && anal.solvable && !play.errors.length && hadEnoughTime) {
    f.push('Bot failed to reach exit despite sufficient time — navigation/pathing bug.');
  }
  if (f.length === 0) {
    f.push(anal.solvable
      ? 'GOOD: level solvable, well-paced for the round length, pickups reachable, no errors. Next: human exit-findability (no minimap) + content/atmosphere polish.'
      : 'Level analysis incomplete.');
  }
  return f;
}

// ---- Write the report into docs/METRICS.md ---------------------------------
function writeReport(r) {
  const lines = [];
  lines.push('# METRICS — latest AI playtest report', '');
  lines.push('> Auto-generated by bot/playtester.js. Top of "Findings" = next thing to fix.', '');
  lines.push('## Latest run');
  lines.push(`- timestamp: ${r.timestamp}`);
  lines.push(`- build: v${r.build}`);
  lines.push(`- server: ${r.server}`);
  lines.push(`- connected: ${r.connected}`);
  lines.push(`- note: ${r.note}`);
  if (r.analysis) {
    lines.push(`- solvable: ${r.analysis.solvable}`);
    lines.push(`- optimal time-to-exit: ${r.analysis.optimalExitSeconds}s (${r.analysis.optimalExitCells} cells)`);
    lines.push(`- reachable fraction: ${r.analysis.reachableFraction}`);
    lines.push(`- almond water reachable: ${r.analysis.almondReachable}`);
    lines.push(`- dead ends: ${r.analysis.deadEnds} (ratio ${r.analysis.deadEndRatio})`);
  }
  lines.push(`- play: reachedExit=${r.play.reachedExit} almonds=${r.play.almondsGrabbed} descended=${r.play.descended}`);
  lines.push('', '## Findings (highest-leverage first)');
  r.findings.forEach((x, i) => lines.push(`${i + 1}. ${x}`));
  lines.push('', '## History');
  // Preserve prior history block if present.
  const metricsPath = path.join(ROOT, 'docs', 'METRICS.md');
  let prevHistory = '';
  try {
    const prev = fs.readFileSync(metricsPath, 'utf8');
    const idx = prev.indexOf('## History');
    if (idx >= 0) prevHistory = prev.slice(idx + '## History'.length).trim();
  } catch {}
  lines.push(`- ${r.timestamp}: solvable=${r.analysis?.solvable} reachedExit=${r.play.reachedExit} findings=${r.findings.length}`);
  if (prevHistory && !prevHistory.startsWith('(empty)')) lines.push(prevHistory);
  fs.writeFileSync(metricsPath, lines.join('\n') + '\n');
  return metricsPath;
}

(async () => {
  console.log(`[bot] connecting to ${SERVER} …`);
  let report;
  try { report = await play(); }
  catch (e) { report = { timestamp: new Date().toISOString(), build: VERSION, server: SERVER, connected: false, note: 'bot crashed: ' + e.message, analysis: null, play: { reachedExit: false, almondsGrabbed: 0, descended: 0 }, errors: [e.stack], findings: ['CRITICAL: playtester threw — ' + e.message] }; }
  const p = writeReport(report);
  console.log('[bot] report written →', p);
  console.log('[bot] findings:'); report.findings.forEach(f => console.log('   • ' + f));
  process.exit(0);
})();
