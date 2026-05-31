// Shared world constants. Imported by client (browser), server (node), and bot (node).
// Keep this pure data + pure functions so it runs anywhere. No DOM, no node APIs.

export const VERSION = '0.1.0';

// ---- World grid -----------------------------------------------------------
export const TILE = 4;          // metres per maze cell
export const WALL_H = 3.2;      // wall height (metres)
export const GRID_W = 48;       // Level 0 maze width in cells
export const GRID_H = 48;       // Level 0 maze height in cells

// ---- Round / gameplay -----------------------------------------------------
export const ROUND_SECONDS = 600;          // 10 minute rounds
export const LOBBY_SECONDS = 6;            // short "get ready" so the race starts fast (drop-in)
export const MIN_PLAYERS = 1;              // 1 = solo practice allowed
export const TICK_HZ = 15;                 // network state broadcast rate

export const SANITY_MAX = 100;
export const SANITY_DRAIN = 0.55;          // per second, baseline (the Hum) — a slow dread
export const SANITY_DARK_MULT = 2.0;       // multiplier when in darkness
export const SANITY_ENTITY_MULT = 3.2;     // multiplier when an entity is near
export const ALMOND_RESTORE = 35;          // sanity per Almond Water bottle
export const LOW_SANITY = 30;              // heartbeat + entity-attract threshold
export const SANITY_DAMAGE = 3.5;          // hp/sec when sanity is 0 (time to find water)
export const PLAYER_HP = 100;

export const PLAYER_SPEED = 4.2;           // m/s walk
export const PLAYER_SPRINT = 7.0;          // m/s sprint (costs stamina)
export const STAMINA_MAX = 100;
export const STAMINA_DRAIN = 24;           // per second while sprinting (~4s flat-out)
export const STAMINA_REGEN = 14;           // per second while not sprinting
export const STAMINA_MIN = 12;             // must recover to this before sprinting again
export const PLAYER_EYE = 1.7;             // camera height
export const PLAYER_RADIUS = 0.35;         // collision radius

// ---- Scoring --------------------------------------------------------------
export const SCORE = { depth: 1000, perSecond: 2, almond: 50, exit: 250 };

export function scoreOf(p) {
  return (p.depth || 0) * SCORE.depth
    + Math.floor(p.survivalSeconds || 0) * SCORE.perSecond
    + (p.almondCollected || 0) * SCORE.almond
    + (p.exitsFound || 0) * SCORE.exit;
}

// ---- Deterministic RNG (mulberry32) so server+client build identical mazes -
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Maze generation (recursive backtracker on a cell grid) ---------------
// Returns { walls: Uint8Array(w*h) bitmask N=1,E=2,S=4,W=8, open: bool grid,
//           start: {x,y}, exit: {x,y}, almonds: [{x,y}], seed }
// Two adjacent cells are connected when the wall bit between them is cleared.
export function generateLevel(seed, w = GRID_W, h = GRID_H) {
  const rng = makeRng(seed);
  const N = 1, E = 2, S = 4, W = 8;
  const opp = { [N]: S, [E]: W, [S]: N, [W]: E };
  const dx = { [N]: 0, [E]: 1, [S]: 0, [W]: -1 };
  const dy = { [N]: -1, [E]: 0, [S]: 1, [W]: 0 };
  const walls = new Uint8Array(w * h).fill(N | E | S | W);
  const visited = new Uint8Array(w * h);
  const idx = (x, y) => y * w + x;

  const stack = [];
  let cx = Math.floor(rng() * w), cy = Math.floor(rng() * h);
  visited[idx(cx, cy)] = 1;
  stack.push([cx, cy]);

  while (stack.length) {
    [cx, cy] = stack[stack.length - 1];
    const dirs = [N, E, S, W].filter(d => {
      const nx = cx + dx[d], ny = cy + dy[d];
      return nx >= 0 && ny >= 0 && nx < w && ny < h && !visited[idx(nx, ny)];
    });
    if (!dirs.length) { stack.pop(); continue; }
    const d = dirs[Math.floor(rng() * dirs.length)];
    const nx = cx + dx[d], ny = cy + dy[d];
    walls[idx(cx, cy)] &= ~d;
    walls[idx(nx, ny)] &= ~opp[d];
    visited[idx(nx, ny)] = 1;
    stack.push([nx, ny]);
  }

  // Braid a little: knock out ~12% of remaining walls to create loops (less dead-end
  // frustration, more "endless rooms" feel). Deterministic.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rng() < 0.12) {
        const choices = [];
        if (x < w - 1) choices.push(E);
        if (y < h - 1) choices.push(S);
        if (choices.length) {
          const d = choices[Math.floor(rng() * choices.length)];
          const nx = x + dx[d], ny = y + dy[d];
          walls[idx(x, y)] &= ~d;
          walls[idx(nx, ny)] &= ~opp[d];
        }
      }
    }
  }

  const start = { x: 1, y: 1 };
  const exit = { x: w - 2, y: h - 2 };

  // Scatter Almond Water on open-ish cells, deterministically.
  const almonds = [];
  const target = Math.floor((w * h) / 40);
  let guard = 0;
  while (almonds.length < target && guard++ < target * 20) {
    const x = 1 + Math.floor(rng() * (w - 2));
    const y = 1 + Math.floor(rng() * (h - 2));
    if ((x === start.x && y === start.y) || (x === exit.x && y === exit.y)) continue;
    almonds.push({ x, y });
  }

  return { walls, w, h, start, exit, almonds, seed };
}

// Wall-presence helpers for collision (client + server share this).
export const BIT = { N: 1, E: 2, S: 4, W: 8 };
export function hasWall(level, x, y, bit) {
  if (x < 0 || y < 0 || x >= level.w || y >= level.h) return true;
  return (level.walls[y * level.w + x] & bit) !== 0;
}

// Convert a world position (metres) to a cell coord.
export function worldToCell(wx, wz) {
  return { x: Math.floor(wx / TILE), y: Math.floor(wz / TILE) };
}
export function cellCenter(cx, cy) {
  return { x: cx * TILE + TILE / 2, z: cy * TILE + TILE / 2 };
}

export const MSG = {
  HELLO: 'hello', WELCOME: 'welcome', STATE: 'state', INPUT: 'input',
  PICKUP: 'pickup', DESCEND: 'descend', ROUND: 'round', CHAT: 'chat',
  JOIN: 'join', LEAVE: 'leave', DEAD: 'dead', WIN: 'win', FEED: 'feed',
};
