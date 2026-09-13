#!/usr/bin/env node
/**
 * Build `standalone.html` -- the whole tracker as one file you can open by
 * double-clicking it, with no install and no server.
 *
 * It bundles the real front-end and the real tracker modules, and swaps the
 * Express API for the browser runtime in `scripts/standalone-runtime.js`.
 * Everything is inlined so the file works straight off the disk.
 *
 *   npm run build-standalone
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

/** Inline an ES module: drop its imports (everything is in one scope here). */
function flatten(src) {
  return src
    .split('\n')
    .filter((line) => !/^import\s/.test(line) && !/^export\s*\{/.test(line))
    .map((line) => line.replace(/^export\s+/, ''))
    .join('\n');
}

// Dependency order matters -- geo before the modules that call it.
const MODULES = ['geo.js', 'adsb.js', 'nnumber.js', 'tracker.js', 'demo.js'];
const engine = MODULES
  .map((m) => `/* ===== server/${m} ===== */\n${flatten(read('server', m))}`)
  .join('\n\n');

const indexHtml = read('public', 'index.html');
const body = indexHtml.split('<body>')[1].split('<script')[0];

// The map never initialises if Leaflet fails to load; that must not take the
// rest of the page down with it.
let app = read('public', 'app.js');
const guarded = app.replace(
  '    initMap(state.config);',
  "    try { initMap(state.config); } catch (err) { console.warn('Map unavailable:', err); }",
);
if (guarded === app) throw new Error('initMap call site not found -- app.js changed shape');
app = guarded;

// Wait for the first poll so the page paints with aircraft already on it.
const booted = app.replace('  start().catch((err) => {', '  Promise.resolve(window.__standaloneReady).then(start).catch((err) => {');
if (booted === app) throw new Error('start() call site not found -- app.js changed shape');
app = booted;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Charlevoix Flight Tracker</title>
<style>
${read('node_modules', 'leaflet', 'dist', 'leaflet.css')}
</style>
<style>
${read('public', 'styles.css')}
</style>
</head>
<body>
${body}
<script>
${read('node_modules', 'leaflet', 'dist', 'leaflet.js')}
</script>
<script>
${engine}
</script>
<script>
${read('scripts', 'standalone-runtime.js')}
</script>
<script>
${app}
</script>
</body>
</html>
`;

const out = path.join(ROOT, 'standalone.html');
fs.writeFileSync(out, html);
const kb = (fs.statSync(out).size / 1024).toFixed(0);
console.log(`Wrote ${path.relative(process.cwd(), out)} (${kb} KB)`);
console.log('Open it by double-clicking; no server needed.');
