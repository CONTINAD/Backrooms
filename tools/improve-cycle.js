// IMPROVEMENT CYCLE — the deterministic half of the self-improvement loop.
// Run at the start of each cycle (by hand, by `npm run loop`, or by the /loop skill which
// re-invokes Claude). It: (1) verifies the server is up, (2) runs the AI playtester,
// (3) surfaces the single highest-leverage finding so Claude knows what to fix next.
//
// The CREATIVE half — actually editing code to address the finding and appending to
// docs/CHANGELOG.md — is done by Claude, guided by docs/SELF_PROMPT.md.
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 8080;

function health() {
  return new Promise((resolve) => {
    const req = http.get({ host: 'localhost', port: PORT, path: '/api/health', timeout: 1500 }, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function runBot() {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(ROOT, 'bot', 'playtester.js')], { stdio: 'inherit', env: { ...process.env, BOT_RUN_MS: process.env.BOT_RUN_MS || '18000' } });
    p.on('close', (code) => resolve(code));
  });
}

(async () => {
  console.log('\n=== IMPROVEMENT CYCLE ===');
  const h = await health();
  if (!h) {
    console.log('Server not reachable on :' + PORT + '. Start it first: npm start');
    console.log('(Then re-run this cycle.)');
    process.exit(2);
  }
  console.log(`Server up. network=${h.network} pool=${h.pool} SOL`);

  console.log('\n-- Running AI playtester --');
  await runBot();

  // Surface the top finding for Claude.
  const metrics = fs.readFileSync(path.join(ROOT, 'docs', 'METRICS.md'), 'utf8');
  const m = metrics.match(/## Findings[^\n]*\n1\.\s*(.+)/);
  const top = m ? m[1].trim() : '(no findings parsed)';

  console.log('\n=== NEXT ACTION FOR CLAUDE ===');
  console.log('Per docs/SELF_PROMPT.md priority ladder, address THIS finding:');
  console.log('  → ' + top);
  console.log('\nThen: implement the fix, verify the game still boots, and append a dated');
  console.log('entry to docs/CHANGELOG.md describing what changed and which metric it targets.');
  console.log('=== END CYCLE ===\n');
})();
