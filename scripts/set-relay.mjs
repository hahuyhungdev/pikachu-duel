/**
 * Point the front-end at a deployed relay.
 *
 *   node scripts/set-relay.mjs https://pikachu-duel-room.<you>.workers.dev
 *
 * Writes the URL into src/net/config.js so GitHub Pages knows where to connect.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const target = process.argv[2];
if (!target) {
  console.error('usage: node scripts/set-relay.mjs <https://your-worker.workers.dev>');
  process.exit(1);
}

let url;
try {
  url = new URL(target);
} catch {
  console.error(`not a URL: ${target}`);
  process.exit(1);
}
if (!['http:', 'https:'].includes(url.protocol)) {
  console.error('the relay URL must be http(s)');
  process.exit(1);
}

const clean = `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
const file = resolve(import.meta.dirname, '../src/net/config.js');
const source = await readFile(file, 'utf8');
const next = source.replace(/^export const RELAY_URL = .*$/m, `export const RELAY_URL = '${clean}';`);

if (next === source) {
  console.error('could not find the RELAY_URL line in src/net/config.js');
  process.exit(1);
}

await writeFile(file, next, 'utf8');
console.log(`relay set to ${clean}`);
console.log('now run: node scripts/build-artifact.mjs && git commit -am "chore: point at the relay" && git push');
