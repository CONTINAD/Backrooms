// Multi-seed validation sweep — a regression gate for level generation + balance.
// Single-seed playtests can miss tail cases (e.g. a randomized exit producing an
// unsolvable or unsurvivable level). This sweeps N seeds and FAILS (exit 1) if any seed
// is unsolvable, fragmented, or unsurvivable on the best-case sanity model. Run it after
// any change to maze gen, exit placement, almonds, or the sanity constants.
//
//   node tools/validate-levels.js [N]
import {
  generateLevel, hasWall, BIT, TILE, PLAYER_SPEED,
  SANITY_MAX, SANITY_DRAIN, ALMOND_RESTORE, ROUND_SECONDS,
} from '../shared/constants.js';

const N = Number(process.argv[2] || 100);

function neighbors(L, x, y) {
  const o = [];
  if (!hasWall(L, x, y, BIT.N)) o.push([x, y - 1]);
  if (!hasWall(L, x, y, BIT.S)) o.push([x, y + 1]);
  if (!hasWall(L, x, y, BIT.E)) o.push([x + 1, y]);
  if (!hasWall(L, x, y, BIT.W)) o.push([x - 1, y]);
  return o;
}
function bfsPath(L, a, b) {
  const key = (x, y) => y * L.w + x;
  const q = [[a.x, a.y]], prev = new Map([[key(a.x, a.y), null]]);
  while (q.length) {
    const [x, y] = q.shift();
    if (x === b.x && y === b.y) {
      const p = []; let k = key(x, y);
      while (k !== null) { const cx = k % L.w; p.push({ x: cx, y: (k - cx) / L.w }); k = prev.get(k); }
      return p.reverse();
    }
    for (const [nx, ny] of neighbors(L, x, y)) { const nk = key(nx, ny); if (!prev.has(nk)) { prev.set(nk, key(x, y)); q.push([nx, ny]); } }
  }
  return [];
}
function flood(L, s) {
  const key = (x, y) => y * L.w + x; const seen = new Set([key(s.x, s.y)]); const q = [[s.x, s.y]];
  while (q.length) { const [x, y] = q.shift(); for (const [nx, ny] of neighbors(L, x, y)) { const k = key(nx, ny); if (!seen.has(k)) { seen.add(k); q.push([nx, ny]); } } }
  return seen;
}
function survive(L, path) {
  if (!path.length) return { ok: false, minSan: 0 };
  const water = new Set(L.almonds.map(a => a.y * L.w + a.x));
  const step = TILE / PLAYER_SPEED; let san = SANITY_MAX, min = SANITY_MAX;
  for (const c of path) {
    if (water.has(c.y * L.w + c.x)) san = Math.min(SANITY_MAX, san + ALMOND_RESTORE);
    san -= SANITY_DRAIN * step; if (san < min) min = san;
  }
  return { ok: min > 0, minSan: +Math.max(0, min).toFixed(1) };
}

const bad = [];
let solvable = 0, survivable = 0, fragmented = 0;
let tMin = Infinity, tMax = 0, tSum = 0, worstSan = 100;
for (let i = 0; i < N; i++) {
  const seed = (i * 2654435761 + 12345) >>> 0;
  const L = generateLevel(seed);
  const reach = flood(L, L.start);
  const frac = reach.size / (L.w * L.h);
  const path = bfsPath(L, L.start, L.exit);
  const t = (path.length * TILE) / PLAYER_SPEED;
  const surv = survive(L, path);
  if (path.length) { solvable++; tMin = Math.min(tMin, t); tMax = Math.max(tMax, t); tSum += t; }
  if (surv.ok) survivable++; worstSan = Math.min(worstSan, surv.minSan);
  if (frac < 0.85) fragmented++;
  if (!path.length || !surv.ok || frac < 0.85) bad.push({ seed, solvable: !!path.length, survivable: surv.ok, minSan: surv.minSan, reachFrac: +frac.toFixed(2) });
}

const summary = {
  seeds: N,
  solvablePct: +(solvable / N * 100).toFixed(1),
  survivablePct: +(survivable / N * 100).toFixed(1),
  fragmentedSeeds: fragmented,
  optimalSeconds: { min: +tMin.toFixed(1), avg: +(tSum / solvable).toFixed(1), max: +tMax.toFixed(1), roundLen: ROUND_SECONDS },
  worstBestCaseSanity: +worstSan.toFixed(1),
  badSeeds: bad.slice(0, 10),
};
console.log(JSON.stringify(summary, null, 2));
if (bad.length) { console.error(`\n[FAIL] ${bad.length}/${N} seed(s) unsolvable/unsurvivable/fragmented.`); process.exit(1); }
console.log(`\n[OK] all ${N} seeds solvable, survivable, well-connected.`);
