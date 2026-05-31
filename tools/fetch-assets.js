// Post-install verifier. We use procedurally generated textures + audio, so there are no
// binary assets to download — this just confirms the vendored Three.js files the browser
// importmap depends on are present, and fails loud if not.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const THREE = path.join(ROOT, 'node_modules', 'three');

const required = [
  'build/three.module.js',
  'examples/jsm/controls/PointerLockControls.js',
  'examples/jsm/postprocessing/EffectComposer.js',
  'examples/jsm/postprocessing/RenderPass.js',
  'examples/jsm/postprocessing/UnrealBloomPass.js',
  'examples/jsm/postprocessing/ShaderPass.js',
  'examples/jsm/postprocessing/OutputPass.js',
];

let ok = true;
for (const rel of required) {
  const p = path.join(THREE, rel);
  if (!fs.existsSync(p)) { console.error('  [missing] node_modules/three/' + rel); ok = false; }
}

if (!ok) {
  console.error('\nThree.js vendor files missing. Run: npm install three\n');
  process.exit(1);
}
console.log('  assets ok — Three.js vendored, textures/audio are procedural.');
