// Regression test suite — `npm test`. Consolidates the invariant checks built up across the
// improvement loop so changes can't silently break the prize-critical logic. Pure (no server
// needed); exits non-zero on any failure. The level-gen sweep is run separately by
// `npm run validate` (it's heavier).
import { Round } from '../server/round.js';
import { generateLevel, cellCenter, scoreOf } from '../shared/constants.js';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.error('  ✗ ' + name); } };

function freshRound() { const r = new Round(() => {}); r.addPlayer('p1', 'Alice', null); r.addPlayer('p2', 'Bob', null); r._begin(); return r; }

console.log('\nanti-cheat: escape validation');
{
  const r = freshRound(); const e = r.exitWorld;
  r.applyInput('p1', { x: e.x + 80, z: e.z + 80 }); r.descend('p1');
  ok('far escape claim rejected (round still live)', r.escapedBy == null && r.state === 'playing');
  r.applyInput('p1', { x: e.x, z: e.z }); r.descend('p1');
  ok('legit escape at seam accepted (round ends, winner set)', r.escapedBy === 'p1' && r.state === 'over');
}

console.log('input sanitization: clamping');
{
  const r = freshRound(); const p = r.players.get('p1');
  r.applyInput('p1', { x: NaN, z: Infinity, ry: 'x', sanity: 9999, hp: -50, almond: 1e9, name: 'Z'.repeat(99) });
  ok('NaN/Infinity position rejected to defaults', Number.isFinite(p.x) && Number.isFinite(p.z) && p.x === 0 && p.z === 0);
  ok('sanity clamped to 100', p.sanity === 100);
  ok('hp clamped to 0', p.hp === 0);
  ok('almond clamped to 9999', p.almond === 9999);
  ok('name bounded to 16 chars', p.name.length <= 16);
  r.applyInput('p1', { x: 50, z: 60 });
  ok('valid position passes through', p.x === 50 && p.z === 60);
}

console.log('event feed: death + escape');
{
  const r = freshRound();
  r.applyInput('p2', { dead: true });
  const e = r.exitWorld; r.applyInput('p1', { x: e.x, z: e.z }); r.descend('p1');
  const kinds = r.feed.map(f => f.kind);
  ok('death feed line emitted', kinds.includes('death'));
  ok('escape feed line emitted', kinds.includes('escape'));
}

console.log('scoring + leaderboard wiring');
{
  ok('scoreOf rewards depth + survival + almonds + exits', scoreOf({ depth: 1, survivalSeconds: 10, almondCollected: 2, exitsFound: 1 }) === 1000 + 20 + 100 + 250);
  const r = freshRound();
  ok('winners derived from escaper', (() => { const e = r.exitWorld; r.applyInput('p1', { x: e.x, z: e.z }); r.descend('p1'); return r.winners?.[0]?.id === 'p1'; })());
}

console.log('level gen: seed determinism');
{
  const a = generateLevel(12345), b = generateLevel(12345), c = generateLevel(54321);
  ok('same seed → identical exit (fair multiplayer)', a.exit.x === b.exit.x && a.exit.y === b.exit.y);
  ok('different seed → (usually) different exit', !(a.exit.x === c.exit.x && a.exit.y === c.exit.y));
  ok('exit is far from start', (Math.abs(a.exit.x - a.start.x) + Math.abs(a.exit.y - a.start.y)) >= 40);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
