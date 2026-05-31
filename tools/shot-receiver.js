// Tiny local image sink — a workaround for when the preview screenshot tool is wedged.
// The game page (eval) exports its canvas to a JPEG and POSTs the base64 here; we decode it
// to tools/shot.jpg so it can be Read as an image. Dev-only; not part of the game.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'shot.jpg');

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method === 'POST') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      try { fs.writeFileSync(OUT, Buffer.from(body, 'base64')); res.end('ok ' + body.length); }
      catch (e) { res.statusCode = 500; res.end('err ' + e.message); }
    });
    return;
  }
  res.end('shot-receiver up');
}).listen(8099, () => console.log('[shot-receiver] listening on http://localhost:8099'));
